/**
 * Navigation Runtime
 *
 * Wires together all navigation components into a runnable system:
 *
 *   Arena Config → Bridge → WorldModel → NavigationLoop → LLM → Planner
 *     → Physics Simulation → Logger → Evaluator → Report
 *
 * This is the top-level entry point for running a navigation session.
 * Supports two modes:
 *
 *   1. **Simulation mode**: Uses ground-truth WorldModelBridge with
 *      lightweight physics (move toward waypoints, check collisions).
 *      Runs in Node.js without WASM or Three.js.
 *
 *   2. **Camera mode**: Uses VisionWorldModelBridge with VLM-processed
 *      camera frames. For real hardware or advanced simulation.
 *
 * Usage:
 * ```typescript
 * const runtime = new NavigationRuntime(ARENA_SIMPLE_NAVIGATION, infer);
 * const result = await runtime.run();
 * console.log(formatEvaluationReport(result.evaluation));
 * ```
 */

import { WorldModelBridge, type IWorldModelBridge } from './world-model-bridge';
import { VisionWorldModelBridge } from './sensor-bridge';
import { GroundTruthVisionSimulator } from './vision-simulator';
import { NavigationLoop, type InferenceFunction, type CycleResult } from './navigation-loop';
import { NavigationLogger, type CycleLogEntry, type NavigationRunSummary } from './navigation-logger';
import { evaluateRun, formatEvaluationReport, type EvaluationResult } from './navigation-evaluator';
import { type TestArenaConfig } from './test-arenas';
import type { PathWaypoint } from './local-planner';

// =============================================================================
// Types
// =============================================================================

export interface NavigationRuntimeConfig {
  /** Bridge mode: 'ground-truth' rasterizes full arena, 'vision' builds grid incrementally from simulated camera (default: 'ground-truth') */
  bridgeMode: 'ground-truth' | 'vision';
  /** Movement speed per cycle in meters (default: 0.3) */
  moveStepM: number;
  /** Collision check radius in meters (default: 0.15) */
  collisionRadiusM: number;
  /** Bridge inflation cells (default: 0 for simplicity) */
  inflationCells: number;
  /** Whether to generate map images (default: false in Node.js) */
  generateMapImages: boolean;
  /** Callback for each cycle (for live monitoring) */
  onCycle?: (cycle: number, result: CycleResult, entry: CycleLogEntry) => void;
  /** Callback when run completes */
  onComplete?: (result: NavigationRunResult) => void;
}

export interface NavigationRunResult {
  /** The evaluation result (pass/fail + criteria) */
  evaluation: EvaluationResult;
  /** The full run summary */
  summary: NavigationRunSummary;
  /** All log entries (cycle-by-cycle) */
  entries: CycleLogEntry[];
  /** Total wall-clock time (ms) */
  totalTimeMs: number;
  /** Human-readable report */
  report: string;
}

const DEFAULT_RUNTIME_CONFIG: NavigationRuntimeConfig = {
  bridgeMode: 'ground-truth',
  moveStepM: 0.3,
  collisionRadiusM: 0.15,
  inflationCells: 0,
  generateMapImages: false,
};

// =============================================================================
// Navigation Runtime
// =============================================================================

export class NavigationRuntime {
  private arena: TestArenaConfig;
  private infer: InferenceFunction;
  private config: NavigationRuntimeConfig;

  constructor(
    arena: TestArenaConfig,
    infer: InferenceFunction,
    config: Partial<NavigationRuntimeConfig> = {}
  ) {
    this.arena = arena;
    this.infer = infer;
    this.config = { ...DEFAULT_RUNTIME_CONFIG, ...config };
  }

  /**
   * Run a complete navigation session.
   * Returns when the goal is reached, cycle limit hit, or an error occurs.
   */
  async run(): Promise<NavigationRunResult> {
    const startTime = performance.now();

    // Create a unique device ID to avoid singleton conflicts
    const deviceId = `runtime-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    // Set up bridge based on mode
    let bridge: IWorldModelBridge;
    let visionSim: GroundTruthVisionSimulator | null = null;
    let visionBridge: VisionWorldModelBridge | null = null;

    if (this.config.bridgeMode === 'vision') {
      // Vision mode: build grid incrementally from simulated camera
      visionBridge = new VisionWorldModelBridge({ deviceId });
      visionSim = new GroundTruthVisionSimulator(this.arena.world);
      bridge = visionBridge;
    } else {
      // Ground-truth mode: rasterize full arena at start
      const gtBridge = new WorldModelBridge({
        deviceId,
        inflationCells: this.config.inflationCells,
      });
      gtBridge.rasterize(this.arena.world);
      bridge = gtBridge;
    }

    const loop = new NavigationLoop(bridge, this.infer, {
      maxCycles: this.arena.criteria.maxCycles,
      goalToleranceM: this.arena.criteria.goalToleranceM,
      generateMapImages: this.config.generateMapImages,
      // Vision mode: heavily penalize unknown cells so planner prefers known-free paths
      unknownCellCost: this.config.bridgeMode === 'vision' ? 50 : 5,
    });

    const logger = new NavigationLogger(this.arena.name);

    // Set initial pose
    const pose = { ...this.arena.startPose };
    loop.updatePose(pose.x, pose.y, pose.rotation);

    // Set goal or exploration mode
    if (this.arena.goal) {
      loop.setGoal(this.arena.goal.x, this.arena.goal.y, this.arena.goal.text);
    } else {
      loop.setExplorationMode();
    }

    // Vision mode: initial 360° scan to build awareness before navigating
    if (visionSim && visionBridge) {
      const scanSteps = 6; // 6 rotations × 60° FOV = 360° coverage
      const scanRotation = (2 * Math.PI) / scanSteps;
      const savedRotation = pose.rotation;
      for (let i = 0; i < scanSteps; i++) {
        pose.rotation = savedRotation + i * scanRotation;
        const frame = visionSim.generateFrame(pose);
        visionBridge.updateFromVision(pose, frame);
      }
      pose.rotation = savedRotation; // Restore original heading
      loop.updatePose(pose.x, pose.y, pose.rotation);
    }

    // Run cycles
    const maxCycles = this.arena.criteria.maxCycles;
    let goalReached = false;

    for (let cycle = 0; cycle < maxCycles; cycle++) {
      // In vision mode, generate a simulated camera frame before each cycle
      if (visionSim && visionBridge) {
        const frame = visionSim.generateFrame(pose);
        visionBridge.updateFromVision(pose, frame);
      }

      // Run one navigation cycle
      const result = await loop.runCycle();

      // Simulate movement
      const collisionResult = this.simulateMovement(pose, result, bridge);
      const collision = collisionResult.collided;

      // In vision mode, mark collision point as obstacle for future path planning
      if (collision && collisionResult.collisionPoint && visionBridge) {
        const wm = visionBridge.getWorldModel();
        const { gx, gy } = wm.worldToGrid(collisionResult.collisionPoint.x, collisionResult.collisionPoint.y);
        if (wm.isValidGridCoord(gx, gy)) {
          const grid = wm.getGrid();
          grid[gy][gx].state = 'obstacle';
          grid[gy][gx].confidence = 0.95;
          grid[gy][gx].lastUpdated = Date.now();
        }
      }

      // Update loop with new pose
      loop.updatePose(pose.x, pose.y, pose.rotation);

      // Check goal distance
      let goalDistanceM: number | null = null;
      if (this.arena.goal) {
        const dx = pose.x - this.arena.goal.x;
        const dy = pose.y - this.arena.goal.y;
        goalDistanceM = Math.sqrt(dx * dx + dy * dy);
      }

      // Compute exploration
      const worldModel = bridge.getWorldModel();
      const grid = worldModel.getGrid();
      const dims = worldModel.getGridDimensions();
      let total = 0;
      let known = 0;
      for (let gy = 0; gy < dims.height; gy++) {
        for (let gx = 0; gx < dims.width; gx++) {
          const state = grid[gy][gx].state;
          if (state !== 'unknown') {
            total++;
            known++;
          } else {
            total++;
          }
        }
      }
      const exploration = total > 0 ? known / total : 0;

      // Count cell types
      const cellCounts = { free: 0, obstacle: 0, wall: 0, unknown: 0, explored: 0 };
      for (const row of grid) {
        for (const cell of row) {
          if (cell.state in cellCounts) {
            (cellCounts as Record<string, number>)[cell.state]++;
          }
        }
      }

      // Build log entry
      const entry: CycleLogEntry = {
        cycle: result.cycle,
        timestamp: Date.now(),
        pose: { x: pose.x, y: pose.y, rotation: pose.rotation },
        mode: result.mode,
        isStuck: result.isStuck,
        stuckCounter: loop.getState().stuckCounter,
        exploration,
        cellCounts,
        frontierCount: bridge.findFrontiers().length,
        candidates: [],
        decision: {
          actionType: result.decision.action.type,
          targetId: result.decision.action.target_id,
          targetM: result.decision.action.target_m,
          fallback: result.decision.fallback.if_failed,
          explanation: result.decision.explanation,
        },
        pathResult: result.path ? {
          success: result.path.success,
          waypointCount: result.path.waypoints?.length ?? 0,
          pathLengthM: result.path.totalCost ?? 0,
          planningTimeMs: result.cycleTimeMs,
          error: result.path.error,
        } : null,
        cycleTimeMs: result.cycleTimeMs,
        goalDistanceM,
        goalReached: result.goalReached,
        collision,
      };

      logger.logCycle(entry);

      // Callback
      this.config.onCycle?.(cycle, result, entry);

      // Report action result to loop
      if (collision) {
        loop.reportActionResult('collision', 'Collision with obstacle or wall');
      } else if (result.path && !result.path.success) {
        loop.reportActionResult('blocked', result.path.error ?? 'Path planning failed');
      } else {
        loop.reportActionResult('success', 'Moved successfully');
      }

      // Check termination
      if (result.goalReached) {
        goalReached = true;
        break;
      }
    }

    // Build result
    const summary = logger.getSummary();
    const evaluation = evaluateRun(
      summary,
      this.arena.criteria,
      this.arena.goal !== null
    );
    const report = formatEvaluationReport(evaluation);
    const totalTimeMs = Math.round(performance.now() - startTime);

    const runResult: NavigationRunResult = {
      evaluation,
      summary,
      entries: logger.getEntries(),
      totalTimeMs,
      report,
    };

    this.config.onComplete?.(runResult);
    return runResult;
  }

  // ---------------------------------------------------------------------------
  // Physics Simulation
  // ---------------------------------------------------------------------------

  /**
   * Simulate robot movement based on the cycle result.
   * Returns collision info including the attempted position.
   */
  private simulateMovement(
    pose: { x: number; y: number; rotation: number },
    result: CycleResult,
    bridge: IWorldModelBridge
  ): { collided: boolean; collisionPoint?: { x: number; y: number } } {
    const step = this.config.moveStepM;

    if (result.decision.action.type === 'STOP') {
      return { collided: false };
    }

    if (result.decision.action.type === 'ROTATE_TO') {
      const yawDeg = result.decision.action.yaw_deg ?? 90;
      pose.rotation += (yawDeg * Math.PI) / 180;
      // Small forward step to avoid stuck loops
      const nx = pose.x + Math.sin(pose.rotation) * 0.05;
      const ny = pose.y - Math.cos(pose.rotation) * 0.05;
      if (!this.checkCollision(nx, ny)) {
        pose.x = nx;
        pose.y = ny;
      }
      return { collided: false };
    }

    // MOVE_TO / EXPLORE / FOLLOW_WALL: follow planned path
    if (result.path?.success && result.path.waypoints && result.path.waypoints.length > 0) {
      // Move toward first waypoint
      const wp = result.path.waypoints[Math.min(1, result.path.waypoints.length - 1)];
      const dx = wp.x - pose.x;
      const dy = wp.y - pose.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > 0.01) {
        const moveD = Math.min(step, dist);
        const nx = pose.x + (dx / dist) * moveD;
        const ny = pose.y + (dy / dist) * moveD;

        if (this.checkCollision(nx, ny)) {
          return { collided: true, collisionPoint: { x: nx, y: ny } };
        }

        pose.x = nx;
        pose.y = ny;
        pose.rotation = Math.atan2(dx, -dy); // sin(angle)=dx, -cos(angle)=dy
      }
    } else {
      // No path — move in heading direction (fallback)
      const nx = pose.x + Math.sin(pose.rotation) * step;
      const ny = pose.y - Math.cos(pose.rotation) * step;
      if (!this.checkCollision(nx, ny)) {
        pose.x = nx;
        pose.y = ny;
      }
    }

    return { collided: false };
  }

  /**
   * Check if a position collides with any wall or obstacle.
   */
  private checkCollision(x: number, y: number): boolean {
    const r = this.config.collisionRadiusM;

    // Check bounds
    const b = this.arena.world.bounds;
    if (x - r < b.minX || x + r > b.maxX || y - r < b.minY || y + r > b.maxY) {
      return true;
    }

    // Check obstacles
    for (const obs of this.arena.world.obstacles) {
      const dx = x - obs.x;
      const dy = y - obs.y;
      if (Math.sqrt(dx * dx + dy * dy) < r + obs.radius) {
        return true;
      }
    }

    // Check walls (point-to-segment distance)
    for (const wall of this.arena.world.walls) {
      if (this.pointToSegmentDist(x, y, wall.x1, wall.y1, wall.x2, wall.y2) < r) {
        return true;
      }
    }

    return false;
  }

  /**
   * Minimum distance from point (px, py) to line segment (x1,y1)-(x2,y2).
   */
  private pointToSegmentDist(
    px: number, py: number,
    x1: number, y1: number,
    x2: number, y2: number
  ): number {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;

    if (lenSq === 0) {
      // Degenerate segment (point)
      return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2);
    }

    let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));

    const projX = x1 + t * dx;
    const projY = y1 + t * dy;

    return Math.sqrt((px - projX) ** 2 + (py - projY) ** 2);
  }
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Create and run a navigation session in one call.
 *
 * ```typescript
 * const result = await runNavigation(ARENA_SIMPLE_NAVIGATION, createMockInference());
 * console.log(result.report);
 * ```
 */
export async function runNavigation(
  arena: TestArenaConfig,
  infer: InferenceFunction,
  config: Partial<NavigationRuntimeConfig> = {}
): Promise<NavigationRunResult> {
  const runtime = new NavigationRuntime(arena, infer, config);
  return runtime.run();
}
