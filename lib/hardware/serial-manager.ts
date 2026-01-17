/**
 * Serial Manager - Web Serial API wrapper for ESP32 devices
 *
 * Handles:
 * - Device connection/disconnection
 * - JSON command protocol
 * - Response handling with callbacks
 * - Auto-reconnect on errors
 * - Multi-device support
 */

/// <reference path="./serial-types.d.ts" />

export interface DeviceConnection {
  id: string;
  port: any; // SerialPort from Web Serial API
  reader: ReadableStreamDefaultReader<Uint8Array> | null;
  writer: WritableStreamDefaultWriter<Uint8Array> | null;
  connected: boolean;
  metadata: {
    vendorId?: number;
    productId?: number;
    name: string;
    virtual?: boolean;
  };
  connectedAt: string;
  virtual?: boolean; // True if this is a virtual device
}

export interface DeviceCommand {
  action: string;
  [key: string]: any;
}

export interface DeviceResponse {
  status: 'ok' | 'error';
  [key: string]: any;
}

type ResponseCallback = (response: DeviceResponse) => void;

class SerialManagerClass {
  private connections = new Map<string, DeviceConnection>();
  private responseCallbacks = new Map<string, ResponseCallback>();
  private eventListeners = new Map<string, Set<(data: DeviceResponse) => void>>();
  private virtualDevices = new Map<string, any>(); // VirtualESP32 instances

  /**
   * Check if Web Serial API is supported
   */
  isSupported(): boolean {
    return typeof window !== 'undefined' && 'serial' in navigator;
  }

  /**
   * Connect to a device (shows browser picker)
   */
  async connect(): Promise<string> {
    if (!this.isSupported()) {
      throw new Error('Web Serial API not supported. Use Chrome/Edge 89+ on HTTPS or localhost.');
    }

    try {
      // Request port from user
      const port = await (navigator as any).serial.requestPort();

      // Open with standard settings
      await port.open({ baudRate: 115200 });

      // Generate unique device ID
      const deviceId = `device-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;

      // Get device info
      const info = port.getInfo();

      const connection: DeviceConnection = {
        id: deviceId,
        port,
        reader: port.readable.getReader(),
        writer: port.writable.getWriter(),
        connected: true,
        metadata: {
          vendorId: info.usbVendorId,
          productId: info.usbProductId,
          name: 'ESP32-S3',
        },
        connectedAt: new Date().toISOString(),
      };

      this.connections.set(deviceId, connection);
      this.startReading(deviceId);

      console.log(`[SerialManager] Connected device: ${deviceId}`, connection.metadata);
      return deviceId;
    } catch (error) {
      if ((error as Error).name === 'NotFoundError') {
        throw new Error('No device selected. Please select a device from the picker.');
      }
      throw new Error(`Connection failed: ${(error as Error).message}`);
    }
  }

  /**
   * Connect to a virtual device (for testing without hardware)
   */
  async connectVirtual(deviceName = 'ESP32-S3-Virtual'): Promise<string> {
    const { VirtualESP32 } = await import('./virtual-esp32');

    // Generate unique device ID
    const deviceId = `virtual-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;

    // Create virtual device instance
    const virtualDevice = new VirtualESP32();
    this.virtualDevices.set(deviceId, virtualDevice);

    const connection: DeviceConnection = {
      id: deviceId,
      port: null,
      reader: null,
      writer: null,
      connected: true,
      virtual: true,
      metadata: {
        name: deviceName,
        virtual: true,
      },
      connectedAt: new Date().toISOString(),
    };

    this.connections.set(deviceId, connection);

    console.log(`[SerialManager] Connected virtual device: ${deviceId}`, connection.metadata);
    return deviceId;
  }

  /**
   * Send command and wait for response
   */
  async sendCommand(
    deviceId: string,
    command: DeviceCommand,
    timeout = 5000
  ): Promise<DeviceResponse> {
    const conn = this.connections.get(deviceId);
    if (!conn || !conn.connected) {
      throw new Error(`Device ${deviceId} not connected`);
    }

    console.log(`[SerialManager] Sending to ${deviceId}:`, command);

    // Handle virtual device
    if (conn.virtual) {
      const virtualDevice = this.virtualDevices.get(deviceId);
      if (!virtualDevice) {
        throw new Error(`Virtual device ${deviceId} not found`);
      }

      try {
        const response = await virtualDevice.processCommand(command);
        console.log(`[SerialManager] Virtual device response:`, response);

        // Notify event listeners
        this.notifyListeners(deviceId, response);

        return response;
      } catch (error) {
        console.error(`[SerialManager] Virtual device error:`, error);
        throw error;
      }
    }

    // Handle physical device
    // Encode command as JSON + newline
    const commandJson = JSON.stringify(command) + '\n';
    const encoder = new TextEncoder();
    const data = encoder.encode(commandJson);

    try {
      // Send command
      await conn.writer!.write(data);

      // Wait for response
      return await new Promise<DeviceResponse>((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          this.responseCallbacks.delete(deviceId);
          reject(new Error(`Command timeout after ${timeout}ms`));
        }, timeout);

        this.responseCallbacks.set(deviceId, (response) => {
          clearTimeout(timeoutId);
          this.responseCallbacks.delete(deviceId);
          resolve(response);
        });
      });
    } catch (error) {
      console.error(`[SerialManager] Send error on ${deviceId}:`, error);
      throw error;
    }
  }

  /**
   * Disconnect a device
   */
  async disconnect(deviceId: string): Promise<void> {
    const conn = this.connections.get(deviceId);
    if (!conn) return;

    console.log(`[SerialManager] Disconnecting device: ${deviceId}`);

    try {
      conn.connected = false;

      // Handle virtual device
      if (conn.virtual) {
        this.virtualDevices.delete(deviceId);
      } else {
        // Handle physical device
        // Cancel reader
        if (conn.reader) {
          await conn.reader.cancel();
          conn.reader.releaseLock();
        }

        // Close writer
        if (conn.writer) {
          await conn.writer.close();
        }

        // Close port
        if (conn.port) {
          await conn.port.close();
        }
      }

      this.connections.delete(deviceId);
      this.responseCallbacks.delete(deviceId);
      this.eventListeners.delete(deviceId);

      console.log(`[SerialManager] Device ${deviceId} disconnected`);
    } catch (error) {
      console.error(`[SerialManager] Disconnect error:`, error);
    }
  }

  /**
   * Get device connection info
   */
  getConnection(deviceId: string): DeviceConnection | undefined {
    return this.connections.get(deviceId);
  }

  /**
   * Get all connected devices
   */
  getAllConnections(): DeviceConnection[] {
    return Array.from(this.connections.values());
  }

  /**
   * Check if device is connected
   */
  isConnected(deviceId: string): boolean {
    const conn = this.connections.get(deviceId);
    return conn?.connected ?? false;
  }

  /**
   * Add event listener for device responses
   */
  addEventListener(deviceId: string, callback: (data: DeviceResponse) => void): void {
    if (!this.eventListeners.has(deviceId)) {
      this.eventListeners.set(deviceId, new Set());
    }
    this.eventListeners.get(deviceId)!.add(callback);
  }

  /**
   * Remove event listener
   */
  removeEventListener(deviceId: string, callback: (data: DeviceResponse) => void): void {
    this.eventListeners.get(deviceId)?.delete(callback);
  }

  /**
   * Start reading from device (physical devices only)
   */
  private async startReading(deviceId: string): Promise<void> {
    const conn = this.connections.get(deviceId);
    if (!conn || !conn.reader) return;

    const decoder = new TextDecoder();
    let buffer = '';

    console.log(`[SerialManager] Started reading from ${deviceId}`);

    try {
      while (conn.connected && conn.reader) {
        const { value, done } = await conn.reader.read();

        if (done) {
          console.log(`[SerialManager] Read stream closed for ${deviceId}`);
          break;
        }

        // Decode and buffer
        buffer += decoder.decode(value, { stream: true });

        // Process complete lines
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.trim()) {
            try {
              const response: DeviceResponse = JSON.parse(line);
              console.log(`[SerialManager] Received from ${deviceId}:`, response);

              // Trigger callback if waiting for response
              const callback = this.responseCallbacks.get(deviceId);
              if (callback) {
                callback(response);
              }

              // Notify event listeners
              this.notifyListeners(deviceId, response);
            } catch (parseError) {
              console.warn(`[SerialManager] Invalid JSON from ${deviceId}:`, line);
            }
          }
        }
      }
    } catch (error) {
      console.error(`[SerialManager] Read error on ${deviceId}:`, error);

      // Try to reconnect
      if (conn.connected) {
        console.log(`[SerialManager] Attempting reconnect for ${deviceId}...`);
        await this.disconnect(deviceId);
      }
    }
  }

  /**
   * Notify event listeners
   */
  private notifyListeners(deviceId: string, data: DeviceResponse): void {
    this.eventListeners.get(deviceId)?.forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error('[SerialManager] Listener error:', error);
      }
    });
  }

  /**
   * Disconnect all devices
   */
  async disconnectAll(): Promise<void> {
    const deviceIds = Array.from(this.connections.keys());
    await Promise.all(deviceIds.map(id => this.disconnect(id)));
  }
}

// Singleton instance
export const SerialManager = new SerialManagerClass();

// Export for React hooks
export function useSerialManager() {
  return SerialManager;
}
