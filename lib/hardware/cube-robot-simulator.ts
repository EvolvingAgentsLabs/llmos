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
  startPosition: RobotPose;
}

export interface CubeRobotConfig {
  physicsRate?: number;      // Physics updates per second (default: 100)
  collisionAvoidanceEnabled?: boolean;  // Enable automatic collision avoidance (default: true)
  collisionAvoidanceThreshold?: number; // Distance in cm to trigger avoidance (default: 20)
  onStateChange?: (state: CubeRobotState) => void;
  onCollision?: (position: Vector2D) => void;
  onCheckpoint?: (index: number) => void;
  onCollectible?: (collectible: Collectible, totalCollected: number, totalPoints: number) => void;
}

export interface CubeRobotState {
  pose: RobotPose;
  velocity: RobotVelocity;
  motors: MotorState;
  sensors: SensorData;
  led: LEDState;
  battery: BatteryState;
  timestamp: number;
  // Collision avoidance status
  collisionAvoidance: {
    enabled: boolean;
    threshold: number;       // Distance threshold in cm
    active: boolean;         // Currently modifying motor commands
  };
  // Collectibles tracking
  collectibles?: {
    collected: string[];      // IDs of collected items
    remaining: string[];      // IDs of remaining items
    totalPoints: number;      // Total points scored
    totalCount: number;       // Total items in map
  };
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

  // Collision avoidance state
  private collisionAvoidanceActive = false;

  constructor(config: CubeRobotConfig = {}) {
    this.config = {
      physicsRate: config.physicsRate ?? 100,
      collisionAvoidanceEnabled: config.collisionAvoidanceEnabled ?? true,
      collisionAvoidanceThreshold: config.collisionAvoidanceThreshold ?? 20,
      onStateChange: config.onStateChange ?? (() => {}),
      onCollision: config.onCollision ?? (() => {}),
      onCheckpoint: config.onCheckpoint ?? (() => {}),
      onCollectible: config.onCollectible ?? (() => {}),
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

    return {
      pose: { ...this.pose },
      velocity: { ...this.velocity },
      motors: { ...this.motors },
      sensors: this.getSensorData(),
      led: { ...this.led },
      battery: this.getBatteryState(),
      timestamp: Date.now() - this.startTime,
      collisionAvoidance: {
        enabled: this.config.collisionAvoidanceEnabled,
        threshold: this.config.collisionAvoidanceThreshold,
        active: this.collisionAvoidanceActive,
      },
      collectibles: collectibles.length > 0 ? {
        collected: collectedIds,
        remaining: remainingIds,
        totalPoints: this.totalPoints,
        totalCount: collectibles.length,
      } : undefined,
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

  /**
   * Enable or disable collision avoidance
   */
  setCollisionAvoidance(enabled: boolean): void {
    this.config.collisionAvoidanceEnabled = enabled;
    console.log(`[CubeRobot] Collision avoidance ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Set collision avoidance threshold (in cm)
   */
  setCollisionAvoidanceThreshold(threshold: number): void {
    this.config.collisionAvoidanceThreshold = Math.max(5, Math.min(100, threshold));
    console.log(`[CubeRobot] Collision avoidance threshold set to ${this.config.collisionAvoidanceThreshold}cm`);
  }

  /**
   * Check if collision avoidance is currently active (modifying motor commands)
   */
  isCollisionAvoidanceActive(): boolean {
    return this.collisionAvoidanceActive;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // COLLISION AVOIDANCE SAFETY LAYER
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Apply collision avoidance to motor commands.
   * This is a hardware-level safety layer that works independently of the LLM.
   * It modifies motor commands when the robot is too close to obstacles.
   */
  private applyCollisionAvoidance(): { leftPWM: number; rightPWM: number } {
    const originalLeftPWM = this.motors.leftPWM;
    const originalRightPWM = this.motors.rightPWM;
    let leftPWM = originalLeftPWM;
    let rightPWM = originalRightPWM;

    // Reset active flag
    this.collisionAvoidanceActive = false;

    if (!this.config.collisionAvoidanceEnabled) {
      return { leftPWM, rightPWM };
    }

    // Get current distance readings (in meters, convert to cm)
    const distances = this.getDistanceSensors();
    const threshold = this.config.collisionAvoidanceThreshold;
    const criticalThreshold = threshold * 0.6; // Even more aggressive at 60% of threshold

    // Check if robot is trying to move forward (positive average velocity)
    const avgPWM = (leftPWM + rightPWM) / 2;
    const isMovingForward = avgPWM > 0;

    // Check if robot is trying to move backward
    const isMovingBackward = avgPWM < 0;

    // Front sensors
    const frontDist = distances.front;
    const frontLeftDist = distances.frontLeft;
    const frontRightDist = distances.frontRight;
    const leftDist = distances.left;
    const rightDist = distances.right;

    // Back sensors
    const backDist = distances.back;
    const backLeftDist = distances.backLeft;
    const backRightDist = distances.backRight;

    // ═══════════════════════════════════════════════════════════════════════
    // FORWARD COLLISION AVOIDANCE
    // ═══════════════════════════════════════════════════════════════════════
    if (isMovingForward) {
      // Critical front obstacle - stop and turn
      if (frontDist < criticalThreshold) {
        // Stop forward motion completely
        if (leftDist > rightDist) {
          // Turn left in place
          leftPWM = -60;
          rightPWM = 80;
        } else {
          // Turn right in place
          leftPWM = 80;
          rightPWM = -60;
        }
      }
      // Front obstacle within threshold - steer away
      else if (frontDist < threshold) {
        // Reduce forward speed proportionally to distance
        const speedFactor = frontDist / threshold;

        // Determine which direction to steer
        if (leftDist > rightDist) {
          // Steer left
          leftPWM = Math.min(leftPWM, leftPWM * speedFactor * 0.3);
          rightPWM = Math.max(rightPWM * speedFactor, 60);
        } else {
          // Steer right
          leftPWM = Math.max(leftPWM * speedFactor, 60);
          rightPWM = Math.min(rightPWM, rightPWM * speedFactor * 0.3);
        }
      }

      // Front-left obstacle - steer right
      if (frontLeftDist < threshold && leftPWM > 0) {
        const steerFactor = frontLeftDist / threshold;
        // Reduce left wheel speed to turn right
        leftPWM = Math.max(leftPWM * steerFactor, rightPWM * 0.5);
      }

      // Front-right obstacle - steer left
      if (frontRightDist < threshold && rightPWM > 0) {
        const steerFactor = frontRightDist / threshold;
        // Reduce right wheel speed to turn left
        rightPWM = Math.max(rightPWM * steerFactor, leftPWM * 0.5);
      }

      // Side obstacle avoidance (prevent scraping walls)
      if (leftDist < threshold * 0.7 && leftPWM > 0) {
        // Too close to left wall, steer right
        const steerFactor = leftDist / (threshold * 0.7);
        leftPWM = Math.max(leftPWM, rightPWM * (1 - steerFactor) + leftPWM * steerFactor);
      }
      if (rightDist < threshold * 0.7 && rightPWM > 0) {
        // Too close to right wall, steer left
        const steerFactor = rightDist / (threshold * 0.7);
        rightPWM = Math.max(rightPWM, leftPWM * (1 - steerFactor) + rightPWM * steerFactor);
      }

      // Corner detection - all front directions blocked
      if (frontDist < threshold && frontLeftDist < threshold && frontRightDist < threshold) {
        // Boxed in - need to back out and turn
        if (backDist > threshold) {
          // Back out while turning
          if (leftDist > rightDist) {
            leftPWM = -40;
            rightPWM = -80;
          } else {
            leftPWM = -80;
            rightPWM = -40;
          }
        } else {
          // Completely boxed - rotate in place toward most open direction
          if (leftDist > rightDist) {
            leftPWM = -70;
            rightPWM = 70;
          } else {
            leftPWM = 70;
            rightPWM = -70;
          }
        }
      }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // BACKWARD COLLISION AVOIDANCE
    // ═══════════════════════════════════════════════════════════════════════
    if (isMovingBackward) {
      // Back obstacle - stop backward motion
      if (backDist < threshold) {
        const speedFactor = backDist / threshold;
        leftPWM = Math.max(leftPWM, leftPWM * speedFactor);
        rightPWM = Math.max(rightPWM, rightPWM * speedFactor);

        // If very close, stop completely
        if (backDist < criticalThreshold) {
          leftPWM = Math.max(leftPWM, 0);
          rightPWM = Math.max(rightPWM, 0);
        }
      }

      // Back-left obstacle
      if (backLeftDist < threshold && leftPWM < 0) {
        const steerFactor = backLeftDist / threshold;
        leftPWM = Math.max(leftPWM, leftPWM * steerFactor);
      }

      // Back-right obstacle
      if (backRightDist < threshold && rightPWM < 0) {
        const steerFactor = backRightDist / threshold;
        rightPWM = Math.max(rightPWM, rightPWM * steerFactor);
      }
    }

    // Clamp final values
    leftPWM = Math.max(-255, Math.min(255, leftPWM));
    rightPWM = Math.max(-255, Math.min(255, rightPWM));

    // Check if we modified the motor commands
    if (Math.abs(leftPWM - originalLeftPWM) > 1 || Math.abs(rightPWM - originalRightPWM) > 1) {
      this.collisionAvoidanceActive = true;
    }

    return { leftPWM, rightPWM };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PHYSICS SIMULATION
  // ═══════════════════════════════════════════════════════════════════════════

  private updatePhysics(dt: number): void {
    // Apply collision avoidance safety layer to motor commands
    const safeMotors = this.applyCollisionAvoidance();

    // Convert PWM to wheel velocities (using safety-adjusted values)
    const leftVel = this.pwmToVelocity(safeMotors.leftPWM);
    const rightVel = this.pwmToVelocity(safeMotors.rightPWM);

    // Update motor RPM
    this.motors.leftRPM = (leftVel / (2 * Math.PI * ROBOT_SPECS.WHEEL_RADIUS)) * 60;
    this.motors.rightRPM = (rightVel / (2 * Math.PI * ROBOT_SPECS.WHEEL_RADIUS)) * 60;

    // Differential drive kinematics
    this.velocity.linear = (leftVel + rightVel) / 2;
    this.velocity.angular = (rightVel - leftVel) / ROBOT_SPECS.WHEEL_BASE;

    // Calculate new position
    const newRotation = this.normalizeAngle(this.pose.rotation + this.velocity.angular * dt);
    const newX = this.pose.x + this.velocity.linear * Math.cos(this.pose.rotation) * dt;
    const newY = this.pose.y + this.velocity.linear * Math.sin(this.pose.rotation) * dt;

    // Collision detection
    const collision = this.checkCollision(newX, newY);
    this.bumperState = collision;

    if (!collision.front && !collision.back) {
      // No collision - update position and rotation normally
      this.pose.x = newX;
      this.pose.y = newY;
      this.pose.rotation = newRotation;
    } else {
      // Collision detected - allow rotation but block position change
      // This allows the robot to turn away from obstacles even when touching them
      this.pose.rotation = newRotation;

      // Try to allow sliding along walls (partial movement)
      // Check if we can move in just X or just Y
      const collisionX = this.checkCollision(newX, this.pose.y);
      const collisionY = this.checkCollision(this.pose.x, newY);

      if (!collisionX.front && !collisionX.back) {
        // Can move in X direction
        this.pose.x = newX;
      }
      if (!collisionY.front && !collisionY.back) {
        // Can move in Y direction
        this.pose.y = newY;
      }

      // Notify collision
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

    // Notify state change
    this.config.onStateChange(this.getState());
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
    const robotRadius = ROBOT_SPECS.BODY_SIZE / 2;
    let frontCollision = false;
    let backCollision = false;

    // Check walls
    for (const wall of this.map.walls) {
      const dist = this.pointToLineDistance(x, y, wall.x1, wall.y1, wall.x2, wall.y2);
      if (dist < robotRadius) {
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
