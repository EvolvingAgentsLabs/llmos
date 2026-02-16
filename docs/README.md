# LLMos Documentation

LLMos is an operating system for AI physical agents (robots). It provides a complete
navigation stack -- from occupancy grid world models through LLM-powered decision
making to hardware abstraction -- that lets robots reason about and move through
physical space.

## Quick Start

```bash
# Install dependencies
npm install

# Start the development server (web UI + backend)
npm run dev

# Run the full test suite (349 tests across 21 suites)
npx jest

# Run specific test suite
npx jest --testPathPattern="navigation-e2e"

# Run the navigation demo (mock LLM, no API key needed)
npx tsx scripts/run-navigation.ts

# Run with real LLM via OpenRouter
OPENROUTER_API_KEY=sk-or-... npx tsx scripts/run-navigation.ts --live

# Run with simulated vision pipeline
npx tsx scripts/run-navigation.ts --vision

# Run all arenas
npx tsx scripts/run-navigation.ts --all

# Run with per-cycle logging
npx tsx scripts/run-navigation.ts --verbose

# Combine flags
npx tsx scripts/run-navigation.ts --live --vision --all --verbose
```

### CLI Flags for `run-navigation.ts`

| Flag | Description |
|------|-------------|
| `--live` | Use real LLM (Qwen3-VL-8B via OpenRouter) instead of mock |
| `--vision` | Use simulated camera bridge instead of ground-truth rasterization |
| `--all` | Run all test arenas sequentially |
| `--verbose` / `-v` | Print per-cycle position, action, and goal distance |
| `--arena <name>` | Select a specific arena (default: `simple`) |

## Key Metrics

| Metric | Value |
|--------|-------|
| Total tests | 349 |
| Test suites | 21 |
| LLM navigation criteria passed | 6/6 (Qwen3-VL-8B via OpenRouter) |
| Average cycle time | ~1.4s/cycle |

## What You Can Do

### Without Hardware

- Run the full navigation stack with mock LLM inference (deterministic, no API key)
- Execute all 349 tests covering world model, vision, planning, fleet coordination
- Visualize navigation sessions in the web UI
- Test obstacle avoidance, exploration, and goal-seeking across multiple arenas
- Evaluate candidate generation, path planning, and stuck recovery
- Run the vision pipeline with simulated camera frames

### With Hardware (ESP32 + Sensors)

- Deploy to a physical robot via the HAL bridge
- Stream real camera frames through the vision pipeline
- Execute navigation decisions on actual motors via the physical adapter
- Coordinate multiple robots with fleet coordination
- Read real sensor data (LiDAR, IMU, encoders) through the sensor bridge

## Documentation Structure

```
docs/
├── README.md                          <- You are here
├── LLM_CONFIGURATION.md              <- LLM setup, models, OpenRouter config
├── architecture/
│   ├── ARCHITECTURE.md               <- System architecture overview
│   ├── WORLD_MODEL_SYSTEM.md         <- Occupancy grid and world model layers
│   ├── ADAPTIVE_PHYSICAL_INTELLIGENCE.md  <- Adaptive behavior system
│   ├── ROBOT_AI_AGENT_PARADIGM.md    <- Agent paradigm design
│   ├── ROBOT_WORLD_IMPLEMENTATION_STATUS.md <- Implementation status tracker
│   ├── HELLO_WORLD_TUTORIAL.md       <- First 10 minutes tutorial
│   └── ROBOT4_GUIDE.md              <- Robot programming guide
├── hardware/
│   ├── ESP32_GUIDE.md               <- ESP32 setup and flashing
│   ├── STANDARD_ROBOT_V1.md         <- Standard robot hardware spec
│   ├── HARDWARE_SHOPPING_LIST.md    <- Parts list with links
│   └── ARENA_SETUP_GUIDE.md        <- Physical test arena construction
├── development/
│   ├── 2026-01-28_project_creation.md
│   ├── 2026-01-30_implementation_phase1.md
│   ├── 2026-01-30_implementation_phase2.md
│   └── 2026-02-07_code_review_next_steps.md
├── jepa-implementation-guide.md     <- JEPA world model implementation
├── jepa-integration-analysis.md     <- JEPA integration analysis
└── jepa-llm-concepts.md            <- JEPA + LLM conceptual mapping
```

## Project Structure

```
lib/
├── runtime/                    # Navigation runtime stack
│   ├── navigation-loop.ts      # Top-level cycle orchestrator
│   ├── navigation-runtime.ts   # Session manager (arena -> result)
│   ├── navigation-types.ts     # LLM input/output JSON schemas
│   ├── navigation-prompt.ts    # Prompt assembly for the LLM
│   ├── navigation-evaluator.ts # Post-run criteria evaluation
│   ├── navigation-hal-bridge.ts # HAL bridge (simulation/physical)
│   ├── navigation-ui-bridge.ts # UI bridge (web dashboard events)
│   ├── navigation-logger.ts    # Structured logging
│   ├── world-model.ts          # Occupancy grid world model
│   ├── world-model-bridge.ts   # World model I/O interface
│   ├── world-model-serializer.ts # Grid -> RLE JSON serialization
│   ├── world-model-metrics.ts  # Coverage, entropy, drift metrics
│   ├── world-model-provider.ts # World model factory
│   ├── predictive-world-model.ts # Temporal prediction layer
│   ├── candidate-generator.ts  # Subgoal/frontier candidate scoring
│   ├── local-planner.ts        # A* path planning
│   ├── map-renderer.ts         # Top-down map image generation
│   ├── vision-simulator.ts     # Simulated camera frames
│   ├── vision-scene-bridge.ts  # Vision -> scene graph bridge
│   ├── sensor-bridge.ts        # Sensor data abstraction
│   ├── fleet-coordinator.ts    # Multi-robot coordination
│   ├── llm-inference.ts        # Inference adapters (OpenRouter + mock)
│   ├── openrouter-inference.ts # OpenRouter API adapter with stats
│   └── test-arenas.ts          # Test arena definitions
│
├── hal/                        # Hardware Abstraction Layer
│   ├── types.ts                # HAL interface definitions
│   ├── physical-adapter.ts     # Real hardware adapter
│   ├── simulation-adapter.ts   # Simulation adapter
│   ├── hal-tool-executor.ts    # Tool execution engine
│   ├── hal-tool-loader.ts      # Dynamic tool loading
│   └── command-validator.ts    # Command safety validation
│
├── hardware/                   # Device-level hardware support
│   ├── esp32-device-manager.ts # ESP32 connection management
│   ├── serial-manager.ts       # Serial port communication
│   ├── virtual-esp32.ts        # Virtual ESP32 for testing
│   └── cube-robot-simulator.ts # 3D robot simulation
│
├── llm/                        # LLM client and model config
├── kernel/                     # OS kernel (process, memory, scheduler)
├── agents/                     # Agent framework
├── skills/                     # Skill system
└── core/                       # Core utilities (Result type, etc.)

components/robot/               # React UI components
├── RobotAgentPanel.tsx         # Main robot agent dashboard
├── RobotWorldPanel.tsx         # World model visualization
├── RobotCanvas3D.tsx           # 3D robot view
├── AgentDiagnosticsPanel.tsx   # Agent diagnostics
├── RobotLogsMonitorPanel.tsx   # Log viewer
└── DreamingDashboardPanel.tsx  # Predictive model dashboard

__tests__/lib/runtime/          # Navigation test suites (19 of 21)
├── navigation-e2e.test.ts      # End-to-end navigation tests
├── navigation-runtime.test.ts  # Runtime session tests
├── navigation-types.test.ts    # Schema validation tests
├── world-model-*.test.ts       # World model tests (4 suites)
├── vision-*.test.ts            # Vision pipeline tests (3 suites)
├── local-planner.test.ts       # Path planning tests
├── candidate-generator.test.ts # Candidate scoring tests
├── fleet-coordinator.test.ts   # Fleet coordination tests
├── sensor-bridge.test.ts       # Sensor abstraction tests
├── openrouter-inference.test.ts # OpenRouter adapter tests
├── navigation-hal-bridge.test.ts # HAL bridge tests
├── navigation-ui-bridge.test.ts  # UI bridge tests
├── llm-corrections.test.ts     # LLM world model correction tests
└── predictive-world-model.test.ts # Prediction tests

scripts/
├── run-navigation.ts           # Navigation demo CLI
└── build.sh                    # Build script
```

## Navigation Loop Architecture

Each navigation cycle follows this pipeline:

```
Sensors -> World Model -> Serializer -> Candidates -> Prompt -> LLM
    -> Decision Validation -> Local Planner -> HAL -> Sensors
```

1. **Sensors** feed data into the occupancy grid world model
2. **Serializer** converts the grid to compact RLE JSON
3. **Candidate Generator** scores subgoals, frontiers, waypoints, recovery points
4. **Prompt Builder** assembles the navigation frame for the LLM
5. **LLM** returns a structured JSON decision (action + fallback + explanation)
6. **Validator** checks the decision against the schema, normalizes free-form responses
7. **Local Planner** computes an A* path to the selected target
8. **HAL** executes the movement command on hardware or simulation

The LLM picks strategy (WHERE to go). Classical planners execute (HOW to get there).
The LLM never touches motor PWM directly.

## Running Tests

```bash
# All tests
npx jest

# Single suite
npx jest --testPathPattern="world-model-bridge"

# With coverage
npx jest --coverage

# Watch mode during development
npx jest --watch
```

## Further Reading

- [LLM Configuration](LLM_CONFIGURATION.md) -- Set up OpenRouter and configure models
- [Architecture Overview](architecture/ARCHITECTURE.md) -- System design and component interactions
- [World Model System](architecture/WORLD_MODEL_SYSTEM.md) -- Occupancy grid internals
- [ESP32 Guide](hardware/ESP32_GUIDE.md) -- Hardware setup for physical robots
- [Arena Setup](hardware/ARENA_SETUP_GUIDE.md) -- Build a physical test arena
