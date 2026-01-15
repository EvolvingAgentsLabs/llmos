/**
 * Electron Serial Port Manager
 *
 * Provides native serial port communication for ESP32 and other hardware.
 * Uses node-serialport instead of Web Serial API for better compatibility
 * and reliability.
 *
 * Benefits over Web Serial API:
 * - Works without user gesture
 * - Better error handling
 * - Auto-reconnect support
 * - No browser compatibility issues
 */

import { EventEmitter } from 'events';

// SerialPort types (dynamically imported)
interface SerialPortType {
  path: string;
  write(data: Buffer | string, callback?: (err: Error | null) => void): boolean;
  close(callback?: (err: Error | null) => void): void;
  on(event: string, callback: (...args: any[]) => void): this;
  isOpen: boolean;
}

interface PortInfoType {
  path: string;
  manufacturer?: string;
  serialNumber?: string;
  vendorId?: string;
  productId?: string;
  pnpId?: string;
  locationId?: string;
}

export interface SerialPortOptions {
  baudRate?: number;
  dataBits?: 5 | 6 | 7 | 8;
  stopBits?: 1 | 1.5 | 2;
  parity?: 'none' | 'even' | 'odd' | 'mark' | 'space';
  autoOpen?: boolean;
}

/**
 * Serial Port Manager for Electron
 */
export class ElectronSerialManager extends EventEmitter {
  private ports: Map<string, SerialPortType> = new Map();
  private SerialPort: any = null;
  private isInitialized = false;

  constructor() {
    super();
    this.initializeSerialPort();
  }

  /**
   * Initialize the serialport module
   */
  private async initializeSerialPort(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Dynamic import of serialport (optional dependency)
      const serialport = await import('serialport');
      this.SerialPort = serialport.SerialPort;
      this.isInitialized = true;
      console.log('[Serial] SerialPort module loaded');
    } catch (error) {
      console.warn('[Serial] SerialPort module not available:', error);
      // Continue without serial support
    }
  }

  /**
   * List available serial ports
   */
  async listPorts(): Promise<PortInfoType[]> {
    if (!this.isInitialized || !this.SerialPort) {
      await this.initializeSerialPort();
    }

    if (!this.SerialPort) {
      console.warn('[Serial] SerialPort not available');
      return [];
    }

    try {
      const serialport = await import('serialport');
      const ports = await serialport.SerialPort.list();

      // Filter for likely ESP32 devices
      const filtered = ports.map((port: PortInfoType) => ({
        path: port.path,
        manufacturer: port.manufacturer,
        serialNumber: port.serialNumber,
        vendorId: port.vendorId,
        productId: port.productId,
      }));

      console.log('[Serial] Found ports:', filtered.map((p: PortInfoType) => p.path).join(', '));
      return filtered;
    } catch (error) {
      console.error('[Serial] Failed to list ports:', error);
      return [];
    }
  }

  /**
   * Connect to a serial port
   */
  async connect(portPath: string, options: SerialPortOptions = {}): Promise<boolean> {
    if (!this.SerialPort) {
      await this.initializeSerialPort();
      if (!this.SerialPort) {
        throw new Error('SerialPort module not available. Install with: npm install serialport');
      }
    }

    // Check if already connected
    if (this.ports.has(portPath)) {
      const existingPort = this.ports.get(portPath)!;
      if (existingPort.isOpen) {
        console.log(`[Serial] Already connected to ${portPath}`);
        return true;
      }
    }

    const {
      baudRate = 115200,
      dataBits = 8,
      stopBits = 1,
      parity = 'none',
    } = options;

    console.log(`[Serial] Connecting to ${portPath} at ${baudRate} baud...`);

    try {
      const port = new this.SerialPort({
        path: portPath,
        baudRate,
        dataBits,
        stopBits,
        parity,
        autoOpen: true,
      });

      // Set up event handlers
      port.on('data', (data: Buffer) => {
        this.emit('data', portPath, data);
      });

      port.on('error', (error: Error) => {
        console.error(`[Serial] Error on ${portPath}:`, error);
        this.emit('error', portPath, error);
      });

      port.on('close', () => {
        console.log(`[Serial] Port ${portPath} closed`);
        this.ports.delete(portPath);
        this.emit('close', portPath);
      });

      port.on('open', () => {
        console.log(`[Serial] Connected to ${portPath}`);
      });

      // Wait for port to open
      await new Promise<void>((resolve, reject) => {
        port.on('open', () => resolve());
        port.on('error', (err: Error) => reject(err));

        // Timeout after 5 seconds
        setTimeout(() => reject(new Error('Connection timeout')), 5000);
      });

      this.ports.set(portPath, port);
      return true;

    } catch (error: any) {
      console.error(`[Serial] Failed to connect to ${portPath}:`, error);
      throw new Error(`Failed to connect to ${portPath}: ${error.message}`);
    }
  }

  /**
   * Disconnect from a serial port
   */
  async disconnect(portPath: string): Promise<void> {
    const port = this.ports.get(portPath);
    if (!port) {
      return;
    }

    return new Promise((resolve, reject) => {
      port.close((error) => {
        if (error) {
          console.error(`[Serial] Error closing ${portPath}:`, error);
          reject(error);
        } else {
          this.ports.delete(portPath);
          console.log(`[Serial] Disconnected from ${portPath}`);
          resolve();
        }
      });
    });
  }

  /**
   * Disconnect from all ports
   */
  async disconnectAll(): Promise<void> {
    const portPaths = Array.from(this.ports.keys());
    for (const portPath of portPaths) {
      try {
        await this.disconnect(portPath);
      } catch (error) {
        console.warn(`[Serial] Error disconnecting from ${portPath}:`, error);
      }
    }
  }

  /**
   * Write data to a serial port
   */
  async write(portPath: string, data: Buffer | string): Promise<void> {
    const port = this.ports.get(portPath);
    if (!port) {
      throw new Error(`Not connected to ${portPath}`);
    }

    if (!port.isOpen) {
      throw new Error(`Port ${portPath} is not open`);
    }

    return new Promise((resolve, reject) => {
      port.write(typeof data === 'string' ? data : Buffer.from(data), (error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Write WASM binary to device using LLMos protocol
   */
  async deployWasm(
    portPath: string,
    wasmBinary: Uint8Array,
    metadata?: { name?: string; version?: string }
  ): Promise<void> {
    const port = this.ports.get(portPath);
    if (!port || !port.isOpen) {
      throw new Error(`Not connected to ${portPath}`);
    }

    console.log(`[Serial] Deploying WASM (${wasmBinary.length} bytes) to ${portPath}...`);

    // LLMos WASM deployment protocol:
    // 1. Magic bytes: 0x12 0x34
    // 2. Command: "deploy"
    // 3. Metadata JSON
    // 4. WASM size (4 bytes, little-endian)
    // 5. WASM binary

    const meta = JSON.stringify({
      name: metadata?.name || 'robot',
      version: metadata?.version || '1.0.0',
      size: wasmBinary.length,
      timestamp: Date.now(),
    });

    // Build packet
    const header = Buffer.alloc(2);
    header[0] = 0x12;
    header[1] = 0x34;

    const command = Buffer.from('deploy\n');
    const metaBuffer = Buffer.from(meta + '\n');

    const sizeBuffer = Buffer.alloc(4);
    sizeBuffer.writeUInt32LE(wasmBinary.length, 0);

    // Send header
    await this.write(portPath, header);

    // Send command
    await this.write(portPath, command);

    // Send metadata
    await this.write(portPath, metaBuffer);

    // Send size
    await this.write(portPath, sizeBuffer);

    // Send WASM in chunks (1024 bytes)
    const chunkSize = 1024;
    for (let i = 0; i < wasmBinary.length; i += chunkSize) {
      const chunk = wasmBinary.slice(i, Math.min(i + chunkSize, wasmBinary.length));
      await this.write(portPath, Buffer.from(chunk));

      // Small delay between chunks for device to process
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    console.log(`[Serial] WASM deployment complete`);
  }

  /**
   * Check if connected to a port
   */
  isConnected(portPath: string): boolean {
    const port = this.ports.get(portPath);
    return port?.isOpen ?? false;
  }

  /**
   * Get list of connected ports
   */
  getConnectedPorts(): string[] {
    return Array.from(this.ports.entries())
      .filter(([_, port]) => port.isOpen)
      .map(([path, _]) => path);
  }

  /**
   * Send a JSON command to device
   */
  async sendCommand(portPath: string, command: object): Promise<void> {
    const json = JSON.stringify(command) + '\n';
    await this.write(portPath, json);
  }

  /**
   * Reset device via RTS/DTR toggle (ESP32 auto-reset)
   */
  async resetDevice(portPath: string): Promise<void> {
    const port = this.ports.get(portPath) as any;
    if (!port || !port.isOpen) {
      throw new Error(`Not connected to ${portPath}`);
    }

    // Toggle DTR/RTS for ESP32 reset sequence
    return new Promise((resolve, reject) => {
      port.set({ dtr: false, rts: true }, (err: Error | null) => {
        if (err) return reject(err);

        setTimeout(() => {
          port.set({ dtr: true, rts: false }, (err: Error | null) => {
            if (err) return reject(err);

            setTimeout(() => {
              port.set({ dtr: false, rts: false }, (err: Error | null) => {
                if (err) return reject(err);
                console.log(`[Serial] Device ${portPath} reset`);
                resolve();
              });
            }, 50);
          });
        }, 100);
      });
    });
  }
}
