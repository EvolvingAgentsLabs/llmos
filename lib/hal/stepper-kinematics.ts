/**
 * Stepper Kinematics — Steps-to-cm translation engine for 28BYJ-48 motors
 *
 * Provides conversion between physical units (cm, degrees, cm/s) and
 * stepper motor units (steps, steps/s) for differential drive robots.
 *
 * 28BYJ-48 specs:
 *   - 4096 steps/rev (64:1 gear ratio)
 *   - ~15 RPM max
 *   - 6cm diameter wheels
 *   - 12cm wheel base
 */

// =============================================================================
// Types
// =============================================================================

export interface StepperMotorSpec {
  /** Steps per full revolution (4096 for 28BYJ-48 with 64:1 gear ratio) */
  stepsPerRevolution: number;
  /** Wheel diameter in cm */
  wheelDiameterCm: number;
  /** Distance between wheel centers in cm */
  wheelBaseCm: number;
  /** Maximum steps per second */
  maxStepsPerSecond: number;
  /** Acceleration in steps/s^2 */
  maxAcceleration: number;
}

export interface ArcSpeeds {
  left: number;   // steps/s
  right: number;  // steps/s
}

// =============================================================================
// Default spec for 28BYJ-48
// =============================================================================

export const DEFAULT_28BYJ48_SPEC: StepperMotorSpec = {
  stepsPerRevolution: 4096,
  wheelDiameterCm: 6.0,
  wheelBaseCm: 12.0,
  maxStepsPerSecond: 1024,
  maxAcceleration: 512,
};

// =============================================================================
// StepperKinematics
// =============================================================================

export class StepperKinematics {
  private spec: StepperMotorSpec;
  private wheelCircumferenceCm: number;
  private stepsPerCm: number;

  constructor(spec: Partial<StepperMotorSpec> = {}) {
    this.spec = { ...DEFAULT_28BYJ48_SPEC, ...spec };
    this.wheelCircumferenceCm = this.spec.wheelDiameterCm * Math.PI;
    this.stepsPerCm = this.spec.stepsPerRevolution / this.wheelCircumferenceCm;
  }

  /** Get the active motor spec */
  getSpec(): StepperMotorSpec {
    return { ...this.spec };
  }

  /** Get computed steps per cm */
  getStepsPerCm(): number {
    return this.stepsPerCm;
  }

  /** Get wheel circumference in cm */
  getWheelCircumferenceCm(): number {
    return this.wheelCircumferenceCm;
  }

  /**
   * Convert a distance in cm to motor steps.
   * Positive = forward, negative = backward.
   */
  distanceToSteps(cm: number): number {
    return Math.round(cm * this.stepsPerCm);
  }

  /**
   * Convert motor steps to distance in cm.
   */
  stepsToDistance(steps: number): number {
    return steps / this.stepsPerCm;
  }

  /**
   * Convert an in-place rotation (degrees) to steps for each wheel.
   * Uses differential drive arc-length: arc = (degrees/360) * PI * wheelBase
   * Left wheel moves +arc steps, right wheel moves -arc steps.
   *
   * Positive degrees = counter-clockwise rotation.
   * Returns steps for the LEFT wheel (right wheel is negated).
   */
  rotationToSteps(degrees: number): number {
    const arcCm = (degrees / 360) * Math.PI * this.spec.wheelBaseCm;
    return Math.round(arcCm * this.stepsPerCm);
  }

  /**
   * Convert linear velocity in cm/s to steps per second.
   */
  velocityToStepsPerSecond(cmPerSec: number): number {
    const stepsPerSec = cmPerSec * this.stepsPerCm;
    return Math.min(Math.abs(stepsPerSec), this.spec.maxStepsPerSecond) * Math.sign(stepsPerSec);
  }

  /**
   * Calculate left/right wheel speeds (steps/s) for an arc turn.
   *
   * @param radiusCm - Turn radius in cm (positive = left turn, negative = right turn)
   * @param speedCmS - Forward speed in cm/s along the arc center
   * @returns Left and right wheel speeds in steps/s
   */
  calculateArcSpeeds(radiusCm: number, speedCmS: number): ArcSpeeds {
    const halfBase = this.spec.wheelBaseCm / 2;

    // For a left turn (positive radius):
    //   inner (left) wheel traces smaller arc: v_left = speed * (R - halfBase) / R
    //   outer (right) wheel traces larger arc: v_right = speed * (R + halfBase) / R
    const leftSpeedCmS = speedCmS * (radiusCm - halfBase) / radiusCm;
    const rightSpeedCmS = speedCmS * (radiusCm + halfBase) / radiusCm;

    return {
      left: this.velocityToStepsPerSecond(leftSpeedCmS),
      right: this.velocityToStepsPerSecond(rightSpeedCmS),
    };
  }

  /**
   * Estimate move duration in milliseconds given steps, speed, and acceleration.
   * Uses trapezoidal motion profile math.
   *
   * @param steps - Total steps to move (absolute)
   * @param speed - Max speed in steps/s
   * @param accel - Acceleration in steps/s^2 (defaults to spec max)
   * @returns Estimated duration in milliseconds
   */
  calculateMoveDuration(steps: number, speed: number, accel?: number): number {
    const absSteps = Math.abs(steps);
    const maxSpeed = Math.min(speed, this.spec.maxStepsPerSecond);
    const acceleration = accel ?? this.spec.maxAcceleration;

    if (absSteps === 0 || maxSpeed === 0 || acceleration === 0) return 0;

    // Time to accelerate to max speed
    const accelTime = maxSpeed / acceleration;
    // Steps during acceleration phase
    const accelSteps = 0.5 * acceleration * accelTime * accelTime;

    if (2 * accelSteps >= absSteps) {
      // Triangle profile — never reaches max speed
      // steps = 2 * 0.5 * a * t^2 → t = sqrt(steps / a)
      const totalTime = 2 * Math.sqrt(absSteps / acceleration);
      return Math.round(totalTime * 1000);
    }

    // Trapezoidal profile
    const cruiseSteps = absSteps - 2 * accelSteps;
    const cruiseTime = cruiseSteps / maxSpeed;
    const totalTime = 2 * accelTime + cruiseTime;
    return Math.round(totalTime * 1000);
  }

  /**
   * Convert linear velocity (cm/s) to maximum achievable cm/s
   * given motor speed limits.
   */
  maxLinearVelocityCmS(): number {
    return this.spec.maxStepsPerSecond / this.stepsPerCm;
  }

  /**
   * Convert max steps/s to RPM.
   */
  maxRPM(): number {
    return (this.spec.maxStepsPerSecond / this.spec.stepsPerRevolution) * 60;
  }
}
