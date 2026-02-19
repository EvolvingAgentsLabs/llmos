import {
  VisionThrottler,
  type VisionFrame,
  type ThrottlerConfig,
} from '../../../lib/runtime/vision/vision-throttler';

// =============================================================================
// Helpers
// =============================================================================

function makeFrame(overrides: Partial<VisionFrame> = {}): VisionFrame {
  return {
    data: `frame-data-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    timestamp: Date.now(),
    width: 640,
    height: 480,
    ...overrides,
  };
}

function makeUniqueFrame(id: number): VisionFrame {
  // Each frame gets substantially different data to avoid deduplication
  const payload = `unique-frame-${id}-${'x'.repeat(100)}-${id.toString(16).repeat(20)}`;
  return {
    data: payload,
    timestamp: Date.now() + id,
    width: 640,
    height: 480,
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('VisionThrottler', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  // ---------------------------------------------------------------------------
  // Basic queueing
  // ---------------------------------------------------------------------------

  it('accepts frames within rate limit', () => {
    const throttler = new VisionThrottler({ maxFPS: 10, maxQueueDepth: 5 });

    const accepted1 = throttler.submitFrame(makeUniqueFrame(1));
    const accepted2 = throttler.submitFrame(makeUniqueFrame(2));
    const accepted3 = throttler.submitFrame(makeUniqueFrame(3));

    expect(accepted1).toBe(true);
    expect(accepted2).toBe(true);
    expect(accepted3).toBe(true);
    expect(throttler.getQueueDepth()).toBe(3);
  });

  // ---------------------------------------------------------------------------
  // Drop strategies
  // ---------------------------------------------------------------------------

  it('drops frames when queue is full (drop_oldest)', () => {
    const throttler = new VisionThrottler({
      maxFPS: 100,
      maxQueueDepth: 2,
      dropStrategy: 'drop_oldest',
    });

    const frame1 = makeUniqueFrame(1);
    const frame2 = makeUniqueFrame(2);
    const frame3 = makeUniqueFrame(3);

    throttler.submitFrame(frame1);
    throttler.submitFrame(frame2);

    expect(throttler.getQueueDepth()).toBe(2);

    // Queue is full, submitting another should drop the oldest
    const accepted = throttler.submitFrame(frame3);
    expect(accepted).toBe(true);
    expect(throttler.getQueueDepth()).toBe(2);

    // The oldest (frame1) should have been dropped; dequeue should give frame2 first
    const dequeued1 = throttler.dequeueFrame();
    expect(dequeued1).not.toBeNull();
    expect(dequeued1!.data).toBe(frame2.data);

    const dequeued2 = throttler.dequeueFrame();
    expect(dequeued2).not.toBeNull();
    expect(dequeued2!.data).toBe(frame3.data);

    const stats = throttler.getStats();
    expect(stats.framesDropped).toBe(1);
  });

  it('drops frames when queue is full (drop_newest)', () => {
    const throttler = new VisionThrottler({
      maxFPS: 100,
      maxQueueDepth: 2,
      dropStrategy: 'drop_newest',
    });

    const frame1 = makeUniqueFrame(1);
    const frame2 = makeUniqueFrame(2);
    const frame3 = makeUniqueFrame(3);

    throttler.submitFrame(frame1);
    throttler.submitFrame(frame2);

    // Queue is full, incoming frame should be rejected
    const accepted = throttler.submitFrame(frame3);
    expect(accepted).toBe(false);
    expect(throttler.getQueueDepth()).toBe(2);

    // Dequeue should give frame1 then frame2 (frame3 was dropped)
    const dequeued1 = throttler.dequeueFrame();
    expect(dequeued1!.data).toBe(frame1.data);

    const dequeued2 = throttler.dequeueFrame();
    expect(dequeued2!.data).toBe(frame2.data);

    const stats = throttler.getStats();
    expect(stats.framesDropped).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // Deduplication
  // ---------------------------------------------------------------------------

  it('deduplicates identical frames', () => {
    const throttler = new VisionThrottler({ maxFPS: 100, maxQueueDepth: 5 });

    const identicalData = 'identical-frame-data-for-dedup-testing-0123456789abcdef';
    const frame1: VisionFrame = {
      data: identicalData,
      timestamp: 1000,
      width: 320,
      height: 240,
    };
    const frame2: VisionFrame = {
      data: identicalData,
      timestamp: 2000,
      width: 320,
      height: 240,
    };

    // Submit and dequeue first frame to set lastProcessedHash
    throttler.submitFrame(frame1);
    throttler.dequeueFrame();

    // Submit identical frame — should be deduplicated
    const accepted = throttler.submitFrame(frame2);
    expect(accepted).toBe(false);

    const stats = throttler.getStats();
    expect(stats.framesDeduplicated).toBe(1);
    expect(throttler.getQueueDepth()).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // Dequeue ordering
  // ---------------------------------------------------------------------------

  it('dequeues frames in order', () => {
    const throttler = new VisionThrottler({ maxFPS: 100, maxQueueDepth: 10 });

    const frames = [makeUniqueFrame(1), makeUniqueFrame(2), makeUniqueFrame(3)];
    frames.forEach((f) => throttler.submitFrame(f));

    expect(throttler.getQueueDepth()).toBe(3);

    const d1 = throttler.dequeueFrame();
    const d2 = throttler.dequeueFrame();
    const d3 = throttler.dequeueFrame();
    const d4 = throttler.dequeueFrame();

    expect(d1!.data).toBe(frames[0].data);
    expect(d2!.data).toBe(frames[1].data);
    expect(d3!.data).toBe(frames[2].data);
    expect(d4).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // Stats tracking
  // ---------------------------------------------------------------------------

  it('tracks stats correctly', () => {
    const throttler = new VisionThrottler({
      maxFPS: 100,
      maxQueueDepth: 2,
      dropStrategy: 'drop_oldest',
    });

    // Submit 3 unique frames (queue depth 2, so one drop)
    throttler.submitFrame(makeUniqueFrame(1));
    throttler.submitFrame(makeUniqueFrame(2));
    throttler.submitFrame(makeUniqueFrame(3)); // triggers drop of oldest

    // Dequeue both remaining frames to empty the queue
    throttler.dequeueFrame(); // frame 2
    throttler.dequeueFrame(); // frame 3

    // Submit and dequeue an identical frame to trigger dedup
    const dupData = 'dup-data-for-stats-test-abcdefghijklmnop-0123456789';
    throttler.submitFrame({ data: dupData, timestamp: 100, width: 320, height: 240 });
    throttler.dequeueFrame(); // process it, setting lastProcessedHash to dupData hash

    // Submit identical — should be deduplicated
    throttler.submitFrame({ data: dupData, timestamp: 200, width: 320, height: 240 });

    const stats = throttler.getStats();
    expect(stats.framesReceived).toBe(5); // 3 unique + 1 dup submit + 1 dup rejected
    expect(stats.framesProcessed).toBe(3); // dequeued 3
    expect(stats.framesDropped).toBe(1); // oldest dropped
    expect(stats.framesDeduplicated).toBe(1); // one dedup
  });

  // ---------------------------------------------------------------------------
  // Flush
  // ---------------------------------------------------------------------------

  it('flush returns all queued frames', () => {
    const throttler = new VisionThrottler({ maxFPS: 100, maxQueueDepth: 10 });

    const frames = [makeUniqueFrame(1), makeUniqueFrame(2), makeUniqueFrame(3)];
    frames.forEach((f) => throttler.submitFrame(f));

    expect(throttler.getQueueDepth()).toBe(3);

    const flushed = throttler.flush();
    expect(flushed).toHaveLength(3);
    expect(flushed[0].data).toBe(frames[0].data);
    expect(flushed[1].data).toBe(frames[1].data);
    expect(flushed[2].data).toBe(frames[2].data);

    expect(throttler.getQueueDepth()).toBe(0);
    expect(throttler.dequeueFrame()).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // Reset
  // ---------------------------------------------------------------------------

  it('reset clears everything', () => {
    const throttler = new VisionThrottler({ maxFPS: 100, maxQueueDepth: 10 });

    throttler.submitFrame(makeUniqueFrame(1));
    throttler.submitFrame(makeUniqueFrame(2));
    throttler.dequeueFrame();

    // Stats should be non-zero before reset
    const beforeStats = throttler.getStats();
    expect(beforeStats.framesReceived).toBeGreaterThan(0);
    expect(beforeStats.framesProcessed).toBeGreaterThan(0);

    throttler.reset();

    const stats = throttler.getStats();
    expect(stats.framesReceived).toBe(0);
    expect(stats.framesProcessed).toBe(0);
    expect(stats.framesDropped).toBe(0);
    expect(stats.framesDeduplicated).toBe(0);
    expect(stats.effectiveFPS).toBe(0);
    expect(stats.queueDepth).toBe(0);
    expect(stats.lastFrameTimestamp).toBe(0);

    expect(throttler.getQueueDepth()).toBe(0);
    expect(throttler.dequeueFrame()).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // Effective FPS
  // ---------------------------------------------------------------------------

  it('effective FPS calculation', () => {
    jest.useFakeTimers();
    const throttler = new VisionThrottler({ maxFPS: 100, maxQueueDepth: 10 });

    // Submit and dequeue frames with known timing intervals
    throttler.submitFrame(makeUniqueFrame(1));
    throttler.dequeueFrame();

    // Advance 500ms (simulating 2 FPS)
    jest.advanceTimersByTime(500);

    throttler.submitFrame(makeUniqueFrame(2));
    throttler.dequeueFrame();

    // Advance another 500ms
    jest.advanceTimersByTime(500);

    throttler.submitFrame(makeUniqueFrame(3));
    throttler.dequeueFrame();

    const stats = throttler.getStats();
    // 3 frames processed over 1 second = 2 fps (intervals between 3 frames)
    expect(stats.effectiveFPS).toBeCloseTo(2.0, 0);
    expect(stats.framesProcessed).toBe(3);
  });

  // ---------------------------------------------------------------------------
  // Process loop
  // ---------------------------------------------------------------------------

  it('process loop calls callback', async () => {
    jest.useFakeTimers();
    const throttler = new VisionThrottler({ maxFPS: 2, maxQueueDepth: 5 });

    const processedFrames: VisionFrame[] = [];
    const callback = jest.fn(async (frame: VisionFrame) => {
      processedFrames.push(frame);
    });

    throttler.startProcessLoop(callback, 100);

    // Submit a frame
    const frame = makeUniqueFrame(1);
    throttler.submitFrame(frame);

    // Advance time to trigger the interval
    jest.advanceTimersByTime(150);

    // Allow any pending microtasks to resolve
    await Promise.resolve();

    expect(callback).toHaveBeenCalledTimes(1);
    expect(processedFrames).toHaveLength(1);
    expect(processedFrames[0].data).toBe(frame.data);

    throttler.stopProcessLoop();

    // Submit another frame after stopping — callback should NOT be called again
    throttler.submitFrame(makeUniqueFrame(2));
    jest.advanceTimersByTime(500);
    await Promise.resolve();

    expect(callback).toHaveBeenCalledTimes(1);
  });

  // ---------------------------------------------------------------------------
  // Static: computeFrameHash
  // ---------------------------------------------------------------------------

  it('computeFrameHash produces consistent hashes', () => {
    const data = 'consistent-hash-test-data-0123456789abcdef-the-quick-brown-fox';
    const hash1 = VisionThrottler.computeFrameHash(data);
    const hash2 = VisionThrottler.computeFrameHash(data);

    expect(hash1).toBe(hash2);
    expect(typeof hash1).toBe('string');
    expect(hash1.length).toBe(8); // 8-char hex string
  });

  // ---------------------------------------------------------------------------
  // Static: compareHashes
  // ---------------------------------------------------------------------------

  it('compareHashes returns 1.0 for identical', () => {
    const hash = VisionThrottler.computeFrameHash('some-frame-data');
    const similarity = VisionThrottler.compareHashes(hash, hash);
    expect(similarity).toBe(1.0);
  });

  it('compareHashes returns 0.0 for different', () => {
    const hash1 = VisionThrottler.computeFrameHash('frame-data-one-aaaa');
    const hash2 = VisionThrottler.computeFrameHash('frame-data-two-bbbb');
    const similarity = VisionThrottler.compareHashes(hash1, hash2);
    expect(similarity).toBe(0.0);
  });
});
