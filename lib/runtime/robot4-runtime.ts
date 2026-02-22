/**
 * Robot4 WASM Runtime
 *
 * Executes WASM4-style robot firmware in the browser with memory-mapped I/O.
 * Same firmware code runs in browser simulation and on real ESP32-S3 hardware.
 *
 * Philosophy: "OS in the Browser" - all execution happens client-side
 *
 * Inspired by WASM-4 fantasy console (https://wasm4.org)
 */

import { VirtualESP32 } from '../hardware/virtual-esp32';

// ═══════════════════════════════════════════════════════════════════════════
// MEMORY MAP (must match robot4.h)
// ═══════════════════════════════════════════════════════════════════════════

const MEMORY_MAP = {
  MOTORS: 0x0000,        // 2x int16_t: left, right PWM
  ENCODERS: 0x0004,      // 2x int32_t: left, right ticks
  IMU: 0x000c,           // 6x int16_t: ax,ay,az,gx,gy,gz
  BATTERY: 0x0018,       // 1x uint8_t: percentage
  LED: 0x0019,           // 3x uint8_t: R,G,B
  SENSORS: 0x001c,       // 8x uint8_t: distance sensors (cm)
  LINE: 0x0024,          // 5x uint8_t: line sensors
  BUTTONS: 0x0029,       // 1x uint8_t: bumper bitfield
  CAMERA_CMD: 0x002a,    // 1x uint8_t: camera command
  CAMERA_STATUS: 0x002b, // 1x uint8_t: camera status
  SYSTEM_FLAGS: 0x002c,  // 1x uint8_t: system configuration
  TICK_COUNT: 0x0030,    // 1x uint32_t: milliseconds since boot
  FRAMEBUFFER: 0x1000,   // 160x120 grayscale (19200 bytes)
};

// Camera constants
const CAMERA = {
  WIDTH: 160,
  HEIGHT: 120,
  SIZE: 160 * 120,
  CMD_STOP: 0x00,
  CMD_CAPTURE: 0x01,
  CMD_STREAM: 0x02,
  STATUS_IDLE: 0x00,
  STATUS_BUSY: 0x01,
  STATUS_READY: 0x02,
};

// System flags
const FLAGS = {
  CAMERA_ENABLE: 0x01,
  MOTOR_ENABLE: 0x02,
  LED_ENABLE: 0x04,
  SENSORS_ENABLE: 0x08,
  WIFI_CONNECTED: 0x80,
};

// ═══════════════════════════════════════════════════════════════════════════
// ROBOT4 RUNTIME
// ═══════════════════════════════════════════════════════════════════════════

export interface Robot4State {
  pose: { x: number; y: number; rotation: number };
  motors: { left: number; right: number };
  encoders: { left: number; right: number };
  led: { r: number; g: number; b: number };
  battery: number;
  sensors: number[];
  lineSensors: number[];
  buttons: number;
  cameraStatus: number;
  tickCount: number;
}

export interface Robot4Config {
  frameRate?: number;       // Default: 60 FPS
  physicsRate?: number;     // Default: 100 Hz
  memoryPages?: number;     // Default: 4 (256KB)
  onStateChange?: (state: Robot4State) => void;
  onTrace?: (message: string) => void;
  onTone?: (freq: number, duration: number, volume: number) => void;
}

export interface Robot4World {
  walls: Array<{ x1: number; y1: number; x2: number; y2: number }>;
  obstacles: Array<{ x: number; y: number; radius: number }>;
  beacons: Array<{ x: number; y: number; color: string; active: boolean }>;
  lines: Array<{ points: Array<{ x: number; y: number }> }>;
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
}

export class Robot4Runtime {
  private wasmInstance: WebAssembly.Instance | null = null;
  private memory: WebAssembly.Memory | null = null;
  private memoryView: DataView | null = null;

  private virtualDevice: VirtualESP32;
  private config: Required<Robot4Config>;
  private world: Robot4World;

  private frameInterval: ReturnType<typeof setInterval> | null = null;
  private physicsInterval: ReturnType<typeof setInterval> | null = null;
  private startTime: number = 0;
  private running: boolean = false;

  // Physics state
  private pose = { x: 0, y: 0, rotation: 0 };
  private velocity = { linear: 0, angular: 0 };
  private encoders = { left: 0, right: 0 };

  // Robot physical constants
  private readonly WHEEL_BASE = 0.10;      // 10cm between wheels
  private readonly WHEEL_RADIUS = 0.0325;  // 32.5mm wheel radius
  private readonly TICKS_PER_REV = 360;    // Encoder resolution
  private readonly MAX_SPEED = 1.0;        // m/s at PWM 255

  constructor(config: Robot4Config = {}) {
    this.config = {
      frameRate: config.frameRate ?? 60,
      physicsRate: config.physicsRate ?? 100,
      memoryPages: config.memoryPages ?? 4,
      onStateChange: config.onStateChange ?? (() => {}),
      onTrace: config.onTrace ?? console.log,
      onTone: config.onTone ?? (() => {}),
    };

    this.virtualDevice = new VirtualESP32();
    this.world = this.createDefaultWorld();
  }

  /**
   * Create default world with walls
   */
  private createDefaultWorld(): Robot4World {
    const size = 2.0; // 2m x 2m arena
    return {
      walls: [
        { x1: -size, y1: -size, x2: size, y2: -size },  // Bottom
        { x1: size, y1: -size, x2: size, y2: size },    // Right
        { x1: size, y1: size, x2: -size, y2: size },    // Top
        { x1: -size, y1: size, x2: -size, y2: -size },  // Left
      ],
      obstacles: [
        { x: 0.5, y: 0.5, radius: 0.1 },
        { x: -0.5, y: -0.5, radius: 0.15 },
      ],
      beacons: [
        { x: 1.5, y: 1.5, color: '#ff0000', active: true },
        { x: -1.5, y: 1.5, color: '#00ff00', active: true },
      ],
      lines: [
        { points: [{ x: 0, y: -1.5 }, { x: 0, y: 1.5 }] },  // Center line
      ],
      bounds: { minX: -size, maxX: size, minY: -size, maxY: size },
    };
  }

  /**
   * Set the world configuration
   */
  setWorld(world: Robot4World): void {
    this.world = world;
  }

  /**
   * Get current world
   */
  getWorld(): Robot4World {
    return this.world;
  }

  /**
   * Load and initialize WASM firmware
   */
  async loadFirmware(wasmBinary: Uint8Array): Promise<void> {
    // Create memory (shared between host and WASM)
    this.memory = new WebAssembly.Memory({
      initial: this.config.memoryPages,
      maximum: this.config.memoryPages * 4,
    });

    this.memoryView = new DataView(this.memory.buffer);

    // Define imports (functions WASM can call)
    const imports: WebAssembly.Imports = {
      env: {
        memory: this.memory,
        trace: this.traceImpl.bind(this),
        delay_ms: this.delayMsImpl.bind(this),
        random: this.randomImpl.bind(this),
        tone: this.toneImpl.bind(this),
      },
    };

    // Compile and instantiate
    // Cast to ArrayBuffer to satisfy TypeScript's strict BufferSource type
    const module = await WebAssembly.compile(wasmBinary.buffer as ArrayBuffer);
    this.wasmInstance = await WebAssembly.instantiate(module, imports);

    // Initialize memory view
    if (this.wasmInstance.exports.memory) {
      this.memory = this.wasmInstance.exports.memory as WebAssembly.Memory;
      this.memoryView = new DataView(this.memory.buffer);
    }

    // Reset state
    this.pose = { x: 0, y: 0, rotation: 0 };
    this.encoders = { left: 0, right: 0 };
    this.startTime = Date.now();

    // Initialize system flags
    this.writeUint8(MEMORY_MAP.SYSTEM_FLAGS, FLAGS.MOTOR_ENABLE | FLAGS.LED_ENABLE | FLAGS.SENSORS_ENABLE);
    this.writeUint8(MEMORY_MAP.CAMERA_STATUS, CAMERA.STATUS_IDLE);
    this.writeUint8(MEMORY_MAP.BATTERY, 100);

    console.log('[Robot4Runtime] Firmware loaded successfully');
  }

  /**
   * Start the runtime (game loop)
   */
  start(): void {
    if (this.running || !this.wasmInstance) {
      console.warn('[Robot4Runtime] Cannot start: already running or no firmware loaded');
      return;
    }

    this.running = true;
    this.startTime = Date.now();

    // Call start() once
    const startFn = this.wasmInstance.exports.start as Function | undefined;
    if (startFn) {
      try {
        startFn();
      } catch (error) {
        console.error('[Robot4Runtime] Error in start():', error);
      }
    }

    // Start physics loop (higher rate for accuracy)
    const physicsInterval = 1000 / this.config.physicsRate;
    this.physicsInterval = setInterval(() => {
      this.updatePhysics(physicsInterval / 1000);
    }, physicsInterval);

    // Start frame loop (60 FPS)
    const frameInterval = 1000 / this.config.frameRate;
    this.frameInterval = setInterval(() => {
      this.updateFrame();
    }, frameInterval);

    console.log(`[Robot4Runtime] Started at ${this.config.frameRate} FPS`);
  }

  /**
   * Stop the runtime
   */
  stop(): void {
    this.running = false;

    if (this.frameInterval) {
      clearInterval(this.frameInterval);
      this.frameInterval = null;
    }

    if (this.physicsInterval) {
      clearInterval(this.physicsInterval);
      this.physicsInterval = null;
    }

    // Stop motors
    this.writeInt16(MEMORY_MAP.MOTORS, 0);
    this.writeInt16(MEMORY_MAP.MOTORS + 2, 0);

    console.log('[Robot4Runtime] Stopped');
  }

  /**
   * Check if running
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Reset to initial state
   */
  reset(): void {
    this.stop();
    this.pose = { x: 0, y: 0, rotation: 0 };
    this.encoders = { left: 0, right: 0 };
    this.velocity = { linear: 0, angular: 0 };

    if (this.memoryView) {
      // Clear motors
      this.writeInt16(MEMORY_MAP.MOTORS, 0);
      this.writeInt16(MEMORY_MAP.MOTORS + 2, 0);

      // Reset encoders
      this.writeInt32(MEMORY_MAP.ENCODERS, 0);
      this.writeInt32(MEMORY_MAP.ENCODERS + 4, 0);

      // Reset LED
      this.writeUint8(MEMORY_MAP.LED, 0);
      this.writeUint8(MEMORY_MAP.LED + 1, 0);
      this.writeUint8(MEMORY_MAP.LED + 2, 0);
    }

    this.config.onStateChange(this.getState());
  }

  /**
   * Get current robot state
   */
  getState(): Robot4State {
    if (!this.memoryView) {
      return {
        pose: { x: 0, y: 0, rotation: 0 },
        motors: { left: 0, right: 0 },
        encoders: { left: 0, right: 0 },
        led: { r: 0, g: 0, b: 0 },
        battery: 100,
        sensors: [255, 255, 255, 255, 255, 255, 255, 255],
        lineSensors: [0, 0, 0, 0, 0],
        buttons: 0,
        cameraStatus: 0,
        tickCount: 0,
      };
    }

    return {
      pose: { ...this.pose },
      motors: {
        left: this.readInt16(MEMORY_MAP.MOTORS),
        right: this.readInt16(MEMORY_MAP.MOTORS + 2),
      },
      encoders: { ...this.encoders },
      led: {
        r: this.readUint8(MEMORY_MAP.LED),
        g: this.readUint8(MEMORY_MAP.LED + 1),
        b: this.readUint8(MEMORY_MAP.LED + 2),
      },
      battery: this.readUint8(MEMORY_MAP.BATTERY),
      sensors: Array.from({ length: 8 }, (_, i) =>
        this.readUint8(MEMORY_MAP.SENSORS + i)
      ),
      lineSensors: Array.from({ length: 5 }, (_, i) =>
        this.readUint8(MEMORY_MAP.LINE + i)
      ),
      buttons: this.readUint8(MEMORY_MAP.BUTTONS),
      cameraStatus: this.readUint8(MEMORY_MAP.CAMERA_STATUS),
      tickCount: this.readUint32(MEMORY_MAP.TICK_COUNT),
    };
  }

  /**
   * Set robot position (for testing)
   */
  setPosition(x: number, y: number, rotation?: number): void {
    this.pose.x = x;
    this.pose.y = y;
    if (rotation !== undefined) {
      this.pose.rotation = rotation;
    }
  }

  /**
   * Simulate button press
   */
  pressButton(mask: number): void {
    if (this.memoryView) {
      const current = this.readUint8(MEMORY_MAP.BUTTONS);
      this.writeUint8(MEMORY_MAP.BUTTONS, current | mask);
    }
  }

  /**
   * Simulate button release
   */
  releaseButton(mask: number): void {
    if (this.memoryView) {
      const current = this.readUint8(MEMORY_MAP.BUTTONS);
      this.writeUint8(MEMORY_MAP.BUTTONS, current & ~mask);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FRAME UPDATE (called at 60 FPS)
  // ═══════════════════════════════════════════════════════════════════════════

  private updateFrame(): void {
    if (!this.wasmInstance || !this.memoryView) return;

    // Update tick count
    const tickCount = Date.now() - this.startTime;
    this.writeUint32(MEMORY_MAP.TICK_COUNT, tickCount);

    // Write sensor data to memory
    this.syncSensorsToMemory();

    // Handle camera commands
    this.processCameraCommand();

    // Call update() in WASM
    const updateFn = this.wasmInstance.exports.update as Function | undefined;
    if (updateFn) {
      try {
        updateFn();
      } catch (error) {
        console.error('[Robot4Runtime] Error in update():', error);
        this.stop();
      }
    }

    // Notify state change
    this.config.onStateChange(this.getState());
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PHYSICS UPDATE (called at 100 Hz)
  // ═══════════════════════════════════════════════════════════════════════════

  private updatePhysics(dt: number): void {
    if (!this.memoryView) return;

    // Read motor commands from memory
    const leftPWM = this.readInt16(MEMORY_MAP.MOTORS);
    const rightPWM = this.readInt16(MEMORY_MAP.MOTORS + 2);

    // Convert PWM to wheel velocities (m/s)
    const leftVel = (leftPWM / 255.0) * this.MAX_SPEED;
    const rightVel = (rightPWM / 255.0) * this.MAX_SPEED;

    // Differential drive kinematics
    this.velocity.linear = (leftVel + rightVel) / 2.0;
    this.velocity.angular = (rightVel - leftVel) / this.WHEEL_BASE;

    // Update pose
    const newRotation = this.pose.rotation + this.velocity.angular * dt;
    // Use sin for X and cos for Y so rotation=0 means facing +Y (forward in Three.js +Z)
    const newX = this.pose.x + this.velocity.linear * Math.sin(this.pose.rotation) * dt;
    const newY = this.pose.y + this.velocity.linear * Math.cos(this.pose.rotation) * dt;

    // Collision detection with walls
    const robotRadius = 0.08; // 8cm robot radius
    let collision = false;

    for (const wall of this.world.walls) {
      const dist = this.pointToLineDistance(newX, newY, wall.x1, wall.y1, wall.x2, wall.y2);
      if (dist < robotRadius) {
        collision = true;
        break;
      }
    }

    // Collision with obstacles
    for (const obs of this.world.obstacles) {
      const dist = Math.sqrt((newX - obs.x) ** 2 + (newY - obs.y) ** 2);
      if (dist < robotRadius + obs.radius) {
        collision = true;
        break;
      }
    }

    // Update position if no collision
    if (!collision) {
      this.pose.x = newX;
      this.pose.y = newY;
      this.pose.rotation = this.normalizeAngle(newRotation);
    } else {
      // Set bumper flag on collision
      this.writeUint8(MEMORY_MAP.BUTTONS, this.readUint8(MEMORY_MAP.BUTTONS) | 0x01);
    }

    // Update encoders
    const leftDist = leftVel * dt;
    const rightDist = rightVel * dt;
    const leftTicks = Math.round((leftDist / (2 * Math.PI * this.WHEEL_RADIUS)) * this.TICKS_PER_REV);
    const rightTicks = Math.round((rightDist / (2 * Math.PI * this.WHEEL_RADIUS)) * this.TICKS_PER_REV);

    this.encoders.left += leftTicks;
    this.encoders.right += rightTicks;

    // Write encoder values to memory
    this.writeInt32(MEMORY_MAP.ENCODERS, this.encoders.left);
    this.writeInt32(MEMORY_MAP.ENCODERS + 4, this.encoders.right);

    // Simulate battery drain
    const load = (Math.abs(leftPWM) + Math.abs(rightPWM)) / 510.0;
    if (load > 0) {
      const battery = this.readUint8(MEMORY_MAP.BATTERY);
      const newBattery = Math.max(0, battery - load * 0.001);
      this.writeUint8(MEMORY_MAP.BATTERY, Math.round(newBattery));
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SENSOR SIMULATION
  // ═══════════════════════════════════════════════════════════════════════════

  private syncSensorsToMemory(): void {
    if (!this.memoryView) return;

    // Simulate distance sensors (8 directions)
    const sensorAngles = [0, -45, 45, -90, 90, 180, -135, 135]; // degrees
    for (let i = 0; i < 8; i++) {
      const angle = this.pose.rotation + (sensorAngles[i] * Math.PI / 180);
      const distance = this.raycast(this.pose.x, this.pose.y, angle, 2.55); // max 255cm
      this.writeUint8(MEMORY_MAP.SENSORS + i, Math.min(255, Math.round(distance * 100)));
    }

    // Simulate line sensors
    const lineWidth = 0.08; // 8cm sensor array width
    for (let i = 0; i < 5; i++) {
      const offset = (i - 2) * (lineWidth / 4);
      // Use sin for X and cos for Y so rotation=0 means facing +Y (forward in Three.js +Z)
      const sensorX = this.pose.x + Math.sin(this.pose.rotation) * 0.05 +
                      Math.sin(this.pose.rotation + Math.PI / 2) * offset;
      const sensorY = this.pose.y + Math.cos(this.pose.rotation) * 0.05 +
                      Math.cos(this.pose.rotation + Math.PI / 2) * offset;

      const onLine = this.isPointOnLine(sensorX, sensorY);
      this.writeUint8(MEMORY_MAP.LINE + i, onLine ? 255 : 0);
    }

    // Update IMU (simplified - just rotation rate)
    const gyroZ = Math.round(this.velocity.angular * 1000); // mdps
    this.writeInt16(MEMORY_MAP.IMU + 10, gyroZ); // gZ
  }

  /**
   * Raycast for distance sensors
   */
  private raycast(x: number, y: number, angle: number, maxDist: number): number {
    let minDist = maxDist;

    // Check walls
    for (const wall of this.world.walls) {
      const dist = this.rayLineIntersection(x, y, angle, wall.x1, wall.y1, wall.x2, wall.y2);
      if (dist !== null && dist < minDist) {
        minDist = dist;
      }
    }

    // Check obstacles
    for (const obs of this.world.obstacles) {
      const dist = this.rayCircleIntersection(x, y, angle, obs.x, obs.y, obs.radius);
      if (dist !== null && dist < minDist) {
        minDist = dist;
      }
    }

    return minDist;
  }

  /**
   * Ray-line intersection
   */
  private rayLineIntersection(
    rx: number, ry: number, angle: number,
    x1: number, y1: number, x2: number, y2: number
  ): number | null {
    // Use sin for X and cos for Y so angle=0 means facing +Y (forward in Three.js +Z)
    const dx = Math.sin(angle);
    const dy = Math.cos(angle);

    const x3 = rx;
    const y3 = ry;
    const x4 = rx + dx * 10;
    const y4 = ry + dy * 10;

    const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if (Math.abs(denom) < 0.0001) return null;

    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
    const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;

    if (t >= 0 && t <= 1 && u >= 0) {
      const ix = x1 + t * (x2 - x1);
      const iy = y1 + t * (y2 - y1);
      return Math.sqrt((ix - rx) ** 2 + (iy - ry) ** 2);
    }

    return null;
  }

  /**
   * Ray-circle intersection
   */
  private rayCircleIntersection(
    rx: number, ry: number, angle: number,
    cx: number, cy: number, radius: number
  ): number | null {
    // Use sin for X and cos for Y so angle=0 means facing +Y (forward in Three.js +Z)
    const dx = Math.sin(angle);
    const dy = Math.cos(angle);

    const fx = rx - cx;
    const fy = ry - cy;

    const a = dx * dx + dy * dy;
    const b = 2 * (fx * dx + fy * dy);
    const c = fx * fx + fy * fy - radius * radius;

    const discriminant = b * b - 4 * a * c;
    if (discriminant < 0) return null;

    const sqrtDisc = Math.sqrt(discriminant);
    const t1 = (-b - sqrtDisc) / (2 * a);
    const t2 = (-b + sqrtDisc) / (2 * a);

    if (t1 >= 0) return t1;
    if (t2 >= 0) return t2;
    return null;
  }

  /**
   * Check if point is on a line
   */
  private isPointOnLine(x: number, y: number): boolean {
    const lineThreshold = 0.02; // 2cm line width

    for (const line of this.world.lines) {
      for (let i = 0; i < line.points.length - 1; i++) {
        const p1 = line.points[i];
        const p2 = line.points[i + 1];
        const dist = this.pointToLineDistance(x, y, p1.x, p1.y, p2.x, p2.y);
        if (dist < lineThreshold) return true;
      }
    }

    return false;
  }

  /**
   * Point to line segment distance
   */
  private pointToLineDistance(
    px: number, py: number,
    x1: number, y1: number, x2: number, y2: number
  ): number {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lengthSq = dx * dx + dy * dy;

    if (lengthSq === 0) {
      return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2);
    }

    let t = ((px - x1) * dx + (py - y1) * dy) / lengthSq;
    t = Math.max(0, Math.min(1, t));

    const nearestX = x1 + t * dx;
    const nearestY = y1 + t * dy;

    return Math.sqrt((px - nearestX) ** 2 + (py - nearestY) ** 2);
  }

  /**
   * Normalize angle to [-PI, PI]
   */
  private normalizeAngle(angle: number): number {
    while (angle > Math.PI) angle -= 2 * Math.PI;
    while (angle < -Math.PI) angle += 2 * Math.PI;
    return angle;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CAMERA SIMULATION
  // ═══════════════════════════════════════════════════════════════════════════

  private processCameraCommand(): void {
    if (!this.memoryView) return;

    const cmd = this.readUint8(MEMORY_MAP.CAMERA_CMD);

    if (cmd === CAMERA.CMD_CAPTURE || cmd === CAMERA.CMD_STREAM) {
      // Set busy status
      this.writeUint8(MEMORY_MAP.CAMERA_STATUS, CAMERA.STATUS_BUSY);

      // Generate simulated camera frame
      this.generateCameraFrame();

      // Set ready status
      this.writeUint8(MEMORY_MAP.CAMERA_STATUS, CAMERA.STATUS_READY);

      // Clear command (for single capture mode)
      if (cmd === CAMERA.CMD_CAPTURE) {
        this.writeUint8(MEMORY_MAP.CAMERA_CMD, CAMERA.CMD_STOP);
      }
    }
  }

  /**
   * Generate simulated camera frame based on world state
   */
  private generateCameraFrame(): void {
    if (!this.memoryView) return;

    const fov = Math.PI / 3; // 60 degree field of view
    const halfFov = fov / 2;

    for (let y = 0; y < CAMERA.HEIGHT; y++) {
      for (let x = 0; x < CAMERA.WIDTH; x++) {
        // Calculate ray angle for this pixel
        const pixelAngle = this.pose.rotation + halfFov - (x / CAMERA.WIDTH) * fov;

        // Raycast to find distance
        const distance = this.raycast(this.pose.x, this.pose.y, pixelAngle, 3.0);

        // Convert distance to grayscale (closer = brighter)
        let brightness = 0;
        if (distance < 3.0) {
          brightness = Math.round(255 * (1 - distance / 3.0));
        }

        // Check for beacons (bright spots)
        for (const beacon of this.world.beacons) {
          if (!beacon.active) continue;

          const beaconAngle = Math.atan2(beacon.y - this.pose.y, beacon.x - this.pose.x);
          const angleDiff = this.normalizeAngle(pixelAngle - beaconAngle);

          if (Math.abs(angleDiff) < 0.1) { // Within ~6 degrees
            const beaconDist = Math.sqrt(
              (beacon.x - this.pose.x) ** 2 + (beacon.y - this.pose.y) ** 2
            );
            if (beaconDist < distance) {
              brightness = 255; // Beacon is bright
            }
          }
        }

        // Apply vertical gradient (floor/ceiling)
        const verticalFactor = 1 - Math.abs(y - CAMERA.HEIGHT / 2) / (CAMERA.HEIGHT / 2) * 0.3;
        brightness = Math.round(brightness * verticalFactor);

        // Write to framebuffer
        const offset = MEMORY_MAP.FRAMEBUFFER + y * CAMERA.WIDTH + x;
        this.writeUint8(offset, Math.min(255, brightness));
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // IMPORTED FUNCTIONS (called by WASM)
  // ═══════════════════════════════════════════════════════════════════════════

  private traceImpl(ptr: number): void {
    if (!this.memoryView) return;

    // Read null-terminated string from WASM memory
    let str = '';
    let offset = ptr;
    while (true) {
      const byte = this.memoryView.getUint8(offset++);
      if (byte === 0) break;
      str += String.fromCharCode(byte);
    }

    this.config.onTrace(`[Robot4] ${str}`);
  }

  private delayMsImpl(ms: number): void {
    // In browser, we can't actually block, so this is a no-op
    // Real delays should use tick counting in the update loop
    console.warn(`[Robot4Runtime] delay_ms(${ms}) called - use tick counting instead`);
  }

  private randomImpl(): number {
    return Math.floor(Math.random() * 0xFFFFFFFF);
  }

  private toneImpl(freq: number, duration: number, volume: number): void {
    this.config.onTone(freq, duration, volume);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MEMORY ACCESS HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  private readInt16(offset: number): number {
    return this.memoryView?.getInt16(offset, true) ?? 0;
  }

  private writeInt16(offset: number, value: number): void {
    this.memoryView?.setInt16(offset, value, true);
  }

  private readInt32(offset: number): number {
    return this.memoryView?.getInt32(offset, true) ?? 0;
  }

  private writeInt32(offset: number, value: number): void {
    this.memoryView?.setInt32(offset, value, true);
  }

  private readUint8(offset: number): number {
    return this.memoryView?.getUint8(offset) ?? 0;
  }

  private writeUint8(offset: number, value: number): void {
    this.memoryView?.setUint8(offset, value);
  }

  private readUint32(offset: number): number {
    return this.memoryView?.getUint32(offset, true) ?? 0;
  }

  private writeUint32(offset: number, value: number): void {
    this.memoryView?.setUint32(offset, value, true);
  }

  /**
   * Dispose and cleanup
   */
  dispose(): void {
    this.stop();
    this.virtualDevice.dispose();
    this.wasmInstance = null;
    this.memory = null;
    this.memoryView = null;
  }
}

/**
 * Create a new Robot4 runtime instance
 */
export function createRobot4Runtime(config?: Robot4Config): Robot4Runtime {
  return new Robot4Runtime(config);
}

/**
 * Compile Robot4 firmware from C source
 * NOTE: WASM compilation removed during cleanup. Will be replaced by LLMBytecode pipeline.
 */
export async function compileRobot4Firmware(
  _source: string,
  _name: string = 'robot_firmware'
): Promise<{ success: boolean; wasmBinary?: Uint8Array; error?: string }> {
  return {
    success: false,
    error: 'WASM compilation removed. Use LLMBytecode pipeline instead.',
  };
}
