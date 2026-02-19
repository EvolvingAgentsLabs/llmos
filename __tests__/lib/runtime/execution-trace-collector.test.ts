import {
  ExecutionTraceCollector,
  ExecutionTrace,
} from '../../../lib/runtime/execution-trace-collector';
import { OutputFrame } from '../../../lib/runtime/llm-bytecode';
import { ExecutionTickResult } from '../../../lib/runtime/bytecode-interpreter';

// =============================================================================
// Test Helpers
// =============================================================================

function makeTickResult(overrides?: Partial<ExecutionTickResult>): ExecutionTickResult {
  return {
    executed: [0],
    blocked: [],
    errors: [],
    stateChanges: {},
    motorRuntime: 0,
    timestamp: Date.now(),
    ...overrides,
  };
}

function makeFrame(overrides?: Partial<OutputFrame>): OutputFrame {
  return {
    instructions: [{ type: 'motor', target: 'both', action: 'forward', speed: 100 }],
    state_predictions: [],
    mode: 'exploring',
    confidence: 0.9,
    ...overrides,
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('ExecutionTraceCollector', () => {
  let collector: ExecutionTraceCollector;

  beforeEach(() => {
    collector = new ExecutionTraceCollector('robot-1');
  });

  test('starts and ends a trace', () => {
    const traceId = collector.startTrace();
    expect(traceId).toBe('trace-robot-1-1');

    const current = collector.getCurrentTrace();
    expect(current).not.toBeNull();
    expect(current!.id).toBe(traceId);
    expect(current!.deviceId).toBe('robot-1');
    expect(current!.entries).toEqual([]);
    expect(current!.endedAt).toBe(0);

    const ended = collector.endTrace();
    expect(ended).not.toBeNull();
    expect(ended!.id).toBe(traceId);
    expect(ended!.endedAt).toBeGreaterThan(0);

    expect(collector.getCurrentTrace()).toBeNull();
  });

  test('records sensor entries', () => {
    collector.startTrace();
    collector.recordSensor('distance', { front: 50, left: 30 });

    const trace = collector.endTrace()!;
    expect(trace.entries).toHaveLength(1);

    const entry = trace.entries[0];
    expect(entry.stage).toBe('sensor');
    expect((entry as any).sensorType).toBe('distance');
    expect((entry as any).data).toEqual({ front: 50, left: 30 });
    expect(entry.timestamp).toBeGreaterThan(0);
  });

  test('records decision entries', () => {
    collector.startTrace();
    collector.recordDecision('Move forward to explore', 0.85, 'exploring', 120);

    const trace = collector.endTrace()!;
    expect(trace.entries).toHaveLength(1);

    const entry = trace.entries[0];
    expect(entry.stage).toBe('decision');
    expect((entry as any).reasoning).toBe('Move forward to explore');
    expect((entry as any).confidence).toBe(0.85);
    expect((entry as any).mode).toBe('exploring');
    expect((entry as any).latencyMs).toBe(120);
  });

  test('records bytecode entries', () => {
    collector.startTrace();
    const frame = makeFrame();
    collector.recordBytecode(frame);

    const trace = collector.endTrace()!;
    expect(trace.entries).toHaveLength(1);

    const entry = trace.entries[0];
    expect(entry.stage).toBe('bytecode');
    expect((entry as any).frame).toEqual(frame);
    expect((entry as any).instructionCount).toBe(1);
  });

  test('records execution entries', () => {
    collector.startTrace();
    const result = makeTickResult({ executed: [0, 1], motorRuntime: 500 });
    collector.recordExecution(result, 'sim');

    const trace = collector.endTrace()!;
    expect(trace.entries).toHaveLength(1);

    const entry = trace.entries[0];
    expect(entry.stage).toBe('execution');
    expect((entry as any).result.executed).toEqual([0, 1]);
    expect((entry as any).result.motorRuntime).toBe(500);
    expect((entry as any).target).toBe('sim');
  });

  test('records outcome entries', () => {
    collector.startTrace();
    collector.recordOutcome(true, { distance: 1.5, areaExplored: 4.2 });

    const trace = collector.endTrace()!;
    expect(trace.entries).toHaveLength(1);

    const entry = trace.entries[0];
    expect(entry.stage).toBe('outcome');
    expect((entry as any).success).toBe(true);
    expect((entry as any).metrics).toEqual({ distance: 1.5, areaExplored: 4.2 });
    expect((entry as any).error).toBeUndefined();
  });

  test('computes summary correctly', () => {
    collector.startTrace();

    // Record a mix of all entry types
    collector.recordSensor('distance', { front: 50 });
    collector.recordSensor('camera', { objects: ['wall'] });
    collector.recordDecision('Explore north', 0.9, 'exploring', 100);
    collector.recordBytecode(makeFrame());
    collector.recordExecution(makeTickResult(), 'sim');
    collector.recordOutcome(true, { distance: 1.0 });
    collector.recordDecision('Avoid obstacle', 0.6, 'avoiding_obstacle', 200);
    collector.recordBytecode(makeFrame());
    collector.recordExecution(makeTickResult(), 'sim');
    collector.recordOutcome(false, { distance: 0 }, 'Collision detected');

    const trace = collector.endTrace()!;
    const summary = trace.summary;

    expect(summary.totalEntries).toBe(10);
    expect(summary.sensorReadings).toBe(2);
    expect(summary.decisions).toBe(2);
    expect(summary.bytecodeFrames).toBe(2);
    expect(summary.executions).toBe(2);
    expect(summary.outcomes).toBe(2);
    expect(summary.successfulOutcomes).toBe(1);
    expect(summary.failedOutcomes).toBe(1);
  });

  test('avgDecisionLatencyMs computed correctly', () => {
    collector.startTrace();

    collector.recordDecision('Decision A', 0.9, 'exploring', 100);
    collector.recordDecision('Decision B', 0.8, 'navigating', 200);
    collector.recordDecision('Decision C', 0.7, 'exploring', 300);

    const trace = collector.endTrace()!;
    const summary = trace.summary;

    expect(summary.totalLatencyMs).toBe(600);
    expect(summary.avgDecisionLatencyMs).toBe(200);
  });

  test('exportForRSA generates feedback data', () => {
    const traceId = collector.startTrace();

    // Record a full pipeline cycle: sensor → decision → bytecode → execution → outcome
    collector.recordSensor('distance', { front: 100 });
    collector.recordDecision('Move forward to explore open area', 0.9, 'exploring', 150);
    collector.recordBytecode(makeFrame());
    collector.recordExecution(makeTickResult({ executed: [0] }), 'sim');
    collector.recordOutcome(true, { distance: 2.0 });

    collector.endTrace();

    const feedback = collector.exportForRSA(traceId);
    expect(feedback).not.toBeNull();
    expect(feedback!.traceId).toBe(traceId);

    // Narrative should describe what happened
    expect(feedback!.narrative).toContain(traceId);
    expect(feedback!.narrative).toContain('robot-1');
    expect(feedback!.narrative).toContain('Move forward to explore open area');
    expect(feedback!.narrative).toContain('SUCCESS');

    // Decision outcomes should pair the decision with the outcome
    expect(feedback!.decisionOutcomes).toHaveLength(1);
    expect(feedback!.decisionOutcomes[0].decision).toBe('Move forward to explore open area');
    expect(feedback!.decisionOutcomes[0].confidence).toBe(0.9);
    expect(feedback!.decisionOutcomes[0].outcome).toBe('success');
    expect(feedback!.decisionOutcomes[0].metric).toBe(2.0);

    // Patterns and suggestions should be arrays
    expect(Array.isArray(feedback!.patterns)).toBe(true);
    expect(Array.isArray(feedback!.suggestions)).toBe(true);
  });

  test('respects maxEntriesPerTrace', () => {
    collector = new ExecutionTraceCollector('robot-1', { maxEntriesPerTrace: 5 });
    collector.startTrace();

    // Record 10 entries — only 5 should be kept
    for (let i = 0; i < 10; i++) {
      collector.recordSensor('distance', { reading: i });
    }

    const trace = collector.endTrace()!;
    expect(trace.entries).toHaveLength(5);

    // The earliest entries should have been evicted — last 5 remain
    const readings = trace.entries.map((e) => (e as any).data.reading);
    expect(readings).toEqual([5, 6, 7, 8, 9]);
  });

  test('evicts oldest completed traces', () => {
    collector = new ExecutionTraceCollector('robot-1', { maxCompletedTraces: 2 });

    // Complete 3 traces
    collector.startTrace(); // id1 — will be evicted
    collector.endTrace();

    const id2 = collector.startTrace();
    collector.endTrace();

    const id3 = collector.startTrace();
    collector.endTrace();

    const completed = collector.getCompletedTraces();
    expect(completed).toHaveLength(2);
    // First trace should have been evicted
    expect(completed[0].id).toBe(id2);
    expect(completed[1].id).toBe(id3);
  });

  test('exportTrace and importTrace round-trip', () => {
    const traceId = collector.startTrace();
    collector.recordSensor('distance', { front: 42 });
    collector.recordDecision('Test decision', 0.75, 'exploring', 100);
    collector.endTrace();

    const json = collector.exportTrace(traceId);
    expect(json).toBeTruthy();
    expect(json).not.toBe('{}');

    // Create a new collector and import the trace
    const collector2 = new ExecutionTraceCollector('robot-2');
    const imported = collector2.importTrace(json);

    expect(imported.id).toBe(traceId);
    expect(imported.deviceId).toBe('robot-1');
    expect(imported.entries).toHaveLength(2);
    expect(imported.entries[0].stage).toBe('sensor');
    expect(imported.entries[1].stage).toBe('decision');

    // Verify it's now in completed traces
    expect(collector2.getCompletedTraces()).toHaveLength(1);
    expect(collector2.getTrace(traceId)).toBeDefined();
  });

  test('reset clears all state', () => {
    // Create some traces
    collector.startTrace();
    collector.recordSensor('distance', { front: 10 });
    collector.endTrace();

    collector.startTrace();
    collector.recordDecision('Active decision', 0.8, 'exploring', 50);

    // Verify state exists
    expect(collector.getCompletedTraces()).toHaveLength(1);
    expect(collector.getCurrentTrace()).not.toBeNull();

    // Reset
    collector.reset();

    expect(collector.getCompletedTraces()).toHaveLength(0);
    expect(collector.getCurrentTrace()).toBeNull();

    // Counter should have reset — next trace starts at 1 again
    const newId = collector.startTrace();
    expect(newId).toBe('trace-robot-1-1');
  });

  test('recordSensor skipped when recordSensorData is false', () => {
    collector = new ExecutionTraceCollector('robot-1', { recordSensorData: false });
    collector.startTrace();

    collector.recordSensor('distance', { front: 50 });
    collector.recordSensor('camera', { objects: [] });

    const trace = collector.endTrace()!;
    expect(trace.entries).toHaveLength(0);
    expect(trace.summary.sensorReadings).toBe(0);
  });

  test('onFlush callback fires on autoFlushThreshold', () => {
    collector = new ExecutionTraceCollector('robot-1', { autoFlushThreshold: 3 });

    const flushedTraces: ExecutionTrace[] = [];
    collector.onFlush((trace) => {
      flushedTraces.push(trace);
    });

    collector.startTrace();

    // Record entries up to the threshold
    collector.recordSensor('distance', { front: 10 });
    collector.recordSensor('distance', { front: 20 });

    // These two entries haven't triggered flush yet
    expect(flushedTraces).toHaveLength(0);
    expect(collector.getCurrentTrace()).not.toBeNull();

    // Third entry hits the threshold — auto-flush triggers
    collector.recordSensor('distance', { front: 30 });

    expect(flushedTraces).toHaveLength(1);
    expect(flushedTraces[0].entries).toHaveLength(3);
    expect(flushedTraces[0].endedAt).toBeGreaterThan(0);

    // Current trace should be null after auto-flush
    expect(collector.getCurrentTrace()).toBeNull();

    // The flushed trace should now be in completed traces
    expect(collector.getCompletedTraces()).toHaveLength(1);
  });
});
