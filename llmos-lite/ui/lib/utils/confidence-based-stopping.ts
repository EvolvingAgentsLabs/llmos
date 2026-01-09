/**
 * Confidence-Based Early Stopping
 *
 * Provides intelligent termination of agent loops based on confidence
 * signals rather than hard iteration limits.
 *
 * Key signals analyzed:
 * - Task completion indicators in LLM responses
 * - Diminishing returns (similar outputs)
 * - Error patterns and recovery attempts
 * - Tool call patterns (decreasing activity)
 * - Explicit confidence statements
 */

// =============================================================================
// Types
// =============================================================================

export interface ConfidenceSignal {
  type: 'completion' | 'stagnation' | 'error' | 'explicit' | 'tool_pattern';
  value: number; // 0-1, higher = more confident task is complete
  reason: string;
  weight: number; // How much this signal matters
}

export interface StoppingDecision {
  shouldStop: boolean;
  confidence: number; // 0-1
  reason: string;
  signals: ConfidenceSignal[];
  recommendation: 'continue' | 'stop' | 'warn';
}

export interface IterationHistory {
  iteration: number;
  response: string;
  toolCalls: string[];
  hasError: boolean;
  timestamp: number;
}

export interface StoppingConfig {
  /** Confidence threshold for stopping (default: 0.85) */
  confidenceThreshold: number;
  /** Maximum iterations regardless of confidence (default: 15) */
  absoluteMaxIterations: number;
  /** Minimum iterations before early stop allowed (default: 2) */
  minimumIterations: number;
  /** Number of similar responses to detect stagnation (default: 2) */
  stagnationThreshold: number;
  /** Enable explicit confidence detection from LLM (default: true) */
  detectExplicitConfidence: boolean;
  /** Weight multipliers for different signal types */
  weights: {
    completion: number;
    stagnation: number;
    error: number;
    explicit: number;
    tool_pattern: number;
  };
}

export const DEFAULT_STOPPING_CONFIG: StoppingConfig = {
  confidenceThreshold: 0.85,
  absoluteMaxIterations: 15,
  minimumIterations: 2,
  stagnationThreshold: 2,
  detectExplicitConfidence: true,
  weights: {
    completion: 1.0,
    stagnation: 0.8,
    error: 0.6,
    explicit: 1.2,
    tool_pattern: 0.7,
  },
};

// =============================================================================
// Completion Patterns
// =============================================================================

const COMPLETION_PATTERNS = [
  // Strong completion indicators
  { pattern: /\b(task|goal|request)\s+(is\s+)?(complete|completed|done|finished|accomplished)\b/i, weight: 0.9 },
  { pattern: /\bsuccessfully\s+(completed|created|implemented|fixed)\b/i, weight: 0.85 },
  { pattern: /\ball\s+(steps|tasks|requirements)\s+(are\s+)?(complete|done)\b/i, weight: 0.9 },
  { pattern: /\bno\s+(further|more|additional)\s+(action|steps?|work)\s+(needed|required)\b/i, weight: 0.85 },

  // Medium completion indicators
  { pattern: /\bthe\s+\w+\s+has\s+been\s+(created|written|updated|implemented)\b/i, weight: 0.6 },
  { pattern: /\bhere\s+is\s+(the|your)\s+(final|completed)\b/i, weight: 0.7 },
  { pattern: /\bI('ve| have)\s+(finished|completed|done)\b/i, weight: 0.75 },

  // Weak completion indicators
  { pattern: /\blet me know if\b/i, weight: 0.4 },
  { pattern: /\bis there anything else\b/i, weight: 0.5 },
];

const CONTINUATION_PATTERNS = [
  // Indicators the task is NOT complete
  { pattern: /\bnext\s+(step|I'll|we)\b/i, weight: -0.5 },
  { pattern: /\bnow\s+(I'll|let me|we)\b/i, weight: -0.4 },
  { pattern: /\bfirst,?\s+I('ll| will| need to)\b/i, weight: -0.5 },
  { pattern: /\blet me\s+(check|verify|test|run)\b/i, weight: -0.3 },
  { pattern: /\bI need to\b/i, weight: -0.4 },
  { pattern: /\btodo:?\b/i, weight: -0.3 },
];

const ERROR_PATTERNS = [
  { pattern: /\berror\b/i, weight: 0.3 },
  { pattern: /\bfailed\b/i, weight: 0.4 },
  { pattern: /\bexception\b/i, weight: 0.3 },
  { pattern: /\bcan'?t\s+(find|read|write|access)\b/i, weight: 0.25 },
];

const EXPLICIT_CONFIDENCE_PATTERNS = [
  // Explicit confidence statements
  { pattern: /\bconfidence:\s*(\d+)%/i, extract: (m: RegExpMatchArray) => parseInt(m[1]) / 100 },
  { pattern: /\b(\d+)%\s*confident\b/i, extract: (m: RegExpMatchArray) => parseInt(m[1]) / 100 },
  { pattern: /\bI('m| am)\s+(very\s+)?confident\b/i, extract: () => 0.85 },
  { pattern: /\bI('m| am)\s+(fairly|somewhat)\s+confident\b/i, extract: () => 0.65 },
  { pattern: /\bI('m| am)\s+not\s+(sure|certain)\b/i, extract: () => 0.3 },
];

// =============================================================================
// Signal Detection
// =============================================================================

/**
 * Detect completion signals in a response
 */
function detectCompletionSignals(
  response: string,
  config: StoppingConfig
): ConfidenceSignal[] {
  const signals: ConfidenceSignal[] = [];

  // Check completion patterns
  for (const { pattern, weight } of COMPLETION_PATTERNS) {
    if (pattern.test(response)) {
      signals.push({
        type: 'completion',
        value: weight,
        reason: `Matches completion pattern: ${pattern.source.substring(0, 30)}...`,
        weight: config.weights.completion,
      });
    }
  }

  // Check continuation patterns (negative signals)
  for (const { pattern, weight } of CONTINUATION_PATTERNS) {
    if (pattern.test(response)) {
      signals.push({
        type: 'completion',
        value: Math.max(0, 0.5 + weight), // weight is negative
        reason: `Matches continuation pattern: ${pattern.source.substring(0, 30)}...`,
        weight: config.weights.completion * 0.5,
      });
    }
  }

  return signals;
}

/**
 * Detect explicit confidence statements
 */
function detectExplicitConfidence(
  response: string,
  config: StoppingConfig
): ConfidenceSignal[] {
  if (!config.detectExplicitConfidence) return [];

  const signals: ConfidenceSignal[] = [];

  for (const { pattern, extract } of EXPLICIT_CONFIDENCE_PATTERNS) {
    const match = response.match(pattern);
    if (match) {
      const value = extract(match);
      signals.push({
        type: 'explicit',
        value,
        reason: `Explicit confidence: ${match[0]}`,
        weight: config.weights.explicit,
      });
    }
  }

  return signals;
}

/**
 * Detect stagnation (similar consecutive responses)
 */
function detectStagnation(
  history: IterationHistory[],
  config: StoppingConfig
): ConfidenceSignal[] {
  if (history.length < config.stagnationThreshold) return [];

  const signals: ConfidenceSignal[] = [];
  const recentResponses = history.slice(-config.stagnationThreshold);

  // Calculate similarity between recent responses
  const similarities: number[] = [];
  for (let i = 1; i < recentResponses.length; i++) {
    const sim = calculateSimilarity(
      recentResponses[i - 1].response,
      recentResponses[i].response
    );
    similarities.push(sim);
  }

  const avgSimilarity = similarities.reduce((a, b) => a + b, 0) / similarities.length;

  if (avgSimilarity > 0.8) {
    signals.push({
      type: 'stagnation',
      value: avgSimilarity,
      reason: `High response similarity: ${(avgSimilarity * 100).toFixed(0)}%`,
      weight: config.weights.stagnation,
    });
  }

  // Check for repeated tool call patterns
  const toolPatterns = recentResponses.map(r => r.toolCalls.sort().join(','));
  const uniquePatterns = new Set(toolPatterns);

  if (uniquePatterns.size === 1 && toolPatterns.length >= config.stagnationThreshold) {
    signals.push({
      type: 'stagnation',
      value: 0.9,
      reason: 'Identical tool call patterns',
      weight: config.weights.stagnation,
    });
  }

  return signals;
}

/**
 * Detect tool call patterns indicating completion
 */
function detectToolPatterns(
  history: IterationHistory[],
  config: StoppingConfig
): ConfidenceSignal[] {
  if (history.length < 2) return [];

  const signals: ConfidenceSignal[] = [];
  const recentHistory = history.slice(-3);

  // Check for decreasing tool calls
  const toolCounts = recentHistory.map(h => h.toolCalls.length);

  if (toolCounts.length >= 2) {
    const lastCount = toolCounts[toolCounts.length - 1];
    const previousCount = toolCounts[toolCounts.length - 2];

    // No tool calls in last iteration = likely complete
    if (lastCount === 0 && previousCount > 0) {
      signals.push({
        type: 'tool_pattern',
        value: 0.8,
        reason: 'No tool calls in last iteration (after having some)',
        weight: config.weights.tool_pattern,
      });
    }

    // Decreasing tool activity
    if (lastCount < previousCount && previousCount > 0) {
      signals.push({
        type: 'tool_pattern',
        value: 0.5,
        reason: 'Decreasing tool call activity',
        weight: config.weights.tool_pattern * 0.7,
      });
    }
  }

  return signals;
}

/**
 * Detect error patterns
 */
function detectErrorPatterns(
  history: IterationHistory[],
  currentResponse: string,
  config: StoppingConfig
): ConfidenceSignal[] {
  const signals: ConfidenceSignal[] = [];

  // Check for error patterns in current response
  for (const { pattern, weight } of ERROR_PATTERNS) {
    if (pattern.test(currentResponse)) {
      signals.push({
        type: 'error',
        value: 1 - weight, // Lower confidence when errors present
        reason: `Error pattern detected: ${pattern.source}`,
        weight: config.weights.error,
      });
    }
  }

  // Check for repeated errors
  const recentErrors = history.filter(h => h.hasError).length;
  if (recentErrors >= 2 && history.length >= 3) {
    signals.push({
      type: 'error',
      value: 0.3, // Low confidence due to errors
      reason: `Multiple errors in recent iterations (${recentErrors})`,
      weight: config.weights.error,
    });
  }

  return signals;
}

// =============================================================================
// Main Decision Function
// =============================================================================

/**
 * Analyze signals and decide whether to stop
 */
export function shouldStop(
  currentIteration: number,
  currentResponse: string,
  currentToolCalls: string[],
  hasError: boolean,
  history: IterationHistory[],
  config: Partial<StoppingConfig> = {}
): StoppingDecision {
  const fullConfig = { ...DEFAULT_STOPPING_CONFIG, ...config };

  // Absolute limits
  if (currentIteration >= fullConfig.absoluteMaxIterations) {
    return {
      shouldStop: true,
      confidence: 1.0,
      reason: `Reached absolute maximum iterations (${fullConfig.absoluteMaxIterations})`,
      signals: [],
      recommendation: 'stop',
    };
  }

  // Minimum iterations
  if (currentIteration < fullConfig.minimumIterations) {
    return {
      shouldStop: false,
      confidence: 0,
      reason: `Below minimum iterations (${fullConfig.minimumIterations})`,
      signals: [],
      recommendation: 'continue',
    };
  }

  // Add current iteration to history for analysis
  const updatedHistory: IterationHistory[] = [
    ...history,
    {
      iteration: currentIteration,
      response: currentResponse,
      toolCalls: currentToolCalls,
      hasError,
      timestamp: Date.now(),
    },
  ];

  // Collect all signals
  const signals: ConfidenceSignal[] = [
    ...detectCompletionSignals(currentResponse, fullConfig),
    ...detectExplicitConfidence(currentResponse, fullConfig),
    ...detectStagnation(updatedHistory, fullConfig),
    ...detectToolPatterns(updatedHistory, fullConfig),
    ...detectErrorPatterns(updatedHistory, currentResponse, fullConfig),
  ];

  // Calculate weighted confidence
  let totalWeight = 0;
  let weightedSum = 0;

  for (const signal of signals) {
    const effectiveWeight = signal.weight;
    totalWeight += effectiveWeight;
    weightedSum += signal.value * effectiveWeight;
  }

  const confidence = totalWeight > 0 ? weightedSum / totalWeight : 0;

  // Make decision
  const shouldStopNow = confidence >= fullConfig.confidenceThreshold;

  let recommendation: 'continue' | 'stop' | 'warn' = 'continue';
  let reason = '';

  if (shouldStopNow) {
    recommendation = 'stop';
    reason = `Confidence ${(confidence * 100).toFixed(0)}% exceeds threshold ${(fullConfig.confidenceThreshold * 100).toFixed(0)}%`;
  } else if (confidence > fullConfig.confidenceThreshold * 0.7) {
    recommendation = 'warn';
    reason = `Approaching confidence threshold (${(confidence * 100).toFixed(0)}%)`;
  } else {
    reason = `Confidence ${(confidence * 100).toFixed(0)}% below threshold`;
  }

  return {
    shouldStop: shouldStopNow,
    confidence,
    reason,
    signals,
    recommendation,
  };
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Calculate text similarity (Jaccard-like)
 */
function calculateSimilarity(text1: string, text2: string): number {
  const words1 = new Set(text1.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  const words2 = new Set(text2.toLowerCase().split(/\s+/).filter(w => w.length > 3));

  if (words1.size === 0 && words2.size === 0) return 1;
  if (words1.size === 0 || words2.size === 0) return 0;

  const intersection = new Set([...words1].filter(w => words2.has(w)));
  const union = new Set([...words1, ...words2]);

  return intersection.size / union.size;
}

/**
 * Create a history tracker for use across iterations
 */
export function createHistoryTracker(): {
  add: (iteration: number, response: string, toolCalls: string[], hasError: boolean) => void;
  getHistory: () => IterationHistory[];
  clear: () => void;
} {
  const history: IterationHistory[] = [];

  return {
    add: (iteration, response, toolCalls, hasError) => {
      history.push({
        iteration,
        response,
        toolCalls,
        hasError,
        timestamp: Date.now(),
      });
    },
    getHistory: () => [...history],
    clear: () => {
      history.length = 0;
    },
  };
}

// =============================================================================
// Export
// =============================================================================

export const confidenceStopping = {
  shouldStop,
  createHistoryTracker,
  DEFAULT_CONFIG: DEFAULT_STOPPING_CONFIG,
};
