/**
 * Sim2Real BytecodeRunner — Unified bytecode execution with trace recording
 *
 * Guarantees same bytecode produces equivalent behavior in simulation
 * and on ESP32 hardware. Records BytecodeTrace for replay and comparison.
 *
 * Modes:
 * - 'simulation': Execute only on simulation target
 * - 'physical': Execute only on ESP32 target
 * - 'both': Execute on simulation first, then physical, compare results
 */

import { BytecodeInterpreter, ExecutionTickResult, BytecodeInterpreterConfig } from './bytecode-interpreter';
import { BytecodeExecutionTarget } from './bytecode-targets';
import { OutputFrame } from './llm-bytecode';

// =============================================================================
// Types
// =============================================================================

export type RunnerMode = 'simulation' | 'physical' | 'both';

export interface BytecodeTraceEntry {
  /** Frame that was executed */
  frame: OutputFrame;
  /** Result from execution */
  result: ExecutionTickResult;
  /** Which target executed this */
  target: string;
  /** Execution start time */
  startTime: number;
  /** Execution end time */
  endTime: number;
  /** Duration in ms */
  durationMs: number;
}

export interface BytecodeTrace {
  /** Unique trace ID */
  id: string;
  /** Runner mode */
  mode: RunnerMode;
  /** All trace entries */
  entries: BytecodeTraceEntry[];
  /** Start timestamp */
  startedAt: number;
  /** End timestamp (0 if still running) */
  endedAt: number;
  /** Total frames executed */
  totalFrames: number;
  /** Total errors across all frames */
  totalErrors: number;
}

export interface ComparisonResult {
  /** Whether sim and physical produced equivalent results */
  equivalent: boolean;
  /** Frame index where divergence was detected */
  divergenceFrame?: number;
  /** Description of divergence */
  divergenceReason?: string;
  /** Sim trace entry */
  simEntry: BytecodeTraceEntry;
  /** Physical trace entry */
  physicalEntry: BytecodeTraceEntry;
}

export interface Sim2RealRunnerConfig {
  /** Runner mode (default: 'simulation') */
  mode: RunnerMode;
  /** Interpreter config passed to both interpreters */
  interpreterConfig: Partial<BytecodeInterpreterConfig>;
  /** Maximum trace entries before auto-flush (default: 1000) */
  maxTraceEntries: number;
  /** Whether to record traces (default: true) */
  recordTraces: boolean;
  /** Comparison tolerance for float values in 'both' mode (default: 0.01) */
  comparisonTolerance: number;
}

const DEFAULT_CONFIG: Sim2RealRunnerConfig = {
  mode: 'simulation',
  interpreterConfig: {},
  maxTraceEntries: 1000,
  recordTraces: true,
  comparisonTolerance: 0.01,
};

// =============================================================================
// Sim2RealRunner
// =============================================================================

export class Sim2RealRunner {
  private simInterpreter: BytecodeInterpreter;
  private physicalInterpreter: BytecodeInterpreter | null;
  private currentTrace: BytecodeTrace | null = null;
  private traces: BytecodeTrace[] = [];
  private traceCounter: number = 0;
  private config: Sim2RealRunnerConfig;
  private simTarget: BytecodeExecutionTarget;
  private physicalTarget: BytecodeExecutionTarget | null;

  constructor(
    simTarget: BytecodeExecutionTarget,
    physicalTarget: BytecodeExecutionTarget | null,
    config: Partial<Sim2RealRunnerConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.simTarget = simTarget;
    this.physicalTarget = physicalTarget;

    this.simInterpreter = new BytecodeInterpreter(simTarget, this.config.interpreterConfig);

    if (physicalTarget) {
      this.physicalInterpreter = new BytecodeInterpreter(physicalTarget, this.config.interpreterConfig);
    } else {
      this.physicalInterpreter = null;
    }
  }

  /**
   * Create a new BytecodeTrace and set it as the current trace.
   * Returns the unique trace ID.
   */
  startTrace(): string {
    const id = `trace-${++this.traceCounter}`;
    this.currentTrace = {
      id,
      mode: this.config.mode,
      entries: [],
      startedAt: Date.now(),
      endedAt: 0,
      totalFrames: 0,
      totalErrors: 0,
    };
    return id;
  }

  /**
   * Execute a single OutputFrame based on the configured runner mode.
   *
   * - 'simulation': execute on simInterpreter only
   * - 'physical': execute on physicalInterpreter only
   * - 'both': execute on sim first, then physical, compare results
   */
  async executeFrame(frame: OutputFrame): Promise<{
    sim?: ExecutionTickResult;
    physical?: ExecutionTickResult;
    comparison?: ComparisonResult;
  }> {
    const result: {
      sim?: ExecutionTickResult;
      physical?: ExecutionTickResult;
      comparison?: ComparisonResult;
    } = {};

    if (this.config.mode === 'simulation' || this.config.mode === 'both') {
      const startTime = Date.now();
      const simResult = await this.simInterpreter.executeTick(frame);
      const endTime = Date.now();
      result.sim = simResult;

      if (this.config.recordTraces && this.currentTrace) {
        const entry: BytecodeTraceEntry = {
          frame,
          result: simResult,
          target: this.simTarget.name,
          startTime,
          endTime,
          durationMs: endTime - startTime,
        };
        this.addTraceEntry(entry);
      }
    }

    if (this.config.mode === 'physical' || this.config.mode === 'both') {
      if (this.physicalInterpreter) {
        const startTime = Date.now();
        const physicalResult = await this.physicalInterpreter.executeTick(frame);
        const endTime = Date.now();
        result.physical = physicalResult;

        if (this.config.recordTraces && this.currentTrace) {
          const entry: BytecodeTraceEntry = {
            frame,
            result: physicalResult,
            target: this.physicalTarget!.name,
            startTime,
            endTime,
            durationMs: endTime - startTime,
          };
          this.addTraceEntry(entry);
        }
      }
    }

    // In 'both' mode, compare sim and physical results
    if (this.config.mode === 'both' && result.sim && result.physical) {
      result.comparison = this.compareResults(result.sim, result.physical, frame);
    }

    return result;
  }

  /**
   * Finalize the current trace, push to completed traces, and clear currentTrace.
   * Returns the completed trace, or null if no trace was active.
   */
  endTrace(): BytecodeTrace | null {
    if (!this.currentTrace) {
      return null;
    }

    this.currentTrace.endedAt = Date.now();
    const completedTrace = this.currentTrace;
    this.traces.push(completedTrace);
    this.currentTrace = null;
    return completedTrace;
  }

  /**
   * Compare sim and physical ExecutionTickResults for equivalence.
   *
   * Checks:
   * - Same executed instruction indices
   * - Same blocked instruction indices
   * - Same error count
   * - Same state changes (mode, goal, variable keys)
   * - Motor runtime within tolerance
   */
  compareResults(
    simResult: ExecutionTickResult,
    physicalResult: ExecutionTickResult,
    frame: OutputFrame
  ): ComparisonResult {
    // Build trace entries for the comparison result
    const now = Date.now();
    const simEntry: BytecodeTraceEntry = {
      frame,
      result: simResult,
      target: this.simTarget.name,
      startTime: now,
      endTime: now,
      durationMs: 0,
    };
    const physicalEntry: BytecodeTraceEntry = {
      frame,
      result: physicalResult,
      target: this.physicalTarget?.name ?? 'physical',
      startTime: now,
      endTime: now,
      durationMs: 0,
    };

    // Compare executed indices
    if (simResult.executed.length !== physicalResult.executed.length ||
        !simResult.executed.every((idx, i) => idx === physicalResult.executed[i])) {
      return {
        equivalent: false,
        divergenceFrame: this.currentTrace ? this.currentTrace.totalFrames : 0,
        divergenceReason: `Executed instructions differ: sim=[${simResult.executed}] physical=[${physicalResult.executed}]`,
        simEntry,
        physicalEntry,
      };
    }

    // Compare blocked indices
    if (simResult.blocked.length !== physicalResult.blocked.length ||
        !simResult.blocked.every((idx, i) => idx === physicalResult.blocked[i])) {
      return {
        equivalent: false,
        divergenceFrame: this.currentTrace ? this.currentTrace.totalFrames : 0,
        divergenceReason: `Blocked instructions differ: sim=[${simResult.blocked}] physical=[${physicalResult.blocked}]`,
        simEntry,
        physicalEntry,
      };
    }

    // Compare error counts
    if (simResult.errors.length !== physicalResult.errors.length) {
      return {
        equivalent: false,
        divergenceFrame: this.currentTrace ? this.currentTrace.totalFrames : 0,
        divergenceReason: `Error count differs: sim=${simResult.errors.length} physical=${physicalResult.errors.length}`,
        simEntry,
        physicalEntry,
      };
    }

    // Compare state changes
    const simMode = simResult.stateChanges.mode;
    const physMode = physicalResult.stateChanges.mode;
    if (simMode !== physMode) {
      return {
        equivalent: false,
        divergenceFrame: this.currentTrace ? this.currentTrace.totalFrames : 0,
        divergenceReason: `State mode differs: sim=${simMode} physical=${physMode}`,
        simEntry,
        physicalEntry,
      };
    }

    const simGoal = simResult.stateChanges.goal;
    const physGoal = physicalResult.stateChanges.goal;
    if (simGoal !== physGoal) {
      return {
        equivalent: false,
        divergenceFrame: this.currentTrace ? this.currentTrace.totalFrames : 0,
        divergenceReason: `State goal differs: sim=${simGoal} physical=${physGoal}`,
        simEntry,
        physicalEntry,
      };
    }

    // Compare motor runtime within tolerance
    const motorDiff = Math.abs(simResult.motorRuntime - physicalResult.motorRuntime);
    if (motorDiff > this.config.comparisonTolerance) {
      return {
        equivalent: false,
        divergenceFrame: this.currentTrace ? this.currentTrace.totalFrames : 0,
        divergenceReason: `Motor runtime differs beyond tolerance: sim=${simResult.motorRuntime}ms physical=${physicalResult.motorRuntime}ms (diff=${motorDiff}ms, tolerance=${this.config.comparisonTolerance}ms)`,
        simEntry,
        physicalEntry,
      };
    }

    return {
      equivalent: true,
      simEntry,
      physicalEntry,
    };
  }

  /**
   * Return all completed traces.
   */
  getTraces(): BytecodeTrace[] {
    return this.traces;
  }

  /**
   * Find a completed trace by ID.
   */
  getTrace(id: string): BytecodeTrace | undefined {
    return this.traces.find(t => t.id === id);
  }

  /**
   * Return the current (in-progress) trace, or null if none active.
   */
  getCurrentTrace(): BytecodeTrace | null {
    return this.currentTrace;
  }

  /**
   * Serialize a trace to JSON string for disk persistence.
   */
  exportTrace(id: string): string {
    const trace = this.traces.find(t => t.id === id);
    if (!trace) {
      throw new Error(`Trace not found: ${id}`);
    }
    return JSON.stringify(trace);
  }

  /**
   * Deserialize a trace from a JSON string and add it to the traces list.
   */
  importTrace(json: string): BytecodeTrace {
    const trace: BytecodeTrace = JSON.parse(json);
    this.traces.push(trace);
    return trace;
  }

  /**
   * Return the current state of both interpreters.
   */
  getState(): {
    sim: ReturnType<BytecodeInterpreter['getState']>;
    physical?: ReturnType<BytecodeInterpreter['getState']>;
  } {
    const state: {
      sim: ReturnType<BytecodeInterpreter['getState']>;
      physical?: ReturnType<BytecodeInterpreter['getState']>;
    } = {
      sim: this.simInterpreter.getState(),
    };

    if (this.physicalInterpreter) {
      state.physical = this.physicalInterpreter.getState();
    }

    return state;
  }

  /**
   * Reset both interpreters and clear the current trace.
   */
  reset(): void {
    this.simInterpreter.reset();
    if (this.physicalInterpreter) {
      this.physicalInterpreter.reset();
    }
    this.currentTrace = null;
  }

  // ===========================================================================
  // Private helpers
  // ===========================================================================

  /**
   * Add a trace entry to the current trace, respecting maxTraceEntries.
   */
  private addTraceEntry(entry: BytecodeTraceEntry): void {
    if (!this.currentTrace) return;

    // Auto-flush oldest entries if we exceed maxTraceEntries
    if (this.currentTrace.entries.length >= this.config.maxTraceEntries) {
      this.currentTrace.entries.shift();
    }

    this.currentTrace.entries.push(entry);
    this.currentTrace.totalFrames++;
    this.currentTrace.totalErrors += entry.result.errors.length;
  }
}
