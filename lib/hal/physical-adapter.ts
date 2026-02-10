/**
 * HAL Physical Adapter
 *
 * Implements the Hardware Abstraction Layer interface for
 * real ESP32-based robot hardware.
 *
 * This enables the same skill files that run in simulation
 * to control real physical robots.
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
 * Connection type for physical device
 */
type ConnectionType = 'serial' | 'wifi' | 'bluetooth';

/**
 * Message to send to ESP32
 */
interface ESP32Command {
  type: 'command';
  command: string;
  params: Record<string, unknown>;
  timestamp: number;
}

/**
 * Response from ESP32
 */
interface ESP32Response {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
  timestamp: number;
}

/**
 * Serial port reference (Web Serial API)
 */
interface SerialPortRef {
  readable: ReadableStream;
  writable: WritableStream;
  open(options: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
}

/**
 * Physical device connection manager
 */
class PhysicalConnection {
  private port: SerialPortRef | null = null;
  private reader: ReadableStreamDefaultReader | null = null;
  private writer: WritableStreamDefaultWriter | null = null;
  private connected = false;
  private responseBuffer = '';
  private pendingResponses: Map<
    number,
    { resolve: (value: ESP32Response) => void; reject: (error: Error) => void }
  > = new Map();

  constructor(
    private connectionType: ConnectionType,
    private options: {
      port?: string;
      baudRate?: number;
      host?: string;
    }
  ) {}

  async connect(): Promise<void> {
    if (this.connectionType === 'serial') {
      await this.connectSerial();
    } else if (this.connectionType === 'wifi') {
      await this.connectWifi();
    } else {
      throw new Error(`Connection type ${this.connectionType} not yet implemented`);
    }
  }

  private async connectSerial(): Promise<void> {
    if (typeof navigator === 'undefined' || !('serial' in navigator)) {
      throw new Error('Web Serial API not available');
    }

    try {
      // Request port from user
      const port = await (navigator as unknown as { serial: { requestPort(): Promise<SerialPortRef> } }).serial.requestPort();
      await port.open({ baudRate: this.options.baudRate || 115200 });

      this.port = port;
      this.reader = port.readable.getReader();
      this.writer = port.writable.getWriter();
      this.connected = true;

      // Start reading responses
      this.startReading();

      logger.success('hal', 'Serial connection established');
    } catch (error) {
      throw new Error(`Serial connection failed: ${error instanceof Error ? error.message : error}`);
    }
  }

  private async connectWifi(): Promise<void> {
    // WiFi connection would use WebSocket to ESP32's IP
    if (!this.options.host) {
      throw new Error('WiFi connection requires host address');
    }

    logger.info('hal', `Would connect to WiFi host: ${this.options.host}`);
    this.connected = true;
  }

  private async startReading(): Promise<void> {
    if (!this.reader) return;

    const decoder = new TextDecoder();

    try {
      while (this.connected) {
        const { value, done } = await this.reader.read();
        if (done) break;

        this.responseBuffer += decoder.decode(value, { stream: true });

        // Process complete JSON messages (newline-delimited)
        let newlineIndex;
        while ((newlineIndex = this.responseBuffer.indexOf('\n')) !== -1) {
          const message = this.responseBuffer.slice(0, newlineIndex);
          this.responseBuffer = this.responseBuffer.slice(newlineIndex + 1);

          try {
            const response = JSON.parse(message) as ESP32Response;
            this.handleResponse(response);
          } catch {
            // Ignore non-JSON messages (debug output, etc.)
          }
        }
      }
    } catch (error) {
      logger.error('hal', 'Serial read error', { error });
    }
  }

  private handleResponse(response: ESP32Response): void {
    const pending = this.pendingResponses.get(response.timestamp);
    if (pending) {
      this.pendingResponses.delete(response.timestamp);
      pending.resolve(response);
    }
  }

  async sendCommand(command: ESP32Command): Promise<ESP32Response> {
    if (!this.connected || !this.writer) {
      throw new Error('Not connected');
    }

    return new Promise((resolve, reject) => {
      // Set up response listener
      const timeout = setTimeout(() => {
        this.pendingResponses.delete(command.timestamp);
        reject(new Error('Command timeout'));
      }, 5000);

      this.pendingResponses.set(command.timestamp, {
        resolve: (response) => {
          clearTimeout(timeout);
          resolve(response);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        },
      });

      // Send command
      const encoder = new TextEncoder();
      const data = encoder.encode(JSON.stringify(command) + '\n');
      this.writer!.write(data).catch(reject);
    });
  }

  async disconnect(): Promise<void> {
    this.connected = false;

    if (this.reader) {
      await this.reader.cancel();
      this.reader.releaseLock();
    }

    if (this.writer) {
      await this.writer.close();
    }

    if (this.port) {
      await this.port.close();
    }

    logger.info('hal', 'Disconnected from device');
  }

  isConnected(): boolean {
    return this.connected;
  }
}

/**
 * Locomotion implementation for physical hardware
 */
class PhysicalLocomotion implements LocomotionInterface {
  constructor(private connection: PhysicalConnection) {}

  async drive(left: number, right: number, durationMs?: number): Promise<HALToolResult> {
    try {
      const response = await this.connection.sendCommand({
        type: 'command',
        command: 'drive',
        params: { left, right, duration_ms: durationMs },
        timestamp: Date.now(),
      });

      return {
        success: response.success,
        data: response.data,
        error: response.error,
        timestamp: Date.now(),
        mode: 'physical',
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        timestamp: Date.now(),
        mode: 'physical',
      };
    }
  }

  async moveTo(x: number, y: number, z: number, speed?: number): Promise<HALToolResult> {
    try {
      const response = await this.connection.sendCommand({
        type: 'command',
        command: 'move_to',
        params: { x, y, z, speed },
        timestamp: Date.now(),
      });

      return {
        success: response.success,
        data: response.data,
        error: response.error,
        timestamp: Date.now(),
        mode: 'physical',
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        timestamp: Date.now(),
        mode: 'physical',
      };
    }
  }

  async rotate(direction: 'left' | 'right', degrees: number): Promise<HALToolResult> {
    try {
      const response = await this.connection.sendCommand({
        type: 'command',
        command: 'rotate',
        params: { direction, degrees },
        timestamp: Date.now(),
      });

      return {
        success: response.success,
        data: response.data,
        error: response.error,
        timestamp: Date.now(),
        mode: 'physical',
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        timestamp: Date.now(),
        mode: 'physical',
      };
    }
  }

  async moveForward(distanceCm: number): Promise<HALToolResult> {
    try {
      const response = await this.connection.sendCommand({
        type: 'command',
        command: 'move_forward',
        params: { distance_cm: distanceCm },
        timestamp: Date.now(),
      });

      return {
        success: response.success,
        data: response.data,
        error: response.error,
        timestamp: Date.now(),
        mode: 'physical',
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        timestamp: Date.now(),
        mode: 'physical',
      };
    }
  }

  async moveBackward(distanceCm: number): Promise<HALToolResult> {
    try {
      const response = await this.connection.sendCommand({
        type: 'command',
        command: 'move_backward',
        params: { distance_cm: distanceCm },
        timestamp: Date.now(),
      });

      return {
        success: response.success,
        data: response.data,
        error: response.error,
        timestamp: Date.now(),
        mode: 'physical',
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        timestamp: Date.now(),
        mode: 'physical',
      };
    }
  }

  async stop(): Promise<HALToolResult> {
    try {
      const response = await this.connection.sendCommand({
        type: 'command',
        command: 'stop',
        params: {},
        timestamp: Date.now(),
      });

      return {
        success: response.success,
        timestamp: Date.now(),
        mode: 'physical',
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        timestamp: Date.now(),
        mode: 'physical',
      };
    }
  }

  async getPose(): Promise<{
    position: { x: number; y: number; z: number };
    rotation: { yaw: number; pitch: number; roll: number };
    velocity: { linear: number; angular: number };
  }> {
    try {
      const response = await this.connection.sendCommand({
        type: 'command',
        command: 'get_pose',
        params: {},
        timestamp: Date.now(),
      });

      const data = response.data || {};
      return {
        position: (data.position as { x: number; y: number; z: number }) || { x: 0, y: 0, z: 0 },
        rotation: (data.rotation as { yaw: number; pitch: number; roll: number }) || { yaw: 0, pitch: 0, roll: 0 },
        velocity: (data.velocity as { linear: number; angular: number }) || { linear: 0, angular: 0 },
      };
    } catch {
      return {
        position: { x: 0, y: 0, z: 0 },
        rotation: { yaw: 0, pitch: 0, roll: 0 },
        velocity: { linear: 0, angular: 0 },
      };
    }
  }
}

/**
 * Vision implementation for physical hardware
 */
class PhysicalVision implements VisionInterface {
  constructor(private connection: PhysicalConnection) {}

  async captureFrame(): Promise<string> {
    try {
      const response = await this.connection.sendCommand({
        type: 'command',
        command: 'capture_camera',
        params: {},
        timestamp: Date.now(),
      });

      return (response.data?.frame as string) || '';
    } catch {
      return '';
    }
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
    const distance = await this.getDistanceSensors();

    return {
      objects: [],
      clearAhead: distance.front > 30,
      nearestObstacle: Math.min(distance.front, distance.left, distance.right),
    };
  }

  async getDistanceSensors(): Promise<{
    front: number;
    left: number;
    right: number;
    frontLeft?: number;
    frontRight?: number;
  }> {
    try {
      const response = await this.connection.sendCommand({
        type: 'command',
        command: 'read_distance',
        params: {},
        timestamp: Date.now(),
      });

      const data = response.data || {};
      return {
        front: (data.front as number) || 0,
        left: (data.left as number) || 0,
        right: (data.right as number) || 0,
        frontLeft: data.front_left as number | undefined,
        frontRight: data.front_right as number | undefined,
      };
    } catch {
      return { front: 0, left: 0, right: 0 };
    }
  }

  async getLineSensors(): Promise<number[]> {
    try {
      const response = await this.connection.sendCommand({
        type: 'command',
        command: 'read_line',
        params: {},
        timestamp: Date.now(),
      });

      return (response.data?.sensors as number[]) || [];
    } catch {
      return [];
    }
  }

  async getIMU(): Promise<{
    acceleration: { x: number; y: number; z: number };
    gyroscope: { x: number; y: number; z: number };
    heading: number;
  }> {
    try {
      const response = await this.connection.sendCommand({
        type: 'command',
        command: 'read_imu',
        params: {},
        timestamp: Date.now(),
      });

      const data = response.data || {};
      return {
        acceleration: (data.acceleration as { x: number; y: number; z: number }) || { x: 0, y: 0, z: 0 },
        gyroscope: (data.gyroscope as { x: number; y: number; z: number }) || { x: 0, y: 0, z: 0 },
        heading: (data.heading as number) || 0,
      };
    } catch {
      return {
        acceleration: { x: 0, y: 0, z: 0 },
        gyroscope: { x: 0, y: 0, z: 0 },
        heading: 0,
      };
    }
  }
}

/**
 * Communication implementation for physical hardware
 */
class PhysicalCommunication implements CommunicationInterface {
  constructor(private connection: PhysicalConnection) {}

  async speak(text: string, urgency?: 'info' | 'warning' | 'alert'): Promise<HALToolResult> {
    try {
      const response = await this.connection.sendCommand({
        type: 'command',
        command: 'speak',
        params: { text, urgency },
        timestamp: Date.now(),
      });

      return {
        success: response.success,
        data: { text, urgency },
        timestamp: Date.now(),
        mode: 'physical',
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        timestamp: Date.now(),
        mode: 'physical',
      };
    }
  }

  async setLED(
    r: number,
    g: number,
    b: number,
    pattern?: 'solid' | 'blink' | 'pulse'
  ): Promise<HALToolResult> {
    try {
      const response = await this.connection.sendCommand({
        type: 'command',
        command: 'set_led',
        params: { r, g, b, pattern },
        timestamp: Date.now(),
      });

      return {
        success: response.success,
        data: { r, g, b, pattern },
        timestamp: Date.now(),
        mode: 'physical',
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        timestamp: Date.now(),
        mode: 'physical',
      };
    }
  }

  async playSound(soundId: string): Promise<HALToolResult> {
    try {
      const response = await this.connection.sendCommand({
        type: 'command',
        command: 'play_sound',
        params: { sound_id: soundId },
        timestamp: Date.now(),
      });

      return {
        success: response.success,
        data: { soundId },
        timestamp: Date.now(),
        mode: 'physical',
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        timestamp: Date.now(),
        mode: 'physical',
      };
    }
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
 * Safety implementation for physical hardware
 */
class PhysicalSafety implements SafetyInterface {
  private emergencyStopped = false;

  constructor(private connection: PhysicalConnection) {}

  async emergencyStop(reason?: string): Promise<HALToolResult> {
    this.emergencyStopped = true;

    try {
      const response = await this.connection.sendCommand({
        type: 'command',
        command: 'emergency_stop',
        params: { reason },
        timestamp: Date.now(),
      });

      logger.warn('hal', `EMERGENCY STOP: ${reason || 'No reason'}`);

      return {
        success: response.success,
        data: { reason },
        timestamp: Date.now(),
        mode: 'physical',
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        timestamp: Date.now(),
        mode: 'physical',
      };
    }
  }

  isEmergencyStopped(): boolean {
    return this.emergencyStopped;
  }

  async resetEmergencyStop(): Promise<HALToolResult> {
    this.emergencyStopped = false;

    try {
      const response = await this.connection.sendCommand({
        type: 'command',
        command: 'reset_emergency',
        params: {},
        timestamp: Date.now(),
      });

      return {
        success: response.success,
        timestamp: Date.now(),
        mode: 'physical',
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        timestamp: Date.now(),
        mode: 'physical',
      };
    }
  }

  getSafetyStatus(): {
    emergencyStopped: boolean;
    batteryLevel: number;
    temperature?: number;
    errors: string[];
  } {
    return {
      emergencyStopped: this.emergencyStopped,
      batteryLevel: 100, // Would query from device
      errors: [],
    };
  }
}

/**
 * Complete physical adapter
 */
export class PhysicalHAL implements HardwareAbstractionLayer {
  readonly mode: HALMode = 'physical';
  readonly locomotion: LocomotionInterface;
  readonly vision: VisionInterface;
  readonly manipulation?: ManipulationInterface;
  readonly communication: CommunicationInterface;
  readonly safety: SafetyInterface;

  private deviceId: string;
  private connection: PhysicalConnection;
  private ready = false;

  constructor(options: {
    deviceId: string;
    connectionType: ConnectionType;
    port?: string;
    baudRate?: number;
    host?: string;
  }) {
    this.deviceId = options.deviceId;
    this.connection = new PhysicalConnection(options.connectionType, {
      port: options.port,
      baudRate: options.baudRate,
      host: options.host,
    });

    // Initialize subsystems
    this.locomotion = new PhysicalLocomotion(this.connection);
    this.vision = new PhysicalVision(this.connection);
    this.communication = new PhysicalCommunication(this.connection);
    this.safety = new PhysicalSafety(this.connection);

    logger.info('hal', 'Physical HAL created', { deviceId: this.deviceId });
  }

  async initialize(): Promise<void> {
    await this.connection.connect();
    this.ready = true;
    logger.success('hal', 'Physical HAL initialized');
  }

  async cleanup(): Promise<void> {
    await this.locomotion.stop();
    await this.connection.disconnect();
    this.ready = false;
    logger.info('hal', 'Physical HAL cleaned up');
  }

  isReady(): boolean {
    return this.ready && this.connection.isConnected();
  }

  getDeviceInfo(): {
    id: string;
    type: string;
    mode: HALMode;
    capabilities: string[];
  } {
    return {
      id: this.deviceId,
      type: 'esp32-robot',
      mode: 'physical',
      capabilities: ['locomotion', 'vision', 'communication', 'safety'],
    };
  }
}

/**
 * Create a physical HAL with serial connection
 */
export function createPhysicalHAL(options: {
  deviceId: string;
  connectionType?: ConnectionType;
  port?: string;
  baudRate?: number;
  host?: string;
}): PhysicalHAL {
  return new PhysicalHAL({
    connectionType: options.connectionType || 'serial',
    ...options,
  });
}
