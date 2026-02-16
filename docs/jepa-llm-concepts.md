# JEPA Concepts with LLM-Only Implementation

> **Status: Realized.** The concepts described in this document have been implemented in the dual-brain controller and predictive world model. See the [Implementation Files](#implementation-files) section for concrete code references.

## Overview

This document explains how we implement JEPA (Joint Embedding Predictive Architecture) concepts using **only** the LLM, agent tools, and existing infrastructure - no neural network training required.

The dual-brain architecture (`lib/runtime/dual-brain-controller.ts`) now realizes this approach with a two-tier cognitive system: a fast instinct layer for reactive decisions and a planner layer (RSA engine) for deep deliberative reasoning.

## The Key Insight

JEPA's power comes from **predicting in abstract space**, not from being a neural network. The LLM already:

1. **Thinks in concepts** (natural "latent space")
2. **Can imagine outcomes** (natural "predictor")
3. **Can compare futures** (natural "trajectory evaluation")

We use the LLM as a "world simulator" that predicts what will happen before acting.

**Realized in code:** The `PredictiveWorldModel` (`lib/runtime/predictive-world-model.ts`) implements spatial prediction using deterministic heuristics (wall continuation, corridor detection, open space expansion, boundary walls) that run every cycle without inference cost. The `DualBrainController` routes decisions between the fast instinct layer and the RSA-powered planner, matching the JEPA concept of "predicting in abstract space before acting."

---

## JEPA to LLM Mapping (Now Implemented)

| JEPA Concept | Neural JEPA | LLM Implementation | Realized In |
|--------------|-------------|-------------------|-------------|
| **Encoder** | CNN/ViT to vector | Sensors to abstract state description | VLM (Qwen3-VL-8B) encodes camera frames into VisionFrame structures |
| **Latent Space** | 128-dim float vector | Structured JSON state | 50x50 occupancy grid in `WorldModel` + predictive fill from `PredictiveWorldModel` |
| **Predictor** | GRU neural network | LLM imagining "what if I do X?" | `PredictiveWorldModel` spatial heuristics (wall continuation, corridor detection, open space expansion) |
| **Rollout** | Forward passes | LLM planning action sequences | RSA engine (`lib/runtime/rsa-engine.ts`) generates N candidate plans, aggregates over T steps |
| **MPPI Scoring** | Distance in embedding space | LLM evaluating outcomes vs goal | A* planning on the occupancy grid with candidate generation and scoring |

---

## The Mental Simulation Approach

### Traditional Robot Control (Reactive)

```
Observe -> Decide -> Act -> Repeat
         (single step)
```

### JEPA-LLM Control (Predictive) -- Now Implemented

```
Observe -> Encode -> Simulate All Actions -> Plan Trajectory -> Execute -> Verify
                     |
             "If I turn left, I predict..."
             "If I go forward, I predict..."
             "If I backup, I predict..."
                     |
             Compare predicted outcomes
                     |
             Choose best trajectory
```

**Realized in the NavigationLoop:** The navigation cycle runs at ~10Hz, with camera frames processed by Qwen3-VL-8B. The `DualBrainController.decide()` method implements this exact flow:
1. Reactive instinct checks (rule-based, <5ms)
2. Escalation checks (stuck detection, vision confidence, periodic replan)
3. RSA planner for deep reasoning when escalated
4. LLM instinct for routine decisions

---

## Abstract State (LLM's "Latent Space")

Instead of raw sensor values, we encode to semantic descriptions:

### Raw Sensors:
```
front: 45cm
left: 120cm
right: 30cm
```

### Abstract State:
```json
{
  "front_status": "CLOSE",
  "left_status": "OPEN",
  "right_status": "BLOCKED",
  "position_description": "approaching wall, open space on left",
  "stuck_risk": "low",
  "goal_direction": "left"
}
```

This is analogous to JEPA's learned embedding - but using language instead of vectors.

**Realized:** The `WorldModel` maintains a 50x50 occupancy grid (10cm resolution) that serves as the structured "latent space." The `PredictiveWorldModel` fills unknown cells with predicted states (wall, free) at low confidence, creating a complete spatial representation before the robot has fully explored the environment.

---

## Mental Simulation (LLM as Predictor)

Before acting, the LLM predicts outcomes for each possible action:

```json
{
  "mental_simulation": {
    "forward_prediction": {
      "outcome": "Will hit wall in ~0.5 seconds",
      "risk_percent": 85,
      "goal_progress": "negative"
    },
    "left_prediction": {
      "outcome": "Will turn to face open corridor",
      "risk_percent": 10,
      "goal_progress": "positive"
    },
    "right_prediction": {
      "outcome": "Will face closer to wall",
      "risk_percent": 40,
      "goal_progress": "negative"
    },
    "backup_prediction": {
      "outcome": "Will gain clearance from wall",
      "risk_percent": 5,
      "goal_progress": "neutral"
    }
  }
}
```

**Realized:** The `reactiveInstinct()` function in `dual-brain-controller.ts` implements fast rule-based prediction (emergency collision avoidance, wall following, clear path detection). The RSA engine implements deeper simulation by generating N candidate plans in parallel, aggregating the best reasoning across K candidates over T recursive steps.

---

## Trajectory Planning (Multi-Step Rollout)

The LLM doesn't just plan one action - it plans sequences:

```json
{
  "trajectory_plan": {
    "chosen_sequence": ["turn_left", "move_forward", "move_forward"],
    "reasoning": "Left turn opens corridor, then two forwards make progress",
    "expected_end_state": "In middle of corridor, facing toward goal"
  }
}
```

This is equivalent to JEPA's latent trajectory rollout, but in natural language.

**Realized:** The RSA engine's `planRobotAction()` method produces multi-step action plans. The `DualBrainController` stores remaining plan steps in `currentPlan` and executes them sequentially across sensing cycles, with the instinct layer continuing to monitor for safety overrides.

---

## Prediction Verification (Learning from Errors)

After executing, we compare prediction vs reality:

```
Prediction: "After turning left, front will be OPEN"
Reality:    "Front is MEDIUM (60cm)"
Accuracy:   80%
```

This feedback helps the LLM calibrate its predictions over time (via conversation history).

**Realized:** The `PredictiveWorldModel.verify()` method compares predictions against actual observations. Correct predictions boost the model's accuracy metric; incorrect predictions trigger re-evaluation. The `PredictionResult` interface tracks `verifiedCount`, `wrongCount`, and overall `accuracy`.

---

## Implementation Files

| File | Purpose | Status |
|------|---------|--------|
| `lib/runtime/dual-brain-controller.ts` | Two-tier cognitive architecture (instinct + planner) | **Implemented** |
| `lib/runtime/rsa-engine.ts` | Recursive Self-Aggregation for deep planning (the "rollout" equivalent) | **Implemented** |
| `lib/runtime/predictive-world-model.ts` | Spatial prediction without neural training (the "predictor" equivalent) | **Implemented** |
| `lib/runtime/world-model.ts` | 50x50 occupancy grid (the "latent space" equivalent) | **Implemented** |
| `lib/runtime/navigation-loop.ts` | Full sense-think-act cycle with A* planning | **Implemented** |
| `lib/llm/openrouter-inference-adapter.ts` | Cloud model serving via OpenRouter (Qwen3-VL-8B) | **Implemented** |

---

## Usage Example

```typescript
import { DualBrainController } from './lib/runtime/dual-brain-controller';
import { createRSAEngine } from './lib/runtime/rsa-engine';
import { createPredictiveModel } from './lib/runtime/predictive-world-model';

// Create the dual-brain controller
const controller = new DualBrainController(
  { rsaPreset: 'quick', emergencyDistanceCm: 15 },
  createRSAEngine(provider, 'quick'),
  provider  // Qwen3-VL-8B via OpenRouter
);

// Create predictive world model
const predictiveModel = createPredictiveModel();

// In the navigation loop:
// 1. Run predictive model to fill unknown cells
predictiveModel.predict(worldModel);

// 2. Get decision from dual-brain controller
const decision = await controller.decide({
  sensorData: { front: 45, left: 120, right: 30, back: 200 },
  pose: { x: 1.2, y: 0.8, rotation: 1.57 },
  goal: 'Explore the room and find the door',
});

// 3. Verify predictions against new observations
predictiveModel.verify(worldModel);

// 4. Check metrics
const metrics = controller.getMetrics();
console.log(`Instinct: ${metrics.instinctDecisions}, Planner: ${metrics.plannerDecisions}`);
```

---

## The JEPA-Inspired Prompt

The key is teaching the LLM to **think before acting**:

```
Before executing any action, you must:
1. ENCODE - Understand current state abstractly
2. PREDICT - Imagine what happens for each possible action
3. EVALUATE - Score each predicted future against your goal
4. SELECT - Choose the action leading to best predicted outcome

Think like this:
"If I move FORWARD: I predict collision risk 80%, goal progress negative"
"If I turn LEFT: I predict risk 10%, goal progress positive"
"If I turn RIGHT: I predict risk 40%, goal progress neutral"
-> Best choice: LEFT (lowest risk, best progress)
```

**Realized:** This prompt structure is embedded in the `DualBrainController.runLLMInstinct()` method. The instinct provider receives sensor data, world model context, and must reply with a structured JSON containing action, confidence, and reasoning.

---

## Benefits vs Traditional LLM Control

| Aspect | Traditional | JEPA-Style | Current Status |
|--------|-------------|------------|----------------|
| Planning depth | 1 step | 3+ steps | Implemented via RSA (N=4-16 candidates, T=2-6 steps) |
| Risk assessment | Implicit | Explicit prediction | Implemented in `reactiveInstinct()` and `PredictiveWorldModel` |
| Stuck detection | After the fact | Predicted in advance | Implemented in `DualBrainController.checkEscalation()` |
| Learning | None | Prediction verification | Implemented in `PredictiveWorldModel.verify()` |
| Explainability | "I chose left" | "I predict left leads to X because Y" | Implemented via `BrainDecision.reasoning` and RSA history |

---

## Benefits vs Neural JEPA

| Aspect | Neural JEPA | LLM JEPA |
|--------|-------------|----------|
| Training | Required (hours/days) | None |
| New environments | Needs retraining | Zero-shot |
| Explainability | Opaque embeddings | Natural language |
| Flexibility | Fixed action space | Any describable action |
| Cost | GPU compute | API calls |

---

## When to Use Each Approach

### Use LLM-JEPA when (current approach):
- Need zero-shot generalization
- Want explainable decisions
- Have diverse/changing environments
- Development/prototyping phase

### Use Neural JEPA when (future):
- Need <50ms decisions
- Have consistent environment
- Can collect training data
- Production deployment at scale

### Use Hybrid when (planned):
- Neural JEPA for fast reactions
- LLM-JEPA for high-level planning
- Best of both worlds

---

## Summary

JEPA's core innovation is **predicting in abstract space before acting**. This concept doesn't require neural networks - the LLM naturally:

1. **Encodes** observations to semantic concepts -- realized via VLM (Qwen3-VL-8B) and occupancy grid
2. **Predicts** outcomes using world knowledge -- realized via `PredictiveWorldModel` spatial heuristics
3. **Plans** by comparing predicted futures -- realized via RSA engine with N candidates and T aggregation steps
4. **Learns** by tracking prediction accuracy -- realized via `PredictiveWorldModel.verify()`

The result: smarter robot control that thinks ahead, not just reacts. The dual-brain controller (`lib/runtime/dual-brain-controller.ts`) orchestrates this entire flow, routing between fast instinct (<5ms reactive rules) and deep planning (RSA with 3-22 second deliberation).
