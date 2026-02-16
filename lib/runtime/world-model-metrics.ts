/**
 * World Model Metrics
 *
 * Compares a sensor-based world model against a ground-truth world model
 * to measure accuracy, and evaluates decision quality over time.
 *
 * Two categories of metrics:
 *
 *   1. **Grid Accuracy** — How well does the sensor-built grid match ground truth?
 *      - Cell accuracy: % of cells with matching state
 *      - Obstacle recall: % of true obstacles detected
 *      - Obstacle precision: % of sensor-detected obstacles that are real
 *      - False positive rate: sensor sees obstacle where there is none
 *      - False negative rate: sensor misses real obstacle
 *
 *   2. **Decision Quality** — How well is the navigation stack performing?
 *      - Goal convergence: is distance to goal decreasing over time?
 *      - Action diversity: distribution entropy of action types
 *      - Stuck recovery rate: % of stuck episodes resolved within N cycles
 *      - Path efficiency: ratio of straight-line distance to actual distance
 */

import type WorldModel from './world-model';
import type { CellState } from './world-model';
import type { NavigationRunSummary } from './navigation-logger';

// =============================================================================
// Types
// =============================================================================

export interface GridAccuracyMetrics {
  /** % of cells with matching state (0-1) */
  cellAccuracy: number;
  /** % of true obstacles detected by sensor (0-1) */
  obstacleRecall: number;
  /** % of sensor-detected obstacles that are real (0-1) */
  obstaclePrecision: number;
  /** False positive rate for obstacles (0-1) */
  falsePositiveRate: number;
  /** False negative rate for obstacles (0-1) */
  falseNegativeRate: number;
  /** Total cells compared */
  totalCells: number;
  /** Cells where states match */
  matchingCells: number;
  /** Breakdown by cell state */
  stateBreakdown: Record<string, { correct: number; total: number }>;
}

export interface DecisionQualityMetrics {
  /** Whether goal distance is decreasing (averaged over last N cycles) */
  goalConvergence: number;
  /** Shannon entropy of action distribution (higher = more diverse) */
  actionDiversity: number;
  /** Ratio of straight-line to actual distance (1.0 = perfect, <1.0 = inefficient) */
  pathEfficiency: number;
  /** % of stuck episodes recovered within budget */
  stuckRecoveryRate: number;
  /** Average cycles per stuck episode */
  avgStuckDuration: number;
}

// =============================================================================
// Grid Accuracy Comparison
// =============================================================================

/** States that count as "solid" for obstacle detection metrics */
const SOLID_STATES: Set<CellState> = new Set(['obstacle', 'wall']);

/** States that count as "passable" for accuracy metrics */
const PASSABLE_STATES: Set<CellState> = new Set(['free', 'explored', 'path', 'collectible', 'collected']);

/**
 * Compare a sensor-built grid against a ground-truth grid.
 * Both grids must have the same dimensions.
 *
 * Cells that are 'unknown' in the sensor grid are excluded from accuracy
 * calculations (the sensor hasn't observed them yet).
 */
export function compareGrids(
  sensorModel: WorldModel,
  truthModel: WorldModel
): GridAccuracyMetrics {
  const sensorGrid = sensorModel.getGrid();
  const truthGrid = truthModel.getGrid();
  const sDims = sensorModel.getGridDimensions();
  const tDims = truthModel.getGridDimensions();

  if (sDims.width !== tDims.width || sDims.height !== tDims.height) {
    throw new Error(
      `Grid dimensions mismatch: sensor=${sDims.width}x${sDims.height} truth=${tDims.width}x${tDims.height}`
    );
  }

  let totalCompared = 0;
  let matching = 0;

  // Obstacle detection counters
  let truePositives = 0;   // sensor=solid, truth=solid
  let falsePositives = 0;  // sensor=solid, truth=passable
  let falseNegatives = 0;  // sensor=passable, truth=solid
  let trueNegatives = 0;   // sensor=passable, truth=passable

  const stateBreakdown: Record<string, { correct: number; total: number }> = {};

  for (let gy = 0; gy < sDims.height; gy++) {
    for (let gx = 0; gx < sDims.width; gx++) {
      const sCell = sensorGrid[gy][gx];
      const tCell = truthGrid[gy][gx];

      // Skip cells the sensor hasn't observed
      if (sCell.state === 'unknown') continue;
      // Skip cells the truth hasn't defined (should be rare)
      if (tCell.state === 'unknown') continue;

      totalCompared++;

      // State match (with equivalence classes)
      const sensorSolid = SOLID_STATES.has(sCell.state);
      const truthSolid = SOLID_STATES.has(tCell.state);
      const sensorPassable = PASSABLE_STATES.has(sCell.state);
      const truthPassable = PASSABLE_STATES.has(tCell.state);

      // Exact state match or equivalent class match
      const match = sCell.state === tCell.state ||
        (sensorSolid && truthSolid) ||
        (sensorPassable && truthPassable);

      if (match) matching++;

      // Obstacle detection metrics
      if (sensorSolid && truthSolid) truePositives++;
      else if (sensorSolid && truthPassable) falsePositives++;
      else if (sensorPassable && truthSolid) falseNegatives++;
      else if (sensorPassable && truthPassable) trueNegatives++;

      // Per-state breakdown (by truth state)
      const truthState = tCell.state;
      if (!stateBreakdown[truthState]) {
        stateBreakdown[truthState] = { correct: 0, total: 0 };
      }
      stateBreakdown[truthState].total++;
      if (match) stateBreakdown[truthState].correct++;
    }
  }

  const totalSolid = truePositives + falseNegatives;
  const totalDetected = truePositives + falsePositives;
  const totalPassable = trueNegatives + falsePositives;

  return {
    cellAccuracy: totalCompared > 0 ? matching / totalCompared : 0,
    obstacleRecall: totalSolid > 0 ? truePositives / totalSolid : 1,
    obstaclePrecision: totalDetected > 0 ? truePositives / totalDetected : 1,
    falsePositiveRate: totalPassable > 0 ? falsePositives / totalPassable : 0,
    falseNegativeRate: totalSolid > 0 ? falseNegatives / totalSolid : 0,
    totalCells: totalCompared,
    matchingCells: matching,
    stateBreakdown,
  };
}

// =============================================================================
// Decision Quality Metrics
// =============================================================================

/**
 * Compute decision quality metrics from a navigation run summary.
 */
export function computeDecisionQuality(
  summary: NavigationRunSummary,
  goalDistance?: { initial: number; final: number },
  stuckEpisodes?: Array<{ startCycle: number; endCycle: number; recovered: boolean }>
): DecisionQualityMetrics {
  // Goal convergence: ratio of distance reduction
  let goalConvergence = 0;
  if (goalDistance && goalDistance.initial > 0) {
    goalConvergence = 1 - (goalDistance.final / goalDistance.initial);
    // Clamp to [-1, 1]: positive = converging, negative = diverging
    goalConvergence = Math.max(-1, Math.min(1, goalConvergence));
  }

  // Action diversity: Shannon entropy of distribution
  const total = Object.values(summary.actionDistribution).reduce((s, n) => s + n, 0);
  let entropy = 0;
  if (total > 0) {
    for (const count of Object.values(summary.actionDistribution)) {
      if (count > 0) {
        const p = count / total;
        entropy -= p * Math.log2(p);
      }
    }
  }
  // Normalize by log2(numActionTypes) to get 0-1 range
  const numTypes = Object.keys(summary.actionDistribution).length;
  const maxEntropy = numTypes > 1 ? Math.log2(numTypes) : 1;
  const actionDiversity = maxEntropy > 0 ? entropy / maxEntropy : 0;

  // Path efficiency
  let pathEfficiency = 0;
  if (goalDistance && summary.goalReached && summary.totalDistanceTraveled > 0) {
    pathEfficiency = goalDistance.initial / summary.totalDistanceTraveled;
    pathEfficiency = Math.min(1, pathEfficiency); // Cap at 1.0
  }

  // Stuck recovery
  let stuckRecoveryRate = 1;
  let avgStuckDuration = 0;
  if (stuckEpisodes && stuckEpisodes.length > 0) {
    const recovered = stuckEpisodes.filter(e => e.recovered).length;
    stuckRecoveryRate = recovered / stuckEpisodes.length;
    avgStuckDuration = stuckEpisodes.reduce(
      (sum, e) => sum + (e.endCycle - e.startCycle), 0
    ) / stuckEpisodes.length;
  }

  return {
    goalConvergence: Math.round(goalConvergence * 1000) / 1000,
    actionDiversity: Math.round(actionDiversity * 1000) / 1000,
    pathEfficiency: Math.round(pathEfficiency * 1000) / 1000,
    stuckRecoveryRate: Math.round(stuckRecoveryRate * 1000) / 1000,
    avgStuckDuration: Math.round(avgStuckDuration * 100) / 100,
  };
}

// =============================================================================
// Report Formatting
// =============================================================================

/**
 * Format grid accuracy metrics as a human-readable report.
 */
export function formatAccuracyReport(metrics: GridAccuracyMetrics): string {
  const lines: string[] = [];
  lines.push('=== Grid Accuracy Report ===');
  lines.push(`  Cell accuracy:       ${(metrics.cellAccuracy * 100).toFixed(1)}% (${metrics.matchingCells}/${metrics.totalCells})`);
  lines.push(`  Obstacle recall:     ${(metrics.obstacleRecall * 100).toFixed(1)}%`);
  lines.push(`  Obstacle precision:  ${(metrics.obstaclePrecision * 100).toFixed(1)}%`);
  lines.push(`  False positive rate: ${(metrics.falsePositiveRate * 100).toFixed(1)}%`);
  lines.push(`  False negative rate: ${(metrics.falseNegativeRate * 100).toFixed(1)}%`);
  lines.push('');
  lines.push('  Per-state breakdown:');
  for (const [state, counts] of Object.entries(metrics.stateBreakdown)) {
    const pct = counts.total > 0 ? (counts.correct / counts.total * 100).toFixed(1) : 'N/A';
    lines.push(`    ${state}: ${pct}% (${counts.correct}/${counts.total})`);
  }
  return lines.join('\n');
}

/**
 * Format decision quality metrics as a human-readable report.
 */
export function formatDecisionReport(metrics: DecisionQualityMetrics): string {
  const lines: string[] = [];
  lines.push('=== Decision Quality Report ===');
  lines.push(`  Goal convergence:    ${(metrics.goalConvergence * 100).toFixed(1)}%`);
  lines.push(`  Action diversity:    ${(metrics.actionDiversity * 100).toFixed(1)}%`);
  lines.push(`  Path efficiency:     ${(metrics.pathEfficiency * 100).toFixed(1)}%`);
  lines.push(`  Stuck recovery rate: ${(metrics.stuckRecoveryRate * 100).toFixed(1)}%`);
  lines.push(`  Avg stuck duration:  ${metrics.avgStuckDuration} cycles`);
  return lines.join('\n');
}
