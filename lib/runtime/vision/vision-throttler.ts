/**
 * VisionThrottler — Frame rate limiting and deduplication for VLM inference
 *
 * Sits between camera capture and VLMVisionDetector to prevent frame backlog.
 * At 30fps camera input and ~200-500ms VLM inference, this prevents massive backlog.
 */

// =============================================================================
// Types
// =============================================================================

export interface VisionFrame {
  /** Raw image data (base64 or buffer) */
  data: string;
  /** Frame timestamp */
  timestamp: number;
  /** Frame width */
  width: number;
  /** Frame height */
  height: number;
  /** Optional hash for deduplication */
  hash?: string;
}

export interface ThrottlerConfig {
  /** Maximum frames per second to process (default: 2) */
  maxFPS: number;
  /** Maximum queue depth before dropping (default: 3) */
  maxQueueDepth: number;
  /** Deduplication threshold — frames with similarity above this are dropped (0-1, default: 0.95 meaning 95% similar = duplicate) */
  deduplicationThreshold: number;
  /** Target width for downscaling (default: 320) */
  targetWidth: number;
  /** Target height for downscaling (default: 240) */
  targetHeight: number;
  /** JPEG quality for compression (default: 70) */
  jpegQuality: number;
  /** Drop strategy when queue is full */
  dropStrategy: 'drop_oldest' | 'drop_newest';
}

export interface ThrottlerStats {
  framesReceived: number;
  framesProcessed: number;
  framesDropped: number;
  framesDeduplicated: number;
  effectiveFPS: number;
  queueDepth: number;
  lastFrameTimestamp: number;
}

// =============================================================================
// Defaults
// =============================================================================

const DEFAULT_CONFIG: ThrottlerConfig = {
  maxFPS: 2,
  maxQueueDepth: 3,
  deduplicationThreshold: 0.95,
  targetWidth: 320,
  targetHeight: 240,
  jpegQuality: 70,
  dropStrategy: 'drop_oldest',
};

// =============================================================================
// VisionThrottler
// =============================================================================

export class VisionThrottler {
  private readonly config: ThrottlerConfig;
  private queue: VisionFrame[] = [];
  private stats: ThrottlerStats;
  private lastProcessedTime: number = 0;
  private lastProcessedHash: string | null = null;
  private running: boolean = false;
  private processCallback: ((frame: VisionFrame) => Promise<void>) | null = null;
  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  private recentProcessedTimestamps: number[] = [];

  constructor(config: Partial<ThrottlerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.stats = this.createEmptyStats();
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Submit a frame for processing. Returns true if queued, false if dropped.
   */
  submitFrame(frame: VisionFrame): boolean {
    this.stats.framesReceived++;

    // Compute hash for the incoming frame if not already present
    const frameHash = frame.hash ?? VisionThrottler.computeFrameHash(frame.data);
    const frameWithHash: VisionFrame = { ...frame, hash: frameHash };

    // Check deduplication against last processed hash
    if (this.lastProcessedHash !== null) {
      const similarity = VisionThrottler.compareHashes(frameHash, this.lastProcessedHash);
      if (similarity >= this.config.deduplicationThreshold) {
        this.stats.framesDeduplicated++;
        this.stats.queueDepth = this.queue.length;
        return false;
      }
    }

    // Check rate limit: if within the rate limit window AND queue is at max depth, drop
    const now = Date.now();
    const minInterval = 1000 / this.config.maxFPS;
    if (now - this.lastProcessedTime < minInterval && this.queue.length >= this.config.maxQueueDepth) {
      if (this.config.dropStrategy === 'drop_newest') {
        this.stats.framesDropped++;
        this.stats.queueDepth = this.queue.length;
        return false;
      } else {
        // drop_oldest: remove the oldest from queue to make room
        this.queue.shift();
        this.stats.framesDropped++;
      }
    }

    // If queue is at max depth (without rate limit trigger), apply drop strategy
    if (this.queue.length >= this.config.maxQueueDepth) {
      if (this.config.dropStrategy === 'drop_oldest') {
        this.queue.shift();
        this.stats.framesDropped++;
      } else {
        // drop_newest: reject the incoming frame
        this.stats.framesDropped++;
        this.stats.queueDepth = this.queue.length;
        return false;
      }
    }

    this.queue.push(frameWithHash);
    this.stats.queueDepth = this.queue.length;
    return true;
  }

  /**
   * Dequeue the next frame for processing. Returns null if queue is empty.
   */
  dequeueFrame(): VisionFrame | null {
    if (this.queue.length === 0) {
      return null;
    }

    const frame = this.queue.shift()!;
    const now = Date.now();

    this.lastProcessedTime = now;
    this.lastProcessedHash = frame.hash ?? VisionThrottler.computeFrameHash(frame.data);
    this.stats.framesProcessed++;

    // Track recent processed timestamps for effective FPS calculation
    this.recentProcessedTimestamps.push(now);
    // Keep only timestamps from the last 5 seconds for rolling calculation
    const windowMs = 5000;
    while (
      this.recentProcessedTimestamps.length > 0 &&
      this.recentProcessedTimestamps[0] < now - windowMs
    ) {
      this.recentProcessedTimestamps.shift();
    }

    // Calculate effective FPS from recent timestamps
    if (this.recentProcessedTimestamps.length >= 2) {
      const oldest = this.recentProcessedTimestamps[0];
      const newest = this.recentProcessedTimestamps[this.recentProcessedTimestamps.length - 1];
      const durationSec = (newest - oldest) / 1000;
      if (durationSec > 0) {
        this.stats.effectiveFPS = (this.recentProcessedTimestamps.length - 1) / durationSec;
      }
    } else {
      this.stats.effectiveFPS = 0;
    }

    this.stats.lastFrameTimestamp = frame.timestamp;
    this.stats.queueDepth = this.queue.length;

    return frame;
  }

  /**
   * Returns a copy of the current throttler statistics.
   */
  getStats(): ThrottlerStats {
    return { ...this.stats };
  }

  /**
   * Returns the current queue depth.
   */
  getQueueDepth(): number {
    return this.queue.length;
  }

  /**
   * Flush all queued frames and return them. Clears the queue.
   */
  flush(): VisionFrame[] {
    const frames = [...this.queue];
    this.queue = [];
    this.stats.queueDepth = 0;
    return frames;
  }

  /**
   * Reset all state — clears queue, stats, and processing history.
   */
  reset(): void {
    this.queue = [];
    this.stats = this.createEmptyStats();
    this.lastProcessedTime = 0;
    this.lastProcessedHash = null;
    this.recentProcessedTimestamps = [];
  }

  /**
   * Start an automatic processing loop that dequeues frames and calls the callback.
   */
  startProcessLoop(
    callback: (frame: VisionFrame) => Promise<void>,
    intervalMs?: number,
  ): void {
    if (this.running) {
      return;
    }

    this.running = true;
    this.processCallback = callback;

    const interval = intervalMs ?? 1000 / this.config.maxFPS;

    this.intervalHandle = setInterval(async () => {
      if (!this.running) return;

      const frame = this.dequeueFrame();
      if (frame && this.processCallback) {
        await this.processCallback(frame);
      }
    }, interval);
  }

  /**
   * Stop the automatic processing loop.
   */
  stopProcessLoop(): void {
    this.running = false;
    if (this.intervalHandle !== null) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
    this.processCallback = null;
  }

  // ---------------------------------------------------------------------------
  // Static Utilities
  // ---------------------------------------------------------------------------

  /**
   * Compute a fast hash of frame data using djb2 algorithm.
   * Uses data length + first 64 chars + last 64 chars for speed.
   */
  static computeFrameHash(data: string): string {
    const len = data.length;
    const prefix = data.substring(0, 64);
    const suffix = data.substring(Math.max(0, len - 64));
    const sample = `${len}:${prefix}:${suffix}`;

    let hash = 5381;
    for (let i = 0; i < sample.length; i++) {
      // hash * 33 + charCode  (djb2)
      hash = ((hash << 5) + hash + sample.charCodeAt(i)) | 0;
    }

    // Convert to unsigned 32-bit hex string
    return (hash >>> 0).toString(16).padStart(8, '0');
  }

  /**
   * Compare two hashes for similarity. Returns 0.0 or 1.0 (binary comparison).
   * Identical hashes return 1.0, different hashes return 0.0.
   */
  static compareHashes(hash1: string, hash2: string): number {
    return hash1 === hash2 ? 1.0 : 0.0;
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private createEmptyStats(): ThrottlerStats {
    return {
      framesReceived: 0,
      framesProcessed: 0,
      framesDropped: 0,
      framesDeduplicated: 0,
      effectiveFPS: 0,
      queueDepth: 0,
      lastFrameTimestamp: 0,
    };
  }
}
