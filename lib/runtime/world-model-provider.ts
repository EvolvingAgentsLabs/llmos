/**
 * World Model Provider
 *
 * Bridges Sprint 1/2 world model infrastructure into the DualBrainController.
 * Generates two levels of world model context:
 *
 *   1. **Compact** (for instinct brain): position + goal + top 3 candidates + last result
 *      ~200 tokens, fits in single-pass VLM context alongside camera frame
 *
 *   2. **Full** (for planner/RSA brain): all three layers serialized
 *      ~800-1200 tokens, provides complete spatial context for deep planning
 *
 * Also generates map images for multimodal input to both brains.
 *
 * Usage:
 *   const provider = new WorldModelProvider(worldModel, bridge);
 *   provider.update(robotPose, goal, actionResult);
 *   const compact = provider.getCompactSummary();   // for instinct
 *   const full = provider.getFullSummary();          // for planner
 *   const mapImg = provider.getMapImage();           // for multimodal
 */

import type WorldModel from './world-model';
import type { IWorldModelBridge, FrontierCell } from './world-model-bridge';
import { CandidateGenerator, formatCandidatesForLLM, type Candidate } from './candidate-generator';
import { MapRenderer, type RenderedMap } from './map-renderer';
import type { GridSerializationJSON, GridPatchUpdate } from './world-model-serializer';

// =============================================================================
// Types
// =============================================================================

export interface RobotPose {
  x: number;
  y: number;
  rotation: number;
}

export interface GoalInfo {
  x: number;
  y: number;
  tolerance: number;
  text: string;
}

export interface ActionResultInfo {
  action: string;
  result: 'success' | 'blocked' | 'timeout' | 'collision';
  details: string;
}

export interface WorldModelSnapshot {
  /** Compact text summary (~200 tokens) for instinct brain */
  compact: string;
  /** Full text summary (~800-1200 tokens) for planner brain */
  full: string;
  /** Rendered map image as base64 data URL */
  mapImage: string | null;
  /** Current candidates */
  candidates: Candidate[];
  /** Exploration percentage */
  exploration: number;
  /** Cell visit counts (for escalation trigger analysis) */
  visitCounts: Map<string, number>;
  /** Number of frontier cells remaining */
  frontierCount: number;
}

export interface WorldModelProviderConfig {
  /** Maximum candidates for compact summary (default: 3) */
  compactMaxCandidates: number;
  /** Maximum candidates for full summary (default: 5) */
  fullMaxCandidates: number;
  /** Whether to generate map images (default: true) */
  generateMapImages: boolean;
  /** Cell visit threshold for "looping" detection (default: 3) */
  loopingVisitThreshold: number;
  /** Exploration % above which "frontier_exhaustion" triggers (default: 0.85) */
  frontierExhaustionThreshold: number;
}

const DEFAULT_CONFIG: WorldModelProviderConfig = {
  compactMaxCandidates: 3,
  fullMaxCandidates: 5,
  generateMapImages: true,
  loopingVisitThreshold: 3,
  frontierExhaustionThreshold: 0.85,
};

// =============================================================================
// World Model Provider
// =============================================================================

export class WorldModelProvider {
  private worldModel: WorldModel;
  private bridge: IWorldModelBridge;
  private candidateGen: CandidateGenerator;
  private mapRenderer: MapRenderer;
  private config: WorldModelProviderConfig;

  // State tracked for escalation triggers
  private cellVisitCounts: Map<string, number> = new Map();
  private lastCandidates: Candidate[] = [];
  private lastMapImage: string | null = null;
  private lastExploration: number = 0;
  private lastFrontierCount: number = 0;
  private lastPose: RobotPose | null = null;
  private lastGoal: GoalInfo | null = null;
  private lastActionResult: ActionResultInfo = {
    action: 'none',
    result: 'success',
    details: 'start',
  };

  constructor(
    worldModel: WorldModel,
    bridge: IWorldModelBridge,
    config: Partial<WorldModelProviderConfig> = {}
  ) {
    this.worldModel = worldModel;
    this.bridge = bridge;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.candidateGen = new CandidateGenerator({
      maxCandidates: this.config.fullMaxCandidates,
    });
    this.mapRenderer = new MapRenderer();
  }

  // ---------------------------------------------------------------------------
  // Update (call each cycle before getting summaries)
  // ---------------------------------------------------------------------------

  /**
   * Update the provider with the current cycle state.
   * Must be called before getCompactSummary() / getFullSummary().
   */
  update(
    pose: RobotPose,
    goal: GoalInfo | null,
    actionResult?: ActionResultInfo,
    isStuck: boolean = false
  ): void {
    this.lastPose = pose;
    this.lastGoal = goal;
    if (actionResult) {
      this.lastActionResult = actionResult;
    }

    // Track cell visits for loop detection
    const cellKey = `${Math.round(pose.x * 10)},${Math.round(pose.y * 10)}`;
    this.cellVisitCounts.set(cellKey, (this.cellVisitCounts.get(cellKey) ?? 0) + 1);

    // Update bridge pose
    this.bridge.updateRobotPose(pose);

    // Generate candidates
    this.lastCandidates = this.candidateGen.generate(
      this.worldModel,
      this.bridge,
      pose,
      goal ? { x: goal.x, y: goal.y } : null,
      isStuck
    );

    // Compute exploration and frontiers
    const grid = this.worldModel.getGrid();
    let total = 0;
    let known = 0;
    for (const row of grid) {
      for (const cell of row) {
        total++;
        if (cell.state !== 'unknown') known++;
      }
    }
    this.lastExploration = total > 0 ? known / total : 0;

    const frontiers = this.bridge.findFrontiers();
    this.lastFrontierCount = frontiers.length;

    // Generate map image
    if (this.config.generateMapImages) {
      const rendered = this.mapRenderer.render(
        grid,
        (wx, wy) => this.worldModel.worldToGrid(wx, wy),
        (gx, gy) => this.worldModel.gridToWorld(gx, gy),
        {
          robotPose: pose,
          goal: goal ?? undefined,
          candidates: this.lastCandidates,
          frontiers: frontiers.slice(0, 50),
        }
      );
      this.lastMapImage = rendered.dataUrl ?? null;
    }
  }

  // ---------------------------------------------------------------------------
  // Compact Summary (instinct brain)
  // ---------------------------------------------------------------------------

  /**
   * Generate a compact world model summary for the instinct brain.
   * ~200 tokens: position, goal, top 3 candidates, last result.
   */
  getCompactSummary(): string {
    const lines: string[] = [];
    const pose = this.lastPose;
    const goal = this.lastGoal;

    // Position
    if (pose) {
      lines.push(`POS: (${pose.x.toFixed(2)}, ${pose.y.toFixed(2)}) heading ${Math.round(pose.rotation * 180 / Math.PI)}°`);
    }

    // Goal
    if (goal) {
      const dx = goal.x - (pose?.x ?? 0);
      const dy = goal.y - (pose?.y ?? 0);
      const dist = Math.sqrt(dx * dx + dy * dy);
      lines.push(`GOAL: "${goal.text}" at (${goal.x.toFixed(1)}, ${goal.y.toFixed(1)}) dist=${dist.toFixed(2)}m`);
    } else {
      lines.push('MODE: Exploration');
    }

    // Exploration progress
    lines.push(`EXPLORED: ${(this.lastExploration * 100).toFixed(0)}%`);

    // Top 3 candidates
    const top = this.lastCandidates.slice(0, this.config.compactMaxCandidates);
    if (top.length > 0) {
      lines.push('CANDIDATES:');
      for (const c of top) {
        lines.push(`  ${c.id} [${c.type}] (${c.pos_m[0].toFixed(2)}, ${c.pos_m[1].toFixed(2)}) score=${c.score.toFixed(2)}`);
      }
    }

    // Last result
    lines.push(`LAST: ${this.lastActionResult.action} → ${this.lastActionResult.result}`);

    return lines.join('\n');
  }

  // ---------------------------------------------------------------------------
  // Full Summary (planner/RSA brain)
  // ---------------------------------------------------------------------------

  /**
   * Generate a full world model summary for the planner brain.
   * ~800-1200 tokens: complete three-layer representation.
   */
  getFullSummary(): string {
    const lines: string[] = [];
    const pose = this.lastPose;
    const goal = this.lastGoal;

    // Header
    lines.push('=== WORLD MODEL (Full) ===');
    lines.push('');

    // Layer 1: Occupancy Grid
    const serialized = this.worldModel.serialize('json', pose ?? { x: 0, y: 0, rotation: 0 }, goal ? {
      x: goal.x,
      y: goal.y,
      tolerance: goal.tolerance,
    } : undefined);

    if ('occupancy_rle' in serialized) {
      const s = serialized as GridSerializationJSON;
      lines.push('GRID:');
      lines.push(`  size: ${s.grid_size[0]}x${s.grid_size[1]} @ ${s.resolution_m}m`);
      lines.push(`  exploration: ${(this.lastExploration * 100).toFixed(1)}%`);
      lines.push(`  robot: (${s.robot.pose_m[0]}, ${s.robot.pose_m[1]}) heading ${s.robot.yaw_deg}°`);
      if (s.goal) {
        lines.push(`  goal: (${s.goal.pose_m[0]}, ${s.goal.pose_m[1]}) ±${s.goal.tolerance_m}m`);
      }
      lines.push(`  occupancy: ${s.occupancy_rle}`);
    } else {
      const p = serialized as GridPatchUpdate;
      lines.push('GRID (patch):');
      lines.push(`  changes: ${p.num_changes} cells`);
      lines.push(`  exploration: ${(this.lastExploration * 100).toFixed(1)}%`);
    }
    lines.push('');

    // Layer 2: Symbolic (if SceneGraph data available — populated externally)
    // The symbolic layer is set on the NavigationLoop, not here.
    // This summary focuses on grid + candidates.

    // Layer 3: Candidates
    lines.push('CANDIDATES:');
    const candidates = this.lastCandidates.slice(0, this.config.fullMaxCandidates);
    for (const c of candidates) {
      lines.push(`  ${c.id} [${c.type}] (${c.pos_m[0].toFixed(2)}, ${c.pos_m[1].toFixed(2)}) score=${c.score.toFixed(2)} — ${c.note}`);
    }
    lines.push('');

    // State
    if (pose) {
      lines.push('STATE:');
      lines.push(`  position: (${pose.x.toFixed(2)}, ${pose.y.toFixed(2)})`);
      lines.push(`  heading: ${Math.round(pose.rotation * 180 / Math.PI)}°`);
      lines.push(`  frontiers: ${this.lastFrontierCount}`);
    }
    lines.push('');

    // Last action result
    lines.push(`LAST ACTION: ${this.lastActionResult.action} → ${this.lastActionResult.result}`);
    if (this.lastActionResult.details) {
      lines.push(`  ${this.lastActionResult.details}`);
    }

    return lines.join('\n');
  }

  // ---------------------------------------------------------------------------
  // Map Image
  // ---------------------------------------------------------------------------

  /**
   * Get the latest rendered map image (base64 data URL).
   * Returns null if map generation is disabled or no update has been called.
   */
  getMapImage(): string | null {
    return this.lastMapImage;
  }

  // ---------------------------------------------------------------------------
  // Snapshot (combined)
  // ---------------------------------------------------------------------------

  /**
   * Get a complete snapshot of the current world model state.
   */
  getSnapshot(): WorldModelSnapshot {
    return {
      compact: this.getCompactSummary(),
      full: this.getFullSummary(),
      mapImage: this.lastMapImage,
      candidates: [...this.lastCandidates],
      exploration: this.lastExploration,
      visitCounts: new Map(this.cellVisitCounts),
      frontierCount: this.lastFrontierCount,
    };
  }

  // ---------------------------------------------------------------------------
  // Escalation Trigger Analysis
  // ---------------------------------------------------------------------------

  /**
   * Check if the robot is looping (visiting the same cells repeatedly).
   * Returns true if any cell in a 3x3 area around the robot has been visited
   * more than the configured threshold.
   */
  isLooping(): boolean {
    if (!this.lastPose) return false;

    const cx = Math.round(this.lastPose.x * 10);
    const cy = Math.round(this.lastPose.y * 10);

    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const key = `${cx + dx},${cy + dy}`;
        const count = this.cellVisitCounts.get(key) ?? 0;
        if (count > this.config.loopingVisitThreshold) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Check if frontiers are exhausted (most of the arena is explored).
   * Returns true when exploration exceeds the threshold and few frontiers remain.
   */
  isFrontierExhausted(): boolean {
    return (
      this.lastExploration >= this.config.frontierExhaustionThreshold &&
      this.lastFrontierCount < 5
    );
  }

  /**
   * Get the number of times the current cell has been visited.
   */
  getCurrentCellVisitCount(): number {
    if (!this.lastPose) return 0;
    const key = `${Math.round(this.lastPose.x * 10)},${Math.round(this.lastPose.y * 10)}`;
    return this.cellVisitCounts.get(key) ?? 0;
  }

  /**
   * Get the last generated candidates.
   */
  getCandidates(): Candidate[] {
    return [...this.lastCandidates];
  }

  /**
   * Get the exploration percentage.
   */
  getExploration(): number {
    return this.lastExploration;
  }

  /**
   * Reset all tracked state (e.g., on simulation reset).
   */
  reset(): void {
    this.cellVisitCounts.clear();
    this.lastCandidates = [];
    this.lastMapImage = null;
    this.lastExploration = 0;
    this.lastFrontierCount = 0;
    this.lastPose = null;
    this.lastGoal = null;
    this.lastActionResult = { action: 'none', result: 'success', details: 'start' };
  }
}
