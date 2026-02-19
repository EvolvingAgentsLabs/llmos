import {
  DEFAULT_FIRMWARE_SAFETY_CONFIG,
  serializeSafetyConfig,
  parseSafetyStatus,
  validateSafetyConfig,
  clampMotorPWM,
  FirmwareSafetyConfig,
  FirmwareSafetyStatus,
} from '../../../lib/hal/firmware-safety-config';

// =============================================================================
// serializeSafetyConfig
// =============================================================================

describe('serializeSafetyConfig', () => {
  it('produces valid JSON', () => {
    const json = serializeSafetyConfig(DEFAULT_FIRMWARE_SAFETY_CONFIG);
    const parsed = JSON.parse(json);

    expect(parsed.action).toBe('safety_config');
    expect(parsed.params.maxMotorPWM).toBe(200);
    expect(parsed.params.emergencyStopCm).toBe(8);
    expect(parsed.params.speedReduceCm).toBe(20);
    expect(parsed.params.maxContinuousMs).toBe(30000);
    expect(parsed.params.hostTimeoutMs).toBe(5000);
    expect(parsed.params.minBatteryVoltage).toBe(3.0);
  });
});

// =============================================================================
// parseSafetyStatus
// =============================================================================

describe('parseSafetyStatus', () => {
  it('parses valid response', () => {
    const statusObj: FirmwareSafetyStatus = {
      emergencyStopped: false,
      motorRunning: true,
      currentMaxPWM: 150,
      violations: 2,
      motorRuntimeMs: 12345,
      lastBatteryVoltage: 3.7,
      hostTimeoutRemaining: 3200,
    };
    const json = JSON.stringify(statusObj);
    const result = parseSafetyStatus(json);

    expect(result).not.toBeNull();
    expect(result!.emergencyStopped).toBe(false);
    expect(result!.motorRunning).toBe(true);
    expect(result!.currentMaxPWM).toBe(150);
    expect(result!.violations).toBe(2);
    expect(result!.motorRuntimeMs).toBe(12345);
    expect(result!.lastBatteryVoltage).toBe(3.7);
    expect(result!.hostTimeoutRemaining).toBe(3200);
  });

  it('returns null for invalid JSON', () => {
    expect(parseSafetyStatus('not json at all {')).toBeNull();
    expect(parseSafetyStatus('')).toBeNull();
    expect(parseSafetyStatus('{}')).toBeNull();
    expect(parseSafetyStatus('{"emergencyStopped": "yes"}')).toBeNull();
  });
});

// =============================================================================
// validateSafetyConfig
// =============================================================================

describe('validateSafetyConfig', () => {
  it('accepts valid config', () => {
    const result = validateSafetyConfig(DEFAULT_FIRMWARE_SAFETY_CONFIG);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects maxMotorPWM > 255', () => {
    const result = validateSafetyConfig({ maxMotorPWM: 300 });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('maxMotorPWM'))).toBe(true);
  });

  it('rejects emergencyStopCm >= speedReduceCm', () => {
    const result = validateSafetyConfig({
      emergencyStopCm: 25,
      speedReduceCm: 20,
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('speedReduceCm'))).toBe(true);
  });

  it('rejects negative values', () => {
    const result = validateSafetyConfig({
      maxMotorPWM: -10,
      emergencyStopCm: -5,
      maxContinuousMs: -1000,
      hostTimeoutMs: -500,
      minBatteryVoltage: -1.0,
    });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(4);
    expect(result.errors.some((e) => e.includes('maxMotorPWM'))).toBe(true);
    expect(result.errors.some((e) => e.includes('emergencyStopCm'))).toBe(true);
    expect(result.errors.some((e) => e.includes('maxContinuousMs'))).toBe(true);
    expect(result.errors.some((e) => e.includes('hostTimeoutMs'))).toBe(true);
    expect(result.errors.some((e) => e.includes('minBatteryVoltage'))).toBe(true);
  });
});

// =============================================================================
// clampMotorPWM
// =============================================================================

describe('clampMotorPWM', () => {
  const config: FirmwareSafetyConfig = { ...DEFAULT_FIRMWARE_SAFETY_CONFIG };

  it('clamps to maxMotorPWM', () => {
    // Requesting 255 when max is 200 should clamp to 200
    expect(clampMotorPWM(255, config)).toBe(200);
  });

  it('returns 0 at emergency distance', () => {
    // Distance <= emergencyStopCm (8) should yield 0
    expect(clampMotorPWM(200, config, 8)).toBe(0);
    expect(clampMotorPWM(200, config, 5)).toBe(0);
    expect(clampMotorPWM(200, config, 0)).toBe(0);
  });

  it('reduces proportionally in speed reduce zone', () => {
    // Distance between emergencyStopCm (8) and speedReduceCm (20)
    // At midpoint 14: progress = 14 - 8 = 6, range = 20 - 8 = 12
    // effectiveMax = floor((6/12) * 200) = 100
    const result = clampMotorPWM(200, config, 14);
    expect(result).toBe(100);

    // At distance 9 (just above emergency): progress = 1, range = 12
    // effectiveMax = floor((1/12) * 200) = floor(16.67) = 16
    const resultNearEmergency = clampMotorPWM(200, config, 9);
    expect(resultNearEmergency).toBe(16);

    // At distance 19 (just below speedReduceCm): progress = 11, range = 12
    // effectiveMax = floor((11/12) * 200) = floor(183.33) = 183
    const resultNearFull = clampMotorPWM(200, config, 19);
    expect(resultNearFull).toBe(183);
  });

  it('returns full speed above reduce distance', () => {
    // Distance > speedReduceCm (20) should return the requested PWM (up to max)
    expect(clampMotorPWM(150, config, 25)).toBe(150);
    expect(clampMotorPWM(200, config, 100)).toBe(200);
    // Still clamped to maxMotorPWM even at large distance
    expect(clampMotorPWM(255, config, 100)).toBe(200);
  });
});

// =============================================================================
// DEFAULT_FIRMWARE_SAFETY_CONFIG
// =============================================================================

describe('DEFAULT_FIRMWARE_SAFETY_CONFIG', () => {
  it('has correct defaults', () => {
    expect(DEFAULT_FIRMWARE_SAFETY_CONFIG.maxMotorPWM).toBe(200);
    expect(DEFAULT_FIRMWARE_SAFETY_CONFIG.emergencyStopCm).toBe(8);
    expect(DEFAULT_FIRMWARE_SAFETY_CONFIG.speedReduceCm).toBe(20);
    expect(DEFAULT_FIRMWARE_SAFETY_CONFIG.maxContinuousMs).toBe(30000);
    expect(DEFAULT_FIRMWARE_SAFETY_CONFIG.hostTimeoutMs).toBe(5000);
    expect(DEFAULT_FIRMWARE_SAFETY_CONFIG.minBatteryVoltage).toBe(3.0);
  });
});
