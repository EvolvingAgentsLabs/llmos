/**
 * Navigation Loop Orchestrator
 *
 * Wires together the complete navigation cycle:
 *
 *   Sensors → WorldModel → Serializer → Candidates → Prompt → LLM
 *     → Decision Validation → Local Planner → HAL → Sensors
 *
 * This is the top-level controller for a single navigation session.
 * It manages the cycle counter, history buffer, mode transitions,
 * stuck detection, and the decision → execution pipeline.
 *
 * The orchestrator does NOT run the LLM inference itself — it
 * assembles the input, delegates to a provided inference function,
 * and processes the output. This keeps it testable without a real LLM.
 */

import type WorldModel from './world-model';
import type { IWorldModelBridge } from './world-model-bridge';
import { CandidateGenerator, formatCandidatesForLLM, type Candidate } from './candidate-generator';
import { MapRenderer } from './map-renderer';
import { LocalPlanner, type PathResult } from './local-planner';
import {
  type NavigationFrame,
  type NavigationMode,
  type LLMNavigationDecision,
  parseNavigationDecision,
} from './navigation-types';
import {
  buildNavigationPrompt,
  buildMultimodalMessage,
  getFallbackDecision,
} from './navigation-prompt';

// =============================================================================
// Types
// =============================================================================

export interface NavigationLoopConfig {
  /** Maximum cycles before giving up (default: 200) */
  maxCycles: number;
  /** Maximum history entries to keep (default: 5) */
  maxHistory: number;
  /** Stuck detection: cycles without progress (default: 5) */
  stuckThreshold: number;
  /** Distance to consider goal reached, in meters (default: 0.3) */
  goalToleranceM: number;
  /** Whether to generate map images (default: true) */
  generateMapImages: boolean;
  /** LLM inference timeout in ms (default: 5000) */
  inferenceTimeoutMs: number;
  /** A* cost for unknown cells — higher values prefer known-free paths (default: 5, vision mode: 50) */
  unknownCellCost: number;
  /** Whether to apply LLM world_model_update corrections (default: true) */
  applyLLMCorrections: boolean;
  /** Minimum LLM confidence for corrections to be applied (default: 0.6) */
  llmCorrectionMinConfidence: number;
  /** Maximum sensor confidence that LLM corrections can override (default: 0.7) */
  llmCorrectionMaxOverride: number;
}

export interface CycleResult {
  /** Cycle number */
  cycle: number;
  /** LLM's decision (or fallback) */
  decision: LLMNavigationDecision;
  /** Path planned by local planner (null if STOP/ROTATE) */
  path: PathResult | null;
  /** Current navigation mode */
  mode: NavigationMode;
  /** Whether the goal has been reached */
  goalReached: boolean;
  /** Whether the robot is stuck */
  isStuck: boolean;
  /** The navigation frame that was sent to the LLM */
  frame: NavigationFrame;
  /** Time taken for this cycle in ms */
  cycleTimeMs: number;
}

export interface NavigationState {
  cycle: number;
  mode: NavigationMode;
  position: { x: number; y: number };
  yaw: number;
  speed: number;
  battery: number;
  isStuck: boolean;
  stuckCounter: number;
  confidence: number;
  lastPosition: { x: number; y: number };
  history: Array<{ cycle: number; action: string; result: string }>;
}

/**
 * Inference function type.
 * Takes the assembled prompt and optional images, returns the LLM's raw text response.
 * This abstraction allows the orchestrator to work with any LLM backend.
 */
export type InferenceFunction = (
  systemPrompt: string,
  userMessage: string,
  images?: string[]
) => Promise<string>;

const DEFAULT_CONFIG: NavigationLoopConfig = {
  maxCycles: 200,
  maxHistory: 5,
  stuckThreshold: 5,
  goalToleranceM: 0.3,
  generateMapImages: true,
  inferenceTimeoutMs: 5000,
  unknownCellCost: 5,
  applyLLMCorrections: true,
  llmCorrectionMinConfidence: 0.6,
  llmCorrectionMaxOverride: 0.7,
};

// =============================================================================
// Navigation Loop Orchestrator
// =============================================================================

export class NavigationLoop {
  private config: NavigationLoopConfig;
  private bridge: IWorldModelBridge;
  private candidateGen: CandidateGenerator;
  private mapRenderer: MapRenderer;
  private localPlanner: LocalPlanner;
  private infer: InferenceFunction;

  private state: NavigationState;
  private goal: { x: number; y: number; text: string } | null = null;
  private symbolicLayer: ReturnType<typeof this.getEmptySymbolicLayer>;
  private lastDecision: LLMNavigationDecision | null = null;
  private lastActionResult: { action: string; result: 'success' | 'blocked' | 'timeout' | 'collision'; details: string };

  constructor(
    bridge: IWorldModelBridge,
    infer: InferenceFunction,
    config: Partial<NavigationLoopConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.bridge = bridge;
    this.infer = infer;

    this.candidateGen = new CandidateGenerator();
    this.mapRenderer = new MapRenderer();
    this.localPlanner = new LocalPlanner({
      unknownCellCost: this.config.unknownCellCost,
    });

    this.state = {
      cycle: 0,
      mode: 'idle',
      position: { x: 0, y: 0 },
      yaw: 0,
      speed: 0,
      battery: 100,
      isStuck: false,
      stuckCounter: 0,
      confidence: 0.5,
      lastPosition: { x: 0, y: 0 },
      history: [],
    };

    this.symbolicLayer = this.getEmptySymbolicLayer();
    this.lastActionResult = { action: 'none', result: 'success', details: 'first cycle' };
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Set the navigation goal.
   */
  setGoal(x: number, y: number, description: string): void {
    this.goal = { x, y, text: description };
    this.state.mode = 'navigating';
  }

  /**
   * Set to exploration mode (no specific goal position).
   */
  setExplorationMode(description: string = 'Explore the arena'): void {
    this.goal = null;
    this.state.mode = 'exploring';
  }

  /**
   * Update the robot's current pose (call before each cycle).
   */
  updatePose(x: number, y: number, yaw: number, speed: number = 0): void {
    this.state.lastPosition = { ...this.state.position };
    this.state.position = { x, y };
    this.state.yaw = yaw;
    this.state.speed = speed;

    // Update bridge
    this.bridge.updateRobotPose({ x, y, rotation: yaw });
  }

  /**
   * Update battery level.
   */
  updateBattery(pct: number): void {
    this.state.battery = pct;
  }

  /**
   * Set the symbolic layer (from SceneGraphManager.serializeForLLM()).
   */
  setSymbolicLayer(layer: typeof this.symbolicLayer): void {
    this.symbolicLayer = layer;
  }

  /**
   * Report the result of the last action execution.
   */
  reportActionResult(
    result: 'success' | 'blocked' | 'timeout' | 'collision',
    details: string
  ): void {
    const actionStr = this.lastDecision
      ? `${this.lastDecision.action.type} ${this.lastDecision.action.target_id || ''}`
      : 'none';
    this.lastActionResult = { action: actionStr.trim(), result, details };
  }

  /**
   * Execute one navigation cycle.
   *
   * This is the core loop:
   *   1. Check if goal reached
   *   2. Generate candidates
   *   3. Serialize world model
   *   4. Assemble navigation frame
   *   5. Call LLM inference
   *   6. Validate decision
   *   7. Plan path with local planner
   *   8. Return cycle result (caller executes on HAL)
   */
  async runCycle(cameraFrame?: string): Promise<CycleResult> {
    const cycleStart = performance.now();
    this.state.cycle++;

    // 1. Check if goal reached
    if (this.goal && this.isGoalReached()) {
      this.state.mode = 'goal_reached';
      const decision: LLMNavigationDecision = {
        action: { type: 'STOP' },
        fallback: { if_failed: 'STOP' },
        explanation: 'Goal reached — stopping.',
      };
      return this.buildCycleResult(decision, null, cycleStart);
    }

    // 2. Detect stuck state
    this.updateStuckDetection();

    // 3. Generate candidates
    const worldModel = this.bridge.getWorldModel();
    const robotPose = {
      x: this.state.position.x,
      y: this.state.position.y,
      rotation: this.state.yaw,
    };

    const candidates = this.candidateGen.generate(
      worldModel,
      this.bridge,
      robotPose,
      this.goal,
      this.state.isStuck
    );

    // 4. Serialize world model
    const worldConfig = worldModel.getWorldConfig();
    const serializedWorld = worldModel.serialize('auto', robotPose, this.goal ? {
      x: this.goal.x,
      y: this.goal.y,
      tolerance: this.config.goalToleranceM,
    } : undefined);

    // 5. Generate map image
    let mapImage: string | undefined;
    if (this.config.generateMapImages) {
      const rendered = this.mapRenderer.render(
        worldModel.getGrid(),
        (wx, wy) => worldModel.worldToGrid(wx, wy),
        (gx, gy) => worldModel.gridToWorld(gx, gy),
        {
          robotPose,
          goal: this.goal ?? undefined,
          candidates,
          frontiers: this.bridge.findFrontiers().slice(0, 50),
        }
      );
      mapImage = rendered.dataUrl ?? undefined;
    }

    // 6. Assemble navigation frame
    const frame = this.assembleFrame(
      serializedWorld, candidates, mapImage, cameraFrame
    );

    // 7. Call LLM inference
    let decision: LLMNavigationDecision;
    try {
      const prompt = buildNavigationPrompt(frame);
      const images: string[] = [];
      if (mapImage) images.push(mapImage);
      if (cameraFrame) images.push(cameraFrame);

      const rawResponse = await Promise.race([
        this.infer(
          // System prompt is imported from navigation-prompt.ts
          'You are a navigation robot brain. Respond with JSON only.',
          prompt,
          images.length > 0 ? images : undefined
        ),
        new Promise<string>((_, reject) =>
          setTimeout(() => reject(new Error('LLM inference timeout')), this.config.inferenceTimeoutMs)
        ),
      ]);

      const parsed = parseNavigationDecision(rawResponse);
      if (parsed.valid) {
        decision = parsed.decision;
        this.state.confidence = Math.min(1, this.state.confidence + 0.1);
      } else {
        console.warn(`[NavigationLoop] Invalid LLM response: ${parsed.error}`);
        decision = getFallbackDecision(`Invalid response: ${parsed.error}`);
        this.state.confidence = Math.max(0, this.state.confidence - 0.2);
      }
    } catch (error) {
      console.warn(`[NavigationLoop] LLM inference failed:`, error);
      decision = getFallbackDecision(
        error instanceof Error ? error.message : 'Inference failed'
      );
      this.state.confidence = Math.max(0, this.state.confidence - 0.3);
    }

    // 7b. Apply LLM world model corrections (if any)
    if (this.config.applyLLMCorrections && decision.world_model_update?.corrections) {
      this.applyCorrections(decision.world_model_update.corrections, worldModel);
    }

    // 8. Plan path with local planner (if MOVE_TO or EXPLORE)
    let path: PathResult | null = null;
    if (decision.action.type === 'MOVE_TO' || decision.action.type === 'EXPLORE') {
      const targetPos = this.resolveTarget(decision, candidates);
      if (targetPos) {
        path = this.localPlanner.planPathWorld(
          worldModel.getGrid(),
          this.state.position,
          targetPos,
          (wx, wy) => worldModel.worldToGrid(wx, wy),
          (gx, gy) => worldModel.gridToWorld(gx, gy)
        );

        if (!path.success) {
          // Path planning failed — try fallback
          console.warn(`[NavigationLoop] Path planning failed: ${path.error}`);
          decision = {
            action: {
              type: decision.fallback.if_failed,
              target_id: decision.fallback.target_id,
              yaw_deg: decision.fallback.if_failed === 'ROTATE_TO' ? 90 : undefined,
            },
            fallback: { if_failed: 'STOP' },
            explanation: `Fallback after path failure: ${path.error}`,
          };
        }
      }
    }

    // 9. Update mode
    this.updateMode(decision);

    // 10. Record to history
    this.lastDecision = decision;
    this.addToHistory(
      `${decision.action.type} ${decision.action.target_id || ''}`.trim(),
      path?.success ? 'planned' : decision.action.type
    );

    return this.buildCycleResult(decision, path, cycleStart);
  }

  /**
   * Get the current navigation state.
   */
  getState(): NavigationState {
    return { ...this.state };
  }

  /**
   * Reset the navigation loop for a new session.
   */
  reset(): void {
    this.state = {
      cycle: 0,
      mode: 'idle',
      position: { x: 0, y: 0 },
      yaw: 0,
      speed: 0,
      battery: 100,
      isStuck: false,
      stuckCounter: 0,
      confidence: 0.5,
      lastPosition: { x: 0, y: 0 },
      history: [],
    };
    this.goal = null;
    this.lastDecision = null;
    this.lastActionResult = { action: 'none', result: 'success', details: 'first cycle' };
    this.bridge.reset();
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private isGoalReached(): boolean {
    if (!this.goal) return false;
    const dx = this.state.position.x - this.goal.x;
    const dy = this.state.position.y - this.goal.y;
    return Math.sqrt(dx * dx + dy * dy) <= this.config.goalToleranceM;
  }

  private updateStuckDetection(): void {
    const dx = this.state.position.x - this.state.lastPosition.x;
    const dy = this.state.position.y - this.state.lastPosition.y;
    const moved = Math.sqrt(dx * dx + dy * dy);

    if (moved < 0.05) { // Less than 5cm of movement
      this.state.stuckCounter++;
    } else {
      this.state.stuckCounter = 0;
    }

    this.state.isStuck = this.state.stuckCounter >= this.config.stuckThreshold;
    if (this.state.isStuck) {
      this.state.mode = 'recovering';
    }
  }

  private resolveTarget(
    decision: LLMNavigationDecision,
    candidates: Candidate[]
  ): { x: number; y: number } | null {
    // Try target_id first
    if (decision.action.target_id) {
      const candidate = candidates.find(c => c.id === decision.action.target_id);
      if (candidate) {
        return { x: candidate.pos_m[0], y: candidate.pos_m[1] };
      }
    }

    // Try target_m
    if (decision.action.target_m) {
      return { x: decision.action.target_m[0], y: decision.action.target_m[1] };
    }

    // For EXPLORE without target, pick the best frontier candidate
    if (decision.action.type === 'EXPLORE') {
      const frontier = candidates.find(c => c.type === 'frontier');
      if (frontier) {
        return { x: frontier.pos_m[0], y: frontier.pos_m[1] };
      }
    }

    return null;
  }

  /**
   * Apply LLM-suggested world model corrections.
   * Validates each correction against sensor confidence before applying.
   * LLM corrections can only override cells with confidence below llmCorrectionMaxOverride.
   */
  private applyCorrections(
    corrections: Array<{ pos_m: [number, number]; observed_state: 'free' | 'obstacle' | 'unknown'; confidence: number }>,
    worldModel: WorldModel
  ): void {
    const grid = worldModel.getGrid();

    for (const correction of corrections) {
      // Skip low-confidence corrections
      if (correction.confidence < this.config.llmCorrectionMinConfidence) continue;

      const { gx, gy } = worldModel.worldToGrid(correction.pos_m[0], correction.pos_m[1]);
      if (!worldModel.isValidGridCoord(gx, gy)) continue;

      const cell = grid[gy][gx];

      // Don't override high-confidence sensor data or explored cells
      if (cell.state === 'explored') continue;
      if (cell.confidence > this.config.llmCorrectionMaxOverride) continue;

      // Apply the correction
      cell.state = correction.observed_state;
      cell.confidence = Math.min(correction.confidence, this.config.llmCorrectionMaxOverride);
      cell.lastUpdated = Date.now();
    }
  }

  private updateMode(decision: LLMNavigationDecision): void {
    switch (decision.action.type) {
      case 'MOVE_TO':
        this.state.mode = 'navigating';
        break;
      case 'EXPLORE':
        this.state.mode = 'exploring';
        break;
      case 'STOP':
        if (!this.isGoalReached()) {
          this.state.mode = 'idle';
        }
        break;
      case 'FOLLOW_WALL':
        this.state.mode = 'avoiding_obstacle';
        break;
      // ROTATE_TO keeps current mode
    }
  }

  private assembleFrame(
    worldModel: ReturnType<typeof this.bridge.getWorldModel.prototype.serialize>,
    candidates: Candidate[],
    mapImage?: string,
    cameraFrame?: string
  ): NavigationFrame {
    const formatted = formatCandidatesForLLM(candidates, this.lastActionResult);

    return {
      cycle: this.state.cycle,
      goal: this.goal?.text ?? 'Explore the arena',
      world_model: worldModel as any,
      symbolic_layer: this.symbolicLayer,
      candidates: (formatted as any).candidates,
      last_step: (formatted as any).last_step,
      state: {
        mode: this.state.mode,
        position_m: [
          Math.round(this.state.position.x * 100) / 100,
          Math.round(this.state.position.y * 100) / 100,
        ],
        yaw_deg: Math.round((this.state.yaw * 180) / Math.PI),
        speed_mps: Math.round(this.state.speed * 100) / 100,
        battery_pct: this.state.battery,
        is_stuck: this.state.isStuck,
        stuck_counter: this.state.stuckCounter,
        confidence: Math.round(this.state.confidence * 100) / 100,
      },
      history: this.state.history.slice(-this.config.maxHistory),
      map_image: mapImage,
      camera_frame: cameraFrame,
    };
  }

  private addToHistory(action: string, result: string): void {
    this.state.history.push({
      cycle: this.state.cycle,
      action,
      result,
    });
    if (this.state.history.length > this.config.maxHistory * 2) {
      this.state.history = this.state.history.slice(-this.config.maxHistory);
    }
  }

  private buildCycleResult(
    decision: LLMNavigationDecision,
    path: PathResult | null,
    cycleStart: number
  ): CycleResult {
    return {
      cycle: this.state.cycle,
      decision,
      path,
      mode: this.state.mode,
      goalReached: this.state.mode === 'goal_reached',
      isStuck: this.state.isStuck,
      frame: {} as NavigationFrame, // Omit full frame from result to save memory
      cycleTimeMs: Math.round((performance.now() - cycleStart) * 100) / 100,
    };
  }

  private getEmptySymbolicLayer() {
    return {
      objects: [] as Array<{ id: string; type: string; bbox_m: [number, number, number, number]; label?: string }>,
      topology: {
        waypoints: [] as Array<{ id: string; pos_m: [number, number]; label: string }>,
        edges: [] as Array<{ from: string; to: string; cost: number; status: 'clear' | 'blocked' | 'unknown' }>,
      },
    };
  }
}
