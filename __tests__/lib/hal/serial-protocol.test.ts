import {
  ReliableSerialProtocol,
  SerialFrame,
  SerialAck,
  SerialProtocolStats,
} from '../../../lib/hal/serial-protocol';

// =============================================================================
// Helpers
// =============================================================================

function createMockSendRaw(): {
  sendRaw: (data: string) => Promise<void>;
  calls: string[];
} {
  const calls: string[] = [];
  const sendRaw = jest.fn(async (data: string) => {
    calls.push(data);
  });
  return { sendRaw, calls };
}

// =============================================================================
// CRC-16 Tests
// =============================================================================

describe('ReliableSerialProtocol', () => {
  describe('crc16', () => {
    test('produces consistent results', () => {
      const input = 'hello world';
      const result1 = ReliableSerialProtocol.crc16(input);
      const result2 = ReliableSerialProtocol.crc16(input);
      expect(result1).toBe(result2);
    });

    test('known test vectors', () => {
      // Empty string
      const emptyCrc = ReliableSerialProtocol.crc16('');
      expect(emptyCrc).toBe('FFFF');

      // Standard CRC-16/CCITT-FALSE test vector for "123456789" is 0x29B1
      const standardCrc = ReliableSerialProtocol.crc16('123456789');
      expect(standardCrc).toBe('29B1');

      // "hello" -- verify it produces a 4-char hex string
      const helloCrc = ReliableSerialProtocol.crc16('hello');
      expect(helloCrc).toMatch(/^[0-9A-F]{4}$/);
    });

    test('different inputs produce different CRCs', () => {
      const crcAbc = ReliableSerialProtocol.crc16('abc');
      const crcDef = ReliableSerialProtocol.crc16('def');
      expect(crcAbc).not.toBe(crcDef);
    });
  });

  // ===========================================================================
  // Frame Encoding / Decoding
  // ===========================================================================

  describe('encodeFrame', () => {
    test('creates valid frame with incrementing seq', () => {
      const { sendRaw } = createMockSendRaw();
      const protocol = new ReliableSerialProtocol(sendRaw);

      const frame1 = protocol.encodeFrame({ action: 'move' });
      const frame2 = protocol.encodeFrame({ action: 'stop' });

      expect(frame1.seq).toBe(1);
      expect(frame2.seq).toBe(2);
      expect(frame1.crc).toMatch(/^[0-9A-F]{4}$/);
      expect(frame2.crc).toMatch(/^[0-9A-F]{4}$/);
      expect(frame1.crc.length).toBe(4);
      expect(frame2.crc.length).toBe(4);
      expect(frame1.payload).toEqual({ action: 'move' });
      expect(frame2.payload).toEqual({ action: 'stop' });
    });
  });

  describe('decodeFrame', () => {
    test('round-trip encode then decode', () => {
      const { sendRaw } = createMockSendRaw();
      const protocol = new ReliableSerialProtocol(sendRaw);

      const payload = { command: 'drive', speed: 100 };
      const frame = protocol.encodeFrame(payload);
      const serialized = JSON.stringify(frame);
      const decoded = protocol.decodeFrame(serialized);

      expect(decoded).not.toBeNull();
      expect(decoded!.seq).toBe(frame.seq);
      expect(decoded!.payload).toEqual(payload);
      expect(decoded!.crc).toBe(frame.crc);
    });

    test('rejects corrupted CRC', () => {
      const { sendRaw } = createMockSendRaw();
      const protocol = new ReliableSerialProtocol(sendRaw);

      const frame = protocol.encodeFrame({ action: 'test' });
      const corrupted = { ...frame, crc: '0000' };
      const serialized = JSON.stringify(corrupted);
      const result = protocol.decodeFrame(serialized);

      expect(result).toBeNull();
      expect(protocol.getStats().checksumErrors).toBe(1);
    });

    test('rejects invalid JSON', () => {
      const { sendRaw } = createMockSendRaw();
      const protocol = new ReliableSerialProtocol(sendRaw);

      const result = protocol.decodeFrame('not valid json {{{}}}');
      expect(result).toBeNull();
    });
  });

  // ===========================================================================
  // Send / Receive
  // ===========================================================================

  describe('send', () => {
    test('without ack resolves immediately', async () => {
      const { sendRaw, calls } = createMockSendRaw();
      const protocol = new ReliableSerialProtocol(sendRaw);

      const ack = await protocol.send({ action: 'ping' }, false);

      expect(ack.success).toBe(true);
      expect(ack.ack_seq).toBe(1);
      expect(calls.length).toBe(1);
      expect(protocol.getStats().framesSent).toBe(1);
    });

    test('with ack resolves on receiveAck', async () => {
      const { sendRaw, calls } = createMockSendRaw();
      const protocol = new ReliableSerialProtocol(sendRaw, {
        ackTimeoutMs: 5000,
      });

      const sendPromise = protocol.send({ action: 'move' }, true);

      // Simulate receiving ack after a small delay
      await new Promise((r) => setTimeout(r, 10));

      expect(calls.length).toBe(1);

      // Parse the sent frame to get the seq number
      const sentFrame = JSON.parse(calls[0].trim()) as SerialFrame;
      const ackJson = JSON.stringify({
        ack_seq: sentFrame.seq,
        success: true,
      });

      protocol.receiveAck(ackJson);

      const ack = await sendPromise;
      expect(ack.success).toBe(true);
      expect(ack.ack_seq).toBe(sentFrame.seq);
      expect(protocol.getStats().acksReceived).toBe(1);
    });

    test('with ack retries on timeout', async () => {
      jest.useFakeTimers();
      try {
        const { sendRaw, calls } = createMockSendRaw();
        const protocol = new ReliableSerialProtocol(sendRaw, {
          ackTimeoutMs: 1000,
          maxRetries: 3,
        });

        const sendPromise = protocol.send({ action: 'retry_test' }, true);

        // Wait for the initial send to complete
        await Promise.resolve();
        await Promise.resolve();
        expect(calls.length).toBe(1);

        // Advance past first timeout -- should trigger retry
        jest.advanceTimersByTime(1000);
        // Let the async retry send complete
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();

        expect(calls.length).toBe(2);
        expect(protocol.getStats().retries).toBe(1);

        // Now resolve it with an ack
        const sentFrame = JSON.parse(calls[0].trim()) as SerialFrame;
        protocol.receiveAck(
          JSON.stringify({ ack_seq: sentFrame.seq, success: true })
        );

        const ack = await sendPromise;
        expect(ack.success).toBe(true);
      } finally {
        jest.useRealTimers();
      }
    });

    test('rejects after max retries', async () => {
      jest.useFakeTimers();
      try {
        const { sendRaw } = createMockSendRaw();
        const protocol = new ReliableSerialProtocol(sendRaw, {
          ackTimeoutMs: 500,
          maxRetries: 2,
        });

        const sendPromise = protocol.send({ action: 'will_fail' }, true);

        // Wait for initial send
        await Promise.resolve();
        await Promise.resolve();

        // Advance past retry 1
        jest.advanceTimersByTime(500);
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();

        // Advance past retry 2
        jest.advanceTimersByTime(500);
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();

        // Advance past final timeout -- maxRetries exceeded
        jest.advanceTimersByTime(500);
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();

        await expect(sendPromise).rejects.toThrow('Max retries exceeded');
        expect(protocol.getStats().timeouts).toBe(1);
      } finally {
        jest.useRealTimers();
      }
    });
  });

  // ===========================================================================
  // receiveFrame
  // ===========================================================================

  describe('receiveFrame', () => {
    test('decodes and generates ack', () => {
      const { sendRaw } = createMockSendRaw();
      const protocol = new ReliableSerialProtocol(sendRaw);

      // Build a valid frame as if from the remote side
      const payload = { sensor: 'distance', value: 42 };
      const crc = ReliableSerialProtocol.crc16(JSON.stringify(payload));
      const frameStr = JSON.stringify({
        seq: 10,
        payload,
        crc,
        ack_required: true,
      });

      const result = protocol.receiveFrame(frameStr);

      expect(result).not.toBeNull();
      expect(result!.frame.seq).toBe(10);
      expect(result!.frame.payload).toEqual(payload);

      // Verify ack is valid JSON with correct ack_seq
      const ack = JSON.parse(result!.ack) as SerialAck;
      expect(ack.ack_seq).toBe(10);
      expect(ack.success).toBe(true);

      expect(protocol.getStats().framesReceived).toBe(1);
      expect(protocol.getStats().acksSent).toBe(1);
    });
  });

  // ===========================================================================
  // Stats Tracking
  // ===========================================================================

  describe('stats tracking', () => {
    test('tracks all operations correctly', async () => {
      const { sendRaw } = createMockSendRaw();
      const protocol = new ReliableSerialProtocol(sendRaw);

      // Send without ack
      await protocol.send({ a: 1 }, false);
      await protocol.send({ a: 2 }, false);

      // Receive a frame
      const payload = { incoming: true };
      const crc = ReliableSerialProtocol.crc16(JSON.stringify(payload));
      protocol.receiveFrame(
        JSON.stringify({ seq: 1, payload, crc, ack_required: true })
      );

      // Decode a bad frame (checksum error)
      protocol.decodeFrame(
        JSON.stringify({ seq: 2, payload: { x: 1 }, crc: 'DEAD', ack_required: false })
      );

      const stats = protocol.getStats();
      expect(stats.framesSent).toBe(2);
      expect(stats.framesReceived).toBe(1);
      expect(stats.acksSent).toBe(1);
      expect(stats.checksumErrors).toBe(1);
      expect(stats.avgRoundTripMs).toBe(0); // no ack received
    });
  });

  // ===========================================================================
  // Reset
  // ===========================================================================

  describe('reset', () => {
    test('clears state', async () => {
      const { sendRaw } = createMockSendRaw();
      const protocol = new ReliableSerialProtocol(sendRaw);

      // Send some frames
      await protocol.send({ a: 1 }, false);
      await protocol.send({ a: 2 }, false);

      expect(protocol.getStats().framesSent).toBe(2);

      protocol.reset();

      const stats = protocol.getStats();
      expect(stats.framesSent).toBe(0);
      expect(stats.framesReceived).toBe(0);
      expect(stats.retries).toBe(0);
      expect(stats.checksumErrors).toBe(0);
      expect(stats.timeouts).toBe(0);
      expect(protocol.getPendingCount()).toBe(0);

      // Seq should restart from 1
      const frame = protocol.encodeFrame({ test: true });
      expect(frame.seq).toBe(1);
    });
  });

  // ===========================================================================
  // Destroy
  // ===========================================================================

  describe('destroy', () => {
    test('rejects pending', async () => {
      jest.useFakeTimers();
      try {
        const { sendRaw } = createMockSendRaw();
        const protocol = new ReliableSerialProtocol(sendRaw, {
          ackTimeoutMs: 10000,
          maxRetries: 5,
        });

        // Send with ack but don't resolve it
        const sendPromise = protocol.send({ action: 'long_wait' }, true);

        // Let the initial send complete
        await Promise.resolve();
        await Promise.resolve();

        expect(protocol.getPendingCount()).toBe(1);

        // Destroy the protocol
        protocol.destroy();

        await expect(sendPromise).rejects.toThrow('Protocol destroyed');
        expect(protocol.getPendingCount()).toBe(0);
      } finally {
        jest.useRealTimers();
      }
    });
  });
});
