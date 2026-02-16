/**
 * Navigation Types — LLM Input/Output Schemas for Navigation
 *
 * Strict types for the Runtime LLM's navigation reasoning loop.
 * These are the contracts between the world model serialization layer
 * and the LLM, and between the LLM and the local planner.
 *
 * Key principle: The LLM picks strategy (WHERE to go), classical
 * planners execute (HOW to get there). The LLM never touches motor PWM.
 */

import type { GridSerializationJSON, GridPatchUpdate } from './world-model-serializer';
import type { Candidate } from './candidate-generator';

// =============================================================================
// LLM Navigation Input (what the LLM receives each cycle)
// =============================================================================

/**
 * The complete navigation frame sent to the Runtime LLM each cycle.
 * Combines all three world model layers + context.
 */
export interface NavigationFrame {
  /** Cycle number */
  cycle: number;

  /** What the robot is trying to achieve (text) */
  goal: string;

  /** Layer 1: Occupancy grid (RLE JSON or patch) */
  world_model: GridSerializationJSON | GridPatchUpdate;

  /** Layer 2: Symbolic objects + topology */
  symbolic_layer: {
    objects: Array<{
      id: string;
      type: string;
      bbox_m: [number, number, number, number];
      label?: string;
    }>;
    topology: {
      waypoints: Array<{
        id: string;
        pos_m: [number, number];
        label: string;
      }>;
      edges: Array<{
        from: string;
        to: string;
        cost: number;
        status: 'clear' | 'blocked' | 'unknown';
      }>;
    };
  };

  /** Layer 3: Candidate subgoals to choose from */
  candidates: Array<{
    id: string;
    type: 'subgoal' | 'frontier' | 'waypoint' | 'recovery';
    pos_m: [number, number];
    score: number;
    note: string;
  }>;

  /** Result of last action */
  last_step: {
    action: string;
    result: 'success' | 'blocked' | 'timeout' | 'collision';
    details: string;
  };

  /** Internal state */
  state: {
    mode: NavigationMode;
    position_m: [number, number];
    yaw_deg: number;
    speed_mps: number;
    battery_pct: number;
    is_stuck: boolean;
    stuck_counter: number;
    confidence: number;
  };

  /** Recent cycle history (last 3-5 entries) */
  history: Array<{
    cycle: number;
    action: string;
    result: string;
  }>;

  /** Top-down map image (base64 PNG, sent as multimodal input) */
  map_image?: string;

  /** Camera frame (base64, sent as multimodal input) */
  camera_frame?: string;
}

export type NavigationMode =
  | 'idle'
  | 'navigating'
  | 'exploring'
  | 'avoiding_obstacle'
  | 'recovering'
  | 'goal_reached';

// =============================================================================
// LLM Navigation Output (what the LLM returns)
// =============================================================================

/**
 * The strict JSON decision the LLM must return.
 * Never raw motor commands — always high-level actions.
 */
export interface LLMNavigationDecision {
  /** Primary action */
  action: {
    type: 'MOVE_TO' | 'EXPLORE' | 'ROTATE_TO' | 'FOLLOW_WALL' | 'STOP';
    /** Reference to a candidate ID (e.g. "c1", "f2") */
    target_id?: string;
    /** Novel coordinate (only if no suitable candidate) */
    target_m?: [number, number];
    /** Target yaw in degrees (for ROTATE_TO) */
    yaw_deg?: number;
  };

  /** Fallback if primary action fails */
  fallback: {
    if_failed: 'EXPLORE' | 'ROTATE_TO' | 'STOP';
    target_id?: string;
  };

  /** Optional world model corrections (advisory, validated by controller) */
  world_model_update?: {
    corrections: Array<{
      pos_m: [number, number];
      observed_state: 'free' | 'obstacle' | 'unknown';
      confidence: number;
    }>;
  };

  /** Free-text explanation of the decision */
  explanation: string;
}

// =============================================================================
// Validation
// =============================================================================

const VALID_ACTION_TYPES = new Set(['MOVE_TO', 'EXPLORE', 'ROTATE_TO', 'FOLLOW_WALL', 'STOP']);
const VALID_FALLBACK_TYPES = new Set(['EXPLORE', 'ROTATE_TO', 'STOP']);

/**
 * Validate an LLM navigation decision.
 * Returns null if valid, or an error string if invalid.
 */
export function validateNavigationDecision(
  decision: unknown
): { valid: true; decision: LLMNavigationDecision } | { valid: false; error: string } {
  if (!decision || typeof decision !== 'object') {
    return { valid: false, error: 'Decision must be a JSON object' };
  }

  const d = decision as any;

  // Validate action
  if (!d.action || typeof d.action !== 'object') {
    return { valid: false, error: 'Missing or invalid "action" field' };
  }

  if (!VALID_ACTION_TYPES.has(d.action.type)) {
    return { valid: false, error: `Invalid action type: "${d.action.type}". Must be one of: ${[...VALID_ACTION_TYPES].join(', ')}` };
  }

  // MOVE_TO requires target_id or target_m
  if (d.action.type === 'MOVE_TO') {
    if (!d.action.target_id && !d.action.target_m) {
      return { valid: false, error: 'MOVE_TO requires target_id or target_m' };
    }
    if (d.action.target_m && (!Array.isArray(d.action.target_m) || d.action.target_m.length !== 2)) {
      return { valid: false, error: 'target_m must be [x, y] array' };
    }
  }

  // ROTATE_TO requires yaw_deg
  if (d.action.type === 'ROTATE_TO' && d.action.yaw_deg === undefined) {
    return { valid: false, error: 'ROTATE_TO requires yaw_deg' };
  }

  // Validate fallback
  if (!d.fallback || typeof d.fallback !== 'object') {
    return { valid: false, error: 'Missing or invalid "fallback" field' };
  }

  if (!VALID_FALLBACK_TYPES.has(d.fallback.if_failed)) {
    return { valid: false, error: `Invalid fallback type: "${d.fallback.if_failed}"` };
  }

  // Validate explanation
  if (typeof d.explanation !== 'string' || d.explanation.length === 0) {
    return { valid: false, error: 'Missing or empty "explanation" field' };
  }

  // Validate world_model_update if present
  if (d.world_model_update) {
    if (!Array.isArray(d.world_model_update.corrections)) {
      return { valid: false, error: 'world_model_update.corrections must be an array' };
    }
    for (const correction of d.world_model_update.corrections) {
      if (!Array.isArray(correction.pos_m) || correction.pos_m.length !== 2) {
        return { valid: false, error: 'Each correction must have pos_m as [x, y]' };
      }
      if (!['free', 'obstacle', 'unknown'].includes(correction.observed_state)) {
        return { valid: false, error: `Invalid observed_state: "${correction.observed_state}"` };
      }
      if (typeof correction.confidence !== 'number' || correction.confidence < 0 || correction.confidence > 1) {
        return { valid: false, error: 'correction.confidence must be a number between 0 and 1' };
      }
    }
  }

  return { valid: true, decision: d as LLMNavigationDecision };
}

/**
 * Parse and validate a JSON string as a navigation decision.
 * Handles common LLM output issues (markdown fencing, trailing commas).
 */
export function parseNavigationDecision(
  raw: string
): { valid: true; decision: LLMNavigationDecision } | { valid: false; error: string } {
  // Strip markdown code fences if present
  let cleaned = raw.trim();
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.slice(7);
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.slice(3);
  }
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.slice(0, -3);
  }
  cleaned = cleaned.trim();

  // Remove trailing commas (common LLM mistake)
  cleaned = cleaned.replace(/,\s*([}\]])/g, '$1');

  try {
    const parsed = JSON.parse(cleaned);
    return validateNavigationDecision(parsed);
  } catch (e) {
    return { valid: false, error: `JSON parse error: ${(e as Error).message}` };
  }
}
