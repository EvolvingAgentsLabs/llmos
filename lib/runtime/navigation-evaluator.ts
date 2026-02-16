/**
 * Navigation Evaluator
 *
 * Evaluates navigation run results against success criteria.
 * Takes a NavigationRunSummary from the logger and a SuccessCriteria
 * from the test arena, and produces a structured pass/fail report.
 *
 * Criteria evaluated:
 *   1. Goal reached (if applicable)
 *   2. Collision count
 *   3. Exploration coverage
 *   4. Decision coherence
 *   5. Cycle limit
 *   6. Stuck recovery
 */

import type { NavigationRunSummary } from './navigation-logger';
import type { SuccessCriteria } from './test-arenas';

// =============================================================================
// Types
// =============================================================================

export interface CriterionResult {
  /** Criterion name */
  name: string;
  /** Whether this criterion passed */
  passed: boolean;
  /** Actual value */
  actual: string;
  /** Expected/threshold value */
  expected: string;
  /** Human-readable detail */
  detail: string;
}

export interface EvaluationResult {
  /** Arena name */
  arenaName: string;
  /** Overall pass/fail */
  passed: boolean;
  /** Number of criteria passed */
  passedCount: number;
  /** Total number of criteria checked */
  totalCount: number;
  /** Individual criterion results */
  criteria: CriterionResult[];
  /** The run summary that was evaluated */
  summary: NavigationRunSummary;
}

// =============================================================================
// Evaluator
// =============================================================================

/**
 * Evaluate a navigation run against success criteria.
 */
export function evaluateRun(
  summary: NavigationRunSummary,
  criteria: SuccessCriteria,
  hasGoal: boolean
): EvaluationResult {
  const results: CriterionResult[] = [];

  // 1. Goal reached (only if there was a goal)
  if (hasGoal) {
    results.push({
      name: 'Goal Reached',
      passed: summary.goalReached,
      actual: summary.goalReached
        ? `Reached at cycle ${summary.goalReachedAtCycle}`
        : 'Not reached',
      expected: `Within ${criteria.goalToleranceM}m`,
      detail: summary.goalReached
        ? `Goal reached successfully at cycle ${summary.goalReachedAtCycle} of ${summary.totalCycles}`
        : `Failed to reach goal within ${summary.totalCycles} cycles`,
    });
  }

  // 2. Collisions
  const collisionsPassed = summary.totalCollisions <= criteria.maxCollisions;
  results.push({
    name: 'Collisions',
    passed: collisionsPassed,
    actual: `${summary.totalCollisions} collisions`,
    expected: `<= ${criteria.maxCollisions}`,
    detail: collisionsPassed
      ? `Zero collisions maintained throughout the run`
      : `${summary.totalCollisions} collision(s) detected — exceeds maximum of ${criteria.maxCollisions}`,
  });

  // 3. Exploration coverage (only if required)
  if (criteria.minExploration > 0) {
    const explorationPassed = summary.finalExploration >= criteria.minExploration;
    results.push({
      name: 'Exploration Coverage',
      passed: explorationPassed,
      actual: `${(summary.finalExploration * 100).toFixed(1)}%`,
      expected: `>= ${(criteria.minExploration * 100).toFixed(1)}%`,
      detail: explorationPassed
        ? `Explored ${(summary.finalExploration * 100).toFixed(1)}% of the arena`
        : `Only explored ${(summary.finalExploration * 100).toFixed(1)}%, needed ${(criteria.minExploration * 100).toFixed(1)}%`,
    });
  }

  // 4. Cycle limit
  const cyclePassed = summary.totalCycles <= criteria.maxCycles;
  results.push({
    name: 'Cycle Limit',
    passed: cyclePassed,
    actual: `${summary.totalCycles} cycles`,
    expected: `<= ${criteria.maxCycles}`,
    detail: cyclePassed
      ? `Completed within cycle budget`
      : `Exceeded cycle limit (${summary.totalCycles} > ${criteria.maxCycles})`,
  });

  // 5. Stuck recovery
  const stuckPassed = summary.peakStuckCounter <= criteria.maxStuckCounter;
  results.push({
    name: 'Stuck Recovery',
    passed: stuckPassed,
    actual: `Peak stuck: ${summary.peakStuckCounter}`,
    expected: `<= ${criteria.maxStuckCounter}`,
    detail: stuckPassed
      ? `Recovered from stuck states (peak: ${summary.peakStuckCounter})`
      : `Stuck counter reached ${summary.peakStuckCounter}, exceeding threshold of ${criteria.maxStuckCounter}`,
  });

  // 6. Decision coherence (soft criterion — warn but don't fail below 0.5)
  const coherencePassed = summary.coherenceScore >= 0.5;
  results.push({
    name: 'Decision Coherence',
    passed: coherencePassed,
    actual: `${(summary.coherenceScore * 100).toFixed(0)}%`,
    expected: '>= 50%',
    detail: coherencePassed
      ? `${(summary.coherenceScore * 100).toFixed(0)}% of decisions had coherent explanations`
      : `Only ${(summary.coherenceScore * 100).toFixed(0)}% coherent — LLM explanations don't match actions`,
  });

  // 7. Distance efficiency (if goal was reached)
  if (hasGoal && summary.goalReached) {
    // Don't fail on this, just report it
    results.push({
      name: 'Path Efficiency',
      passed: true, // Informational only
      actual: `${summary.totalDistanceTraveled}m traveled`,
      expected: 'N/A (informational)',
      detail: `Traveled ${summary.totalDistanceTraveled}m over ${summary.goalReachedAtCycle} cycles`,
    });
  }

  const passedCount = results.filter(r => r.passed).length;

  return {
    arenaName: summary.arenaName,
    passed: results.every(r => r.passed),
    passedCount,
    totalCount: results.length,
    criteria: results,
    summary,
  };
}

/**
 * Format evaluation result as a human-readable report.
 */
export function formatEvaluationReport(result: EvaluationResult): string {
  const lines: string[] = [];
  const status = result.passed ? 'PASS' : 'FAIL';

  lines.push(`=== ${result.arenaName} — ${status} (${result.passedCount}/${result.totalCount}) ===`);
  lines.push('');

  for (const criterion of result.criteria) {
    const icon = criterion.passed ? '+' : '-';
    lines.push(`  [${icon}] ${criterion.name}: ${criterion.actual} (expected: ${criterion.expected})`);
    lines.push(`      ${criterion.detail}`);
  }

  lines.push('');
  lines.push(`  Actions: ${JSON.stringify(result.summary.actionDistribution)}`);
  lines.push(`  Fallbacks: ${result.summary.fallbackCount}`);
  lines.push(`  Avg cycle time: ${result.summary.averageCycleTimeMs}ms`);

  return lines.join('\n');
}
