/**
 * Cube Robot Simulator
 *
 * Simulates a 2-wheeled cube robot with camera that can:
 * - Move on a virtual floor
 * - Reproduce WASM4 games in physical space
 * - Stream camera feed
 * - Report sensor data
 *
 * The robot is a cube with:
 * - 2 wheels (differential drive)
 * - Front-facing camera (160x160 to match WASM4)
 * - IMU (accelerometer, gyroscope)
 * - Distance sensors (front, left, right)
 * - LED matrix on top (8x8)
 */

import type { IMUData } from './virtual-esp32';

// Robot physical parameters
export interface RobotConfig {
  // Physical dimensions (cm)
  cubeSize: number;           // Side length of cube
  wheelDiameter: number;      // Wheel diameter
  wheelBase: number;          // Distance between wheels

  // Motor parameters
  maxRPM: number;             // Maximum wheel RPM
  maxAcceleration: number;    // Max acceleration (cm/s²)

  // Sensor parameters
  cameraFOV: number;          // Camera field of view (degrees)
  cameraResolution: number;   // Camera resolution (pixels, square)
  distanceSensorRange: number; // Max range of distance sensors (cm)

  // Floor parameters
  floorWidth: number;         // Virtual floor width (cm)
  floorHeight: number;        // Virtual floor height (cm)
  gridSize: number;           // Grid cell size for game mapping
}

// Robot state
export interface RobotState {
  // Position and orientation (in cm and degrees)
  x: number;
  y: number;
  heading: number;  // 0 = facing up, 90 = facing right

  // Velocity
  velocityLeft: number;   // Left wheel velocity (cm/s)
  velocityRight: number;  // Right wheel velocity (cm/s)
  linearVelocity: number; // Forward velocity (cm/s)
  angularVelocity: number; // Rotation speed (deg/s)

  // Sensor readings
  distanceFront: number;
  distanceLeft: number;
  distanceRight: number;

  // Camera feed (160x160 grayscale or color)
  cameraBuffer: Uint8Array;

  // IMU data
  imu: IMUData;

  // LED matrix state (8x8)
  ledMatrix: number[][];

  // Battery
  batteryPercent: number;
  batteryVoltage: number;

  // Status
  connected: boolean;
  mode: 'idle' | 'manual' | 'autonomous' | 'game';
  currentGame: string | null;
}

// Floor obstacle
export interface FloorObstacle {
  type: 'wall' | 'boundary' | 'object' | 'goal' | 'hazard';
  x: number;
  y: number;
  width: number;
  height: number;
  color?: string;
}

// Game mapping: converts WASM4 game state to robot movements
export interface GameMapping {
  name: string;
  description: string;
  // Maps game pixel position to floor position
  pixelToFloor: (px: number, py: number) => { x: number; y: number };
  // Maps game input to robot command
  inputToCommand: (buttons: number) => RobotCommand;
  // Maps robot position to game position
  floorToPixel: (x: number, y: number) => { px: number; py: number };
}

// Robot command
export interface RobotCommand {
  type: 'move' | 'turn' | 'stop' | 'led' | 'beep' | 'setMode';
  // For move
  leftSpeed?: number;   // -100 to 100
  rightSpeed?: number;
  // For turn
  angle?: number;
  // For LED
  ledState?: number[][];
  // For beep
  frequency?: number;
  duration?: number;
  // For setMode
  mode?: RobotState['mode'];
  game?: string;
}

// Event types
export type RobotEventType = 'stateUpdate' | 'collision' | 'goalReached' | 'lowBattery' | 'gameEvent';

export interface RobotEvent {
  type: RobotEventType;
  timestamp: number;
  data: any;
}

// Floor map for game simulation
export interface FloorMap {
  width: number;
  height: number;
  obstacles: FloorObstacle[];
  goals: Array<{ x: number; y: number; radius: number }>;
  spawnPoint: { x: number; y: number; heading: number };
}

/**
 * Cube Robot Simulator
 */
export class CubeRobotSimulator {
  private config: RobotConfig;
  private state: RobotState;
  private floorMap: FloorMap;
  private eventListeners: Map<RobotEventType, Array<(event: RobotEvent) => void>> = new Map();
  private updateInterval: ReturnType<typeof setInterval> | null = null;
  private lastUpdateTime: number = 0;
  private readonly PHYSICS_FPS = 60;

  // Game state
  private gameMapping: GameMapping | null = null;
  private gameButtons: number = 0;

  constructor(config: Partial<RobotConfig> = {}) {
    this.config = {
      cubeSize: 10,           // 10cm cube
      wheelDiameter: 4,       // 4cm wheels
      wheelBase: 8,           // 8cm between wheels
      maxRPM: 200,            // 200 RPM max
      maxAcceleration: 50,    // 50 cm/s²
      cameraFOV: 60,          // 60 degree FOV
      cameraResolution: 160,  // 160x160 camera
      distanceSensorRange: 100, // 100cm range
      floorWidth: 200,        // 2m x 2m floor
      floorHeight: 200,
      gridSize: 1.25,         // Maps to 160 pixels
      ...config,
    };

    this.state = this.createInitialState();
    this.floorMap = this.createDefaultFloor();
  }

  private createInitialState(): RobotState {
    return {
      x: this.config.floorWidth / 2,
      y: this.config.floorHeight / 2,
      heading: 0,
      velocityLeft: 0,
      velocityRight: 0,
      linearVelocity: 0,
      angularVelocity: 0,
      distanceFront: this.config.distanceSensorRange,
      distanceLeft: this.config.distanceSensorRange,
      distanceRight: this.config.distanceSensorRange,
      cameraBuffer: new Uint8Array(this.config.cameraResolution * this.config.cameraResolution),
      imu: {
        accel: { x: 0, y: 0, z: 9.81 },
        gyro: { x: 0, y: 0, z: 0 },
        orientation: { roll: 0, pitch: 0, yaw: 0 },
      },
      ledMatrix: Array(8).fill(null).map(() => Array(8).fill(0)),
      batteryPercent: 100,
      batteryVoltage: 4.2,
      connected: true,
      mode: 'idle',
      currentGame: null,
    };
  }

  private createDefaultFloor(): FloorMap {
    return {
      width: this.config.floorWidth,
      height: this.config.floorHeight,
      obstacles: [
        // Boundary walls
        { type: 'boundary', x: 0, y: 0, width: this.config.floorWidth, height: 1 },
        { type: 'boundary', x: 0, y: this.config.floorHeight - 1, width: this.config.floorWidth, height: 1 },
        { type: 'boundary', x: 0, y: 0, width: 1, height: this.config.floorHeight },
        { type: 'boundary', x: this.config.floorWidth - 1, y: 0, width: 1, height: this.config.floorHeight },
      ],
      goals: [],
      spawnPoint: {
        x: this.config.floorWidth / 2,
        y: this.config.floorHeight / 2,
        heading: 0,
      },
    };
  }

  /**
   * Start the physics simulation
   */
  start(): void {
    if (this.updateInterval) return;

    this.lastUpdateTime = performance.now();
    this.updateInterval = setInterval(() => {
      const now = performance.now();
      const dt = (now - this.lastUpdateTime) / 1000;
      this.lastUpdateTime = now;
      this.update(dt);
    }, 1000 / this.PHYSICS_FPS);

    this.state.connected = true;
    this.emit('stateUpdate', this.state);
  }

  /**
   * Stop the physics simulation
   */
  stop(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
    this.state.connected = false;
  }

  /**
   * Physics update
   */
  private update(dt: number): void {
    // Skip if paused or disconnected
    if (!this.state.connected) return;

    // Process game input if in game mode
    if (this.state.mode === 'game' && this.gameMapping) {
      const cmd = this.gameMapping.inputToCommand(this.gameButtons);
      this.processCommand(cmd);
    }

    // Apply differential drive kinematics
    const vL = this.state.velocityLeft;
    const vR = this.state.velocityRight;

    // Linear and angular velocity
    this.state.linearVelocity = (vL + vR) / 2;
    this.state.angularVelocity = (vR - vL) / this.config.wheelBase * (180 / Math.PI);

    // Update position
    const headingRad = this.state.heading * Math.PI / 180;
    this.state.x += this.state.linearVelocity * Math.sin(headingRad) * dt;
    this.state.y -= this.state.linearVelocity * Math.cos(headingRad) * dt;
    this.state.heading = (this.state.heading + this.state.angularVelocity * dt + 360) % 360;

    // Check collisions
    const collision = this.checkCollisions();
    if (collision) {
      // Stop on collision
      this.state.velocityLeft = 0;
      this.state.velocityRight = 0;
      this.emit('collision', { obstacle: collision });
    }

    // Update sensors
    this.updateSensors();

    // Update IMU
    this.updateIMU(dt);

    // Drain battery
    this.state.batteryPercent -= 0.0001 * (Math.abs(vL) + Math.abs(vR));
    this.state.batteryVoltage = 3.3 + (this.state.batteryPercent / 100) * 0.9;

    if (this.state.batteryPercent < 10) {
      this.emit('lowBattery', { percent: this.state.batteryPercent });
    }

    // Check goals
    for (const goal of this.floorMap.goals) {
      const dist = Math.sqrt(
        Math.pow(this.state.x - goal.x, 2) +
        Math.pow(this.state.y - goal.y, 2)
      );
      if (dist < goal.radius) {
        this.emit('goalReached', { goal });
      }
    }

    // Emit state update
    this.emit('stateUpdate', this.state);
  }

  /**
   * Check for collisions
   */
  private checkCollisions(): FloorObstacle | null {
    const robotRadius = this.config.cubeSize / 2;

    for (const obstacle of this.floorMap.obstacles) {
      // Simple AABB collision
      const robotLeft = this.state.x - robotRadius;
      const robotRight = this.state.x + robotRadius;
      const robotTop = this.state.y - robotRadius;
      const robotBottom = this.state.y + robotRadius;

      const obsLeft = obstacle.x;
      const obsRight = obstacle.x + obstacle.width;
      const obsTop = obstacle.y;
      const obsBottom = obstacle.y + obstacle.height;

      if (robotRight > obsLeft && robotLeft < obsRight &&
          robotBottom > obsTop && robotTop < obsBottom) {
        return obstacle;
      }
    }

    return null;
  }

  /**
   * Update distance sensors (ray casting)
   */
  private updateSensors(): void {
    this.state.distanceFront = this.castRay(this.state.heading);
    this.state.distanceLeft = this.castRay(this.state.heading - 90);
    this.state.distanceRight = this.castRay(this.state.heading + 90);
  }

  /**
   * Cast a ray and return distance to nearest obstacle
   */
  private castRay(heading: number): number {
    const maxRange = this.config.distanceSensorRange;
    const step = 0.5;
    const headingRad = heading * Math.PI / 180;

    for (let dist = 0; dist < maxRange; dist += step) {
      const testX = this.state.x + dist * Math.sin(headingRad);
      const testY = this.state.y - dist * Math.cos(headingRad);

      for (const obstacle of this.floorMap.obstacles) {
        if (testX >= obstacle.x && testX < obstacle.x + obstacle.width &&
            testY >= obstacle.y && testY < obstacle.y + obstacle.height) {
          return dist;
        }
      }
    }

    return maxRange;
  }

  /**
   * Update IMU based on motion
   */
  private updateIMU(dt: number): void {
    // Accelerometer (forward acceleration + gravity)
    const accelForward = (this.state.linearVelocity - this.state.imu.accel.x) / dt;
    this.state.imu.accel.x = Math.min(Math.max(accelForward, -10), 10);
    this.state.imu.accel.z = 9.81;

    // Gyroscope (angular velocity)
    this.state.imu.gyro.z = this.state.angularVelocity;

    // Orientation
    this.state.imu.orientation.yaw = this.state.heading;
  }

  /**
   * Update camera (generates synthetic image based on floor state)
   */
  updateCamera(): void {
    const res = this.config.cameraResolution;
    const fov = this.config.cameraFOV;
    const buffer = this.state.cameraBuffer;

    // Clear buffer
    buffer.fill(0);

    // Render floor obstacles into camera view
    // This is a simplified top-down projection
    const scale = res / (this.config.floorWidth / 4); // View radius

    for (let py = 0; py < res; py++) {
      for (let px = 0; px < res; px++) {
        // Map pixel to world coordinates
        const relX = (px - res / 2) / scale;
        const relY = (res / 2 - py) / scale;

        // Rotate by heading
        const headingRad = this.state.heading * Math.PI / 180;
        const worldX = this.state.x + relX * Math.cos(headingRad) - relY * Math.sin(headingRad);
        const worldY = this.state.y + relX * Math.sin(headingRad) + relY * Math.cos(headingRad);

        // Check what's at this position
        let color = 0; // Floor color

        for (const obstacle of this.floorMap.obstacles) {
          if (worldX >= obstacle.x && worldX < obstacle.x + obstacle.width &&
              worldY >= obstacle.y && worldY < obstacle.y + obstacle.height) {
            switch (obstacle.type) {
              case 'wall': color = 1; break;
              case 'boundary': color = 1; break;
              case 'goal': color = 2; break;
              case 'hazard': color = 3; break;
              default: color = 1;
            }
            break;
          }
        }

        buffer[py * res + px] = color;
      }
    }
  }

  /**
   * Send command to robot
   */
  sendCommand(command: RobotCommand): void {
    this.processCommand(command);
  }

  private processCommand(command: RobotCommand): void {
    switch (command.type) {
      case 'move':
        if (command.leftSpeed !== undefined) {
          this.state.velocityLeft = (command.leftSpeed / 100) * this.maxSpeed();
        }
        if (command.rightSpeed !== undefined) {
          this.state.velocityRight = (command.rightSpeed / 100) * this.maxSpeed();
        }
        break;

      case 'turn':
        if (command.angle !== undefined) {
          this.state.heading = (this.state.heading + command.angle + 360) % 360;
        }
        break;

      case 'stop':
        this.state.velocityLeft = 0;
        this.state.velocityRight = 0;
        break;

      case 'led':
        if (command.ledState) {
          this.state.ledMatrix = command.ledState;
        }
        break;

      case 'setMode':
        if (command.mode) {
          this.state.mode = command.mode;
          if (command.game) {
            this.state.currentGame = command.game;
          }
        }
        break;
    }
  }

  private maxSpeed(): number {
    // Convert RPM to cm/s
    const circumference = Math.PI * this.config.wheelDiameter;
    return (this.config.maxRPM / 60) * circumference;
  }

  // === Game Mode Functions ===

  /**
   * Load a game mapping for physical game reproduction
   */
  loadGameMapping(mapping: GameMapping): void {
    this.gameMapping = mapping;
    this.state.mode = 'game';
    this.state.currentGame = mapping.name;
  }

  /**
   * Set game buttons (from WASM4 input)
   */
  setGameButtons(buttons: number): void {
    this.gameButtons = buttons;
  }

  /**
   * Get robot position as game pixel position
   */
  getRobotGamePosition(): { px: number; py: number } | null {
    if (!this.gameMapping) return null;
    return this.gameMapping.floorToPixel(this.state.x, this.state.y);
  }

  // === Floor Map Functions ===

  /**
   * Load a floor map
   */
  loadFloorMap(map: FloorMap): void {
    this.floorMap = map;
    // Reset robot to spawn point
    this.state.x = map.spawnPoint.x;
    this.state.y = map.spawnPoint.y;
    this.state.heading = map.spawnPoint.heading;
  }

  /**
   * Add obstacle to floor
   */
  addObstacle(obstacle: FloorObstacle): void {
    this.floorMap.obstacles.push(obstacle);
  }

  /**
   * Clear all obstacles (except boundaries)
   */
  clearObstacles(): void {
    this.floorMap.obstacles = this.floorMap.obstacles.filter(o => o.type === 'boundary');
  }

  /**
   * Generate floor map from WASM4 game framebuffer
   */
  generateFloorFromGame(framebuffer: Uint8Array, width: number, height: number): void {
    // Clear non-boundary obstacles
    this.clearObstacles();

    const cellWidth = this.config.floorWidth / width;
    const cellHeight = this.config.floorHeight / height;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const color = framebuffer[y * width + x];

        if (color > 0) {
          // Non-zero colors are obstacles/goals
          this.addObstacle({
            type: color === 3 ? 'goal' : color === 2 ? 'hazard' : 'wall',
            x: x * cellWidth,
            y: y * cellHeight,
            width: cellWidth,
            height: cellHeight,
          });
        }
      }
    }
  }

  // === Event System ===

  on(event: RobotEventType, callback: (event: RobotEvent) => void): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event)!.push(callback);
  }

  off(event: RobotEventType, callback: (event: RobotEvent) => void): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      const idx = listeners.indexOf(callback);
      if (idx >= 0) {
        listeners.splice(idx, 1);
      }
    }
  }

  private emit(type: RobotEventType, data: any): void {
    const event: RobotEvent = {
      type,
      timestamp: Date.now(),
      data,
    };

    const listeners = this.eventListeners.get(type);
    if (listeners) {
      for (const callback of listeners) {
        callback(event);
      }
    }
  }

  // === Getters ===

  getState(): RobotState {
    return { ...this.state };
  }

  getConfig(): RobotConfig {
    return { ...this.config };
  }

  getFloorMap(): FloorMap {
    return { ...this.floorMap };
  }

  isConnected(): boolean {
    return this.state.connected;
  }

  /**
   * Reset robot to initial state
   */
  reset(): void {
    this.state = this.createInitialState();
    this.floorMap = this.createDefaultFloor();
    this.gameMapping = null;
    this.gameButtons = 0;
    this.emit('stateUpdate', this.state);
  }

  /**
   * Respawn at spawn point
   */
  respawn(): void {
    this.state.x = this.floorMap.spawnPoint.x;
    this.state.y = this.floorMap.spawnPoint.y;
    this.state.heading = this.floorMap.spawnPoint.heading;
    this.state.velocityLeft = 0;
    this.state.velocityRight = 0;
    this.emit('stateUpdate', this.state);
  }
}

// === Pre-built Game Mappings ===

export const SNAKE_GAME_MAPPING: GameMapping = {
  name: 'Snake',
  description: 'Classic snake game - robot follows snake path',
  pixelToFloor: (px, py) => ({
    x: (px / 160) * 200,
    y: (py / 160) * 200,
  }),
  inputToCommand: (buttons) => {
    const BUTTON_UP = 64;
    const BUTTON_DOWN = 128;
    const BUTTON_LEFT = 16;
    const BUTTON_RIGHT = 32;

    let leftSpeed = 0;
    let rightSpeed = 0;

    if (buttons & BUTTON_UP) {
      leftSpeed = 50;
      rightSpeed = 50;
    } else if (buttons & BUTTON_DOWN) {
      leftSpeed = -50;
      rightSpeed = -50;
    } else if (buttons & BUTTON_LEFT) {
      leftSpeed = -30;
      rightSpeed = 30;
    } else if (buttons & BUTTON_RIGHT) {
      leftSpeed = 30;
      rightSpeed = -30;
    }

    return { type: 'move', leftSpeed, rightSpeed };
  },
  floorToPixel: (x, y) => ({
    px: Math.floor((x / 200) * 160),
    py: Math.floor((y / 200) * 160),
  }),
};

export const PONG_GAME_MAPPING: GameMapping = {
  name: 'Pong',
  description: 'Pong game - robot acts as paddle',
  pixelToFloor: (px, py) => ({
    x: (px / 160) * 200,
    y: (py / 160) * 200,
  }),
  inputToCommand: (buttons) => {
    const BUTTON_UP = 64;
    const BUTTON_DOWN = 128;

    let leftSpeed = 0;
    let rightSpeed = 0;

    // Pong paddle moves up/down only
    if (buttons & BUTTON_UP) {
      leftSpeed = 50;
      rightSpeed = 50;
    } else if (buttons & BUTTON_DOWN) {
      leftSpeed = -50;
      rightSpeed = -50;
    }

    return { type: 'move', leftSpeed, rightSpeed };
  },
  floorToPixel: (x, y) => ({
    px: Math.floor((x / 200) * 160),
    py: Math.floor((y / 200) * 160),
  }),
};

export const MAZE_GAME_MAPPING: GameMapping = {
  name: 'Maze',
  description: 'Maze navigation - robot follows maze path',
  pixelToFloor: (px, py) => ({
    x: (px / 160) * 200,
    y: (py / 160) * 200,
  }),
  inputToCommand: (buttons) => {
    const BUTTON_UP = 64;
    const BUTTON_DOWN = 128;
    const BUTTON_LEFT = 16;
    const BUTTON_RIGHT = 32;

    let leftSpeed = 0;
    let rightSpeed = 0;

    // Maze uses all directions
    if (buttons & BUTTON_UP) {
      leftSpeed = 40;
      rightSpeed = 40;
    } else if (buttons & BUTTON_DOWN) {
      leftSpeed = -40;
      rightSpeed = -40;
    }

    if (buttons & BUTTON_LEFT) {
      leftSpeed -= 20;
      rightSpeed += 20;
    } else if (buttons & BUTTON_RIGHT) {
      leftSpeed += 20;
      rightSpeed -= 20;
    }

    return { type: 'move', leftSpeed, rightSpeed };
  },
  floorToPixel: (x, y) => ({
    px: Math.floor((x / 200) * 160),
    py: Math.floor((y / 200) * 160),
  }),
};

export default CubeRobotSimulator;
