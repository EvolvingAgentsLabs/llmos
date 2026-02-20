/**
 * Firmware Safety Config — TypeScript mirror of safety_layer.h
 *
 * Enables the host to configure and read firmware safety parameters
 * via the serial protocol.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FirmwareSafetyConfig {
  maxMotorPWM: number;
  emergencyStopCm: number;
  speedReduceCm: number;
  maxContinuousMs: number;
  hostTimeoutMs: number;
  minBatteryVoltage: number;
}

export interface FirmwareSafetyStatus {
  emergencyStopped: boolean;
  motorRunning: boolean;
  currentMaxPWM: number;
  violations: number;
  motorRuntimeMs: number;
  lastBatteryVoltage: number;
  hostTimeoutRemaining: number;
}

// ---------------------------------------------------------------------------
// Default config
// ---------------------------------------------------------------------------

export const DEFAULT_FIRMWARE_SAFETY_CONFIG: FirmwareSafetyConfig = {
  maxMotorPWM: 200,
  emergencyStopCm: 8,
  speedReduceCm: 20,
  maxContinuousMs: 30000,
  hostTimeoutMs: 5000,
  minBatteryVoltage: 3.0,
};

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

/**
 * Serialize a FirmwareSafetyConfig into a JSON command string that the
 * ESP32 firmware understands.
 */
export function serializeSafetyConfig(config: FirmwareSafetyConfig): string {
  return JSON.stringify({
    action: 'safety_config',
    params: {
      maxMotorPWM: config.maxMotorPWM,
      emergencyStopCm: config.emergencyStopCm,
      speedReduceCm: config.speedReduceCm,
      maxContinuousMs: config.maxContinuousMs,
      hostTimeoutMs: config.hostTimeoutMs,
      minBatteryVoltage: config.minBatteryVoltage,
    },
  });
}

/**
 * Parse a JSON string received from the firmware into a
 * FirmwareSafetyStatus object. Returns null if the string is not valid
 * JSON or is missing required fields.
 */
export function parseSafetyStatus(json: string): FirmwareSafetyStatus | null {
  try {
    const parsed = JSON.parse(json);

    if (
      typeof parsed.emergencyStopped !== 'boolean' ||
      typeof parsed.motorRunning !== 'boolean' ||
      typeof parsed.currentMaxPWM !== 'number' ||
      typeof parsed.violations !== 'number' ||
      typeof parsed.motorRuntimeMs !== 'number' ||
      typeof parsed.lastBatteryVoltage !== 'number' ||
      typeof parsed.hostTimeoutRemaining !== 'number'
    ) {
      return null;
    }

    return {
      emergencyStopped: parsed.emergencyStopped,
      motorRunning: parsed.motorRunning,
      currentMaxPWM: parsed.currentMaxPWM,
      violations: parsed.violations,
      motorRuntimeMs: parsed.motorRuntimeMs,
      lastBatteryVoltage: parsed.lastBatteryVoltage,
      hostTimeoutRemaining: parsed.hostTimeoutRemaining,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validate a (possibly partial) FirmwareSafetyConfig. Returns an object
 * indicating whether the config is valid and, if not, a list of
 * human-readable error strings.
 */
export function validateSafetyConfig(
  config: Partial<FirmwareSafetyConfig>,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // maxMotorPWM: 0-255
  if (config.maxMotorPWM !== undefined) {
    if (config.maxMotorPWM < 0) {
      errors.push('maxMotorPWM must be >= 0');
    }
    if (config.maxMotorPWM > 255) {
      errors.push('maxMotorPWM must be <= 255');
    }
  }

  // emergencyStopCm: 1-100
  if (config.emergencyStopCm !== undefined) {
    if (config.emergencyStopCm < 1) {
      errors.push('emergencyStopCm must be >= 1');
    }
    if (config.emergencyStopCm > 100) {
      errors.push('emergencyStopCm must be <= 100');
    }
  }

  // speedReduceCm must be > emergencyStopCm
  if (
    config.speedReduceCm !== undefined &&
    config.emergencyStopCm !== undefined
  ) {
    if (config.speedReduceCm <= config.emergencyStopCm) {
      errors.push('speedReduceCm must be greater than emergencyStopCm');
    }
  }

  // speedReduceCm standalone range
  if (config.speedReduceCm !== undefined) {
    if (config.speedReduceCm < 1) {
      errors.push('speedReduceCm must be >= 1');
    }
  }

  // maxContinuousMs: positive
  if (config.maxContinuousMs !== undefined) {
    if (config.maxContinuousMs < 0) {
      errors.push('maxContinuousMs must be >= 0');
    }
  }

  // hostTimeoutMs: positive
  if (config.hostTimeoutMs !== undefined) {
    if (config.hostTimeoutMs < 0) {
      errors.push('hostTimeoutMs must be >= 0');
    }
  }

  // minBatteryVoltage: non-negative
  if (config.minBatteryVoltage !== undefined) {
    if (config.minBatteryVoltage < 0) {
      errors.push('minBatteryVoltage must be >= 0');
    }
  }

  return { valid: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// Stepper Safety (V1 Hardware)
// ---------------------------------------------------------------------------

export interface StepperSafetyConfig {
  maxStepsPerSecond: number;
  maxContinuousSteps: number;
  hostHeartbeatMs: number;
  maxCoilCurrentMa: number;
}

export const DEFAULT_STEPPER_SAFETY_CONFIG: StepperSafetyConfig = {
  maxStepsPerSecond: 1024,
  maxContinuousSteps: 40960,
  hostHeartbeatMs: 2000,
  maxCoilCurrentMa: 300,
};

export function serializeStepperSafetyConfig(config: StepperSafetyConfig): string {
  return JSON.stringify({
    action: 'stepper_safety_config',
    params: {
      maxStepsPerSecond: config.maxStepsPerSecond,
      maxContinuousSteps: config.maxContinuousSteps,
      hostHeartbeatMs: config.hostHeartbeatMs,
      maxCoilCurrentMa: config.maxCoilCurrentMa,
    },
  });
}

export function validateStepperSafetyConfig(
  config: Partial<StepperSafetyConfig>,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (config.maxStepsPerSecond !== undefined) {
    if (config.maxStepsPerSecond < 1) errors.push('maxStepsPerSecond must be >= 1');
    if (config.maxStepsPerSecond > 2048) errors.push('maxStepsPerSecond must be <= 2048');
  }

  if (config.maxContinuousSteps !== undefined) {
    if (config.maxContinuousSteps < 1) errors.push('maxContinuousSteps must be >= 1');
  }

  if (config.hostHeartbeatMs !== undefined) {
    if (config.hostHeartbeatMs < 500) errors.push('hostHeartbeatMs must be >= 500');
    if (config.hostHeartbeatMs > 10000) errors.push('hostHeartbeatMs must be <= 10000');
  }

  if (config.maxCoilCurrentMa !== undefined) {
    if (config.maxCoilCurrentMa < 0) errors.push('maxCoilCurrentMa must be >= 0');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Clamp stepper speed to safe limit (mirrors firmware logic).
 */
export function clampStepperSpeed(
  requestedSpeed: number,
  config: StepperSafetyConfig,
): number {
  if (requestedSpeed < 0) return 0;
  if (requestedSpeed > config.maxStepsPerSecond) return config.maxStepsPerSecond;
  return requestedSpeed;
}

/**
 * Clamp step count to safe limit (mirrors firmware logic).
 */
export function clampStepperSteps(
  requestedSteps: number,
  config: StepperSafetyConfig,
): number {
  if (requestedSteps > config.maxContinuousSteps) return config.maxContinuousSteps;
  if (requestedSteps < -config.maxContinuousSteps) return -config.maxContinuousSteps;
  return requestedSteps;
}

// ---------------------------------------------------------------------------
// Host-side PWM clamping (mirrors firmware logic)
// ---------------------------------------------------------------------------

/**
 * TypeScript mirror of the firmware PWM clamping logic. Useful for
 * host-side pre-validation before sending a motor command.
 *
 * @param requestedPWM - The PWM value the host wants to send.
 * @param config       - The active safety configuration.
 * @param distanceCm   - Optional current obstacle distance in cm.
 * @returns The clamped PWM value that the firmware would actually apply.
 */
export function clampMotorPWM(
  requestedPWM: number,
  config: FirmwareSafetyConfig,
  distanceCm?: number,
): number {
  // Determine effective max PWM based on distance
  let effectiveMax = config.maxMotorPWM;

  if (distanceCm !== undefined) {
    if (distanceCm <= config.emergencyStopCm) {
      return 0;
    }
    if (distanceCm <= config.speedReduceCm) {
      // Linear interpolation matching Arduino map():
      // map(distanceCm, emergencyStopCm, speedReduceCm, 0, maxMotorPWM)
      const range = config.speedReduceCm - config.emergencyStopCm;
      const progress = distanceCm - config.emergencyStopCm;
      effectiveMax = Math.floor((progress / range) * config.maxMotorPWM);
    }
  }

  // Clamp
  let clamped = requestedPWM;
  if (clamped > effectiveMax) {
    clamped = effectiveMax;
  }
  if (clamped > config.maxMotorPWM) {
    clamped = config.maxMotorPWM;
  }
  if (clamped < 0) {
    clamped = 0;
  }

  return clamped;
}
