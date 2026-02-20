/**
 * MJPEG Stream Reader — HTTP multipart stream parser for ESP32-CAM
 *
 * Connects to an ESP32-CAM MJPEG HTTP endpoint and parses
 * multipart/x-mixed-replace boundary-delimited JPEG frames.
 *
 * Integrates with VisionThrottler for rate limiting before VLM inference.
 */

import { EventEmitter } from 'events';
import * as http from 'http';

// =============================================================================
// Types
// =============================================================================

export interface MJPEGStreamConfig {
  /** Full URL to MJPEG stream (e.g., http://192.168.1.51/stream) */
  url: string;
  /** Max frames per second to emit (default: 10) */
  maxFPS?: number;
  /** Connection timeout in ms (default: 5000) */
  connectTimeoutMs?: number;
  /** Auto-reconnect on disconnect (default: true) */
  autoReconnect?: boolean;
  /** Reconnect delay in ms (default: 2000) */
  reconnectDelayMs?: number;
}

export interface MJPEGStreamStats {
  framesReceived: number;
  fps: number;
  bytesReceived: number;
  connected: boolean;
  reconnects: number;
  errors: number;
  lastFrameTimestamp: number;
}

export type FrameCallback = (frame: Buffer, timestamp: number) => void;

// =============================================================================
// Defaults
// =============================================================================

const DEFAULT_CONFIG: Required<MJPEGStreamConfig> = {
  url: '',
  maxFPS: 10,
  connectTimeoutMs: 5000,
  autoReconnect: true,
  reconnectDelayMs: 2000,
};

// =============================================================================
// MJPEGStreamReader
// =============================================================================

export class MJPEGStreamReader extends EventEmitter {
  private config: Required<MJPEGStreamConfig>;
  private request: http.ClientRequest | null = null;
  private running = false;
  private frameCallbacks: FrameCallback[] = [];
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  // Frame parsing state
  private buffer = Buffer.alloc(0);
  private boundary = '';
  private minFrameIntervalMs: number;
  private lastFrameTime = 0;

  // Stats
  private stats = {
    framesReceived: 0,
    bytesReceived: 0,
    reconnects: 0,
    errors: 0,
    lastFrameTimestamp: 0,
    fpsWindowStart: 0,
    fpsWindowFrames: 0,
  };

  constructor(config: MJPEGStreamConfig) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.minFrameIntervalMs = 1000 / (this.config.maxFPS || 10);
  }

  /**
   * Register a callback for each decoded JPEG frame.
   */
  onFrame(callback: FrameCallback): void {
    this.frameCallbacks.push(callback);
  }

  /**
   * Start streaming — opens HTTP connection and begins parsing.
   */
  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.stats.fpsWindowStart = Date.now();
    this.stats.fpsWindowFrames = 0;

    return this.connectToStream();
  }

  /**
   * Stop streaming and close connection.
   */
  stop(): void {
    this.running = false;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.request) {
      this.request.destroy();
      this.request = null;
    }

    this.buffer = Buffer.alloc(0);
  }

  /**
   * Get current stream statistics.
   */
  getStats(): MJPEGStreamStats {
    const now = Date.now();
    const elapsed = (now - this.stats.fpsWindowStart) / 1000;
    const fps = elapsed > 0 ? this.stats.fpsWindowFrames / elapsed : 0;

    return {
      framesReceived: this.stats.framesReceived,
      fps: Math.round(fps * 10) / 10,
      bytesReceived: this.stats.bytesReceived,
      connected: this.request !== null && this.running,
      reconnects: this.stats.reconnects,
      errors: this.stats.errors,
      lastFrameTimestamp: this.stats.lastFrameTimestamp,
    };
  }

  /**
   * Check if the reader is running.
   */
  isRunning(): boolean {
    return this.running;
  }

  // ===========================================================================
  // Private
  // ===========================================================================

  private connectToStream(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const url = new URL(this.config.url);

      const options: http.RequestOptions = {
        hostname: url.hostname,
        port: url.port || 80,
        path: url.pathname,
        method: 'GET',
        timeout: this.config.connectTimeoutMs,
      };

      this.request = http.request(options, (res) => {
        if (res.statusCode !== 200) {
          const err = new Error(`HTTP ${res.statusCode}`);
          this.stats.errors++;
          this.emit('error', err);
          if (!this.running) reject(err);
          return;
        }

        // Extract boundary from Content-Type header
        const contentType = res.headers['content-type'] || '';
        const boundaryMatch = contentType.match(/boundary=(.+)/i);
        if (boundaryMatch) {
          this.boundary = boundaryMatch[1].trim();
        } else {
          this.boundary = 'frame'; // Default ESP32-CAM boundary
        }

        this.emit('connected');
        resolve();

        // Process incoming data chunks
        res.on('data', (chunk: Buffer) => {
          this.stats.bytesReceived += chunk.length;
          this.buffer = Buffer.concat([this.buffer, chunk]);
          this.parseFrames();
        });

        res.on('end', () => {
          this.handleDisconnect();
        });

        res.on('error', (err: Error) => {
          this.stats.errors++;
          this.emit('error', err);
          this.handleDisconnect();
        });
      });

      this.request.on('error', (err: Error) => {
        this.stats.errors++;
        this.emit('error', err);
        if (this.running) {
          this.handleDisconnect();
        } else {
          reject(err);
        }
      });

      this.request.on('timeout', () => {
        this.request?.destroy();
        const err = new Error('Connection timeout');
        this.stats.errors++;
        this.emit('error', err);
        if (!this.running) reject(err);
        else this.handleDisconnect();
      });

      this.request.end();
    });
  }

  /**
   * Parse JPEG frames from the accumulated buffer.
   *
   * MJPEG multipart format:
   *   --boundary\r\n
   *   Content-Type: image/jpeg\r\n
   *   Content-Length: NNN\r\n
   *   \r\n
   *   <JPEG data>
   *   \r\n
   *   --boundary\r\n
   *   ...
   */
  private parseFrames(): void {
    const boundaryMarker = `--${this.boundary}`;
    const boundaryBuf = Buffer.from(boundaryMarker);
    const headerEnd = Buffer.from('\r\n\r\n');

    while (true) {
      // Find boundary
      const boundaryIdx = this.buffer.indexOf(boundaryBuf);
      if (boundaryIdx === -1) break;

      // Find the end of headers (double CRLF)
      const headerStart = boundaryIdx + boundaryBuf.length;
      const headerEndIdx = this.buffer.indexOf(headerEnd, headerStart);
      if (headerEndIdx === -1) break; // Incomplete headers

      // Parse Content-Length from headers
      const headerStr = this.buffer.slice(headerStart, headerEndIdx).toString();
      let contentLength = -1;
      const clMatch = headerStr.match(/Content-Length:\s*(\d+)/i);
      if (clMatch) {
        contentLength = parseInt(clMatch[1], 10);
      }

      const dataStart = headerEndIdx + headerEnd.length;

      if (contentLength > 0) {
        // We know the exact frame size
        if (this.buffer.length < dataStart + contentLength) break; // Incomplete frame

        const frameData = this.buffer.slice(dataStart, dataStart + contentLength);
        this.emitFrame(frameData);

        // Advance buffer past this frame
        this.buffer = this.buffer.slice(dataStart + contentLength);
      } else {
        // No Content-Length — find next boundary
        const nextBoundary = this.buffer.indexOf(boundaryBuf, dataStart);
        if (nextBoundary === -1) break; // Wait for more data

        // Frame data is between headers end and next boundary (minus trailing \r\n)
        let frameEnd = nextBoundary;
        // Strip trailing \r\n before boundary
        if (frameEnd >= 2 && this.buffer[frameEnd - 2] === 0x0d && this.buffer[frameEnd - 1] === 0x0a) {
          frameEnd -= 2;
        }

        const frameData = this.buffer.slice(dataStart, frameEnd);
        this.emitFrame(frameData);

        // Don't consume the next boundary marker — it will be found on next iteration
        this.buffer = this.buffer.slice(nextBoundary);
      }
    }

    // Prevent unbounded buffer growth — keep last 500KB max
    if (this.buffer.length > 500 * 1024) {
      this.buffer = this.buffer.slice(this.buffer.length - 100 * 1024);
    }
  }

  private emitFrame(data: Buffer): void {
    // Validate JPEG: starts with FFD8 (SOI marker)
    if (data.length < 2 || data[0] !== 0xff || data[1] !== 0xd8) {
      return; // Not a valid JPEG
    }

    // Rate limiting
    const now = Date.now();
    if (now - this.lastFrameTime < this.minFrameIntervalMs) {
      return; // Skip frame to maintain target FPS
    }
    this.lastFrameTime = now;

    this.stats.framesReceived++;
    this.stats.fpsWindowFrames++;
    this.stats.lastFrameTimestamp = now;

    // Reset FPS window every 5 seconds
    if (now - this.stats.fpsWindowStart > 5000) {
      this.stats.fpsWindowStart = now;
      this.stats.fpsWindowFrames = 1;
    }

    // Emit to callbacks
    for (const cb of this.frameCallbacks) {
      cb(data, now);
    }

    this.emit('frame', data, now);
  }

  private handleDisconnect(): void {
    this.request = null;

    if (this.running && this.config.autoReconnect) {
      this.stats.reconnects++;
      this.emit('reconnecting');

      this.reconnectTimer = setTimeout(() => {
        if (this.running) {
          this.connectToStream().catch((err) => {
            this.emit('error', err);
            this.handleDisconnect();
          });
        }
      }, this.config.reconnectDelayMs);
    }
  }
}
