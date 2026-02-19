/**
 * BytecodeExecutionTarget — Abstraction for sim/hardware execution
 *
 * Provides a unified interface for executing LLMBytecode instructions
 * against either a simulation HAL or physical ESP32 hardware.
 *
 * Two adapters are provided:
 * - SimulationBytecodeTarget: wraps a simulation HAL instance
 * - ESP32BytecodeTarget: wraps a physical HAL instance (ESP32-specific)
 *
 * Both translate bytecode-level commands (setMotors, setLED, readSensors, wait)
 * into the corresponding HAL subsystem calls.
 */

import type { HardwareAbstractionLayer } from '../hal/types';

// =============================================================================
// BytecodeExecutionTarget Interface
// =============================================================================

/**
 * Abstraction for executing bytecode instructions against a target.
 * The interpreter calls these methods; the target translates them
 * to the appropriate HAL or hardware API calls.
 */
export interface BytecodeExecutionTarget {
  readonly name: string;

  /**
   * Set motor power for one or both wheels.
   * @param target - Which wheel(s) to control
   * @param action - Direction: forward, backward, or stop
   * @param speed - Speed value 0-255
   * @param durationMs - Optional duration before auto-stop
   */
  setMotors(
    target: 'left_wheel' | 'right_wheel' | 'both',
    action: 'forward' | 'backward' | 'stop',
    speed: number,
    durationMs?: number
  ): Promise<void>;

  /**
   * Stop all motors immediately.
   */
  stopMotors(): Promise<void>;

  /**
   * Set LED color with optional duration.
   * @param r - Red 0-255
   * @param g - Green 0-255
   * @param b - Blue 0-255
   * @param durationMs - Optional duration before LED turns off
   */
  setLED(r: number, g: number, b: number, durationMs?: number): Promise<void>;

  /**
   * Read sensor data from the specified sensor or all sensors.
   * @param target - Which sensor to read
   * @returns Sensor data as key-value pairs
   */
  readSensors(
    target: 'camera' | 'distance' | 'imu' | 'battery' | 'all'
  ): Promise<Record<string, unknown>>;

  /**
   * Wait for specified duration.
   * @param durationMs - Duration in milliseconds
   */
  wait(durationMs: number): Promise<void>;
}

// =============================================================================
// SimulationBytecodeTarget
// =============================================================================

/**
 * Bytecode execution target that wraps a simulation HAL instance.
 * Translates bytecode motor/sensor/LED commands into HAL subsystem calls.
 */
export class SimulationBytecodeTarget implements BytecodeExecutionTarget {
  readonly name = 'simulation';
  private hal: HardwareAbstractionLayer;

  constructor(hal: HardwareAbstractionLayer) {
    this.hal = hal;
  }

  async setMotors(
    target: 'left_wheel' | 'right_wheel' | 'both',
    action: 'forward' | 'backward' | 'stop',
    speed: number,
    durationMs?: number
  ): Promise<void> {
    // Convert action to signed power value
    let power: number;
    if (action === 'forward') {
      power = speed;
    } else if (action === 'backward') {
      power = -speed;
    } else {
      power = 0;
    }

    // Determine left/right wheel power based on target
    let left: number;
    let right: number;

    if (target === 'both') {
      left = power;
      right = power;
    } else if (target === 'left_wheel') {
      left = power;
      right = 0;
    } else {
      // right_wheel
      left = 0;
      right = power;
    }

    await this.hal.locomotion.drive(left, right, durationMs);
  }

  async stopMotors(): Promise<void> {
    await this.hal.locomotion.drive(0, 0);
  }

  async setLED(r: number, g: number, b: number, durationMs?: number): Promise<void> {
    await this.hal.communication.setLED(r, g, b);

    // If duration specified, turn off LED after the duration
    if (durationMs !== undefined && durationMs > 0) {
      await new Promise<void>(resolve => setTimeout(resolve, durationMs));
      await this.hal.communication.setLED(0, 0, 0);
    }
  }

  async readSensors(
    target: 'camera' | 'distance' | 'imu' | 'battery' | 'all'
  ): Promise<Record<string, unknown>> {
    const result: Record<string, unknown> = {};

    if (target === 'distance' || target === 'all') {
      result.distance = await this.hal.vision.getDistanceSensors();
    }

    if (target === 'imu' || target === 'all') {
      result.imu = await this.hal.vision.getIMU();
    }

    if (target === 'camera' || target === 'all') {
      result.camera = await this.hal.vision.captureFrame();
    }

    if (target === 'battery' || target === 'all') {
      result.battery = { level: 100 };
    }

    return result;
  }

  async wait(durationMs: number): Promise<void> {
    await new Promise<void>(resolve => setTimeout(resolve, durationMs));
  }
}

// =============================================================================
// ESP32BytecodeTarget
// =============================================================================

/**
 * Bytecode execution target for ESP32 physical hardware.
 * Currently mirrors SimulationBytecodeTarget behavior but is kept
 * separate to allow ESP32-specific optimizations and behaviors in the future
 * (e.g., direct UART motor commands, hardware PWM LED control, etc.).
 */
export class ESP32BytecodeTarget implements BytecodeExecutionTarget {
  readonly name = 'esp32';
  private hal: HardwareAbstractionLayer;

  constructor(hal: HardwareAbstractionLayer) {
    this.hal = hal;
  }

  async setMotors(
    target: 'left_wheel' | 'right_wheel' | 'both',
    action: 'forward' | 'backward' | 'stop',
    speed: number,
    durationMs?: number
  ): Promise<void> {
    let power: number;
    if (action === 'forward') {
      power = speed;
    } else if (action === 'backward') {
      power = -speed;
    } else {
      power = 0;
    }

    let left: number;
    let right: number;

    if (target === 'both') {
      left = power;
      right = power;
    } else if (target === 'left_wheel') {
      left = power;
      right = 0;
    } else {
      left = 0;
      right = power;
    }

    await this.hal.locomotion.drive(left, right, durationMs);
  }

  async stopMotors(): Promise<void> {
    await this.hal.locomotion.drive(0, 0);
  }

  async setLED(r: number, g: number, b: number, durationMs?: number): Promise<void> {
    await this.hal.communication.setLED(r, g, b);

    if (durationMs !== undefined && durationMs > 0) {
      await new Promise<void>(resolve => setTimeout(resolve, durationMs));
      await this.hal.communication.setLED(0, 0, 0);
    }
  }

  async readSensors(
    target: 'camera' | 'distance' | 'imu' | 'battery' | 'all'
  ): Promise<Record<string, unknown>> {
    const result: Record<string, unknown> = {};

    if (target === 'distance' || target === 'all') {
      result.distance = await this.hal.vision.getDistanceSensors();
    }

    if (target === 'imu' || target === 'all') {
      result.imu = await this.hal.vision.getIMU();
    }

    if (target === 'camera' || target === 'all') {
      result.camera = await this.hal.vision.captureFrame();
    }

    if (target === 'battery' || target === 'all') {
      result.battery = { level: 100 };
    }

    return result;
  }

  async wait(durationMs: number): Promise<void> {
    await new Promise<void>(resolve => setTimeout(resolve, durationMs));
  }
}
