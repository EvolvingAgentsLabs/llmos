# JEPA Integration Analysis for LLMOS Robot Control

> **Implementation Status (February 2026):** Several integration points described in this document have been implemented. The occupancy grid, dual-brain architecture, predictive world model, RSA engine, and VLM integration are now working. The full neural JEPA training loop (ONNX/TensorFlow.js inference, MPPI trajectory optimizer) remains conceptual and planned for a future phase. See the [Implementation Status](#10-implementation-status) section at the end.

## Executive Summary

This document analyzes the current LLMOS robot control architecture and compares it with Facebook Research's EB-JEPA (Energy-Based Joint Embedding Predictive Architecture), specifically the **AC-JEPA** (Action-Conditioned JEPA) variant designed for embodied agents. We explore what ideas can be borrowed from JEPA and how a JEPA model could be integrated into the LLMOS system.

---

## 1. Current LLMOS Robot Control Architecture

### 1.1 Overview

The LLMOS robot uses a **dual-brain LLM-driven control loop** with the following characteristics:

```
+--------------------------------------------------------------+
|                    LLMOS CONTROL LOOP                          |
+--------------------------------------------------------------+
|                                                                |
|   Camera --> Qwen3-VL-8B --> VisionFrame + Reasoning           |
|                  |                                             |
|       +----------+----------+                                  |
|       v                     v                                  |
|  +----------+    +---------------------+                       |
|  | INSTINCT |    |      PLANNER        |                       |
|  | reactive |    | RSA (N=4, K=2, T=3) |                       |
|  |  <5ms    |    |   ~3-8 seconds      |                       |
|  +----+-----+    +----------+----------+                       |
|       +----------+----------+                                  |
|                  v                                              |
|     Predictive World Model (spatial heuristics)                |
|                  v                                              |
|           50x50 Occupancy Grid                                 |
|                  v                                              |
|       A* Planning + Candidate Generation                       |
|                  v                                              |
|            HAL --> ESP32 Robot                                  |
+--------------------------------------------------------------+
```

### 1.2 Key Components

| Component | Description | File |
|-----------|-------------|------|
| **Dual-Brain Controller** | Two-tier cognitive architecture (instinct + planner) | `lib/runtime/dual-brain-controller.ts` |
| **RSA Engine** | Recursive Self-Aggregation for deep reasoning | `lib/runtime/rsa-engine.ts` |
| **Predictive World Model** | Spatial extrapolation heuristics | `lib/runtime/predictive-world-model.ts` |
| **World Model** | 50x50 occupancy grid (10cm resolution) | `lib/runtime/world-model.ts` |
| **Navigation Loop** | Full sense-think-act cycle with A* planning | `lib/runtime/navigation-loop.ts` |
| **OpenRouter Adapter** | Cloud model serving (Qwen3-VL-8B) | `lib/llm/openrouter-inference-adapter.ts` |
| **VLM Integration** | Qwen3-VL-8B for real-time multimodal perception | Via OpenRouter |
| **HAL** | Unified interface for simulation and physical hardware | `lib/hal/` |

### 1.3 Decision Making Process

1. **Perception**: Camera frame processed by Qwen3-VL-8B (multimodal VLM) producing VisionFrame with detections and reasoning
2. **Reactive Instinct**: Rule-based checks (<5ms) for emergency avoidance, wall following, clear path
3. **Escalation Check**: Stuck detection, low vision confidence, periodic replan, frontier exhaustion
4. **Planning (when escalated)**: RSA engine generates N candidate plans, aggregates K at a time over T recursive steps
5. **Spatial Prediction**: `PredictiveWorldModel` fills unknown grid cells using wall continuation, corridor detection, open space expansion, boundary walls
6. **Path Planning**: A* on the occupancy grid with candidate waypoint generation
7. **Execution**: HAL routes motor commands to simulation or physical ESP32

### 1.4 World Model (Current -- Implemented)

```typescript
// 50x50 occupancy grid (10cm resolution = 5m x 5m arena)
// Updated via ray-casting from sensor readings AND predictive heuristics
interface GridCell {
  state: 'unknown' | 'free' | 'obstacle' | 'explored' | 'wall';
  confidence: number;  // 0.0 to 1.0
  visitCount: number;
  lastUpdated: number;
}

// PredictiveWorldModel fills unknown cells:
//   - wall_continuation: extends observed walls (confidence 0.3)
//   - corridor: predicts parallel wall + free continuation (confidence 0.25)
//   - open_space: expands large free areas (confidence 0.2)
//   - boundary: fills arena edges with walls (confidence 0.3)
```

### 1.5 Remaining Limitations

| Limitation | Impact | Mitigation |
|------------|--------|------------|
| **No learned representations** | World model is heuristic, not learned from experience | Planned: neural JEPA backbone for learned embeddings |
| **LLM latency** | 200-500ms for instinct, 3-22s for planner | Dual-brain: reactive instinct handles time-critical decisions in <5ms |
| **No continuous trajectory optimization** | Discrete action space (5 actions) | Planned: MPPI/CEM trajectory optimization with neural predictor |
| **Prediction is spatial only** | `PredictiveWorldModel` extrapolates geometry, not dynamics | Planned: action-conditioned prediction (AC-JEPA style) |

---

## 2. EB-JEPA / AC-JEPA Architecture

### 2.1 Overview

JEPA (Joint Embedding Predictive Architecture) learns to predict **representations of future states** rather than raw pixels. AC-JEPA extends this for embodied agents by conditioning predictions on **actions**.

```
+--------------------------------------------------------------+
|                    AC-JEPA ARCHITECTURE                        |
+--------------------------------------------------------------+
|                                                                |
|   Observation_0 --> Encoder --> z_0 --+                        |
|                    (IMPALA)           |                        |
|                                       v                        |
|   Action_0 ----------------------> Predictor --> z_hat_1       |
|                                   (GRU)           |            |
|                                                   v            |
|   Action_1 ----------------------> Predictor --> z_hat_2       |
|                                   (GRU)           |            |
|                                                   v            |
|                                                  ...           |
|                                                   |            |
|   Goal --> Encoder --> z_goal                     |            |
|                          |                        |            |
|                          v                        v            |
|                    +-----------------------------+             |
|                    |     Planning (MPPI/CEM)     |             |
|                    |  min Sum ||z_hat_t - z_goal||^2 |         |
|                    +-----------------------------+             |
+--------------------------------------------------------------+
```

### 2.2 Key Components

| Component | Description | Architecture |
|-----------|-------------|--------------|
| **Encoder** | Maps observations to latent space | IMPALA CNN to global vector |
| **Predictor** | Predicts future embeddings given action | 2-layer GRU |
| **Action Encoder** | Encodes actions for predictor | Identity (2D actions) |
| **Regularizer** | Prevents representation collapse | Variance + Covariance loss |

### 2.3 Training Losses

```
L_total = L_pred + beta*L_cov + alpha*L_var + delta*L_time-sim + omega*L_IDM

Where:
- L_pred: Prediction error (z_hat_t+1 vs z_target)
- L_cov: Covariance loss (feature independence)
- L_var: Variance loss (feature diversity)
- L_time-sim: Temporal consistency
- L_IDM: Inverse dynamics (prevents spurious correlations)
```

### 2.4 Planning Mechanism

AC-JEPA uses **Model Predictive Path Integral (MPPI)** planning:

```python
# MPPI Planning Pseudocode
def plan(current_obs, goal_obs, world_model):
    z_current = encoder(current_obs)
    z_goal = encoder(goal_obs)

    # Initialize action distribution
    action_mean = zeros(horizon, action_dim)
    action_std = ones(horizon, action_dim)

    for iteration in range(mppi_iterations):
        # Sample action trajectories
        actions = sample_gaussian(action_mean, action_std, num_samples)

        # Rollout in latent space (FAST - no pixel generation)
        costs = []
        for action_seq in actions:
            z = z_current
            total_cost = 0
            for t, a in enumerate(action_seq):
                z = predictor(z, a)  # Single forward pass
                total_cost += ||z - z_goal||^2
            costs.append(total_cost)

        # Update distribution using elite samples
        elite_idx = argsort(costs)[:top_k]
        action_mean = weighted_mean(actions[elite_idx], costs[elite_idx])
        action_std = weighted_std(actions[elite_idx], costs[elite_idx])

    return action_mean[0]  # Return first action
```

---

## 3. Comparison: LLMOS vs AC-JEPA

### 3.1 Architecture Comparison

| Aspect | LLMOS (Current) | AC-JEPA |
|--------|-----------------|---------|
| **World Model** | Occupancy grid + spatial heuristics + VLM | Learned latent embeddings |
| **State Representation** | Discrete cells + VisionFrame from Qwen3-VL-8B | Continuous learned vectors |
| **Prediction** | Spatial heuristics (wall continuation, corridors, open space) | Autoregressive latent prediction |
| **Planning** | A* on grid + RSA for multi-step reasoning | Gradient-based trajectory optimization |
| **Learning** | Prediction verification (verify correct/wrong) | Offline training on trajectories |
| **Latency** | <5ms reactive, 200-500ms instinct, 3-22s planner | ~10ms (neural network forward pass) |
| **Generalization** | Zero-shot via LLM reasoning | Learned from training distribution |

### 3.2 Strengths Comparison

| LLMOS Strengths | AC-JEPA Strengths |
|-----------------|-------------------|
| Zero-shot reasoning (Qwen3-VL-8B) | Learned dynamics model |
| Natural language goals | Fast inference (~10ms) |
| Explainable decisions (RSA reasoning chains) | Predictive planning |
| Easy to modify behavior (skill cartridges) | Temporal consistency |
| Works without training | Continuous optimization |
| Dual-brain: fast instinct + deep planner | Single unified model |

### 3.3 Planning Approach Comparison

**LLMOS Planning (Current):**
```
1. Camera frame -> Qwen3-VL-8B -> VisionFrame
2. Reactive instinct checks (<5ms)
3. If escalated: RSA generates N candidates, aggregates K at a time, T steps
4. PredictiveWorldModel fills unknown cells with spatial heuristics
5. A* plans path on occupancy grid
6. Execute first action of plan
7. Verify predictions against observations
8. Repeat
```

**AC-JEPA Planning:**
```
1. Encode current observation -> z_0
2. Encode goal -> z_goal
3. Sample many action sequences
4. For each sequence: rollout predictor -> trajectory of z_hat_1...z_hat_t
5. Score trajectories by distance to z_goal
6. Refine action distribution
7. Execute best action
8. Repeat
```

---

## 4. Ideas to Adopt from JEPA

### 4.1 Learned Latent World Model (Planned)

**Idea**: Replace or augment the grid-based world model with a learned embedding space.

**Benefits**:
- Captures complex scene semantics (not just geometry)
- Enables similarity-based reasoning ("this looks like that corner")
- More robust to sensor noise

**Current partial implementation**: The `PredictiveWorldModel` provides spatial extrapolation heuristics that approximate learned representations using deterministic rules. A full neural backbone remains planned.

### 4.2 Action-Conditioned Prediction (Partially Implemented)

**Idea**: Before executing an action, predict its outcome in latent space.

**Benefits**:
- Detect "bad" actions before executing
- Enable multi-step lookahead
- Reduce physical collisions

**Current implementation**: The `reactiveInstinct()` function in `dual-brain-controller.ts` performs action-conditioned prediction using rules (e.g., "if front < 15cm and I move forward, collision"). The RSA planner generates candidate plans that reason about action outcomes. A neural action-conditioned predictor (GRU-based) remains planned.

### 4.3 Trajectory Optimization via Rollouts (Partially Implemented)

**Idea**: Instead of single-step LLM decisions, optimize action sequences.

**Benefits**:
- Smoother trajectories
- Better long-horizon planning
- Can consider multiple futures

**Current implementation**: The RSA engine implements this concept using LLM-based rollouts. It maintains N candidate reasoning chains, aggregates K at a time, and refines over T steps -- analogous to sampling and optimizing trajectories. However, this operates at LLM speed (seconds) rather than neural speed (milliseconds). A fast MPPI/CEM optimizer using a neural world model remains planned.

### 4.4 Temporal Consistency Loss (Conceptual)

**Idea**: Ensure smooth representation changes over time.

**Benefits**:
- More stable world model updates
- Better tracking of environment changes
- Reduced flickering in predictions

**Application**: The `PredictiveWorldModel` partially addresses this by assigning low confidence to predictions and only overriding them when observed data has higher confidence. A formal temporal consistency loss in the neural training loop remains conceptual.

### 4.5 Energy-Based Scoring (Conceptual)

**Idea**: Use energy functions to score state-action pairs.

**Benefits**:
- More nuanced than binary obstacle detection
- Can express preferences, not just constraints
- Enables soft planning

**Current approximation**: The dual-brain controller scores decisions by confidence (0-1) and the RSA engine measures consensus across candidates. A formal energy function for state-action scoring remains conceptual.

---

## 5. Hybrid Architecture Proposal

### 5.1 Architecture Overview (Partially Realized)

The dual-brain architecture is now implemented as the core of the LLMOS control loop:

```
+----------------------------------------------------------------------+
|                    HYBRID LLMOS + JEPA ARCHITECTURE                    |
+----------------------------------------------------------------------+
|                                                                        |
|  +---------------------------------------------------------------+   |
|  |           HIGH-LEVEL PLANNER (RSA Engine)         [IMPLEMENTED] |   |
|  |  Goal -> RSA (N candidates, K aggregated, T steps)              |   |
|  |  Qwen3-VL-8B via OpenRouter, ~3-22 seconds                     |   |
|  +----------------------------+----------------------------------+   |
|                               |                                        |
|                               v                                        |
|  +---------------------------------------------------------------+   |
|  |           PREDICTIVE WORLD MODEL                  [IMPLEMENTED] |   |
|  |  Spatial heuristics: wall continuation, corridors, open space   |   |
|  |  50x50 occupancy grid, prediction verification                  |   |
|  +----------------------------+----------------------------------+   |
|                               |                                        |
|                               v                                        |
|  +---------------------------------------------------------------+   |
|  |           JEPA NEURAL BACKBONE                      [PLANNED]   |   |
|  |  Encoder (IMPALA) + Predictor (GRU) + MPPI optimizer            |   |
|  |  TensorFlow.js or ONNX Runtime, ~10ms inference                 |   |
|  +----------------------------+----------------------------------+   |
|                               |                                        |
|                               v                                        |
|  +---------------------------------------------------------------+   |
|  |           LOW-LEVEL CONTROLLER                    [IMPLEMENTED] |   |
|  |  Reactive instinct (<5ms) + HAL -> ESP32 motor commands         |   |
|  +---------------------------------------------------------------+   |
|                                                                        |
+----------------------------------------------------------------------+
```

### 5.2 Layer Responsibilities

| Layer | Frequency | Responsibility | Technology | Status |
|-------|-----------|----------------|------------|--------|
| **High-Level Planner** | 0.1-1Hz | Goal decomposition, deep reasoning | RSA + Qwen3-VL-8B | **Implemented** |
| **Predictive Model** | Every cycle | Spatial extrapolation, fill unknown cells | Deterministic heuristics | **Implemented** |
| **JEPA World Model** | 100-500ms | Trajectory optimization (neural) | TensorFlow.js / ONNX | **Planned** |
| **Low-Level Controller** | 10Hz+ | Reactive safety, motor control | Rule-based instinct + HAL | **Implemented** |

### 5.3 Data Flow (Current Implementation)

```typescript
// High-level: RSA planner generates multi-step plans (on escalation)
const rsaResult = await rsaEngine.planRobotAction(
  situation, worldModelSummary, visionContext, mapImage
);

// Mid-level: PredictiveWorldModel fills unknown cells (every cycle)
const newPredictions = predictiveModel.predict(worldModel);

// Path planning: A* on the occupancy grid
const path = aStarPlan(worldModel, currentPos, goalPos);

// Low-level: Reactive instinct for immediate safety (<5ms)
const reactive = reactiveInstinct(sensorData, visionFrame, config);

// Execution via HAL
await hal.drive(leftWheel, rightWheel);
```

### 5.4 When to Use Each Component

| Situation | Component | Reasoning | Status |
|-----------|-----------|-----------|--------|
| Imminent collision | Reactive instinct | <5ms safety critical | **Implemented** |
| Clear path ahead | Reactive instinct | High-confidence rule | **Implemented** |
| Unknown object | RSA planner | Deep multimodal reasoning | **Implemented** |
| Stuck / looping | RSA planner | Needs creative replanning | **Implemented** |
| Unknown cells | Predictive model | Spatial extrapolation | **Implemented** |
| Fast trajectory optimization | Neural JEPA | 10ms neural inference | **Planned** |
| Goal specification | LLM | Natural language understanding | **Implemented** |

---

## 6. Implementation Roadmap

### Phase 1: Dual-Brain + Predictive Model -- COMPLETED

1. **Dual-Brain Controller** -- `lib/runtime/dual-brain-controller.ts`
   - Reactive instinct (rule-based, <5ms)
   - LLM instinct (single-pass Qwen3-VL-8B, ~200ms)
   - RSA planner (N=4-16 candidates, K=2-4, T=2-6 steps)
   - Escalation logic: stuck, unknown object, periodic replan, looping, frontier exhaustion

2. **RSA Engine** -- `lib/runtime/rsa-engine.ts`
   - Population-based reasoning with aggregation
   - Multimodal support (camera + map images via VLM)
   - Swarm consensus mode for multi-robot coordination
   - Presets: quick (~2.5s), standard (~8s), deep (~22s)

3. **Predictive World Model** -- `lib/runtime/predictive-world-model.ts`
   - Wall continuation heuristic
   - Corridor detection and extrapolation
   - Open space expansion
   - Boundary wall prediction
   - Prediction verification against observations

4. **VLM Integration** -- Qwen3-VL-8B via OpenRouter
   - Real-time camera frame analysis
   - Multimodal RSA (each candidate independently analyzes images)
   - Vision-aware aggregation prompts

### Phase 2: JEPA Neural Backbone -- PLANNED

1. **Collect Training Data**
   - Run robot in simulation with random exploration
   - Record: observations, actions, next observations
   - Target: 100k+ transitions

2. **Train JEPA Components**
   - Encoder: IMPALA or ResNet-18 (small for edge)
   - Predictor: 2-layer GRU
   - Use EB-JEPA training recipe

3. **Export for Browser**
   - Convert to ONNX or TensorFlow.js format
   - Quantize for size/speed

### Phase 3: Neural Integration -- PLANNED

1. **Add JEPA Inference** alongside existing heuristic model
2. **MPPI/CEM Trajectory Optimization** for continuous action space
3. **Hybrid Decision Making** -- neural for fast, LLM for complex
4. **Online Fine-tuning** during deployment

---

## 7. Estimated Performance Improvements

| Metric | Original LLMOS | Current (Dual-Brain) | With Neural JEPA (Planned) |
|--------|----------------|---------------------|---------------------------|
| Decision latency | 500-2000ms | <5ms (instinct) / 3-22s (planner) | 10-50ms (neural) |
| Collision rate | ~5% | ~2% (reactive instinct) | ~1% (predicted avoidance) |
| Trajectory smoothness | Jerky | Improved (multi-step plans) | Smooth (continuous optimization) |
| Prediction horizon | 1 step | 3-6 steps (RSA) + spatial extrapolation | 20+ steps (neural rollout) |
| LLM API calls | Every 2s | Instinct: every cycle, Planner: on escalation | Every 10-30s (neural handles routine) |

---

## 8. Challenges and Mitigations

| Challenge | Mitigation |
|-----------|------------|
| JEPA model size (~50MB) | Quantization, progressive loading |
| Training data requirements | Simulation-to-real transfer, data augmentation |
| Sim-to-real gap | Domain randomization, fine-tuning on real data |
| Browser performance | WebGPU acceleration, model distillation |
| Catastrophic forgetting | Replay buffers, elastic weight consolidation |

---

## 9. Conclusion

The LLMOS dual-brain architecture has realized the core JEPA concept of **predicting in abstract space before acting**, using LLM-based reasoning and spatial heuristics rather than neural network inference. The current implementation provides:

- **Fast reactive instinct** (<5ms) for safety-critical decisions
- **Deep RSA planning** (3-22s) for complex reasoning with multi-candidate aggregation
- **Spatial prediction** that fills unknown grid cells using wall continuation, corridor detection, and open space expansion
- **VLM-powered perception** via Qwen3-VL-8B for rich visual understanding

The next frontier is integrating a **neural JEPA backbone** for fast (~10ms) trajectory optimization, which would complement the existing LLM-based planner by handling routine navigation at neural speed while reserving LLM reasoning for complex decisions.

---

## 10. Implementation Status

| Integration Point | Status | File(s) |
|-------------------|--------|---------|
| Dual-brain architecture (instinct + planner) | **Implemented** | `lib/runtime/dual-brain-controller.ts` |
| RSA engine for deep reasoning | **Implemented** | `lib/runtime/rsa-engine.ts` |
| Predictive world model (spatial heuristics) | **Implemented** | `lib/runtime/predictive-world-model.ts` |
| 50x50 occupancy grid | **Implemented** | `lib/runtime/world-model.ts` |
| A* path planning + candidate generation | **Implemented** | `lib/runtime/navigation-loop.ts` |
| VLM integration (Qwen3-VL-8B) | **Implemented** | `lib/llm/openrouter-inference-adapter.ts` |
| OpenRouter cloud inference adapter | **Implemented** | `lib/llm/openrouter-inference-adapter.ts` |
| Multimodal RSA (camera + map images) | **Implemented** | `lib/runtime/rsa-engine.ts` |
| Prediction verification | **Implemented** | `lib/runtime/predictive-world-model.ts` |
| Neural JEPA encoder/predictor | **Planned** | -- |
| MPPI/CEM trajectory optimization | **Planned** | -- |
| Neural training loop (EB-JEPA recipe) | **Conceptual** | -- |
| Learned latent representations | **Conceptual** | -- |
| Online fine-tuning | **Conceptual** | -- |

---

## References

1. [EB-JEPA Repository](https://github.com/facebookresearch/eb_jepa)
2. LeCun, Y. "A Path Towards Autonomous Machine Intelligence" (2022)
3. MPPI: Williams et al. "Information Theoretic MPC for Model-Based Reinforcement Learning" (2017)
4. CEM: Rubinstein & Kroese "The Cross-Entropy Method" (2004)
5. RSA: Venkatraman, Jain, Mittal et al. "Recursive Self-Aggregation Unlocks Deep Thinking in LLMs" (2025) -- https://arxiv.org/html/2509.26626v1

---

*Document generated: 2026-02-04*
*Updated: 2026-02-16 -- Added implementation status for dual-brain, RSA, predictive model, and VLM integration*
*LLMOS Robot Control Analysis v2.0*
