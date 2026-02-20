/**
 * WiFi Connection — UDP transport for ESP32-S3 stepper controller
 *
 * Replaces USB serial with WiFi UDP for V1 hardware.
 * Sends JSON commands, waits for JSON responses with timeout + retry.
 * Uses sequence numbers for request-response matching.
 */

import * as dgram from 'dgram';
import { EventEmitter } from 'events';

// =============================================================================
// Types
// =============================================================================

export interface WiFiConnectionConfig {
  /** ESP32-S3 IP address */
  host: string;
  /** UDP command port (default: 4210) */
  commandPort: number;
  /** ESP32-CAM IP address (optional) */
  cameraHost?: string;
  /** Camera HTTP port (default: 80) */
  cameraPort?: number;
  /** Command timeout in ms (default: 2000) */
  timeoutMs: number;
  /** Max retry attempts (default: 3) */
  retries: number;
}

export interface WiFiConnectionStats {
  commandsSent: number;
  responsesReceived: number;
  timeouts: number;
  retries: number;
  avgRoundTripMs: number;
  connected: boolean;
}

interface PendingCommand {
  resolve: (response: Record<string, unknown>) => void;
  reject: (error: Error) => void;
  sentAt: number;
  retryCount: number;
  payload: Record<string, unknown>;
  timer: ReturnType<typeof setTimeout>;
}

// =============================================================================
// Defaults
// =============================================================================

const DEFAULT_CONFIG: WiFiConnectionConfig = {
  host: '192.168.1.100',
  commandPort: 4210,
  cameraPort: 80,
  timeoutMs: 2000,
  retries: 3,
};

// =============================================================================
// WiFiConnection
// =============================================================================

export class WiFiConnection extends EventEmitter {
  private config: WiFiConnectionConfig;
  private socket: dgram.Socket | null = null;
  private connected = false;
  private nextSeq = 1;
  private pending: Map<number, PendingCommand> = new Map();
  private roundTripTimes: number[] = [];

  private stats = {
    commandsSent: 0,
    responsesReceived: 0,
    timeouts: 0,
    retries: 0,
  };

  constructor(config: Partial<WiFiConnectionConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Open the UDP socket and bind to a local port.
   */
  async connect(): Promise<void> {
    if (this.connected) return;

    return new Promise((resolve, reject) => {
      this.socket = dgram.createSocket('udp4');

      this.socket.on('message', (msg: Buffer) => {
        this.handleResponse(msg);
      });

      this.socket.on('error', (err: Error) => {
        this.emit('error', err);
        if (!this.connected) {
          reject(err);
        }
      });

      this.socket.bind(() => {
        this.connected = true;
        this.emit('connected');
        resolve();
      });
    });
  }

  /**
   * Close the UDP socket and clean up pending commands.
   */
  async disconnect(): Promise<void> {
    if (!this.connected || !this.socket) return;

    // Reject all pending commands
    for (const [seq, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(new Error('Connection closed'));
      this.pending.delete(seq);
    }

    return new Promise((resolve) => {
      this.socket!.close(() => {
        this.socket = null;
        this.connected = false;
        this.emit('disconnected');
        resolve();
      });
    });
  }

  /**
   * Send a JSON command and wait for response.
   * Implements timeout + retry logic.
   */
  async sendCommand(cmd: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (!this.connected || !this.socket) {
      throw new Error('Not connected');
    }

    const seq = this.nextSeq++;

    return new Promise((resolve, reject) => {
      const sendAttempt = (retryCount: number) => {
        const payload = { ...cmd, _seq: seq };
        const data = Buffer.from(JSON.stringify(payload));

        const timer = setTimeout(() => {
          if (retryCount < this.config.retries) {
            this.stats.retries++;
            this.stats.timeouts++;
            sendAttempt(retryCount + 1);
          } else {
            this.pending.delete(seq);
            this.stats.timeouts++;
            reject(new Error(`Command timeout after ${this.config.retries} retries: ${cmd.cmd}`));
          }
        }, this.config.timeoutMs);

        const pendingCmd: PendingCommand = {
          resolve,
          reject,
          sentAt: Date.now(),
          retryCount,
          payload: cmd,
          timer,
        };

        this.pending.set(seq, pendingCmd);

        this.socket!.send(data, this.config.commandPort, this.config.host, (err) => {
          if (err) {
            clearTimeout(timer);
            this.pending.delete(seq);
            reject(err);
          } else {
            this.stats.commandsSent++;
          }
        });
      };

      sendAttempt(0);
    });
  }

  /**
   * Check if connected.
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Get connection statistics.
   */
  getStats(): WiFiConnectionStats {
    const avgRoundTrip = this.roundTripTimes.length > 0
      ? this.roundTripTimes.reduce((a, b) => a + b, 0) / this.roundTripTimes.length
      : 0;

    return {
      ...this.stats,
      avgRoundTripMs: Math.round(avgRoundTrip * 100) / 100,
      connected: this.connected,
    };
  }

  /**
   * Get the camera stream URL if camera host is configured.
   */
  getCameraStreamUrl(): string | null {
    if (!this.config.cameraHost) return null;
    return `http://${this.config.cameraHost}:${this.config.cameraPort || 80}/stream`;
  }

  // ===========================================================================
  // Private
  // ===========================================================================

  private handleResponse(msg: Buffer): void {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(msg.toString());
    } catch {
      this.emit('error', new Error('Invalid JSON response'));
      return;
    }

    this.stats.responsesReceived++;

    // Match response to pending command
    // The firmware may not echo _seq, so resolve the oldest pending command
    // if there's only one, or match by _seq if present
    const seq = parsed._seq as number | undefined;

    let pendingCmd: PendingCommand | undefined;
    let matchedSeq: number | undefined;

    if (seq !== undefined && this.pending.has(seq)) {
      pendingCmd = this.pending.get(seq);
      matchedSeq = seq;
    } else if (this.pending.size === 1) {
      // Only one pending command — match it
      const [firstSeq, firstCmd] = this.pending.entries().next().value as [number, PendingCommand];
      pendingCmd = firstCmd;
      matchedSeq = firstSeq;
    } else if (this.pending.size > 0) {
      // Multiple pending: resolve the oldest one
      let oldestSeq: number | undefined;
      let oldestTime = Infinity;
      for (const [s, cmd] of this.pending) {
        if (cmd.sentAt < oldestTime) {
          oldestTime = cmd.sentAt;
          oldestSeq = s;
        }
      }
      if (oldestSeq !== undefined) {
        pendingCmd = this.pending.get(oldestSeq);
        matchedSeq = oldestSeq;
      }
    }

    if (pendingCmd && matchedSeq !== undefined) {
      clearTimeout(pendingCmd.timer);
      this.pending.delete(matchedSeq);

      const roundTrip = Date.now() - pendingCmd.sentAt;
      this.roundTripTimes.push(roundTrip);
      // Keep last 100 measurements
      if (this.roundTripTimes.length > 100) {
        this.roundTripTimes.shift();
      }

      pendingCmd.resolve(parsed);
    }

    this.emit('response', parsed);
  }
}
