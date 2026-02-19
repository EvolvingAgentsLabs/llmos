import { BytecodeInterpreter, ExecutionTickResult } from '../../../lib/runtime/bytecode-interpreter';
import { BytecodeExecutionTarget } from '../../../lib/runtime/bytecode-targets';
import {
  OutputFrame,
  BytecodeInstruction,
  parseOutputFrame,
  validateOutputFrame,
} from '../../../lib/runtime/llm-bytecode';

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
  readonly name = 'mock';
  motorCalls: MotorCall[] = [];
  ledCalls: LEDCall[] = [];
  sensorCalls: SensorCall[] = [];
  waitCalls: WaitCall[] = [];

  async setMotors(
    target: 'left_wheel' | 'right_wheel' | 'both',
    action: 'forward' | 'backward' | 'stop',
    speed: number,
    durationMs?: number
  ): Promise<void> {
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
  }
}

// =============================================================================
// Helpers
// =============================================================================

function makeFrame(instructions: BytecodeInstruction[], overrides?: Partial<OutputFrame>): OutputFrame {
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

describe('BytecodeInterpreter', () => {
  let mock: MockBytecodeTarget;

  beforeEach(() => {
    mock = new MockBytecodeTarget();
  });

  // -------------------------------------------------------------------------
  // 1. Motor instructions
  // -------------------------------------------------------------------------
  it('executes motor instructions', async () => {
    const interpreter = new BytecodeInterpreter(mock);

    const frame = makeFrame([
      { type: 'motor', target: 'both', action: 'forward', speed: 150, duration_ms: 500 },
    ]);

    const result = await interpreter.executeTick(frame);

    expect(result.executed).toEqual([0]);
    expect(result.blocked).toEqual([]);
    expect(result.errors).toEqual([]);
    expect(mock.motorCalls).toHaveLength(1);
    expect(mock.motorCalls[0]).toEqual({
      target: 'both',
      action: 'forward',
      speed: 150,
      durationMs: 500,
    });
  });

  // -------------------------------------------------------------------------
  // 2. LED instructions
  // -------------------------------------------------------------------------
  it('executes LED instructions', async () => {
    const interpreter = new BytecodeInterpreter(mock);

    const frame = makeFrame([
      { type: 'led', r: 255, g: 0, b: 128 },
    ]);

    const result = await interpreter.executeTick(frame);

    expect(result.executed).toEqual([0]);
    expect(result.blocked).toEqual([]);
    expect(mock.ledCalls).toHaveLength(1);
    expect(mock.ledCalls[0]).toEqual({
      r: 255,
      g: 0,
      b: 128,
      durationMs: undefined,
    });
  });

  // -------------------------------------------------------------------------
  // 3. Sensor read
  // -------------------------------------------------------------------------
  it('executes sensor read', async () => {
    const interpreter = new BytecodeInterpreter(mock);

    const frame = makeFrame([
      { type: 'sensor', target: 'distance' },
    ]);

    const result = await interpreter.executeTick(frame);

    expect(result.executed).toEqual([0]);
    expect(mock.sensorCalls).toHaveLength(1);
    expect(mock.sensorCalls[0]).toEqual({ target: 'distance' });
  });

  // -------------------------------------------------------------------------
  // 4. Timing / wait
  // -------------------------------------------------------------------------
  it('executes timing/wait', async () => {
    const interpreter = new BytecodeInterpreter(mock);

    const frame = makeFrame([
      { type: 'timing', action: 'wait', duration_ms: 200 },
    ]);

    const result = await interpreter.executeTick(frame);

    expect(result.executed).toEqual([0]);
    expect(mock.waitCalls).toHaveLength(1);
    expect(mock.waitCalls[0]).toEqual({ durationMs: 200 });
  });

  // -------------------------------------------------------------------------
  // 5. State transitions
  // -------------------------------------------------------------------------
  it('handles state transitions', async () => {
    const interpreter = new BytecodeInterpreter(mock);

    const frame = makeFrame([
      {
        type: 'state_transition',
        mode: 'navigating',
        goal: 'reach charging station',
        variables: { distance_remaining: 5.2, is_lost: false },
      },
    ]);

    const result = await interpreter.executeTick(frame);

    expect(result.executed).toEqual([0]);
    expect(result.stateChanges.mode).toBe('navigating');
    expect(result.stateChanges.goal).toBe('reach charging station');
    expect(result.stateChanges.variables).toEqual({
      distance_remaining: 5.2,
      is_lost: false,
    });

    const state = interpreter.getState();
    expect(state.mode).toBe('navigating');
    expect(state.goal).toBe('reach charging station');
    expect(state.variables.distance_remaining).toBe(5.2);
    expect(state.variables.is_lost).toBe(false);
  });

  // -------------------------------------------------------------------------
  // 6. Safety: clamps motor speed
  // -------------------------------------------------------------------------
  it('clamps motor speed via safety constraints', async () => {
    const interpreter = new BytecodeInterpreter(mock, {
      safetyConstraints: {
        max_motor_speed: 200,
        emergency_stop_distance_cm: 10,
        max_continuous_motor_ms: 30000,
        enforce_voltage_limits: true,
      },
    });

    // Speed 255 exceeds max_motor_speed of 200
    const frame = makeFrame([
      { type: 'motor', target: 'both', action: 'forward', speed: 255, duration_ms: 100 },
    ]);

    const result = await interpreter.executeTick(frame);

    // The instruction should be executed (after clamping by validateOutputFrame)
    expect(result.executed).toEqual([0]);
    expect(mock.motorCalls).toHaveLength(1);
    // validateOutputFrame clamps speed to max_motor_speed
    expect(mock.motorCalls[0].speed).toBe(200);
  });

  // -------------------------------------------------------------------------
  // 7. Blocks invalid instructions
  // -------------------------------------------------------------------------
  it('blocks invalid instructions', async () => {
    const interpreter = new BytecodeInterpreter(mock);

    // Use an invalid motor target to trigger validation failure
    const frame = makeFrame([
      { type: 'motor', target: 'invalid_wheel' as any, action: 'forward', speed: 100 },
    ]);

    const result = await interpreter.executeTick(frame);

    // validateOutputFrame blocks the invalid instruction, so validated_frame has 0 instructions
    expect(result.blocked.length).toBeGreaterThan(0);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('Invalid motor target');
    expect(mock.motorCalls).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // 8. Motor runtime timeout
  // -------------------------------------------------------------------------
  it('enforces continuous motor timeout', async () => {
    const interpreter = new BytecodeInterpreter(mock, {
      maxMotorRuntimeMs: 100,
    });

    // First motor instruction: 80ms duration
    const frame1 = makeFrame([
      { type: 'motor', target: 'both', action: 'forward', speed: 100, duration_ms: 80 },
    ]);

    const result1 = await interpreter.executeTick(frame1);
    expect(result1.executed).toEqual([0]);
    expect(result1.motorRuntime).toBe(80);

    // Second motor instruction: 50ms duration would push total to 130ms > 100ms limit
    const frame2 = makeFrame([
      { type: 'motor', target: 'both', action: 'forward', speed: 100, duration_ms: 50 },
    ]);

    const result2 = await interpreter.executeTick(frame2);

    // The second instruction should be blocked due to exceeding motor runtime
    expect(result2.blocked.length).toBeGreaterThan(0);
    expect(result2.errors.some(e => e.includes('runtime limit'))).toBe(true);
  });

  // -------------------------------------------------------------------------
  // 9. Composite instructions
  // -------------------------------------------------------------------------
  it('executes composite instructions', async () => {
    const interpreter = new BytecodeInterpreter(mock);

    const frame = makeFrame([
      {
        type: 'composite',
        instructions: [
          { type: 'motor', target: 'both', action: 'forward', speed: 100, duration_ms: 200 },
          { type: 'led', r: 0, g: 255, b: 0 },
        ],
        atomic: false,
      },
    ]);

    const result = await interpreter.executeTick(frame);

    expect(result.executed).toEqual([0]);
    expect(result.blocked).toEqual([]);
    expect(mock.motorCalls).toHaveLength(1);
    expect(mock.motorCalls[0].speed).toBe(100);
    expect(mock.ledCalls).toHaveLength(1);
    expect(mock.ledCalls[0]).toEqual({ r: 0, g: 255, b: 0, durationMs: undefined });
  });

  // -------------------------------------------------------------------------
  // 10. Atomic composite tracking
  // -------------------------------------------------------------------------
  it('handles atomic composite execution', async () => {
    const interpreter = new BytecodeInterpreter(mock);

    // Atomic composite with valid instructions
    const frame = makeFrame([
      {
        type: 'composite',
        instructions: [
          { type: 'led', r: 255, g: 0, b: 0 },
          { type: 'motor', target: 'both', action: 'forward', speed: 80, duration_ms: 100 },
          { type: 'led', r: 0, g: 255, b: 0 },
        ],
        atomic: true,
      },
    ]);

    const result = await interpreter.executeTick(frame);

    expect(result.executed).toEqual([0]);
    expect(mock.ledCalls).toHaveLength(2);
    expect(mock.motorCalls).toHaveLength(1);
  });

  // -------------------------------------------------------------------------
  // 11. Integration: parse -> validate -> execute
  // -------------------------------------------------------------------------
  it('integration: parseOutputFrame -> validateOutputFrame -> executeTick', async () => {
    const interpreter = new BytecodeInterpreter(mock);

    const rawJson = JSON.stringify({
      instructions: [
        { type: 'motor', target: 'both', action: 'forward', speed: 120, duration_ms: 300 },
        { type: 'led', r: 0, g: 255, b: 0 },
        { type: 'state_transition', mode: 'exploring', variables: { step: 1 } },
      ],
      state_predictions: [
        { target: 'position_x', predicted_value: 1.5, confidence: 0.8 },
      ],
      mode: 'exploring',
      confidence: 0.85,
      reasoning: 'Moving forward to explore unknown area',
    });

    // Step 1: Parse
    const parsed = parseOutputFrame(rawJson);
    expect(parsed).not.toBeNull();

    // Step 2: Validate
    const validated = validateOutputFrame(parsed!);
    expect(validated.validated_frame.instructions.length).toBe(3);

    // Step 3: Execute
    const result = await interpreter.executeTick(validated.validated_frame);

    expect(result.executed).toEqual([0, 1, 2]);
    expect(result.blocked).toEqual([]);
    expect(result.errors).toEqual([]);

    // Verify motor call
    expect(mock.motorCalls).toHaveLength(1);
    expect(mock.motorCalls[0]).toEqual({
      target: 'both',
      action: 'forward',
      speed: 120,
      durationMs: 300,
    });

    // Verify LED call
    expect(mock.ledCalls).toHaveLength(1);
    expect(mock.ledCalls[0]).toEqual({ r: 0, g: 255, b: 0, durationMs: undefined });

    // Verify state
    const state = interpreter.getState();
    expect(state.mode).toBe('exploring');
    expect(state.variables.step).toBe(1);
    expect(state.motorRuntime).toBe(300);
  });

  // -------------------------------------------------------------------------
  // 12. Dry run mode
  // -------------------------------------------------------------------------
  it('dryRun mode does not call target', async () => {
    const interpreter = new BytecodeInterpreter(mock, { dryRun: true });

    const frame = makeFrame([
      { type: 'motor', target: 'both', action: 'forward', speed: 100, duration_ms: 500 },
      { type: 'led', r: 255, g: 0, b: 0 },
      { type: 'sensor', target: 'distance' },
      { type: 'timing', action: 'wait', duration_ms: 100 },
    ]);

    const result = await interpreter.executeTick(frame);

    // All instructions should be "executed" (validated and processed) but no target calls
    expect(result.executed).toEqual([0, 1, 2, 3]);
    expect(mock.motorCalls).toHaveLength(0);
    expect(mock.ledCalls).toHaveLength(0);
    expect(mock.sensorCalls).toHaveLength(0);
    expect(mock.waitCalls).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // 13. Reset clears state
  // -------------------------------------------------------------------------
  it('reset clears state', async () => {
    const interpreter = new BytecodeInterpreter(mock);

    // Execute some state transitions and motor instructions
    const frame = makeFrame([
      {
        type: 'state_transition',
        mode: 'navigating',
        goal: 'find exit',
        variables: { counter: 42, active: true },
      },
      { type: 'motor', target: 'both', action: 'forward', speed: 100, duration_ms: 500 },
    ]);

    await interpreter.executeTick(frame);

    // Verify state is populated
    let state = interpreter.getState();
    expect(state.mode).toBe('navigating');
    expect(state.goal).toBe('find exit');
    expect(state.variables.counter).toBe(42);
    expect(state.variables.active).toBe(true);
    expect(state.motorRuntime).toBe(500);

    // Reset
    interpreter.reset();

    // Verify state is clean
    state = interpreter.getState();
    expect(state.mode).toBe('idle');
    expect(state.goal).toBeUndefined();
    expect(state.variables).toEqual({});
    expect(state.motorRuntime).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Additional: motor stop resets tracking
  // -------------------------------------------------------------------------
  it('motor stop accumulates runtime correctly', async () => {
    const interpreter = new BytecodeInterpreter(mock);

    // Start motors with known duration
    const frame1 = makeFrame([
      { type: 'motor', target: 'both', action: 'forward', speed: 100, duration_ms: 200 },
    ]);
    await interpreter.executeTick(frame1);
    expect(interpreter.getState().motorRuntime).toBe(200);

    // Stop motors
    const frame2 = makeFrame([
      { type: 'motor', target: 'both', action: 'stop' },
    ]);
    await interpreter.executeTick(frame2);

    // Motor calls should include both forward and stop
    expect(mock.motorCalls).toHaveLength(2);
    expect(mock.motorCalls[1].action).toBe('stop');
  });

  // -------------------------------------------------------------------------
  // Additional: multiple instructions in one frame
  // -------------------------------------------------------------------------
  it('executes multiple instructions in sequence', async () => {
    const interpreter = new BytecodeInterpreter(mock);

    const frame = makeFrame([
      { type: 'led', r: 255, g: 0, b: 0 },
      { type: 'motor', target: 'left_wheel', action: 'forward', speed: 80, duration_ms: 100 },
      { type: 'sensor', target: 'imu' },
      { type: 'timing', action: 'wait', duration_ms: 50 },
      { type: 'motor', target: 'both', action: 'stop' },
    ]);

    const result = await interpreter.executeTick(frame);

    expect(result.executed).toEqual([0, 1, 2, 3, 4]);
    expect(mock.ledCalls).toHaveLength(1);
    expect(mock.motorCalls).toHaveLength(2);
    expect(mock.sensorCalls).toHaveLength(1);
    expect(mock.waitCalls).toHaveLength(1);
  });

  // -------------------------------------------------------------------------
  // Additional: result has timestamp
  // -------------------------------------------------------------------------
  it('result includes timestamp', async () => {
    const interpreter = new BytecodeInterpreter(mock);

    const before = Date.now();
    const result = await interpreter.executeTick(makeFrame([]));
    const after = Date.now();

    expect(result.timestamp).toBeGreaterThanOrEqual(before);
    expect(result.timestamp).toBeLessThanOrEqual(after);
  });

  // -------------------------------------------------------------------------
  // Additional: state persists across ticks
  // -------------------------------------------------------------------------
  it('state persists across ticks', async () => {
    const interpreter = new BytecodeInterpreter(mock);

    await interpreter.executeTick(makeFrame([
      { type: 'state_transition', mode: 'exploring', variables: { a: 1 } },
    ]));

    await interpreter.executeTick(makeFrame([
      { type: 'state_transition', variables: { b: 2 } },
    ]));

    const state = interpreter.getState();
    expect(state.mode).toBe('exploring');
    expect(state.variables).toEqual({ a: 1, b: 2 });
  });
});
