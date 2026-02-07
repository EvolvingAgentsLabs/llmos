# Code Review & Next Steps: AI Physical Agents that Reason, Collaborate, and Evolve

**Date:** 2026-02-07
**Context:** Analysis mapping the article vision to concrete codebase opportunities

---

## Executive Summary

LLMos has a **strong single-agent foundation**: the HAL, skill system, world model, agent orchestrator, JEPA mental model, and evolution engine are all implemented and functional. The 3D simulation arena is 95% complete with full Three.js integration.

However, the article's two flagship visions — **Distributed World Models (MapReduce for physical intelligence)** and **Dual-Brain Architecture (LLM + JEPA)** — exist only as interfaces and stubs. Bridging this gap represents the highest-impact next steps.

---

## 1. What's Solid Today

### Sense-Think-Act Loop (Fully Operational)
- **SENSE**: Camera vision model (`lib/runtime/camera-vision-model.ts`), 8-directional distance sensors, line sensors, battery monitoring — all simulated in Robot4 runtime at 100Hz physics / 60 FPS rendering
- **THINK**: LLM-as-cognitive-core via `SystemAgentOrchestrator` (`lib/system-agent-orchestrator.ts`), JEPA mental model for action-conditioned prediction (`lib/runtime/jepa-mental-model.ts`)
- **ACT**: HAL routes tool calls (`hal_drive`, `hal_stop`, `hal_vision_scan`, etc.) identically to simulation or physical adapters (`lib/hal/`)

### Hardware Abstraction Layer
- Command validation with safety rules (emergency stop at 8cm, speed reduction near obstacles)
- Simulation adapter, physical adapter (Web Serial + Electron serial), replay adapter
- Same skill file runs in both environments — this is production-ready

### Skills & Agents (Markdown-First)
- 10+ system skills parsed from markdown with YAML frontmatter (`lib/skill-parser.ts`)
- 11+ system agents with multi-agent validation (minimum 3 per project)
- Agent messenger with broadcast and subscription-based routing (`lib/agents/agent-messenger.ts`)
- Evolution engine: black-box recording → simulation replay → evolutionary patching with domain-lens mutation

### 3D Simulation Arena
- `RobotCanvas3D.tsx` (1770 lines) — complete arena rendering, physics-based robot, sensor visualization
- Picture-in-Picture views (top-down, first-person, cognitive map)
- Multiple camera presets, collectibles, ray navigation

---

## 2. Gap Analysis: Article Vision vs. Codebase Reality

### Gap A: Distributed World Models (0% implemented)

**Article vision:** "Each agent explores a sector, generating a local internal representation... These local models are synchronized and merged... The swarm collectively 'hallucinates' a complete 3D semantic map."

**Current state:** `WorldModel` (`lib/runtime/world-model.ts`) is single-device only. No merge, no sync, no consensus.

**What's missing:**
| Component | File Needed | Purpose |
|-----------|-------------|---------|
| World Model Merger | `lib/runtime/distributed/world-model-merger.ts` | Merge grids from multiple robots with conflict resolution |
| Consensus Engine | `lib/runtime/distributed/consensus-engine.ts` | Voting/trust-weighted agreement on shared state |
| Swarm Protocol | `lib/agents/distributed/swarm-protocol.ts` | Serialized messaging across network (TCP/WebSocket/MQTT) |
| MapReduce Engine | `lib/runtime/distributed/robot-mapreduce.ts` | Map exploration tasks, reduce partial models |
| Distributed Store | `lib/runtime/distributed/distributed-world-model.ts` | Persistent synchronized model state |

**Concrete first step:** Add a `mergeWith(otherModel, config)` method to `WorldModel` (~line 775) that takes another robot's snapshot and produces a merged grid using confidence-weighted voting.

### Gap B: Dual-Brain Architecture (0% implemented)

**Article vision:** "The Planner (LLM) handles long-term goals... The Instinct (JEPA) handles immediate physical prediction and sensorimotor representation."

**Current state:** `JEPAMentalModel` (`lib/runtime/jepa-mental-model.ts`) uses the LLM for everything — prediction, state encoding, trajectory planning. There is no neural network inference, no model switching, no hybrid decision-making.

**What's missing:**
| Component | File Needed | Purpose |
|-----------|-------------|---------|
| Dual-Brain Controller | `lib/runtime/dual-brain-controller.ts` | Switch between LLM (slow/deep) and neural (fast/instinct) |
| Neural Backend | `lib/runtime/neural/jepa-inference.ts` | TensorFlow.js or ONNX Runtime for real JEPA inference |
| Confidence Router | `lib/runtime/neural/model-router.ts` | Route decisions based on time-criticality and confidence |

**Concrete first step:** Add a `DualBrainConfig` interface and switching logic to `JEPAMentalModel` (~line 380) with three modes: `llm-only` (current), `neural-only` (future), `hybrid` (confidence-based switching).

### Gap C: Fleet Coordination (10% — config exists, logic doesn't)

**Current state:** `ESP32DeviceManager` (`lib/hardware/esp32-device-manager.ts`) defines `FleetConfig` with `syncMode: 'independent' | 'synchronized' | 'leader-follower'` (line 67-73) but **never reads or acts on it**. `broadcastCommand()` exists but does naive broadcast without coordination.

**What's missing:**
- Leader election algorithm
- Heartbeat/health monitoring
- Formation control
- Task distribution across fleet
- State synchronization protocol

**Concrete first step:** Create `lib/hardware/fleet-coordinator.ts` that consumes `FleetConfig` and implements at least the `leader-follower` mode with heartbeat monitoring.

### Gap D: Inter-Robot Communication (0% network transport)

**Current state:** `AgentMessenger` (788 lines) is entirely in-memory. Messages are stored in a `Map`, subscriptions are local. No serialization, no network transport, no persistence.

**What's missing:**
- Network transport layer (WebSocket/MQTT/custom TCP)
- Message serialization protocol
- Network topology management
- Latency compensation
- Connection recovery and retry

**Concrete first step:** Add a `NetworkTransport` interface to `agent-messenger.ts` that abstracts local vs. remote delivery. Implement `LocalTransport` (current behavior) and stub `WebSocketTransport`.

---

## 3. Non-Distributed Opportunities

### 3A: Test Coverage (Currently ~15-20%)

Only 2 automated test files exist (`result.test.ts`, `adapter.test.ts`). A comprehensive 594-line WASM pipeline test plan exists in markdown but is not automated.

**Priority tests to add:**
1. `world-model.test.ts` — grid operations, exploration tracking, confidence decay
2. `jepa-mental-model.test.ts` — state encoding, action prediction, trajectory planning
3. `hal-command-validator.test.ts` — safety rules, speed reduction, emergency stop
4. `skill-parser.test.ts` — YAML parsing, code extraction, round-trip generation
5. `agent-messenger.test.ts` — broadcast, delegation, subscription routing

### 3B: CI/CD Pipeline (None exists)

No `.github/workflows/` directory. Recommended:
- Lint + type-check on PR
- Run Jest tests on PR
- Build verification (Next.js + Electron)
- WASM compilation smoke test

### 3C: Web Serial Integration (Planned, not implemented)

The article mentions "deploying identical agents onto physical ESP32-based hardware." The `WebSerialAdapter` is planned in the roadmap (Milestone 1.5) but not yet built. `esptool-js` for browser-based firmware flashing is documented but not integrated.

### 3D: Vector-Based Semantic Memory (Planned)

Architecture doc mentions Transformers.js for local embeddings and browser-native vector DB. This would enable agents to semantically search past experiences rather than relying on exact-match patterns.

### 3E: Local LLM via WebGPU (Planned)

3-8B parameter models running in-browser via WebLLM. This is critical for the "instinct" layer of the dual-brain — fast, local inference for split-second physical decisions.

---

## 4. Recommended Implementation Roadmap

### Phase 2A: Distributed Foundation (Next)

**Goal:** Two simulated robots can merge their world models.

1. **World Model Merger** — Implement `mergeWith()` on `WorldModel` with confidence-weighted grid fusion
2. **Snapshot Serialization** — Make `WorldModelSnapshot` JSON-serializable for transport
3. **Multi-Robot Simulation** — Extend `RobotCanvas3D` to render 2+ robots simultaneously
4. **Shared State View** — Add a "merged world model" PiP view showing the combined map

### Phase 2B: Dual-Brain Prototype

**Goal:** Agent switches between LLM reasoning and fast heuristic prediction.

1. **DualBrainController interface** — Define switching strategies (time-based, confidence-based, complexity-based)
2. **Heuristic Instinct Model** — Before neural JEPA, implement a fast rule-based "instinct" (e.g., reactive obstacle avoidance) that bypasses the LLM
3. **Confidence Router** — When LLM latency exceeds threshold or confidence is high, delegate to instinct
4. **Metrics Dashboard** — Track which brain made each decision and the outcome

### Phase 2C: Fleet Communication

**Goal:** Real ESP32 robots exchange world model snapshots over WiFi.

1. **MQTT Transport** — Lightweight pub/sub for ESP32 (already standard in ESP-IDF)
2. **Protocol Definition** — JSON-based messages: `SNAPSHOT_SHARE`, `TASK_ASSIGN`, `HEARTBEAT`, `LEADER_ELECT`
3. **Fleet Coordinator** — Implement `leader-follower` mode using the existing `FleetConfig`
4. **Web Dashboard** — Show fleet topology and live merged world model

### Phase 2D: Testing & CI

**Goal:** Automated quality gates before merge.

1. **Core unit tests** — World model, JEPA, HAL validator, skill parser, agent messenger
2. **GitHub Actions workflow** — Lint, type-check, test, build on every PR
3. **Integration tests** — End-to-end: create robot → deploy skill → simulate → verify world model

---

## 5. Architecture Decisions Needed

| Decision | Options | Recommendation |
|----------|---------|----------------|
| Inter-robot protocol | Custom JSON / Protocol Buffers / MQTT | **MQTT** — native ESP-IDF support, lightweight, pub/sub fits swarm pattern |
| Consensus strategy | Raft / Quorum voting / Trust-weighted | **Trust-weighted** — robots have varying sensor quality; weigh by confidence |
| Neural backbone | TensorFlow.js / ONNX Runtime / Custom | **TensorFlow.js** — browser-native, good ESP32 community, Coral TPU support |
| Failure model | Crash-only / Byzantine / Timing | **Crash-only** — simpler, sufficient for cooperative robots |
| World model merge | Overwrite / Voting / Bayesian | **Bayesian fusion** — naturally handles confidence and temporal decay |

---

## 6. Files to Watch

These files are the integration points where most next-step work will connect:

| File | Lines | Why |
|------|-------|-----|
| `lib/runtime/world-model.ts` | ~775 | Add `mergeWith()` method here |
| `lib/runtime/jepa-mental-model.ts` | ~380 | Add `DualBrainConfig` and switching logic here |
| `lib/hardware/esp32-device-manager.ts` | ~67-73 | `FleetConfig` is defined but unused — wire it up |
| `lib/agents/agent-messenger.ts` | ~705-735 | Add `NetworkTransport` abstraction here |
| `lib/hal/hal-tool-executor.ts` | ~80 | Route multi-robot HAL calls through fleet coordinator |
| `lib/evolution/black-box-recorder.ts` | ~49-78 | Extend to record multi-robot sessions |
| `components/canvas/RobotCanvas3D.tsx` | ~1770 | Extend to render multiple robots |

---

## Summary

The codebase is **architecturally sound** for single-agent robotics. The HAL, skill system, evolution engine, and 3D arena are all production-quality. The article's vision of distributed world models and dual-brain architecture represents the logical next frontier, and the existing abstractions (world model snapshots, fleet config, agent messenger) provide clean extension points.

The highest-leverage next step is **world model merging** — it's self-contained, testable, and directly demonstrates the MapReduce-for-robots vision from the article.
