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
  private led: LEDState = { r: 0, g: 0, b: 0, brightness: 100 };

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
    this.encoders = { left: 0, right: 0 };
    this.prevEncoders = { left: 0, right: 0 };
    this.bumperState = { front: false, back: false };
    this.led = { r: 0, g: 0, b: 0, brightness: 100 };
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
};
