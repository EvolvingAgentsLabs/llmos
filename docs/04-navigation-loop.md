---
layout: default
title: "4. The Navigation Loop"
nav_order: 4
---

# Chapter 4: The Navigation Loop -- 13 Steps from Sensor to Motor

![Circular pipeline of 13 glowing nodes forming a loop around the robot](assets/chapter-04.png)

<!-- IMAGE_PROMPT: Isometric digital illustration, clean technical style, dark navy (#0d1117) background, soft neon accent lighting in cyan and magenta, a small wheeled robot with a glowing blue eye sensor as recurring character, flat vector aesthetic with subtle depth, no photorealism, 16:9 aspect ratio. Circular pipeline of 13 numbered glowing nodes connected by arrows forming a loop around the robot. Key nodes labeled: Sensors, World Model, Candidates, LLM, Planner, HAL. Robot in center, data flows clockwise. LLM node glows brightest. -->

Every 200 milliseconds, a robot must answer the most fundamental question in embodied AI: "What do I do next?" Not in the abstract, philosophical sense, but in the concrete, actuator-commanding sense. The answer must account for what the robot currently sees, what it remembers about the world, where it is trying to go, whether it is stuck, and what went wrong last time. In LLMos, this question is answered by the **Navigation Loop** -- a 13-step pipeline that transforms raw sensor data into a planned, collision-free path ready for motor execution.

This is the heart of the system. Everything else -- the world model, the vision pipeline, the scene graph, the HAL -- exists to serve this loop.

## The Architecture

The Navigation Loop follows a strict separation of concerns that is worth stating plainly: **the LLM picks strategy (WHERE to go), classical planners execute (HOW to get there). The LLM never touches motor PWM.**

This is not a limitation. It is the central design insight. Language models are extraordinary at high-level reasoning -- weighing tradeoffs, interpreting ambiguous situations, recovering from novel failures. They are terrible at computing collision-free trajectories through a grid. The Navigation Loop gives each system the job it does best.

The full pipeline, implemented in `NavigationLoop.runCycle()` in `lib/runtime/navigation-loop.ts`:

```
Sensors --> WorldModel --> Serializer --> Candidates --> Prompt --> LLM
  --> Decision Validation --> Local Planner --> HAL --> Sensors
```

## The InferenceFunction Abstraction

Before walking through the 13 steps, it is worth understanding how the loop stays testable. The constructor takes an `InferenceFunction` -- a simple async callback that abstracts the entire LLM backend:

```typescript
// lib/runtime/navigation-loop.ts

export type InferenceFunction = (
  systemPrompt: string,
  userMessage: string,
  images?: string[]
) => Promise<string>;
```

In production, this calls OpenRouter or a local Qwen3-VL endpoint. In tests, it returns a canned JSON string. The orchestrator does not care. This abstraction is what makes a 346-test suite possible without any LLM API calls.

## The 13 Steps

### Step 1: Check Goal Reached

The simplest check comes first. If the robot has a goal and is within `goalToleranceM` (default 0.3 meters) of it, the cycle short-circuits with a STOP decision:

```typescript
// lib/runtime/navigation-loop.ts

private isGoalReached(): boolean {
  if (!this.goal) return false;
  const dx = this.state.position.x - this.goal.x;
  const dy = this.state.position.y - this.goal.y;
  return Math.sqrt(dx * dx + dy * dy) <= this.config.goalToleranceM;
}
```

Thirty centimeters of tolerance may seem generous, but physical robots have noisy localization. Demanding centimeter-perfect arrival would cause the robot to oscillate around the goal indefinitely.

### Step 2: Detect Stuck State

If the robot moved less than 5cm since the last cycle, the stuck counter increments. After 5 consecutive stuck cycles, the robot enters recovery mode:

```typescript
// lib/runtime/navigation-loop.ts

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
```

The `isStuck` flag propagates to the candidate generator, which responds by producing recovery candidates -- safe retreat positions the robot can back up to.

### Step 3: Generate Candidates

The `CandidateGenerator` (`lib/runtime/candidate-generator.ts`) produces 3-5 ranked subgoals for the LLM to choose from. The LLM never invents coordinates from thin air; it selects from a curated menu of options that classical analysis has already vetted.

Three types of candidates are generated:

**Goal-directed subgoals** are placed every ~1 meter along the straight-line path to the goal. Each is scored by a weighted heuristic:

```
score = w_goal * (1 / distance_to_goal)
      + w_clearance * min_clearance
      + w_novelty * unexplored_cells_nearby
      + w_feasibility * (1 / path_cost)
```

The default weights (`lib/runtime/candidate-generator.ts`):

```typescript
// lib/runtime/candidate-generator.ts

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
```

**Frontier candidates** come from the boundary between explored and unknown space. The generator clusters nearby frontier cells (within 0.5m) and picks the centroid of each cluster. Frontiers aligned with the goal direction score higher.

**Recovery candidates** are only generated when the robot is stuck. These are free cells in a ring around the robot, sorted by clearance from obstacles and preferring cells with low visit counts:

```typescript
// lib/runtime/candidate-generator.ts

// Sort by clearance (descending), then by visit count (ascending)
candidates.sort((a, b) => {
  if (Math.abs(a.clearance - b.clearance) > 0.1) return b.clearance - a.clearance;
  return a.visitCount - b.visitCount;
});
```

After scoring, candidates within 0.5 meters of each other are deduplicated (the higher-scored one wins), and the top 5 are returned.

### Step 4: Serialize World Model

The world model is serialized using the `'auto'` format, which sends a full RLE JSON frame on the first cycle and patches thereafter (see Chapter 3 for details on the serialization formats).

### Step 5: Generate Map Image

The `MapRenderer` produces a top-down PNG showing the occupancy grid, robot position, goal marker, candidate positions, and frontier cells. This image is sent to the LLM as a multimodal input alongside the text prompt. Vision-capable models like Qwen3-VL can reason about spatial relationships in the image that are hard to express in text.

Map image generation can be disabled with `generateMapImages: false` -- necessary in test environments without a DOM canvas.

### Step 6: Assemble Navigation Frame

All the pieces come together in a single `NavigationFrame` object -- the complete input to the LLM:

```typescript
// lib/runtime/navigation-types.ts

export interface NavigationFrame {
  cycle: number;
  goal: string;
  world_model: GridSerializationJSON | GridPatchUpdate;
  symbolic_layer: {
    objects: Array<{ id: string; type: string; bbox_m: [...]; label?: string }>;
    topology: {
      waypoints: Array<{ id: string; pos_m: [number, number]; label: string }>;
      edges: Array<{ from: string; to: string; cost: number;
                     status: 'clear' | 'blocked' | 'unknown' }>;
    };
  };
  candidates: Array<{
    id: string;
    type: 'subgoal' | 'frontier' | 'waypoint' | 'recovery';
    pos_m: [number, number];
    score: number;
    note: string;
  }>;
  last_step: { action: string; result: string; details: string };
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
  history: Array<{ cycle: number; action: string; result: string }>;
  map_image?: string;
  camera_frame?: string;
}
```

This frame has three layers of spatial representation: the occupancy grid (Layer 1), the symbolic scene graph (Layer 2), and the candidate subgoals (Layer 3). The LLM sees all three simultaneously, plus the robot's internal state, recent history, and optionally a map image and camera frame.

### Step 7: Call LLM Inference

The assembled prompt is sent to the LLM with a timeout (default 5 seconds):

```typescript
// lib/runtime/navigation-loop.ts

const rawResponse = await Promise.race([
  this.infer(
    'You are a navigation robot brain. Respond with JSON only.',
    prompt,
    images.length > 0 ? images : undefined
  ),
  new Promise<string>((_, reject) =>
    setTimeout(() => reject(new Error('LLM inference timeout')),
               this.config.inferenceTimeoutMs)
  ),
]);
```

If inference succeeds, the response is parsed. If it fails or times out, a fallback decision is generated automatically. The system's confidence score adjusts: successful parses increase it by 0.1, invalid responses decrease it by 0.2, and total failures decrease it by 0.3.

### Step 8: Parse and Validate Response

The `parseNavigationDecision()` function in `lib/runtime/navigation-types.ts` handles the messy reality of LLM output. Language models do not always produce clean JSON. The parser handles:

- **Markdown code fences**: Strips `` ```json `` and `` ``` `` wrappers
- **Trailing commas**: Removes commas before `}` or `]` (a common LLM mistake)
- **Qwen3 think tags**: Strips `<think>...</think>` reasoning blocks
- **Embedded JSON**: Extracts `{...}` from free-form text responses

After cleaning, the normalizer maps free-form LLM responses to the expected schema:

```typescript
// lib/runtime/navigation-types.ts

const ACTION_MAP: Record<string, string> = {
  'MOVE': 'MOVE_TO',
  'MOVE_TO': 'MOVE_TO',
  'MOVETO': 'MOVE_TO',
  'GO': 'MOVE_TO',
  'GO_TO': 'MOVE_TO',
  'NAVIGATE': 'MOVE_TO',
  'EXPLORE': 'EXPLORE',
  'SCAN': 'EXPLORE',
  'ROTATE': 'ROTATE_TO',
  'ROTATE_TO': 'ROTATE_TO',
  'TURN': 'ROTATE_TO',
  'FOLLOW_WALL': 'FOLLOW_WALL',
  'WALL_FOLLOW': 'FOLLOW_WALL',
  'STOP': 'STOP',
  'HALT': 'STOP',
  'WAIT': 'STOP',
};
```

This normalization layer is what makes it possible to swap between different LLM backends (Claude, Qwen3, Llama) without changing the navigation loop. Each model has its own quirks in output formatting, but the normalizer brings them all into the same `LLMNavigationDecision` schema.

### Step 9: Apply LLM Corrections

The LLM's response can optionally include `world_model_update` corrections -- suggestions to change the state of specific grid cells. For example, the LLM might look at the camera frame and notice that a cell marked as `obstacle` is actually `free` (a phantom reading from a noisy sensor).

These corrections are validated before being applied:

```typescript
// lib/runtime/navigation-loop.ts

private applyCorrections(
  corrections: Array<{ pos_m: [number, number]; observed_state: 'free' | 'obstacle' | 'unknown';
                        confidence: number }>,
  worldModel: WorldModel
): void {
  const grid = worldModel.getGrid();
  for (const correction of corrections) {
    if (correction.confidence < this.config.llmCorrectionMinConfidence) continue;
    const { gx, gy } = worldModel.worldToGrid(correction.pos_m[0], correction.pos_m[1]);
    if (!worldModel.isValidGridCoord(gx, gy)) continue;
    const cell = grid[gy][gx];
    if (cell.state === 'explored') continue;
    if (cell.confidence > this.config.llmCorrectionMaxOverride) continue;
    cell.state = correction.observed_state;
    cell.confidence = Math.min(correction.confidence, this.config.llmCorrectionMaxOverride);
    cell.lastUpdated = Date.now();
  }
}
```

Two safeguards prevent the LLM from corrupting the map. First, corrections below `llmCorrectionMinConfidence` (0.6) are ignored. Second, the LLM cannot override cells with sensor confidence above `llmCorrectionMaxOverride` (0.7). The robot's direct sensor experience always wins over the LLM's interpretation when the sensor data is strong.

### Step 10: Run Predictive Model

If `enablePredictiveModel` is true, the system runs the predictive world model (`lib/runtime/predictive-world-model.ts`). This Phase 5 module verifies whether previous predictions were correct and generates new spatial predictions based on heuristics. This is an advanced feature covered in Chapter 8.

### Step 11: Plan Path with A* Planner

For MOVE_TO and EXPLORE actions, the `LocalPlanner` (`lib/runtime/local-planner.ts`) runs A* pathfinding on the occupancy grid to produce a collision-free path.

The planner builds a cost map from the grid:

```typescript
// lib/runtime/local-planner.ts (buildCostMap)

// Base costs
if (state === 'obstacle' || state === 'wall') {
  costMap[y][x] = 999;       // Impassable
} else if (state === 'unknown') {
  costMap[y][x] = this.config.unknownCellCost;  // Default: 5
} else {
  costMap[y][x] = 1;          // Free/explored: cheap
}
```

The cost for unknown cells (default: 5, configurable up to 50 in vision mode) controls how adventurous the planner is. A cost of 5 means the planner will cross unknown territory if it significantly shortens the path, but prefers known-free routes when available. A cost of 50 makes it strongly avoid unknown areas.

Obstacle inflation adds cost to cells adjacent to obstacles, keeping paths away from walls even when they are technically free:

```typescript
// lib/runtime/local-planner.ts

const inflatedCost = 1 + (multiplier - 1) * (1 - dist / (inflation + 1));
costMap[ny][nx] = Math.max(costMap[ny][nx], inflatedCost);
```

The A* search uses an octile distance heuristic, which is consistent for 8-directional movement:

```typescript
// lib/runtime/local-planner.ts

private heuristic(ax: number, ay: number, bx: number, by: number): number {
  const dx = Math.abs(ax - bx);
  const dy = Math.abs(ay - by);
  return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
}
```

The planner enforces a 100ms timeout. For a 50x50 grid this is generous -- typical paths compute in under 5ms -- but it prevents pathological cases from blocking the navigation cycle.

The output is a `PathResult` containing `PathWaypoint[]` in world coordinates, ready for HAL execution:

```typescript
// lib/runtime/local-planner.ts

export interface PathWaypoint {
  x: number;      // World X coordinate (meters)
  y: number;      // World Y coordinate (meters)
  gx: number;     // Grid X coordinate
  gy: number;     // Grid Y coordinate
  index: number;  // Index in the waypoint list
}
```

If path planning fails (goal unreachable, timeout), the system automatically applies the LLM's specified fallback action.

### Step 12: Update Mode

The navigation mode transitions based on the LLM's chosen action:

```typescript
// lib/runtime/navigation-loop.ts

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
```

The six possible modes -- `idle`, `navigating`, `exploring`, `avoiding_obstacle`, `recovering`, `goal_reached` -- are visible to the LLM on the next cycle, giving it context about the robot's behavioral state.

### Step 13: Return CycleResult

The cycle completes by returning a `CycleResult` containing the decision, planned path, current mode, timing information, and flags for goal-reached and stuck states:

```typescript
// lib/runtime/navigation-loop.ts

export interface CycleResult {
  cycle: number;
  decision: LLMNavigationDecision;
  path: PathResult | null;
  mode: NavigationMode;
  goalReached: boolean;
  isStuck: boolean;
  frame: NavigationFrame;
  cycleTimeMs: number;
}
```

The caller (typically the Navigation HAL Bridge or the demo script) reads this result and executes the planned path through the HAL -- moving motors, waiting for waypoints, and reporting the outcome back for the next cycle.

## The LLM Decision Schema

The strict JSON schema the LLM must return:

```typescript
// lib/runtime/navigation-types.ts

export interface LLMNavigationDecision {
  action: {
    type: 'MOVE_TO' | 'EXPLORE' | 'ROTATE_TO' | 'FOLLOW_WALL' | 'STOP';
    target_id?: string;           // Reference to candidate ID ("c1", "f2")
    target_m?: [number, number];  // Novel coordinate (only if no candidate fits)
    yaw_deg?: number;             // Target yaw (for ROTATE_TO)
  };
  fallback: {
    if_failed: 'EXPLORE' | 'ROTATE_TO' | 'STOP';
    target_id?: string;
  };
  world_model_update?: {
    corrections: Array<{
      pos_m: [number, number];
      observed_state: 'free' | 'obstacle' | 'unknown';
      confidence: number;
    }>;
  };
  explanation: string;
}
```

Every decision includes a fallback. If the primary action fails (path blocked, target unreachable), the system executes the fallback without another LLM call. This keeps the robot responsive even when the LLM makes mistakes.

## Configuration

The full set of tunable parameters:

```typescript
// lib/runtime/navigation-loop.ts

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
  enablePredictiveModel: false,
};
```

For tests, the typical overrides are `generateMapImages: false` (no DOM canvas in Jest) and a mock `InferenceFunction` that returns predetermined JSON responses.

## The Cycle in Motion

To make this concrete, here is what a single cycle looks like during a typical navigation run:

1. The robot is at position (0.5, 0.3) facing east, trying to reach goal (2.0, 1.5).
2. It has moved 8cm since the last cycle, so it is not stuck.
3. The candidate generator produces: subgoal `c1` at (1.0, 0.7), subgoal `c2` at (1.5, 1.1), frontier `f3` at (0.2, -0.5), and the goal itself as `c4` at (2.0, 1.5).
4. The world model serializes as a patch with 12 changed cells.
5. A map image renders showing the explored corridor, an obstacle wall to the north, and the candidates marked with colored dots.
6. Everything is assembled into a NavigationFrame and sent to the LLM.
7. The LLM responds: `{"action": {"type": "MOVE_TO", "target_id": "c2"}, "fallback": {"if_failed": "EXPLORE"}, "explanation": "c2 makes good progress toward goal while avoiding the obstacle cluster to the north."}`.
8. The parser validates the response. It is clean JSON, valid schema.
9. No world model corrections in this response.
10. Predictive model is disabled.
11. The A* planner finds a 14-cell path from (0.5, 0.3) to (1.5, 1.1), avoiding the obstacle wall. Planning time: 2ms.
12. Mode set to `navigating`.
13. CycleResult returned with the path. The HAL bridge begins executing waypoints.

Total cycle time: ~180ms, of which ~150ms was waiting for the LLM.

## Chapter Summary

The Navigation Loop is a 13-step pipeline that transforms the robot's sensor readings and spatial memory into a planned, collision-free path. The LLM reasons about strategy -- which candidate to pursue, when to explore versus push toward the goal, how to recover from being stuck. Classical algorithms handle the mechanics -- A* pathfinding, collision avoidance, coordinate conversion. The response normalizer bridges the gap between messy LLM output and the strict schema the planner requires.

In the next chapter, we will look at the vision pipeline that feeds camera frames into the world model, giving the robot eyes as well as distance sensors.

---

*Previous: [Chapter 3 -- The World Model: How a Robot Thinks About Space](03-world-model.md)*
*Next: [Chapter 5 -- The Dual Brain: Instinct, Planning, and Escalation](05-dual-brain-controller.md)*
