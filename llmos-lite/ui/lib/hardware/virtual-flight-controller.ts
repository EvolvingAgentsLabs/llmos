/**
 * Virtual Flight Controller - Drone Firmware Simulation
 *
 * Simulates an ESP32-S3 based flight controller with:
 * - 4 motor outputs (0.0-1.0 throttle)
 * - Sensor data input (orientation, altitude, velocity)
 * - PID-based altitude stabilization
 * - Autopilot mode for autonomous flight
 *
 * This serves as a Hardware-in-the-Loop (HIL) simulation layer
 * that can be swapped with real hardware via SerialManager.
 */

export interface MotorState {
  motor1: number; // Front-left (0.0 - 1.0)
  motor2: number; // Front-right
  motor3: number; // Back-left
  motor4: number; // Back-right
}

export interface Orientation {
  x: number; // Roll (degrees)
  y: number; // Pitch (degrees)
  z: number; // Yaw (degrees)
}

export interface Velocity {
  x: number; // m/s
  y: number; // m/s (vertical)
  z: number; // m/s
}

export interface Position {
  x: number;
  y: number; // Altitude
  z: number;
}

export interface SensorData {
  orientation: Orientation;
  altitude: number;
  velocity: Velocity;
  position: Position;
  timestamp: number;
}

export interface PIDState {
  kP: number; // Proportional gain
  kI: number; // Integral gain
  kD: number; // Derivative gain
  integral: number;
  previousError: number;
  lastTime: number;
  output: number;
}

export interface FlightControllerState {
  motors: MotorState;
  sensors: SensorData;
  targetAltitude: number;
  autopilotEnabled: boolean;
  armed: boolean;
  pidAltitude: PIDState;
  pidRoll: PIDState;
  pidPitch: PIDState;
}

export interface FlightTelemetry {
  timestamp: number;
  motors: MotorState;
  altitude: number;
  targetAltitude: number;
  verticalVelocity: number;
  autopilotEnabled: boolean;
  armed: boolean;
  pidOutput: number;
  pidError: number;
}

/**
 * Virtual Flight Controller Class
 * Simulates drone flight controller firmware
 */
export class VirtualFlightController {
  // Motor outputs
  private _motors: MotorState = {
    motor1: 0,
    motor2: 0,
    motor3: 0,
    motor4: 0,
  };

  // Sensor inputs
  private _sensors: SensorData = {
    orientation: { x: 0, y: 0, z: 0 },
    altitude: 0,
    velocity: { x: 0, y: 0, z: 0 },
    position: { x: 0, y: 0, z: 0 },
    timestamp: Date.now(),
  };

  // Flight parameters
  private _targetAltitude: number = 5.0; // Default 5 meters
  private _autopilotEnabled: boolean = false;
  private _armed: boolean = false;

  // PID controllers
  private _pidAltitude: PIDState = {
    kP: 0.5,
    kI: 0.1,
    kD: 0.2,
    integral: 0,
    previousError: 0,
    lastTime: Date.now(),
    output: 0,
  };

  // Secondary PID for stability (future expansion)
  private _pidRoll: PIDState = {
    kP: 0.3,
    kI: 0.05,
    kD: 0.1,
    integral: 0,
    previousError: 0,
    lastTime: Date.now(),
    output: 0,
  };

  private _pidPitch: PIDState = {
    kP: 0.3,
    kI: 0.05,
    kD: 0.1,
    integral: 0,
    previousError: 0,
    lastTime: Date.now(),
    output: 0,
  };

  // Configuration
  private _hoverThrottle: number = 0.5; // Base throttle for hover
  private _maxThrottle: number = 1.0;
  private _minThrottle: number = 0.0;
  private _integralLimit: number = 0.5; // Anti-windup

  // Telemetry history
  private _telemetryHistory: FlightTelemetry[] = [];
  private _maxHistorySize: number = 100;

  // Event callbacks
  private _onTelemetryUpdate: ((telemetry: FlightTelemetry) => void) | null = null;

  constructor() {
    this.reset();
  }

  /**
   * Main firmware loop - call this every frame
   * @param dt Delta time in seconds
   */
  tick(dt: number): void {
    if (!this._armed) {
      // Motors off when disarmed
      this.setAllMotors(0);
      return;
    }

    if (this._autopilotEnabled) {
      this.runAutopilot(dt);
    }

    // Record telemetry
    this.recordTelemetry();
  }

  /**
   * Run autopilot altitude hold
   */
  private runAutopilot(dt: number): void {
    // Calculate altitude error
    const error = this._targetAltitude - this._sensors.altitude;

    // Update PID
    const pidOutput = this.updatePID(this._pidAltitude, error, dt);

    // Calculate throttle
    // Base hover throttle + PID correction
    let throttle = this._hoverThrottle + pidOutput;

    // Clamp throttle
    throttle = Math.max(this._minThrottle, Math.min(this._maxThrottle, throttle));

    // Apply to all motors (basic quadcopter - all same)
    // In a real system, roll/pitch PID would adjust individual motors
    this.setAllMotors(throttle);

    // Store PID output for telemetry
    this._pidAltitude.output = pidOutput;
  }

  /**
   * Generic PID update
   */
  private updatePID(pid: PIDState, error: number, dt: number): number {
    // Proportional
    const p = pid.kP * error;

    // Integral with anti-windup
    pid.integral += error * dt;
    pid.integral = Math.max(-this._integralLimit, Math.min(this._integralLimit, pid.integral));
    const i = pid.kI * pid.integral;

    // Derivative
    const derivative = (error - pid.previousError) / dt;
    const d = pid.kD * derivative;

    // Store for next iteration
    pid.previousError = error;
    pid.lastTime = Date.now();

    return p + i + d;
  }

  /**
   * Update sensor data from physics simulation
   */
  updateSensors(data: Partial<SensorData>): void {
    this._sensors = {
      ...this._sensors,
      ...data,
      timestamp: Date.now(),
    };

    // Update position from altitude if not provided
    if (data.altitude !== undefined && data.position === undefined) {
      this._sensors.position = {
        ...this._sensors.position,
        y: data.altitude,
      };
    }
  }

  /**
   * Set all motors to same value
   */
  private setAllMotors(value: number): void {
    const clamped = Math.max(0, Math.min(1, value));
    this._motors = {
      motor1: clamped,
      motor2: clamped,
      motor3: clamped,
      motor4: clamped,
    };
  }

  /**
   * Set individual motor
   */
  setMotor(index: 1 | 2 | 3 | 4, value: number): void {
    const clamped = Math.max(0, Math.min(1, value));
    const key = `motor${index}` as keyof MotorState;
    this._motors[key] = clamped;
  }

  /**
   * Record telemetry data
   */
  private recordTelemetry(): void {
    const telemetry: FlightTelemetry = {
      timestamp: Date.now(),
      motors: { ...this._motors },
      altitude: this._sensors.altitude,
      targetAltitude: this._targetAltitude,
      verticalVelocity: this._sensors.velocity.y,
      autopilotEnabled: this._autopilotEnabled,
      armed: this._armed,
      pidOutput: this._pidAltitude.output,
      pidError: this._targetAltitude - this._sensors.altitude,
    };

    this._telemetryHistory.push(telemetry);
    if (this._telemetryHistory.length > this._maxHistorySize) {
      this._telemetryHistory.shift();
    }

    // Notify listener
    if (this._onTelemetryUpdate) {
      this._onTelemetryUpdate(telemetry);
    }
  }

  // === Public API ===

  /**
   * Arm the flight controller (enable motors)
   */
  arm(): void {
    this._armed = true;
    console.log('[FlightController] Armed');
  }

  /**
   * Disarm the flight controller (disable motors)
   */
  disarm(): void {
    this._armed = false;
    this.setAllMotors(0);
    console.log('[FlightController] Disarmed');
  }

  /**
   * Toggle arm state
   */
  toggleArmed(): void {
    if (this._armed) {
      this.disarm();
    } else {
      this.arm();
    }
  }

  /**
   * Enable/disable autopilot
   */
  enableAutopilot(enabled: boolean): void {
    this._autopilotEnabled = enabled;
    if (enabled) {
      // Reset PID when enabling
      this.resetPID(this._pidAltitude);
    }
    console.log(`[FlightController] Autopilot ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Toggle autopilot
   */
  toggleAutopilot(): void {
    this.enableAutopilot(!this._autopilotEnabled);
  }

  /**
   * Set target altitude for autopilot
   */
  setTargetAltitude(altitude: number): void {
    this._targetAltitude = Math.max(0, altitude);
    console.log(`[FlightController] Target altitude: ${this._targetAltitude}m`);
  }

  /**
   * Tune PID parameters
   */
  setPIDGains(kP: number, kI: number, kD: number): void {
    this._pidAltitude.kP = kP;
    this._pidAltitude.kI = kI;
    this._pidAltitude.kD = kD;
    console.log(`[FlightController] PID gains: kP=${kP}, kI=${kI}, kD=${kD}`);
  }

  /**
   * Reset PID state
   */
  private resetPID(pid: PIDState): void {
    pid.integral = 0;
    pid.previousError = 0;
    pid.lastTime = Date.now();
    pid.output = 0;
  }

  /**
   * Reset controller to initial state
   */
  reset(): void {
    this._motors = { motor1: 0, motor2: 0, motor3: 0, motor4: 0 };
    this._sensors = {
      orientation: { x: 0, y: 0, z: 0 },
      altitude: 0,
      velocity: { x: 0, y: 0, z: 0 },
      position: { x: 0, y: 0, z: 0 },
      timestamp: Date.now(),
    };
    this._armed = false;
    this._autopilotEnabled = false;
    this.resetPID(this._pidAltitude);
    this.resetPID(this._pidRoll);
    this.resetPID(this._pidPitch);
    this._telemetryHistory = [];
    console.log('[FlightController] Reset');
  }

  /**
   * Set telemetry update callback
   */
  onTelemetryUpdate(callback: (telemetry: FlightTelemetry) => void): void {
    this._onTelemetryUpdate = callback;
  }

  /**
   * Get total motor thrust (0-4 range, normalized to 0-1)
   */
  getMotorThrust(): number {
    const total = this._motors.motor1 + this._motors.motor2 + this._motors.motor3 + this._motors.motor4;
    return total / 4;
  }

  // === Getters ===

  get motors(): MotorState {
    return { ...this._motors };
  }

  get sensors(): SensorData {
    return { ...this._sensors };
  }

  get targetAltitude(): number {
    return this._targetAltitude;
  }

  get autopilotEnabled(): boolean {
    return this._autopilotEnabled;
  }

  get armed(): boolean {
    return this._armed;
  }

  get pidGains(): { kP: number; kI: number; kD: number } {
    return {
      kP: this._pidAltitude.kP,
      kI: this._pidAltitude.kI,
      kD: this._pidAltitude.kD,
    };
  }

  get telemetryHistory(): FlightTelemetry[] {
    return [...this._telemetryHistory];
  }

  get state(): FlightControllerState {
    return {
      motors: this.motors,
      sensors: this.sensors,
      targetAltitude: this._targetAltitude,
      autopilotEnabled: this._autopilotEnabled,
      armed: this._armed,
      pidAltitude: { ...this._pidAltitude },
      pidRoll: { ...this._pidRoll },
      pidPitch: { ...this._pidPitch },
    };
  }

  /**
   * Serialize state for persistence
   */
  toJSON(): object {
    return {
      targetAltitude: this._targetAltitude,
      pidGains: this.pidGains,
      hoverThrottle: this._hoverThrottle,
    };
  }

  /**
   * Restore state from JSON
   */
  fromJSON(data: { targetAltitude?: number; pidGains?: { kP: number; kI: number; kD: number }; hoverThrottle?: number }): void {
    if (data.targetAltitude !== undefined) {
      this._targetAltitude = data.targetAltitude;
    }
    if (data.pidGains) {
      this.setPIDGains(data.pidGains.kP, data.pidGains.kI, data.pidGains.kD);
    }
    if (data.hoverThrottle !== undefined) {
      this._hoverThrottle = data.hoverThrottle;
    }
  }
}

/**
 * Singleton instance for easy access
 */
export const flightController = new VirtualFlightController();

/**
 * React hook for using the flight controller
 */
export function useFlightController() {
  return flightController;
}

export default VirtualFlightController;
