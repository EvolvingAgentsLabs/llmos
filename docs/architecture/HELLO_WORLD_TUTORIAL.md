# Getting Started with LLMos

This guide walks you through installing LLMos, running the navigation demo, and understanding how an AI-controlled robot navigates a simulated arena.

---

## Prerequisites

- **Node.js 18+** (download from https://nodejs.org)
- **npm** (included with Node.js)
- **Git** (for cloning the repository)

Optional for real LLM testing:
- **OpenRouter API key** (from https://openrouter.ai) -- not required for mock mode

---

## Step 1: Install

```bash
git clone https://github.com/EvolvingAgentsLabs/llmos
cd llmos
npm install
```

The install takes 2-3 minutes. It pulls in Next.js 14.1.0, Three.js, React 18, Jest, Electron, and the full TypeScript runtime.

---

## Step 2: Run the Tests

Verify everything is working:

```bash
npm test
```

This runs 349 tests across 21 suites. All tests use mock LLMs and run entirely locally -- no API keys or internet connection required.

You should see output ending with:

```
Test Suites: 21 passed, 21 total
Tests:       349 passed, 349 total
```

---

## Step 3: Run the Navigation Demo (Mock Mode)

The navigation runtime can run as a standalone Node.js script without the browser or Electron. In mock mode, a deterministic strategy replaces the LLM: it parses the candidate subgoals from the prompt and always picks the highest-scoring one.

Create a file `demo-nav.ts` in the project root (or run this via `npx ts-node`):

```typescript
import { NavigationRuntime } from './lib/runtime/navigation-runtime';
import { ARENA_SIMPLE_NAVIGATION } from './lib/runtime/test-arenas';
import { createMockInference } from './lib/runtime/llm-inference';

async function main() {
  const infer = createMockInference();

  const runtime = new NavigationRuntime(ARENA_SIMPLE_NAVIGATION, infer, {
    bridgeMode: 'ground-truth',
    onCycle: (cycle, result, entry) => {
      console.log(
        `Cycle ${cycle}: ${result.decision.action.type} ` +
        `pos=(${entry.pose.x.toFixed(2)}, ${entry.pose.y.toFixed(2)}) ` +
        `goal_dist=${entry.goalDistance?.toFixed(2)}m ` +
        `exploration=${(entry.worldModel.exploration * 100).toFixed(0)}%`
      );
    },
  });

  const result = await runtime.run();
  console.log('\n' + result.report);
}

main().catch(console.error);
```

Or more directly, run one of the end-to-end tests:

```bash
npx jest --testPathPattern="navigation-e2e" --verbose
```

---

## Step 4: Understanding the Output

Each cycle prints a line showing the robot's decision-making:

```
Cycle 1: MOVE_TO pos=(-2.00, -2.00) goal_dist=4.24m exploration=12%
Cycle 2: MOVE_TO pos=(-1.70, -1.70) goal_dist=3.82m exploration=15%
Cycle 3: MOVE_TO pos=(-1.40, -1.40) goal_dist=3.39m exploration=18%
...
Cycle 12: MOVE_TO pos=(1.80, 1.80) goal_dist=0.28m exploration=45%
Cycle 13: STOP pos=(2.00, 2.00) goal_dist=0.00m exploration=48%
```

What each field means:

| Field | Description |
|---|---|
| `Cycle N` | The navigation cycle number (max 200 by default) |
| `MOVE_TO` / `EXPLORE` / `ROTATE` / `STOP` | The LLM's chosen action type |
| `pos=(x, y)` | Robot position in meters within the 5m x 5m arena |
| `goal_dist` | Euclidean distance to the navigation goal in meters |
| `exploration` | Percentage of the arena grid that has been observed |

At the end, the evaluator prints a structured report:

```
=== Navigation Evaluation: Simple Navigation ===
Result: PASS

Criteria:
  [PASS] Goal reached: 0.00m (threshold: 0.30m)
  [PASS] Collisions: 0 (max: 0)
  [PASS] Exploration: 48% (min: 0%)
  [PASS] Cycles: 13 (max: 200)
  [PASS] Stuck recovery: 0 stuck episodes
```

---

## Step 5: Try Different Arenas

The test suite includes four predefined arenas. Run the end-to-end tests to see all of them:

```bash
npx jest --testPathPattern="navigation-e2e" --verbose
```

### Arena: Simple Navigation

Robot starts in one corner, goal is diagonally across, with three obstacles in between. Tests basic pathfinding around obstacles.

### Arena: Exploration

No explicit goal. The robot must explore at least 60% of the arena. Tests frontier-based exploration using the candidate generator.

### Arena: Dead End

Robot starts inside a U-shaped dead end and must navigate out to reach the goal. Tests stuck detection and recovery.

### Arena: Narrow Corridor

Robot must navigate through a narrow passage between obstacles. Tests precision pathfinding and tight-space maneuvering.

---

## Step 6: Run with a Real LLM

To use a real LLM instead of the mock, you need an OpenRouter API key:

```bash
export OPENROUTER_API_KEY="sk-or-your-key-here"
```

Then run the OpenRouter inference tests:

```bash
npx jest --testPathPattern="openrouter-inference" --verbose
```

The OpenRouter adapter (`lib/runtime/openrouter-inference.ts`) supports any model available on OpenRouter. The default is `anthropic/claude-sonnet-4-5-20250929`, but you can configure it for vision models like `qwen/qwen3-vl-8b-instruct`.

---

## Step 7: Run the Desktop Application

For the full visual experience with Three.js 3D rendering:

```bash
# Web mode (browser)
npm run dev
# Then open http://localhost:3000

# Desktop mode (Electron)
npm run electron:dev
```

The desktop application provides:
- **RobotCanvas3D**: Three.js 3D arena with robot visualization
- **RobotWorldPanel**: Control panel with mode toggle, playback, camera presets
- **AgentDiagnosticsPanel**: Real-time agent decision monitoring
- **SceneGraphVisualization**: Visual scene graph explorer

---

## Step 8: Run Individual Test Suites

Run specific subsystem tests to understand how each component works:

```bash
# World model construction and serialization
npx jest --testPathPattern="world-model-bridge" --verbose
npx jest --testPathPattern="world-model-serializer" --verbose

# A* pathfinding
npx jest --testPathPattern="local-planner" --verbose

# Candidate subgoal generation
npx jest --testPathPattern="candidate-generator" --verbose

# Vision pipeline (camera -> world model)
npx jest --testPathPattern="vision-pipeline-e2e" --verbose
npx jest --testPathPattern="vision-simulator" --verbose

# Fleet coordination (multi-robot)
npx jest --testPathPattern="fleet-coordinator" --verbose

# Predictive world model (spatial extrapolation)
npx jest --testPathPattern="predictive-world-model" --verbose

# HAL bridge (navigation -> hardware)
npx jest --testPathPattern="navigation-hal-bridge" --verbose

# LLM decision parsing
npx jest --testPathPattern="navigation-types" --verbose
```

---

## Project Structure Overview

The key directories for robot navigation:

```
lib/runtime/
  world-model.ts              -- 50x50 occupancy grid
  world-model-serializer.ts   -- RLE JSON, ASCII, delta patches
  world-model-bridge.ts       -- Ground-truth arena -> grid
  sensor-bridge.ts            -- Vision (VLM) -> grid
  navigation-loop.ts          -- Cycle orchestrator
  navigation-runtime.ts       -- Top-level session runner
  local-planner.ts            -- A* pathfinding
  candidate-generator.ts      -- Subgoal generation
  navigation-prompt.ts        -- LLM prompt templates
  navigation-types.ts         -- Input/output schemas
  navigation-evaluator.ts     -- Run evaluation
  navigation-logger.ts        -- Cycle recording
  predictive-world-model.ts   -- Spatial extrapolation
  fleet-coordinator.ts        -- Multi-robot coordination
  navigation-hal-bridge.ts    -- HAL integration
  navigation-ui-bridge.ts     -- React UI integration
  openrouter-inference.ts     -- OpenRouter API adapter
  vision-simulator.ts         -- Ground-truth vision simulation
  vision-scene-bridge.ts      -- Detection -> scene graph
  test-arenas.ts              -- Predefined arena configs
  map-renderer.ts             -- Top-down map image for VLM

lib/hal/
  types.ts                    -- Unified hardware interface
  simulation-adapter.ts       -- Three.js simulation backend
  physical-adapter.ts         -- ESP32 hardware backend

components/robot/
  RobotCanvas3D.tsx           -- Three.js 3D arena
  RobotWorldPanel.tsx         -- Control panel
  AgentDiagnosticsPanel.tsx   -- Agent diagnostics
  SceneGraphVisualization.tsx -- Scene graph viewer

__tests__/lib/runtime/
  (21 test files)             -- Full test coverage
```

---

## Next Steps

Once you are comfortable with the basics:

- **Vision mode**: Change `bridgeMode: 'ground-truth'` to `bridgeMode: 'vision'` to see the robot build its world model incrementally from simulated camera frames instead of having perfect knowledge.

- **Custom arenas**: Create your own `TestArenaConfig` with walls, obstacles, beacons, start pose, and goal. See `lib/runtime/test-arenas.ts` for examples.

- **LLM corrections**: The navigation loop supports `applyLLMCorrections: true`, which lets the LLM propose world model corrections as part of its decision output. See `llm-corrections.test.ts`.

- **Predictive model**: Enable `enablePredictiveModel: true` in the NavigationLoop config to see spatial extrapolation in action -- the robot predicts what is in unknown cells before observing them.

- **Real hardware**: The NavigationHALBridge connects the navigation loop to the HAL for real ESP32 execution. See `lib/runtime/navigation-hal-bridge.ts` and `lib/hardware/serial-manager.ts`.

- **Fleet mode**: Instantiate a FleetCoordinator with multiple robots to see shared world model merging and frontier task assignment. See `lib/runtime/fleet-coordinator.ts`.
