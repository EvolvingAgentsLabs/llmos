# JEPA Implementation Guide for LLMOS

## Overview

This guide provides practical implementation options for adding a JEPA-style world model to LLMOS. We cover multiple approaches ranging from lightweight browser-based inference to Python backend services, suitable for different hardware capabilities.

---

## Hardware Requirements Comparison

| Setup | Min RAM | GPU | Inference Latency | Model Size |
|-------|---------|-----|-------------------|------------|
| **Browser (ONNX.js)** | 4GB | None (CPU) | 50-200ms | 5-20MB |
| **Browser (WebGPU)** | 8GB | WebGPU capable | 10-50ms | 5-50MB |
| **Python (CPU)** | 4GB | None | 30-100ms | 5-50MB |
| **Python (CUDA)** | 8GB | GTX 1060+ | 5-20ms | 10-100MB |
| **Jetson Nano** | 4GB | 128 CUDA cores | 20-50ms | 10-30MB |
| **Raspberry Pi 5** | 4GB | None | 100-300ms | 5-15MB |

---

## Option 1: Lightweight ONNX.js in Browser/Electron (Recommended for Start)

This is the easiest integration path - runs directly in your Electron app.

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
 * Lightweight implementation for action-conditioned future prediction
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

### Step 4: Integrate with Robot Runtime

Modify `lib/runtime/esp32-agent-runtime.ts` to use JEPA:

```typescript
// Add to imports
import { JEPAWorldModel } from '../jepa/jepa-world-model';
import { TrajectoryOptimizer } from '../jepa/trajectory-optimizer';

// Add to ESP32AgentState
interface ESP32AgentStateWithJEPA extends ESP32AgentState {
  jepa?: {
    worldModel: JEPAWorldModel;
    optimizer: TrajectoryOptimizer;
    currentEmbedding: Float32Array | null;
    goalEmbedding: Float32Array | null;
  };
}

// Initialize JEPA in startAgent
async function initializeJEPA(): Promise<{
  worldModel: JEPAWorldModel;
  optimizer: TrajectoryOptimizer;
}> {
  const worldModel = new JEPAWorldModel({
    encoderPath: '/models/jepa-encoder.onnx',
    predictorPath: '/models/jepa-predictor.onnx',
    embeddingDim: 128,
    actionDim: 2,
  });

  await worldModel.initialize();

  const optimizer = new TrajectoryOptimizer(worldModel, {
    horizon: 10,
    numSamples: 32,
    numIterations: 3,
  });

  return { worldModel, optimizer };
}

// New function: Get JEPA-optimized action
async function getJEPAAction(
  state: ESP32AgentStateWithJEPA,
  sensors: SensorReadings,
  goal: string,
): Promise<{ leftWheel: number; rightWheel: number } | null> {
  if (!state.jepa) return null;

  const { worldModel, optimizer } = state.jepa;

  // Encode current observation
  const currentEmbedding = await worldModel.encode({
    distances: [
      sensors.distance.front,
      sensors.distance.frontLeft,
      sensors.distance.frontRight,
      sensors.distance.left,
      sensors.distance.right,
      sensors.distance.backLeft,
      sensors.distance.backRight,
      sensors.distance.back,
    ],
    pose: sensors.pose,
  });

  // Get or create goal embedding (could be from LLM or vision)
  const goalEmbedding = state.jepa.goalEmbedding;
  if (!goalEmbedding) return null;

  // Optimize trajectory
  const trajectory = await optimizer.optimize(currentEmbedding, goalEmbedding);

  // Check confidence threshold
  if (trajectory.confidence < 0.5) {
    console.log('[JEPA] Low confidence, falling back to LLM');
    return null;  // Fall back to LLM
  }

  // Return first action of optimized trajectory
  return trajectory.actions[0];
}
```

---

## Option 2: Python Backend Service (More Powerful)

For better performance and access to full PyTorch ecosystem.

### Architecture

```
┌─────────────────────┐      HTTP/WebSocket     ┌──────────────────────┐
│   Electron App      │◀────────────────────────▶│  Python JEPA Server  │
│   (TypeScript)      │                          │  (FastAPI + PyTorch) │
└─────────────────────┘                          └──────────────────────┘
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
# MPPI Trajectory Optimizer
# ============================================================

class MPPIOptimizer:
    def __init__(
        self,
        world_model: JEPAWorldModel,
        horizon: int = 10,
        num_samples: int = 64,
        num_iterations: int = 5,
        temperature: float = 0.1,
        device: str = 'cpu',
    ):
        self.world_model = world_model
        self.horizon = horizon
        self.num_samples = num_samples
        self.num_iterations = num_iterations
        self.temperature = temperature
        self.device = device

    @torch.no_grad()
    def optimize(
        self,
        current_embedding: torch.Tensor,
        goal_embedding: torch.Tensor,
    ) -> dict:
        """
        MPPI optimization for trajectory planning
        """
        # Initialize action distribution
        action_mean = torch.zeros(self.horizon, 2, device=self.device)
        action_std = torch.ones(self.horizon, 2, device=self.device) * 0.5

        for iteration in range(self.num_iterations):
            # Sample action trajectories [num_samples, horizon, 2]
            noise = torch.randn(
                self.num_samples, self.horizon, 2,
                device=self.device
            )
            actions = action_mean.unsqueeze(0) + action_std.unsqueeze(0) * noise
            actions = actions.clamp(-1, 1)  # Normalize to [-1, 1]

            # Evaluate trajectories in parallel
            costs = self._evaluate_trajectories(
                current_embedding, actions, goal_embedding
            )

            # Compute weights (softmax with temperature)
            weights = torch.softmax(-costs / self.temperature, dim=0)

            # Update action distribution
            action_mean = (weights.view(-1, 1, 1) * actions).sum(dim=0)

            # Reduce std for next iteration
            action_std = action_std * 0.8

        # Final evaluation
        final_actions = action_mean.unsqueeze(0)
        final_cost = self._evaluate_trajectories(
            current_embedding, final_actions, goal_embedding
        )[0]

        return {
            'actions': (action_mean * 80).tolist(),  # Scale to motor range
            'cost': final_cost.item(),
            'confidence': 1.0 / (1.0 + final_cost.item()),
        }

    def _evaluate_trajectories(
        self,
        current_embedding: torch.Tensor,
        actions: torch.Tensor,
        goal_embedding: torch.Tensor,
    ) -> torch.Tensor:
        """Evaluate multiple trajectories in parallel"""
        num_samples = actions.shape[0]

        # Expand current embedding for batch processing
        z = current_embedding.unsqueeze(0).expand(num_samples, -1)

        total_cost = torch.zeros(num_samples, device=self.device)
        hidden = None

        for t in range(self.horizon):
            action_t = actions[:, t, :]
            z, conf, hidden = self.world_model.predict(z, action_t, hidden)

            # Cost = distance to goal (weighted by time)
            dist = torch.norm(z - goal_embedding.unsqueeze(0), dim=-1)
            weight = (t + 1) / self.horizon  # Later states matter more
            total_cost += weight * dist

        return total_cost


# ============================================================
# FastAPI Server
# ============================================================

app = FastAPI(title="JEPA World Model Server")

# Global model instance
model: Optional[JEPAWorldModel] = None
optimizer: Optional[MPPIOptimizer] = None
device = 'cuda' if torch.cuda.is_available() else 'cpu'


class ObservationInput(BaseModel):
    distances: List[float]  # 8 distance values
    pose_x: float
    pose_y: float
    pose_rotation: float


class ActionInput(BaseModel):
    left_wheel: float
    right_wheel: float


class PlanRequest(BaseModel):
    current_observation: ObservationInput
    goal_observation: ObservationInput
    horizon: int = 10


@app.on_event("startup")
async def startup():
    global model, optimizer

    model = JEPAWorldModel(embedding_dim=128, action_dim=2).to(device)
    model.eval()

    # Load pretrained weights if available
    try:
        model.load_state_dict(torch.load('models/jepa_world_model.pt', map_location=device))
        print(f"[JEPA] Loaded pretrained model on {device}")
    except FileNotFoundError:
        print(f"[JEPA] No pretrained model found, using random initialization")

    optimizer = MPPIOptimizer(model, device=device)
    print(f"[JEPA] Server ready on {device}")


@app.post("/encode")
async def encode(observation: ObservationInput):
    """Encode observation to latent space"""
    obs_tensor = torch.tensor([
        *[d / 200.0 for d in observation.distances],  # Normalize distances
        observation.pose_x / 5.0,
        observation.pose_y / 5.0,
        observation.pose_rotation / 360.0,
    ], dtype=torch.float32, device=device).unsqueeze(0)

    with torch.no_grad():
        embedding = model.encode(obs_tensor)

    return {"embedding": embedding[0].tolist()}


@app.post("/predict")
async def predict(
    embedding: List[float],
    action: ActionInput,
):
    """Single-step prediction"""
    emb_tensor = torch.tensor(embedding, dtype=torch.float32, device=device).unsqueeze(0)
    act_tensor = torch.tensor(
        [action.left_wheel / 80, action.right_wheel / 80],
        dtype=torch.float32, device=device
    ).unsqueeze(0)

    with torch.no_grad():
        next_emb, conf, _ = model.predict(emb_tensor, act_tensor)

    return {
        "embedding": next_emb[0].tolist(),
        "confidence": conf[0].item(),
    }


@app.post("/plan")
async def plan(request: PlanRequest):
    """Plan trajectory from current to goal"""
    # Encode current observation
    current_obs = torch.tensor([
        *[d / 200.0 for d in request.current_observation.distances],
        request.current_observation.pose_x / 5.0,
        request.current_observation.pose_y / 5.0,
        request.current_observation.pose_rotation / 360.0,
    ], dtype=torch.float32, device=device).unsqueeze(0)

    # Encode goal observation
    goal_obs = torch.tensor([
        *[d / 200.0 for d in request.goal_observation.distances],
        request.goal_observation.pose_x / 5.0,
        request.goal_observation.pose_y / 5.0,
        request.goal_observation.pose_rotation / 360.0,
    ], dtype=torch.float32, device=device).unsqueeze(0)

    with torch.no_grad():
        current_emb = model.encode(current_obs)[0]
        goal_emb = model.encode(goal_obs)[0]

        result = optimizer.optimize(current_emb, goal_emb)

    return result


@app.get("/health")
async def health():
    return {"status": "ok", "device": device}


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8765)
```

### Step 2: TypeScript Client

Create `lib/jepa/jepa-client.ts`:

```typescript
/**
 * Client for Python JEPA Server
 */

export interface JEPAObservation {
  distances: number[];
  pose_x: number;
  pose_y: number;
  pose_rotation: number;
}

export interface JEPAPlanResult {
  actions: Array<[number, number]>;  // [left, right] pairs
  cost: number;
  confidence: number;
}

export class JEPAClient {
  private baseUrl: string;
  private timeout: number;

  constructor(baseUrl = 'http://127.0.0.1:8765', timeout = 5000) {
    this.baseUrl = baseUrl;
    this.timeout = timeout;
  }

  async isHealthy(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        signal: AbortSignal.timeout(1000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async encode(observation: JEPAObservation): Promise<number[]> {
    const response = await fetch(`${this.baseUrl}/encode`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(observation),
      signal: AbortSignal.timeout(this.timeout),
    });

    const data = await response.json();
    return data.embedding;
  }

  async plan(
    current: JEPAObservation,
    goal: JEPAObservation,
    horizon = 10,
  ): Promise<JEPAPlanResult> {
    const response = await fetch(`${this.baseUrl}/plan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        current_observation: current,
        goal_observation: goal,
        horizon,
      }),
      signal: AbortSignal.timeout(this.timeout),
    });

    return response.json();
  }
}
```

### Step 3: Run the Server

```bash
# Install dependencies
pip install torch fastapi uvicorn pydantic

# Run server
python python/jepa_server.py
```

---

## Option 3: Raspberry Pi / Jetson Deployment

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

### Export to ONNX

Create `python/export_to_onnx.py`:

```python
"""Export JEPA model to ONNX for edge deployment"""

import torch
import torch.onnx
from jepa_server import JEPAWorldModel

def export_models(model_path='models/jepa_world_model.pt', output_dir='models/'):
    # Load model
    model = JEPAWorldModel(embedding_dim=128, action_dim=2)
    try:
        model.load_state_dict(torch.load(model_path, map_location='cpu'))
    except FileNotFoundError:
        print("Using random initialization")
    model.eval()

    # Export encoder
    dummy_obs = torch.randn(1, 11)
    torch.onnx.export(
        model.encoder,
        dummy_obs,
        f"{output_dir}/jepa-encoder.onnx",
        input_names=['input'],
        output_names=['embedding'],
        dynamic_axes={'input': {0: 'batch'}, 'embedding': {0: 'batch'}},
        opset_version=14,
    )
    print(f"Exported encoder to {output_dir}/jepa-encoder.onnx")

    # Export predictor (tricky due to GRU state)
    # We export a single-step version
    class PredictorWrapper(torch.nn.Module):
        def __init__(self, predictor):
            super().__init__()
            self.predictor = predictor

        def forward(self, x):
            embedding = x[:, :128]
            action = x[:, 128:]
            next_emb, conf, _ = self.predictor(embedding, action)
            return next_emb, conf

    wrapper = PredictorWrapper(model.predictor)
    dummy_input = torch.randn(1, 130)  # 128 embedding + 2 action

    torch.onnx.export(
        wrapper,
        dummy_input,
        f"{output_dir}/jepa-predictor.onnx",
        input_names=['input'],
        output_names=['embedding', 'confidence'],
        dynamic_axes={'input': {0: 'batch'}, 'embedding': {0: 'batch'}},
        opset_version=14,
    )
    print(f"Exported predictor to {output_dir}/jepa-predictor.onnx")


if __name__ == "__main__":
    export_models()
```

---

## Training Your Own JEPA Model

### Step 1: Collect Training Data

Create `python/collect_data.py`:

```python
"""
Collect training data from robot simulation
Records: (observation, action, next_observation) tuples
"""

import json
import random
from dataclasses import dataclass, asdict
from typing import List

@dataclass
class Transition:
    observation: List[float]  # 11 values: 8 dist + 3 pose
    action: List[float]       # 2 values: left, right wheel
    next_observation: List[float]
    reward: float             # Optional: for RL fine-tuning

def collect_random_policy(simulator, num_episodes=1000, max_steps=100):
    """Collect data with random actions"""
    transitions = []

    for ep in range(num_episodes):
        obs = simulator.reset()

        for step in range(max_steps):
            # Random action
            action = [
                random.uniform(-80, 80),
                random.uniform(-80, 80),
            ]

            next_obs, reward, done = simulator.step(action)

            transitions.append(Transition(
                observation=obs,
                action=action,
                next_observation=next_obs,
                reward=reward,
            ))

            if done:
                break
            obs = next_obs

    return transitions

def save_dataset(transitions: List[Transition], path: str):
    """Save transitions to JSON"""
    data = [asdict(t) for t in transitions]
    with open(path, 'w') as f:
        json.dump(data, f)
    print(f"Saved {len(transitions)} transitions to {path}")
```

### Step 2: Train the Model

Create `python/train_jepa.py`:

```python
"""
Train JEPA world model on collected data
"""

import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import Dataset, DataLoader
import json
from jepa_server import JEPAWorldModel

class TransitionDataset(Dataset):
    def __init__(self, path: str):
        with open(path) as f:
            self.data = json.load(f)

    def __len__(self):
        return len(self.data)

    def __getitem__(self, idx):
        t = self.data[idx]
        return (
            torch.tensor(t['observation'], dtype=torch.float32),
            torch.tensor(t['action'], dtype=torch.float32) / 80,  # Normalize
            torch.tensor(t['next_observation'], dtype=torch.float32),
        )


def train_jepa(
    data_path: str,
    output_path: str = 'models/jepa_world_model.pt',
    epochs: int = 100,
    batch_size: int = 64,
    lr: float = 1e-3,
    device: str = 'cuda' if torch.cuda.is_available() else 'cpu',
):
    # Load data
    dataset = TransitionDataset(data_path)
    loader = DataLoader(dataset, batch_size=batch_size, shuffle=True)

    # Create model
    model = JEPAWorldModel(embedding_dim=128, action_dim=2).to(device)

    # Optimizer
    optimizer = optim.AdamW(model.parameters(), lr=lr, weight_decay=0.01)
    scheduler = optim.lr_scheduler.CosineAnnealingLR(optimizer, epochs)

    # Loss functions (JEPA-style)
    mse_loss = nn.MSELoss()

    for epoch in range(epochs):
        total_loss = 0
        total_pred_loss = 0
        total_var_loss = 0

        for obs, action, next_obs in loader:
            obs = obs.to(device)
            action = action.to(device)
            next_obs = next_obs.to(device)

            optimizer.zero_grad()

            # Encode observations
            z = model.encode(obs)
            z_next_target = model.encode(next_obs).detach()  # Target (no gradient)

            # Predict next embedding
            z_next_pred, conf, _ = model.predict(z, action)

            # Prediction loss
            pred_loss = mse_loss(z_next_pred, z_next_target)

            # Variance loss (prevent collapse)
            var_loss = max(0, 1.0 - z.std(dim=0).mean())

            # Covariance loss (encourage independence)
            z_centered = z - z.mean(dim=0)
            cov = (z_centered.T @ z_centered) / (z.shape[0] - 1)
            off_diag = cov - torch.diag(torch.diag(cov))
            cov_loss = off_diag.pow(2).sum() / z.shape[1]

            # Total loss
            loss = pred_loss + 0.1 * var_loss + 0.01 * cov_loss

            loss.backward()
            optimizer.step()

            total_loss += loss.item()
            total_pred_loss += pred_loss.item()
            total_var_loss += var_loss

        scheduler.step()

        if (epoch + 1) % 10 == 0:
            print(f"Epoch {epoch+1}/{epochs} | "
                  f"Loss: {total_loss/len(loader):.4f} | "
                  f"Pred: {total_pred_loss/len(loader):.4f} | "
                  f"Var: {total_var_loss/len(loader):.4f}")

    # Save model
    torch.save(model.state_dict(), output_path)
    print(f"Model saved to {output_path}")


if __name__ == "__main__":
    train_jepa('data/transitions.json')
```

---

## Model Size Comparison

| Model | Parameters | ONNX Size | Inference (CPU) | Inference (GPU) |
|-------|------------|-----------|-----------------|-----------------|
| **Tiny JEPA** (64 dim) | ~50K | ~200KB | 5ms | 1ms |
| **Small JEPA** (128 dim) | ~200K | ~800KB | 10ms | 2ms |
| **Medium JEPA** (256 dim) | ~800K | ~3MB | 25ms | 5ms |
| **I-JEPA ViT-S** | ~22M | ~90MB | 200ms | 20ms |
| **V-JEPA 2** | ~300M | ~1.2GB | N/A | 100ms |

**Recommendation**: Start with **Small JEPA (128 dim)** for the best balance of quality and speed on typical laptops.

---

## Summary

| Approach | Best For | Complexity | Performance |
|----------|----------|------------|-------------|
| **ONNX.js (Browser)** | Quick integration, no backend | Low | Good |
| **Python Server** | Full control, GPU support | Medium | Best |
| **Jetson Nano** | Dedicated edge hardware | High | Very Good |
| **Raspberry Pi** | Low cost, embedded | Medium | Moderate |

**Recommended Path**:
1. Start with ONNX.js in browser for rapid prototyping
2. Train custom model on simulation data
3. Graduate to Python server for production
4. Deploy to Jetson Nano for dedicated robot computer

---

## References

- [EB-JEPA Repository](https://github.com/facebookresearch/eb_jepa)
- [SimpleDreamer](https://github.com/kc-ml2/SimpleDreamer) - Simplified world model implementation
- [ONNX Runtime Web](https://onnxruntime.ai/docs/tutorials/web/) - Browser ML inference
- [Jetson Inference](https://github.com/dusty-nv/jetson-inference) - NVIDIA edge deployment
- [DayDreamer](https://danijar.com/project/daydreamer/) - World models for physical robots

---

*Implementation Guide v1.0 - LLMOS JEPA Integration*
