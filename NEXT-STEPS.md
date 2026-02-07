# NEXT-STEPS.md — LLMos Implementation Plan

**Date:** 2026-02-07
**Status:** Phase 1 (Foundation) complete. Phase 2 (Dual-Brain & Local Intelligence) starting.

---

## Current Project Status

### What's Built and Working

```mermaid
graph LR
    subgraph "DONE — Phase 1 Foundation"
        HAL[HAL Layer<br/>Sim + Physical + Replay]
        SIM[3D Arena<br/>RobotCanvas3D 1770 lines]
        AGT[Agent System<br/>11+ agents, orchestrator]
        SKL[Skills System<br/>10+ markdown skills]
        WM[World Model<br/>Grid-based, decay, exploration]
        JEPA[JEPA Mental Model<br/>Abstract state, prediction]
        EVO[Evolution Engine<br/>Black-box, mutation, lenses]
        UI[Desktop + Web UI<br/>Electron, Next.js 14]
    end

    subgraph "DONE — This PR"
        RSA[RSA Engine<br/>rsa-engine.ts 613 lines]
        DB[Dual-Brain Controller<br/>dual-brain-controller.ts 601 lines]
        MN[MobileNet Detector<br/>mobilenet-detector.ts 510 lines]
        DOC[Documentation<br/>ARCHITECTURE + ROADMAP + README]
    end

    subgraph "NOT YET WIRED"
        INF[Local LLM Server]
        TFJS[TensorFlow.js Backend]
        WIRE[Integration into<br/>ESP32 Agent Runtime]
    end

    HAL --> RSA
    WM --> RSA
    JEPA --> DB
    RSA --> DB
    MN --> DB
    DB --> WIRE
    INF --> WIRE
    TFJS --> MN

    style RSA fill:#bfb,stroke:#333
    style DB fill:#bfb,stroke:#333
    style MN fill:#bfb,stroke:#333
    style INF fill:#ffd,stroke:#333
    style TFJS fill:#ffd,stroke:#333
    style WIRE fill:#ffd,stroke:#333
```

### Component Completion Matrix

| Component | File(s) | Status | Lines |
|-----------|---------|--------|-------|
| HAL Command Validator | `lib/hal/command-validator.ts` | Done | 500+ |
| HAL Tool Executor | `lib/hal/hal-tool-executor.ts` | Done | 369 |
| Simulation Adapter | `lib/hal/simulation-adapter.ts` | Done | — |
| Physical Adapter | `lib/hal/physical-adapter.ts` | Done | — |
| System Agent Orchestrator | `lib/system-agent-orchestrator.ts` | Done | 1200+ |
| Multi-Agent Validator | `lib/agents/multi-agent-validator.ts` | Done | 300+ |
| Agent Messenger | `lib/agents/agent-messenger.ts` | Done | 788 |
| Skill Parser | `lib/skill-parser.ts` | Done | 316 |
| World Model | `lib/runtime/world-model.ts` | Done | 808 |
| JEPA Mental Model | `lib/runtime/jepa-mental-model.ts` | Done | 617 |
| Robot4 Runtime | `lib/runtime/robot4-runtime.ts` | Done | 700+ |
| ESP32 Agent Runtime | `lib/runtime/esp32-agent-runtime.ts` | Done | 1240 |
| Camera Vision Model | `lib/runtime/camera-vision-model.ts` | Done (cloud) | — |
| Black-Box Recorder | `lib/evolution/black-box-recorder.ts` | Done | 600+ |
| Evolutionary Patcher | `lib/evolution/evolutionary-patcher.ts` | Done | — |
| 3D Arena | `components/canvas/RobotCanvas3D.tsx` | Done | 1770 |
| **RSA Engine** | **`lib/runtime/rsa-engine.ts`** | **Done (this PR)** | **613** |
| **Dual-Brain Controller** | **`lib/runtime/dual-brain-controller.ts`** | **Done (this PR)** | **601** |
| **MobileNet Detector** | **`lib/runtime/vision/mobilenet-detector.ts`** | **Done (this PR)** | **510** |
| Local LLM Inference | — | Not started | — |
| TensorFlow.js COCO-SSD | — | Not started | — |
| Dual-Brain ↔ Runtime wiring | — | Not started | — |
| World Model Merging | — | Not started | — |
| Fleet Coordinator | — | Not started | — |
| MQTT Transport | — | Not started | — |
| Unit Tests | `__tests__/` | ~15-20% coverage | 2 files |
| CI/CD | `.github/workflows/` | Not started | — |

---

## What Was Done in This PR

Two commits on `claude/review-code-ai-agents-OUOMc`:

### Commit 1: Code Review & Gap Analysis
- Mapped the article vision (Distributed World Models, Dual-Brain, Fleet Coordination) against every file in the codebase
- Identified 4 major gaps and concrete extension points
- Produced `docs/development/2026-02-07_code_review_next_steps.md`

### Commit 2: Dual-Brain Architecture Implementation
Three new runtime modules and complete documentation overhaul:

**RSA Engine** (`lib/runtime/rsa-engine.ts`)
- Full [RSA algorithm](https://arxiv.org/html/2509.26626v1): population → subsample → aggregate → recurse
- 4 presets: `quick` (2.5s), `standard` (8s), `deep` (22s), `swarm` (6s)
- `planRobotAction()` for navigation with safety-first aggregation prompts
- `swarmConsensus()` for multi-robot world model merging
- `RSAInferenceProvider` interface for any LLM backend

**Dual-Brain Controller** (`lib/runtime/dual-brain-controller.ts`)
- 3-layer decision cascade: reactive rules (<5ms) → LLM instinct (~200ms) → RSA planner (2-22s)
- 7 escalation conditions with per-condition RSA preset selection
- Plan caching (planner generates sequence, instinct executes step-by-step)
- Full metrics: brain attribution, latency tracking, escalation histograms

**MobileNet Detector** (`lib/runtime/vision/mobilenet-detector.ts`)
- `VisionFrame` structured JSON — the bridge between perception and cognition
- 3 depth estimation methods (known object size, bbox area ratio, floor position)
- 22 known object sizes for pinhole-model depth calculation
- Scene analysis (openings, blocked directions, floor visibility)
- `ObjectDetectionBackend` interface for TensorFlow.js or ONNX Runtime

**Documentation** (all with Mermaid diagrams and paper links)
- `ARCHITECTURE.md` — New Dual-Brain section with 6 Mermaid diagrams
- `ROADMAP.md` — Revised Phase 2-4 with milestones, Gantt chart, success criteria
- `README.md` — Updated project description and research references

---

## Next Steps — Priority Ordered

### Priority 1: Wire the Dual-Brain to a Real LLM (makes everything else work)

```mermaid
graph TB
    subgraph "Step 1A: Local Inference Server"
        LLAMA[Install llama.cpp<br/>or vLLM on host]
        QWEN[Load Qwen3-4B-Instruct<br/>Q4_K_M quantization]
        API[OpenAI-compatible<br/>API on localhost:8080]
    end

    subgraph "Step 1B: Provider Adapter"
        PROV[Implement RSAInferenceProvider<br/>that calls localhost:8080]
        BATCH[Implement generateBatch<br/>with parallel requests]
    end

    subgraph "Step 1C: Integration"
        ESP[Wire DualBrainController.decide<br/>into ESP32AgentRuntime<br/>sensing loop]
        TEST[Test: robot navigates<br/>using instinct + planner]
    end

    LLAMA --> QWEN --> API --> PROV --> BATCH --> ESP --> TEST
```

**What to do:**
1. Set up [llama.cpp](https://github.com/ggerganov/llama.cpp) server with [Qwen3-4B-Instruct](https://huggingface.co/Qwen/Qwen3-4B-Instruct) (Q4_K_M, ~2.5GB VRAM)
2. Create `lib/runtime/inference/local-llm-provider.ts` implementing `RSAInferenceProvider`
3. In `ESP32AgentRuntime`, replace the current single-LLM-call loop with `DualBrainController.decide()`
4. Test in simulator: set goal "explore room" → verify instinct handles walls → verify planner escalates on stuck

**Why first:** Without this, the RSA engine and Dual-Brain controller are just interfaces. This step makes them run.

**Estimated effort:** 2-3 days
**Hardware needed:** Any GPU with 8GB+ VRAM (RTX 3060, RTX 4060, etc.)

---

### Priority 2: Wire MobileNet to Real Camera Frames

**What to do:**
1. Install `@tensorflow-models/coco-ssd` and `@tensorflow/tfjs`
2. Create `lib/runtime/vision/tfjs-coco-backend.ts` implementing `ObjectDetectionBackend`
3. Connect to camera source (webcam for desktop, ESP32-CAM stream for real robot)
4. Feed `VisionFrame` output into `DualBrainController.decide()` context
5. Calibrate depth estimation constants for the specific camera lens

**Why second:** The Dual-Brain already works with sensor data alone. Vision adds richer scene understanding but isn't blocking.

**Estimated effort:** 2-3 days

---

### Priority 3: Unit Tests + CI

**What to do:**
1. Add test files:
   - `__tests__/lib/runtime/rsa-engine.test.ts` — population mechanics, consensus measurement, majority voting, early termination
   - `__tests__/lib/runtime/dual-brain-controller.test.ts` — escalation logic, reactive rules, plan caching
   - `__tests__/lib/runtime/vision/mobilenet-detector.test.ts` — depth estimation accuracy for known objects
   - `__tests__/lib/runtime/world-model.test.ts` — grid operations, exploration tracking, confidence decay
   - `__tests__/lib/hal/command-validator.test.ts` — safety rules, speed reduction, emergency stop
2. Create `.github/workflows/ci.yml`:
   ```yaml
   on: [pull_request]
   jobs:
     check:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4
         - uses: actions/setup-node@v4
         - run: npm ci
         - run: npx tsc --noEmit
         - run: npm run lint
         - run: npm test
   ```

**Why third:** The code works but has no safety net. Tests prevent regressions as integration work proceeds.

**Estimated effort:** 3-4 days

---

### Priority 4: End-to-End Integration Test

**What to do:**
1. Create an integration test that runs entirely in the simulator:
   - Spawn robot in 3D arena with obstacles
   - Set goal: "Find and collect the red cube"
   - Verify instinct handles reactive obstacle avoidance (check brain=instinct decisions)
   - Verify planner escalates when robot gets stuck (check brain=planner decisions)
   - Verify world model updates as robot explores (check exploration progress increases)
   - Verify VisionFrame detections include obstacles near the robot
2. Record the full run with `BlackBoxRecorder` for replay analysis

**Why fourth:** This validates the entire pipeline from sensing to action. If this test passes, the core architecture works.

**Estimated effort:** 2-3 days

---

### Priority 5: World Model Merging (Enables Swarm)

```mermaid
graph LR
    subgraph "Robot A World Model"
        A[Grid with sector 1<br/>explored cells]
    end

    subgraph "Robot B World Model"
        B[Grid with sector 2<br/>explored cells]
    end

    subgraph "Merge Operation"
        M[mergeWith<br/>Bayesian confidence fusion]
    end

    subgraph "Merged World Model"
        U[Unified grid<br/>Both sectors explored<br/>Conflicts resolved]
    end

    A --> M
    B --> M
    M --> U
```

**What to do:**
1. Add to `WorldModel` class in `lib/runtime/world-model.ts`:
   - `mergeWith(snapshot: WorldModelSnapshot, trustWeight: number): void` — Bayesian grid fusion
   - `toSerializable(): string` — JSON export for network transport
   - `static fromSerializable(json: string): WorldModel` — reconstruct from JSON
2. Merge rules:
   - Both `unknown` → stays `unknown`
   - One observed, one `unknown` → use observed value
   - Both observed, agree → increase confidence
   - Both observed, disagree → use higher confidence, reduce merged confidence
3. Add merged-model PiP view in `RobotWorldPanel.tsx`

**Why fifth:** This is the foundation for swarm intelligence (Phase 3). Once merging works, RSA swarm consensus can operate on real world model data.

**Estimated effort:** 3-4 days

---

### Priority 6: Fleet Communication (MQTT)

**What to do:**
1. Create `lib/hardware/fleet-coordinator.ts`:
   - Consume `FleetConfig` from `esp32-device-manager.ts` (currently defined but unused)
   - Implement `leader-follower` sync mode with heartbeat monitoring
   - Leader election via highest device uptime
2. Define message protocol:
   - `SNAPSHOT_SHARE` — world model snapshot from one robot
   - `TASK_ASSIGN` — leader assigns exploration sector
   - `HEARTBEAT` — alive signal with battery/position
   - `LEADER_ELECT` — election messages
3. Implement MQTT transport (ESP32 native via ESP-IDF, host via `mqtt.js`)
4. Wire `swarmConsensus()` from RSA engine to process incoming snapshots

**Why sixth:** Requires world model merging (Priority 5) and working Dual-Brain (Priority 1) first.

**Estimated effort:** 5-7 days

---

### Priority 7: Multi-Robot 3D Arena

**What to do:**
1. Extend `RobotCanvas3D.tsx` to render 2+ robots with distinct colors/labels
2. Show each robot's local world model PiP alongside the merged model
3. Visualize communication links between robots (lines/pulses)
4. Show fleet topology dashboard (leader, followers, health status)

**Estimated effort:** 3-4 days

---

### Priority 8: Aggregation-Aware RL (Advanced — Phase 4)

From [RSA paper Section 4](https://arxiv.org/html/2509.26626v1): Standard RL fine-tuning can *degrade* RSA performance because the model isn't trained to aggregate. The paper proposes augmenting training data with aggregation prompts.

**What to do:**
1. Collect robot planning scenarios from simulator runs
2. Generate aggregation training data: problem + K candidate solutions
3. Fine-tune Qwen3-4B with RLOO on mixed standard + aggregation prompts
4. Evaluate: compare RSA performance with base vs. aggregation-aware model

**Why last:** Requires working RSA pipeline (Priority 1), substantial training data, and GPU time. High impact but longer horizon.

**Estimated effort:** 2-3 weeks

---

## Implementation Timeline

```mermaid
gantt
    title LLMos Phase 2 Implementation Plan
    dateFormat YYYY-MM-DD
    axisFormat %b %d

    section Priority 1: Local LLM
        llama.cpp server setup           :p1a, 2026-02-10, 1d
        RSAInferenceProvider adapter     :p1b, after p1a, 1d
        Wire into ESP32AgentRuntime      :p1c, after p1b, 1d
        Test in simulator                :p1d, after p1c, 1d

    section Priority 2: MobileNet
        TF.js COCO-SSD backend           :p2a, 2026-02-10, 2d
        Camera source integration        :p2b, after p2a, 1d
        Depth calibration                :p2c, after p2b, 1d

    section Priority 3: Tests + CI
        RSA engine tests                 :p3a, after p1d, 1d
        Dual-Brain tests                 :p3b, after p3a, 1d
        World model + HAL tests          :p3c, after p3b, 1d
        GitHub Actions CI                :p3d, after p3c, 1d

    section Priority 4: E2E Test
        Integration test scenario        :p4a, after p3d, 2d
        Black-box recording verification :p4b, after p4a, 1d

    section Priority 5: World Model Merge
        mergeWith() implementation       :p5a, after p4b, 2d
        Serialization + PiP view         :p5b, after p5a, 2d

    section Priority 6: Fleet
        Fleet coordinator                :p6a, after p5b, 3d
        MQTT transport                   :p6b, after p6a, 2d
        Swarm consensus wiring           :p6c, after p6b, 2d

    section Priority 7: Multi-Robot Arena
        Multi-robot rendering            :p7a, after p6c, 3d
```

---

## Architecture Decisions Made

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Cloud vs. local LLM | **Local Qwen3-4B** | RSA makes 4B match cloud quality. $0 cost. Offline. <200ms instinct. |
| Reasoning strategy | **RSA (Recursive Self-Aggregation)** | Paper proves K=2 already massive improvement. Evolutionary approach matches our mutation engine philosophy. |
| Vision backbone | **MobileNet SSD via TF.js** | ~30ms local inference, 80 COCO classes, good depth estimation from bbox. |
| Depth estimation | **Pinhole model + bbox heuristics** | No depth camera needed. Known object sizes give accurate estimates. Floor position as fallback. |
| Instinct implementation | **Rule-based + single-pass LLM** | Rules for emergency (<5ms), LLM for nuanced decisions (~200ms). |
| Swarm consensus | **RSA swarm mode** | No separate consensus algorithm needed. RSA IS the consensus — robot observations are candidates in the population. |
| Inter-robot protocol | **MQTT** | Native ESP-IDF support, pub/sub fits swarm pattern, lightweight. |
| World model merge | **Bayesian confidence fusion** | Naturally handles varying sensor quality and temporal decay. |

## Architecture Decisions Still Needed

| Decision | Options | When Needed |
|----------|---------|-------------|
| Qwen3-4B quantization | Q4_K_M vs Q5_K_M vs Q8_0 | Priority 1 (benchmark quality vs. speed) |
| Inference server | llama.cpp vs vLLM vs Ollama | Priority 1 (test which gives best batch throughput) |
| Camera source for ESP32 | ESP32-CAM stream vs USB webcam on host | Priority 2 (affects latency architecture) |
| Test framework for 3D sim | Jest + mock canvas vs headless Three.js | Priority 3 |
| MQTT broker | Mosquitto vs HiveMQ vs embedded | Priority 6 |

---

## Key Research Papers

| Paper | Link | How We Use It |
|-------|------|---------------|
| RSA: Recursive Self-Aggregation | [arxiv.org/html/2509.26626v1](https://arxiv.org/html/2509.26626v1) | Planner brain. Enables Qwen3-4B to match o3-mini/DeepSeek-R1. |
| JEPA | [openreview.net](https://openreview.net/forum?id=BZ5a1r-kVsf) | Mental model. Predict-before-act paradigm for abstract state. |
| MobileNet V2 | [arxiv.org/abs/1801.04381](https://arxiv.org/abs/1801.04381) | Vision pipeline. Fast local object detection at ~30ms. |
| MobileNet SSD | [arxiv.org/abs/1704.04861](https://arxiv.org/abs/1704.04861) | Object detection backbone for structured scene understanding. |

---

## Files to Touch Next

These are the specific integration points for Priority 1 (wiring up the Dual-Brain):

| File | What to Do |
|------|-----------|
| **New:** `lib/runtime/inference/local-llm-provider.ts` | Implement `RSAInferenceProvider` calling local llama.cpp/vLLM server |
| **Modify:** `lib/runtime/esp32-agent-runtime.ts` | Replace single-LLM-call loop with `DualBrainController.decide()` |
| **Modify:** `lib/evolution/black-box-recorder.ts` | Add `brainDecision` field to frame recording (which brain, latency, escalation) |
| **New:** `lib/runtime/vision/tfjs-coco-backend.ts` | Implement `ObjectDetectionBackend` with `@tensorflow-models/coco-ssd` |
| **Modify:** `lib/runtime/world-model.ts` | Add `mergeWith()` method (~line 775) for Priority 5 |
| **Modify:** `lib/hardware/esp32-device-manager.ts` | Wire `FleetConfig` to actual fleet coordinator for Priority 6 |
