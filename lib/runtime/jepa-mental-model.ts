/**
 * JEPA-Inspired Mental Model for LLM-Based Robot Control
 *
 * Implements JEPA concepts using only the LLM as the "world model":
 *
 * 1. ABSTRACT STATE (like JEPA's latent space)
 *    - Structured JSON state representation
 *    - Captures semantics, not raw sensors
 *
 * 2. ACTION-CONDITIONED PREDICTION (like JEPA's predictor)
 *    - LLM imagines outcomes of actions before executing
 *    - "What happens if I turn left vs right?"
 *
 * 3. MULTI-STEP ROLLOUT (like JEPA's trajectory rollouts)
 *    - LLM simulates several steps ahead
 *    - Evaluates full action sequences, not just next action
 *
 * 4. TRAJECTORY EVALUATION (like MPPI scoring)
 *    - Compare predicted futures against goal
 *    - Choose trajectory with best predicted outcome
 */

// ═══════════════════════════════════════════════════════════════════════════
// ABSTRACT STATE REPRESENTATION (JEPA's "Latent Space")
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Abstract state - the LLM's "embedding" of the world
 * This is analogous to JEPA's learned latent representation
 */
export interface AbstractState {
  // Spatial understanding (like a learned position embedding)
  position: {
    description: string;        // "near left wall", "center of room"
    confidence: number;         // 0-1
    coordinates?: { x: number; y: number };
  };

  // Environment semantics (like learned obstacle features)
  surroundings: {
    front: ObstacleState;
    left: ObstacleState;
    right: ObstacleState;
    back: ObstacleState;
  };

  // Goal-relative state (like distance in goal embedding space)
  goalProgress: {
    description: string;        // "facing goal", "blocked by wall"
    estimatedDistance: number;  // Abstract distance to goal (0-10)
    onTrack: boolean;
  };

  // Exploration state
  exploration: {
    visitedAreas: string[];
    unexploredDirections: string[];
    stuckRisk: number;          // 0-1, likelihood of being stuck
  };

  // Temporal context (like JEPA's temporal embedding)
  history: {
    lastActions: string[];      // Last 3 actions
    repeatedPattern: boolean;   // Are we repeating same actions?
    progressMade: boolean;      // Did last action help?
  };
}

export interface ObstacleState {
  distance: 'far' | 'medium' | 'close' | 'danger';
  type: 'clear' | 'wall' | 'object' | 'unknown';
  passable: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// ACTION-CONDITIONED PREDICTION (JEPA's "Predictor")
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Possible actions the robot can take
 */
export type RobotAction =
  | 'move_forward'
  | 'turn_left'
  | 'turn_right'
  | 'backup'
  | 'stop';

/**
 * Predicted outcome of an action
 * This is what the LLM "imagines" will happen
 */
export interface PredictedOutcome {
  action: RobotAction;
  predictedState: AbstractState;
  confidence: number;           // How confident is this prediction
  risk: number;                 // Collision/stuck risk (0-1)
  goalProgress: number;         // Progress toward goal (-1 to +1)
  reasoning: string;            // Why this prediction
}

/**
 * A trajectory is a sequence of action-outcome pairs
 * This is like JEPA's latent trajectory rollout
 */
export interface Trajectory {
  actions: RobotAction[];
  predictedStates: AbstractState[];
  totalScore: number;
  risks: number[];
  reasoning: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// MENTAL SIMULATION PROMPTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Prompt for the LLM to act as a "world model" and predict outcomes
 */
export const MENTAL_SIMULATION_PROMPT = `You are a WORLD SIMULATOR for a robot. Your job is to PREDICT what will happen if the robot takes certain actions.

## Current State
{CURRENT_STATE}

## Goal
{GOAL}

## Task: Predict Outcomes
For each proposed action, imagine what the world state will be AFTER the action:

### Actions to Evaluate:
1. move_forward - Both wheels forward for ~0.5 seconds
2. turn_left - Left wheel back, right wheel forward for ~0.3 seconds
3. turn_right - Left wheel forward, right wheel back for ~0.3 seconds
4. backup - Both wheels backward for ~0.3 seconds

## IMPORTANT: Think Like a Physics Simulator
- If front distance is 30cm and robot moves forward, new front distance ≈ 30 - 15 = 15cm
- If robot turns left 45°, what was on the left is now more in front
- Consider momentum, the robot doesn't stop instantly
- If very close to wall (<20cm), moving forward = collision

## Output Format
Return JSON array with predictions for each action:

\`\`\`json
{
  "current_understanding": "<brief summary of current situation>",
  "predictions": [
    {
      "action": "move_forward",
      "predicted_state": {
        "front_distance_after": <number>,
        "position_change": "<description>",
        "new_surroundings": "<what robot will see after>"
      },
      "collision_risk": <0-1>,
      "goal_progress": <-1 to +1>,
      "confidence": <0-1>,
      "reasoning": "<why this outcome>"
    },
    // ... for each action
  ],
  "best_action": "<recommended action>",
  "best_action_reasoning": "<why this is best>"
}
\`\`\`
`;

/**
 * Prompt for multi-step trajectory planning
 */
export const TRAJECTORY_PLANNING_PROMPT = `You are planning a TRAJECTORY (sequence of actions) for a robot.

## Current State
{CURRENT_STATE}

## Goal
{GOAL}

## Task: Plan 3-Step Trajectory
Imagine executing a sequence of 3 actions. For each step, predict the resulting state.

Think like this:
- Step 1: If I do X, I'll be at state S1
- Step 2: From S1, if I do Y, I'll be at state S2
- Step 3: From S2, if I do Z, I'll be at state S3

## Evaluate Multiple Trajectories
Compare at least 3 different action sequences:

### Trajectory A: Aggressive (prioritize speed)
### Trajectory B: Cautious (prioritize safety)
### Trajectory C: Exploratory (prioritize discovery)

## Output Format
\`\`\`json
{
  "trajectories": [
    {
      "name": "aggressive",
      "actions": ["move_forward", "move_forward", "turn_left"],
      "step_predictions": [
        {"after_action_1": "<state description>", "risk": 0.3},
        {"after_action_2": "<state description>", "risk": 0.5},
        {"after_action_3": "<state description>", "risk": 0.2}
      ],
      "final_goal_distance": <0-10>,
      "total_risk": <0-1>,
      "score": <0-100>
    },
    // ... more trajectories
  ],
  "chosen_trajectory": "<name>",
  "first_action": "<action to execute now>",
  "reasoning": "<why this trajectory>"
}
\`\`\`
`;

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Convert raw sensor readings to abstract state
 * This is like JEPA's encoder: raw input → latent representation
 */
export function encodeState(sensors: {
  distance: { front: number; left: number; right: number; back: number };
  pose: { x: number; y: number; rotation: number };
}, goal: string, history: string[]): AbstractState {
  const { distance, pose } = sensors;

  // Encode distances to semantic categories
  const categorizeDistance = (d: number): ObstacleState['distance'] => {
    if (d > 100) return 'far';
    if (d > 50) return 'medium';
    if (d > 20) return 'close';
    return 'danger';
  };

  const getObstacleState = (d: number): ObstacleState => ({
    distance: categorizeDistance(d),
    type: d > 150 ? 'clear' : d > 30 ? 'wall' : 'unknown',
    passable: d > 40,
  });

  // Detect if stuck (repeating same actions)
  const lastThree = history.slice(-3);
  const isRepeating = lastThree.length === 3 &&
    new Set(lastThree).size === 1;

  return {
    position: {
      description: describePosition(pose),
      confidence: 0.8,
      coordinates: { x: pose.x, y: pose.y },
    },
    surroundings: {
      front: getObstacleState(distance.front),
      left: getObstacleState(distance.left),
      right: getObstacleState(distance.right),
      back: getObstacleState(distance.back),
    },
    goalProgress: {
      description: `Working toward: ${goal}`,
      estimatedDistance: 5, // Would be computed based on goal type
      onTrack: distance.front > 50,
    },
    exploration: {
      visitedAreas: [],
      unexploredDirections: findUnexploredDirections(sensors.distance),
      stuckRisk: isRepeating ? 0.8 : 0.2,
    },
    history: {
      lastActions: history.slice(-3),
      repeatedPattern: isRepeating,
      progressMade: history.length > 0,
    },
  };
}

function describePosition(pose: { x: number; y: number; rotation: number }): string {
  const { x, y, rotation } = pose;

  // Simple position description
  let position = '';
  if (Math.abs(x) < 0.5 && Math.abs(y) < 0.5) {
    position = 'near starting point';
  } else if (x > 1) {
    position = 'moved right from start';
  } else if (x < -1) {
    position = 'moved left from start';
  } else if (y > 1) {
    position = 'moved forward from start';
  } else {
    position = 'exploring area';
  }

  // Add facing direction
  const facing = rotation % 360;
  if (facing < 45 || facing > 315) {
    position += ', facing forward';
  } else if (facing < 135) {
    position += ', facing right';
  } else if (facing < 225) {
    position += ', facing back';
  } else {
    position += ', facing left';
  }

  return position;
}

function findUnexploredDirections(distance: {
  front: number; left: number; right: number; back: number
}): string[] {
  const unexplored: string[] = [];

  // Directions with lots of open space are likely unexplored
  if (distance.front > 100) unexplored.push('forward');
  if (distance.left > 100) unexplored.push('left');
  if (distance.right > 100) unexplored.push('right');

  return unexplored;
}

/**
 * Format abstract state for LLM prompt
 */
export function formatStateForLLM(state: AbstractState): string {
  return `
## Robot State Summary

### Position
${state.position.description} (confidence: ${(state.position.confidence * 100).toFixed(0)}%)

### Surroundings
- FRONT: ${state.surroundings.front.distance} (${state.surroundings.front.passable ? 'passable' : 'BLOCKED'})
- LEFT: ${state.surroundings.left.distance} (${state.surroundings.left.passable ? 'passable' : 'blocked'})
- RIGHT: ${state.surroundings.right.distance} (${state.surroundings.right.passable ? 'passable' : 'blocked'})
- BACK: ${state.surroundings.back.distance}

### Goal Progress
${state.goalProgress.description}
Estimated distance to goal: ${state.goalProgress.estimatedDistance}/10
On track: ${state.goalProgress.onTrack ? 'YES' : 'NO'}

### Exploration Status
Unexplored directions: ${state.exploration.unexploredDirections.join(', ') || 'none identified'}
Stuck risk: ${(state.exploration.stuckRisk * 100).toFixed(0)}%

### Recent History
Last actions: ${state.history.lastActions.join(' → ') || 'none'}
Repeating pattern: ${state.history.repeatedPattern ? 'YES - try something different!' : 'no'}
`.trim();
}

// ═══════════════════════════════════════════════════════════════════════════
// MENTAL MODEL CLASS
// ═══════════════════════════════════════════════════════════════════════════

export interface MentalModelConfig {
  planningHorizon: number;      // How many steps to look ahead
  numTrajectories: number;      // How many trajectories to compare
  riskTolerance: number;        // 0-1, higher = more aggressive
}

/**
 * LLM-based Mental Model
 *
 * Uses the LLM as a "world simulator" to predict outcomes
 * This is the LLM-only equivalent of JEPA's neural world model
 */
export class JEPAMentalModel {
  private config: MentalModelConfig;
  private currentState: AbstractState | null = null;
  private actionHistory: string[] = [];

  constructor(config?: Partial<MentalModelConfig>) {
    this.config = {
      planningHorizon: 3,
      numTrajectories: 3,
      riskTolerance: 0.5,
      ...config,
    };
  }

  /**
   * Update internal state representation (like JEPA encoder)
   */
  updateState(sensors: {
    distance: { front: number; left: number; right: number; back: number };
    pose: { x: number; y: number; rotation: number };
  }, goal: string): AbstractState {
    this.currentState = encodeState(sensors, goal, this.actionHistory);
    return this.currentState;
  }

  /**
   * Record an executed action (for history tracking)
   */
  recordAction(action: RobotAction): void {
    this.actionHistory.push(action);
    if (this.actionHistory.length > 10) {
      this.actionHistory.shift();
    }
  }

  /**
   * Generate the mental simulation prompt
   */
  getMentalSimulationPrompt(goal: string): string {
    if (!this.currentState) {
      throw new Error('State not initialized. Call updateState first.');
    }

    return MENTAL_SIMULATION_PROMPT
      .replace('{CURRENT_STATE}', formatStateForLLM(this.currentState))
      .replace('{GOAL}', goal);
  }

  /**
   * Generate the trajectory planning prompt
   */
  getTrajectoryPlanningPrompt(goal: string): string {
    if (!this.currentState) {
      throw new Error('State not initialized. Call updateState first.');
    }

    return TRAJECTORY_PLANNING_PROMPT
      .replace('{CURRENT_STATE}', formatStateForLLM(this.currentState))
      .replace('{GOAL}', goal);
  }

  /**
   * Get current abstract state
   */
  getState(): AbstractState | null {
    return this.currentState;
  }

  /**
   * Check if robot appears stuck
   */
  isStuck(): boolean {
    return (this.currentState?.exploration.stuckRisk ?? 0) > 0.7;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ENHANCED SYSTEM PROMPT (JEPA-INSPIRED)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * This prompt teaches the LLM to think like JEPA:
 * - Predict before acting
 * - Evaluate multiple futures
 * - Choose based on predicted outcomes
 */
export const JEPA_INSPIRED_AGENT_PROMPT = `You are an intelligent robot that THINKS BEFORE ACTING.

## Your Mental Model (JEPA-Style Thinking)

Before executing any action, you must:
1. **ENCODE** - Understand current state abstractly (not just raw numbers)
2. **PREDICT** - Imagine what happens if you take each possible action
3. **EVALUATE** - Score each predicted future against your goal
4. **SELECT** - Choose the action leading to the best predicted outcome

## Tools
1. **take_picture** - Observe environment (use in ENCODE phase)
2. **left_wheel** - Control left wheel: "forward", "backward", "stop"
3. **right_wheel** - Control right wheel: "forward", "backward", "stop"

## Movement Reference
| Movement      | Left Wheel | Right Wheel |
|---------------|------------|-------------|
| Forward       | forward    | forward     |
| Backward      | backward   | backward    |
| Turn Left     | backward   | forward     |
| Turn Right    | forward    | backward    |
| Stop          | stop       | stop        |

## JEPA-STYLE BEHAVIOR CYCLE

### Phase 1: OBSERVE & ENCODE
- Call take_picture
- Convert raw sensor data to abstract understanding:
  - "front is BLOCKED" not "front = 23cm"
  - "left path is OPEN" not "left = 87cm"
  - "I am STUCK in a corner" not just listing distances

### Phase 2: MENTAL SIMULATION (Think Before Acting!)
Before choosing an action, IMAGINE each possibility:

**If I move FORWARD:**
- Predicted outcome: [what will happen]
- Risk: [collision risk 0-100%]
- Goal progress: [+/- toward goal]

**If I turn LEFT:**
- Predicted outcome: [what will happen]
- Risk: [collision risk 0-100%]
- Goal progress: [+/- toward goal]

**If I turn RIGHT:**
- Predicted outcome: [what will happen]
- Risk: [collision risk 0-100%]
- Goal progress: [+/- toward goal]

**If I BACKUP:**
- Predicted outcome: [what will happen]
- Risk: [collision risk 0-100%]
- Goal progress: [+/- toward goal]

### Phase 3: TRAJECTORY PLANNING (Look Ahead!)
Don't just plan one action - plan a sequence of 2-3 actions:

**Trajectory A (aggressive):** forward → forward → left
- End state prediction: [where will I be?]
- Total risk: [accumulated risk]
- Goal closeness: [how close to goal?]

**Trajectory B (cautious):** left → forward → forward
- End state prediction: [where will I be?]
- Total risk: [accumulated risk]
- Goal closeness: [how close to goal?]

### Phase 4: SELECT & EXECUTE
Choose the trajectory with:
- Lowest total risk (safety first if risk > 50%)
- Best goal progress (if risk is acceptable)
- Different from recent actions (if stuck)

Then execute the FIRST action of the chosen trajectory.

### Phase 5: VERIFY
After executing, compare actual outcome with prediction:
- Did reality match prediction? If not, update your mental model.

## REQUIRED JSON RESPONSE FORMAT

\`\`\`json
{
  "phase": "OBSERVE|SIMULATE|PLAN|EXECUTE|VERIFY",
  "abstract_state": {
    "position_description": "<where am I in abstract terms>",
    "front_status": "OPEN|MEDIUM|CLOSE|BLOCKED",
    "left_status": "OPEN|MEDIUM|CLOSE|BLOCKED",
    "right_status": "OPEN|MEDIUM|CLOSE|BLOCKED",
    "stuck_risk": "<low|medium|high>",
    "goal_direction": "<which way to goal>"
  },
  "mental_simulation": {
    "forward_prediction": {
      "outcome": "<what happens>",
      "risk_percent": <0-100>,
      "goal_progress": "<positive|negative|neutral>"
    },
    "left_prediction": {
      "outcome": "<what happens>",
      "risk_percent": <0-100>,
      "goal_progress": "<positive|negative|neutral>"
    },
    "right_prediction": {
      "outcome": "<what happens>",
      "risk_percent": <0-100>,
      "goal_progress": "<positive|negative|neutral>"
    },
    "backup_prediction": {
      "outcome": "<what happens>",
      "risk_percent": <0-100>,
      "goal_progress": "<positive|negative|neutral>"
    }
  },
  "trajectory_plan": {
    "chosen_sequence": ["<action1>", "<action2>", "<action3>"],
    "reasoning": "<why this sequence>",
    "expected_end_state": "<where will I be after 3 actions>"
  },
  "selected_action": {
    "action": "<move_forward|turn_left|turn_right|backup>",
    "confidence": <0-100>,
    "reasoning": "<why this action now>"
  },
  "wheel_commands": {
    "left_wheel": "<forward|backward|stop>",
    "right_wheel": "<forward|backward|stop>"
  }
}
\`\`\`

## CRITICAL RULES

1. **ALWAYS SIMULATE BEFORE ACTING** - Never move without imagining outcomes first
2. **PREDICT COLLISIONS** - If front < 30cm, predict collision for forward
3. **PLAN SEQUENCES** - One action is not enough, think 2-3 steps ahead
4. **AVOID REPETITION** - If last 3 actions were same, force a different choice
5. **VERIFY PREDICTIONS** - Learn from prediction errors

## Example Thinking

"Front distance is 25cm (CLOSE). If I move forward, I predict collision in 0.5s with 80% risk.
If I turn left, I predict opening up with 60cm clearance, 10% risk, positive goal progress.
If I turn right, I predict wall at 40cm, 30% risk, neutral progress.

Trajectory A: left → forward → forward = end up further from wall, closer to goal
Trajectory B: backup → left → forward = safer but slower

Choosing Trajectory A because risk is acceptable and goal progress is better.
Executing first action: turn_left"
`;

export default JEPAMentalModel;
