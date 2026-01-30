/**
 * Hardware Abstraction Layer (HAL) Types
 *
 * Defines the unified interface for robot hardware control that works
 * identically in simulation (Three.js) and physical (ESP32) environments.
 *
 * This is the "Inversion of Control" architecture where:
 * - Traditional: Firmware controls robot logic
 * - LLMos: LLM controls robot through abstract hardware tools
 */

/**
 * Operating mode for the HAL
 */
export type HALMode = 'simulation' | 'physical' | 'hybrid';

/**
 * Result from executing a HAL tool
 */
export interface HALToolResult {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
  timestamp: number;
  mode: HALMode;
  /** Time taken to execute in milliseconds */
  executionTime?: number;
}

/**
 * Locomotion system interface
 */
export interface LocomotionInterface {
  /**
   * Differential drive control
   * @param left - Left wheel power (-255 to 255)
   * @param right - Right wheel power (-255 to 255)
   * @param durationMs - Optional duration before auto-stop
   */
  drive(left: number, right: number, durationMs?: number): Promise<HALToolResult>;

  /**
   * Move to absolute 3D position (for mobile platforms)
   */
  moveTo(x: number, y: number, z: number, speed?: number): Promise<HALToolResult>;

  /**
   * Stop all locomotion immediately
   */
  stop(): Promise<HALToolResult>;

  /**
   * Get current pose (position + orientation)
   */
  getPose(): Promise<{
    position: { x: number; y: number; z: number };
    rotation: { yaw: number; pitch: number; roll: number };
    velocity: { linear: number; angular: number };
  }>;
}

/**
 * Vision/sensing system interface
 */
export interface VisionInterface {
  /**
   * Capture current camera frame
   * @returns Base64 encoded image data URL
   */
  captureFrame(): Promise<string>;

  /**
   * Perform environment scan
   * @param mode - Scan mode: full, targeted, or quick
   */
  scan(mode?: 'full' | 'targeted' | 'quick'): Promise<{
    objects: Array<{
      id: string;
      type: string;
      position: { x: number; y: number; z: number };
      confidence: number;
    }>;
    clearAhead: boolean;
    nearestObstacle?: number;
  }>;

  /**
   * Get distance sensor readings
   */
  getDistanceSensors(): Promise<{
    front: number;
    left: number;
    right: number;
    frontLeft?: number;
    frontRight?: number;
  }>;

  /**
   * Get line sensor readings (for line following)
   */
  getLineSensors(): Promise<number[]>;

  /**
   * Get IMU data
   */
  getIMU(): Promise<{
    acceleration: { x: number; y: number; z: number };
    gyroscope: { x: number; y: number; z: number };
    heading: number;
  }>;
}

/**
 * Manipulation system interface (for robot arms)
 */
export interface ManipulationInterface {
  /**
   * Move arm to position
   */
  moveTo(x: number, y: number, z: number, speed?: number): Promise<HALToolResult>;

  /**
   * Control gripper
   * @param force - Grip force (0-100%)
   * @param mode - Grip mode
   */
  grasp(force: number, mode?: 'open' | 'close' | 'hold'): Promise<HALToolResult>;

  /**
   * Extend arm
   */
  extend(distance: number): Promise<HALToolResult>;

  /**
   * Retract arm
   */
  retract(): Promise<HALToolResult>;

  /**
   * Enable/disable precision mode
   */
  setPrecisionMode(enabled: boolean): Promise<HALToolResult>;

  /**
   * Get current arm position
   */
  getPosition(): Promise<{ x: number; y: number; z: number }>;
}

/**
 * Communication system interface
 */
export interface CommunicationInterface {
  /**
   * Speak through robot speaker
   */
  speak(text: string, urgency?: 'info' | 'warning' | 'alert'): Promise<HALToolResult>;

  /**
   * Set LED color/pattern
   */
  setLED(
    r: number,
    g: number,
    b: number,
    pattern?: 'solid' | 'blink' | 'pulse'
  ): Promise<HALToolResult>;

  /**
   * Play sound effect
   */
  playSound(soundId: string): Promise<HALToolResult>;

  /**
   * Log message (for debugging/telemetry)
   */
  log(message: string, level?: 'debug' | 'info' | 'warn' | 'error'): void;
}

/**
 * Safety system interface
 */
export interface SafetyInterface {
  /**
   * Emergency stop all systems
   */
  emergencyStop(reason?: string): Promise<HALToolResult>;

  /**
   * Check if emergency stop is active
   */
  isEmergencyStopped(): boolean;

  /**
   * Reset from emergency stop
   */
  resetEmergencyStop(): Promise<HALToolResult>;

  /**
   * Get current safety status
   */
  getSafetyStatus(): {
    emergencyStopped: boolean;
    batteryLevel: number;
    temperature?: number;
    errors: string[];
  };
}

/**
 * Complete Hardware Abstraction Layer interface
 */
export interface HardwareAbstractionLayer {
  /** Current operating mode */
  mode: HALMode;

  /** Locomotion subsystem */
  locomotion: LocomotionInterface;

  /** Vision/sensing subsystem */
  vision: VisionInterface;

  /** Manipulation subsystem (optional for wheeled robots) */
  manipulation?: ManipulationInterface;

  /** Communication subsystem */
  communication: CommunicationInterface;

  /** Safety subsystem */
  safety: SafetyInterface;

  /**
   * Initialize the HAL
   */
  initialize(): Promise<void>;

  /**
   * Cleanup and disconnect
   */
  cleanup(): Promise<void>;

  /**
   * Check if HAL is connected and ready
   */
  isReady(): boolean;

  /**
   * Get device information
   */
  getDeviceInfo(): {
    id: string;
    type: string;
    mode: HALMode;
    capabilities: string[];
  };
}

/**
 * HAL tool call format (from LLM)
 */
export interface HALToolCall {
  name: string;
  args: Record<string, unknown>;
}

/**
 * Configuration for creating a HAL instance
 */
export interface HALConfig {
  mode: HALMode;
  deviceId: string;
  /** For physical mode: connection settings */
  connection?: {
    type: 'serial' | 'wifi' | 'bluetooth';
    port?: string;
    baudRate?: number;
    host?: string;
  };
  /** For simulation mode: simulator reference */
  simulator?: unknown;
  /** Capabilities to enable */
  capabilities?: string[];
}

/**
 * Device telemetry data
 */
export interface DeviceTelemetry {
  timestamp: number;
  deviceId: string;
  mode: HALMode;
  pose: {
    x: number;
    y: number;
    z: number;
    yaw: number;
  };
  sensors: {
    distance: number[];
    line: number[];
    battery: number;
  };
  motors: {
    left: number;
    right: number;
  };
  led: {
    r: number;
    g: number;
    b: number;
  };
}
