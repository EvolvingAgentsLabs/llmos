# JEPA Integration Analysis for LLMOS Robot Control

## Executive Summary

This document analyzes the current LLMOS robot control architecture and compares it with Facebook Research's EB-JEPA (Energy-Based Joint Embedding Predictive Architecture), specifically the **AC-JEPA** (Action-Conditioned JEPA) variant designed for embodied agents. We explore what ideas can be borrowed from JEPA and how a JEPA model could be integrated into the LLMOS system.

---

## 1. Current LLMOS Robot Control Architecture

### 1.1 Overview

The LLMOS robot uses an **LLM-driven control loop** with the following characteristics:

```
┌─────────────────────────────────────────────────────────────┐
│                    LLMOS CONTROL LOOP                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   OBSERVE → ANALYZE → PLAN → ROTATE → MOVE → STOP → REPEAT │
│                                                             │
│   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    │
│   │   Sensors   │───▶│     LLM     │───▶│   Motors    │    │
│   │  (8 dist,   │    │  (Claude/   │    │  (L/R PWM)  │    │
│   │   camera)   │    │   Gemini)   │    │             │    │
│   └─────────────┘    └─────────────┘    └─────────────┘    │
│          │                  │                               │
│          │                  ▼                               │
│          │         ┌─────────────┐                          │
│          └────────▶│ World Model │                          │
│                    │  (Grid Map) │                          │
│                    └─────────────┘                          │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 Key Components

| Component | Description | File |
|-----------|-------------|------|
| **ESP32 Agent Runtime** | Main control loop (2s interval) | `esp32-agent-runtime.ts` |
| **World Model** | Grid-based occupancy map (10cm resolution) | `world-model.ts` |
| **Trajectory Planner** | Waypoint-based path planning | `trajectory-planner.ts` |
| **LLM Client** | OpenAI-compatible API (Claude, Gemini) | `llm/client.ts` |
| **Sensor System** | 8 distance sensors, camera, IMU | `hardware/` |

### 1.3 Decision Making Process

1. **Perception**: Raw sensor data → formatted context
2. **Reasoning**: LLM receives sensor context + conversation history
3. **Action**: LLM outputs structured JSON with wheel commands
4. **Learning**: Conversation history enables few-shot learning within session

### 1.4 World Model (Current)

```typescript
// Grid-based discrete state representation
interface GridCell {
  state: 'unknown' | 'free' | 'obstacle' | 'explored';
  confidence: number;  // 0.0 to 1.0
  visitCount: number;
}

// Updated via ray-casting from sensor readings
// No learned representations - purely geometric
```

### 1.5 Limitations of Current Approach

| Limitation | Impact |
|------------|--------|
| **No predictive model** | Cannot simulate future states before acting |
| **Reactive planning** | Plans based on current observation, not predicted outcomes |
| **No learned representations** | World model is hand-coded, not learned from experience |
| **LLM latency** | 500-2000ms per decision limits reaction speed |
| **No temporal consistency** | Each LLM call is somewhat independent |

---

## 2. EB-JEPA / AC-JEPA Architecture

### 2.1 Overview

JEPA (Joint Embedding Predictive Architecture) learns to predict **representations of future states** rather than raw pixels. AC-JEPA extends this for embodied agents by conditioning predictions on **actions**.

```
┌─────────────────────────────────────────────────────────────┐
│                    AC-JEPA ARCHITECTURE                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   Observation₀ ──▶ Encoder ──▶ z₀ ──┐                       │
│                    (IMPALA)         │                       │
│                                     ▼                       │
│   Action₀ ────────────────────▶ Predictor ──▶ ẑ₁           │
│                                   (GRU)       │             │
│                                               ▼             │
│   Action₁ ────────────────────▶ Predictor ──▶ ẑ₂           │
│                                   (GRU)       │             │
│                                               ▼             │
│                                              ...            │
│                                               │             │
│   Goal ──▶ Encoder ──▶ z_goal                │             │
│                          │                    │             │
│                          ▼                    ▼             │
│                    ┌─────────────────────────────┐          │
│                    │     Planning (MPPI/CEM)     │          │
│                    │  min Σ ||ẑₜ - z_goal||²    │          │
│                    └─────────────────────────────┘          │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 Key Components

| Component | Description | Architecture |
|-----------|-------------|--------------|
| **Encoder** | Maps observations to latent space | IMPALA CNN → global vector |
| **Predictor** | Predicts future embeddings given action | 2-layer GRU |
| **Action Encoder** | Encodes actions for predictor | Identity (2D actions) |
| **Regularizer** | Prevents representation collapse | Variance + Covariance loss |

### 2.3 Training Losses

```
L_total = L_pred + β·L_cov + α·L_var + δ·L_time-sim + ω·L_IDM

Where:
- L_pred: Prediction error (ẑₜ₊₁ vs z_target)
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
                total_cost += ||z - z_goal||²
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
| **World Model** | Grid-based occupancy | Learned latent embeddings |
| **State Representation** | Discrete cells + sensor values | Continuous learned vectors |
| **Prediction** | None (reactive) | Autoregressiv latent prediction |
| **Planning** | Heuristic waypoints | Gradient-based trajectory optimization |
| **Learning** | In-context (conversation history) | Offline training on trajectories |
| **Latency** | 500-2000ms (LLM call) | ~10ms (neural network forward pass) |
| **Generalization** | Zero-shot via LLM reasoning | Learned from training distribution |

### 3.2 Strengths Comparison

| LLMOS Strengths | AC-JEPA Strengths |
|-----------------|-------------------|
| Zero-shot reasoning | Learned dynamics model |
| Natural language goals | Fast inference (~10ms) |
| Explainable decisions | Predictive planning |
| Easy to modify behavior | Temporal consistency |
| Works without training | Continuous optimization |

### 3.3 Planning Approach Comparison

**LLMOS Planning:**
```
1. Read sensors
2. Ask LLM: "Given sensors X, what should I do to achieve goal Y?"
3. LLM reasons in natural language
4. Execute single action
5. Repeat
```

**AC-JEPA Planning:**
```
1. Encode current observation → z₀
2. Encode goal → z_goal
3. Sample many action sequences
4. For each sequence: rollout predictor → trajectory of ẑ₁...ẑₜ
5. Score trajectories by distance to z_goal
6. Refine action distribution
7. Execute best action
8. Repeat
```

---

## 4. Ideas to Adopt from JEPA

### 4.1 Learned Latent World Model

**Idea**: Replace or augment the grid-based world model with a learned embedding space.

**Benefits**:
- Captures complex scene semantics (not just geometry)
- Enables similarity-based reasoning ("this looks like that corner")
- More robust to sensor noise

**Implementation Approach**:
```typescript
// New: Latent world model alongside grid model
interface LatentWorldModel {
  encode(observation: SensorReading): Float32Array;  // → z vector
  predict(z: Float32Array, action: Action): Float32Array;  // → ẑ_next
  similarity(z1: Float32Array, z2: Float32Array): number;
}

// Use ONNX.js or TensorFlow.js for browser inference
```

### 4.2 Action-Conditioned Prediction

**Idea**: Before executing an action, predict its outcome in latent space.

**Benefits**:
- Detect "bad" actions before executing
- Enable multi-step lookahead
- Reduce physical collisions

**Implementation Approach**:
```typescript
async function evaluateAction(
  currentState: LatentState,
  proposedAction: WheelCommand,
  worldModel: LatentWorldModel
): Promise<ActionEvaluation> {
  const predictedState = worldModel.predict(currentState, proposedAction);

  return {
    collisionRisk: worldModel.isObstacleRegion(predictedState),
    progressToGoal: worldModel.distanceToGoal(predictedState),
    novelty: worldModel.explorationValue(predictedState),
  };
}
```

### 4.3 Trajectory Optimization via Rollouts

**Idea**: Instead of single-step LLM decisions, optimize action sequences.

**Benefits**:
- Smoother trajectories
- Better long-horizon planning
- Can consider multiple futures

**Implementation Approach**:
```typescript
function optimizeTrajectory(
  currentZ: Float32Array,
  goalZ: Float32Array,
  worldModel: LatentWorldModel,
  horizon: number = 10
): Action[] {
  let bestActions: Action[] = [];
  let bestCost = Infinity;

  // Sample-based optimization (CEM-style)
  for (let iter = 0; iter < 50; iter++) {
    const actionSeq = sampleActionSequence(horizon);
    const cost = evaluateSequence(currentZ, actionSeq, goalZ, worldModel);

    if (cost < bestCost) {
      bestCost = cost;
      bestActions = actionSeq;
    }
  }

  return bestActions;
}
```

### 4.4 Temporal Consistency Loss

**Idea**: Ensure smooth representation changes over time.

**Benefits**:
- More stable world model updates
- Better tracking of environment changes
- Reduced flickering in predictions

**Application**: Add temporal smoothing to world model updates:
```typescript
// Instead of hard updates:
cell.state = newState;

// Use exponential smoothing:
cell.confidence = α * newConfidence + (1-α) * cell.confidence;
cell.embedding = α * newEmbedding + (1-α) * cell.embedding;
```

### 4.5 Energy-Based Scoring

**Idea**: Use energy functions to score state-action pairs.

**Benefits**:
- More nuanced than binary obstacle detection
- Can express preferences, not just constraints
- Enables soft planning

**Implementation**:
```typescript
function computeEnergy(state: LatentState, action: Action): number {
  const nextState = predict(state, action);

  return (
    α * obstacleEnergy(nextState) +
    β * goalDistanceEnergy(nextState) +
    γ * explorationEnergy(nextState) +
    δ * smoothnessEnergy(state, nextState)
  );
}
```

---

## 5. Hybrid Architecture Proposal

### 5.1 Architecture Overview

Combine the best of both approaches:

```
┌─────────────────────────────────────────────────────────────────────┐
│                    HYBRID LLMOS + JEPA ARCHITECTURE                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                    HIGH-LEVEL PLANNER (LLM)                   │  │
│  │  "Explore the room" → Subgoals: [corner1, corner2, center]   │  │
│  └────────────────────────────┬─────────────────────────────────┘  │
│                               │                                     │
│                               ▼                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                    JEPA WORLD MODEL                           │  │
│  │  ┌─────────┐    ┌───────────┐    ┌──────────────────────┐    │  │
│  │  │ Encoder │───▶│ Predictor │───▶│ Trajectory Optimizer │    │  │
│  │  │ (visual)│    │ (action-  │    │ (MPPI/CEM rollouts)  │    │  │
│  │  └─────────┘    │ conditioned│    └──────────────────────┘    │  │
│  │                 └───────────┘                                 │  │
│  └────────────────────────────┬─────────────────────────────────┘  │
│                               │                                     │
│                               ▼                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                    LOW-LEVEL CONTROLLER                       │  │
│  │  Waypoints → PID control → Motor commands @ 50Hz             │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 5.2 Layer Responsibilities

| Layer | Frequency | Responsibility | Technology |
|-------|-----------|----------------|------------|
| **High-Level Planner** | 5-30s | Goal decomposition, strategy | LLM (Claude/Gemini) |
| **JEPA World Model** | 100-500ms | Trajectory optimization | Neural network |
| **Low-Level Controller** | 20ms | Motor control, safety | PID / reactive |

### 5.3 Data Flow

```typescript
// High-level: LLM sets goals (every 5-30 seconds)
const goalEmbedding = jepaEncoder.encode(goalImage);
const subgoals = await llm.decomposeGoal("explore the room", currentContext);

// Mid-level: JEPA optimizes trajectories (every 100-500ms)
const trajectory = jepaPlanner.optimize(
  currentEmbedding,
  subgoals[0].embedding,
  horizon = 20  // 2 second lookahead
);

// Low-level: Execute trajectory (every 20ms)
const motorCommand = trajectoryExecutor.getCommand(trajectory, currentPose);
```

### 5.4 When to Use Each Component

| Situation | Component | Reasoning |
|-----------|-----------|-----------|
| New environment | LLM | Zero-shot reasoning needed |
| Obstacle avoidance | JEPA | Fast prediction required |
| Goal specification | LLM | Natural language understanding |
| Trajectory smoothing | JEPA | Continuous optimization |
| Stuck detection | LLM | Reasoning about failures |
| Path following | Low-level | Real-time control |

---

## 6. Implementation Roadmap

### Phase 1: JEPA Model Training (Offline)

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

### Phase 2: Integration

1. **Add JEPA Inference**
   ```typescript
   // New file: lib/jepa/jepa-world-model.ts
   import * as ort from 'onnxruntime-web';

   export class JEPAWorldModel {
     private encoder: ort.InferenceSession;
     private predictor: ort.InferenceSession;

     async encode(observation: ImageData): Promise<Float32Array>;
     async predict(z: Float32Array, action: number[]): Promise<Float32Array>;
   }
   ```

2. **Modify Planning Loop**
   - Add JEPA trajectory optimization before LLM call
   - Use JEPA predictions to validate LLM suggestions
   - Fall back to LLM when JEPA confidence is low

3. **Hybrid Decision Making**
   ```typescript
   async function decide(sensors: SensorReadings, goal: string) {
     const currentZ = await jepa.encode(sensors.camera);
     const goalZ = await jepa.encode(goalImage);

     // Fast JEPA trajectory optimization
     const jepaTrajectory = await jepa.optimize(currentZ, goalZ);

     if (jepaTrajectory.confidence > 0.8) {
       return jepaTrajectory.actions[0];  // Fast path
     }

     // Fall back to LLM for complex reasoning
     const llmDecision = await llm.decide(sensors, goal, jepaTrajectory);
     return llmDecision;
   }
   ```

### Phase 3: Continuous Learning

1. **Online Fine-tuning**
   - Collect new transitions during deployment
   - Periodically update JEPA model
   - Track prediction accuracy

2. **LLM-JEPA Alignment**
   - Use LLM to label "good" vs "bad" trajectories
   - Fine-tune JEPA reward model
   - Enable preference learning

---

## 7. Estimated Performance Improvements

| Metric | Current LLMOS | With JEPA | Improvement |
|--------|---------------|-----------|-------------|
| Decision latency | 500-2000ms | 50-100ms | 10-20x faster |
| Collision rate | ~5% | ~1% | 5x reduction |
| Trajectory smoothness | Jerky | Smooth | Qualitative |
| Prediction horizon | 1 step | 20+ steps | 20x longer |
| LLM API calls | Every 2s | Every 10-30s | 5-15x reduction |

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

Integrating JEPA into LLMOS offers a compelling path to **faster, smoother, and more predictive** robot control while retaining the **zero-shot reasoning** capabilities of LLMs. The hybrid architecture uses each component where it excels:

- **LLM**: High-level planning, goal understanding, failure recovery
- **JEPA**: Fast trajectory optimization, predictive world modeling
- **Reactive controller**: Real-time safety, motor control

This combination could achieve the best of both worlds: the **flexibility** of language-based control with the **speed** of learned dynamics models.

---

## References

1. [EB-JEPA Repository](https://github.com/facebookresearch/eb_jepa)
2. LeCun, Y. "A Path Towards Autonomous Machine Intelligence" (2022)
3. MPPI: Williams et al. "Information Theoretic MPC for Model-Based Reinforcement Learning" (2017)
4. CEM: Rubinstein & Kroese "The Cross-Entropy Method" (2004)

---

*Document generated: 2026-02-04*
*LLMOS Robot Control Analysis v1.0*
