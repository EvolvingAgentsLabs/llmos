/**
 * HAL Simulation Adapter
 *
 * Implements the Hardware Abstraction Layer interface for the
 * Three.js/physics simulation environment.
 *
 * This allows the same skill files to run in simulation before
 * deploying to physical hardware - the "Dreaming" capability.
 */

import { logger } from '@/lib/debug/logger';
import {
  HardwareAbstractionLayer,
  HALMode,
  HALToolResult,
  LocomotionInterface,
  VisionInterface,
  ManipulationInterface,
  CommunicationInterface,
  SafetyInterface,
  DeviceTelemetry,
} from './types';

/**
 * Reference to the cube robot simulator (dynamically imported)
 */
export interface SimulatorReference {
  setLeftMotor(power: number): void;
  setRightMotor(power: number): void;
  setMotors(left: number, right: number): void;
  stopMotors(): void;
  setLED(r: number, g: number, b: number): void;
  getPosition(): { x: number; y: number; z: number };
  getRotation(): { x: number; y: number; z: number };
  getVelocity(): { linear: number; angular: number };
  getSensors(): {
    distance: { front: number; left: number; right: number };
    line: number[];
    battery: number;
  };
  captureCamera?(): string;
}

/**
 * Locomotion implementation for simulation
 */
class SimulationLocomotion implements LocomotionInterface {
  constructor(
    private simulator: SimulatorReference,
    private onUpdate: () => void
  ) {}

  async drive(left: number, right: number, durationMs?: number): Promise<HALToolResult> {
    try {
      // Clamp values to valid range
      const clampedLeft = Math.max(-255, Math.min(255, left));
      const clampedRight = Math.max(-255, Math.min(255, right));

      this.simulator.setMotors(clampedLeft, clampedRight);
      this.onUpdate();

      // If duration specified, schedule stop
      if (durationMs && durationMs > 0) {
        setTimeout(() => {
          this.simulator.stopMotors();
          this.onUpdate();
        }, durationMs);
      }

      return {
        success: true,
        data: { left: clampedLeft, right: clampedRight, durationMs },
        timestamp: Date.now(),
        mode: 'simulation',
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        timestamp: Date.now(),
        mode: 'simulation',
      };
    }
  }

  async moveTo(x: number, y: number, z: number, speed?: number): Promise<HALToolResult> {
    // In simulation, this would use pathfinding
    // For now, log the target and return success
    logger.debug('hal', `moveTo requested: (${x}, ${y}, ${z}) at speed ${speed}`);

    return {
      success: true,
      data: { target: { x, y, z }, speed },
      timestamp: Date.now(),
      mode: 'simulation',
    };
  }

  async rotate(direction: 'left' | 'right', degrees: number): Promise<HALToolResult> {
    try {
      const startTime = Date.now();
      const currentRot = this.simulator.getRotation();
      const startYaw = currentRot.y;
      const deltaRad = (Math.abs(degrees) * Math.PI) / 180;
      const targetYaw = this.normalizeAngle(
        startYaw + (direction === 'right' ? deltaRad : -deltaRad)
      );

      const FAST_PWM = 80;
      const SLOW_PWM = 45;
      const TOLERANCE = 0.087; // ~5 degrees
      const SLOW_THRESHOLD = 0.26; // ~15 degrees
      const POLL_MS = 10;
      const TIMEOUT = 10000;

      const leftSign = direction === 'right' ? -1 : 1;
      const rightSign = direction === 'right' ? 1 : -1;

      this.simulator.setMotors(leftSign * FAST_PWM, rightSign * FAST_PWM);
      this.onUpdate();

      while (Date.now() - startTime < TIMEOUT) {
        await new Promise(r => setTimeout(r, POLL_MS));
        const rot = this.simulator.getRotation();
        const remaining = Math.abs(this.normalizeAngle(targetYaw - rot.y));

        if (remaining < TOLERANCE) {
          this.simulator.stopMotors();
          this.onUpdate();
          const finalRot = this.simulator.getRotation();
          const finalPos = this.simulator.getPosition();
          return {
            success: true,
            data: {
              message: `Rotated ${direction} ${degrees}°`,
              finalPose: { position: finalPos, rotation: finalRot },
            },
            timestamp: Date.now(),
            mode: 'simulation',
            executionTime: Date.now() - startTime,
          };
        }

        if (remaining < SLOW_THRESHOLD) {
          this.simulator.setMotors(leftSign * SLOW_PWM, rightSign * SLOW_PWM);
        }
      }

      this.simulator.stopMotors();
      this.onUpdate();
      return {
        success: false,
        error: 'Rotation timed out',
        timestamp: Date.now(),
        mode: 'simulation',
        executionTime: Date.now() - startTime,
      };
    } catch (error) {
      this.simulator.stopMotors();
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        timestamp: Date.now(),
        mode: 'simulation',
      };
    }
  }

  async moveForward(distanceCm: number): Promise<HALToolResult> {
    return this.executeLinearMove(distanceCm, 'forward');
  }

  async moveBackward(distanceCm: number): Promise<HALToolResult> {
    return this.executeLinearMove(distanceCm, 'backward');
  }

  private async executeLinearMove(
    distanceCm: number,
    direction: 'forward' | 'backward'
  ): Promise<HALToolResult> {
    try {
      const startTime = Date.now();
      const startPos = this.simulator.getPosition();
      const targetM = distanceCm / 100;
      const pwm = direction === 'forward' ? 80 : -80;
      const TOLERANCE = 0.01; // 1cm
      const POLL_MS = 10;
      const TIMEOUT = 10000;

      this.simulator.setMotors(pwm, pwm);
      this.onUpdate();

      let lastDist = 0;
      let stuckCount = 0;

      while (Date.now() - startTime < TIMEOUT) {
        await new Promise(r => setTimeout(r, POLL_MS));
        const pos = this.simulator.getPosition();
        const dx = pos.x - startPos.x;
        const dy = pos.y - startPos.y;
        const dz = pos.z - startPos.z;
        const traveled = Math.sqrt(dx * dx + dy * dy + dz * dz);

        if (traveled >= targetM - TOLERANCE) {
          this.simulator.stopMotors();
          this.onUpdate();
          return {
            success: true,
            data: {
              message: `Moved ${direction} ${(traveled * 100).toFixed(1)}cm`,
              finalPose: { position: pos, rotation: this.simulator.getRotation() },
            },
            timestamp: Date.now(),
            mode: 'simulation',
            executionTime: Date.now() - startTime,
          };
        }

        // Stuck detection
        if (Math.abs(traveled - lastDist) < 0.001) {
          stuckCount++;
          if (stuckCount > 50) {
            this.simulator.stopMotors();
            this.onUpdate();
            return {
              success: false,
              error: `Blocked after ${(traveled * 100).toFixed(1)}cm`,
              data: { finalPose: { position: pos, rotation: this.simulator.getRotation() } },
              timestamp: Date.now(),
              mode: 'simulation',
              executionTime: Date.now() - startTime,
            };
          }
        } else {
          stuckCount = 0;
          lastDist = traveled;
        }
      }

      this.simulator.stopMotors();
      this.onUpdate();
      return {
        success: false,
        error: 'Movement timed out',
        timestamp: Date.now(),
        mode: 'simulation',
        executionTime: Date.now() - startTime,
      };
    } catch (error) {
      this.simulator.stopMotors();
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        timestamp: Date.now(),
        mode: 'simulation',
      };
    }
  }

  async stop(): Promise<HALToolResult> {
    try {
      this.simulator.stopMotors();
      this.onUpdate();

      return {
        success: true,
        timestamp: Date.now(),
        mode: 'simulation',
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        timestamp: Date.now(),
        mode: 'simulation',
      };
    }
  }

  private normalizeAngle(angle: number): number {
    while (angle > Math.PI) angle -= 2 * Math.PI;
    while (angle < -Math.PI) angle += 2 * Math.PI;
    return angle;
  }

  async getPose(): Promise<{
    position: { x: number; y: number; z: number };
    rotation: { yaw: number; pitch: number; roll: number };
    velocity: { linear: number; angular: number };
  }> {
    const pos = this.simulator.getPosition();
    const rot = this.simulator.getRotation();
    const vel = this.simulator.getVelocity();

    return {
      position: pos,
      rotation: { yaw: rot.y, pitch: rot.x, roll: rot.z },
      velocity: vel,
    };
  }
}

/**
 * Vision implementation for simulation
 */
class SimulationVision implements VisionInterface {
  constructor(
    private simulator: SimulatorReference,
    private canvasCapture?: () => string
  ) {}

  async captureFrame(): Promise<string> {
    // Try simulator's camera first
    if (this.simulator.captureCamera) {
      return this.simulator.captureCamera();
    }

    // Fall back to canvas capture
    if (this.canvasCapture) {
      return this.canvasCapture();
    }

    // Return placeholder
    return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  }

  async scan(mode?: 'full' | 'targeted' | 'quick'): Promise<{
    objects: Array<{
      id: string;
      type: string;
      position: { x: number; y: number; z: number };
      confidence: number;
    }>;
    clearAhead: boolean;
    nearestObstacle?: number;
  }> {
    const sensors = this.simulator.getSensors();

    // Determine if path is clear based on front sensor
    const clearAhead = sensors.distance.front > 30; // 30cm threshold

    // Find nearest obstacle
    const distances = [sensors.distance.front, sensors.distance.left, sensors.distance.right];
    const nearestObstacle = Math.min(...distances.filter((d) => d > 0));

    return {
      objects: [], // Would be populated by scene graph in full implementation
      clearAhead,
      nearestObstacle: nearestObstacle === Infinity ? undefined : nearestObstacle,
    };
  }

  async getDistanceSensors(): Promise<{
    front: number;
    left: number;
    right: number;
    frontLeft?: number;
    frontRight?: number;
  }> {
    const sensors = this.simulator.getSensors();
    return sensors.distance;
  }

  async getLineSensors(): Promise<number[]> {
    const sensors = this.simulator.getSensors();
    return sensors.line;
  }

  async getIMU(): Promise<{
    acceleration: { x: number; y: number; z: number };
    gyroscope: { x: number; y: number; z: number };
    heading: number;
  }> {
    const rot = this.simulator.getRotation();
    const vel = this.simulator.getVelocity();

    return {
      acceleration: { x: 0, y: 0, z: 9.81 }, // Simulated gravity
      gyroscope: { x: 0, y: vel.angular, z: 0 },
      heading: rot.y * (180 / Math.PI), // Convert to degrees
    };
  }
}

/**
 * Communication implementation for simulation
 */
class SimulationCommunication implements CommunicationInterface {
  constructor(
    private simulator: SimulatorReference,
    private onUpdate: () => void
  ) {}

  async speak(text: string, urgency?: 'info' | 'warning' | 'alert'): Promise<HALToolResult> {
    // Use Web Speech API in browser
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(text);

      switch (urgency) {
        case 'warning':
          utterance.rate = 1.1;
          utterance.pitch = 1.2;
          break;
        case 'alert':
          utterance.rate = 1.3;
          utterance.pitch = 1.4;
          break;
        default:
          utterance.rate = 1.0;
          utterance.pitch = 1.0;
      }

      window.speechSynthesis.speak(utterance);
    }

    logger.info('hal', `Robot speaks: "${text}" (${urgency || 'info'})`);

    return {
      success: true,
      data: { text, urgency },
      timestamp: Date.now(),
      mode: 'simulation',
    };
  }

  async setLED(
    r: number,
    g: number,
    b: number,
    pattern?: 'solid' | 'blink' | 'pulse'
  ): Promise<HALToolResult> {
    try {
      this.simulator.setLED(r, g, b);
      this.onUpdate();

      // Handle patterns (solid is default)
      if (pattern === 'blink') {
        // Implement blinking
        let isOn = true;
        const interval = setInterval(() => {
          isOn = !isOn;
          this.simulator.setLED(isOn ? r : 0, isOn ? g : 0, isOn ? b : 0);
          this.onUpdate();
        }, 500);

        // Auto-stop after 5 seconds
        setTimeout(() => {
          clearInterval(interval);
          this.simulator.setLED(r, g, b);
          this.onUpdate();
        }, 5000);
      }

      return {
        success: true,
        data: { r, g, b, pattern },
        timestamp: Date.now(),
        mode: 'simulation',
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        timestamp: Date.now(),
        mode: 'simulation',
      };
    }
  }

  async playSound(soundId: string): Promise<HALToolResult> {
    logger.info('hal', `Playing sound: ${soundId}`);

    return {
      success: true,
      data: { soundId },
      timestamp: Date.now(),
      mode: 'simulation',
    };
  }

  log(message: string, level?: 'debug' | 'info' | 'warn' | 'error'): void {
    switch (level) {
      case 'debug':
        logger.debug('hal', message);
        break;
      case 'warn':
        logger.warn('hal', message);
        break;
      case 'error':
        logger.error('hal', message);
        break;
      default:
        logger.info('hal', message);
    }
  }
}

/**
 * Safety implementation for simulation
 */
class SimulationSafety implements SafetyInterface {
  private emergencyStopped = false;
  private errors: string[] = [];

  constructor(
    private simulator: SimulatorReference,
    private onUpdate: () => void
  ) {}

  async emergencyStop(reason?: string): Promise<HALToolResult> {
    this.emergencyStopped = true;
    this.simulator.stopMotors();
    this.simulator.setLED(255, 0, 0); // Red LED
    this.onUpdate();

    if (reason) {
      this.errors.push(`Emergency stop: ${reason}`);
    }

    logger.warn('hal', `EMERGENCY STOP: ${reason || 'No reason provided'}`);

    return {
      success: true,
      data: { reason },
      timestamp: Date.now(),
      mode: 'simulation',
    };
  }

  isEmergencyStopped(): boolean {
    return this.emergencyStopped;
  }

  async resetEmergencyStop(): Promise<HALToolResult> {
    this.emergencyStopped = false;
    this.simulator.setLED(0, 255, 0); // Green LED
    this.onUpdate();

    logger.info('hal', 'Emergency stop reset');

    return {
      success: true,
      timestamp: Date.now(),
      mode: 'simulation',
    };
  }

  getSafetyStatus(): {
    emergencyStopped: boolean;
    batteryLevel: number;
    temperature?: number;
    errors: string[];
  } {
    const sensors = this.simulator.getSensors();

    return {
      emergencyStopped: this.emergencyStopped,
      batteryLevel: sensors.battery,
      temperature: 25, // Simulated room temperature
      errors: [...this.errors],
    };
  }
}

/**
 * Complete simulation adapter
 */
export class SimulationHAL implements HardwareAbstractionLayer {
  readonly mode: HALMode = 'simulation';
  readonly locomotion: LocomotionInterface;
  readonly vision: VisionInterface;
  readonly manipulation?: ManipulationInterface;
  readonly communication: CommunicationInterface;
  readonly safety: SafetyInterface;

  private deviceId: string;
  private simulator: SimulatorReference;
  private ready = false;
  private onUpdateCallback: () => void;

  constructor(
    simulator: SimulatorReference,
    options?: {
      deviceId?: string;
      onUpdate?: () => void;
      canvasCapture?: () => string;
    }
  ) {
    this.simulator = simulator;
    this.deviceId = options?.deviceId || `sim-${Date.now()}`;
    this.onUpdateCallback = options?.onUpdate || (() => {});

    // Initialize subsystems
    this.locomotion = new SimulationLocomotion(simulator, this.onUpdateCallback);
    this.vision = new SimulationVision(simulator, options?.canvasCapture);
    this.communication = new SimulationCommunication(simulator, this.onUpdateCallback);
    this.safety = new SimulationSafety(simulator, this.onUpdateCallback);

    logger.info('hal', 'Simulation HAL created', { deviceId: this.deviceId });
  }

  async initialize(): Promise<void> {
    this.ready = true;
    logger.info('hal', 'Simulation HAL initialized');
  }

  async cleanup(): Promise<void> {
    this.simulator.stopMotors();
    this.ready = false;
    logger.info('hal', 'Simulation HAL cleaned up');
  }

  isReady(): boolean {
    return this.ready;
  }

  getDeviceInfo(): {
    id: string;
    type: string;
    mode: HALMode;
    capabilities: string[];
  } {
    return {
      id: this.deviceId,
      type: 'cube-robot-simulator',
      mode: 'simulation',
      capabilities: ['locomotion', 'vision', 'communication', 'safety'],
    };
  }

  /**
   * Get current telemetry data
   */
  getTelemetry(): DeviceTelemetry {
    const pos = this.simulator.getPosition();
    const rot = this.simulator.getRotation();
    const sensors = this.simulator.getSensors();

    return {
      timestamp: Date.now(),
      deviceId: this.deviceId,
      mode: 'simulation',
      pose: {
        x: pos.x,
        y: pos.y,
        z: pos.z,
        yaw: rot.y,
      },
      sensors: {
        distance: [sensors.distance.front, sensors.distance.left, sensors.distance.right],
        line: sensors.line,
        battery: sensors.battery,
      },
      motors: { left: 0, right: 0 }, // Would need to track this
      led: { r: 0, g: 0, b: 0 }, // Would need to track this
    };
  }
}

/**
 * Create a simulation HAL from a cube robot simulator
 */
export function createSimulationHAL(
  simulator: SimulatorReference,
  options?: {
    deviceId?: string;
    onUpdate?: () => void;
    canvasCapture?: () => string;
  }
): SimulationHAL {
  return new SimulationHAL(simulator, options);
}
