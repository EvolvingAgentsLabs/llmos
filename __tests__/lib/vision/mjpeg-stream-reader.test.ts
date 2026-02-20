/**
 * Tests for MJPEGStreamReader — MJPEG HTTP multipart stream parser
 *
 * Mocks http.request to test frame parsing without real network.
 */

import { MJPEGStreamReader } from '../../../lib/vision/mjpeg-stream-reader';
import * as http from 'http';
import { EventEmitter } from 'events';

// =============================================================================
// Mock HTTP
// =============================================================================

class MockIncomingMessage extends EventEmitter {
  statusCode = 200;
  headers: Record<string, string> = {
    'content-type': 'multipart/x-mixed-replace;boundary=frame',
  };
}

class MockClientRequest extends EventEmitter {
  destroyed = false;

  end() {
    // Connection opened
  }

  destroy() {
    this.destroyed = true;
  }
}

let mockRequest: MockClientRequest;
let mockResponse: MockIncomingMessage;

jest.mock('http', () => ({
  request: jest.fn((options: unknown, callback: (res: MockIncomingMessage) => void) => {
    mockRequest = new MockClientRequest();
    mockResponse = new MockIncomingMessage();
    process.nextTick(() => callback(mockResponse));
    return mockRequest;
  }),
}));

// =============================================================================
// Helpers
// =============================================================================

/** Create a minimal valid JPEG buffer (SOI + EOI markers) */
function createFakeJPEG(size: number = 100): Buffer {
  const buf = Buffer.alloc(size);
  buf[0] = 0xff; // SOI marker
  buf[1] = 0xd8;
  buf[size - 2] = 0xff; // EOI marker
  buf[size - 1] = 0xd9;
  return buf;
}

/** Build an MJPEG multipart chunk with boundary and headers */
function buildMJPEGChunk(jpegData: Buffer, boundary: string = 'frame'): Buffer {
  const header = `--${boundary}\r\nContent-Type: image/jpeg\r\nContent-Length: ${jpegData.length}\r\n\r\n`;
  return Buffer.concat([Buffer.from(header), jpegData, Buffer.from('\r\n')]);
}

describe('MJPEGStreamReader', () => {
  let reader: MJPEGStreamReader;

  beforeEach(() => {
    reader = new MJPEGStreamReader({
      url: 'http://192.168.1.51/stream',
      maxFPS: 30,
      autoReconnect: false,
    });
  });

  afterEach(() => {
    reader.stop();
  });

  // ===========================================================================
  // Connection
  // ===========================================================================

  test('start connects to stream URL', async () => {
    await reader.start();

    expect(http.request).toHaveBeenCalled();
    expect(reader.isRunning()).toBe(true);
  });

  test('stop closes connection', async () => {
    await reader.start();
    reader.stop();

    expect(reader.isRunning()).toBe(false);
  });

  test('start is idempotent', async () => {
    await reader.start();
    await reader.start();
    expect(reader.isRunning()).toBe(true);
  });

  // ===========================================================================
  // Frame parsing
  // ===========================================================================

  test('parses single JPEG frame from multipart stream', async () => {
    const frames: Buffer[] = [];
    reader.onFrame((frame) => frames.push(frame));

    await reader.start();

    const jpeg = createFakeJPEG(200);
    const chunk = buildMJPEGChunk(jpeg);
    mockResponse.emit('data', chunk);

    expect(frames.length).toBe(1);
    expect(frames[0].length).toBe(200);
    expect(frames[0][0]).toBe(0xff);
    expect(frames[0][1]).toBe(0xd8);
  });

  test('parses multiple JPEG frames', async () => {
    // Use Infinity FPS to avoid rate-limiting (1000/Infinity = 0, and 0 < 0 is false)
    const fastReader = new MJPEGStreamReader({
      url: 'http://192.168.1.51/stream',
      maxFPS: Infinity,
      autoReconnect: false,
    });

    const frames: Buffer[] = [];
    fastReader.onFrame((frame) => frames.push(frame));

    await fastReader.start();

    const jpeg1 = createFakeJPEG(100);
    const jpeg2 = createFakeJPEG(150);
    const chunk = Buffer.concat([buildMJPEGChunk(jpeg1), buildMJPEGChunk(jpeg2)]);
    mockResponse.emit('data', chunk);

    expect(frames.length).toBe(2);
    expect(frames[0].length).toBe(100);
    expect(frames[1].length).toBe(150);

    fastReader.stop();
  });

  test('handles frames split across chunks', async () => {
    const frames: Buffer[] = [];
    reader.onFrame((frame) => frames.push(frame));

    await reader.start();

    const jpeg = createFakeJPEG(200);
    const fullChunk = buildMJPEGChunk(jpeg);

    // Split in the middle
    const half = Math.floor(fullChunk.length / 2);
    mockResponse.emit('data', fullChunk.slice(0, half));
    expect(frames.length).toBe(0); // Incomplete

    mockResponse.emit('data', fullChunk.slice(half));
    expect(frames.length).toBe(1);
    expect(frames[0].length).toBe(200);
  });

  test('rejects non-JPEG data', async () => {
    const frames: Buffer[] = [];
    reader.onFrame((frame) => frames.push(frame));

    await reader.start();

    const badData = Buffer.alloc(100);
    badData[0] = 0x00;
    badData[1] = 0x00;
    const chunk = buildMJPEGChunk(badData);
    mockResponse.emit('data', chunk);

    expect(frames.length).toBe(0);
  });

  // ===========================================================================
  // Stats
  // ===========================================================================

  test('getStats tracks frames and bytes', async () => {
    reader.onFrame(() => {});
    await reader.start();

    const jpeg = createFakeJPEG(500);
    mockResponse.emit('data', buildMJPEGChunk(jpeg));

    const stats = reader.getStats();
    expect(stats.framesReceived).toBe(1);
    expect(stats.bytesReceived).toBeGreaterThan(500);
    expect(stats.connected).toBe(true);
    expect(stats.errors).toBe(0);
  });

  test('getStats returns zeroes before start', () => {
    const stats = reader.getStats();
    expect(stats.framesReceived).toBe(0);
    expect(stats.fps).toBe(0);
    expect(stats.bytesReceived).toBe(0);
    expect(stats.connected).toBe(false);
  });

  // ===========================================================================
  // Frame callback
  // ===========================================================================

  test('onFrame provides timestamp with each frame', async () => {
    const timestamps: number[] = [];
    reader.onFrame((_frame, ts) => timestamps.push(ts));

    await reader.start();

    mockResponse.emit('data', buildMJPEGChunk(createFakeJPEG()));
    expect(timestamps.length).toBe(1);
    expect(timestamps[0]).toBeGreaterThan(0);
    expect(timestamps[0]).toBeLessThanOrEqual(Date.now());
  });

  test('emits frame event', async () => {
    const framePromise = new Promise<Buffer>((resolve) => {
      reader.on('frame', (data: Buffer) => resolve(data));
    });

    await reader.start();
    mockResponse.emit('data', buildMJPEGChunk(createFakeJPEG(64)));

    const frame = await framePromise;
    expect(frame.length).toBe(64);
  });

  // ===========================================================================
  // FPS throttling
  // ===========================================================================

  test('respects maxFPS setting', async () => {
    const slowReader = new MJPEGStreamReader({
      url: 'http://192.168.1.51/stream',
      maxFPS: 1,
      autoReconnect: false,
    });

    const frames: Buffer[] = [];
    slowReader.onFrame((frame) => frames.push(frame));

    await slowReader.start();

    // Send 5 frames rapidly
    for (let i = 0; i < 5; i++) {
      mockResponse.emit('data', buildMJPEGChunk(createFakeJPEG()));
    }

    // Only first frame should be emitted (rest are within 1000ms window)
    expect(frames.length).toBe(1);

    slowReader.stop();
  });
});
