/**
 * Tests for WiFiConnection — UDP transport for ESP32-S3
 *
 * Mocks dgram.Socket to test send/receive/timeout/retry logic
 * without requiring actual network connections.
 */

import { WiFiConnection } from '../../../lib/hal/wifi-connection';
import * as dgram from 'dgram';
import { EventEmitter } from 'events';

// =============================================================================
// Mock dgram socket
// =============================================================================

class MockSocket extends EventEmitter {
  public sentMessages: { data: Buffer; port: number; host: string }[] = [];
  public closed = false;

  bind(cb: () => void) {
    process.nextTick(() => cb());
  }

  send(data: Buffer, port: number, host: string, cb: (err: Error | null) => void) {
    this.sentMessages.push({ data, port, host });
    process.nextTick(() => cb(null));
  }

  close(cb: () => void) {
    this.closed = true;
    process.nextTick(() => cb());
  }

  simulateResponse(json: Record<string, unknown>) {
    const buf = Buffer.from(JSON.stringify(json));
    this.emit('message', buf);
  }
}

let mockSocket: MockSocket;

jest.mock('dgram', () => ({
  createSocket: jest.fn(() => {
    mockSocket = new MockSocket();
    return mockSocket;
  }),
}));

describe('WiFiConnection', () => {
  let conn: WiFiConnection;

  beforeEach(() => {
    conn = new WiFiConnection({
      host: '192.168.1.50',
      commandPort: 4210,
      timeoutMs: 1000,
      retries: 2,
    });
  });

  afterEach(async () => {
    jest.useRealTimers();
    try {
      if (conn.isConnected()) {
        await conn.disconnect();
      }
    } catch {
      // Ignore rejection from pending commands during cleanup
    }
  });

  // ===========================================================================
  // Connection lifecycle
  // ===========================================================================

  test('connect creates UDP socket and binds', async () => {
    await conn.connect();

    expect(dgram.createSocket).toHaveBeenCalledWith('udp4');
    expect(conn.isConnected()).toBe(true);
  });

  test('connect is idempotent', async () => {
    await conn.connect();
    await conn.connect();
    expect(conn.isConnected()).toBe(true);
  });

  test('disconnect closes socket', async () => {
    await conn.connect();
    await conn.disconnect();

    expect(conn.isConnected()).toBe(false);
    expect(mockSocket.closed).toBe(true);
  });

  test('disconnect rejects pending commands', async () => {
    await conn.connect();

    const cmdPromise = conn.sendCommand({ cmd: 'get_status' });
    await conn.disconnect();

    await expect(cmdPromise).rejects.toThrow('Connection closed');
  });

  // ===========================================================================
  // sendCommand
  // ===========================================================================

  test('sendCommand sends JSON via UDP and receives response', async () => {
    await conn.connect();

    const responsePromise = conn.sendCommand({ cmd: 'get_status' });

    // Wait for send callback
    await new Promise(r => process.nextTick(r));

    expect(mockSocket.sentMessages.length).toBe(1);
    const sent = JSON.parse(mockSocket.sentMessages[0].data.toString());
    expect(sent.cmd).toBe('get_status');
    expect(sent._seq).toBe(1);
    expect(mockSocket.sentMessages[0].port).toBe(4210);
    expect(mockSocket.sentMessages[0].host).toBe('192.168.1.50');

    // Simulate response
    mockSocket.simulateResponse({ ok: true, cmd: 'get_status' });

    const response = await responsePromise;
    expect(response.ok).toBe(true);
  });

  test('sendCommand throws when not connected', async () => {
    await expect(conn.sendCommand({ cmd: 'stop' })).rejects.toThrow('Not connected');
  });

  // ===========================================================================
  // Stats
  // ===========================================================================

  test('getStats returns connection stats', async () => {
    await conn.connect();

    const stats = conn.getStats();
    expect(stats.commandsSent).toBe(0);
    expect(stats.responsesReceived).toBe(0);
    expect(stats.timeouts).toBe(0);
    expect(stats.retries).toBe(0);
    expect(stats.avgRoundTripMs).toBe(0);
    expect(stats.connected).toBe(true);
  });

  test('getStats tracks commands sent and received', async () => {
    await conn.connect();

    const promise = conn.sendCommand({ cmd: 'stop' });
    await new Promise(r => process.nextTick(r));

    mockSocket.simulateResponse({ ok: true });
    await promise;

    const stats = conn.getStats();
    expect(stats.commandsSent).toBe(1);
    expect(stats.responsesReceived).toBe(1);
  });

  // ===========================================================================
  // Camera URL
  // ===========================================================================

  test('getCameraStreamUrl returns null without camera host', () => {
    expect(conn.getCameraStreamUrl()).toBeNull();
  });

  test('getCameraStreamUrl returns URL with camera host', () => {
    const connWithCam = new WiFiConnection({
      host: '192.168.1.50',
      cameraHost: '192.168.1.51',
      cameraPort: 80,
    });
    expect(connWithCam.getCameraStreamUrl()).toBe('http://192.168.1.51:80/stream');
  });

  // ===========================================================================
  // Sequence numbers
  // ===========================================================================

  test('sequence numbers increment', async () => {
    await conn.connect();

    const cmd1 = conn.sendCommand({ cmd: 'stop' });
    await new Promise(r => process.nextTick(r));
    mockSocket.simulateResponse({ ok: true });
    await cmd1;

    const cmd2 = conn.sendCommand({ cmd: 'get_status' });
    await new Promise(r => process.nextTick(r));
    mockSocket.simulateResponse({ ok: true });
    await cmd2;

    const sent1 = JSON.parse(mockSocket.sentMessages[0].data.toString());
    const sent2 = JSON.parse(mockSocket.sentMessages[1].data.toString());
    expect(sent1._seq).toBe(1);
    expect(sent2._seq).toBe(2);
  });
});
