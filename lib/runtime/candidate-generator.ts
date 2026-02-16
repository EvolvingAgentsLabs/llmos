/**
 * Candidate Generator
 *
 * Each cycle, generates 3-5 ranked candidate subgoals for the LLM to choose from.
 * The LLM never picks raw coordinates — it selects from curated candidates
 * that the classical planner has already validated as reachable.
 *
 * Candidate types:
 *   - Goal-directed: points along the path toward the goal
 *   - Frontier: boundaries between explored and unknown (for exploration)
 *   - Recovery: safe retreat positions when stuck
 *   - Waypoint: named waypoints from the topology graph
 *
 * Scoring heuristic:
 *   score = w_goal * (1 / distance_to_goal)
 *         + w_clearance * min_clearance
 *         + w_novelty * unexplored_cells_nearby
 *         + w_feasibility * (1 / path_cost)
 */

import type WorldModel from './world-model';
import type { IWorldModelBridge, FrontierCell } from './world-model-bridge';

// =============================================================================
// Types
// =============================================================================

export interface Candidate {
  /** Unique ID for this candidate (e.g. "c1", "frontier-3") */
  id: string;
  /** Candidate type */
  type: 'subgoal' | 'frontier' | 'waypoint' | 'recovery';
  /** Position in world coordinates (meters) */
  pos_m: [number, number];
  /** Heuristic score (0-1, higher = better) */
  score: number;
  /** Human-readable note explaining why this candidate is good */
  note: string;
}

export interface CandidateGeneratorConfig {
  /** Maximum number of candidates to return (default: 5) */
  maxCandidates: number;
  /** Weight for goal-distance factor (default: 0.4) */
  wGoal: number;
  /** Weight for clearance factor (default: 0.2) */
  wClearance: number;
  /** Weight for novelty/exploration factor (default: 0.25) */
  wNovelty: number;
  /** Weight for feasibility/path-cost factor (default: 0.15) */
  wFeasibility: number;
  /** Minimum distance between candidates in meters (default: 0.5) */
  minCandidateSpacing: number;
  /** Maximum distance for recovery candidates in meters (default: 1.0) */
  recoveryRadius: number;
  /** Subgoal spacing along path to goal in meters (default: 1.0) */
  subgoalSpacing: number;
}

const DEFAULT_CONFIG: CandidateGeneratorConfig = {
  maxCandidates: 5,
  wGoal: 0.4,
  wClearance: 0.2,
  wNovelty: 0.25,
  wFeasibility: 0.15,
  minCandidateSpacing: 0.5,
  recoveryRadius: 1.0,
  subgoalSpacing: 1.0,
};

// =============================================================================
// Candidate Generator
// =============================================================================

export class CandidateGenerator {
  private config: CandidateGeneratorConfig;

  constructor(config: Partial<CandidateGeneratorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Generate ranked candidate subgoals for the current cycle.
   *
   * @param worldModel  The occupancy grid
   * @param bridge      The world model bridge (for frontier detection)
   * @param robotPose   Current robot pose (meters + radians)
   * @param goal        Goal position in meters (null for pure exploration)
   * @param isStuck     Whether the robot is currently stuck
   */
  generate(
    worldModel: WorldModel,
    bridge: IWorldModelBridge,
    robotPose: { x: number; y: number; rotation: number },
    goal: { x: number; y: number } | null,
    isStuck: boolean = false
  ): Candidate[] {
    const allCandidates: Candidate[] = [];
    let idCounter = 0;

    // 1. Goal-directed subgoals (if goal is set)
    if (goal) {
      const goalCandidates = this.generateGoalSubgoals(
        worldModel, robotPose, goal, () => `c${++idCounter}`
      );
      allCandidates.push(...goalCandidates);
    }

    // 2. Frontier candidates (exploration targets)
    const frontierCandidates = this.generateFrontierCandidates(
      worldModel, bridge, robotPose, goal, () => `f${++idCounter}`
    );
    allCandidates.push(...frontierCandidates);

    // 3. Recovery candidates (if stuck)
    if (isStuck) {
      const recoveryCandidates = this.generateRecoveryCandidates(
        worldModel, robotPose, () => `r${++idCounter}`
      );
      allCandidates.push(...recoveryCandidates);
    }

    // 4. Deduplicate candidates that are too close together
    const deduplicated = this.deduplicateCandidates(allCandidates);

    // 5. Sort by score and take top N
    deduplicated.sort((a, b) => b.score - a.score);
    return deduplicated.slice(0, this.config.maxCandidates);
  }

  // ---------------------------------------------------------------------------
  // Goal-directed subgoals
  // ---------------------------------------------------------------------------

  /**
   * Generate subgoals along the straight-line path to the goal.
   * Places waypoints every ~1m along the path, scoring each by
   * distance to goal and clearance from obstacles.
   */
  private generateGoalSubgoals(
    worldModel: WorldModel,
    robotPose: { x: number; y: number },
    goal: { x: number; y: number },
    nextId: () => string
  ): Candidate[] {
    const candidates: Candidate[] = [];
    const dx = goal.x - robotPose.x;
    const dy = goal.y - robotPose.y;
    const totalDist = Math.sqrt(dx * dx + dy * dy);

    if (totalDist < 0.3) {
      // Already at goal
      candidates.push({
        id: nextId(),
        type: 'subgoal',
        pos_m: [Math.round(goal.x * 100) / 100, Math.round(goal.y * 100) / 100],
        score: 1.0,
        note: 'goal reached — within tolerance',
      });
      return candidates;
    }

    // Unit direction vector
    const ux = dx / totalDist;
    const uy = dy / totalDist;

    // Place subgoals every subgoalSpacing meters
    const spacing = this.config.subgoalSpacing;
    const numSubgoals = Math.max(1, Math.floor(totalDist / spacing));

    for (let i = 1; i <= numSubgoals && i <= 3; i++) {
      const dist = i * spacing;
      const sx = robotPose.x + ux * dist;
      const sy = robotPose.y + uy * dist;

      // Score: closer to goal = higher score
      const goalFactor = 1 - (totalDist - dist) / totalDist;
      const clearance = this.computeClearance(worldModel, sx, sy);
      const novelty = this.computeNovelty(worldModel, sx, sy);

      const score =
        this.config.wGoal * goalFactor +
        this.config.wClearance * clearance +
        this.config.wNovelty * novelty +
        this.config.wFeasibility * (clearance > 0 ? 1 : 0);

      const distToGoal = totalDist - dist;
      candidates.push({
        id: nextId(),
        type: 'subgoal',
        pos_m: [Math.round(sx * 100) / 100, Math.round(sy * 100) / 100],
        score: Math.min(1, Math.max(0, score)),
        note: `${dist.toFixed(1)}m toward goal (${distToGoal.toFixed(1)}m remaining)` +
              (clearance > 0.3 ? ', wide clearance' : ''),
      });
    }

    // Always include the goal itself as a candidate
    const goalClearance = this.computeClearance(worldModel, goal.x, goal.y);
    candidates.push({
      id: nextId(),
      type: 'subgoal',
      pos_m: [Math.round(goal.x * 100) / 100, Math.round(goal.y * 100) / 100],
      score: goalClearance > 0 ? 0.9 : 0.3,
      note: `goal position (${totalDist.toFixed(1)}m away)` +
            (goalClearance <= 0 ? ' — may be blocked' : ''),
    });

    return candidates;
  }

  // ---------------------------------------------------------------------------
  // Frontier candidates
  // ---------------------------------------------------------------------------

  /**
   * Generate candidates from frontier cells (exploration targets).
   * Groups nearby frontier cells into clusters and picks the best from each.
   */
  private generateFrontierCandidates(
    worldModel: WorldModel,
    bridge: IWorldModelBridge,
    robotPose: { x: number; y: number },
    goal: { x: number; y: number } | null,
    nextId: () => string
  ): Candidate[] {
    const frontiers = bridge.findFrontiers();
    if (frontiers.length === 0) return [];

    // Cluster frontiers by proximity
    const clusters = this.clusterFrontiers(frontiers, 0.5); // 0.5m clustering radius

    const candidates: Candidate[] = [];
    for (const cluster of clusters.slice(0, 3)) {
      // Pick the centroid of the cluster
      const cx = cluster.reduce((s, f) => s + f.wx, 0) / cluster.length;
      const cy = cluster.reduce((s, f) => s + f.wy, 0) / cluster.length;

      const distFromRobot = Math.sqrt(
        (cx - robotPose.x) ** 2 + (cy - robotPose.y) ** 2
      );

      // Score based on cluster size (novelty) and distance
      const noveltyFactor = Math.min(1, cluster.length / 10);
      const feasibilityFactor = distFromRobot < 3.0 ? 1 - distFromRobot / 5 : 0.1;

      // If there's a goal, frontiers toward the goal score higher
      let goalAlignment = 0;
      if (goal) {
        const toGoalX = goal.x - robotPose.x;
        const toGoalY = goal.y - robotPose.y;
        const toFrontierX = cx - robotPose.x;
        const toFrontierY = cy - robotPose.y;
        const dot = toGoalX * toFrontierX + toGoalY * toFrontierY;
        const mag = Math.sqrt(toGoalX ** 2 + toGoalY ** 2) *
                    Math.sqrt(toFrontierX ** 2 + toFrontierY ** 2);
        goalAlignment = mag > 0 ? Math.max(0, dot / mag) : 0;
      }

      const score =
        this.config.wNovelty * noveltyFactor +
        this.config.wFeasibility * feasibilityFactor +
        this.config.wGoal * goalAlignment * 0.5;

      candidates.push({
        id: nextId(),
        type: 'frontier',
        pos_m: [Math.round(cx * 100) / 100, Math.round(cy * 100) / 100],
        score: Math.min(1, Math.max(0, score)),
        note: `explore unknown (${cluster.length} frontier cells, ${distFromRobot.toFixed(1)}m away)`,
      });
    }

    return candidates;
  }

  // ---------------------------------------------------------------------------
  // Recovery candidates
  // ---------------------------------------------------------------------------

  /**
   * Generate safe retreat positions when the robot is stuck.
   * Looks for free cells in a radius around the robot, preferring
   * cells the robot hasn't visited many times.
   */
  private generateRecoveryCandidates(
    worldModel: WorldModel,
    robotPose: { x: number; y: number },
    nextId: () => string
  ): Candidate[] {
    const grid = worldModel.getGrid();
    const dims = worldModel.getGridDimensions();
    const config = worldModel.getWorldConfig();
    const cellSize = config.gridResolution / 100;
    const radiusCells = Math.ceil(this.config.recoveryRadius / cellSize);

    const robotGrid = worldModel.worldToGrid(robotPose.x, robotPose.y);
    const candidates: Array<{
      gx: number; gy: number;
      wx: number; wy: number;
      clearance: number;
      visitCount: number;
    }> = [];

    // Scan cells in a ring around the robot
    for (let dy = -radiusCells; dy <= radiusCells; dy++) {
      for (let dx = -radiusCells; dx <= radiusCells; dx++) {
        const dist = Math.sqrt(dx * dx + dy * dy);
        // Only cells in a ring (not too close, not too far)
        if (dist < 3 || dist > radiusCells) continue;

        const gx = robotGrid.gx + dx;
        const gy = robotGrid.gy + dy;

        if (!worldModel.isValidGridCoord(gx, gy)) continue;

        const cell = grid[gy][gx];
        if (cell.state !== 'free' && cell.state !== 'explored') continue;

        const { x: wx, y: wy } = worldModel.gridToWorld(gx, gy);
        const clearance = this.computeClearance(worldModel, wx, wy);

        if (clearance > 0.1) {
          candidates.push({
            gx, gy, wx, wy, clearance,
            visitCount: cell.visitCount,
          });
        }
      }
    }

    // Sort by clearance (descending), then by visit count (ascending)
    candidates.sort((a, b) => {
      if (Math.abs(a.clearance - b.clearance) > 0.1) return b.clearance - a.clearance;
      return a.visitCount - b.visitCount;
    });

    // Take top 2 recovery candidates
    const result: Candidate[] = [];
    for (const c of candidates.slice(0, 2)) {
      const dist = Math.sqrt(
        (c.wx - robotPose.x) ** 2 + (c.wy - robotPose.y) ** 2
      );
      result.push({
        id: nextId(),
        type: 'recovery',
        pos_m: [Math.round(c.wx * 100) / 100, Math.round(c.wy * 100) / 100],
        score: 0.6 + c.clearance * 0.3 - c.visitCount * 0.02,
        note: `safe retreat (${dist.toFixed(1)}m, clearance ${c.clearance.toFixed(1)}m, visited ${c.visitCount}x)`,
      });
    }

    return result;
  }

  // ---------------------------------------------------------------------------
  // Scoring helpers
  // ---------------------------------------------------------------------------

  /**
   * Compute minimum clearance from obstacles at a position.
   * Returns the distance (in meters) to the nearest obstacle/wall cell.
   * Returns 0 if the position itself is an obstacle.
   */
  private computeClearance(worldModel: WorldModel, wx: number, wy: number): number {
    const grid = worldModel.getGrid();
    const dims = worldModel.getGridDimensions();
    const { gx, gy } = worldModel.worldToGrid(wx, wy);

    if (!worldModel.isValidGridCoord(gx, gy)) return 0;

    const cell = grid[gy][gx];
    if (cell.state === 'obstacle' || cell.state === 'wall') return 0;

    const config = worldModel.getWorldConfig();
    const cellSize = config.gridResolution / 100;

    // Check expanding rings up to 5 cells out
    for (let ring = 1; ring <= 5; ring++) {
      for (let dy = -ring; dy <= ring; dy++) {
        for (let dx = -ring; dx <= ring; dx++) {
          // Only check the perimeter of the ring
          if (Math.abs(dx) !== ring && Math.abs(dy) !== ring) continue;

          const nx = gx + dx;
          const ny = gy + dy;
          if (nx < 0 || nx >= dims.width || ny < 0 || ny >= dims.height) continue;

          const neighbor = grid[ny][nx];
          if (neighbor.state === 'obstacle' || neighbor.state === 'wall') {
            return ring * cellSize;
          }
        }
      }
    }

    // No obstacle within 5 cells
    return 5 * cellSize;
  }

  /**
   * Compute novelty score at a position.
   * Higher values mean more unknown cells nearby (good for exploration).
   */
  private computeNovelty(worldModel: WorldModel, wx: number, wy: number): number {
    const grid = worldModel.getGrid();
    const dims = worldModel.getGridDimensions();
    const { gx, gy } = worldModel.worldToGrid(wx, wy);

    if (!worldModel.isValidGridCoord(gx, gy)) return 0;

    let unknownCount = 0;
    let totalChecked = 0;
    const radius = 3; // Check 3 cells in each direction

    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const nx = gx + dx;
        const ny = gy + dy;
        if (nx < 0 || nx >= dims.width || ny < 0 || ny >= dims.height) continue;

        totalChecked++;
        if (grid[ny][nx].state === 'unknown') unknownCount++;
      }
    }

    return totalChecked > 0 ? unknownCount / totalChecked : 0;
  }

  // ---------------------------------------------------------------------------
  // Utilities
  // ---------------------------------------------------------------------------

  /**
   * Simple grid-based clustering of frontier cells.
   */
  private clusterFrontiers(frontiers: FrontierCell[], radius: number): FrontierCell[][] {
    const clusters: FrontierCell[][] = [];
    const assigned = new Set<number>();

    for (let i = 0; i < frontiers.length; i++) {
      if (assigned.has(i)) continue;

      const cluster: FrontierCell[] = [frontiers[i]];
      assigned.add(i);

      for (let j = i + 1; j < frontiers.length; j++) {
        if (assigned.has(j)) continue;

        const dist = Math.sqrt(
          (frontiers[i].wx - frontiers[j].wx) ** 2 +
          (frontiers[i].wy - frontiers[j].wy) ** 2
        );

        if (dist <= radius) {
          cluster.push(frontiers[j]);
          assigned.add(j);
        }
      }

      clusters.push(cluster);
    }

    // Sort clusters by size (largest first)
    clusters.sort((a, b) => b.length - a.length);
    return clusters;
  }

  /**
   * Remove candidates that are too close together.
   * Keeps the higher-scored candidate of any pair within minCandidateSpacing.
   */
  private deduplicateCandidates(candidates: Candidate[]): Candidate[] {
    // Sort by score descending so we keep the best ones
    const sorted = [...candidates].sort((a, b) => b.score - a.score);
    const result: Candidate[] = [];

    for (const candidate of sorted) {
      const tooClose = result.some(existing => {
        const dist = Math.sqrt(
          (existing.pos_m[0] - candidate.pos_m[0]) ** 2 +
          (existing.pos_m[1] - candidate.pos_m[1]) ** 2
        );
        return dist < this.config.minCandidateSpacing;
      });

      if (!tooClose) {
        result.push(candidate);
      }
    }

    return result;
  }
}

// =============================================================================
// Serialization for LLM
// =============================================================================

/**
 * Format candidates for inclusion in the LLM's execution frame.
 * This is Layer 3 of the hybrid world representation.
 */
export function formatCandidatesForLLM(
  candidates: Candidate[],
  lastAction?: { action: string; result: 'success' | 'blocked' | 'timeout' | 'collision'; details: string }
): object {
  return {
    candidates: candidates.map(c => ({
      id: c.id,
      type: c.type,
      pos_m: c.pos_m,
      score: Math.round(c.score * 100) / 100,
      note: c.note,
    })),
    last_step: lastAction ?? {
      action: 'none',
      result: 'success',
      details: 'first cycle',
    },
  };
}
