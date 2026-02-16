# JEPA Implementation Guide for LLMOS

> **Implementation Status (February 2026):** The LLMos project has implemented the core JEPA concepts using a different approach than originally proposed in this guide. Instead of ONNX.js or Python-based neural inference, the project implements:
>
> - **Predictive World Model** (`lib/runtime/predictive-world-model.ts`) -- spatial prediction without neural training, using deterministic heuristics (wall continuation, corridor detection, open space expansion, boundary walls)
> - **RSA Engine** (`lib/runtime/rsa-engine.ts`) -- Recursive Self-Aggregation for deeper reasoning, serving as the "rollout/planning" component that MPPI would serve in neural JEPA
> - **Dual-Brain Controller** (`lib/runtime/dual-brain-controller.ts`) -- two-tier cognitive architecture routing between fast instinct and deep planner
> - **VLM Integration** -- Qwen3-VL-8B via OpenRouter for real-time multimodal perception
>
> The neural JEPA options (ONNX.js browser inference, Python backend, Jetson/Pi deployment) described below remain valid future paths for adding learned dynamics models alongside the current heuristic approach.

## Overview

This guide provides practical implementation options for adding a JEPA-style world model to LLMOS. We cover multiple approaches ranging from lightweight browser-based inference to Python backend services, suitable for different hardware capabilities.

---

## Current Implementation (Heuristic JEPA)

Before considering the neural options below, note what is already working:

### Predictive World Model -- COMPLETED

The `PredictiveWorldModel` class (`lib/runtime/predictive-world-model.ts`) implements spatial prediction without any neural training:

```typescript
import { createPredictiveModel } from './lib/runtime/predictive-world-model';

const predictiveModel = createPredictiveModel({
  wallContinuationConfidence: 0.3,
  corridorConfidence: 0.25,
  openSpaceConfidence: 0.2,
  maxWallExtrapolation: 5,
  minCorridorLength: 3,
  verifyOnObservation: true,
});

// Run prediction pass (fast, deterministic, no inference cost)
const newPredictions = predictiveModel.predict(worldModel);

// After new observations, verify predictions
const { verified, wrong } = predictiveModel.verify(worldModel);

// Check accuracy
const result = predictiveModel.getResult();
console.log(`Accuracy: ${(result.accuracy * 100).toFixed(0)}%`);
```

**Four spatial heuristics implemented:**

| Heuristic | Confidence | Description |
|-----------|------------|-------------|
| Wall continuation | 0.3 | If two adjacent cells are walls, predict the wall extends into unknown territory |
| Corridor detection | 0.25 | If parallel walls with free space between, predict corridor continues |
| Open space expansion | 0.2 | If large free area borders unknown, predict unknown as free |
| Boundary walls | 0.3 | If edges have walls, predict remaining edge unknowns as walls |

### RSA Engine -- COMPLETED

The `RSAEngine` class (`lib/runtime/rsa-engine.ts`) implements Recursive Self-Aggregation for deep planning:

```typescript
import { createRSAEngine } from './lib/runtime/rsa-engine';

const rsa = createRSAEngine(provider, 'quick'); // 'quick' | 'standard' | 'deep'

// Robot planning with optional image context
const result = await rsa.planRobotAction(
  situation,        // Current state description
  worldModelSummary, // Grid summary
  visionContext,     // VisionFrame JSON (optional)
  imageBase64,       // Camera frame for multimodal RSA (optional)
  mapImageBase64,    // Top-down map for allocentric reasoning (optional)
);
```

**RSA presets:**

| Preset | N (population) | K (aggregation) | T (steps) | Latency |
|--------|---------------|-----------------|-----------|---------|
| quick | 4 | 2 | 2 | ~2.5s |
| standard | 8 | 3 | 4 | ~8s |
| deep | 16 | 4 | 6 | ~22s |
| swarm | fleet size | fleet size | 3 | varies |

### Dual-Brain Controller -- COMPLETED

The `DualBrainController` class (`lib/runtime/dual-brain-controller.ts`) routes decisions:

```typescript
import { DualBrainController } from './lib/runtime/dual-brain-controller';

const controller = new DualBrainController(
  { emergencyDistanceCm: 15, rsaPreset: 'quick' },
  rsaEngine,
  instinctProvider
);

// Called every sensing cycle (~10Hz)
const decision = await controller.decide({
  sensorData: { front: 45, left: 120, right: 30, back: 200 },
  pose: { x: 1.2, y: 0.8, rotation: 1.57 },
  goal: 'Explore the room',
  visionFrame: vlmResult,
  mapImage: topDownMapBase64,
});

// decision.brain = 'instinct' | 'planner' | 'hybrid'
// decision.actions = ['move_forward'] etc.
// decision.confidence = 0.85
// decision.latencyMs = 3 (instinct) or 5000 (planner)
```

---

## Hardware Requirements Comparison

| Setup | Min RAM | GPU | Inference Latency | Model Size |
|-------|---------|-----|-------------------|------------|
| **Current (heuristic)** | 2GB | None | <1ms | 0 (no model) |
| **Browser (ONNX.js)** | 4GB | None (CPU) | 50-200ms | 5-20MB |
| **Browser (WebGPU)** | 8GB | WebGPU capable | 10-50ms | 5-50MB |
| **Python (CPU)** | 4GB | None | 30-100ms | 5-50MB |
| **Python (CUDA)** | 8GB | GTX 1060+ | 5-20ms | 10-100MB |
| **Jetson Nano** | 4GB | 128 CUDA cores | 20-50ms | 10-30MB |
| **Raspberry Pi 5** | 4GB | None | 100-300ms | 5-15MB |

---

## Option 1: Lightweight ONNX.js in Browser/Electron (Future)

This is the easiest neural integration path - runs directly in your Electron app.

### Step 1: Install ONNX Runtime Web

```bash
npm install onnxruntime-web
```

### Step 2: Create the JEPA World Model Interface

Create `lib/jepa/jepa-world-model.ts`:

```typescript
/**
 * JEPA World Model - Browser-based inference using ONNX Runtime Web
 *
 * Lightweight implementation for action-conditioned future prediction.
 * This would complement the existing PredictiveWorldModel (heuristic)
 * by adding learned dynamics.
 */

import * as ort from 'onnxruntime-web';

// Configure ONNX Runtime for optimal performance
ort.env.wasm.numThreads = 4;
ort.env.wasm.simd = true;

export interface JEPAConfig {
  encoderPath: string;      // Path to encoder.onnx
  predictorPath: string;    // Path to predictor.onnx
  embeddingDim: number;     // Latent space dimension (e.g., 128, 256)
  actionDim: number;        // Action space dimension (e.g., 2 for differential drive)
}

export interface JEPAPrediction {
  embedding: Float32Array;  // Predicted future state embedding
  confidence: number;       // Prediction confidence (0-1)
}

export class JEPAWorldModel {
  private encoder: ort.InferenceSession | null = null;
  private predictor: ort.InferenceSession | null = null;
  private config: JEPAConfig;
  private initialized = false;

  constructor(config: JEPAConfig) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Load encoder model
    this.encoder = await ort.InferenceSession.create(
      this.config.encoderPath,
      {
        executionProviders: ['wasm'],  // Use 'webgpu' if available
        graphOptimizationLevel: 'all',
      }
    );

    // Load predictor model
    this.predictor = await ort.InferenceSession.create(
      this.config.predictorPath,
      {
        executionProviders: ['wasm'],
        graphOptimizationLevel: 'all',
      }
    );

    this.initialized = true;
    console.log('[JEPA] World model initialized');
  }

  /**
   * Encode an observation (sensor data + camera) to latent space
   */
  async encode(observation: {
    camera?: ImageData;           // Optional camera frame
    distances: number[];          // 8 distance sensors
    pose: { x: number; y: number; rotation: number };
  }): Promise<Float32Array> {
    if (!this.encoder) throw new Error('JEPA not initialized');

    // Normalize sensor inputs to [0, 1]
    const normalizedDistances = observation.distances.map(d =>
      Math.min(d / 200, 1.0)  // Assume max 200cm
    );

    // Create input tensor
    // Shape: [1, channels] where channels = 8 distances + 3 pose = 11
    const inputData = new Float32Array([
      ...normalizedDistances,
      observation.pose.x / 5.0,      // Normalize assuming 5m max
      observation.pose.y / 5.0,
      observation.pose.rotation / 360,
    ]);

    const inputTensor = new ort.Tensor('float32', inputData, [1, 11]);

    // Run encoder
    const results = await this.encoder.run({ input: inputTensor });
    const embedding = results.embedding.data as Float32Array;

    return embedding;
  }

  /**
   * Predict future state given current embedding and action
   */
  async predict(
    currentEmbedding: Float32Array,
    action: { leftWheel: number; rightWheel: number }  // -1 to 1
  ): Promise<JEPAPrediction> {
    if (!this.predictor) throw new Error('JEPA not initialized');

    // Normalize action to [-1, 1]
    const normalizedAction = new Float32Array([
      action.leftWheel / 100,   // Assuming max speed 100
      action.rightWheel / 100,
    ]);

    // Concatenate embedding + action
    const inputData = new Float32Array([
      ...currentEmbedding,
      ...normalizedAction,
    ]);

    const inputTensor = new ort.Tensor(
      'float32',
      inputData,
      [1, this.config.embeddingDim + this.config.actionDim]
    );

    // Run predictor
    const results = await this.predictor.run({ input: inputTensor });
    const predictedEmbedding = results.embedding.data as Float32Array;
    const confidence = results.confidence?.data[0] ?? 0.8;

    return {
      embedding: predictedEmbedding,
      confidence: confidence as number,
    };
  }

  /**
   * Multi-step rollout: predict trajectory of future states
   */
  async rollout(
    currentEmbedding: Float32Array,
    actionSequence: Array<{ leftWheel: number; rightWheel: number }>,
  ): Promise<JEPAPrediction[]> {
    const predictions: JEPAPrediction[] = [];
    let embedding = currentEmbedding;

    for (const action of actionSequence) {
      const prediction = await this.predict(embedding, action);
      predictions.push(prediction);
      embedding = prediction.embedding;
    }

    return predictions;
  }

  /**
   * Compute distance between two embeddings (for goal checking)
   */
  embeddingDistance(a: Float32Array, b: Float32Array): number {
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      const diff = a[i] - b[i];
      sum += diff * diff;
    }
    return Math.sqrt(sum);
  }

  /**
   * Score a trajectory by distance to goal embedding
   */
  scoreTrajectory(
    predictions: JEPAPrediction[],
    goalEmbedding: Float32Array,
  ): number {
    if (predictions.length === 0) return Infinity;

    // Final state distance to goal
    const finalDist = this.embeddingDistance(
      predictions[predictions.length - 1].embedding,
      goalEmbedding
    );

    // Average confidence along trajectory
    const avgConfidence = predictions.reduce(
      (sum, p) => sum + p.confidence, 0
    ) / predictions.length;

    // Lower is better: distance weighted by inverse confidence
    return finalDist / avgConfidence;
  }
}
```

### Step 3: Create Trajectory Optimizer

Create `lib/jepa/trajectory-optimizer.ts`:

```typescript
/**
 * MPPI-style trajectory optimizer using JEPA world model
 *
 * This would complement the existing RSA-based planning by providing
 * fast (~50ms) trajectory optimization between RSA replanning events.
 */

import { JEPAWorldModel, JEPAPrediction } from './jepa-world-model';

export interface TrajectoryConfig {
  horizon: number;           // Planning horizon (steps)
  numSamples: number;        // Number of trajectory samples
  numIterations: number;     // Optimization iterations
  temperature: number;       // MPPI temperature
  actionNoise: number;       // Exploration noise std
}

export interface OptimizedTrajectory {
  actions: Array<{ leftWheel: number; rightWheel: number }>;
  cost: number;
  confidence: number;
}

export class TrajectoryOptimizer {
  private worldModel: JEPAWorldModel;
  private config: TrajectoryConfig;

  constructor(worldModel: JEPAWorldModel, config?: Partial<TrajectoryConfig>) {
    this.worldModel = worldModel;
    this.config = {
      horizon: 10,         // 10 steps = ~2 seconds at 5Hz
      numSamples: 32,      // 32 parallel trajectories
      numIterations: 3,    // 3 refinement iterations
      temperature: 0.1,    // Soft-max temperature
      actionNoise: 0.3,    // Initial action noise
      ...config,
    };
  }

  /**
   * Optimize trajectory from current state to goal
   */
  async optimize(
    currentEmbedding: Float32Array,
    goalEmbedding: Float32Array,
  ): Promise<OptimizedTrajectory> {
    const { horizon, numSamples, numIterations, temperature, actionNoise } = this.config;

    // Initialize action sequence (zero = no movement)
    let actionMean = new Array(horizon).fill(null).map(() => ({
      leftWheel: 0,
      rightWheel: 0,
    }));

    let actionStd = actionNoise;

    for (let iter = 0; iter < numIterations; iter++) {
      // Sample trajectories around current mean
      const trajectories: Array<{
        actions: typeof actionMean;
        cost: number;
        predictions: JEPAPrediction[];
      }> = [];

      for (let s = 0; s < numSamples; s++) {
        // Sample actions with Gaussian noise
        const actions = actionMean.map(mean => ({
          leftWheel: this.clamp(mean.leftWheel + this.randn() * actionStd, -80, 80),
          rightWheel: this.clamp(mean.rightWheel + this.randn() * actionStd, -80, 80),
        }));

        // Rollout in latent space
        const predictions = await this.worldModel.rollout(currentEmbedding, actions);
        const cost = this.worldModel.scoreTrajectory(predictions, goalEmbedding);

        trajectories.push({ actions, cost, predictions });
      }

      // Sort by cost (lower is better)
      trajectories.sort((a, b) => a.cost - b.cost);

      // Compute weights using softmax with temperature
      const costs = trajectories.map(t => t.cost);
      const minCost = Math.min(...costs);
      const weights = costs.map(c => Math.exp(-(c - minCost) / temperature));
      const weightSum = weights.reduce((a, b) => a + b, 0);
      const normalizedWeights = weights.map(w => w / weightSum);

      // Update mean using weighted average
      actionMean = new Array(horizon).fill(null).map((_, t) => {
        let leftSum = 0, rightSum = 0;
        for (let s = 0; s < numSamples; s++) {
          leftSum += normalizedWeights[s] * trajectories[s].actions[t].leftWheel;
          rightSum += normalizedWeights[s] * trajectories[s].actions[t].rightWheel;
        }
        return { leftWheel: leftSum, rightWheel: rightSum };
      });

      // Reduce noise for next iteration
      actionStd *= 0.7;
    }

    // Final rollout with optimized actions
    const finalPredictions = await this.worldModel.rollout(currentEmbedding, actionMean);
    const finalCost = this.worldModel.scoreTrajectory(finalPredictions, goalEmbedding);
    const avgConfidence = finalPredictions.reduce((sum, p) => sum + p.confidence, 0) / horizon;

    return {
      actions: actionMean,
      cost: finalCost,
      confidence: avgConfidence,
    };
  }

  private randn(): number {
    // Box-Muller transform for Gaussian random
    const u1 = Math.random();
    const u2 = Math.random();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  private clamp(x: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, x));
  }
}
```

### Step 4: Integrate with Dual-Brain Controller

The neural JEPA world model would slot into the existing dual-brain architecture as an additional layer:

```typescript
// In the navigation loop, add JEPA between instinct and planner:

// 1. Reactive instinct handles emergency (<5ms)
const reactive = reactiveInstinct(sensorData, visionFrame, config);
if (reactive && reactive.confidence > 0.85) {
  return reactive; // Fast path
}

// 2. Neural JEPA trajectory optimization (~50ms) -- NEW
if (jepaModel && jepaOptimizer) {
  const currentZ = await jepaModel.encode({ distances, pose });
  const trajectory = await jepaOptimizer.optimize(currentZ, goalZ);
  if (trajectory.confidence > 0.7) {
    return trajectory.actions[0]; // Neural fast path
  }
}

// 3. RSA planner for complex reasoning (~3-22s) -- EXISTING
if (escalationNeeded) {
  return rsaEngine.planRobotAction(situation, worldModel, vision);
}
```

---

## Option 2: Python Backend Service (Future -- More Powerful)

For better performance and access to full PyTorch ecosystem.

### Architecture

```
+---------------------+      HTTP/WebSocket     +----------------------+
|   Electron App      |<------------------------>|  Python JEPA Server  |
|   (TypeScript)      |                          |  (FastAPI + PyTorch) |
+---------------------+                          +----------------------+
```

### Step 1: Create Python JEPA Server

Create `python/jepa_server.py`:

```python
"""
JEPA World Model Server for LLMOS
Runs as a local service, communicates via HTTP/WebSocket
"""

import asyncio
import torch
import torch.nn as nn
import numpy as np
from fastapi import FastAPI, WebSocket
from pydantic import BaseModel
from typing import List, Optional
import uvicorn

# ============================================================
# Model Definitions (Small, edge-friendly)
# ============================================================

class SensorEncoder(nn.Module):
    """
    Lightweight encoder for sensor data
    Input: 11 values (8 distances + 3 pose)
    Output: embedding_dim
    """
    def __init__(self, input_dim=11, hidden_dim=64, embedding_dim=128):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(input_dim, hidden_dim),
            nn.LayerNorm(hidden_dim),
            nn.GELU(),
            nn.Linear(hidden_dim, hidden_dim),
            nn.LayerNorm(hidden_dim),
            nn.GELU(),
            nn.Linear(hidden_dim, embedding_dim),
        )

    def forward(self, x):
        return self.net(x)


class ActionConditionedPredictor(nn.Module):
    """
    GRU-based predictor for future state embeddings
    Input: current_embedding + action
    Output: next_embedding
    """
    def __init__(self, embedding_dim=128, action_dim=2, hidden_dim=128):
        super().__init__()
        self.gru = nn.GRU(
            input_size=embedding_dim + action_dim,
            hidden_size=hidden_dim,
            num_layers=2,
            batch_first=True,
        )
        self.output_proj = nn.Linear(hidden_dim, embedding_dim)
        self.confidence_head = nn.Sequential(
            nn.Linear(hidden_dim, 32),
            nn.ReLU(),
            nn.Linear(32, 1),
            nn.Sigmoid(),
        )

    def forward(self, embedding, action, hidden=None):
        x = torch.cat([embedding, action], dim=-1).unsqueeze(1)
        out, hidden = self.gru(x, hidden)
        out = out.squeeze(1)
        next_embedding = self.output_proj(out)
        confidence = self.confidence_head(out)
        return next_embedding, confidence, hidden


class JEPAWorldModel(nn.Module):
    """Complete JEPA world model"""
    def __init__(self, embedding_dim=128, action_dim=2):
        super().__init__()
        self.encoder = SensorEncoder(embedding_dim=embedding_dim)
        self.predictor = ActionConditionedPredictor(
            embedding_dim=embedding_dim,
            action_dim=action_dim,
        )
        self.embedding_dim = embedding_dim

    def encode(self, observation):
        return self.encoder(observation)

    def predict(self, embedding, action, hidden=None):
        return self.predictor(embedding, action, hidden)

    def rollout(self, embedding, actions):
        """Multi-step prediction"""
        predictions = []
        hidden = None
        z = embedding

        for action in actions:
            z, conf, hidden = self.predict(z, action, hidden)
            predictions.append({'embedding': z, 'confidence': conf})

        return predictions


# ============================================================
# FastAPI Server
# ============================================================

app = FastAPI(title="JEPA World Model Server")

# Global model instance
model: Optional[JEPAWorldModel] = None
device = 'cuda' if torch.cuda.is_available() else 'cpu'


@app.on_event("startup")
async def startup():
    global model

    model = JEPAWorldModel(embedding_dim=128, action_dim=2).to(device)
    model.eval()

    try:
        model.load_state_dict(torch.load('models/jepa_world_model.pt', map_location=device))
        print(f"[JEPA] Loaded pretrained model on {device}")
    except FileNotFoundError:
        print(f"[JEPA] No pretrained model found, using random initialization")

    print(f"[JEPA] Server ready on {device}")


@app.get("/health")
async def health():
    return {"status": "ok", "device": device}


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8765)
```

---

## Option 3: Raspberry Pi / Jetson Deployment (Future)

For running on dedicated edge hardware.

### Raspberry Pi 5 Setup

```bash
# Install PyTorch for ARM
pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu

# Install ONNX Runtime (optimized for ARM)
pip install onnxruntime

# Export model to ONNX for faster inference
python export_to_onnx.py
```

### Jetson Nano Setup (GPU Accelerated)

```bash
# Use NVIDIA's PyTorch container
docker pull nvcr.io/nvidia/l4t-pytorch:r35.2.1-pth2.0-py3

# Or install via pip (JetPack 5.x)
pip install torch torchvision

# Enable TensorRT optimization
pip install torch-tensorrt
```

---

## Training Your Own JEPA Model (Future)

Training a neural JEPA model would complement the existing heuristic `PredictiveWorldModel` by learning dynamics patterns that the spatial heuristics cannot capture (e.g., how objects move, how sensor noise correlates with distance).

### Step 1: Collect Training Data

The existing black-box recorder (`lib/evolution/black-box-recorder.ts`) can be extended to save (observation, action, next_observation) tuples during simulation runs. Target: 100k+ transitions.

### Step 2: Train the Model

Use the EB-JEPA training recipe with:
- **Prediction loss**: MSE between predicted and target embeddings
- **Variance loss**: Prevent representation collapse
- **Covariance loss**: Encourage feature independence

### Step 3: Deploy

Export to ONNX or TensorFlow.js format. Integrate as an additional prediction layer in the dual-brain controller, running between the reactive instinct and the RSA planner.

---

## Model Size Comparison

| Model | Parameters | ONNX Size | Inference (CPU) | Inference (GPU) |
|-------|------------|-----------|-----------------|-----------------|
| **Heuristic (current)** | 0 | 0 | <1ms | N/A |
| **Tiny JEPA** (64 dim) | ~50K | ~200KB | 5ms | 1ms |
| **Small JEPA** (128 dim) | ~200K | ~800KB | 10ms | 2ms |
| **Medium JEPA** (256 dim) | ~800K | ~3MB | 25ms | 5ms |
| **I-JEPA ViT-S** | ~22M | ~90MB | 200ms | 20ms |
| **V-JEPA 2** | ~300M | ~1.2GB | N/A | 100ms |

**Recommendation**: The current heuristic `PredictiveWorldModel` provides zero-cost spatial prediction. When adding neural capabilities, start with **Small JEPA (128 dim)** for the best balance of quality and speed on typical laptops.

---

## Summary

| Approach | Status | Best For | Complexity | Performance |
|----------|--------|----------|------------|-------------|
| **Heuristic PredictiveWorldModel** | **Implemented** | Zero-cost spatial prediction | Low | <1ms |
| **RSA Engine (LLM-based planning)** | **Implemented** | Deep reasoning, goal decomposition | Low | 2.5-22s |
| **Dual-Brain Controller** | **Implemented** | Routing fast/slow decisions | Low | <5ms routing |
| **ONNX.js (Browser)** | Planned | Quick neural integration, no backend | Medium | 50-200ms |
| **Python Server** | Planned | Full control, GPU support | High | 5-100ms |
| **Jetson Nano** | Planned | Dedicated edge hardware | High | 20-50ms |
| **Raspberry Pi** | Planned | Low cost, embedded | Medium | 100-300ms |

**Current Architecture Path**:
1. Heuristic spatial prediction + RSA planning -- **DONE**
2. Add neural JEPA for fast trajectory optimization -- **PLANNED**
3. Graduate to Python server for production -- **PLANNED**
4. Deploy to Jetson Nano for dedicated robot computer -- **PLANNED**

---

## References

- [EB-JEPA Repository](https://github.com/facebookresearch/eb_jepa)
- [SimpleDreamer](https://github.com/kc-ml2/SimpleDreamer) - Simplified world model implementation
- [ONNX Runtime Web](https://onnxruntime.ai/docs/tutorials/web/) - Browser ML inference
- [Jetson Inference](https://github.com/dusty-nv/jetson-inference) - NVIDIA edge deployment
- [DayDreamer](https://danijar.com/project/daydreamer/) - World models for physical robots
- RSA Paper: https://arxiv.org/html/2509.26626v1 - Recursive Self-Aggregation for deep reasoning

---

*Implementation Guide v2.0 - LLMOS JEPA Integration*
*Updated: 2026-02-16 -- Reflects current heuristic implementation and marks neural options as future work*
