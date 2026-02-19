/**
 * Execution Trace Collector — Full Pipeline Trace Recording
 *
 * Records the complete execution pipeline for a robot cycle:
 *   sensors → brain decision → bytecode → execution → outcome
 *
 * Traces feed into the RSA engine for learning and improvement.
 * Each trace captures the full causal chain so the system can
 * identify what decisions led to good or bad outcomes.
 */

import { ExecutionTickResult } from './bytecode-interpreter';
import { OutputFrame, ExecutionMode } from './llm-bytecode';

// =============================================================================
// Trace Entry Types — Each stage of the pipeline
// =============================================================================

export interface SensorEntry {
  stage: 'sensor';
  timestamp: number;
  sensorType: string;
  data: Record<string, unknown>;
}

export interface DecisionEntry {
  stage: 'decision';
  timestamp: number;
  /** The raw LLM response or decision context */
  reasoning: string;
  /** Confidence from the LLM */
  confidence: number;
  /** Current execution mode when decision was made */
  mode: ExecutionMode;
  /** Decision latency in ms */
  latencyMs: number;
}

export interface BytecodeEntry {
  stage: 'bytecode';
  timestamp: number;
  /** The output frame generated */
  frame: OutputFrame;
  /** Number of instructions */
  instructionCount: number;
}

export interface ExecutionEntry {
  stage: 'execution';
  timestamp: number;
  /** Result from BytecodeInterpreter */
  result: ExecutionTickResult;
  /** Target used (sim or esp32) */
  target: string;
}

export interface OutcomeEntry {
  stage: 'outcome';
  timestamp: number;
  /** Whether the cycle achieved its goal */
  success: boolean;
  /** Error message if failed */
  error?: string;
  /** Metric measurements (distance moved, area explored, etc.) */
  metrics: Record<string, number>;
}

export type TraceEntry = SensorEntry | DecisionEntry | BytecodeEntry | ExecutionEntry | OutcomeEntry;

// =============================================================================
// Trace & Summary Types
// =============================================================================

export interface ExecutionTrace {
  /** Unique trace ID */
  id: string;
  /** Device ID of the robot */
  deviceId: string;
  /** All entries in chronological order */
  entries: TraceEntry[];
  /** Trace start time */
  startedAt: number;
  /** Trace end time (0 if still recording) */
  endedAt: number;
  /** Summary statistics */
  summary: TraceSummary;
}

export interface TraceSummary {
  totalEntries: number;
  sensorReadings: number;
  decisions: number;
  bytecodeFrames: number;
  executions: number;
  outcomes: number;
  successfulOutcomes: number;
  failedOutcomes: number;
  totalLatencyMs: number;
  avgDecisionLatencyMs: number;
}

// =============================================================================
// Configuration
// =============================================================================

export interface TraceCollectorConfig {
  /** Maximum entries per trace (default: 5000) */
  maxEntriesPerTrace: number;
  /** Maximum completed traces to keep (default: 50) */
  maxCompletedTraces: number;
  /** Auto-flush threshold - flush when entries exceed this (default: 1000) */
  autoFlushThreshold: number;
  /** Whether to record sensor data (can be large) (default: true) */
  recordSensorData: boolean;
  /** Whether to record full OutputFrame (default: true) */
  recordFullFrames: boolean;
}

const DEFAULT_CONFIG: TraceCollectorConfig = {
  maxEntriesPerTrace: 5000,
  maxCompletedTraces: 50,
  autoFlushThreshold: 1000,
  recordSensorData: true,
  recordFullFrames: true,
};

// =============================================================================
// RSA Feedback Data
// =============================================================================

export interface RSAFeedbackData {
  /** Trace ID this feedback is derived from */
  traceId: string;
  /** Summary of what happened */
  narrative: string;
  /** Key decisions and their outcomes */
  decisionOutcomes: Array<{
    decision: string;
    confidence: number;
    outcome: 'success' | 'failure' | 'neutral';
    metric?: number;
  }>;
  /** Patterns identified */
  patterns: string[];
  /** Suggested improvements */
  suggestions: string[];
}

// =============================================================================
// ExecutionTraceCollector
// =============================================================================

export class ExecutionTraceCollector {
  private deviceId: string;
  private config: TraceCollectorConfig;
  private currentTrace: ExecutionTrace | null = null;
  private completedTraces: ExecutionTrace[] = [];
  private traceCounter: number = 0;
  private flushCallbacks: ((trace: ExecutionTrace) => void)[] = [];

  constructor(deviceId: string, config: Partial<TraceCollectorConfig> = {}) {
    this.deviceId = deviceId;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Create a new ExecutionTrace and set it as the current trace.
   * Returns the trace ID.
   */
  startTrace(): string {
    const id = `trace-${this.deviceId}-${++this.traceCounter}`;
    this.currentTrace = {
      id,
      deviceId: this.deviceId,
      entries: [],
      startedAt: Date.now(),
      endedAt: 0,
      summary: this.emptySummary(),
    };
    return id;
  }

  /**
   * Record a generic trace entry into the current trace.
   */
  recordEntry(entry: TraceEntry): void {
    if (!this.currentTrace) return;

    // Enforce maxEntriesPerTrace by dropping oldest entries
    if (this.currentTrace.entries.length >= this.config.maxEntriesPerTrace) {
      this.currentTrace.entries.shift();
    }

    this.currentTrace.entries.push(entry);
    this.updateSummaryForEntry(entry);

    // Check auto-flush threshold
    if (this.currentTrace.entries.length >= this.config.autoFlushThreshold) {
      const flushedTrace = this.endTrace();
      if (flushedTrace) {
        for (const callback of this.flushCallbacks) {
          callback(flushedTrace);
        }
      }
    }
  }

  /**
   * Convenience method for recording a sensor entry.
   * Skips recording if config.recordSensorData is false.
   */
  recordSensor(sensorType: string, data: Record<string, unknown>): void {
    if (!this.config.recordSensorData) return;

    this.recordEntry({
      stage: 'sensor',
      timestamp: Date.now(),
      sensorType,
      data,
    });
  }

  /**
   * Convenience method for recording a decision entry.
   */
  recordDecision(reasoning: string, confidence: number, mode: ExecutionMode, latencyMs: number): void {
    this.recordEntry({
      stage: 'decision',
      timestamp: Date.now(),
      reasoning,
      confidence,
      mode,
      latencyMs,
    });
  }

  /**
   * Convenience method for recording a bytecode entry.
   * If config.recordFullFrames is false, only record instruction count and mode.
   */
  recordBytecode(frame: OutputFrame): void {
    if (this.config.recordFullFrames) {
      this.recordEntry({
        stage: 'bytecode',
        timestamp: Date.now(),
        frame,
        instructionCount: frame.instructions.length,
      });
    } else {
      // Record a minimal frame with only instruction count and mode
      const minimalFrame: OutputFrame = {
        instructions: [],
        state_predictions: [],
        mode: frame.mode,
        confidence: frame.confidence,
      };
      this.recordEntry({
        stage: 'bytecode',
        timestamp: Date.now(),
        frame: minimalFrame,
        instructionCount: frame.instructions.length,
      });
    }
  }

  /**
   * Convenience method for recording an execution entry.
   */
  recordExecution(result: ExecutionTickResult, target: string): void {
    this.recordEntry({
      stage: 'execution',
      timestamp: Date.now(),
      result,
      target,
    });
  }

  /**
   * Convenience method for recording an outcome entry.
   */
  recordOutcome(success: boolean, metrics: Record<string, number>, error?: string): void {
    this.recordEntry({
      stage: 'outcome',
      timestamp: Date.now(),
      success,
      metrics,
      ...(error !== undefined ? { error } : {}),
    });
  }

  /**
   * Finalize the current trace: set endedAt, compute final summary,
   * push to completedTraces (evicting oldest if over limit), and clear currentTrace.
   * Returns the completed trace, or null if there was no active trace.
   */
  endTrace(): ExecutionTrace | null {
    if (!this.currentTrace) return null;

    this.currentTrace.endedAt = Date.now();
    this.currentTrace.summary = this.computeSummary(this.currentTrace.entries);

    const trace = this.currentTrace;
    this.currentTrace = null;

    this.completedTraces.push(trace);

    // Evict oldest traces if over the limit
    while (this.completedTraces.length > this.config.maxCompletedTraces) {
      this.completedTraces.shift();
    }

    return trace;
  }

  /**
   * Get the summary for a completed trace by ID.
   */
  analyzeTrace(traceId: string): TraceSummary | null {
    const trace = this.findTrace(traceId);
    if (!trace) return null;
    return trace.summary;
  }

  /**
   * Convert a trace to RSA feedback format for learning.
   * Builds a narrative, extracts decision-outcome pairs, identifies patterns,
   * and generates improvement suggestions.
   */
  exportForRSA(traceId: string): RSAFeedbackData | null {
    const trace = this.findTrace(traceId);
    if (!trace) return null;

    const narrative = this.buildNarrative(trace);
    const decisionOutcomes = this.extractDecisionOutcomes(trace);
    const patterns = this.identifyPatterns(trace, decisionOutcomes);
    const suggestions = this.generateSuggestions(trace, decisionOutcomes, patterns);

    return {
      traceId: trace.id,
      narrative,
      decisionOutcomes,
      patterns,
      suggestions,
    };
  }

  /**
   * Return all completed traces.
   */
  getCompletedTraces(): ExecutionTrace[] {
    return this.completedTraces;
  }

  /**
   * Find a trace by ID (checks both current and completed traces).
   */
  getTrace(id: string): ExecutionTrace | undefined {
    return this.findTrace(id) ?? undefined;
  }

  /**
   * Return the current active trace, or null if none.
   */
  getCurrentTrace(): ExecutionTrace | null {
    return this.currentTrace;
  }

  /**
   * Register a callback that fires when a trace is auto-flushed
   * (i.e., when entries exceed autoFlushThreshold).
   */
  onFlush(callback: (trace: ExecutionTrace) => void): void {
    this.flushCallbacks.push(callback);
  }

  /**
   * Export a trace as a JSON string.
   */
  exportTrace(id: string): string {
    const trace = this.findTrace(id);
    if (!trace) return '{}';
    return JSON.stringify(trace);
  }

  /**
   * Import a trace from a JSON string and add it to completed traces.
   */
  importTrace(json: string): ExecutionTrace {
    const trace: ExecutionTrace = JSON.parse(json);
    this.completedTraces.push(trace);

    // Evict oldest if over limit
    while (this.completedTraces.length > this.config.maxCompletedTraces) {
      this.completedTraces.shift();
    }

    return trace;
  }

  /**
   * Clear all state: current trace, completed traces, and counter.
   */
  reset(): void {
    this.currentTrace = null;
    this.completedTraces = [];
    this.traceCounter = 0;
  }

  // ===========================================================================
  // Private helpers
  // ===========================================================================

  /**
   * Find a trace by ID in both current and completed traces.
   */
  private findTrace(id: string): ExecutionTrace | null {
    if (this.currentTrace && this.currentTrace.id === id) {
      return this.currentTrace;
    }
    return this.completedTraces.find((t) => t.id === id) ?? null;
  }

  /**
   * Compute a TraceSummary from a list of trace entries.
   */
  private computeSummary(entries: TraceEntry[]): TraceSummary {
    let sensorReadings = 0;
    let decisions = 0;
    let bytecodeFrames = 0;
    let executions = 0;
    let outcomes = 0;
    let successfulOutcomes = 0;
    let failedOutcomes = 0;
    let totalLatencyMs = 0;
    let decisionCount = 0;

    for (const entry of entries) {
      switch (entry.stage) {
        case 'sensor':
          sensorReadings++;
          break;
        case 'decision':
          decisions++;
          decisionCount++;
          totalLatencyMs += entry.latencyMs;
          break;
        case 'bytecode':
          bytecodeFrames++;
          break;
        case 'execution':
          executions++;
          break;
        case 'outcome':
          outcomes++;
          if (entry.success) {
            successfulOutcomes++;
          } else {
            failedOutcomes++;
          }
          break;
      }
    }

    return {
      totalEntries: entries.length,
      sensorReadings,
      decisions,
      bytecodeFrames,
      executions,
      outcomes,
      successfulOutcomes,
      failedOutcomes,
      totalLatencyMs,
      avgDecisionLatencyMs: decisionCount > 0 ? totalLatencyMs / decisionCount : 0,
    };
  }

  /**
   * Return an empty summary with all counts at zero.
   */
  private emptySummary(): TraceSummary {
    return {
      totalEntries: 0,
      sensorReadings: 0,
      decisions: 0,
      bytecodeFrames: 0,
      executions: 0,
      outcomes: 0,
      successfulOutcomes: 0,
      failedOutcomes: 0,
      totalLatencyMs: 0,
      avgDecisionLatencyMs: 0,
    };
  }

  /**
   * Incrementally update the current trace's summary for a single new entry.
   */
  private updateSummaryForEntry(entry: TraceEntry): void {
    if (!this.currentTrace) return;
    const s = this.currentTrace.summary;
    s.totalEntries = this.currentTrace.entries.length;

    switch (entry.stage) {
      case 'sensor':
        s.sensorReadings++;
        break;
      case 'decision':
        s.decisions++;
        s.totalLatencyMs += entry.latencyMs;
        s.avgDecisionLatencyMs = s.decisions > 0 ? s.totalLatencyMs / s.decisions : 0;
        break;
      case 'bytecode':
        s.bytecodeFrames++;
        break;
      case 'execution':
        s.executions++;
        break;
      case 'outcome':
        s.outcomes++;
        if (entry.success) {
          s.successfulOutcomes++;
        } else {
          s.failedOutcomes++;
        }
        break;
    }
  }

  /**
   * Build a human-readable narrative of the trace for RSA context.
   */
  private buildNarrative(trace: ExecutionTrace): string {
    const parts: string[] = [];
    parts.push(`Trace ${trace.id} for device ${trace.deviceId}.`);

    const durationMs = trace.endedAt - trace.startedAt;
    parts.push(`Duration: ${durationMs}ms.`);

    const s = trace.summary;
    parts.push(
      `Recorded ${s.totalEntries} entries: ${s.sensorReadings} sensor readings, ` +
      `${s.decisions} decisions, ${s.bytecodeFrames} bytecode frames, ` +
      `${s.executions} executions, ${s.outcomes} outcomes.`
    );

    if (s.outcomes > 0) {
      parts.push(
        `Outcomes: ${s.successfulOutcomes} successful, ${s.failedOutcomes} failed.`
      );
    }

    if (s.decisions > 0) {
      parts.push(`Average decision latency: ${s.avgDecisionLatencyMs.toFixed(1)}ms.`);
    }

    // Include key events from the entries
    for (const entry of trace.entries) {
      if (entry.stage === 'decision') {
        parts.push(
          `Decision (confidence=${entry.confidence.toFixed(2)}, mode=${entry.mode}): ${entry.reasoning}`
        );
      } else if (entry.stage === 'outcome') {
        const status = entry.success ? 'SUCCESS' : 'FAILURE';
        const metricsStr = Object.entries(entry.metrics)
          .map(([k, v]) => `${k}=${v}`)
          .join(', ');
        parts.push(
          `Outcome: ${status}${entry.error ? ` (${entry.error})` : ''}${metricsStr ? ` [${metricsStr}]` : ''}`
        );
      }
    }

    return parts.join(' ');
  }

  /**
   * Extract decision-outcome pairs by correlating sequential entries.
   * Looks for Decision → ... → Outcome sequences and pairs them.
   */
  private extractDecisionOutcomes(
    trace: ExecutionTrace
  ): RSAFeedbackData['decisionOutcomes'] {
    const results: RSAFeedbackData['decisionOutcomes'] = [];
    const entries = trace.entries;

    // Walk through entries, pairing each decision with the next outcome
    let lastDecision: DecisionEntry | null = null;

    for (const entry of entries) {
      if (entry.stage === 'decision') {
        lastDecision = entry;
      } else if (entry.stage === 'outcome' && lastDecision) {
        const firstMetricValue = Object.values(entry.metrics)[0];
        results.push({
          decision: lastDecision.reasoning,
          confidence: lastDecision.confidence,
          outcome: entry.success ? 'success' : 'failure',
          metric: firstMetricValue,
        });
        lastDecision = null;
      }
    }

    // If there's a decision with no corresponding outcome, mark it neutral
    if (lastDecision) {
      results.push({
        decision: lastDecision.reasoning,
        confidence: lastDecision.confidence,
        outcome: 'neutral',
      });
    }

    return results;
  }

  /**
   * Identify patterns from the trace and decision-outcome pairs.
   */
  private identifyPatterns(
    trace: ExecutionTrace,
    decisionOutcomes: RSAFeedbackData['decisionOutcomes']
  ): string[] {
    const patterns: string[] = [];

    // Pattern: low confidence decisions often fail
    const lowConfFailures = decisionOutcomes.filter(
      (d) => d.confidence < 0.5 && d.outcome === 'failure'
    );
    const lowConfTotal = decisionOutcomes.filter((d) => d.confidence < 0.5);
    if (lowConfTotal.length > 0 && lowConfFailures.length / lowConfTotal.length > 0.5) {
      patterns.push('Low confidence decisions often fail');
    }

    // Pattern: high confidence decisions succeed
    const highConfSuccesses = decisionOutcomes.filter(
      (d) => d.confidence >= 0.8 && d.outcome === 'success'
    );
    const highConfTotal = decisionOutcomes.filter((d) => d.confidence >= 0.8);
    if (highConfTotal.length > 0 && highConfSuccesses.length / highConfTotal.length > 0.7) {
      patterns.push('High confidence decisions tend to succeed');
    }

    // Pattern: frequent sensor readings before decisions
    const entries = trace.entries;
    let sensorBeforeDecision = 0;
    let totalDecisions = 0;
    for (let i = 1; i < entries.length; i++) {
      if (entries[i].stage === 'decision') {
        totalDecisions++;
        if (entries[i - 1].stage === 'sensor') {
          sensorBeforeDecision++;
        }
      }
    }
    if (totalDecisions > 0 && sensorBeforeDecision / totalDecisions > 0.7) {
      patterns.push('Decisions consistently preceded by sensor readings');
    }

    // Pattern: execution errors correlate with failed outcomes
    const executionErrors = entries.filter(
      (e) => e.stage === 'execution' && e.result.errors.length > 0
    );
    if (executionErrors.length > 0 && trace.summary.failedOutcomes > 0) {
      patterns.push('Execution errors correlate with failed outcomes');
    }

    // Pattern: repeated recovery mode
    const recoveryDecisions = entries.filter(
      (e) => e.stage === 'decision' && e.mode === 'recovery'
    );
    if (recoveryDecisions.length >= 2) {
      patterns.push('Multiple recovery mode entries detected');
    }

    return patterns;
  }

  /**
   * Generate improvement suggestions based on failure patterns.
   */
  private generateSuggestions(
    trace: ExecutionTrace,
    decisionOutcomes: RSAFeedbackData['decisionOutcomes'],
    patterns: string[]
  ): string[] {
    const suggestions: string[] = [];

    // If there are failures, suggest investigation
    if (trace.summary.failedOutcomes > 0) {
      suggestions.push(
        `Investigate ${trace.summary.failedOutcomes} failed outcome(s) to identify root causes`
      );
    }

    // If low-confidence pattern detected
    if (patterns.includes('Low confidence decisions often fail')) {
      suggestions.push(
        'Consider requesting additional sensor data before making low-confidence decisions'
      );
    }

    // If high latency
    if (trace.summary.avgDecisionLatencyMs > 500) {
      suggestions.push(
        `Reduce decision latency (avg ${trace.summary.avgDecisionLatencyMs.toFixed(0)}ms) for faster response`
      );
    }

    // If execution errors present
    const hasExecutionErrors = trace.entries.some(
      (e) => e.stage === 'execution' && e.result.errors.length > 0
    );
    if (hasExecutionErrors) {
      suggestions.push('Review bytecode generation to reduce execution errors');
    }

    // If recovery mode appears repeatedly
    if (patterns.includes('Multiple recovery mode entries detected')) {
      suggestions.push(
        'Frequent recovery mode suggests environmental challenges; consider adjusting exploration strategy'
      );
    }

    // If no sensor readings before decisions
    if (
      trace.summary.decisions > 0 &&
      trace.summary.sensorReadings === 0
    ) {
      suggestions.push('Decisions made without sensor data; add sensor reads before deciding');
    }

    return suggestions;
  }
}
