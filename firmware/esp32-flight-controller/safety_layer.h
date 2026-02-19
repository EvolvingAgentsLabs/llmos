/**
 * Safety Layer for ESP32 Flight Controller
 *
 * Provides firmware-level hard safety limits that cannot be overridden
 * by the host software. This is the last line of defense.
 *
 * Features:
 * - Motor PWM clamping
 * - Emergency stop on obstacle proximity
 * - Speed reduction near obstacles
 * - Continuous motor timeout
 * - Host heartbeat timeout
 * - Battery voltage cutoff
 */

#ifndef SAFETY_LAYER_H
#define SAFETY_LAYER_H

#include <Arduino.h>

// ---------------------------------------------------------------------------
// Configuration & State
// ---------------------------------------------------------------------------

// Configuration struct — can be updated at runtime via serial command
struct SafetyConfig {
  int maxMotorPWM;                // Maximum allowed PWM (default: 200)
  int emergencyStopCm;            // Emergency stop distance in cm (default: 8)
  int speedReduceCm;              // Start reducing speed at this distance (default: 20)
  unsigned long maxContinuousMs;  // Max continuous motor runtime (default: 30000)
  unsigned long hostTimeoutMs;    // Host heartbeat timeout (default: 5000)
  float minBatteryVoltage;        // Minimum battery voltage (default: 3.0)
};

struct SafetyState {
  bool emergencyStopped;
  unsigned long motorStartTime;
  unsigned long lastHostCommandTime;
  int currentMaxPWM;
  int violations;
  bool motorRunning;
  float lastBatteryVoltage;
};

// Default configuration
static SafetyConfig safetyConfig = {
  200,    // maxMotorPWM
  8,      // emergencyStopCm
  20,     // speedReduceCm
  30000,  // maxContinuousMs
  5000,   // hostTimeoutMs
  3.0f    // minBatteryVoltage
};

static SafetyState safetyState = {
  false,  // emergencyStopped
  0,      // motorStartTime
  0,      // lastHostCommandTime
  200,    // currentMaxPWM
  0,      // violations
  false,  // motorRunning
  4.2f    // lastBatteryVoltage (assume full)
};

// ---------------------------------------------------------------------------
// Functions
// ---------------------------------------------------------------------------

/**
 * Initialize safety state. Must be called in setup().
 */
inline void safety_init() {
  safetyState.emergencyStopped = false;
  safetyState.motorStartTime = 0;
  safetyState.lastHostCommandTime = millis();
  safetyState.currentMaxPWM = safetyConfig.maxMotorPWM;
  safetyState.violations = 0;
  safetyState.motorRunning = false;
  safetyState.lastBatteryVoltage = 4.2f;
}

/**
 * Clamp a requested PWM value to the safe maximum.
 * Returns 0 if emergency stopped.
 */
inline int safety_clamp_motors(int requestedPWM) {
  if (safetyState.emergencyStopped) {
    return 0;
  }

  int clamped = requestedPWM;
  if (clamped > safetyState.currentMaxPWM) {
    clamped = safetyState.currentMaxPWM;
  }
  if (clamped > safetyConfig.maxMotorPWM) {
    clamped = safetyConfig.maxMotorPWM;
  }
  if (clamped < 0) {
    clamped = 0;
  }
  return clamped;
}

/**
 * Refresh the host heartbeat timer. Call this whenever a valid command
 * is received from the host.
 */
inline void safety_host_heartbeat() {
  safetyState.lastHostCommandTime = millis();
}

/**
 * Notify the safety layer that a motor has started running.
 */
inline void safety_motor_started() {
  safetyState.motorStartTime = millis();
  safetyState.motorRunning = true;
}

/**
 * Notify the safety layer that motors have stopped.
 */
inline void safety_motor_stopped() {
  safetyState.motorRunning = false;
}

/**
 * Trigger an emergency stop. Sets PWM ceiling to 0 and latches the
 * emergency flag until safety_reset() is called.
 */
inline void safety_emergency_stop() {
  safetyState.emergencyStopped = true;
  safetyState.currentMaxPWM = 0;
}

/**
 * Reset the emergency stop latch and restore normal operation.
 */
inline void safety_reset() {
  safetyState.emergencyStopped = false;
  safetyState.currentMaxPWM = safetyConfig.maxMotorPWM;
  safetyState.motorRunning = false;
}

/**
 * Main safety check — call every loop() iteration.
 * Returns true if the system is safe to continue, false if emergency
 * stopped.
 */
inline bool safety_check() {
  // 1. Check host heartbeat timeout
  if (millis() - safetyState.lastHostCommandTime > safetyConfig.hostTimeoutMs) {
    safety_emergency_stop();
    safetyState.violations++;
  }

  // 2. Check continuous motor runtime
  if (safetyState.motorRunning &&
      (millis() - safetyState.motorStartTime > safetyConfig.maxContinuousMs)) {
    safety_emergency_stop();
    safetyState.violations++;
  }

  // 3. If emergency stopped, report unsafe
  if (safetyState.emergencyStopped) {
    return false;
  }

  return true;
}

/**
 * Update the current obstacle distance reading. Triggers emergency stop
 * if the distance is at or below the emergency threshold, or
 * proportionally reduces the PWM ceiling if in the speed-reduce zone.
 */
inline void safety_update_distance(int distanceCm) {
  if (distanceCm <= safetyConfig.emergencyStopCm) {
    safety_emergency_stop();
    return;
  }

  if (distanceCm <= safetyConfig.speedReduceCm) {
    safetyState.currentMaxPWM = map(
      distanceCm,
      safetyConfig.emergencyStopCm,
      safetyConfig.speedReduceCm,
      0,
      safetyConfig.maxMotorPWM
    );
  } else {
    safetyState.currentMaxPWM = safetyConfig.maxMotorPWM;
  }
}

/**
 * Update the latest battery voltage reading. Triggers emergency stop
 * if voltage drops below the configured minimum.
 */
inline void safety_update_battery(float voltage) {
  safetyState.lastBatteryVoltage = voltage;
  if (voltage < safetyConfig.minBatteryVoltage) {
    safety_emergency_stop();
  }
}

/**
 * Replace the running safety configuration. Recalculates the current
 * PWM ceiling based on the new limits.
 */
inline void safety_update_config(SafetyConfig newConfig) {
  safetyConfig = newConfig;
  if (!safetyState.emergencyStopped) {
    safetyState.currentMaxPWM = safetyConfig.maxMotorPWM;
  }
}

#endif // SAFETY_LAYER_H
