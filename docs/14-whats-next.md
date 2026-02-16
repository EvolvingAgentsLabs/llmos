---
layout: default
title: "14. What's Next"
nav_order: 14
---

# Chapter 14: What's Next -- From Research to Reality

![Robot at cliff edge overlooking landscape with completed modules behind and road ahead](assets/chapter-14.png)

<!-- IMAGE_PROMPT: Isometric digital illustration, clean technical style, dark navy (#0d1117) background, soft neon accent lighting in cyan and magenta, a small wheeled robot with a glowing blue eye sensor as recurring character, flat vector aesthetic with subtle depth, no photorealism, 16:9 aspect ratio. Robot at cliff edge overlooking vast landscape. Behind: completed city of tested software modules. Ahead: road to distant landmarks (physical robot on desk, fleet in warehouse, satellite uplink). Road partially built with construction markers. Sunrise on horizon. -->

The system described in the preceding thirteen chapters is not a whiteboard design. It
runs. The occupancy grid builds a persistent spatial model from sensor data. The
navigation loop calls an LLM every cycle and validates its decisions against a strict
schema. The local planner finds collision-free paths through A* search. The vision
pipeline converts camera frames into scene graphs. The fleet coordinator merges world
models from multiple robots. There are 346 tests proving all of this works. But there
is a significant distance between "works in simulation with a mock LLM" and "works on
a physical robot navigating your living room." This chapter maps that distance.

---

## Current Implementation Status

Everything described in Phases 0 through 5 of the original roadmap is implemented and
tested:

| Component | Status | Test Coverage |
|-----------|--------|---------------|
| World Model (50x50 occupancy grid) | Done | world-model-bridge, metrics, serializer, provider |
| LLM Navigation Loop | Done | navigation-e2e, navigation-runtime, navigation-types |
| Candidate Generator | Done | candidate-generator |
| Local Planner (A*) | Done | local-planner |
| LLM World Model Corrections | Done | llm-corrections |
| Vision Simulator | Done | vision-simulator |
| Vision Scene Bridge | Done | vision-scene-bridge |
| Vision Pipeline E2E | Done | vision-pipeline-e2e |
| Sensor Bridge | Done | sensor-bridge |
| Predictive World Model | Done | predictive-world-model |
| Fleet Coordinator | Done | fleet-coordinator |
| Navigation HAL Bridge | Done | navigation-hal-bridge |
| Navigation UI Bridge | Done | navigation-ui-bridge |
| OpenRouter Inference Adapter | Done | openrouter-inference |

The full test suite: 346+ tests across 21 suites, all passing.

---

## The Next Milestone: Closing the Sim-to-Real Gap

The most important remaining work is connecting the simulation stack to physical
hardware. The code is designed for this -- the HAL interface in `lib/hal/types.ts`
abstracts every hardware interaction behind a clean TypeScript interface -- but the
wiring is not yet complete.

### Wire VisionFrame to Live Camera

The `GroundTruthVisionSimulator` in `lib/runtime/vision-simulator.ts` generates
synthetic camera frames from the arena definition. The next step is replacing this
with a real camera source: a webcam for desktop development, or an ESP32-CAM stream
for physical robots. The `VisionInterface` in the HAL already defines `captureFrame()`
returning a base64 data URL. The implementation needs to connect to a real video
source.

### Local Qwen3-VL-8B Server

The OpenRouter adapter (`lib/runtime/openrouter-inference.ts`) provides cloud-based
LLM inference, but real-time robot control requires local inference. The plan is to
run Qwen3-VL-8B-Instruct through either llama.cpp or vLLM on the host machine's GPU.
Target latency: under 500ms per frame for single-pass instinct decisions, under 3
seconds for RSA-enhanced planning.

### Integration Tests with Real Robot Planning

The current end-to-end tests use a deterministic mock LLM. The next layer of testing
sends actual prompts to a real (or locally-hosted) Qwen3-VL-8B model and validates
that the decisions are physically reasonable. This is not unit testing -- it is
behavioral testing of the LLM's spatial reasoning.

### Performance Benchmarks

How fast can the full cycle run? The navigation loop needs to complete a cycle
(serialize world model, generate candidates, call LLM, validate decision, plan path)
within the robot's control loop deadline. For a robot moving at 0.3 m/s, a 500ms
cycle means the world changes by 15cm between decisions. Benchmarking this pipeline
end-to-end on target hardware is critical.

---

## Phase 3: Swarm Intelligence (Q3 2026)

The `FleetCoordinator` in `lib/runtime/fleet-coordinator.ts` already implements
world model merging and multi-robot coordination in memory. Phase 3 takes this to
physical hardware.

### MQTT Transport for ESP32 Fleet

ESP32 microcontrollers have native MQTT support through ESP-IDF. The fleet
communication protocol defines four message types: `SNAPSHOT_SHARE` (world model
exchange), `TASK_ASSIGN` (sector allocation), `HEARTBEAT` (liveness), and
`LEADER_ELECT` (coordination). The `esp32-device-manager.ts` in `lib/hardware/`
already defines the fleet configuration structure with leader-follower mode.

### RSA Swarm Consensus with Real Robots

The RSA engine (`lib/runtime/rsa-engine.ts`) supports a swarm consensus mode where
multiple robots' observations are aggregated through the Recursive Self-Aggregation
algorithm. Each robot contributes its local world model snapshot and camera frame.
The aggregation produces a unified world model and coordinated exploration plan.
Testing this with physical robots -- three ESP32 units simultaneously mapping an
unknown room -- is the milestone that validates the fleet architecture.

### Multi-Robot 3D Arena Visualization

The `RobotCanvas3D.tsx` component currently renders a single robot. Extending it to
display multiple robots with distinct colors, their individual world models, and
communication links between them provides the visual feedback needed for fleet
development and debugging.

### World Model Merging in Real-Time

The fleet coordinator's `mergeWorldModels()` method uses Bayesian confidence fusion
to resolve conflicting observations. Robot A sees a cell as free with confidence 0.7.
Robot B sees it as an obstacle with confidence 0.9. The merger produces a result
weighted by confidence and recency. Doing this in real-time over MQTT, with robots
moving and observing continuously, is the engineering challenge.

---

## Phase 4: Plugin Architecture (Q4 2026)

LLMos is built on markdown. Agents are markdown files. Skills are markdown files.
The kernel rules are markdown. This makes the system naturally extensible -- anyone
who can write a markdown document can contribute a robot behavior.

### Community Skill Marketplace

The volume system already supports three tiers: User, Team, and System. Skills
start in the User volume and get promoted to Team after 5+ successful uses with 80%+
success rate, then to System after 10+ uses with 90%+ success. A public registry
backed by Git would let the community share skills across installations.

### Plugin Manifest Format

Third-party contributions need a standard manifest: what hardware the plugin
requires, what HAL capabilities it uses, what inputs and outputs it expects. This
is the contract between plugin authors and the LLMos runtime.

### Third-Party Sensor Driver Plugins

The HAL's `VisionInterface` and `LocomotionInterface` are abstract. A plugin for a
LiDAR sensor, a depth camera, or a different motor controller would implement these
interfaces and register through the plugin system. The navigation loop does not
change -- it talks to the HAL, and the HAL talks to whatever hardware is plugged in.

---

## Phase 5: Native Binary Generation (2027+)

This is the research frontier. Today, the runtime LLM emits structured JSON that
a TypeScript interpreter on the host machine translates into serial commands for the
ESP32. Each layer in this pipeline adds latency and potential for translation errors.

### Formal LLMBytecode Specification

The LLMBytecode concept defines a formal instruction set -- categories of operations,
a state model, and safety invariants -- that the LLM can emit directly. Instead of
"move to position (1.5, 1.5)" expressed as JSON, the LLM would emit a compact
binary instruction that the MCU executes without parsing.

### Embedded Interpreter on MCU

An intermediate step: a formal virtual machine running on the ESP32 with an opcode
table, replacing the current ad-hoc serial protocol. The LLM emits opcodes, the VM
executes them. This is faster than JSON parsing and provides a well-defined execution
model.

### LLM Emits Machine-Level Instructions

The end state: the LLM generates machine-level instruction blocks that the MCU
executes directly, with no intermediate representation designed for human
readability. This removes every layer of abstraction between the model's reasoning
and the robot's actuators.

---

## Open Research Questions

Three questions that do not yet have clear answers:

**How small can the runtime LLM be?** Qwen3-VL-8B works for navigation decisions,
but can a 3B or 1B model handle the same task? The model-size boundary determines
the minimum hardware cost for a robot that can reason about its environment. Every
halving of model size roughly halves the GPU memory requirement and doubles the
inference speed.

**Can RSA swarm consensus scale to 10+ robots?** The current fleet coordinator
handles a handful of robots. At ten or more, the world model merging becomes a
quadratic problem unless you introduce hierarchical aggregation -- cluster leaders
that merge locally before reporting to a global coordinator. The RSA algorithm
supports this in theory. Whether it works in practice with real latency and packet
loss is an open question.

**When does the distributed VM architecture collapse to single-device?** Today,
the LLM runs on a host computer and sends commands to the ESP32. As edge AI chips
improve, the LLM could run directly on the robot. At that point, the distributed
architecture becomes unnecessary overhead. When does this crossover happen? 2027?
2030? The answer depends on how fast edge inference catches up to the model sizes
that spatial reasoning requires.

---

## Contributing

The project welcomes contributions in several areas:

- **Test arenas** -- Design new navigation challenges in `lib/runtime/test-arenas.ts`
- **HAL drivers** -- Implement `HardwareAbstractionLayer` for new hardware platforms
- **Sensor integrations** -- Connect new sensor types through the `VisionInterface`
- **Navigation strategies** -- Improve the candidate generator or local planner
- **Documentation** -- Expand the book, add diagrams, improve code comments
- **Performance** -- Profile and optimize the navigation cycle pipeline

See [CONTRIBUTING.md](../CONTRIBUTING.md) for setup instructions and contribution
guidelines. See [ROADMAP.md](../ROADMAP.md) for the full development plan with
timelines and milestone definitions.

---

## The Vision

The trajectory of this project points toward a single idea: the gap between human
intent and robot behavior should be zero.

Today, programming a robot requires learning C++, installing heavy IDEs, writing
firmware, debugging serial protocols, and manually coding every behavior. The robot
does not understand what it is doing. It executes compiled instructions.

Tomorrow, with LLMos: describe what you want in plain English. The development LLM
creates and evolves the agents as markdown files. The runtime LLM runs them in
real time on local hardware -- seeing, reasoning, and acting in the physical world.
Agents learn from every interaction, promote successful patterns through the volume
system, and coordinate as swarms. No cloud dependency for runtime. No coding
required.

The thirteen chapters before this one describe the machinery that makes this
possible: occupancy grids, navigation loops, vision pipelines, fleet coordination,
hardware abstraction, and a test suite that proves it all works. What remains is the
engineering work to bridge simulation and reality, the research work to push the
boundaries of on-device inference, and the community work to build an ecosystem of
shared robot intelligence.

The foundation is laid. The tests pass. Now we build.

---

*Previous: [Chapter 13 -- Getting Started: Your First 10 Minutes](13-getting-started.md)*
