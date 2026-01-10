/**
 * ESP32 Device Manager
 *
 * High-level device management for ESP32-S3 WASM4 robots.
 * Handles:
 * - Device discovery and connection
 * - WASM deployment over TCP/Serial
 * - OTA firmware updates
 * - Device fleet management
 * - Connection pooling
 */

import { SerialManager, type DeviceConnection, type DeviceCommand, type DeviceResponse } from './serial-manager';
import { ESP32WASM4VM, getESP32WASM4VM, type ConnectionMode } from './esp32-wasm4-vm';

// Device types
export type DeviceType = 'esp32-s3' | 'esp32-s3-wasm4' | 'esp32-s3-robot' | 'virtual';

// Device status
export type DeviceStatus = 'disconnected' | 'connecting' | 'connected' | 'error' | 'updating';

// Device info
export interface ESP32Device {
  id: string;
  name: string;
  type: DeviceType;
  status: DeviceStatus;
  connection: {
    mode: ConnectionMode;
    address?: string; // IP for WiFi, port for Serial
  };
  firmware: {
    version: string;
    wasmSupported: boolean;
    robotSupported: boolean;
  };
  hardware: {
    chip: string;
    flashSize: number;
    freeHeap: number;
    cpuFreq: number;
  };
  robot?: {
    batteryPercent: number;
    mode: string;
    position: { x: number; y: number; heading: number };
  };
  lastSeen: number;
  error?: string;
}

// Deployment target
export interface DeploymentTarget {
  deviceId: string;
  appName: string;
  wasmBytes: Uint8Array;
  heapSize?: number;
}

// Deployment result
export interface DeploymentResult {
  success: boolean;
  deviceId: string;
  appName: string;
  message: string;
  timestamp: number;
}

// Fleet event
export type FleetEvent =
  | { type: 'device-discovered'; device: ESP32Device }
  | { type: 'device-connected'; device: ESP32Device }
  | { type: 'device-disconnected'; deviceId: string }
  | { type: 'device-error'; deviceId: string; error: string }
  | { type: 'deployment-started'; target: DeploymentTarget }
  | { type: 'deployment-complete'; result: DeploymentResult }
  | { type: 'firmware-update'; deviceId: string; version: string };

/**
 * ESP32 Device Manager
 */
export class ESP32DeviceManager {
  private devices = new Map<string, ESP32Device>();
  private vms = new Map<string, ESP32WASM4VM>();
  private eventListeners: Array<(event: FleetEvent) => void> = [];
  private scanInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {}

  /**
   * Discover available devices
   */
  async discoverDevices(): Promise<ESP32Device[]> {
    const discovered: ESP32Device[] = [];

    // Add any already connected serial devices
    const serialConnections = SerialManager.getAllConnections();
    for (const conn of serialConnections) {
      if (!this.devices.has(conn.id)) {
        const device = await this.createDeviceFromConnection(conn);
        discovered.push(device);
        this.devices.set(device.id, device);
        this.emit({ type: 'device-discovered', device });
      }
    }

    // Add virtual device option
    const virtualDevice: ESP32Device = {
      id: 'virtual-default',
      name: 'Virtual ESP32-S3',
      type: 'virtual',
      status: 'disconnected',
      connection: { mode: 'simulated' },
      firmware: {
        version: '1.0.0-virtual',
        wasmSupported: true,
        robotSupported: true,
      },
      hardware: {
        chip: 'ESP32-S3 (Virtual)',
        flashSize: 8,
        freeHeap: 220,
        cpuFreq: 240,
      },
      lastSeen: Date.now(),
    };

    if (!this.devices.has(virtualDevice.id)) {
      discovered.push(virtualDevice);
      this.devices.set(virtualDevice.id, virtualDevice);
      this.emit({ type: 'device-discovered', device: virtualDevice });
    }

    return discovered;
  }

  /**
   * Create device info from connection
   */
  private async createDeviceFromConnection(conn: DeviceConnection): Promise<ESP32Device> {
    const device: ESP32Device = {
      id: conn.id,
      name: conn.metadata.name,
      type: conn.virtual ? 'virtual' : 'esp32-s3-wasm4',
      status: conn.connected ? 'connected' : 'disconnected',
      connection: {
        mode: conn.virtual ? 'simulated' : 'serial',
      },
      firmware: {
        version: 'unknown',
        wasmSupported: true,
        robotSupported: true,
      },
      hardware: {
        chip: 'ESP32-S3',
        flashSize: 8,
        freeHeap: 220,
        cpuFreq: 240,
      },
      lastSeen: Date.now(),
    };

    // Try to get device info
    if (conn.connected) {
      try {
        const info = await SerialManager.sendCommand(conn.id, { action: 'get_info' });
        if (info.status === 'ok') {
          device.firmware.version = info.firmware || 'unknown';
          device.hardware.flashSize = info.flash_size_mb || 8;
          device.hardware.freeHeap = info.free_heap_kb || 220;
          device.hardware.cpuFreq = info.cpu_freq_mhz || 240;
        }
      } catch (e) {
        console.warn(`Failed to get device info for ${conn.id}:`, e);
      }
    }

    return device;
  }

  /**
   * Connect to a device
   */
  async connect(deviceId: string): Promise<ESP32Device> {
    const device = this.devices.get(deviceId);
    if (!device) {
      throw new Error(`Device not found: ${deviceId}`);
    }

    device.status = 'connecting';
    this.updateDevice(device);

    try {
      if (device.type === 'virtual') {
        // Create VM for virtual device
        const vm = getESP32WASM4VM({
          deviceId,
          deviceName: device.name,
          connectionMode: 'simulated',
          enableRobot: true,
        });

        await vm.connect();
        this.vms.set(deviceId, vm);

        device.status = 'connected';
        device.lastSeen = Date.now();
      } else if (device.connection.mode === 'serial') {
        // Use serial manager for physical device
        const connId = await SerialManager.connect();
        device.id = connId;
        this.devices.delete(deviceId);
        this.devices.set(connId, device);

        device.status = 'connected';
        device.lastSeen = Date.now();
      }

      this.updateDevice(device);
      this.emit({ type: 'device-connected', device });
      return device;
    } catch (error) {
      device.status = 'error';
      device.error = (error as Error).message;
      this.updateDevice(device);
      this.emit({ type: 'device-error', deviceId: device.id, error: device.error });
      throw error;
    }
  }

  /**
   * Disconnect from a device
   */
  async disconnect(deviceId: string): Promise<void> {
    const device = this.devices.get(deviceId);
    if (!device) return;

    // Disconnect VM if exists
    const vm = this.vms.get(deviceId);
    if (vm) {
      vm.disconnect();
      this.vms.delete(deviceId);
    }

    // Disconnect serial if physical device
    if (device.type !== 'virtual') {
      await SerialManager.disconnect(deviceId);
    }

    device.status = 'disconnected';
    this.updateDevice(device);
    this.emit({ type: 'device-disconnected', deviceId });
  }

  /**
   * Deploy WASM application to device
   */
  async deploy(target: DeploymentTarget): Promise<DeploymentResult> {
    const device = this.devices.get(target.deviceId);
    if (!device) {
      return {
        success: false,
        deviceId: target.deviceId,
        appName: target.appName,
        message: 'Device not found',
        timestamp: Date.now(),
      };
    }

    if (device.status !== 'connected') {
      return {
        success: false,
        deviceId: target.deviceId,
        appName: target.appName,
        message: 'Device not connected',
        timestamp: Date.now(),
      };
    }

    this.emit({ type: 'deployment-started', target });

    try {
      if (device.type === 'virtual') {
        // For virtual devices, deployment is simulated
        const result: DeploymentResult = {
          success: true,
          deviceId: target.deviceId,
          appName: target.appName,
          message: 'Deployment simulated (virtual device)',
          timestamp: Date.now(),
        };
        this.emit({ type: 'deployment-complete', result });
        return result;
      }

      // For physical devices, use TCP deployment protocol
      const result = await this.deployViaTCP(target, device);
      this.emit({ type: 'deployment-complete', result });
      return result;
    } catch (error) {
      const result: DeploymentResult = {
        success: false,
        deviceId: target.deviceId,
        appName: target.appName,
        message: (error as Error).message,
        timestamp: Date.now(),
      };
      this.emit({ type: 'deployment-complete', result });
      return result;
    }
  }

  /**
   * Deploy via TCP (for WiFi-connected devices)
   */
  private async deployViaTCP(target: DeploymentTarget, device: ESP32Device): Promise<DeploymentResult> {
    // TCP deployment protocol:
    // 1. Connect to device:8080
    // 2. Send installation request with metadata
    // 3. Stream WASM binary
    // 4. Wait for confirmation

    // This requires WebSocket or TCP connection
    // For browser, we use WebSocket

    if (!device.connection.address) {
      return {
        success: false,
        deviceId: target.deviceId,
        appName: target.appName,
        message: 'No device address for TCP deployment',
        timestamp: Date.now(),
      };
    }

    try {
      const ws = new WebSocket(`ws://${device.connection.address}:8080/wasm`);

      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          ws.close();
          reject(new Error('Deployment timeout'));
        }, 30000);

        ws.onopen = () => {
          // Send metadata
          const metadata = {
            type: 'install',
            name: target.appName,
            size: target.wasmBytes.length,
            heapSize: target.heapSize || 65536,
          };
          ws.send(JSON.stringify(metadata));

          // Send binary
          ws.send(target.wasmBytes);
        };

        ws.onmessage = (event) => {
          clearTimeout(timeout);
          const response = JSON.parse(event.data);

          if (response.status === 'ok') {
            resolve({
              success: true,
              deviceId: target.deviceId,
              appName: target.appName,
              message: `Installed ${target.appName} successfully`,
              timestamp: Date.now(),
            });
          } else {
            resolve({
              success: false,
              deviceId: target.deviceId,
              appName: target.appName,
              message: response.message || 'Installation failed',
              timestamp: Date.now(),
            });
          }
          ws.close();
        };

        ws.onerror = (error) => {
          clearTimeout(timeout);
          reject(new Error('WebSocket error during deployment'));
        };
      });
    } catch (error) {
      return {
        success: false,
        deviceId: target.deviceId,
        appName: target.appName,
        message: (error as Error).message,
        timestamp: Date.now(),
      };
    }
  }

  /**
   * Deploy via Serial (fallback for USB-connected devices)
   */
  async deployViaSerial(target: DeploymentTarget): Promise<DeploymentResult> {
    const device = this.devices.get(target.deviceId);
    if (!device) {
      return {
        success: false,
        deviceId: target.deviceId,
        appName: target.appName,
        message: 'Device not found',
        timestamp: Date.now(),
      };
    }

    try {
      // Send install command with base64 encoded WASM
      const base64Wasm = btoa(String.fromCharCode(...target.wasmBytes));

      const response = await SerialManager.sendCommand(target.deviceId, {
        action: 'install_wasm',
        name: target.appName,
        size: target.wasmBytes.length,
        heap_size: target.heapSize || 65536,
        data: base64Wasm,
      }, 60000); // 60 second timeout for large files

      if (response.status === 'ok') {
        return {
          success: true,
          deviceId: target.deviceId,
          appName: target.appName,
          message: `Installed ${target.appName} via serial`,
          timestamp: Date.now(),
        };
      } else {
        return {
          success: false,
          deviceId: target.deviceId,
          appName: target.appName,
          message: response.msg || 'Installation failed',
          timestamp: Date.now(),
        };
      }
    } catch (error) {
      return {
        success: false,
        deviceId: target.deviceId,
        appName: target.appName,
        message: (error as Error).message,
        timestamp: Date.now(),
      };
    }
  }

  /**
   * Get device VM
   */
  getVM(deviceId: string): ESP32WASM4VM | null {
    return this.vms.get(deviceId) || null;
  }

  /**
   * Get device by ID
   */
  getDevice(deviceId: string): ESP32Device | null {
    return this.devices.get(deviceId) || null;
  }

  /**
   * Get all devices
   */
  getAllDevices(): ESP32Device[] {
    return Array.from(this.devices.values());
  }

  /**
   * Get connected devices
   */
  getConnectedDevices(): ESP32Device[] {
    return this.getAllDevices().filter(d => d.status === 'connected');
  }

  /**
   * Update device info
   */
  private updateDevice(device: ESP32Device): void {
    this.devices.set(device.id, device);
  }

  /**
   * Start periodic device scanning
   */
  startScanning(intervalMs = 5000): void {
    if (this.scanInterval) return;

    this.scanInterval = setInterval(() => {
      this.discoverDevices();
    }, intervalMs);
  }

  /**
   * Stop periodic device scanning
   */
  stopScanning(): void {
    if (this.scanInterval) {
      clearInterval(this.scanInterval);
      this.scanInterval = null;
    }
  }

  /**
   * Add event listener
   */
  on(callback: (event: FleetEvent) => void): void {
    this.eventListeners.push(callback);
  }

  /**
   * Remove event listener
   */
  off(callback: (event: FleetEvent) => void): void {
    const idx = this.eventListeners.indexOf(callback);
    if (idx >= 0) {
      this.eventListeners.splice(idx, 1);
    }
  }

  /**
   * Emit event
   */
  private emit(event: FleetEvent): void {
    for (const listener of this.eventListeners) {
      try {
        listener(event);
      } catch (e) {
        console.error('[DeviceManager] Event listener error:', e);
      }
    }
  }

  /**
   * Cleanup
   */
  async destroy(): Promise<void> {
    this.stopScanning();

    // Disconnect all devices
    for (const deviceId of this.devices.keys()) {
      await this.disconnect(deviceId);
    }

    this.devices.clear();
    this.vms.clear();
    this.eventListeners = [];
  }
}

// Singleton instance
let deviceManagerInstance: ESP32DeviceManager | null = null;

export function getESP32DeviceManager(): ESP32DeviceManager {
  if (!deviceManagerInstance) {
    deviceManagerInstance = new ESP32DeviceManager();
  }
  return deviceManagerInstance;
}

export default ESP32DeviceManager;
