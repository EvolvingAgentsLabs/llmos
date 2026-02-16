/**
 * Navigation Logger
 *
 * Records cycle-by-cycle execution data for debugging, replay, and analysis.
 * Each cycle captures:
 *   - Robot pose
 *   - World model state (exploration %, cell counts)
 *   - Candidates generated
 *   - LLM decision (action, fallback, explanation)
 *   - Path planning result
 *   - Timing breakdown
 *   - Success criteria progress
 *
 * Designed for:
 *   1. Post-run analysis (JSON export)
 *   2. Black-box recording for the evolution engine
 *   3. Test assertions (verify coherence, check trajectories)
 */

import type { LLMNavigationDecision, NavigationMode } from './navigation-types';
import type { PathResult } from './local-planner';
import type { Candidate } from './candidate-generator';

// =============================================================================
// Types
// =============================================================================

export interface CycleLogEntry {
  /** Cycle number */
  cycle: number;
  /** Timestamp */
  timestamp: number;

  /** Robot state */
  pose: { x: number; y: number; rotation: number };
  mode: NavigationMode;
  isStuck: boolean;
  stuckCounter: number;

  /** World model summary */
  exploration: number;
  cellCounts: {
    free: number;
    obstacle: number;
    wall: number;
    unknown: number;
    explored: number;
  };
  frontierCount: number;

  /** Candidates offered to LLM */
  candidates: Array<{
    id: string;
    type: string;
    pos_m: [number, number];
    score: number;
  }>;

  /** LLM decision */
  decision: {
    actionType: string;
    targetId?: string;
    targetM?: [number, number];
    fallback: string;
    explanation: string;
  };

  /** Path planning */
  pathResult: {
    success: boolean;
    waypointCount: number;
    pathLengthM: number;
    planningTimeMs: number;
    error?: string;
  } | null;

  /** Timing */
  cycleTimeMs: number;

  /** Goal progress */
  goalDistanceM: number | null;
  goalReached: boolean;

  /** Collision (if any occurred this cycle) */
  collision: boolean;
}

export interface NavigationRunSummary {
  /** Arena name */
  arenaName: string;
  /** Total cycles executed */
  totalCycles: number;
  /** Whether the goal was reached */
  goalReached: boolean;
  /** Cycle at which goal was reached (or -1) */
  goalReachedAtCycle: number;
  /** Total collisions */
  totalCollisions: number;
  /** Final exploration % */
  finalExploration: number;
  /** Peak stuck counter */
  peakStuckCounter: number;
  /** Total distance traveled (meters) */
  totalDistanceTraveled: number;
  /** Average cycle time (ms) */
  averageCycleTimeMs: number;
  /** Action type distribution */
  actionDistribution: Record<string, number>;
  /** Number of fallback decisions */
  fallbackCount: number;
  /** Decision coherence score (0-1) */
  coherenceScore: number;
}

// =============================================================================
// Navigation Logger
// =============================================================================

export class NavigationLogger {
  private entries: CycleLogEntry[] = [];
  private arenaName: string;
  private collisionCount: number = 0;
  private totalDistance: number = 0;
  private lastPose: { x: number; y: number } | null = null;

  constructor(arenaName: string) {
    this.arenaName = arenaName;
  }

  /**
   * Log a single cycle's data.
   */
  logCycle(entry: CycleLogEntry): void {
    // Track cumulative metrics
    if (entry.collision) {
      this.collisionCount++;
    }

    if (this.lastPose) {
      const dx = entry.pose.x - this.lastPose.x;
      const dy = entry.pose.y - this.lastPose.y;
      this.totalDistance += Math.sqrt(dx * dx + dy * dy);
    }
    this.lastPose = { x: entry.pose.x, y: entry.pose.y };

    this.entries.push(entry);
  }

  /**
   * Get all log entries.
   */
  getEntries(): CycleLogEntry[] {
    return [...this.entries];
  }

  /**
   * Get the last N entries.
   */
  getRecentEntries(n: number): CycleLogEntry[] {
    return this.entries.slice(-n);
  }

  /**
   * Get a complete run summary for evaluation.
   */
  getSummary(): NavigationRunSummary {
    const actionDist: Record<string, number> = {};
    let fallbackCount = 0;
    let coherentCount = 0;
    let peakStuck = 0;

    for (const entry of this.entries) {
      // Action distribution
      const actionType = entry.decision.actionType;
      actionDist[actionType] = (actionDist[actionType] ?? 0) + 1;

      // Fallback tracking
      if (entry.decision.explanation.startsWith('Fallback')) {
        fallbackCount++;
      }

      // Peak stuck
      if (entry.stuckCounter > peakStuck) {
        peakStuck = entry.stuckCounter;
      }

      // Coherence: check if explanation references the action type
      if (this.isCoherent(entry)) {
        coherentCount++;
      }
    }

    const goalReachedEntry = this.entries.find(e => e.goalReached);
    const lastEntry = this.entries[this.entries.length - 1];
    const avgCycleTime = this.entries.length > 0
      ? this.entries.reduce((sum, e) => sum + e.cycleTimeMs, 0) / this.entries.length
      : 0;

    return {
      arenaName: this.arenaName,
      totalCycles: this.entries.length,
      goalReached: !!goalReachedEntry,
      goalReachedAtCycle: goalReachedEntry?.cycle ?? -1,
      totalCollisions: this.collisionCount,
      finalExploration: lastEntry?.exploration ?? 0,
      peakStuckCounter: peakStuck,
      totalDistanceTraveled: Math.round(this.totalDistance * 100) / 100,
      averageCycleTimeMs: Math.round(avgCycleTime * 100) / 100,
      actionDistribution: actionDist,
      fallbackCount,
      coherenceScore: this.entries.length > 0
        ? Math.round((coherentCount / this.entries.length) * 100) / 100
        : 0,
    };
  }

  /**
   * Export log as JSON string (for file storage or debugging).
   */
  toJSON(): string {
    return JSON.stringify({
      arena: this.arenaName,
      summary: this.getSummary(),
      entries: this.entries,
    }, null, 2);
  }

  /**
   * Get the trajectory as an array of (x, y) positions.
   */
  getTrajectory(): Array<{ x: number; y: number }> {
    return this.entries.map(e => ({ x: e.pose.x, y: e.pose.y }));
  }

  /**
   * Check if the robot ever crossed a specific position.
   */
  passedNear(x: number, y: number, toleranceM: number = 0.3): boolean {
    return this.entries.some(e => {
      const dx = e.pose.x - x;
      const dy = e.pose.y - y;
      return Math.sqrt(dx * dx + dy * dy) <= toleranceM;
    });
  }

  /**
   * Reset the logger for a new run.
   */
  reset(arenaName?: string): void {
    this.entries = [];
    this.collisionCount = 0;
    this.totalDistance = 0;
    this.lastPose = null;
    if (arenaName) this.arenaName = arenaName;
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  /**
   * Basic coherence check: does the explanation loosely match the action?
   */
  private isCoherent(entry: CycleLogEntry): boolean {
    const explanation = entry.decision.explanation.toLowerCase();
    const action = entry.decision.actionType;

    // Fallbacks are inherently coherent (they explain why)
    if (explanation.includes('fallback')) return true;

    // Check action-explanation alignment
    switch (action) {
      case 'MOVE_TO':
        return explanation.includes('mov') || explanation.includes('toward') ||
               explanation.includes('goal') || explanation.includes('navigat');
      case 'EXPLORE':
        return explanation.includes('explor') || explanation.includes('frontier') ||
               explanation.includes('unknown');
      case 'ROTATE_TO':
        return explanation.includes('rotat') || explanation.includes('scan') ||
               explanation.includes('turn');
      case 'STOP':
        return explanation.includes('stop') || explanation.includes('reach') ||
               explanation.includes('goal') || explanation.includes('wait');
      case 'FOLLOW_WALL':
        return explanation.includes('wall') || explanation.includes('follow') ||
               explanation.includes('along');
      default:
        return false;
    }
  }
}
