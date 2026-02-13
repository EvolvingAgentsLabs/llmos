/**
 * Execution Frame — The Atomic Unit of LLMos Computation
 *
 * Every cycle, the Runtime LLM receives a serialized execution frame
 * and emits the next one. The frame is the atomic unit of computation.
 *
 * An execution frame contains:
 * - Goal: What the agent is trying to achieve
 * - History: Last N cycles providing temporal context
 * - Internal State: Variables representing the agent's beliefs, updated each cycle
 * - World Model: Internal spatial/environmental representation
 * - Sensor Inputs: Current physical readings — the agent's "sensory neurons"
 * - Previous Action Results: Outcomes from last cycle's commands — "motor neuron" feedback
 * - Fallback Logic: Deterministic state-maintenance that runs when LLM inference fails
 */

import type { OutputFrame, ExecutionMode, BytecodeInstruction } from './llm-bytecode';

// =============================================================================
// Execution Frame — Input to the Runtime LLM
// =============================================================================

/**
 * The complete execution frame sent to the Runtime LLM each cycle.
 * This is the serialized context that the LLM reasons over.
 */
export interface ExecutionFrame {
  /** What the agent is trying to achieve */
  goal: string;

  /** Last N cycles providing temporal context */
  history: CycleHistoryEntry[];

  /** Variables representing the agent's beliefs, updated each cycle */
  internal_state: InternalState;

  /** Internal spatial/environmental representation */
  world_model: WorldModel;

  /** Current physical readings — the agent's "sensory neurons" */
  sensor_inputs: SensorInputs;

  /** Outcomes from last cycle's commands — "motor neuron" feedback */
  previous_action_results: ActionResult[];

  /** Deterministic state-maintenance that runs when LLM inference fails */
  fallback: FallbackLogic;

  /** Metadata about this frame */
  metadata: FrameMetadata;
}

// =============================================================================
// Frame Components
// =============================================================================

/**
 * A single entry in the cycle history buffer
 */
export interface CycleHistoryEntry {
  /** Cycle number */
  cycle: number;
  /** Timestamp of this cycle */
  timestamp: number;
  /** What the agent observed */
  observation_summary: string;
  /** What action was taken */
  action_taken: string;
  /** What resulted from the action */
  result_summary: string;
  /** The execution mode during this cycle */
  mode: ExecutionMode;
}

/**
 * Internal state variables representing the agent's beliefs.
 * Updated each cycle by the Runtime LLM.
 */
export interface InternalState {
  /** Current execution mode */
  mode: ExecutionMode;
  /** Current position estimate */
  position: { x: number; y: number };
  /** Current heading in degrees (0=North, 90=East, 180=South, 270=West) */
  heading: number;
  /** Current speed estimate */
  speed: number;
  /** Battery level (0-100) */
  battery_level: number;
  /** Whether the agent believes it is stuck */
  is_stuck: boolean;
  /** Number of consecutive cycles with no progress */
  stuck_counter: number;
  /** Agent confidence in its current state beliefs (0-1) */
  confidence: number;
  /** Custom variables set by the agent */
  custom_variables: Record<string, string | number | boolean>;
}

/**
 * The agent's internal spatial/environmental representation
 */
export interface WorldModel {
  /** Grid-based map: key is "x,y" coordinate string */
  grid: Record<string, GridCell>;
  /** Known objects in the environment */
  objects: WorldObject[];
  /** Grid dimensions */
  bounds: {
    min_x: number;
    max_x: number;
    min_y: number;
    max_y: number;
  };
}

export interface GridCell {
  state: 'clear' | 'obstacle' | 'unknown' | 'visited';
  /** Last time this cell was observed */
  last_observed: number;
  /** Confidence in this cell's state (0-1) */
  confidence: number;
}

export interface WorldObject {
  label: string;
  position: { x: number; y: number };
  confidence: number;
  last_seen: number;
}

/**
 * Current sensor readings — the agent's "sensory neurons"
 */
export interface SensorInputs {
  /** Distance sensor readings in centimeters */
  distance: {
    front: number;
    front_left?: number;
    front_right?: number;
    left?: number;
    right?: number;
    back?: number;
  };
  /** IMU readings */
  imu?: {
    acceleration: { x: number; y: number; z: number };
    gyroscope: { x: number; y: number; z: number };
  };
  /** Battery voltage */
  battery_voltage?: number;
  /** Base64-encoded camera frame (if requested) */
  camera_frame?: string;
  /** Timestamp of sensor readings */
  timestamp: number;
}

/**
 * Result of a previously executed action
 */
export interface ActionResult {
  /** The instruction that was executed */
  instruction: BytecodeInstruction;
  /** Whether the instruction executed successfully */
  success: boolean;
  /** Error message if failed */
  error?: string;
  /** Actual duration of execution in ms */
  actual_duration_ms?: number;
  /** Any data returned by the instruction */
  data?: Record<string, any>;
}

/**
 * Deterministic fallback logic that runs when LLM inference fails.
 * Ensures the robot maintains safe state even without LLM guidance.
 */
export interface FallbackLogic {
  /** What to do if LLM inference times out */
  on_timeout: FallbackAction;
  /** What to do if LLM returns invalid output */
  on_invalid_output: FallbackAction;
  /** What to do if communication with host is lost */
  on_communication_loss: FallbackAction;
  /** Maximum time to wait for LLM response before triggering fallback (ms) */
  timeout_ms: number;
}

export type FallbackAction =
  | { type: 'stop'; reason: string }
  | { type: 'continue_last'; max_cycles: number }
  | { type: 'safe_reverse'; duration_ms: number }
  | { type: 'emergency_stop' };

/**
 * Metadata about the execution frame
 */
export interface FrameMetadata {
  /** Monotonically increasing cycle counter */
  cycle_number: number;
  /** Timestamp when this frame was assembled */
  timestamp: number;
  /** Maximum history entries to include */
  max_history_length: number;
  /** Agent ID that this frame belongs to */
  agent_id: string;
  /** Agent name */
  agent_name: string;
}

// =============================================================================
// Frame Construction & Serialization
// =============================================================================

/**
 * Default fallback logic — safe defaults for when LLM inference fails
 */
export const DEFAULT_FALLBACK: FallbackLogic = {
  on_timeout: { type: 'stop', reason: 'LLM inference timeout' },
  on_invalid_output: { type: 'stop', reason: 'Invalid LLM output' },
  on_communication_loss: { type: 'emergency_stop' },
  timeout_ms: 5000,
};

/**
 * Create a new empty execution frame with sensible defaults
 */
export function createExecutionFrame(
  agentId: string,
  agentName: string,
  goal: string
): ExecutionFrame {
  return {
    goal,
    history: [],
    internal_state: {
      mode: 'idle',
      position: { x: 0, y: 0 },
      heading: 0,
      speed: 0,
      battery_level: 100,
      is_stuck: false,
      stuck_counter: 0,
      confidence: 0.5,
      custom_variables: {},
    },
    world_model: {
      grid: {},
      objects: [],
      bounds: { min_x: -10, max_x: 10, min_y: -10, max_y: 10 },
    },
    sensor_inputs: {
      distance: { front: 999 },
      timestamp: Date.now(),
    },
    previous_action_results: [],
    fallback: DEFAULT_FALLBACK,
    metadata: {
      cycle_number: 0,
      timestamp: Date.now(),
      max_history_length: 10,
      agent_id: agentId,
      agent_name: agentName,
    },
  };
}

/**
 * Advance the execution frame to the next cycle.
 * Appends the current cycle to history and updates metadata.
 */
export function advanceFrame(
  frame: ExecutionFrame,
  observationSummary: string,
  actionTaken: string,
  resultSummary: string,
  newSensorInputs: SensorInputs,
  actionResults: ActionResult[]
): ExecutionFrame {
  const historyEntry: CycleHistoryEntry = {
    cycle: frame.metadata.cycle_number,
    timestamp: frame.metadata.timestamp,
    observation_summary: observationSummary,
    action_taken: actionTaken,
    result_summary: resultSummary,
    mode: frame.internal_state.mode,
  };

  // Keep history within bounds
  const history = [...frame.history, historyEntry];
  if (history.length > frame.metadata.max_history_length) {
    history.splice(0, history.length - frame.metadata.max_history_length);
  }

  return {
    ...frame,
    history,
    sensor_inputs: newSensorInputs,
    previous_action_results: actionResults,
    metadata: {
      ...frame.metadata,
      cycle_number: frame.metadata.cycle_number + 1,
      timestamp: Date.now(),
    },
  };
}

/**
 * Update the frame's internal state from an LLM output frame
 */
export function applyOutputFrame(
  frame: ExecutionFrame,
  output: OutputFrame
): ExecutionFrame {
  const updatedState = { ...frame.internal_state };
  updatedState.mode = output.mode;
  updatedState.confidence = output.confidence;

  // Apply state predictions as belief updates
  for (const prediction of output.state_predictions) {
    if (prediction.target in updatedState) {
      (updatedState as any)[prediction.target] = prediction.predicted_value;
    } else {
      updatedState.custom_variables[prediction.target] =
        prediction.predicted_value;
    }
  }

  // Apply world model updates
  const updatedWorldModel = { ...frame.world_model };
  if (output.world_model_update) {
    if (output.world_model_update.grid_updates) {
      updatedWorldModel.grid = {
        ...updatedWorldModel.grid,
      };
      for (const [key, state] of Object.entries(output.world_model_update.grid_updates)) {
        updatedWorldModel.grid[key] = {
          state,
          last_observed: Date.now(),
          confidence: 0.8,
        };
      }
    }

    if (output.world_model_update.position) {
      updatedState.position = {
        x: output.world_model_update.position.x,
        y: output.world_model_update.position.y,
      };
      updatedState.heading = output.world_model_update.position.heading;
    }

    if (output.world_model_update.objects) {
      updatedWorldModel.objects = output.world_model_update.objects.map((obj) => ({
        ...obj,
        last_seen: Date.now(),
      }));
    }
  }

  return {
    ...frame,
    internal_state: updatedState,
    world_model: updatedWorldModel,
  };
}

/**
 * Serialize an execution frame to a string for LLM input.
 * Produces a compact YAML-like format that the Runtime LLM can parse.
 */
export function serializeFrame(frame: ExecutionFrame): string {
  const lines: string[] = [];

  lines.push(`goal: ${frame.goal}`);
  lines.push(`cycle: ${frame.metadata.cycle_number}`);
  lines.push(`mode: ${frame.internal_state.mode}`);
  lines.push(`position: (${frame.internal_state.position.x}, ${frame.internal_state.position.y})`);
  lines.push(`heading: ${frame.internal_state.heading}`);
  lines.push(`battery: ${frame.internal_state.battery_level}%`);
  lines.push(`confidence: ${frame.internal_state.confidence}`);
  lines.push('');

  // Sensor readings
  lines.push('sensors:');
  lines.push(`  front: ${frame.sensor_inputs.distance.front}cm`);
  if (frame.sensor_inputs.distance.front_left !== undefined) {
    lines.push(`  front_left: ${frame.sensor_inputs.distance.front_left}cm`);
  }
  if (frame.sensor_inputs.distance.front_right !== undefined) {
    lines.push(`  front_right: ${frame.sensor_inputs.distance.front_right}cm`);
  }
  if (frame.sensor_inputs.distance.left !== undefined) {
    lines.push(`  left: ${frame.sensor_inputs.distance.left}cm`);
  }
  if (frame.sensor_inputs.distance.right !== undefined) {
    lines.push(`  right: ${frame.sensor_inputs.distance.right}cm`);
  }
  lines.push('');

  // Recent history
  if (frame.history.length > 0) {
    lines.push('recent_history:');
    const recent = frame.history.slice(-5);
    for (const entry of recent) {
      lines.push(`  - cycle ${entry.cycle}: ${entry.action_taken} → ${entry.result_summary}`);
    }
    lines.push('');
  }

  // Previous action results
  if (frame.previous_action_results.length > 0) {
    lines.push('last_action_results:');
    for (const result of frame.previous_action_results) {
      const status = result.success ? 'OK' : `FAIL: ${result.error}`;
      lines.push(`  - ${result.instruction.type}: ${status}`);
    }
    lines.push('');
  }

  // Stuck detection
  if (frame.internal_state.is_stuck) {
    lines.push(`WARNING: Agent stuck for ${frame.internal_state.stuck_counter} cycles`);
    lines.push('');
  }

  return lines.join('\n');
}
