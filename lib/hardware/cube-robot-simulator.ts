/**
 * Cube Robot Simulator
 *
 * A comprehensive physics-based simulation of a 2-wheeled differential drive cube robot.
 * Designed to work with WASM4 games and be controlled by ESP32 devices.
 *
 * Features:
 * - Differential drive kinematics
 * - Distance sensors (8 directions)
 * - Line following sensors (5 sensors)
 * - RGB LED strip
 * - IMU simulation (accelerometer, gyroscope)
 * - Bumper/collision detection
 * - Floor map support (lines, obstacles, walls)
 * - Battery simulation
 */

// ═══════════════════════════════════════════════════════════════════════════
// ROBOT PHYSICAL CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

export const ROBOT_SPECS = {
  // Physical dimensions (meters)
  BODY_SIZE: 0.08,           // 8cm cube
  WHEEL_RADIUS: 0.0325,      // 32.5mm wheel
  WHEEL_BASE: 0.07,          // 7cm between wheels
  WHEEL_WIDTH: 0.01,         // 1cm wheel width

  // Motor specs
  MAX_RPM: 300,
  STALL_TORQUE: 0.2,         // N*m
  GEAR_RATIO: 50,

  // Sensor specs
  DISTANCE_MAX: 2.0,         // 2 meter range
  LINE_SENSOR_WIDTH: 0.06,   // 6cm sensor array
  LINE_SENSOR_COUNT: 5,

  // Battery
  BATTERY_VOLTAGE: 3.7,      // LiPo cell
  BATTERY_CAPACITY_MAH: 1000,

  // Mass
  MASS: 0.25,                // 250g

  // Wall thickness (meters) - walls are no longer zero-thickness line segments
  WALL_THICKNESS: 0.03,      // 3cm thick walls
};

// ═══════════════════════════════════════════════════════════════════════════
// TYPES AND INTERFACES
// ═══════════════════════════════════════════════════════════════════════════

export interface Vector2D {
  x: number;
  y: number;
}

export interface RobotPose {
  x: number;        // Position in meters
  y: number;
  rotation: number; // Heading in radians (-PI to PI)
}

export interface RobotVelocity {
  linear: number;   // m/s
  angular: number;  // rad/s
}

export interface MotorState {
  leftPWM: number;  // -255 to 255
  rightPWM: number;
  leftRPM: number;  // Current RPM
  rightRPM: number;
}

export interface SensorData {
  // Distance sensors (8 directions, in cm)
  distance: {
    front: number;
    frontLeft: number;
    frontRight: number;
    left: number;
    right: number;
    back: number;
    backLeft: number;
    backRight: number;
  };

  // Line sensors (0-255, 5 sensors)
  line: number[];

  // IMU
  imu: {
    accel: Vector2D & { z: number };
    gyro: Vector2D & { z: number };
    heading: number;
  };

  // Bumper/buttons
  bumper: {
    front: boolean;
    back: boolean;
  };

  // Encoders (ticks)
  encoders: {
    left: number;
    right: number;
  };

  // Nearby collectibles (for goal-based scenarios)
  nearbyCollectibles?: {
    id: string;
    type: string;
    distance: number;    // Distance in cm
    angle: number;       // Angle relative to robot heading (-180 to 180 degrees)
    points: number;
  }[];

  // Nearby pushable objects (for physics-based scenarios)
  nearbyPushables?: {
    id: string;
    label: string;
    distance: number;    // Distance in cm
    angle: number;       // Angle relative to robot heading (-180 to 180 degrees)
    color: string;
    dockedIn?: string;   // ID of dock zone if object is inside one
  }[];

  // Nearby dock zones (for goal-based scenarios)
  nearbyDockZones?: {
    id: string;
    label: string;
    distance: number;    // Distance in cm
    angle: number;       // Angle relative to robot heading (-180 to 180 degrees)
    color: string;
    hasObject: boolean;  // Whether any pushable object is inside this dock
  }[];

  // Velocity (for trajectory prediction)
  velocity: {
    linear: number;   // m/s (forward/backward speed)
    angular: number;  // rad/s (turning rate)
  };
}

export interface LEDState {
  r: number;
  g: number;
  b: number;
  brightness: number;
}

export interface BatteryState {
  voltage: number;    // Current voltage
  percentage: number; // 0-100
  charging: boolean;
  current: number;    // mA (positive = discharging)
}

export interface Wall {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface Obstacle {
  x: number;
  y: number;
  radius: number;
}

export interface LineTrack {
  points: Vector2D[];
  width: number;
  color: string;
}

export interface Collectible {
  id: string;
  type: 'coin' | 'ball' | 'gem' | 'star';
  x: number;
  y: number;
  radius: number;  // Collection radius (default ~0.08m = 8cm)
  color?: string;  // Optional custom color
  points?: number; // Points value (default: 10)
}

// Pushable physics object - can be pushed by the robot
export interface PushableObject {
  id: string;
  x: number;
  y: number;
  size: number;      // Side length for cube (meters)
  mass: number;      // Mass in kg (affects push resistance)
  friction: number;  // Friction coefficient (0-1, higher = harder to push)
  color: string;     // Display color
  label?: string;    // Optional label (e.g., "Red Cube")
}

// Dock zone - target area where objects should be pushed to
export interface DockZone {
  id: string;
  x: number;
  y: number;
  width: number;     // Zone width in meters
  height: number;    // Zone height in meters
  color: string;     // Display color
  label?: string;    // Optional label (e.g., "Green Dock")
}

// Runtime state for a pushable object (includes velocity)
export interface PushableObjectState {
  id: string;
  x: number;
  y: number;
  vx: number;       // Velocity X (m/s)
  vy: number;       // Velocity Y (m/s)
  size: number;
  mass: number;
  friction: number;
  color: string;
  label?: string;
  dockedIn?: string; // ID of dock zone if object is inside one
}

export interface FloorMap {
  bounds: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  };
  walls: Wall[];
  obstacles: Obstacle[];
  lines: LineTrack[];
  checkpoints: Vector2D[];
  collectibles?: Collectible[];  // Optional collectible items (coins, balls, etc.)
  pushableObjects?: PushableObject[];  // Objects that can be pushed by the robot
  dockZones?: DockZone[];              // Target zones for pushing objects into
  startPosition: RobotPose;
}

export interface CubeRobotConfig {
  physicsRate?: number;      // Physics updates per second (default: 100)
  onStateChange?: (state: CubeRobotState) => void;
  onCollision?: (position: Vector2D) => void;
  onCheckpoint?: (index: number) => void;
  onCollectible?: (collectible: Collectible, totalCollected: number, totalPoints: number) => void;
  onObjectDocked?: (objectId: string, dockZoneId: string) => void;  // When a pushable object enters a dock zone
}

export interface CubeRobotState {
  pose: RobotPose;
  velocity: RobotVelocity;
  motors: MotorState;
  sensors: SensorData;
  led: LEDState;
  battery: BatteryState;
  timestamp: number;
  // Collectibles tracking
  collectibles?: {
    collected: string[];      // IDs of collected items
    remaining: string[];      // IDs of remaining items
    totalPoints: number;      // Total points scored
    totalCount: number;       // Total items in map
  };
  // Pushable objects tracking
  pushableObjects?: PushableObjectState[];
  // Dock zone status
  dockZones?: {
    id: string;
    label?: string;
    x: number;
    y: number;
    width: number;
    height: number;
    color: string;
    dockedObjectIds: string[];  // IDs of pushable objects currently inside this dock
  }[];
}

// ═══════════════════════════════════════════════════════════════════════════
// CUBE ROBOT SIMULATOR
// ═══════════════════════════════════════════════════════════════════════════

export class CubeRobotSimulator {
  private config: Required<CubeRobotConfig>;
  private map: FloorMap;

  // Robot state
  private pose: RobotPose = { x: 0, y: 0, rotation: 0 };
  private velocity: RobotVelocity = { linear: 0, angular: 0 };
  private motors: MotorState = { leftPWM: 0, rightPWM: 0, leftRPM: 0, rightRPM: 0 };
  private led: LEDState = { r: 88, g: 166, b: 255, brightness: 100 }; // Default blue (#58a6ff)

  // Sensors
  private encoders = { left: 0, right: 0 };
  private prevEncoders = { left: 0, right: 0 };
  private bumperState = { front: false, back: false };

  // Battery simulation
  private batteryMAh = ROBOT_SPECS.BATTERY_CAPACITY_MAH;
  private batteryVoltage = ROBOT_SPECS.BATTERY_VOLTAGE;

  // Physics loop
  private physicsInterval: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private startTime = 0;

  // Checkpoint tracking
  private checkpointsReached: Set<number> = new Set();

  // Collectibles tracking
  private collectedItems: Set<string> = new Set();
  private totalPoints = 0;

  // Pushable objects runtime state
  private pushableObjectStates: PushableObjectState[] = [];
  private dockedObjects: Map<string, string> = new Map(); // objectId -> dockZoneId

  constructor(config: CubeRobotConfig = {}) {
    this.config = {
      physicsRate: config.physicsRate ?? 100,
      onStateChange: config.onStateChange ?? (() => {}),
      onCollision: config.onCollision ?? (() => {}),
      onCheckpoint: config.onCheckpoint ?? (() => {}),
      onCollectible: config.onCollectible ?? (() => {}),
      onObjectDocked: config.onObjectDocked ?? (() => {}),
    };

    this.map = this.createDefaultMap();
    this.reset();
  }

  /**
   * Create default map (2m x 2m arena)
   */
  private createDefaultMap(): FloorMap {
    const size = 1.0; // 1 meter from center

    return {
      bounds: { minX: -size, maxX: size, minY: -size, maxY: size },
      walls: [
        { x1: -size, y1: -size, x2: size, y2: -size },  // Bottom
        { x1: size, y1: -size, x2: size, y2: size },    // Right
        { x1: size, y1: size, x2: -size, y2: size },    // Top
        { x1: -size, y1: size, x2: -size, y2: -size },  // Left
      ],
      obstacles: [],
      lines: [
        // Simple oval track
        {
          points: [
            { x: -0.5, y: 0 },
            { x: -0.4, y: 0.3 },
            { x: 0, y: 0.5 },
            { x: 0.4, y: 0.3 },
            { x: 0.5, y: 0 },
            { x: 0.4, y: -0.3 },
            { x: 0, y: -0.5 },
            { x: -0.4, y: -0.3 },
            { x: -0.5, y: 0 },
          ],
          width: 0.02,
          color: '#000000',
        },
      ],
      checkpoints: [
        { x: 0.5, y: 0 },
        { x: 0, y: 0.5 },
        { x: -0.5, y: 0 },
        { x: 0, y: -0.5 },
      ],
      startPosition: { x: 0, y: 0, rotation: 0 },
    };
  }

  /**
   * Set floor map
   */
  setMap(map: FloorMap): void {
    this.map = map;
    this.reset();
  }

  /**
   * Get current map
   */
  getMap(): FloorMap {
    return { ...this.map };
  }

  /**
   * Reset robot to initial state
   */
  reset(): void {
    this.pose = { ...this.map.startPosition };
    this.velocity = { linear: 0, angular: 0 };
    this.motors = { leftPWM: 0, rightPWM: 0, leftRPM: 0, rightRPM: 0 };
    this.encoders = { left: 0, right: 0 };
    this.prevEncoders = { left: 0, right: 0 };
    this.bumperState = { front: false, back: false };
    this.led = { r: 88, g: 166, b: 255, brightness: 100 }; // Default blue (#58a6ff)
    this.batteryMAh = ROBOT_SPECS.BATTERY_CAPACITY_MAH;
    this.batteryVoltage = ROBOT_SPECS.BATTERY_VOLTAGE;
    this.checkpointsReached.clear();
    this.collectedItems.clear();
    this.totalPoints = 0;
    this.startTime = Date.now();

    // Initialize pushable object states from map
    this.pushableObjectStates = (this.map.pushableObjects || []).map(obj => ({
      id: obj.id,
      x: obj.x,
      y: obj.y,
      vx: 0,
      vy: 0,
      size: obj.size,
      mass: obj.mass,
      friction: obj.friction,
      color: obj.color,
      label: obj.label,
    }));
    this.dockedObjects.clear();
  }

  /**
   * Start physics simulation
   */
  start(): void {
    if (this.running) return;

    this.running = true;
    this.startTime = Date.now();

    const dt = 1 / this.config.physicsRate;

    this.physicsInterval = setInterval(() => {
      this.updatePhysics(dt);
    }, dt * 1000);

    console.log(`[CubeRobot] Started at ${this.config.physicsRate} Hz`);
  }

  /**
   * Stop physics simulation
   */
  stop(): void {
    if (!this.running) return;

    this.running = false;

    if (this.physicsInterval) {
      clearInterval(this.physicsInterval);
      this.physicsInterval = null;
    }

    // Stop motors
    this.motors.leftPWM = 0;
    this.motors.rightPWM = 0;

    console.log('[CubeRobot] Stopped');
  }

  /**
   * Set motor speeds
   */
  drive(leftPWM: number, rightPWM: number): void {
    this.motors.leftPWM = Math.max(-255, Math.min(255, leftPWM));
    this.motors.rightPWM = Math.max(-255, Math.min(255, rightPWM));
  }

  /**
   * Stop motors
   */
  stopMotors(): void {
    this.motors.leftPWM = 0;
    this.motors.rightPWM = 0;
  }

  /**
   * Set LED color
   */
  setLED(r: number, g: number, b: number, brightness?: number): void {
    this.led.r = Math.max(0, Math.min(255, r));
    this.led.g = Math.max(0, Math.min(255, g));
    this.led.b = Math.max(0, Math.min(255, b));
    if (brightness !== undefined) {
      this.led.brightness = Math.max(0, Math.min(100, brightness));
    }
  }

  /**
   * Get current state
   */
  getState(): CubeRobotState {
    const collectibles = this.map.collectibles || [];
    const collectedIds = Array.from(this.collectedItems);
    const remainingIds = collectibles
      .filter(c => !this.collectedItems.has(c.id))
      .map(c => c.id);

    // Build dock zone status
    const dockZones = (this.map.dockZones || []).map(dz => ({
      id: dz.id,
      label: dz.label,
      x: dz.x,
      y: dz.y,
      width: dz.width,
      height: dz.height,
      color: dz.color,
      dockedObjectIds: this.pushableObjectStates
        .filter(obj => obj.dockedIn === dz.id)
        .map(obj => obj.id),
    }));

    return {
      pose: { ...this.pose },
      velocity: { ...this.velocity },
      motors: { ...this.motors },
      sensors: this.getSensorData(),
      led: { ...this.led },
      battery: this.getBatteryState(),
      timestamp: Date.now() - this.startTime,
      collectibles: collectibles.length > 0 ? {
        collected: collectedIds,
        remaining: remainingIds,
        totalPoints: this.totalPoints,
        totalCount: collectibles.length,
      } : undefined,
      pushableObjects: this.pushableObjectStates.length > 0
        ? this.pushableObjectStates.map(obj => ({ ...obj }))
        : undefined,
      dockZones: dockZones.length > 0 ? dockZones : undefined,
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
   * Check if running
   */
  isRunning(): boolean {
    return this.running;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PHYSICS SIMULATION
  // ═══════════════════════════════════════════════════════════════════════════

  private updatePhysics(dt: number): void {
    // Convert PWM to wheel velocities
    const leftVel = this.pwmToVelocity(this.motors.leftPWM);
    const rightVel = this.pwmToVelocity(this.motors.rightPWM);

    // Update motor RPM
    this.motors.leftRPM = (leftVel / (2 * Math.PI * ROBOT_SPECS.WHEEL_RADIUS)) * 60;
    this.motors.rightRPM = (rightVel / (2 * Math.PI * ROBOT_SPECS.WHEEL_RADIUS)) * 60;

    // Differential drive kinematics
    this.velocity.linear = (leftVel + rightVel) / 2;
    this.velocity.angular = (rightVel - leftVel) / ROBOT_SPECS.WHEEL_BASE;

    // Calculate new position
    const newRotation = this.normalizeAngle(this.pose.rotation + this.velocity.angular * dt);
    // Use sin for X and cos for Y so rotation=0 means facing +Y (forward in Three.js +Z)
    const newX = this.pose.x + this.velocity.linear * Math.sin(this.pose.rotation) * dt;
    const newY = this.pose.y + this.velocity.linear * Math.cos(this.pose.rotation) * dt;

    // Collision detection
    const collision = this.checkCollision(newX, newY);
    this.bumperState = collision;

    if (!collision.front && !collision.back) {
      this.pose.x = newX;
      this.pose.y = newY;
      this.pose.rotation = newRotation;
    } else {
      // Collision - notify and stop movement
      this.config.onCollision({ x: newX, y: newY });
    }

    // Clamp to bounds
    this.pose.x = Math.max(
      this.map.bounds.minX + ROBOT_SPECS.BODY_SIZE / 2,
      Math.min(this.map.bounds.maxX - ROBOT_SPECS.BODY_SIZE / 2, this.pose.x)
    );
    this.pose.y = Math.max(
      this.map.bounds.minY + ROBOT_SPECS.BODY_SIZE / 2,
      Math.min(this.map.bounds.maxY - ROBOT_SPECS.BODY_SIZE / 2, this.pose.y)
    );

    // Update encoders
    const leftDist = leftVel * dt;
    const rightDist = rightVel * dt;
    const ticksPerMeter = 1000; // Simplified encoder resolution

    this.encoders.left += Math.round(leftDist * ticksPerMeter);
    this.encoders.right += Math.round(rightDist * ticksPerMeter);

    // Update battery
    this.updateBattery(dt);

    // Check checkpoints
    this.checkCheckpoints();

    // Check collectibles
    this.checkCollectibles();

    // Update pushable objects physics
    this.updatePushableObjects(dt);

    // Check dock zones
    this.checkDockZones();

    // Notify state change
    this.config.onStateChange(this.getState());
  }

  private pwmToVelocity(pwm: number): number {
    // Motor deadband compensation
    // Real DC motors need ~40 PWM minimum to overcome static friction
    const MOTOR_DEADBAND = 40;

    // Apply deadband compensation: boost small non-zero values to minimum effective PWM
    let effectivePwm = pwm;
    if (pwm > 0 && pwm < MOTOR_DEADBAND) {
      effectivePwm = MOTOR_DEADBAND;
    } else if (pwm < 0 && pwm > -MOTOR_DEADBAND) {
      effectivePwm = -MOTOR_DEADBAND;
    }

    // Max velocity at PWM 255
    const maxVelocity = (ROBOT_SPECS.MAX_RPM / 60) * 2 * Math.PI * ROBOT_SPECS.WHEEL_RADIUS;
    return (effectivePwm / 255) * maxVelocity;
  }

  private normalizeAngle(angle: number): number {
    while (angle > Math.PI) angle -= 2 * Math.PI;
    while (angle < -Math.PI) angle += 2 * Math.PI;
    return angle;
  }

  private checkCollision(x: number, y: number): { front: boolean; back: boolean } {
    const robotRadius = ROBOT_SPECS.BODY_SIZE / 2;
    const wallHalfThickness = ROBOT_SPECS.WALL_THICKNESS / 2;
    let frontCollision = false;
    let backCollision = false;

    // Check walls - account for wall thickness (walls are no longer infinitely thin)
    for (const wall of this.map.walls) {
      const dist = this.pointToLineDistance(x, y, wall.x1, wall.y1, wall.x2, wall.y2);
      if (dist < robotRadius + wallHalfThickness) {
        // Determine if front or back collision
        const wallAngle = Math.atan2(wall.y2 - wall.y1, wall.x2 - wall.x1);
        const angleDiff = Math.abs(this.normalizeAngle(this.pose.rotation - wallAngle));

        if (angleDiff < Math.PI / 2) {
          frontCollision = true;
        } else {
          backCollision = true;
        }
      }
    }

    // Check obstacles
    for (const obs of this.map.obstacles) {
      const dist = Math.sqrt((x - obs.x) ** 2 + (y - obs.y) ** 2);
      if (dist < robotRadius + obs.radius) {
        const obstacleAngle = Math.atan2(obs.y - y, obs.x - x);
        const angleDiff = Math.abs(this.normalizeAngle(this.pose.rotation - obstacleAngle));

        if (angleDiff < Math.PI / 2) {
          frontCollision = true;
        } else {
          backCollision = true;
        }
      }
    }

    return { front: frontCollision, back: backCollision };
  }

  private updateBattery(dt: number): void {
    // Calculate current draw based on motor activity
    const motorLoad = (Math.abs(this.motors.leftPWM) + Math.abs(this.motors.rightPWM)) / 510;
    const baseCurrent = 50; // 50mA idle
    const motorCurrent = motorLoad * 500; // Up to 500mA at full throttle
    const ledCurrent = (this.led.brightness / 100) * 20; // Up to 20mA for LED

    const totalCurrent = baseCurrent + motorCurrent + ledCurrent;

    // Drain battery (convert mA to mAh)
    this.batteryMAh -= (totalCurrent * dt) / 3600;
    this.batteryMAh = Math.max(0, this.batteryMAh);

    // Update voltage based on capacity
    const percentage = (this.batteryMAh / ROBOT_SPECS.BATTERY_CAPACITY_MAH) * 100;
    this.batteryVoltage = 3.0 + (percentage / 100) * 1.2; // 3.0V - 4.2V range
  }

  private checkCheckpoints(): void {
    const checkpointRadius = 0.1; // 10cm

    for (let i = 0; i < this.map.checkpoints.length; i++) {
      if (this.checkpointsReached.has(i)) continue;

      const cp = this.map.checkpoints[i];
      const dist = Math.sqrt((this.pose.x - cp.x) ** 2 + (this.pose.y - cp.y) ** 2);

      if (dist < checkpointRadius) {
        this.checkpointsReached.add(i);
        this.config.onCheckpoint(i);
      }
    }
  }

  private checkCollectibles(): void {
    if (!this.map.collectibles) return;

    for (const collectible of this.map.collectibles) {
      if (this.collectedItems.has(collectible.id)) continue;

      const dist = Math.sqrt(
        (this.pose.x - collectible.x) ** 2 +
        (this.pose.y - collectible.y) ** 2
      );

      // Use collectible's radius or default to 8cm
      const collectionRadius = collectible.radius || 0.08;

      if (dist < collectionRadius + ROBOT_SPECS.BODY_SIZE / 2) {
        this.collectedItems.add(collectible.id);
        const points = collectible.points ?? 10;
        this.totalPoints += points;
        this.config.onCollectible(
          collectible,
          this.collectedItems.size,
          this.totalPoints
        );
      }
    }
  }

  /**
   * Get remaining collectibles (not yet collected)
   */
  getRemainingCollectibles(): Collectible[] {
    if (!this.map.collectibles) return [];
    return this.map.collectibles.filter(c => !this.collectedItems.has(c.id));
  }

  /**
   * Get collected items count and points
   */
  getCollectibleStats(): { collected: number; total: number; points: number } {
    const total = this.map.collectibles?.length ?? 0;
    return {
      collected: this.collectedItems.size,
      total,
      points: this.totalPoints,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PUSHABLE OBJECT PHYSICS
  // ═══════════════════════════════════════════════════════════════════════════

  private updatePushableObjects(dt: number): void {
    if (this.pushableObjectStates.length === 0) return;

    const robotHalf = ROBOT_SPECS.BODY_SIZE / 2;

    for (const obj of this.pushableObjectStates) {
      const objHalf = obj.size / 2;

      // Check robot-to-object collision using AABB (axis-aligned bounding box)
      // This matches the visual cube rendering instead of using circle-circle
      const overlapX = (robotHalf + objHalf) - Math.abs(obj.x - this.pose.x);
      const overlapY = (robotHalf + objHalf) - Math.abs(obj.y - this.pose.y);

      if (overlapX > 0 && overlapY > 0) {
        // AABB collision detected - push along the axis with least overlap
        const dx = obj.x - this.pose.x;
        const dy = obj.y - this.pose.y;

        // Determine push axis (smallest overlap = separation axis)
        let pushDirX = 0;
        let pushDirY = 0;
        let overlap = 0;

        if (overlapX < overlapY) {
          // Separate along X axis
          pushDirX = dx > 0 ? 1 : -1;
          overlap = overlapX;
        } else {
          // Separate along Y axis
          pushDirY = dy > 0 ? 1 : -1;
          overlap = overlapY;
        }

        // Push force based on robot velocity projected onto push direction
        const robotVx = this.velocity.linear * Math.sin(this.pose.rotation);
        const robotVy = this.velocity.linear * Math.cos(this.pose.rotation);
        const pushForce = robotVx * pushDirX + robotVy * pushDirY;

        if (pushForce > 0) {
          // Transfer momentum: robot pushes object
          const pushStrength = (ROBOT_SPECS.MASS * pushForce) / obj.mass;
          obj.vx += pushDirX * pushStrength * dt * 20;
          obj.vy += pushDirY * pushStrength * dt * 20;
        }

        // Separate robot and object to prevent overlap
        obj.x += pushDirX * overlap * 0.5;
        obj.y += pushDirY * overlap * 0.5;
      }

      // Apply friction to slow down object
      const speed = Math.sqrt(obj.vx * obj.vx + obj.vy * obj.vy);
      if (speed > 0.001) {
        const frictionDecel = obj.friction * 9.81 * dt; // friction * gravity * dt
        const newSpeed = Math.max(0, speed - frictionDecel);
        const ratio = newSpeed / speed;
        obj.vx *= ratio;
        obj.vy *= ratio;
      } else {
        obj.vx = 0;
        obj.vy = 0;
      }

      // Update object position
      obj.x += obj.vx * dt;
      obj.y += obj.vy * dt;

      // Clamp to bounds
      obj.x = Math.max(
        this.map.bounds.minX + objHalf,
        Math.min(this.map.bounds.maxX - objHalf, obj.x)
      );
      obj.y = Math.max(
        this.map.bounds.minY + objHalf,
        Math.min(this.map.bounds.maxY - objHalf, obj.y)
      );

      // Bounce off walls (use half-size for box collision + wall thickness)
      const wallHalfThick = ROBOT_SPECS.WALL_THICKNESS / 2;
      for (const wall of this.map.walls) {
        const wallDist = this.pointToLineDistance(obj.x, obj.y, wall.x1, wall.y1, wall.x2, wall.y2);
        if (wallDist < objHalf + wallHalfThick) {
          // Reflect velocity off wall normal
          const wallDx = wall.x2 - wall.x1;
          const wallDy = wall.y2 - wall.y1;
          const wallLen = Math.sqrt(wallDx * wallDx + wallDy * wallDy);
          if (wallLen > 0) {
            const normalX = -wallDy / wallLen;
            const normalY = wallDx / wallLen;
            const dotProduct = obj.vx * normalX + obj.vy * normalY;
            obj.vx -= 2 * dotProduct * normalX * 0.5; // Damped reflection
            obj.vy -= 2 * dotProduct * normalY * 0.5;
          }
        }
      }

      // Bounce off obstacles
      for (const obs of this.map.obstacles) {
        const obsDist = Math.sqrt((obj.x - obs.x) ** 2 + (obj.y - obs.y) ** 2);
        if (obsDist < objHalf + obs.radius && obsDist > 0.001) {
          const normalX = (obj.x - obs.x) / obsDist;
          const normalY = (obj.y - obs.y) / obsDist;
          // Push object out of obstacle
          const obsOverlap = objHalf + obs.radius - obsDist;
          obj.x += normalX * obsOverlap;
          obj.y += normalY * obsOverlap;
          // Damped reflection
          const dotProduct = obj.vx * normalX + obj.vy * normalY;
          if (dotProduct < 0) {
            obj.vx -= 2 * dotProduct * normalX * 0.5;
            obj.vy -= 2 * dotProduct * normalY * 0.5;
          }
        }
      }
    }
  }

  private checkDockZones(): void {
    if (!this.map.dockZones || this.pushableObjectStates.length === 0) return;

    for (const obj of this.pushableObjectStates) {
      const objRadius = obj.size / 2;
      let currentDock: string | undefined = undefined;

      for (const dz of this.map.dockZones) {
        // Check if the center of the object is within the dock zone
        const inZone =
          obj.x >= dz.x - dz.width / 2 + objRadius &&
          obj.x <= dz.x + dz.width / 2 - objRadius &&
          obj.y >= dz.y - dz.height / 2 + objRadius &&
          obj.y <= dz.y + dz.height / 2 - objRadius;

        if (inZone) {
          currentDock = dz.id;
          // Notify if newly docked
          if (!this.dockedObjects.has(obj.id) || this.dockedObjects.get(obj.id) !== dz.id) {
            this.dockedObjects.set(obj.id, dz.id);
            this.config.onObjectDocked(obj.id, dz.id);
          }
          break;
        }
      }

      obj.dockedIn = currentDock;
      if (!currentDock) {
        this.dockedObjects.delete(obj.id);
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SENSOR SIMULATION
  // ═══════════════════════════════════════════════════════════════════════════

  private getSensorData(): SensorData {
    return {
      distance: this.getDistanceSensors(),
      line: this.getLineSensors(),
      imu: this.getIMUData(),
      bumper: { ...this.bumperState },
      encoders: { ...this.encoders },
      nearbyCollectibles: this.getNearbyCollectibles(),
      nearbyPushables: this.getNearbyPushables(),
      nearbyDockZones: this.getNearbyDockZones(),
      velocity: { ...this.velocity }, // Include velocity for trajectory prediction
    };
  }

  /**
   * Get nearby collectibles within sensor range (2m)
   * Returns up to 5 closest uncollected items
   */
  private getNearbyCollectibles(): SensorData['nearbyCollectibles'] {
    if (!this.map.collectibles) return undefined;

    const maxRange = 2.0; // 2 meter detection range
    const maxItems = 5;   // Return up to 5 items

    const nearby: { id: string; type: string; distance: number; angle: number; points: number }[] = [];

    for (const collectible of this.map.collectibles) {
      // Skip already collected items
      if (this.collectedItems.has(collectible.id)) continue;

      // Calculate distance
      const dx = collectible.x - this.pose.x;
      const dy = collectible.y - this.pose.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      // Only include items within range
      if (distance > maxRange) continue;

      // Calculate angle relative to robot heading
      const absoluteAngle = Math.atan2(dy, dx);
      let relativeAngle = absoluteAngle - this.pose.rotation;

      // Normalize to -PI to PI
      while (relativeAngle > Math.PI) relativeAngle -= 2 * Math.PI;
      while (relativeAngle < -Math.PI) relativeAngle += 2 * Math.PI;

      nearby.push({
        id: collectible.id,
        type: collectible.type,
        distance: Math.round(distance * 100), // Convert to cm
        angle: Math.round(relativeAngle * 180 / Math.PI), // Convert to degrees
        points: collectible.points ?? 10,
      });
    }

    // Sort by distance and return top N
    nearby.sort((a, b) => a.distance - b.distance);
    return nearby.slice(0, maxItems);
  }

  /**
   * Get nearby pushable objects within sensor range (2m)
   */
  private getNearbyPushables(): SensorData['nearbyPushables'] {
    if (this.pushableObjectStates.length === 0) return undefined;

    const maxRange = 2.0;
    const nearby: { id: string; label: string; distance: number; angle: number; color: string; dockedIn?: string }[] = [];

    for (const obj of this.pushableObjectStates) {
      const dx = obj.x - this.pose.x;
      const dy = obj.y - this.pose.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance > maxRange) continue;

      // Calculate angle relative to robot heading
      // In this coordinate system: forward = (sin(θ), cos(θ))
      const absoluteAngle = Math.atan2(dx, dy);
      let relativeAngle = absoluteAngle - this.pose.rotation;
      while (relativeAngle > Math.PI) relativeAngle -= 2 * Math.PI;
      while (relativeAngle < -Math.PI) relativeAngle += 2 * Math.PI;

      nearby.push({
        id: obj.id,
        label: obj.label || obj.id,
        distance: Math.round(distance * 100),
        angle: Math.round(relativeAngle * 180 / Math.PI),
        color: obj.color,
        dockedIn: obj.dockedIn,
      });
    }

    nearby.sort((a, b) => a.distance - b.distance);
    return nearby.length > 0 ? nearby : undefined;
  }

  /**
   * Get nearby dock zones within sensor range (3m)
   */
  private getNearbyDockZones(): SensorData['nearbyDockZones'] {
    if (!this.map.dockZones || this.map.dockZones.length === 0) return undefined;

    const maxRange = 3.0;
    const nearby: { id: string; label: string; distance: number; angle: number; color: string; hasObject: boolean }[] = [];

    for (const dz of this.map.dockZones) {
      const dx = dz.x - this.pose.x;
      const dy = dz.y - this.pose.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance > maxRange) continue;

      const absoluteAngle = Math.atan2(dx, dy);
      let relativeAngle = absoluteAngle - this.pose.rotation;
      while (relativeAngle > Math.PI) relativeAngle -= 2 * Math.PI;
      while (relativeAngle < -Math.PI) relativeAngle += 2 * Math.PI;

      const hasObject = this.pushableObjectStates.some(obj => obj.dockedIn === dz.id);

      nearby.push({
        id: dz.id,
        label: dz.label || dz.id,
        distance: Math.round(distance * 100),
        angle: Math.round(relativeAngle * 180 / Math.PI),
        color: dz.color,
        hasObject,
      });
    }

    nearby.sort((a, b) => a.distance - b.distance);
    return nearby.length > 0 ? nearby : undefined;
  }

  private getDistanceSensors(): SensorData['distance'] {
    const sensorAngles = {
      front: 0,
      frontLeft: -Math.PI / 4,
      frontRight: Math.PI / 4,
      left: -Math.PI / 2,
      right: Math.PI / 2,
      back: Math.PI,
      backLeft: -3 * Math.PI / 4,
      backRight: 3 * Math.PI / 4,
    };

    const result: SensorData['distance'] = {} as any;

    for (const [name, angle] of Object.entries(sensorAngles)) {
      const worldAngle = this.pose.rotation + angle;
      const distance = this.raycast(this.pose.x, this.pose.y, worldAngle, ROBOT_SPECS.DISTANCE_MAX);
      result[name as keyof SensorData['distance']] = Math.round(distance * 100); // Convert to cm
    }

    return result;
  }

  private raycast(x: number, y: number, angle: number, maxDist: number): number {
    let minDist = maxDist;
    const wallHalfThickness = ROBOT_SPECS.WALL_THICKNESS / 2;

    // Check walls - subtract half wall thickness so ray hits the wall surface
    for (const wall of this.map.walls) {
      const dist = this.rayLineIntersection(x, y, angle, wall.x1, wall.y1, wall.x2, wall.y2);
      if (dist !== null) {
        const surfaceDist = Math.max(0, dist - wallHalfThickness);
        if (surfaceDist < minDist) {
          minDist = surfaceDist;
        }
      }
    }

    // Check obstacles
    for (const obs of this.map.obstacles) {
      const dist = this.rayCircleIntersection(x, y, angle, obs.x, obs.y, obs.radius);
      if (dist !== null && dist < minDist) {
        minDist = dist;
      }
    }

    // Check pushable objects using AABB ray intersection (matches cube visual)
    for (const obj of this.pushableObjectStates) {
      const dist = this.rayBoxIntersection(x, y, angle, obj.x, obj.y, obj.size);
      if (dist !== null && dist < minDist) {
        minDist = dist;
      }
    }

    // Add noise
    minDist += (Math.random() - 0.5) * 0.01; // +/- 0.5cm noise

    return Math.max(0, Math.min(maxDist, minDist));
  }

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
   * Ray-AABB intersection for cube pushable objects.
   * Uses slab method for axis-aligned bounding box intersection.
   */
  private rayBoxIntersection(
    rx: number, ry: number, angle: number,
    bx: number, by: number, size: number
  ): number | null {
    const half = size / 2;
    const minX = bx - half;
    const maxX = bx + half;
    const minY = by - half;
    const maxY = by + half;

    // Ray direction: sin for X, cos for Y (angle=0 faces +Y)
    const dx = Math.sin(angle);
    const dy = Math.cos(angle);

    let tmin = -Infinity;
    let tmax = Infinity;

    // X slab
    if (Math.abs(dx) > 1e-8) {
      const t1 = (minX - rx) / dx;
      const t2 = (maxX - rx) / dx;
      const tlo = Math.min(t1, t2);
      const thi = Math.max(t1, t2);
      tmin = Math.max(tmin, tlo);
      tmax = Math.min(tmax, thi);
    } else {
      // Ray parallel to X slab
      if (rx < minX || rx > maxX) return null;
    }

    // Y slab
    if (Math.abs(dy) > 1e-8) {
      const t1 = (minY - ry) / dy;
      const t2 = (maxY - ry) / dy;
      const tlo = Math.min(t1, t2);
      const thi = Math.max(t1, t2);
      tmin = Math.max(tmin, tlo);
      tmax = Math.min(tmax, thi);
    } else {
      // Ray parallel to Y slab
      if (ry < minY || ry > maxY) return null;
    }

    if (tmax < 0 || tmin > tmax) return null;

    // Return the nearest positive intersection
    const t = tmin >= 0 ? tmin : tmax;
    return t >= 0 ? t : null;
  }

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

  private getLineSensors(): number[] {
    const sensors: number[] = [];
    const sensorSpacing = ROBOT_SPECS.LINE_SENSOR_WIDTH / (ROBOT_SPECS.LINE_SENSOR_COUNT - 1);
    const sensorOffset = 0.04; // 4cm in front of robot center

    for (let i = 0; i < ROBOT_SPECS.LINE_SENSOR_COUNT; i++) {
      const localX = sensorOffset;
      const localY = (i - 2) * sensorSpacing; // Center sensor at index 2

      // Transform to world coordinates (sin for X, cos for Y so rotation=0 means facing +Y)
      const cos = Math.cos(this.pose.rotation);
      const sin = Math.sin(this.pose.rotation);
      const worldX = this.pose.x + localX * sin + localY * cos;
      const worldY = this.pose.y + localX * cos - localY * sin;

      // Check if on any line
      const onLine = this.isPointOnLine(worldX, worldY);
      sensors.push(onLine ? 255 : 0);
    }

    return sensors;
  }

  private isPointOnLine(x: number, y: number): boolean {
    for (const line of this.map.lines) {
      for (let i = 0; i < line.points.length - 1; i++) {
        const p1 = line.points[i];
        const p2 = line.points[i + 1];
        const dist = this.pointToLineDistance(x, y, p1.x, p1.y, p2.x, p2.y);
        if (dist < line.width / 2) {
          return true;
        }
      }
    }
    return false;
  }

  private getIMUData(): SensorData['imu'] {
    // Add noise to simulate real IMU
    const accelNoise = () => (Math.random() - 0.5) * 0.1;
    const gyroNoise = () => (Math.random() - 0.5) * 0.05;

    return {
      accel: {
        // Use sin for X and cos for Y so rotation=0 means facing +Y (forward in Three.js +Z)
        x: this.velocity.linear * Math.sin(this.pose.rotation) + accelNoise(),
        y: this.velocity.linear * Math.cos(this.pose.rotation) + accelNoise(),
        z: 9.81 + accelNoise(), // Gravity
      },
      gyro: {
        x: gyroNoise(),
        y: gyroNoise(),
        z: this.velocity.angular + gyroNoise(),
      },
      heading: this.pose.rotation * 180 / Math.PI,
    };
  }

  private getBatteryState(): BatteryState {
    return {
      voltage: Math.round(this.batteryVoltage * 100) / 100,
      percentage: Math.round((this.batteryMAh / ROBOT_SPECS.BATTERY_CAPACITY_MAH) * 100),
      charging: false,
      current: Math.round((Math.abs(this.motors.leftPWM) + Math.abs(this.motors.rightPWM)) / 510 * 500),
    };
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    this.stop();
  }
}

/**
 * Create a new cube robot simulator
 */
export function createCubeRobotSimulator(config?: CubeRobotConfig): CubeRobotSimulator {
  return new CubeRobotSimulator(config);
}

// ═══════════════════════════════════════════════════════════════════════════
// PRESET FLOOR MAPS
// ═══════════════════════════════════════════════════════════════════════════

export const FLOOR_MAPS = {
  /**
   * Simple oval track for line following
   */
  ovalTrack: (): FloorMap => ({
    bounds: { minX: -1, maxX: 1, minY: -1, maxY: 1 },
    walls: [
      { x1: -1, y1: -1, x2: 1, y2: -1 },
      { x1: 1, y1: -1, x2: 1, y2: 1 },
      { x1: 1, y1: 1, x2: -1, y2: 1 },
      { x1: -1, y1: 1, x2: -1, y2: -1 },
    ],
    obstacles: [],
    lines: [{
      points: [
        { x: -0.6, y: 0 },
        { x: -0.5, y: 0.4 },
        { x: 0, y: 0.6 },
        { x: 0.5, y: 0.4 },
        { x: 0.6, y: 0 },
        { x: 0.5, y: -0.4 },
        { x: 0, y: -0.6 },
        { x: -0.5, y: -0.4 },
        { x: -0.6, y: 0 },
      ],
      width: 0.025,
      color: '#000000',
    }],
    checkpoints: [
      { x: 0.6, y: 0 },
      { x: 0, y: 0.6 },
      { x: -0.6, y: 0 },
      { x: 0, y: -0.6 },
    ],
    startPosition: { x: 0, y: 0, rotation: 0 },
  }),

  /**
   * Maze with obstacles
   */
  maze: (): FloorMap => ({
    bounds: { minX: -1, maxX: 1, minY: -1, maxY: 1 },
    walls: [
      // Outer walls
      { x1: -1, y1: -1, x2: 1, y2: -1 },
      { x1: 1, y1: -1, x2: 1, y2: 1 },
      { x1: 1, y1: 1, x2: -1, y2: 1 },
      { x1: -1, y1: 1, x2: -1, y2: -1 },
      // Inner walls
      { x1: -0.5, y1: -0.5, x2: -0.5, y2: 0.2 },
      { x1: 0, y1: -0.3, x2: 0, y2: 0.5 },
      { x1: 0.5, y1: -0.2, x2: 0.5, y2: 0.8 },
      { x1: -0.8, y1: 0.5, x2: 0.2, y2: 0.5 },
    ],
    obstacles: [
      { x: 0.3, y: -0.5, radius: 0.1 },
      { x: -0.3, y: 0.7, radius: 0.08 },
    ],
    lines: [],
    checkpoints: [
      { x: 0.8, y: 0.8 },
    ],
    startPosition: { x: -0.8, y: -0.8, rotation: Math.PI / 4 },
  }),

  /**
   * Figure-8 track
   */
  figure8: (): FloorMap => {
    const points: Vector2D[] = [];
    // Generate smooth figure-8 using parametric equations
    for (let t = 0; t <= 2 * Math.PI; t += 0.1) {
      const x = 0.5 * Math.sin(t);
      const y = 0.3 * Math.sin(2 * t);
      points.push({ x, y });
    }
    points.push(points[0]); // Close the loop

    return {
      bounds: { minX: -1, maxX: 1, minY: -1, maxY: 1 },
      walls: [
        { x1: -1, y1: -1, x2: 1, y2: -1 },
        { x1: 1, y1: -1, x2: 1, y2: 1 },
        { x1: 1, y1: 1, x2: -1, y2: 1 },
        { x1: -1, y1: 1, x2: -1, y2: -1 },
      ],
      obstacles: [],
      lines: [{
        points,
        width: 0.025,
        color: '#000000',
      }],
      checkpoints: [
        { x: 0.5, y: 0 },
        { x: -0.5, y: 0 },
      ],
      startPosition: { x: 0, y: 0, rotation: 0 },
    };
  },

  /**
   * Empty arena for obstacle avoidance testing
   */
  obstacleArena: (): FloorMap => ({
    bounds: { minX: -1.5, maxX: 1.5, minY: -1.5, maxY: 1.5 },
    walls: [
      { x1: -1.5, y1: -1.5, x2: 1.5, y2: -1.5 },
      { x1: 1.5, y1: -1.5, x2: 1.5, y2: 1.5 },
      { x1: 1.5, y1: 1.5, x2: -1.5, y2: 1.5 },
      { x1: -1.5, y1: 1.5, x2: -1.5, y2: -1.5 },
    ],
    obstacles: [
      { x: -0.7, y: -0.7, radius: 0.15 },
      { x: 0.7, y: -0.7, radius: 0.12 },
      { x: 0, y: 0, radius: 0.2 },
      { x: -0.7, y: 0.7, radius: 0.1 },
      { x: 0.7, y: 0.7, radius: 0.18 },
      { x: -0.3, y: 0.3, radius: 0.08 },
      { x: 0.3, y: -0.3, radius: 0.08 },
    ],
    lines: [],
    checkpoints: [
      { x: 1.2, y: 1.2 },
      { x: -1.2, y: 1.2 },
      { x: -1.2, y: -1.2 },
      { x: 1.2, y: -1.2 },
    ],
    startPosition: { x: 0, y: -1.2, rotation: Math.PI / 2 },
  }),

  // ═══════════════════════════════════════════════════════════════════════════
  // STANDARD 5m x 5m ARENA MAPS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Standard 5m x 5m empty arena
   * Patrol challenge - open space for rectangular patrol patterns
   * Checkpoints at corners for 90-degree turn patrol behavior
   */
  standard5x5Empty: (): FloorMap => ({
    bounds: { minX: -2.5, maxX: 2.5, minY: -2.5, maxY: 2.5 },
    walls: [
      { x1: -2.5, y1: -2.5, x2: 2.5, y2: -2.5 },  // Bottom
      { x1: 2.5, y1: -2.5, x2: 2.5, y2: 2.5 },    // Right
      { x1: 2.5, y1: 2.5, x2: -2.5, y2: 2.5 },    // Top
      { x1: -2.5, y1: 2.5, x2: -2.5, y2: -2.5 },  // Left
    ],
    obstacles: [],
    lines: [],
    checkpoints: [
      // Corner checkpoints for rectangular patrol pattern
      // Patrol sequence: start -> bottom-right -> top-right -> top-left -> bottom-left -> repeat
      { x: 2.0, y: -2.0 },   // Bottom-right corner (1st waypoint)
      { x: 2.0, y: 2.0 },    // Top-right corner (2nd waypoint)
      { x: -2.0, y: 2.0 },   // Top-left corner (3rd waypoint)
      { x: -2.0, y: -2.0 },  // Bottom-left corner (4th waypoint / return to start)
    ],
    startPosition: { x: -2.0, y: -2.0, rotation: 0 },  // Start at bottom-left, facing right
  }),

  /**
   * Standard 5m x 5m arena with obstacles
   * Exploration challenge - obstacles distributed to create interesting navigation paths
   * Robot must explore while avoiding obstacles of varying sizes
   */
  standard5x5Obstacles: (): FloorMap => ({
    bounds: { minX: -2.5, maxX: 2.5, minY: -2.5, maxY: 2.5 },
    walls: [
      { x1: -2.5, y1: -2.5, x2: 2.5, y2: -2.5 },
      { x1: 2.5, y1: -2.5, x2: 2.5, y2: 2.5 },
      { x1: 2.5, y1: 2.5, x2: -2.5, y2: 2.5 },
      { x1: -2.5, y1: 2.5, x2: -2.5, y2: -2.5 },
    ],
    obstacles: [
      // Large central obstacle - forces navigation around
      { x: 0, y: 0, radius: 0.35 },

      // Quadrant obstacles - creates four exploration zones
      // Bottom-left quadrant
      { x: -1.2, y: -1.2, radius: 0.25 },
      { x: -0.5, y: -1.8, radius: 0.15 },

      // Bottom-right quadrant
      { x: 1.2, y: -1.2, radius: 0.20 },
      { x: 1.8, y: -0.5, radius: 0.18 },

      // Top-right quadrant
      { x: 1.2, y: 1.2, radius: 0.25 },
      { x: 0.5, y: 1.8, radius: 0.15 },

      // Top-left quadrant
      { x: -1.2, y: 1.2, radius: 0.20 },
      { x: -1.8, y: 0.5, radius: 0.18 },

      // Mid-range obstacles - creates corridors between quadrants
      { x: 0, y: 1.2, radius: 0.12 },
      { x: 0, y: -1.2, radius: 0.12 },
      { x: 1.2, y: 0, radius: 0.12 },
      { x: -1.2, y: 0, radius: 0.12 },
    ],
    lines: [],
    checkpoints: [
      // Multiple exploration targets - one in each quadrant
      { x: -1.8, y: -1.8 },   // Bottom-left
      { x: 1.8, y: -1.8 },    // Bottom-right
      { x: 1.8, y: 1.8 },     // Top-right (primary goal)
      { x: -1.8, y: 1.8 },    // Top-left
    ],
    startPosition: { x: 0, y: -2.0, rotation: Math.PI / 2 },  // Start at bottom center, facing up
  }),

  /**
   * Standard 5m x 5m oval line track
   * Line following challenge
   */
  standard5x5LineTrack: (): FloorMap => {
    const points: Vector2D[] = [];
    // Create smooth oval using bezier-like curve
    const segments = 40;
    for (let i = 0; i <= segments; i++) {
      const t = (i / segments) * 2 * Math.PI;
      const x = 1.8 * Math.cos(t);
      const y = 1.2 * Math.sin(t);
      points.push({ x, y });
    }

    return {
      bounds: { minX: -2.5, maxX: 2.5, minY: -2.5, maxY: 2.5 },
      walls: [
        { x1: -2.5, y1: -2.5, x2: 2.5, y2: -2.5 },
        { x1: 2.5, y1: -2.5, x2: 2.5, y2: 2.5 },
        { x1: 2.5, y1: 2.5, x2: -2.5, y2: 2.5 },
        { x1: -2.5, y1: 2.5, x2: -2.5, y2: -2.5 },
      ],
      obstacles: [],
      lines: [{
        points,
        width: 0.05,  // 5cm wide line for better visibility and sensor detection
        color: '#ffffff',  // White line for high contrast on dark floor
      }],
      checkpoints: [
        { x: 1.8, y: 0 },     // Right
        { x: 0, y: 1.2 },     // Top
        { x: -1.8, y: 0 },    // Left
        { x: 0, y: -1.2 },    // Bottom
      ],
      startPosition: { x: 1.8, y: 0, rotation: Math.PI / 2 },  // Start on the track, facing along it
    };
  },

  /**
   * Standard 5m x 5m maze
   * Wall-following challenge - designed for right-hand rule navigation
   * All walls are connected to form proper corridors with a solvable path
   * from start (bottom-left) to goal (top-right)
   */
  standard5x5Maze: (): FloorMap => ({
    bounds: { minX: -2.5, maxX: 2.5, minY: -2.5, maxY: 2.5 },
    walls: [
      // Outer walls (boundary)
      { x1: -2.5, y1: -2.5, x2: 2.5, y2: -2.5 },   // Bottom
      { x1: 2.5, y1: -2.5, x2: 2.5, y2: 2.5 },     // Right
      { x1: 2.5, y1: 2.5, x2: -2.5, y2: 2.5 },     // Top
      { x1: -2.5, y1: 2.5, x2: -2.5, y2: -2.5 },   // Left

      // Inner maze walls - all connected to form proper corridors
      // Row 1: Bottom section corridor walls
      { x1: -1.5, y1: -2.5, x2: -1.5, y2: -1.5 },  // Vertical from bottom
      { x1: -1.5, y1: -1.5, x2: 0.5, y2: -1.5 },   // Horizontal connector
      { x1: 0.5, y1: -2.5, x2: 0.5, y2: -1.5 },    // Vertical from bottom

      // Row 2: Middle-lower section
      { x1: -2.5, y1: -0.5, x2: -0.5, y2: -0.5 },  // Horizontal from left wall
      { x1: -0.5, y1: -0.5, x2: -0.5, y2: 0.5 },   // Vertical connector
      { x1: 1.5, y1: -1.5, x2: 1.5, y2: 0.5 },     // Vertical barrier
      { x1: 1.5, y1: -1.5, x2: 2.5, y2: -1.5 },    // Horizontal to right wall

      // Row 3: Middle-upper section
      { x1: -1.5, y1: 0.5, x2: 0.5, y2: 0.5 },     // Horizontal segment
      { x1: -1.5, y1: 0.5, x2: -1.5, y2: 1.5 },    // Vertical up
      { x1: 0.5, y1: 0.5, x2: 0.5, y2: 1.5 },      // Vertical up

      // Row 4: Upper section
      { x1: -2.5, y1: 1.5, x2: -1.5, y2: 1.5 },    // Horizontal from left
      { x1: 0.5, y1: 1.5, x2: 1.5, y2: 1.5 },      // Horizontal middle
      { x1: 1.5, y1: 1.5, x2: 1.5, y2: 2.5 },      // Vertical to top
    ],
    obstacles: [],  // No obstacles - pure maze navigation
    lines: [],
    checkpoints: [
      { x: 2.0, y: 2.0 },  // Top-right goal
    ],
    startPosition: { x: -2.0, y: -2.0, rotation: 0 },  // Start facing right (along the wall)
  }),

  /**
   * Standard 5m x 5m figure-8 track
   * Advanced line following challenge
   */
  standard5x5Figure8: (): FloorMap => {
    const points: Vector2D[] = [];
    // Generate smooth figure-8 using parametric equations
    // Scaled for 5m x 5m arena
    const segments = 60;
    for (let i = 0; i <= segments; i++) {
      const t = (i / segments) * 2 * Math.PI;
      const x = 1.5 * Math.sin(t);
      const y = 1.0 * Math.sin(2 * t);
      points.push({ x, y });
    }

    return {
      bounds: { minX: -2.5, maxX: 2.5, minY: -2.5, maxY: 2.5 },
      walls: [
        { x1: -2.5, y1: -2.5, x2: 2.5, y2: -2.5 },
        { x1: 2.5, y1: -2.5, x2: 2.5, y2: 2.5 },
        { x1: 2.5, y1: 2.5, x2: -2.5, y2: 2.5 },
        { x1: -2.5, y1: 2.5, x2: -2.5, y2: -2.5 },
      ],
      obstacles: [],
      lines: [{
        points,
        width: 0.05,  // 5cm wide line for better visibility
        color: '#ffffff',  // White line for high contrast on dark floor
      }],
      checkpoints: [
        { x: 1.5, y: 0 },     // Right loop
        { x: -1.5, y: 0 },    // Left loop
        { x: 0, y: 1.0 },     // Top crossing
        { x: 0, y: -1.0 },    // Bottom crossing
      ],
      startPosition: { x: 1.5, y: 0, rotation: Math.PI / 2 },  // Start on the track
    };
  },

  /**
   * Standard 5m x 5m delivery challenge
   * Navigate to 4 corners in sequence
   */
  standard5x5Delivery: (): FloorMap => ({
    bounds: { minX: -2.5, maxX: 2.5, minY: -2.5, maxY: 2.5 },
    walls: [
      { x1: -2.5, y1: -2.5, x2: 2.5, y2: -2.5 },
      { x1: 2.5, y1: -2.5, x2: 2.5, y2: 2.5 },
      { x1: 2.5, y1: 2.5, x2: -2.5, y2: 2.5 },
      { x1: -2.5, y1: 2.5, x2: -2.5, y2: -2.5 },
    ],
    obstacles: [
      // Center obstacle to force pathfinding
      { x: 0, y: 0, radius: 0.4 },
      // Minor obstacles near corners
      { x: -1.2, y: -1.2, radius: 0.15 },
      { x: 1.2, y: -1.2, radius: 0.15 },
      { x: 1.2, y: 1.2, radius: 0.15 },
      { x: -1.2, y: 1.2, radius: 0.15 },
    ],
    lines: [],
    checkpoints: [
      { x: 2.0, y: -2.0 },   // Bottom-right (1st delivery)
      { x: 2.0, y: 2.0 },    // Top-right (2nd delivery)
      { x: -2.0, y: 2.0 },   // Top-left (3rd delivery)
      { x: -2.0, y: -2.0 },  // Bottom-left (4th delivery)
    ],
    startPosition: { x: 0, y: 0, rotation: 0 },
  }),

  /**
   * Standard 5m x 5m coin collection challenge
   * Goal: Collect all coins scattered around the arena
   * Features gold coins worth 10 points each
   */
  standard5x5CoinCollection: (): FloorMap => ({
    bounds: { minX: -2.5, maxX: 2.5, minY: -2.5, maxY: 2.5 },
    walls: [
      { x1: -2.5, y1: -2.5, x2: 2.5, y2: -2.5 },
      { x1: 2.5, y1: -2.5, x2: 2.5, y2: 2.5 },
      { x1: 2.5, y1: 2.5, x2: -2.5, y2: 2.5 },
      { x1: -2.5, y1: 2.5, x2: -2.5, y2: -2.5 },
    ],
    obstacles: [
      // Some obstacles to make navigation interesting
      { x: 0, y: 0, radius: 0.3 },
      { x: -1.5, y: 0, radius: 0.2 },
      { x: 1.5, y: 0, radius: 0.2 },
      { x: 0, y: 1.5, radius: 0.2 },
      { x: 0, y: -1.5, radius: 0.2 },
    ],
    lines: [],
    checkpoints: [],
    collectibles: [
      // Corner coins (easy to find)
      { id: 'coin-1', type: 'coin', x: 2.0, y: 2.0, radius: 0.08, color: '#FFD700', points: 10 },
      { id: 'coin-2', type: 'coin', x: -2.0, y: 2.0, radius: 0.08, color: '#FFD700', points: 10 },
      { id: 'coin-3', type: 'coin', x: 2.0, y: -2.0, radius: 0.08, color: '#FFD700', points: 10 },
      { id: 'coin-4', type: 'coin', x: -2.0, y: -2.0, radius: 0.08, color: '#FFD700', points: 10 },
      // Mid-edge coins
      { id: 'coin-5', type: 'coin', x: 0, y: 2.2, radius: 0.08, color: '#FFD700', points: 10 },
      { id: 'coin-6', type: 'coin', x: 0, y: -2.2, radius: 0.08, color: '#FFD700', points: 10 },
      { id: 'coin-7', type: 'coin', x: 2.2, y: 0, radius: 0.08, color: '#FFD700', points: 10 },
      { id: 'coin-8', type: 'coin', x: -2.2, y: 0, radius: 0.08, color: '#FFD700', points: 10 },
      // Inner ring coins (require navigation around obstacles)
      { id: 'coin-9', type: 'coin', x: 1.0, y: 1.0, radius: 0.08, color: '#FFD700', points: 10 },
      { id: 'coin-10', type: 'coin', x: -1.0, y: 1.0, radius: 0.08, color: '#FFD700', points: 10 },
      { id: 'coin-11', type: 'coin', x: 1.0, y: -1.0, radius: 0.08, color: '#FFD700', points: 10 },
      { id: 'coin-12', type: 'coin', x: -1.0, y: -1.0, radius: 0.08, color: '#FFD700', points: 10 },
    ],
    startPosition: { x: 0, y: -2.0, rotation: Math.PI / 2 },  // Start at bottom, facing up
  }),

  /**
   * Standard 5m x 5m ball transport challenge
   * Goal: Push the ball from start to the target zone
   * Features a single ball that must be transported
   */
  standard5x5BallTransport: (): FloorMap => ({
    bounds: { minX: -2.5, maxX: 2.5, minY: -2.5, maxY: 2.5 },
    walls: [
      { x1: -2.5, y1: -2.5, x2: 2.5, y2: -2.5 },
      { x1: 2.5, y1: -2.5, x2: 2.5, y2: 2.5 },
      { x1: 2.5, y1: 2.5, x2: -2.5, y2: 2.5 },
      { x1: -2.5, y1: 2.5, x2: -2.5, y2: -2.5 },
    ],
    obstacles: [
      // Obstacles creating a path challenge
      { x: -1.0, y: 0, radius: 0.25 },
      { x: 1.0, y: 0, radius: 0.25 },
    ],
    lines: [],
    checkpoints: [
      // Target zone for ball delivery
      { x: 0, y: 2.0 },
    ],
    collectibles: [
      // The ball to transport (larger radius, different type)
      { id: 'ball-1', type: 'ball', x: 0, y: -1.5, radius: 0.12, color: '#FF6B6B', points: 100 },
    ],
    startPosition: { x: 0, y: -2.2, rotation: Math.PI / 2 },  // Start behind the ball
  }),

  /**
   * Standard 5m x 5m cube physics challenge
   * Goal: Find the red cube, navigate to it, and push it close to the yellow cube
   * Features physics-based pushing mechanics with a pushable red cube (~robot size)
   * and a green dock zone target area in a visible corner
   */
  standard5x5CubePhysics: (): FloorMap => {
    const margin = 0.4; // Margin from walls
    const minX = -2.5 + margin;
    const maxX = 2.5 - margin;
    const minY = -2.5 + margin;
    const maxY = 2.5 - margin;

    // Generate random position for the Yellow Cube (target landmark)
    // Must be away from Red Cube (0,0) and obstacles
    const yellowCubeExclusions = [
      { x: 0, y: 0, radius: 1.0 },       // Red cube + large margin to ensure separation
      { x: -1.2, y: 0.5, radius: 0.5 },  // Obstacle 1 + margin
      { x: 1.0, y: -0.8, radius: 0.5 },  // Obstacle 2 + margin
    ];
    let yellowX = 1.5, yellowY = 1.5;
    for (let attempt = 0; attempt < 50; attempt++) {
      yellowX = minX + Math.random() * (maxX - minX);
      yellowY = minY + Math.random() * (maxY - minY);
      const yellowValid = yellowCubeExclusions.every(zone => {
        const dx = yellowX - zone.x;
        const dy = yellowY - zone.y;
        return Math.sqrt(dx * dx + dy * dy) > zone.radius;
      });
      if (yellowValid) break;
    }

    // Generate random starting position in empty space of the arena
    // Avoid: red cube (0,0), yellow cube, obstacles, walls
    const exclusionZones = [
      { x: 0, y: 0, radius: 0.6 },              // Red cube + margin
      { x: yellowX, y: yellowY, radius: 0.6 },   // Yellow cube + margin
      { x: -1.2, y: 0.5, radius: 0.5 },          // Obstacle 1 + margin
      { x: 1.0, y: -0.8, radius: 0.5 },          // Obstacle 2 + margin
    ];

    let startX = 0, startY = 0;
    let valid = false;
    for (let attempt = 0; attempt < 50; attempt++) {
      startX = minX + Math.random() * (maxX - minX);
      startY = minY + Math.random() * (maxY - minY);
      valid = exclusionZones.every(zone => {
        const dx = startX - zone.x;
        const dy = startY - zone.y;
        return Math.sqrt(dx * dx + dy * dy) > zone.radius;
      });
      if (valid) break;
    }
    // Fallback if no valid position found (unlikely)
    if (!valid) { startX = -2.0; startY = 2.0; }

    // Random orientation (0 to 2*PI)
    const startRotation = Math.random() * Math.PI * 2;

    return {
      bounds: { minX: -2.5, maxX: 2.5, minY: -2.5, maxY: 2.5 },
      walls: [
        { x1: -2.5, y1: -2.5, x2: 2.5, y2: -2.5 },  // Bottom
        { x1: 2.5, y1: -2.5, x2: 2.5, y2: 2.5 },     // Right
        { x1: 2.5, y1: 2.5, x2: -2.5, y2: 2.5 },     // Top
        { x1: -2.5, y1: 2.5, x2: -2.5, y2: -2.5 },   // Left
      ],
      obstacles: [
        // A few obstacles to make navigation interesting
        { x: -1.2, y: 0.5, radius: 0.2 },
        { x: 1.0, y: -0.8, radius: 0.18 },
      ],
      lines: [],
      checkpoints: [],
      pushableObjects: [
        // Red cube in the center - the object to push
        {
          id: 'red-cube',
          x: 0,
          y: 0,
          size: 0.10,          // 10cm cube (similar to robot's 8cm)
          mass: 0.15,          // 150g (lighter than robot's 250g so it can be pushed)
          friction: 0.4,       // Moderate friction
          color: '#e53935',    // Bright red
          label: 'Red Cube',
        },
        // Yellow cube at random position - the target landmark
        {
          id: 'yellow-cube',
          x: yellowX,
          y: yellowY,
          size: 0.10,          // 10cm cube
          mass: 0.80,          // 800g - heavy so it stays in place as a landmark
          friction: 0.9,       // High friction - resist being pushed
          color: '#F9A825',    // Bright yellow
          label: 'Yellow Cube',
        },
      ],
      dockZones: [],
      startPosition: { x: startX, y: startY, rotation: startRotation },
    };
  },

  /**
   * Standard 5m x 5m gem hunt challenge
   * Goal: Collect gems of different values while avoiding obstacles
   * Features gems worth different point values
   */
  standard5x5GemHunt: (): FloorMap => ({
    bounds: { minX: -2.5, maxX: 2.5, minY: -2.5, maxY: 2.5 },
    walls: [
      { x1: -2.5, y1: -2.5, x2: 2.5, y2: -2.5 },
      { x1: 2.5, y1: -2.5, x2: 2.5, y2: 2.5 },
      { x1: 2.5, y1: 2.5, x2: -2.5, y2: 2.5 },
      { x1: -2.5, y1: 2.5, x2: -2.5, y2: -2.5 },
    ],
    obstacles: [
      // Scattered obstacles
      { x: -0.8, y: -0.8, radius: 0.2 },
      { x: 0.8, y: -0.8, radius: 0.2 },
      { x: -0.8, y: 0.8, radius: 0.2 },
      { x: 0.8, y: 0.8, radius: 0.2 },
      { x: 0, y: 0, radius: 0.3 },
    ],
    lines: [],
    checkpoints: [],
    collectibles: [
      // Common gems (green - 10 points)
      { id: 'gem-g1', type: 'gem', x: 1.8, y: 0, radius: 0.06, color: '#50C878', points: 10 },
      { id: 'gem-g2', type: 'gem', x: -1.8, y: 0, radius: 0.06, color: '#50C878', points: 10 },
      { id: 'gem-g3', type: 'gem', x: 0, y: 1.8, radius: 0.06, color: '#50C878', points: 10 },
      { id: 'gem-g4', type: 'gem', x: 0, y: -1.8, radius: 0.06, color: '#50C878', points: 10 },
      // Rare gems (blue - 25 points)
      { id: 'gem-b1', type: 'gem', x: 1.5, y: 1.5, radius: 0.07, color: '#4169E1', points: 25 },
      { id: 'gem-b2', type: 'gem', x: -1.5, y: 1.5, radius: 0.07, color: '#4169E1', points: 25 },
      { id: 'gem-b3', type: 'gem', x: 1.5, y: -1.5, radius: 0.07, color: '#4169E1', points: 25 },
      { id: 'gem-b4', type: 'gem', x: -1.5, y: -1.5, radius: 0.07, color: '#4169E1', points: 25 },
      // Epic gems (purple - 50 points, harder to reach)
      { id: 'gem-p1', type: 'gem', x: 0.4, y: 0.4, radius: 0.08, color: '#9B59B6', points: 50 },
      { id: 'gem-p2', type: 'gem', x: -0.4, y: -0.4, radius: 0.08, color: '#9B59B6', points: 50 },
      // Legendary star (gold - 100 points, center challenge)
      { id: 'star-1', type: 'star', x: 2.2, y: 2.2, radius: 0.1, color: '#FFD700', points: 100 },
    ],
    startPosition: { x: -2.0, y: -2.0, rotation: Math.PI / 4 },
  }),
};
