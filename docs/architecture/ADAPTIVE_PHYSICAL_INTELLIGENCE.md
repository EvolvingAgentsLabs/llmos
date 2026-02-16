# LLMos Architecture: Adaptive Physical Intelligence

## The Thesis

The LLM is the operating system kernel for physical agents.

Traditional robotics treats the LLM as an accessory -- a code generator, a natural language interface, an occasionally-consulted planner. The intelligence lives in compiled firmware. The LLM is a tool.

LLMos inverts this. The LLM is the kernel. It reads sensor state, maintains an internal world model, selects subgoals, and emits structured instructions every cycle. The microcontroller is a peripheral that exposes tools. The firmware is an instruction interpreter, not a decision-maker.

This is not a metaphor. The LLMos runtime loop is architecturally equivalent to a CPU fetch-decode-execute cycle: fetch sensor state, decode world model context, execute LLM inference, write actuator commands. The cycle repeats until the goal is reached or the system halts.

---

## Three-Layer Architecture

LLMos is organized into three layers. Each layer has a strict contract with the next, and no layer reaches into the internals of another.

```
Presentation Layer (What the user sees)
  |
  v
Application Layer (What the agents do)
  |
  v
Runtime Layer (How the robot thinks and acts)
```

### Presentation Layer

Technology: Next.js 14.1.0, React 18, Three.js, Electron

The presentation layer provides the human interface to the robot system:

| Component | File | Purpose |
|---|---|---|
| RobotCanvas3D | `components/robot/RobotCanvas3D.tsx` | Three.js 3D arena rendering with robot, obstacles, paths |
| RobotWorldPanel | `components/robot/RobotWorldPanel.tsx` | Control panel: mode toggle (sim/real/replay), playback, camera presets, telemetry |
| AgentDiagnosticsPanel | `components/robot/AgentDiagnosticsPanel.tsx` | Real-time display of agent decisions, escalation events, brain mode |
| SceneGraphVisualization | `components/robot/SceneGraphVisualization.tsx` | Interactive scene graph explorer |
| RobotWorkspace | `components/workspace/RobotWorkspace.tsx` | Three-panel layout: file browser + 3D world + chat |
| NavigationUIBridge | `lib/runtime/navigation-ui-bridge.ts` | State bridge: emits navigation state, predictions, fleet status to React |

The presentation layer subscribes to state updates from the runtime layer via the NavigationUIBridge. It never calls into the navigation loop directly.

### Application Layer

Technology: TypeScript, Markdown agent definitions

The application layer manages agents, skills, and multi-agent orchestration:

| Component | Directory | Purpose |
|---|---|---|
| Agent definitions | `public/system/agents/` | 14+ system agents as markdown files with YAML frontmatter |
| Skill cartridges | `public/volumes/system/skills/` | 20+ reusable skills as markdown files |
| Agent compiler | `lib/agents/agent-compiler.ts` | Compiles agent markdown into executable runtime configs |
| Agent loader | `lib/agents/agent-loader.ts` | Discovers and loads agents from the volume system |
| Multi-agent validator | `lib/agents/multi-agent-validator.ts` | Validates multi-agent workflow plans |
| Model-aware orchestrator | `lib/agents/model-aware-orchestrator.ts` | Routes tasks to appropriate LLM models |
| Kernel rules | `public/system/kernel/` | Orchestration, evolution, and memory rules |
| Volume system | `public/volumes/` | Three-tier: system (read-only) / team (shared) / user (personal) |

### Runtime Layer

Technology: TypeScript, Jest

The runtime layer is the robot's cognitive engine. It is entirely headless -- no browser, no React, no Three.js required. This is the layer that can run as a standalone Node.js process on a Raspberry Pi controlling an ESP32.

| Subsystem | Key Files | Purpose |
|---|---|---|
| World Model | `lib/runtime/world-model.ts`, `world-model-serializer.ts`, `world-model-bridge.ts` | 50x50 occupancy grid, RLE serialization, ground-truth and vision bridges |
| Navigation | `lib/runtime/navigation-loop.ts`, `navigation-runtime.ts`, `local-planner.ts` | Cycle orchestration, A* pathfinding, session management |
| Candidates | `lib/runtime/candidate-generator.ts` | 3-5 ranked subgoals per cycle for LLM selection |
| Vision | `lib/runtime/sensor-bridge.ts`, `vision-simulator.ts`, `vision-scene-bridge.ts` | VLM-based grid construction, ground-truth simulation, scene graph projection |
| Prediction | `lib/runtime/predictive-world-model.ts` | Spatial extrapolation of unknown cells |
| Fleet | `lib/runtime/fleet-coordinator.ts` | Multi-robot world model merging and task assignment |
| HAL | `lib/hal/types.ts`, `simulation-adapter.ts`, `physical-adapter.ts` | Unified hardware interface for sim and physical |
| Dual-Brain | `lib/runtime/dual-brain-controller.ts`, `rsa-engine.ts` | Instinct (fast) + planner (deep) cognitive architecture |
| Inference | `lib/runtime/openrouter-inference.ts`, `llm-inference.ts` | OpenRouter API adapter and mock inference |
| Evaluation | `lib/runtime/navigation-evaluator.ts`, `navigation-logger.ts` | Run assessment and cycle-by-cycle recording |

---

## Skill Cartridges: Robot Apps

A skill cartridge is a markdown file that transforms a generic robot into a specialist. It is the robot equivalent of a smartphone app.

```markdown
---
name: WallFollowerAgent
type: specialist
capabilities:
  - obstacle_avoidance
  - wall_following
  - spatial_reasoning
tools:
  - Bash
  - Read
  - Write
model: qwen/qwen3-vl-8b-instruct
version: 2.1.0
---

# WallFollowerAgent

You are a reactive navigation agent specialized in wall-following behavior.

## Perception
Analyze VisionFrame and sensor readings each cycle. Identify walls,
openings, and obstacles using depth estimates.

## Decision Rules
1. If wall detected within 15cm on right: maintain distance, continue forward
2. If opening detected on right: turn right 45 degrees
3. If obstacle ahead within 20cm: turn left until clear
4. If no wall detected: spiral right until wall contact

## Learned Patterns
- Right-side wall following is 23% more efficient in rectangular rooms
- Gentle turns (60/100 differential) outperform sharp turns (0/100)
- Battery conservation: reduce speed below 30% charge
```

The agent definition IS the documentation IS the evolution history. When the system learns a new pattern, the development LLM writes it into the agent file. When an agent needs to improve, the development LLM edits its markdown.

Skill cartridges flow through the volume system:
- **User volume**: Personal experiments and custom agents
- **Team volume**: Agents proven across team members (promoted at 80% success rate over 5+ uses)
- **System volume**: Immutable foundation agents that ship with the repository

---

## HAL: Unified Interface for Simulation and Hardware

The Hardware Abstraction Layer ensures that the same navigation decision produces the same behavior regardless of the execution environment.

### Interface Design

```
HardwareAbstractionLayer
  |-- mode: simulation | physical | hybrid
  |-- locomotion: LocomotionInterface
  |     |-- drive(left, right, durationMs?)
  |     |-- moveTo(x, y, z, speed?)
  |     |-- rotate(direction, degrees)
  |     |-- moveForward(distanceCm)
  |     |-- moveBackward(distanceCm)
  |     |-- stop()
  |     |-- getPose()
  |
  |-- vision: VisionInterface
  |     |-- captureFrame()
  |     |-- scan(mode: full | targeted | quick)
  |     |-- getDistanceSensors()
  |     |-- getLineSensors()
  |     |-- getIMU()
  |
  |-- manipulation: ManipulationInterface
  |     |-- moveTo(x, y, z, speed?)
  |     |-- grasp(force, mode)
  |     |-- extend(distance)
  |     |-- retract()
  |     |-- setPrecisionMode(enabled)
  |
  |-- communication: CommunicationInterface
  |     |-- speak(text, urgency?)
  |     |-- playSound(soundId)
  |     |-- setLED(color)
  |     |-- listenForCommand()
  |
  |-- safety: SafetyInterface
        |-- getStatus()
        |-- emergencyStop()
        |-- setOperatingLimits(limits)
```

### Implementation

Two concrete adapters implement this interface:

- **SimulationAdapter** (`lib/hal/simulation-adapter.ts`): Backed by the Three.js renderer and simulated physics. All HAL calls update the simulation state and return computed results.
- **PhysicalAdapter** (`lib/hal/physical-adapter.ts`): Backed by the ESP32 serial/WiFi connection. HAL calls are translated into serial commands sent to the microcontroller.

The NavigationHALBridge (`lib/runtime/navigation-hal-bridge.ts`) connects the NavigationLoop to whichever adapter is active. It translates cycle results (MOVE_TO, ROTATE, STOP) into sequences of HAL method calls and feeds sensor feedback back into the world model.

---

## Dual-Brain: Instinct Layer and Planner Layer

The DualBrainController (`lib/runtime/dual-brain-controller.ts`) implements a two-tier cognitive architecture inspired by JEPA (Joint Embedding Predictive Architecture) and RSA (Recursive Self-Aggregation).

### Instinct Layer (Fast, Reactive)

- **Model**: Qwen3-VL-8B, single-pass inference
- **Latency**: ~200-500ms
- **Purpose**: Reflexive behaviors -- obstacle avoidance, wall following, object tracking
- **Input**: Compact world model summary (~200 tokens) + camera frame
- **Output**: Immediate action (MOVE_TO, ROTATE, STOP)

The instinct layer is always active. It processes every cycle and provides a baseline response.

### Planner Layer (Deliberative)

- **Model**: Qwen3-VL-8B + RSA (Recursive Self-Aggregation)
- **Latency**: ~3-8 seconds
- **Purpose**: Strategic decisions -- exploration planning, recovery, skill generation, fleet coordination
- **Input**: Full world model summary (~800-1200 tokens) + camera frame + map image
- **Output**: Multi-step plan with reasoning

The RSA engine (`lib/runtime/rsa-engine.ts`) implements the algorithm from "Recursive Self-Aggregation Unlocks Deep Thinking in Large Language Models" (Venkatraman et al., 2025):

1. **Population**: Maintain N=4 candidate reasoning chains
2. **Subsample**: Draw K=2 candidates
3. **Aggregate**: LLM produces improved solution from the K candidates
4. **Recurse**: Repeat for T=3 steps

Even K=2 gives substantial improvement over K=1 (simple self-refinement). The robotics configuration uses lighter parameters than the paper's recommended N=16, K=4, T=10 to keep latency acceptable.

### Escalation Logic

The controller escalates from instinct to planner based on:

| Signal | Escalation |
|---|---|
| `unknown_object` | MobileNet confidence below threshold |
| `stuck` | Same position for N+ seconds |
| `goal_requires_plan` | Multi-step goal |
| `low_confidence` | Instinct confidence below threshold |
| `new_area` | Entered exploration frontier |
| `fleet_coordination` | Swarm decision needed |

---

## World Model: Occupancy Grid + Scene Graph + Predictive Model

The robot's world model is a three-layer representation:

### Layer 1: Occupancy Grid

The WorldModel class (`lib/runtime/world-model.ts`) maintains a 50x50 grid at 10cm resolution covering a 5m x 5m arena. Each cell has a state (unknown, free, explored, obstacle, wall, collectible, collected, path), a confidence score (0.0-1.0), a timestamp, and a visit count.

Two bridges populate the grid:
- **Ground-truth bridge** (`world-model-bridge.ts`): Rasterizes simulation state directly. Perfect knowledge.
- **Vision bridge** (`sensor-bridge.ts`): Builds incrementally from 60-degree camera FOV + VLM depth estimates. Imperfect, growing knowledge.

### Layer 2: Scene Graph

The scene graph (`lib/runtime/scene-graph/`) provides semantic understanding on top of the spatial grid:
- Typed objects (wall, obstacle, beacon, robot) with bounding boxes and confidence
- Waypoint topology with edge costs and status (clear, blocked, unknown)
- Semantic queries for natural language reasoning

### Layer 3: Predictive Model

The PredictiveWorldModel (`lib/runtime/predictive-world-model.ts`) fills unknown cells with low-confidence predictions based on observed patterns:
- Wall continuation (confidence: 0.3)
- Corridor detection (confidence: 0.25)
- Open space expansion (confidence: 0.2)

Predictions are verified when observed and automatically corrected. This runs every cycle without LLM inference cost.

---

## Fleet Coordination: Shared World Models

The FleetCoordinator (`lib/runtime/fleet-coordinator.ts`) manages multiple robots (up to 10) in the same arena:

### Architecture

```
Robot 1 WorldModel --\
Robot 2 WorldModel ---+-- FleetCoordinator -- Shared WorldModel
Robot 3 WorldModel --/         |
                          Task Assignment
                          Conflict Resolution
```

### Merging

Each robot maintains its own WorldModel indexed by device ID. The coordinator merges them using configurable strategies:
- **max_confidence**: For each cell, keep the highest-confidence observation
- **latest_update**: For each cell, keep the most recently updated observation

### Task Assignment

Frontier cells (boundaries between explored and unknown) are identified across all robots. The coordinator assigns exploration tasks to minimize overlap, with a minimum target separation of 0.5m. Tasks are reassigned every 5 seconds.

### Task Types

- `explore_frontier`: Navigate to unexplored boundary
- `navigate_to`: Go to specific coordinate
- `patrol`: Patrol a designated region
- `idle`: No active task

---

## Evolution: Dreaming Engine (Planned)

The evolution engine is implemented at the component level but not yet integrated into the navigation pipeline as an automated loop.

### Implemented Components

| Component | File | Status |
|---|---|---|
| BlackBoxRecorder | `lib/evolution/black-box-recorder.ts` | COMPLETE -- Records execution traces |
| EvolutionaryPatcher | `lib/evolution/evolutionary-patcher.ts` | COMPLETE -- Mutates and evolves behaviors |
| SimulationReplayer | `lib/evolution/simulation-replayer.ts` | COMPLETE -- Replays recorded sessions |
| AgenticAuditor | `lib/evolution/agentic-auditor.ts` | COMPLETE -- Audits decision quality |

### Planned Integration

The dreaming engine will operate as follows:

1. **Record**: During live operation, the BlackBoxRecorder captures execution traces including sensor readings, decisions, outcomes, and failures.
2. **Replay**: The SimulationReplayer reconstructs failure scenarios in headless simulation.
3. **Mutate**: The EvolutionaryPatcher generates skill variants with different approaches to the same scenario.
4. **Evaluate**: Variants are tested in accelerated simulation (1000x real-time).
5. **Patch**: The winning strategy is written back into the agent's markdown definition.

This loop runs offline -- the live robot continues operating while digital twins optimize in simulation. When a better strategy is found, it can be hot-swapped into the live skill cartridge.

---

## Technical Stack

| Layer | Technology | Purpose |
|---|---|---|
| Development LLM | Claude Opus 4.6 (via Claude Code) | Agent creation, evolution, orchestration |
| Runtime LLM | Qwen3-VL-8B (local GPU or OpenRouter) | Multimodal perception, real-time decisions |
| Desktop / Frontend | Next.js 14.1.0, React 18, Electron | Application shell, native USB/FS |
| 3D Visualization | Three.js (via @react-three/fiber, @react-three/drei) | Robot and arena rendering |
| Runtime | TypeScript, Node.js | Navigation pipeline, world model, HAL |
| Testing | Jest 29, ts-jest | 349 tests across 21 suites |
| Firmware | C++ (ESP32-S3) | Serial protocol runtime, safety |
| LLM Inference | OpenRouter API | Cloud model serving |
| Agent Format | Markdown + YAML frontmatter | Agent definitions, skills, memory |
| State Management | Zustand | React state for UI components |

---

## Navigation Pipeline Summary

The complete navigation cycle, from sensors to actuators:

```
1. Sensor readings arrive (distance, camera, IMU)
2. World model bridge updates the occupancy grid
3. Scene graph bridge updates semantic objects
4. Predictive model extrapolates unknown cells (optional)
5. World model is serialized (RLE JSON + top-down image)
6. Candidate generator produces 3-5 ranked subgoals
7. Navigation prompt is assembled (system + user + images)
8. LLM inference produces a structured JSON decision
9. Decision is parsed and validated (with fallback for malformed output)
10. LLM world model corrections are applied (optional)
11. Local planner computes A* path to selected subgoal
12. HAL bridge translates path into motor commands
13. Firmware executes commands with safety validation
14. Results feed back into the next cycle
```

This cycle runs until the goal is reached, the cycle limit is hit, or the system halts. The NavigationRuntime (`lib/runtime/navigation-runtime.ts`) manages the complete session lifecycle, and the NavigationEvaluator (`lib/runtime/navigation-evaluator.ts`) grades the result against success criteria.

---

## Key Design Decisions

### The LLM selects strategy, not coordinates

The LLM never outputs raw (x, y) coordinates. It selects from curated candidates that classical heuristics have already validated. This bounds the output space while preserving strategic flexibility.

### Safety through layering

Four layers of validation stand between the LLM and the actuators:
1. LLM decision parsing with fallback (NavigationTypes)
2. A* path validation with collision checking (LocalPlanner)
3. HAL command validation with motor limits (CommandValidator)
4. Firmware safety with deterministic fallback (ESP32 runtime)

### World model as the universal interface

The LLM sees the same serialized world model regardless of whether the robot is simulated or physical, whether the grid was built from ground truth or camera observations. This abstraction is what makes simulation-to-real transfer possible.

### Dual-LLM architecture avoids the latency/quality tradeoff

Development reasoning (Claude Opus 4.6) operates at human timescales with deep context. Runtime reasoning (Qwen3-VL-8B) operates at robot timescales with fast inference. Neither compromises for the other.
