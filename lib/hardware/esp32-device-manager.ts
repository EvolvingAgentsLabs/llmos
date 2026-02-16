/**
 * ESP32 Device Manager
 *
 * Fleet management system for ESP32-S3 devices running WASM4 games
 * and cube robot simulations.
 *
 * Features:
 * - Device registration and discovery
 * - Virtual and physical device management
 * - Firmware deployment across fleet
 * - Telemetry collection
 * - Remote control
 * - Fleet-wide game synchronization
 */

// WASM4 VM removed — stub types for compatibility
type ESP32WASM4VMConfig = any;
type ESP32WASM4VMState = any;
const ESP32WASM4VM = class { constructor(_config: any) {} start() {} stop() {} getState() { return {} as any; } } as any;
const GAME_MODE = {} as any;
const GAME_TEMPLATES: Record<string, any> = {};
import { FloorMap, FLOOR_MAPS, CubeRobotState } from './cube-robot-simulator';

// HAL Integration
import {
  HardwareAbstractionLayer,
  createHAL,
  setGlobalHAL,
  getHALToolExecutor,
  HAL_TOOL_DEFINITIONS,
  HALMode,
  HALToolCall,
  HALToolResult,
} from '../hal';

// ═══════════════════════════════════════════════════════════════════════════
// DEVICE TYPES AND INTERFACES
// ═══════════════════════════════════════════════════════════════════════════

export type DeviceConnectionType = 'virtual' | 'serial' | 'wifi' | 'bluetooth';
export type DeviceStatus = 'disconnected' | 'connecting' | 'connected' | 'running' | 'error';

export interface DeviceInfo {
  id: string;
  name: string;
  type: DeviceConnectionType;
  status: DeviceStatus;
  firmwareName: string;
  firmwareVersion: string;
  lastSeen: number;
  metadata: {
    chipId?: string;
    macAddress?: string;
    ipAddress?: string;
    freeHeap?: number;
    cpuFreq?: number;
    flashSize?: number;
  };
}

export interface DeviceTelemetry {
  deviceId: string;
  timestamp: number;
  state: ESP32WASM4VMState;
  robotState: CubeRobotState;
  fps: number;
  latency: number;
  batteryVoltage: number;
  rssi?: number; // WiFi signal strength
}

export interface FleetConfig {
  syncMode: 'independent' | 'synchronized' | 'leader-follower';
  leaderDeviceId?: string;
  defaultMap: string;
  defaultGame: string;
  autoStart: boolean;
}

export interface DeviceCommand {
  type: 'start' | 'stop' | 'reset' | 'load_firmware' | 'set_map' | 'drive' | 'led' | 'custom';
  payload?: any;
}

// ═══════════════════════════════════════════════════════════════════════════
// ESP32 DEVICE MANAGER
// ═══════════════════════════════════════════════════════════════════════════

export class ESP32DeviceManager {
  private devices: Map<string, ManagedDevice> = new Map();
  private fleetConfig: FleetConfig;
  private telemetryHistory: Map<string, DeviceTelemetry[]> = new Map();

  private eventListeners: Map<string, Set<(event: any) => void>> = new Map();

  constructor(fleetConfig?: Partial<FleetConfig>) {
    this.fleetConfig = {
      syncMode: fleetConfig?.syncMode ?? 'independent',
      leaderDeviceId: fleetConfig?.leaderDeviceId,
      defaultMap: fleetConfig?.defaultMap ?? 'ovalTrack',
      defaultGame: fleetConfig?.defaultGame ?? 'lineFollower',
      autoStart: fleetConfig?.autoStart ?? false,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DEVICE MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Create a new virtual device
   */
  async createVirtualDevice(name?: string, config?: Partial<ESP32WASM4VMConfig>): Promise<string> {
    const deviceId = `virtual-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    const deviceName = name || `Robot-${this.devices.size + 1}`;

    // Get default map
    const mapName = this.fleetConfig.defaultMap as keyof typeof FLOOR_MAPS;
    const floorMap = FLOOR_MAPS[mapName] ? FLOOR_MAPS[mapName]() : FLOOR_MAPS.ovalTrack();

    const vm = new ESP32WASM4VM({
      frameRate: config?.frameRate ?? 60,
      physicsRate: config?.physicsRate ?? 100,
      floorMap,
      gameMode: GAME_MODE.HYBRID,
      onFrame: (fb: any) => this.handleFrame(deviceId, fb),
      onRobotState: (state: any) => this.handleRobotState(deviceId, state),
      onCheckpoint: (idx: any) => this.handleCheckpoint(deviceId, idx),
      onCollision: (x: any, y: any) => this.handleCollision(deviceId, x, y),
      ...config,
    });

    const device: ManagedDevice = {
      id: deviceId,
      name: deviceName,
      type: 'virtual',
      status: 'connected',
      vm,
      lastSeen: Date.now(),
      firmwareName: '',
      firmwareVersion: '1.0.0',
      metadata: {
        chipId: deviceId,
      },
    };

    this.devices.set(deviceId, device);
    this.telemetryHistory.set(deviceId, []);

    this.emit('device:connected', { deviceId, name: deviceName });

    console.log(`[DeviceManager] Created virtual device: ${deviceName} (${deviceId})`);

    return deviceId;
  }

  /**
   * Connect to a physical device via serial
   */
  async connectSerialDevice(port?: SerialPort): Promise<string> {
    // Note: This would use the Web Serial API
    const deviceId = `serial-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;

    // Create a virtual device as placeholder (real implementation would connect to hardware)
    const vm = new ESP32WASM4VM({
      gameMode: GAME_MODE.ROBOT,
    });

    const device: ManagedDevice = {
      id: deviceId,
      name: 'ESP32-S3 (Serial)',
      type: 'serial',
      status: 'connected',
      vm,
      lastSeen: Date.now(),
      firmwareName: '',
      firmwareVersion: '1.0.0',
      metadata: {},
    };

    this.devices.set(deviceId, device);
    this.telemetryHistory.set(deviceId, []);

    this.emit('device:connected', { deviceId, name: device.name, type: 'serial' });

    return deviceId;
  }

  /**
   * Disconnect a device
   */
  async disconnectDevice(deviceId: string): Promise<void> {
    const device = this.devices.get(deviceId);
    if (!device) return;

    device.vm.dispose();
    device.status = 'disconnected';

    this.devices.delete(deviceId);
    this.telemetryHistory.delete(deviceId);

    this.emit('device:disconnected', { deviceId });

    console.log(`[DeviceManager] Disconnected device: ${deviceId}`);
  }

  /**
   * Get device by ID
   */
  getDevice(deviceId: string): DeviceInfo | null {
    const device = this.devices.get(deviceId);
    if (!device) return null;

    return {
      id: device.id,
      name: device.name,
      type: device.type,
      status: device.status,
      firmwareName: device.firmwareName,
      firmwareVersion: device.firmwareVersion,
      lastSeen: device.lastSeen,
      metadata: device.metadata,
    };
  }

  /**
   * List all devices
   */
  listDevices(): DeviceInfo[] {
    return Array.from(this.devices.values()).map(device => ({
      id: device.id,
      name: device.name,
      type: device.type,
      status: device.status,
      firmwareName: device.firmwareName,
      firmwareVersion: device.firmwareVersion,
      lastSeen: device.lastSeen,
      metadata: device.metadata,
    }));
  }

  /**
   * Get device count
   */
  getDeviceCount(): number {
    return this.devices.size;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FIRMWARE MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Load firmware onto a device
   */
  async loadFirmware(deviceId: string, firmware: Uint8Array, name: string): Promise<boolean> {
    const device = this.devices.get(deviceId);
    if (!device) {
      console.error(`[DeviceManager] Device not found: ${deviceId}`);
      return false;
    }

    try {
      await device.vm.loadFirmware(firmware, name);
      device.firmwareName = name;
      device.lastSeen = Date.now();

      this.emit('device:firmware_loaded', { deviceId, firmwareName: name });

      console.log(`[DeviceManager] Loaded firmware on ${deviceId}: ${name}`);
      return true;
    } catch (error) {
      console.error(`[DeviceManager] Failed to load firmware on ${deviceId}:`, error);
      return false;
    }
  }

  /**
   * Load built-in game template
   */
  async loadGameTemplate(deviceId: string, gameName: keyof typeof GAME_TEMPLATES): Promise<boolean> {
    const source = GAME_TEMPLATES[gameName];
    if (!source) {
      console.error(`[DeviceManager] Unknown game template: ${String(gameName)}`);
      return false;
    }

    // In a real implementation, we would compile the source to WASM
    // For now, we'll just note that the game is loaded
    const device = this.devices.get(deviceId);
    if (!device) return false;

    device.firmwareName = gameName;
    device.lastSeen = Date.now();

    this.emit('device:game_loaded', { deviceId, gameName });

    console.log(`[DeviceManager] Loaded game template on ${deviceId}: ${gameName}`);
    return true;
  }

  /**
   * Deploy firmware to all devices in fleet
   */
  async deployToFleet(firmware: Uint8Array, name: string): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>();

    for (const [deviceId] of this.devices) {
      const success = await this.loadFirmware(deviceId, firmware, name);
      results.set(deviceId, success);
    }

    this.emit('fleet:firmware_deployed', {
      firmwareName: name,
      results: Object.fromEntries(results),
    });

    return results;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DEVICE CONTROL
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Send command to device
   */
  async sendCommand(deviceId: string, command: DeviceCommand): Promise<boolean> {
    const device = this.devices.get(deviceId);
    if (!device) return false;

    try {
      switch (command.type) {
        case 'start':
          device.vm.start();
          device.status = 'running';
          break;

        case 'stop':
          device.vm.stop();
          device.status = 'connected';
          break;

        case 'reset':
          device.vm.reset();
          break;

        case 'load_firmware':
          if (command.payload?.firmware && command.payload?.name) {
            await this.loadFirmware(deviceId, command.payload.firmware, command.payload.name);
          }
          break;

        case 'set_map':
          if (command.payload?.map) {
            device.vm.setFloorMap(command.payload.map);
          } else if (command.payload?.mapName) {
            const mapFn = FLOOR_MAPS[command.payload.mapName as keyof typeof FLOOR_MAPS];
            if (mapFn) {
              device.vm.setFloorMap(mapFn());
            }
          }
          break;

        case 'drive':
          if (typeof command.payload?.left === 'number' && typeof command.payload?.right === 'number') {
            device.vm.driveRobot(command.payload.left, command.payload.right);
          }
          break;

        case 'led':
          if (command.payload) {
            device.vm.setRobotLED(
              command.payload.r || 0,
              command.payload.g || 0,
              command.payload.b || 0
            );
          }
          break;

        case 'custom':
          // Custom command handling
          this.emit('device:custom_command', { deviceId, command: command.payload });
          break;

        default:
          console.warn(`[DeviceManager] Unknown command type: ${command.type}`);
          return false;
      }

      device.lastSeen = Date.now();
      return true;
    } catch (error) {
      console.error(`[DeviceManager] Command failed on ${deviceId}:`, error);
      return false;
    }
  }

  /**
   * Send command to all devices
   */
  async broadcastCommand(command: DeviceCommand): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>();

    for (const [deviceId] of this.devices) {
      const success = await this.sendCommand(deviceId, command);
      results.set(deviceId, success);
    }

    return results;
  }

  /**
   * Start all devices
   */
  async startAll(): Promise<void> {
    await this.broadcastCommand({ type: 'start' });
  }

  /**
   * Stop all devices
   */
  async stopAll(): Promise<void> {
    await this.broadcastCommand({ type: 'stop' });
  }

  /**
   * Reset all devices
   */
  async resetAll(): Promise<void> {
    await this.broadcastCommand({ type: 'reset' });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TELEMETRY
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get device state
   */
  getDeviceState(deviceId: string): ESP32WASM4VMState | null {
    const device = this.devices.get(deviceId);
    if (!device) return null;

    return device.vm.getState();
  }

  /**
   * Get telemetry history
   */
  getTelemetryHistory(deviceId: string, limit?: number): DeviceTelemetry[] {
    const history = this.telemetryHistory.get(deviceId) || [];
    return limit ? history.slice(-limit) : history;
  }

  /**
   * Get latest telemetry for all devices
   */
  getFleetTelemetry(): Map<string, DeviceTelemetry | null> {
    const telemetry = new Map<string, DeviceTelemetry | null>();

    for (const [deviceId] of this.devices) {
      const history = this.telemetryHistory.get(deviceId) || [];
      telemetry.set(deviceId, history.length > 0 ? history[history.length - 1] : null);
    }

    return telemetry;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FLOOR MAP MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Set floor map for device
   */
  setDeviceMap(deviceId: string, map: FloorMap): boolean {
    const device = this.devices.get(deviceId);
    if (!device) return false;

    device.vm.setFloorMap(map);
    return true;
  }

  /**
   * Set floor map for all devices
   */
  setFleetMap(map: FloorMap): void {
    for (const [deviceId] of this.devices) {
      this.setDeviceMap(deviceId, map);
    }
  }

  /**
   * Set floor map by name
   */
  setMapByName(deviceId: string, mapName: keyof typeof FLOOR_MAPS): boolean {
    const mapFn = FLOOR_MAPS[mapName];
    if (!mapFn) return false;

    return this.setDeviceMap(deviceId, mapFn());
  }

  /**
   * List available floor maps
   */
  listAvailableMaps(): string[] {
    return Object.keys(FLOOR_MAPS);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // EVENT HANDLERS
  // ═══════════════════════════════════════════════════════════════════════════

  private handleFrame(deviceId: string, framebuffer: Uint8Array): void {
    this.emit('device:frame', { deviceId, framebuffer });
  }

  private handleRobotState(deviceId: string, state: CubeRobotState): void {
    const device = this.devices.get(deviceId);
    if (!device) return;

    // Record telemetry
    const telemetry: DeviceTelemetry = {
      deviceId,
      timestamp: Date.now(),
      state: device.vm.getState(),
      robotState: state,
      fps: 60, // Approximate
      latency: 0,
      batteryVoltage: state.battery.voltage,
    };

    const history = this.telemetryHistory.get(deviceId) || [];
    history.push(telemetry);

    // Keep only last 1000 entries
    if (history.length > 1000) {
      history.shift();
    }

    this.telemetryHistory.set(deviceId, history);

    this.emit('device:telemetry', telemetry);
  }

  private handleCheckpoint(deviceId: string, index: number): void {
    this.emit('device:checkpoint', { deviceId, checkpointIndex: index });
  }

  private handleCollision(deviceId: string, x: number, y: number): void {
    this.emit('device:collision', { deviceId, x, y });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // EVENT EMITTER
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Subscribe to events
   */
  on(event: string, callback: (data: any) => void): () => void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(callback);

    // Return unsubscribe function
    return () => {
      this.eventListeners.get(event)?.delete(callback);
    };
  }

  /**
   * Emit event
   */
  private emit(event: string, data: any): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`[DeviceManager] Error in event handler for ${event}:`, error);
        }
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FLEET CONFIGURATION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get fleet configuration
   */
  getFleetConfig(): FleetConfig {
    return { ...this.fleetConfig };
  }

  /**
   * Update fleet configuration
   */
  setFleetConfig(config: Partial<FleetConfig>): void {
    this.fleetConfig = { ...this.fleetConfig, ...config };
    this.emit('fleet:config_changed', this.fleetConfig);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HAL (HARDWARE ABSTRACTION LAYER) INTEGRATION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Create a HAL instance for a device
   *
   * This creates a Hardware Abstraction Layer that routes tool calls
   * to the appropriate implementation (simulation VM or physical hardware).
   *
   * @param deviceId - The device to create HAL for
   * @param setAsGlobal - Whether to set this as the global HAL instance
   * @returns HAL instance or null if device not found
   */
  createDeviceHAL(deviceId: string, setAsGlobal: boolean = false): HardwareAbstractionLayer | null {
    const device = this.devices.get(deviceId);
    if (!device) {
      console.error(`[DeviceManager] Cannot create HAL - device not found: ${deviceId}`);
      return null;
    }

    try {
      // Create HAL based on device type
      const hal = createHAL({
        mode: device.type === 'virtual' ? 'simulation' : 'physical',
        deviceId: device.id,
        simulator: device.vm,
        capabilities: ['locomotion', 'vision', 'communication'],
        connection: device.type !== 'virtual' ? {
          type: device.type as 'serial' | 'wifi' | 'bluetooth',
          baudRate: 115200,
        } : undefined,
      });

      // Store HAL reference on device
      device.hal = hal;

      // Optionally set as global HAL
      if (setAsGlobal) {
        setGlobalHAL(hal);
      }

      console.log(`[DeviceManager] Created HAL for device: ${deviceId} (${device.type})`);
      this.emit('device:hal_created', { deviceId, mode: hal.mode });

      return hal;
    } catch (error) {
      console.error(`[DeviceManager] Failed to create HAL for ${deviceId}:`, error);
      return null;
    }
  }

  /**
   * Get the HAL instance for a device
   *
   * @param deviceId - The device ID
   * @returns HAL instance or null if not created
   */
  getDeviceHAL(deviceId: string): HardwareAbstractionLayer | null {
    const device = this.devices.get(deviceId);
    return device?.hal || null;
  }

  /**
   * Create or get HAL for a device (lazy initialization)
   *
   * @param deviceId - The device ID
   * @returns HAL instance
   */
  getOrCreateHAL(deviceId: string): HardwareAbstractionLayer | null {
    const device = this.devices.get(deviceId);
    if (!device) return null;

    if (!device.hal) {
      return this.createDeviceHAL(deviceId);
    }

    return device.hal;
  }

  /**
   * Dispose HAL for a device
   *
   * @param deviceId - The device ID
   */
  disposeDeviceHAL(deviceId: string): void {
    const device = this.devices.get(deviceId);
    if (device?.hal) {
      // HAL doesn't have dispose method, just remove reference
      device.hal = undefined;
      this.emit('device:hal_disposed', { deviceId });
    }
  }

  /**
   * Check if device has HAL enabled
   *
   * @param deviceId - The device ID
   * @returns true if HAL is created for this device
   */
  hasHAL(deviceId: string): boolean {
    const device = this.devices.get(deviceId);
    return !!device?.hal;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CLEANUP
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Dispose all devices and cleanup
   */
  dispose(): void {
    for (const [deviceId, device] of this.devices) {
      // Dispose HAL if exists
      if (device.hal) {
        device.hal = undefined;
      }
      device.vm.dispose();
    }

    this.devices.clear();
    this.telemetryHistory.clear();
    this.eventListeners.clear();

    console.log('[DeviceManager] Disposed');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// INTERNAL TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface ManagedDevice extends DeviceInfo {
  vm: InstanceType<typeof ESP32WASM4VM>;
  hal?: HardwareAbstractionLayer;
}

// ═══════════════════════════════════════════════════════════════════════════
// FACTORY FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create a new ESP32 Device Manager
 */
export function createDeviceManager(config?: Partial<FleetConfig>): ESP32DeviceManager {
  return new ESP32DeviceManager(config);
}

// ═══════════════════════════════════════════════════════════════════════════
// SINGLETON INSTANCE
// ═══════════════════════════════════════════════════════════════════════════

let defaultManager: ESP32DeviceManager | null = null;

/**
 * Get the default device manager singleton
 */
export function getDeviceManager(): ESP32DeviceManager {
  if (!defaultManager) {
    defaultManager = new ESP32DeviceManager();
  }
  return defaultManager;
}

/**
 * Reset the default device manager
 */
export function resetDeviceManager(): void {
  if (defaultManager) {
    defaultManager.dispose();
    defaultManager = null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// HAL CONVENIENCE EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

// Re-export HAL module for convenience
export {
  createHAL,
  setGlobalHAL,
  getHALToolExecutor,
  HAL_TOOL_DEFINITIONS,
} from '../hal';

export type {
  HardwareAbstractionLayer,
  HALMode,
  HALToolCall,
  HALToolResult,
} from '../hal';
