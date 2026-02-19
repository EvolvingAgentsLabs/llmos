import { Sim2RealRunner } from '../../../lib/runtime/sim2real-runner';
import { BytecodeExecutionTarget } from '../../../lib/runtime/bytecode-targets';
import { OutputFrame, BytecodeInstruction } from '../../../lib/runtime/llm-bytecode';

// =============================================================================
// Mock Target
// =============================================================================

interface MotorCall {
  target: 'left_wheel' | 'right_wheel' | 'both';
  action: 'forward' | 'backward' | 'stop';
  speed: number;
  durationMs?: number;
}

interface LEDCall {
  r: number;
  g: number;
  b: number;
  durationMs?: number;
}

interface SensorCall {
  target: 'camera' | 'distance' | 'imu' | 'battery' | 'all';
}

interface WaitCall {
  durationMs: number;
}

class MockBytecodeTarget implements BytecodeExecutionTarget {
  readonly name: string;
  motorCalls: MotorCall[] = [];
  ledCalls: LEDCall[] = [];
  sensorCalls: SensorCall[] = [];
  waitCalls: WaitCall[] = [];

  /** If set, setMotors will throw this error */
  motorError: string | null = null;

  constructor(name: string = 'mock') {
    this.name = name;
  }

  async setMotors(
    target: 'left_wheel' | 'right_wheel' | 'both',
    action: 'forward' | 'backward' | 'stop',
    speed: number,
    durationMs?: number
  ): Promise<void> {
    if (this.motorError) {
      throw new Error(this.motorError);
    }
    this.motorCalls.push({ target, action, speed, durationMs });
  }

  async stopMotors(): Promise<void> {
    this.motorCalls.push({ target: 'both', action: 'stop', speed: 0 });
  }

  async setLED(r: number, g: number, b: number, durationMs?: number): Promise<void> {
    this.ledCalls.push({ r, g, b, durationMs });
  }

  async readSensors(
    target: 'camera' | 'distance' | 'imu' | 'battery' | 'all'
  ): Promise<Record<string, unknown>> {
    this.sensorCalls.push({ target });
    return { [target]: 'mock-data' };
  }

  async wait(durationMs: number): Promise<void> {
    this.waitCalls.push({ durationMs });
  }

  reset(): void {
    this.motorCalls = [];
    this.ledCalls = [];
    this.sensorCalls = [];
    this.waitCalls = [];
    this.motorError = null;
  }
}

// =============================================================================
// Helpers
// =============================================================================

function makeFrame(
  instructions: BytecodeInstruction[],
  overrides?: Partial<OutputFrame>
): OutputFrame {
  return {
    instructions,
    state_predictions: [],
    mode: 'exploring',
    confidence: 0.9,
    ...overrides,
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('Sim2RealRunner', () => {
  let simTarget: MockBytecodeTarget;
  let physicalTarget: MockBytecodeTarget;

  beforeEach(() => {
    simTarget = new MockBytecodeTarget('sim');
    physicalTarget = new MockBytecodeTarget('esp32');
  });

  // ---------------------------------------------------------------------------
  // 1. Executes frame in simulation mode
  // ---------------------------------------------------------------------------
  it('executes frame in simulation mode', async () => {
    const runner = new Sim2RealRunner(simTarget, physicalTarget, {
      mode: 'simulation',
    });

    runner.startTrace();

    const frame = makeFrame([
      { type: 'motor', target: 'both', action: 'forward', speed: 100, duration_ms: 500 },
      { type: 'led', r: 0, g: 255, b: 0 },
    ]);

    const result = await runner.executeFrame(frame);

    // sim result should be present
    expect(result.sim).toBeDefined();
    expect(result.sim!.executed).toEqual([0, 1]);
    expect(result.sim!.blocked).toEqual([]);
    expect(result.sim!.errors).toEqual([]);

    // physical result should NOT be present
    expect(result.physical).toBeUndefined();

    // comparison should NOT be present
    expect(result.comparison).toBeUndefined();

    // sim target should have received calls
    expect(simTarget.motorCalls).toHaveLength(1);
    expect(simTarget.ledCalls).toHaveLength(1);

    // physical target should NOT have received calls
    expect(physicalTarget.motorCalls).toHaveLength(0);
    expect(physicalTarget.ledCalls).toHaveLength(0);
  });

  // ---------------------------------------------------------------------------
  // 2. Executes frame in physical mode
  // ---------------------------------------------------------------------------
  it('executes frame in physical mode', async () => {
    const runner = new Sim2RealRunner(simTarget, physicalTarget, {
      mode: 'physical',
    });

    runner.startTrace();

    const frame = makeFrame([
      { type: 'motor', target: 'both', action: 'forward', speed: 80, duration_ms: 300 },
    ]);

    const result = await runner.executeFrame(frame);

    // physical result should be present
    expect(result.physical).toBeDefined();
    expect(result.physical!.executed).toEqual([0]);
    expect(result.physical!.blocked).toEqual([]);
    expect(result.physical!.errors).toEqual([]);

    // sim result should NOT be present
    expect(result.sim).toBeUndefined();

    // comparison should NOT be present
    expect(result.comparison).toBeUndefined();

    // physical target should have received calls
    expect(physicalTarget.motorCalls).toHaveLength(1);
    expect(physicalTarget.motorCalls[0]).toEqual({
      target: 'both',
      action: 'forward',
      speed: 80,
      durationMs: 300,
    });

    // sim target should NOT have received calls
    expect(simTarget.motorCalls).toHaveLength(0);
  });

  // ---------------------------------------------------------------------------
  // 3. Executes frame in both mode and compares
  // ---------------------------------------------------------------------------
  it('executes frame in both mode and compares', async () => {
    const runner = new Sim2RealRunner(simTarget, physicalTarget, {
      mode: 'both',
    });

    runner.startTrace();

    const frame = makeFrame([
      { type: 'led', r: 255, g: 128, b: 0 },
      { type: 'state_transition', mode: 'navigating', goal: 'find exit' },
    ]);

    const result = await runner.executeFrame(frame);

    // Both results should be present
    expect(result.sim).toBeDefined();
    expect(result.physical).toBeDefined();
    expect(result.comparison).toBeDefined();

    // Both should have executed the same instructions
    expect(result.sim!.executed).toEqual([0, 1]);
    expect(result.physical!.executed).toEqual([0, 1]);

    // Both targets should have received LED calls
    expect(simTarget.ledCalls).toHaveLength(1);
    expect(physicalTarget.ledCalls).toHaveLength(1);
  });

  // ---------------------------------------------------------------------------
  // 4. Records trace entries
  // ---------------------------------------------------------------------------
  it('records trace entries', async () => {
    const runner = new Sim2RealRunner(simTarget, null, {
      mode: 'simulation',
    });

    runner.startTrace();

    const frame1 = makeFrame([{ type: 'led', r: 255, g: 0, b: 0 }]);
    const frame2 = makeFrame([{ type: 'led', r: 0, g: 255, b: 0 }]);
    const frame3 = makeFrame([{ type: 'led', r: 0, g: 0, b: 255 }]);

    await runner.executeFrame(frame1);
    await runner.executeFrame(frame2);
    await runner.executeFrame(frame3);

    const trace = runner.endTrace();

    expect(trace).not.toBeNull();
    expect(trace!.entries).toHaveLength(3);
    expect(trace!.totalFrames).toBe(3);
    expect(trace!.totalErrors).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // 5. Trace includes timing information
  // ---------------------------------------------------------------------------
  it('trace includes timing information', async () => {
    const runner = new Sim2RealRunner(simTarget, null, {
      mode: 'simulation',
    });

    runner.startTrace();

    const before = Date.now();
    const frame = makeFrame([
      { type: 'led', r: 255, g: 0, b: 0 },
    ]);
    await runner.executeFrame(frame);
    const after = Date.now();

    const trace = runner.endTrace();
    expect(trace).not.toBeNull();

    const entry = trace!.entries[0];
    expect(entry.startTime).toBeGreaterThanOrEqual(before);
    expect(entry.endTime).toBeLessThanOrEqual(after);
    expect(entry.endTime).toBeGreaterThanOrEqual(entry.startTime);
    expect(entry.durationMs).toBe(entry.endTime - entry.startTime);
    expect(entry.durationMs).toBeGreaterThanOrEqual(0);
  });

  // ---------------------------------------------------------------------------
  // 6. Comparison detects equivalent results
  // ---------------------------------------------------------------------------
  it('comparison detects equivalent results', async () => {
    const runner = new Sim2RealRunner(simTarget, physicalTarget, {
      mode: 'both',
    });

    runner.startTrace();

    // Both mock targets behave identically, so results should be equivalent
    const frame = makeFrame([
      { type: 'led', r: 100, g: 200, b: 50 },
      { type: 'state_transition', mode: 'exploring', variables: { step: 1 } },
    ]);

    const result = await runner.executeFrame(frame);

    expect(result.comparison).toBeDefined();
    expect(result.comparison!.equivalent).toBe(true);
    expect(result.comparison!.divergenceFrame).toBeUndefined();
    expect(result.comparison!.divergenceReason).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // 7. Comparison detects divergence
  // ---------------------------------------------------------------------------
  it('comparison detects divergence', async () => {
    // Make physical target throw on motor instructions
    physicalTarget.motorError = 'ESP32 motor fault';

    const runner = new Sim2RealRunner(simTarget, physicalTarget, {
      mode: 'both',
    });

    runner.startTrace();

    const frame = makeFrame([
      { type: 'motor', target: 'both', action: 'forward', speed: 100, duration_ms: 200 },
    ]);

    const result = await runner.executeFrame(frame);

    expect(result.comparison).toBeDefined();
    expect(result.comparison!.equivalent).toBe(false);
    expect(result.comparison!.divergenceReason).toBeDefined();

    // Sim executed successfully, physical was blocked
    expect(result.sim!.executed).toEqual([0]);
    expect(result.sim!.errors).toEqual([]);
    expect(result.physical!.blocked.length).toBeGreaterThan(0);
    expect(result.physical!.errors.length).toBeGreaterThan(0);
  });

  // ---------------------------------------------------------------------------
  // 8. startTrace and endTrace lifecycle
  // ---------------------------------------------------------------------------
  it('startTrace and endTrace lifecycle', () => {
    const runner = new Sim2RealRunner(simTarget, null, {
      mode: 'simulation',
    });

    // No active trace initially
    expect(runner.getCurrentTrace()).toBeNull();

    // Start a trace
    const traceId = runner.startTrace();
    expect(traceId).toBe('trace-1');
    expect(runner.getCurrentTrace()).not.toBeNull();
    expect(runner.getCurrentTrace()!.id).toBe('trace-1');

    // End the trace
    const completedTrace = runner.endTrace();
    expect(completedTrace).not.toBeNull();
    expect(completedTrace!.id).toBe('trace-1');
    expect(completedTrace!.endedAt).toBeGreaterThan(0);

    // Current trace should now be null
    expect(runner.getCurrentTrace()).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // 9. getTraces returns all completed traces
  // ---------------------------------------------------------------------------
  it('getTraces returns all completed traces', async () => {
    const runner = new Sim2RealRunner(simTarget, null, {
      mode: 'simulation',
    });

    // Create first trace
    runner.startTrace();
    await runner.executeFrame(makeFrame([{ type: 'led', r: 255, g: 0, b: 0 }]));
    runner.endTrace();

    // Create second trace
    runner.startTrace();
    await runner.executeFrame(makeFrame([{ type: 'led', r: 0, g: 255, b: 0 }]));
    runner.endTrace();

    const traces = runner.getTraces();
    expect(traces).toHaveLength(2);
    expect(traces[0].id).toBe('trace-1');
    expect(traces[1].id).toBe('trace-2');
    expect(traces[0].entries).toHaveLength(1);
    expect(traces[1].entries).toHaveLength(1);
  });

  // ---------------------------------------------------------------------------
  // 10. exportTrace and importTrace round-trip
  // ---------------------------------------------------------------------------
  it('exportTrace and importTrace round-trip', async () => {
    const runner = new Sim2RealRunner(simTarget, null, {
      mode: 'simulation',
    });

    // Create and populate a trace
    runner.startTrace();
    await runner.executeFrame(makeFrame([
      { type: 'motor', target: 'both', action: 'forward', speed: 120, duration_ms: 400 },
      { type: 'led', r: 0, g: 255, b: 0 },
    ]));
    await runner.executeFrame(makeFrame([
      { type: 'state_transition', mode: 'navigating', goal: 'dock' },
    ]));
    runner.endTrace();

    // Export the trace
    const json = runner.exportTrace('trace-1');
    expect(typeof json).toBe('string');

    // Create a new runner and import the trace
    const runner2 = new Sim2RealRunner(simTarget, null, {
      mode: 'simulation',
    });

    const importedTrace = runner2.importTrace(json);

    expect(importedTrace.id).toBe('trace-1');
    expect(importedTrace.entries).toHaveLength(2);
    expect(importedTrace.totalFrames).toBe(2);
    expect(importedTrace.mode).toBe('simulation');

    // Should also be accessible via getTrace
    expect(runner2.getTrace('trace-1')).toBeDefined();
    expect(runner2.getTrace('trace-1')!.id).toBe('trace-1');
  });

  // ---------------------------------------------------------------------------
  // 11. getState returns both interpreter states
  // ---------------------------------------------------------------------------
  it('getState returns both interpreter states', async () => {
    const runner = new Sim2RealRunner(simTarget, physicalTarget, {
      mode: 'both',
    });

    runner.startTrace();

    const frame = makeFrame([
      { type: 'state_transition', mode: 'navigating', goal: 'explore', variables: { step: 3 } },
      { type: 'motor', target: 'both', action: 'forward', speed: 100, duration_ms: 250 },
    ]);

    await runner.executeFrame(frame);

    const state = runner.getState();

    // Sim state
    expect(state.sim).toBeDefined();
    expect(state.sim.mode).toBe('navigating');
    expect(state.sim.goal).toBe('explore');
    expect(state.sim.variables.step).toBe(3);
    expect(state.sim.motorRuntime).toBe(250);

    // Physical state
    expect(state.physical).toBeDefined();
    expect(state.physical!.mode).toBe('navigating');
    expect(state.physical!.goal).toBe('explore');
    expect(state.physical!.variables.step).toBe(3);
    expect(state.physical!.motorRuntime).toBe(250);
  });

  // ---------------------------------------------------------------------------
  // 12. reset clears state
  // ---------------------------------------------------------------------------
  it('reset clears state', async () => {
    const runner = new Sim2RealRunner(simTarget, physicalTarget, {
      mode: 'both',
    });

    runner.startTrace();

    // Execute some frames to build up state
    await runner.executeFrame(makeFrame([
      { type: 'state_transition', mode: 'navigating', goal: 'patrol', variables: { x: 10 } },
      { type: 'motor', target: 'both', action: 'forward', speed: 100, duration_ms: 500 },
    ]));

    // Verify state is populated
    let state = runner.getState();
    expect(state.sim.mode).toBe('navigating');
    expect(state.sim.motorRuntime).toBe(500);
    expect(state.physical!.mode).toBe('navigating');
    expect(state.physical!.motorRuntime).toBe(500);
    expect(runner.getCurrentTrace()).not.toBeNull();

    // Reset
    runner.reset();

    // Verify state is clean
    state = runner.getState();
    expect(state.sim.mode).toBe('idle');
    expect(state.sim.goal).toBeUndefined();
    expect(state.sim.variables).toEqual({});
    expect(state.sim.motorRuntime).toBe(0);
    expect(state.physical!.mode).toBe('idle');
    expect(state.physical!.goal).toBeUndefined();
    expect(state.physical!.variables).toEqual({});
    expect(state.physical!.motorRuntime).toBe(0);

    // Current trace should be cleared
    expect(runner.getCurrentTrace()).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // 13. Handles null physical target gracefully
  // ---------------------------------------------------------------------------
  it('handles null physical target gracefully', async () => {
    // Create runner with null physical target
    const runner = new Sim2RealRunner(simTarget, null, {
      mode: 'simulation',
    });

    runner.startTrace();

    const frame = makeFrame([
      { type: 'motor', target: 'both', action: 'forward', speed: 100, duration_ms: 300 },
      { type: 'led', r: 255, g: 0, b: 0 },
    ]);

    const result = await runner.executeFrame(frame);

    // Sim should work fine
    expect(result.sim).toBeDefined();
    expect(result.sim!.executed).toEqual([0, 1]);
    expect(result.sim!.errors).toEqual([]);

    // No physical result or comparison
    expect(result.physical).toBeUndefined();
    expect(result.comparison).toBeUndefined();

    // getState should not have physical
    const state = runner.getState();
    expect(state.sim).toBeDefined();
    expect(state.physical).toBeUndefined();

    // endTrace should work fine
    const trace = runner.endTrace();
    expect(trace).not.toBeNull();
    expect(trace!.entries).toHaveLength(1);

    // Reset should not throw
    expect(() => runner.reset()).not.toThrow();
  });
});
