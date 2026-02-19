/**
 * Reliable Serial Protocol
 *
 * Enhances the raw newline-delimited JSON protocol with:
 * - CRC-16 checksums on payload
 * - Monotonically increasing sequence numbers
 * - Ack timeout with configurable retry
 * - Pending ack tracking
 * - Protocol statistics
 *
 * Frame format: {"seq":N,"payload":{...},"crc":"XXXX","ack_required":true}\n
 * Ack format:   {"ack_seq":N,"success":true}\n
 */

export interface SerialFrame {
  seq: number;
  payload: Record<string, unknown>;
  crc: string;
  ack_required: boolean;
}

export interface SerialAck {
  ack_seq: number;
  success: boolean;
  error?: string;
}

export interface SerialProtocolConfig {
  /** Ack timeout in ms (default: 2000) */
  ackTimeoutMs: number;
  /** Max retry attempts (default: 3) */
  maxRetries: number;
  /** Whether to require acks by default (default: true) */
  requireAck: boolean;
}

export interface SerialProtocolStats {
  framesSent: number;
  framesReceived: number;
  acksSent: number;
  acksReceived: number;
  retries: number;
  checksumErrors: number;
  timeouts: number;
  avgRoundTripMs: number;
}

const DEFAULT_CONFIG: SerialProtocolConfig = {
  ackTimeoutMs: 2000,
  maxRetries: 3,
  requireAck: true,
};

interface PendingAck {
  resolve: (ack: SerialAck) => void;
  reject: (error: Error) => void;
  sentAt: number;
  retryCount: number;
  payload: Record<string, unknown>;
  timer: ReturnType<typeof setTimeout>;
  frame: SerialFrame;
}

export class ReliableSerialProtocol {
  private config: SerialProtocolConfig;
  private sendRaw: (data: string) => Promise<void>;
  private nextSeq: number = 1;
  private stats: Omit<SerialProtocolStats, 'avgRoundTripMs'> = {
    framesSent: 0,
    framesReceived: 0,
    acksSent: 0,
    acksReceived: 0,
    retries: 0,
    checksumErrors: 0,
    timeouts: 0,
  };
  private pendingAcks: Map<number, PendingAck> = new Map();
  private roundTripTimes: number[] = [];

  constructor(
    sendRaw: (data: string) => Promise<void>,
    config: Partial<SerialProtocolConfig> = {}
  ) {
    this.sendRaw = sendRaw;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * CRC-16/CCITT-FALSE implementation.
   * Processes each character of the data string using polynomial 0x1021
   * with initial value 0xFFFF.
   */
  static crc16(data: string): string {
    let crc = 0xffff;
    for (let i = 0; i < data.length; i++) {
      crc ^= data.charCodeAt(i) << 8;
      for (let j = 0; j < 8; j++) {
        if (crc & 0x8000) {
          crc = (crc << 1) ^ 0x1021;
        } else {
          crc = crc << 1;
        }
        crc &= 0xffff;
      }
    }
    return crc.toString(16).toUpperCase().padStart(4, '0');
  }

  /**
   * Create a frame with next seq number, compute CRC on JSON.stringify(payload),
   * and increment nextSeq.
   */
  encodeFrame(
    payload: Record<string, unknown>,
    ackRequired?: boolean
  ): SerialFrame {
    const seq = this.nextSeq++;
    const crc = ReliableSerialProtocol.crc16(JSON.stringify(payload));
    const ack_required =
      ackRequired !== undefined ? ackRequired : this.config.requireAck;

    return { seq, payload, crc, ack_required };
  }

  /**
   * Parse JSON, verify it has seq/payload/crc fields. Verify CRC matches.
   * If checksum fails, increment stats.checksumErrors, return null.
   */
  decodeFrame(raw: string): SerialFrame | null {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }

    if (
      typeof parsed.seq !== 'number' ||
      typeof parsed.payload !== 'object' ||
      parsed.payload === null ||
      typeof parsed.crc !== 'string'
    ) {
      return null;
    }

    const frame = parsed as unknown as SerialFrame;
    const expectedCrc = ReliableSerialProtocol.crc16(
      JSON.stringify(frame.payload)
    );

    if (frame.crc !== expectedCrc) {
      this.stats.checksumErrors++;
      return null;
    }

    return frame;
  }

  /**
   * Parse JSON, verify it has ack_seq field.
   */
  decodeAck(raw: string): SerialAck | null {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }

    if (typeof parsed.ack_seq !== 'number') {
      return null;
    }

    return parsed as unknown as SerialAck;
  }

  /**
   * Send a payload with optional ack requirement.
   *
   * If ack not required: sends immediately and returns synthetic success ack.
   * If ack required: sends and sets up pending ack with timeout/retry logic.
   */
  async send(
    payload: Record<string, unknown>,
    ackRequired?: boolean
  ): Promise<SerialAck> {
    const frame = this.encodeFrame(payload, ackRequired);
    const raw = JSON.stringify(frame) + '\n';

    if (!frame.ack_required) {
      await this.sendRaw(raw);
      this.stats.framesSent++;
      return { ack_seq: frame.seq, success: true };
    }

    return new Promise<SerialAck>((resolve, reject) => {
      const setupTimeout = (pending: PendingAck): ReturnType<typeof setTimeout> => {
        return setTimeout(async () => {
          if (!this.pendingAcks.has(frame.seq)) return;

          if (pending.retryCount >= this.config.maxRetries) {
            this.pendingAcks.delete(frame.seq);
            this.stats.timeouts++;
            reject(new Error('Max retries exceeded'));
            return;
          }

          // Retry: re-send same frame
          pending.retryCount++;
          this.stats.retries++;
          try {
            await this.sendRaw(JSON.stringify(pending.frame) + '\n');
            this.stats.framesSent++;
          } catch {
            // send failure on retry -- keep trying via next timeout
          }
          pending.timer = setupTimeout(pending);
        }, this.config.ackTimeoutMs);
      };

      const pending: PendingAck = {
        resolve,
        reject,
        sentAt: Date.now(),
        retryCount: 0,
        payload,
        frame,
        timer: null as unknown as ReturnType<typeof setTimeout>,
      };

      pending.timer = setupTimeout(pending);
      this.pendingAcks.set(frame.seq, pending);

      this.sendRaw(raw)
        .then(() => {
          this.stats.framesSent++;
        })
        .catch((err) => {
          clearTimeout(pending.timer);
          this.pendingAcks.delete(frame.seq);
          reject(err);
        });
    });
  }

  /**
   * Process a received ack. Find in pendingAcks, resolve promise,
   * update roundTripTimes and stats.
   */
  receiveAck(raw: string): void {
    const ack = this.decodeAck(raw);
    if (!ack) return;

    const pending = this.pendingAcks.get(ack.ack_seq);
    if (!pending) return;

    clearTimeout(pending.timer);
    this.pendingAcks.delete(ack.ack_seq);

    const rtt = Date.now() - pending.sentAt;
    this.roundTripTimes.push(rtt);
    if (this.roundTripTimes.length > 50) {
      this.roundTripTimes.shift();
    }

    this.stats.acksReceived++;
    pending.resolve(ack);
  }

  /**
   * Decode incoming frame. If valid and ack_required, generate ack JSON string
   * to send back. Return the frame and ack string. Increment framesReceived.
   */
  receiveFrame(
    raw: string
  ): { frame: SerialFrame; ack: string } | null {
    const frame = this.decodeFrame(raw);
    if (!frame) return null;

    this.stats.framesReceived++;

    let ack = '';
    if (frame.ack_required) {
      ack = this.createAck(frame.seq, true);
      this.stats.acksSent++;
    }

    return { frame, ack };
  }

  /**
   * Create ack JSON string for the given seq.
   */
  createAck(seq: number, success: boolean, error?: string): string {
    const ack: SerialAck = { ack_seq: seq, success };
    if (error !== undefined) {
      ack.error = error;
    }
    return JSON.stringify(ack);
  }

  /**
   * Return copy of stats with computed avgRoundTripMs.
   */
  getStats(): SerialProtocolStats {
    const avgRoundTripMs =
      this.roundTripTimes.length > 0
        ? this.roundTripTimes.reduce((a, b) => a + b, 0) /
          this.roundTripTimes.length
        : 0;

    return { ...this.stats, avgRoundTripMs };
  }

  /**
   * Return number of pending acks.
   */
  getPendingCount(): number {
    return this.pendingAcks.size;
  }

  /**
   * Clear pendingAcks (reject all with 'Protocol reset'), reset stats, reset seq to 1.
   */
  reset(): void {
    for (const [seq, pending] of this.pendingAcks) {
      clearTimeout(pending.timer);
      pending.reject(new Error('Protocol reset'));
      this.pendingAcks.delete(seq);
    }

    this.stats = {
      framesSent: 0,
      framesReceived: 0,
      acksSent: 0,
      acksReceived: 0,
      retries: 0,
      checksumErrors: 0,
      timeouts: 0,
    };
    this.roundTripTimes = [];
    this.nextSeq = 1;
  }

  /**
   * Clear all pending timers, reject all pending with 'Protocol destroyed'.
   */
  destroy(): void {
    for (const [seq, pending] of this.pendingAcks) {
      clearTimeout(pending.timer);
      pending.reject(new Error('Protocol destroyed'));
      this.pendingAcks.delete(seq);
    }
  }
}
