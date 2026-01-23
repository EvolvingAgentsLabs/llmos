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
};

// ═══════════════════════════════════════════════════════════════════════════
// PHYSICS ENGINE CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

export const PHYSICS_CONSTANTS = {
  // Collision response
  WALL_RESTITUTION: 0.3,       // Bounce coefficient for walls (0 = no bounce, 1 = full bounce)
  OBSTACLE_RESTITUTION: 0.4,   // Bounce coefficient for obstacles
  WALL_FRICTION: 0.7,          // Friction when sliding along walls

  // Movement physics
  LINEAR_DAMPING: 0.95,        // Velocity decay per frame (1 = no decay)
  ANGULAR_DAMPING: 0.9,        // Angular velocity decay per frame

  // Collision detection
  COLLISION_MARGIN: 0.005,     // Extra margin for collision detection (5mm)
  PUSH_STRENGTH: 0.8,          // How strongly robot is pushed away from obstacles

  // Wall properties
  WALL_THICKNESS: 0.05,        // Visual wall thickness (5cm)
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
  startPosition: RobotPose;
}

export interface CubeRobotConfig {
  physicsRate?: number;      // Physics updates per second (default: 100)
  onStateChange?: (state: CubeRobotState) => void;
  onCollision?: (position: Vector2D) => void;
  onCheckpoint?: (index: number) => void;
}

// ═══════════════════════════════════════════════════════════════════════════
// PHYSICS COLLISION TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface CollisionInfo {
  collided: boolean;
  front: boolean;
  back: boolean;
  penetrationDepth: number;
  normal: Vector2D;           // Collision normal (direction to push robot)
  contactPoint: Vector2D;     // Where collision occurred
  type: 'wall' | 'obstacle' | 'none';
}

export interface PhysicsState {
  velocityX: number;          // World velocity X (m/s)
  velocityY: number;          // World velocity Y (m/s)
  angularVelocity: number;    // Angular velocity (rad/s)
}

export interface CubeRobotState {
  pose: RobotPose;
  velocity: RobotVelocity;
  motors: MotorState;
  sensors: SensorData;
  led: LEDState;
  battery: BatteryState;
  timestamp: number;
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

  // Physics state (world-space velocities for collision response)
  private physicsState: PhysicsState = { velocityX: 0, velocityY: 0, angularVelocity: 0 };

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

  constructor(config: CubeRobotConfig = {}) {
    this.config = {
      physicsRate: config.physicsRate ?? 100,
      onStateChange: config.onStateChange ?? (() => {}),
      onCollision: config.onCollision ?? (() => {}),
      onCheckpoint: config.onCheckpoint ?? (() => {}),
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
    this.physicsState = { velocityX: 0, velocityY: 0, angularVelocity: 0 };
    this.encoders = { left: 0, right: 0 };
    this.prevEncoders = { left: 0, right: 0 };
    this.bumperState = { front: false, back: false };
    this.led = { r: 88, g: 166, b: 255, brightness: 100 }; // Default blue (#58a6ff)
    this.batteryMAh = ROBOT_SPECS.BATTERY_CAPACITY_MAH;
    this.batteryVoltage = ROBOT_SPECS.BATTERY_VOLTAGE;
    this.checkpointsReached.clear();
    this.startTime = Date.now();
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
    return {
      pose: { ...this.pose },
      velocity: { ...this.velocity },
      motors: { ...this.motors },
      sensors: this.getSensorData(),
      led: { ...this.led },
      battery: this.getBatteryState(),
      timestamp: Date.now() - this.startTime,
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

    // Differential drive kinematics - motor-driven velocity
    this.velocity.linear = (leftVel + rightVel) / 2;
    this.velocity.angular = (rightVel - leftVel) / ROBOT_SPECS.WHEEL_BASE;

    // Compute motor-driven world velocity
    const motorVelX = this.velocity.linear * Math.cos(this.pose.rotation);
    const motorVelY = this.velocity.linear * Math.sin(this.pose.rotation);

    // Combine motor velocity with physics velocity (from collisions)
    // Motor velocity dominates but physics velocity adds collision response
    this.physicsState.velocityX = motorVelX + this.physicsState.velocityX * 0.3;
    this.physicsState.velocityY = motorVelY + this.physicsState.velocityY * 0.3;

    // Apply linear damping to physics state
    this.physicsState.velocityX *= PHYSICS_CONSTANTS.LINEAR_DAMPING;
    this.physicsState.velocityY *= PHYSICS_CONSTANTS.LINEAR_DAMPING;
    this.physicsState.angularVelocity *= PHYSICS_CONSTANTS.ANGULAR_DAMPING;

    // Calculate new position
    const newRotation = this.normalizeAngle(
      this.pose.rotation + this.velocity.angular * dt + this.physicsState.angularVelocity * dt
    );
    let newX = this.pose.x + this.physicsState.velocityX * dt;
    let newY = this.pose.y + this.physicsState.velocityY * dt;

    // Collision detection and response
    const collision = this.checkCollisionDetailed(newX, newY);
    this.bumperState = { front: collision.front, back: collision.back };

    if (collision.collided) {
      // Apply collision response based on type
      const restitution = collision.type === 'wall'
        ? PHYSICS_CONSTANTS.WALL_RESTITUTION
        : PHYSICS_CONSTANTS.OBSTACLE_RESTITUTION;

      // Calculate velocity along collision normal
      const velDotNormal = this.physicsState.velocityX * collision.normal.x +
                          this.physicsState.velocityY * collision.normal.y;

      // Only respond if moving toward the collision
      if (velDotNormal < 0) {
        // Reflect velocity with restitution
        this.physicsState.velocityX -= (1 + restitution) * velDotNormal * collision.normal.x;
        this.physicsState.velocityY -= (1 + restitution) * velDotNormal * collision.normal.y;

        // Apply friction along the tangent
        const tangentX = -collision.normal.y;
        const tangentY = collision.normal.x;
        const velDotTangent = this.physicsState.velocityX * tangentX +
                             this.physicsState.velocityY * tangentY;

        this.physicsState.velocityX -= velDotTangent * tangentX * (1 - PHYSICS_CONSTANTS.WALL_FRICTION);
        this.physicsState.velocityY -= velDotTangent * tangentY * (1 - PHYSICS_CONSTANTS.WALL_FRICTION);

        // Add slight angular perturbation on collision
        this.physicsState.angularVelocity += (Math.random() - 0.5) * 0.5;
      }

      // Push robot out of collision (resolve penetration)
      const pushDistance = collision.penetrationDepth + PHYSICS_CONSTANTS.COLLISION_MARGIN;
      newX = this.pose.x + collision.normal.x * pushDistance * PHYSICS_CONSTANTS.PUSH_STRENGTH;
      newY = this.pose.y + collision.normal.y * pushDistance * PHYSICS_CONSTANTS.PUSH_STRENGTH;

      // Notify collision
      this.config.onCollision({ x: newX, y: newY });
    }

    // Update position
    this.pose.x = newX;
    this.pose.y = newY;
    this.pose.rotation = newRotation;

    // Enforce arena bounds with bounce
    this.enforceArenaBounds();

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

    // Notify state change
    this.config.onStateChange(this.getState());
  }

  /**
   * Enforce arena bounds with collision response
   */
  private enforceArenaBounds(): void {
    const robotRadius = ROBOT_SPECS.BODY_SIZE / 2 + PHYSICS_CONSTANTS.COLLISION_MARGIN;
    const minX = this.map.bounds.minX + robotRadius;
    const maxX = this.map.bounds.maxX - robotRadius;
    const minY = this.map.bounds.minY + robotRadius;
    const maxY = this.map.bounds.maxY - robotRadius;

    // Left bound
    if (this.pose.x < minX) {
      this.pose.x = minX;
      this.physicsState.velocityX = Math.abs(this.physicsState.velocityX) * PHYSICS_CONSTANTS.WALL_RESTITUTION;
      this.bumperState.front = this.pose.rotation > Math.PI / 2 || this.pose.rotation < -Math.PI / 2;
      this.bumperState.back = !this.bumperState.front;
    }

    // Right bound
    if (this.pose.x > maxX) {
      this.pose.x = maxX;
      this.physicsState.velocityX = -Math.abs(this.physicsState.velocityX) * PHYSICS_CONSTANTS.WALL_RESTITUTION;
      this.bumperState.front = this.pose.rotation < Math.PI / 2 && this.pose.rotation > -Math.PI / 2;
      this.bumperState.back = !this.bumperState.front;
    }

    // Bottom bound
    if (this.pose.y < minY) {
      this.pose.y = minY;
      this.physicsState.velocityY = Math.abs(this.physicsState.velocityY) * PHYSICS_CONSTANTS.WALL_RESTITUTION;
      this.bumperState.front = this.pose.rotation < 0;
      this.bumperState.back = !this.bumperState.front;
    }

    // Top bound
    if (this.pose.y > maxY) {
      this.pose.y = maxY;
      this.physicsState.velocityY = -Math.abs(this.physicsState.velocityY) * PHYSICS_CONSTANTS.WALL_RESTITUTION;
      this.bumperState.front = this.pose.rotation > 0;
      this.bumperState.back = !this.bumperState.front;
    }
  }

  private pwmToVelocity(pwm: number): number {
    // Max velocity at PWM 255
    const maxVelocity = (ROBOT_SPECS.MAX_RPM / 60) * 2 * Math.PI * ROBOT_SPECS.WHEEL_RADIUS;
    return (pwm / 255) * maxVelocity;
  }

  private normalizeAngle(angle: number): number {
    while (angle > Math.PI) angle -= 2 * Math.PI;
    while (angle < -Math.PI) angle += 2 * Math.PI;
    return angle;
  }

  private checkCollision(x: number, y: number): { front: boolean; back: boolean } {
    const collision = this.checkCollisionDetailed(x, y);
    return { front: collision.front, back: collision.back };
  }

  /**
   * Detailed collision detection with physics response information
   */
  private checkCollisionDetailed(x: number, y: number): CollisionInfo {
    const robotRadius = ROBOT_SPECS.BODY_SIZE / 2;
    let closestCollision: CollisionInfo = {
      collided: false,
      front: false,
      back: false,
      penetrationDepth: 0,
      normal: { x: 0, y: 0 },
      contactPoint: { x: 0, y: 0 },
      type: 'none',
    };

    let minPenetration = Infinity;

    // Check walls
    for (const wall of this.map.walls) {
      const result = this.getWallCollision(x, y, robotRadius, wall);
      if (result.collided && result.penetrationDepth < minPenetration) {
        minPenetration = result.penetrationDepth;
        closestCollision = result;
      }
    }

    // Check obstacles
    for (const obs of this.map.obstacles) {
      const result = this.getObstacleCollision(x, y, robotRadius, obs);
      if (result.collided && result.penetrationDepth < minPenetration) {
        minPenetration = result.penetrationDepth;
        closestCollision = result;
      }
    }

    // Determine front/back collision based on robot heading
    if (closestCollision.collided) {
      const collisionAngle = Math.atan2(closestCollision.normal.y, closestCollision.normal.x);
      const angleDiff = Math.abs(this.normalizeAngle(this.pose.rotation - collisionAngle));

      // If collision normal points roughly opposite to heading, it's a front collision
      if (angleDiff > Math.PI / 2) {
        closestCollision.front = true;
      } else {
        closestCollision.back = true;
      }
    }

    return closestCollision;
  }

  /**
   * Get collision info for a wall
   */
  private getWallCollision(
    x: number, y: number, robotRadius: number, wall: Wall
  ): CollisionInfo {
    // Find closest point on wall segment to robot
    const dx = wall.x2 - wall.x1;
    const dy = wall.y2 - wall.y1;
    const lengthSq = dx * dx + dy * dy;

    let t = 0;
    if (lengthSq > 0) {
      t = Math.max(0, Math.min(1, ((x - wall.x1) * dx + (y - wall.y1) * dy) / lengthSq));
    }

    const closestX = wall.x1 + t * dx;
    const closestY = wall.y1 + t * dy;

    const distX = x - closestX;
    const distY = y - closestY;
    const distance = Math.sqrt(distX * distX + distY * distY);

    if (distance < robotRadius) {
      // Normalize the collision normal
      let normalX = distX;
      let normalY = distY;

      if (distance > 0.0001) {
        normalX /= distance;
        normalY /= distance;
      } else {
        // Robot is exactly on the wall, use wall perpendicular
        normalX = -dy;
        normalY = dx;
        const perpLen = Math.sqrt(normalX * normalX + normalY * normalY);
        if (perpLen > 0) {
          normalX /= perpLen;
          normalY /= perpLen;
        }
      }

      return {
        collided: true,
        front: false,
        back: false,
        penetrationDepth: robotRadius - distance,
        normal: { x: normalX, y: normalY },
        contactPoint: { x: closestX, y: closestY },
        type: 'wall',
      };
    }

    return {
      collided: false,
      front: false,
      back: false,
      penetrationDepth: 0,
      normal: { x: 0, y: 0 },
      contactPoint: { x: 0, y: 0 },
      type: 'none',
    };
  }

  /**
   * Get collision info for an obstacle
   */
  private getObstacleCollision(
    x: number, y: number, robotRadius: number, obstacle: Obstacle
  ): CollisionInfo {
    const dx = x - obstacle.x;
    const dy = y - obstacle.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const minDistance = robotRadius + obstacle.radius;

    if (distance < minDistance) {
      // Normalize the collision normal
      let normalX = dx;
      let normalY = dy;

      if (distance > 0.0001) {
        normalX /= distance;
        normalY /= distance;
      } else {
        // Robot is exactly at obstacle center, push in random direction
        const angle = Math.random() * Math.PI * 2;
        normalX = Math.cos(angle);
        normalY = Math.sin(angle);
      }

      return {
        collided: true,
        front: false,
        back: false,
        penetrationDepth: minDistance - distance,
        normal: { x: normalX, y: normalY },
        contactPoint: {
          x: obstacle.x + normalX * obstacle.radius,
          y: obstacle.y + normalY * obstacle.radius,
        },
        type: 'obstacle',
      };
    }

    return {
      collided: false,
      front: false,
      back: false,
      penetrationDepth: 0,
      normal: { x: 0, y: 0 },
      contactPoint: { x: 0, y: 0 },
      type: 'none',
    };
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
    };
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

    // Check walls
    for (const wall of this.map.walls) {
      const dist = this.rayLineIntersection(x, y, angle, wall.x1, wall.y1, wall.x2, wall.y2);
      if (dist !== null && dist < minDist) {
        minDist = dist;
      }
    }

    // Check obstacles
    for (const obs of this.map.obstacles) {
      const dist = this.rayCircleIntersection(x, y, angle, obs.x, obs.y, obs.radius);
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
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);

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
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);

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

      // Transform to world coordinates
      const cos = Math.cos(this.pose.rotation);
      const sin = Math.sin(this.pose.rotation);
      const worldX = this.pose.x + localX * cos - localY * sin;
      const worldY = this.pose.y + localX * sin + localY * cos;

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
        x: this.velocity.linear * Math.cos(this.pose.rotation) + accelNoise(),
        y: this.velocity.linear * Math.sin(this.pose.rotation) + accelNoise(),
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
   * Perfect for testing basic navigation and motor control
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
      { x: 2.0, y: 0 },    // Right
      { x: 0, y: 2.0 },    // Top
      { x: -2.0, y: 0 },   // Left
      { x: 0, y: -2.0 },   // Bottom
    ],
    startPosition: { x: 0, y: 0, rotation: 0 },
  }),

  /**
   * Standard 5m x 5m arena with obstacles
   * Obstacle avoidance practice
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
      // Corner obstacles
      { x: -1.5, y: -1.5, radius: 0.25 },
      { x: 1.5, y: -1.5, radius: 0.20 },
      { x: 1.5, y: 1.5, radius: 0.25 },
      { x: -1.5, y: 1.5, radius: 0.20 },
      // Center cluster
      { x: 0, y: 0, radius: 0.30 },
      { x: -0.6, y: 0.6, radius: 0.15 },
      { x: 0.6, y: -0.6, radius: 0.15 },
      // Edge obstacles
      { x: 0, y: 1.8, radius: 0.18 },
      { x: 0, y: -1.8, radius: 0.18 },
      { x: 1.8, y: 0, radius: 0.18 },
      { x: -1.8, y: 0, radius: 0.18 },
    ],
    lines: [],
    checkpoints: [
      { x: 2.0, y: 2.0 },    // Top-right goal
    ],
    startPosition: { x: -2.0, y: -2.0, rotation: Math.PI / 4 },
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
        width: 0.03,  // 3cm wide line
        color: '#000000',
      }],
      checkpoints: [
        { x: 1.8, y: 0 },     // Right
        { x: 0, y: 1.2 },     // Top
        { x: -1.8, y: 0 },    // Left
        { x: 0, y: -1.2 },    // Bottom
      ],
      startPosition: { x: 0, y: 0, rotation: 0 },
    };
  },

  /**
   * Standard 5m x 5m maze
   * Path planning and navigation challenge
   */
  standard5x5Maze: (): FloorMap => ({
    bounds: { minX: -2.5, maxX: 2.5, minY: -2.5, maxY: 2.5 },
    walls: [
      // Outer walls
      { x1: -2.5, y1: -2.5, x2: 2.5, y2: -2.5 },
      { x1: 2.5, y1: -2.5, x2: 2.5, y2: 2.5 },
      { x1: 2.5, y1: 2.5, x2: -2.5, y2: 2.5 },
      { x1: -2.5, y1: 2.5, x2: -2.5, y2: -2.5 },
      // Inner maze walls (creating a solvable maze)
      // Vertical walls
      { x1: -1.5, y1: -2.5, x2: -1.5, y2: -0.5 },
      { x1: -0.5, y1: -1.5, x2: -0.5, y2: 1.0 },
      { x1: 0.5, y1: -1.0, x2: 0.5, y2: 2.0 },
      { x1: 1.5, y1: -2.0, x2: 1.5, y2: 0.5 },
      // Horizontal walls
      { x1: -2.5, y1: -1.5, x2: 0, y2: -1.5 },
      { x1: -1.0, y1: -0.5, x2: 2.0, y2: -0.5 },
      { x1: -2.0, y1: 0.5, x2: 0.5, y2: 0.5 },
      { x1: -0.5, y1: 1.5, x2: 2.5, y2: 1.5 },
    ],
    obstacles: [
      // Additional circular obstacles in open spaces
      { x: -1.0, y: 1.0, radius: 0.15 },
      { x: 1.0, y: -1.5, radius: 0.15 },
      { x: 0.8, y: 0.8, radius: 0.12 },
    ],
    lines: [],
    checkpoints: [
      { x: 2.0, y: 2.0 },  // Top-right goal
    ],
    startPosition: { x: -2.0, y: -2.0, rotation: Math.PI / 4 },
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
        width: 0.03,  // 3cm wide line
        color: '#000000',
      }],
      checkpoints: [
        { x: 1.5, y: 0 },     // Right loop
        { x: -1.5, y: 0 },    // Left loop
        { x: 0, y: 1.0 },     // Top crossing
        { x: 0, y: -1.0 },    // Bottom crossing
      ],
      startPosition: { x: 0, y: 0, rotation: 0 },
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
};
