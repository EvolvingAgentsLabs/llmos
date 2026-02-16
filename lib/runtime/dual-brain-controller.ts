/**
 * Dual-Brain Controller for LLMos Physical Agents
 *
 * Implements a two-tier cognitive architecture inspired by:
 * - JEPA (Joint Embedding Predictive Architecture) — fast physical intuition
 * - RSA (Recursive Self-Aggregation) — deep deliberative planning
 *
 * Architecture:
 * ┌──────────────────────────────────────────────────────────────┐
 * │                    HOST COMPUTER                             │
 * │                                                              │
 * │  Camera ──→ Qwen3-VL-8B ──→ VisionFrame + Reasoning          │
 * │              (direct multimodal, ~200-500ms)                  │
 * │                    │                                         │
 * │         ┌─────────┴──────────┐                               │
 * │         ▼                    ▼                                │
 * │  ┌──────────────┐    ┌───────────────────────┐               │
 * │  │   INSTINCT   │    │      PLANNER          │               │
 * │  │ Qwen3-VL-8B  │    │  Qwen3-VL-8B + RSA    │               │
 * │  │  single-pass │    │   N=4, K=2, T=3       │               │
 * │  │  ~200-500ms  │    │   ~3-8 seconds         │               │
 * │  └──────┬───────┘    └──────────┬──────────────┘              │
 * │         └───────────┬───────────┘                             │
 * │                     ▼                                         │
 * │              HAL → ESP32 Robot                                │
 * └──────────────────────────────────────────────────────────────┘
 *
 * The controller decides which brain handles each decision based on:
 * - Time criticality (imminent collision → instinct)
 * - Novelty (unknown object → planner)
 * - Confidence (low instinct confidence → escalate to planner)
 * - Goal complexity (multi-step plan → planner)
 *
 * References:
 * - RSA Paper: https://arxiv.org/html/2509.26626v1
 * - Qwen3-VL: https://huggingface.co/Qwen/Qwen3-VL-8B-Instruct
 * - JEPA: https://openreview.net/forum?id=BZ5a1r-kVsf
 */

import type { AbstractState, RobotAction, PredictedOutcome } from './jepa-mental-model';
import type { RSAEngine, RSAResult, RSAConfig } from './rsa-engine';
import type { RSAInferenceProvider } from './rsa-engine';
import type { VisionFrame } from './vision/mobilenet-detector';
import type { WorldModelProvider } from './world-model-provider';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

/** Which brain made a given decision. */
export type BrainMode = 'instinct' | 'planner' | 'hybrid';

/** Reasons the controller escalates from instinct to planner. */
export type EscalationReason =
  | 'unknown_object'       // MobileNet confidence < threshold
  | 'stuck'                // Same position for > N seconds
  | 'goal_requires_plan'   // Goal is multi-step
  | 'low_confidence'       // Instinct confidence below threshold
  | 'new_area'             // Entered exploration frontier
  | 'fleet_coordination'   // Swarm decision needed
  | 'user_request'         // User explicitly asked for deep planning
  | 'periodic_replan'      // Scheduled replanning interval
  | 'looping'              // World model: visiting same cells repeatedly
  | 'frontier_exhaustion'; // World model: most area explored, few frontiers left

/** The result of a brain decision. */
export interface BrainDecision {
  /** Which brain produced this decision. */
  brain: BrainMode;
  /** The selected action(s). */
  actions: RobotAction[];
  /** Reasoning behind the decision. */
  reasoning: string;
  /** Confidence in this decision (0-1). */
  confidence: number;
  /** If escalated, why. */
  escalationReason?: EscalationReason;
  /** If planner was used, the full RSA result. */
  rsaResult?: RSAResult;
  /** Timestamp of decision. */
  timestamp: number;
  /** Latency in ms. */
  latencyMs: number;
}

/** Configuration for the Dual-Brain Controller. */
export interface DualBrainConfig {
  /** Below this instinct confidence, escalate to planner (0-1). */
  confidenceThreshold: number;
  /** Below this MobileNet detection confidence, escalate (0-1). */
  visionConfidenceThreshold: number;
  /** Seconds of no movement before declaring "stuck". */
  stuckTimeoutSeconds: number;
  /** Maximum latency (ms) for instinct decisions. If exceeded, something is wrong. */
  instinctMaxLatencyMs: number;
  /** How often (in sensing cycles) to force a planner replan. 0 = never. */
  periodicReplanInterval: number;
  /** Whether planner runs in background while instinct acts. */
  asyncPlanning: boolean;
  /** Distance threshold (cm) that triggers emergency instinct override. */
  emergencyDistanceCm: number;
  /** RSA preset to use for planner ('quick' | 'standard' | 'deep'). */
  rsaPreset: string;
}

export const DEFAULT_DUAL_BRAIN_CONFIG: DualBrainConfig = {
  confidenceThreshold: 0.4,
  visionConfidenceThreshold: 0.5,
  stuckTimeoutSeconds: 5,
  instinctMaxLatencyMs: 500,
  periodicReplanInterval: 50,  // Every 50 cycles (~5 seconds at 10Hz)
  asyncPlanning: true,
  emergencyDistanceCm: 15,
  rsaPreset: 'quick',
};

/** Metrics tracked for analysis and black-box recording. */
export interface DualBrainMetrics {
  totalDecisions: number;
  instinctDecisions: number;
  plannerDecisions: number;
  escalations: number;
  escalationReasons: Map<EscalationReason, number>;
  averageInstinctLatencyMs: number;
  averagePlannerLatencyMs: number;
  instinctAccuracy: number;  // Updated via verify()
}

// ═══════════════════════════════════════════════════════════════════════════
// INSTINCT RULES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Fast, rule-based reactive layer.
 * Runs in <5ms (no LLM call). Used for immediate physical safety.
 * This is the "System 1" / "fast thinking" brain.
 */
export function reactiveInstinct(
  sensorData: {
    front: number;
    left: number;
    right: number;
    back: number;
  },
  visionFrame?: VisionFrame | null,
  config: DualBrainConfig = DEFAULT_DUAL_BRAIN_CONFIG
): { action: RobotAction; confidence: number; reasoning: string } | null {
  // Emergency: imminent collision
  if (sensorData.front < config.emergencyDistanceCm) {
    // Choose best escape direction
    if (sensorData.left > sensorData.right && sensorData.left > 30) {
      return {
        action: 'turn_left',
        confidence: 0.95,
        reasoning: `Emergency: front obstacle at ${sensorData.front}cm. Turning left (${sensorData.left}cm clear).`,
      };
    }
    if (sensorData.right > 30) {
      return {
        action: 'turn_right',
        confidence: 0.95,
        reasoning: `Emergency: front obstacle at ${sensorData.front}cm. Turning right (${sensorData.right}cm clear).`,
      };
    }
    return {
      action: 'backup',
      confidence: 0.9,
      reasoning: `Emergency: front obstacle at ${sensorData.front}cm, sides blocked. Backing up.`,
    };
  }

  // Clear path ahead — simple case
  if (sensorData.front > 80 && sensorData.left > 30 && sensorData.right > 30) {
    return {
      action: 'move_forward',
      confidence: 0.85,
      reasoning: `Clear path: front=${sensorData.front}cm, no obstacles nearby.`,
    };
  }

  // Wall following (left-hand rule)
  if (sensorData.front > 40 && sensorData.left < 40 && sensorData.left > 15) {
    return {
      action: 'move_forward',
      confidence: 0.7,
      reasoning: `Wall following: maintaining left wall at ${sensorData.left}cm.`,
    };
  }

  // Moderate obstacle ahead — simple avoidance
  if (sensorData.front < 40) {
    if (sensorData.left > sensorData.right) {
      return {
        action: 'turn_left',
        confidence: 0.7,
        reasoning: `Obstacle ahead at ${sensorData.front}cm. Left is clearer (${sensorData.left}cm vs ${sensorData.right}cm).`,
      };
    }
    return {
      action: 'turn_right',
      confidence: 0.7,
      reasoning: `Obstacle ahead at ${sensorData.front}cm. Right is clearer (${sensorData.right}cm vs ${sensorData.left}cm).`,
    };
  }

  // No clear reactive rule — return null to signal escalation to LLM instinct
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// DUAL-BRAIN CONTROLLER
// ═══════════════════════════════════════════════════════════════════════════

export class DualBrainController {
  private config: DualBrainConfig;
  private rsaEngine: RSAEngine | null = null;
  private instinctProvider: RSAInferenceProvider | null = null;
  private worldModelProvider: WorldModelProvider | null = null;
  private metrics: DualBrainMetrics;
  private cycleCount: number = 0;
  private lastPosition: { x: number; y: number } | null = null;
  private lastMoveTimestamp: number = Date.now();
  private pendingPlannerResult: Promise<RSAResult> | null = null;
  private currentPlan: RobotAction[] = [];
  private decisionLog: BrainDecision[] = [];

  constructor(
    config?: Partial<DualBrainConfig>,
    rsaEngine?: RSAEngine,
    instinctProvider?: RSAInferenceProvider
  ) {
    this.config = { ...DEFAULT_DUAL_BRAIN_CONFIG, ...config };
    this.rsaEngine = rsaEngine ?? null;
    this.instinctProvider = instinctProvider ?? null;
    this.metrics = this.initMetrics();
  }

  /**
   * Main decision loop. Called every sensing cycle (~10Hz).
   *
   * Decision flow:
   * 1. Check reactive instinct (rule-based, <5ms)
   * 2. If no reactive rule applies, check escalation conditions
   * 3. If escalation needed → run planner (RSA)
   * 4. Otherwise → run LLM instinct (single-pass Qwen3-VL-8B)
   */
  async decide(context: {
    sensorData: { front: number; left: number; right: number; back: number };
    pose: { x: number; y: number; rotation: number };
    goal: string;
    abstractState?: AbstractState;
    visionFrame?: VisionFrame | null;
    worldModelSummary?: string;
    /** Map image from WorldModelProvider (base64 data URL) for multimodal RSA */
    mapImage?: string;
  }): Promise<BrainDecision> {
    const startTime = Date.now();
    this.cycleCount++;

    // ─── Layer 1: Reactive instinct (rule-based, <5ms) ─────────────
    const reactiveResult = reactiveInstinct(
      context.sensorData,
      context.visionFrame,
      this.config
    );

    if (reactiveResult && reactiveResult.confidence > 0.85) {
      const decision: BrainDecision = {
        brain: 'instinct',
        actions: [reactiveResult.action],
        reasoning: `[REACTIVE] ${reactiveResult.reasoning}`,
        confidence: reactiveResult.confidence,
        timestamp: Date.now(),
        latencyMs: Date.now() - startTime,
      };
      this.recordDecision(decision);
      return decision;
    }

    // ─── Check escalation conditions ────────────────────────────────
    const escalationReason = this.checkEscalation(context);

    // ─── Layer 2: Planner (RSA) if escalated ────────────────────────
    if (escalationReason && this.rsaEngine) {
      return this.runPlanner(context, escalationReason, startTime);
    }

    // ─── Layer 3: LLM instinct (single-pass, ~200ms) ───────────────
    if (this.instinctProvider) {
      return this.runLLMInstinct(context, startTime);
    }

    // ─── Fallback: use reactive result even at lower confidence ─────
    if (reactiveResult) {
      const decision: BrainDecision = {
        brain: 'instinct',
        actions: [reactiveResult.action],
        reasoning: `[REACTIVE-FALLBACK] ${reactiveResult.reasoning}`,
        confidence: reactiveResult.confidence,
        timestamp: Date.now(),
        latencyMs: Date.now() - startTime,
      };
      this.recordDecision(decision);
      return decision;
    }

    // ─── Last resort: stop ──────────────────────────────────────────
    const decision: BrainDecision = {
      brain: 'instinct',
      actions: ['stop'],
      reasoning: '[SAFETY] No brain available and no reactive rule matched. Stopping.',
      confidence: 0.3,
      timestamp: Date.now(),
      latencyMs: Date.now() - startTime,
    };
    this.recordDecision(decision);
    return decision;
  }

  /**
   * Check if the instinct layer should escalate to the planner.
   */
  private checkEscalation(context: {
    sensorData: { front: number; left: number; right: number; back: number };
    pose: { x: number; y: number; rotation: number };
    goal: string;
    visionFrame?: VisionFrame | null;
  }): EscalationReason | null {
    // Stuck detection
    if (this.lastPosition) {
      const dx = context.pose.x - this.lastPosition.x;
      const dy = context.pose.y - this.lastPosition.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance > 0.05) {
        // Moved significantly
        this.lastMoveTimestamp = Date.now();
      } else if ((Date.now() - this.lastMoveTimestamp) / 1000 > this.config.stuckTimeoutSeconds) {
        return 'stuck';
      }
    }
    this.lastPosition = { x: context.pose.x, y: context.pose.y };

    // World-model-aware escalation: looping detection
    if (this.worldModelProvider?.isLooping()) {
      return 'looping';
    }

    // World-model-aware escalation: frontier exhaustion
    if (this.worldModelProvider?.isFrontierExhausted()) {
      return 'frontier_exhaustion';
    }

    // Unknown object in vision
    if (context.visionFrame) {
      const hasUnknown = context.visionFrame.detections.some(
        (d) => d.confidence < this.config.visionConfidenceThreshold
      );
      if (hasUnknown) return 'unknown_object';
    }

    // Periodic replanning
    if (
      this.config.periodicReplanInterval > 0 &&
      this.cycleCount % this.config.periodicReplanInterval === 0
    ) {
      return 'periodic_replan';
    }

    // Multi-step goal detection (simple heuristic)
    const complexGoalKeywords = ['find', 'explore', 'collect', 'bring', 'build', 'coordinate'];
    if (complexGoalKeywords.some((kw) => context.goal.toLowerCase().includes(kw))) {
      // Only escalate if we don't already have a plan
      if (this.currentPlan.length === 0) {
        return 'goal_requires_plan';
      }
    }

    return null;
  }

  /**
   * Run the planner brain (RSA) for deep reasoning.
   */
  private async runPlanner(
    context: {
      sensorData: { front: number; left: number; right: number; back: number };
      pose: { x: number; y: number; rotation: number };
      goal: string;
      worldModelSummary?: string;
      visionFrame?: VisionFrame | null;
      mapImage?: string;
    },
    reason: EscalationReason,
    startTime: number
  ): Promise<BrainDecision> {
    this.metrics.escalations++;
    this.metrics.escalationReasons.set(
      reason,
      (this.metrics.escalationReasons.get(reason) ?? 0) + 1
    );

    const situation = `Goal: ${context.goal}\nSensors: front=${context.sensorData.front}cm, left=${context.sensorData.left}cm, right=${context.sensorData.right}cm\nPosition: (${context.pose.x.toFixed(2)}, ${context.pose.y.toFixed(2)}), rotation=${(context.pose.rotation * 180 / Math.PI).toFixed(1)}deg\nEscalation reason: ${reason}`;

    // Use full world model summary from provider if available, else fall back to context string
    const worldModelSummary = this.worldModelProvider
      ? this.worldModelProvider.getFullSummary()
      : (context.worldModelSummary ?? '');

    const visionContext = context.visionFrame
      ? JSON.stringify(context.visionFrame.detections, null, 2)
      : undefined;

    // Pass map image for multimodal RSA (allocentric view alongside camera)
    const mapImage = this.worldModelProvider
      ? this.worldModelProvider.getMapImage() ?? undefined
      : context.mapImage;

    const rsaResult = await this.rsaEngine!.planRobotAction(
      situation,
      worldModelSummary,
      visionContext,
      mapImage
    );

    // Parse actions from RSA result
    const actions = this.parseActionsFromPlan(rsaResult.bestAnswer);
    this.currentPlan = actions.slice(1); // Store remaining plan steps

    const decision: BrainDecision = {
      brain: 'planner',
      actions: actions.length > 0 ? [actions[0]] : ['stop'],
      reasoning: `[PLANNER/RSA] Escalated: ${reason}. ${rsaResult.bestReasoning.slice(0, 200)}...`,
      confidence: rsaResult.finalConsensus,
      escalationReason: reason,
      rsaResult,
      timestamp: Date.now(),
      latencyMs: Date.now() - startTime,
    };

    this.recordDecision(decision);
    this.metrics.plannerDecisions++;
    return decision;
  }

  /**
   * Run the LLM instinct brain (single-pass, ~200ms).
   */
  private async runLLMInstinct(
    context: {
      sensorData: { front: number; left: number; right: number; back: number };
      pose: { x: number; y: number; rotation: number };
      goal: string;
      abstractState?: AbstractState;
    },
    startTime: number
  ): Promise<BrainDecision> {
    // If we have a plan from the planner, execute next step
    if (this.currentPlan.length > 0) {
      const nextAction = this.currentPlan.shift()!;
      const decision: BrainDecision = {
        brain: 'hybrid',
        actions: [nextAction],
        reasoning: `[PLAN-EXECUTE] Executing step from planner. ${this.currentPlan.length} steps remaining.`,
        confidence: 0.7,
        timestamp: Date.now(),
        latencyMs: Date.now() - startTime,
      };
      this.recordDecision(decision);
      return decision;
    }

    // Single-pass LLM for quick decision — include compact world model if available
    const worldContext = this.worldModelProvider
      ? `\n${this.worldModelProvider.getCompactSummary()}\n`
      : '';

    const prompt = `You are a robot's fast-thinking instinct. Given sensor data and world model, pick ONE action.

Sensors: front=${context.sensorData.front}cm, left=${context.sensorData.left}cm, right=${context.sensorData.right}cm, back=${context.sensorData.back}cm
Goal: ${context.goal}
Position: (${context.pose.x.toFixed(2)}, ${context.pose.y.toFixed(2)})
${worldContext}
Actions: move_forward, turn_left, turn_right, backup, stop

Reply with ONLY: {"action": "<action>", "confidence": <0-1>, "reasoning": "<brief>"}`;

    const response = await this.instinctProvider!.generate(prompt, {
      temperature: 0.3,
      maxTokens: 128,
    });

    try {
      const parsed = JSON.parse(response);
      const decision: BrainDecision = {
        brain: 'instinct',
        actions: [parsed.action as RobotAction],
        reasoning: `[LLM-INSTINCT] ${parsed.reasoning}`,
        confidence: parsed.confidence,
        timestamp: Date.now(),
        latencyMs: Date.now() - startTime,
      };

      // Check if confidence is too low — should we have escalated?
      if (parsed.confidence < this.config.confidenceThreshold) {
        decision.escalationReason = 'low_confidence';
      }

      this.recordDecision(decision);
      this.metrics.instinctDecisions++;
      return decision;
    } catch {
      // Parse failed — fallback to reactive
      const decision: BrainDecision = {
        brain: 'instinct',
        actions: ['stop'],
        reasoning: '[LLM-INSTINCT] Failed to parse response. Stopping safely.',
        confidence: 0.3,
        timestamp: Date.now(),
        latencyMs: Date.now() - startTime,
      };
      this.recordDecision(decision);
      return decision;
    }
  }

  /**
   * Parse robot actions from a planner's text output.
   */
  private parseActionsFromPlan(planText: string): RobotAction[] {
    const validActions: RobotAction[] = ['move_forward', 'turn_left', 'turn_right', 'backup', 'stop'];
    const found: RobotAction[] = [];

    // Try JSON array first
    try {
      const parsed = JSON.parse(planText);
      if (Array.isArray(parsed)) {
        return parsed.filter((a: string) => validActions.includes(a as RobotAction)) as RobotAction[];
      }
      if (parsed.actions && Array.isArray(parsed.actions)) {
        return parsed.actions.filter((a: string) => validActions.includes(a as RobotAction)) as RobotAction[];
      }
    } catch {
      // Not JSON, try text parsing
    }

    // Text parsing
    const lower = planText.toLowerCase();
    for (const action of validActions) {
      if (lower.includes(action)) {
        found.push(action);
      }
    }

    return found.length > 0 ? found : ['stop'];
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // METRICS & LOGGING
  // ═══════════════════════════════════════════════════════════════════════════

  private recordDecision(decision: BrainDecision): void {
    this.metrics.totalDecisions++;
    this.decisionLog.push(decision);

    // Keep log bounded
    if (this.decisionLog.length > 1000) {
      this.decisionLog = this.decisionLog.slice(-500);
    }

    // Update average latencies
    if (decision.brain === 'instinct') {
      const n = this.metrics.instinctDecisions;
      this.metrics.averageInstinctLatencyMs =
        (this.metrics.averageInstinctLatencyMs * n + decision.latencyMs) / (n + 1);
    } else if (decision.brain === 'planner') {
      const n = this.metrics.plannerDecisions;
      this.metrics.averagePlannerLatencyMs =
        (this.metrics.averagePlannerLatencyMs * n + decision.latencyMs) / (n + 1);
    }
  }

  private initMetrics(): DualBrainMetrics {
    return {
      totalDecisions: 0,
      instinctDecisions: 0,
      plannerDecisions: 0,
      escalations: 0,
      escalationReasons: new Map(),
      averageInstinctLatencyMs: 0,
      averagePlannerLatencyMs: 0,
      instinctAccuracy: 0,
    };
  }

  /** Get current metrics. */
  getMetrics(): DualBrainMetrics {
    return { ...this.metrics };
  }

  /** Get recent decision log. */
  getDecisionLog(limit: number = 50): BrainDecision[] {
    return this.decisionLog.slice(-limit);
  }

  /** Set or update the RSA engine (e.g., when switching presets). */
  setRSAEngine(engine: RSAEngine): void {
    this.rsaEngine = engine;
  }

  /** Set the instinct provider. */
  setInstinctProvider(provider: RSAInferenceProvider): void {
    this.instinctProvider = provider;
  }

  /** Set the world model provider for world-model-aware decisions. */
  setWorldModelProvider(provider: WorldModelProvider): void {
    this.worldModelProvider = provider;
  }

  /** Update configuration. */
  setConfig(config: Partial<DualBrainConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /** Reset state (e.g., on simulation reset). */
  reset(): void {
    this.cycleCount = 0;
    this.lastPosition = null;
    this.lastMoveTimestamp = Date.now();
    this.pendingPlannerResult = null;
    this.currentPlan = [];
    this.decisionLog = [];
    this.metrics = this.initMetrics();
    this.worldModelProvider?.reset();
  }
}

export default DualBrainController;
