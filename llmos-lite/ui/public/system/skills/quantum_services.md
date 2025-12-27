---
name: Quantum Services Catalog
type: registry
version: 1.0.0
description: Advanced QML blocks for the Mutation Engine and AI Agents.
author: system
category: quantum
tags: ["quantum", "qml", "optimization", "classification", "generative", "compression"]
---

# Quantum Services Catalog

> **Quantum-Native OS Primitives for AI Agents**
>
> These are the API blocks that become available when Fault-Tolerant Quantum Computing
> arrives. Currently implemented as classical simulations with quantum-faithful interfaces.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     QUANTUM SERVICE LAYER                        │
│  Future: QPU Hardware    |    Current: Classical Simulation     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────┐  ┌──────────────────┐                     │
│  │  Hamiltonian     │  │  Kernel          │                     │
│  │  Optimizer       │  │  Mapper          │                     │
│  │  (QAOA)          │  │  (QSVM)          │                     │
│  └────────┬─────────┘  └────────┬─────────┘                     │
│           │                     │                                │
│  ┌──────────────────┐  ┌──────────────────┐                     │
│  │  Entanglement    │  │  Context         │                     │
│  │  Sampler         │  │  Compressor      │                     │
│  │  (Born Machine)  │  │  (QPCA)          │                     │
│  └────────┬─────────┘  └────────┬─────────┘                     │
│           │                     │                                │
├───────────┴─────────────────────┴────────────────────────────────┤
│                     MUTATION ENGINE INTEGRATION                  │
│  Cross-domain lenses can invoke quantum services for:           │
│  - Optimization (thermodynamics → annealing)                    │
│  - Pattern detection (signal processing → Hilbert space)        │
│  - Creative mutation (evolutionary → Born sampling)             │
│  - Context compression (economics → efficient encoding)         │
└─────────────────────────────────────────────────────────────────┘
```

---

## 1. Hamiltonian Optimizer

**Service ID:** `global_minima_finder`
**Quantum Primitive:** QAOA (Quantum Approximate Optimization Algorithm)

### Use When
- Solving scheduling problems with multiple constraints
- Route optimization (TSP, vehicle routing)
- Resource allocation with competing objectives
- Any problem that can be expressed as "minimize cost subject to constraints"

### Input Schema
```typescript
{
  problemType: 'scheduling' | 'routing' | 'resource_allocation' | 'max_cut' | 'tsp' | 'custom',
  nodes: string[],           // Tasks/locations/resources
  edges: Array<{             // Relationships with costs
    from: string,
    to: string,
    weight: number
  }>,
  constraints?: Array<{      // Rules to satisfy
    type: 'equality' | 'inequality' | 'binary',
    variables: string[],
    coefficients: number[],
    bound: number
  }>,
  qaoaDepth?: number,        // Circuit depth (default: 2)
  iterations?: number        // Optimization steps (default: 100)
}
```

### Output Schema
```typescript
{
  solution: Record<string, number>,  // Optimal assignment
  optimalCost: number,               // Minimum cost achieved
  solutionQuality: number,           // 0-1 quality score
  alternatives: Array<{...}>,        // Near-optimal alternatives
  analogy: string                    // Explanation
}
```

### Analogy
> "Finding the lowest energy state of a physical system."
>
> The optimization problem is encoded as an Ising Hamiltonian (energy function).
> QAOA creates a quantum superposition of ALL possible solutions simultaneously,
> then uses interference to amplify the lowest-energy (optimal) configuration.

### Example
```typescript
import { GlobalMinimaFinder } from '@/lib/quantum-services';

const result = await GlobalMinimaFinder.optimize({
  problemType: 'scheduling',
  nodes: ['meeting_a', 'meeting_b', 'meeting_c', 'meeting_d'],
  edges: [
    { from: 'meeting_a', to: 'meeting_b', weight: 2 },  // Conflict cost
    { from: 'meeting_b', to: 'meeting_c', weight: 5 },
    { from: 'meeting_a', to: 'meeting_d', weight: 1 },
  ],
  constraints: [
    { type: 'binary', variables: ['meeting_a', 'meeting_b'], coefficients: [1, 1], bound: 1 }
  ]
});

console.log(result.solution);  // { meeting_a: 1, meeting_b: 0, meeting_c: 1, meeting_d: 0 }
```

---

## 2. Kernel Mapper

**Service ID:** `hilbert_feature_mapper`
**Quantum Primitive:** QSVM (Quantum Support Vector Machine)

### Use When
- Classifying data that appears random or inseparable to standard ML
- Finding correlations in high-dimensional data (financial, biological, sensor)
- Pattern recognition where classical kernels fail
- Data with non-linear, non-obvious structure

### Input Schema
```typescript
{
  trainingData: number[][],    // Training vectors
  trainingLabels: number[],    // Labels (0 or 1)
  testData: number[][],        // Data to classify
  featureMap?: 'zz' | 'pauli' | 'iqp',  // Quantum encoding (default: 'zz')
  reps?: number,               // Feature map repetitions (default: 2)
  entanglement?: 'linear' | 'full' | 'circular'
}
```

### Output Schema
```typescript
{
  predictions: number[],           // Predicted labels
  confidences: number[],           // Confidence scores
  kernelMatrix: number[][],        // Quantum kernel (similarity)
  featureImportance: number[],     // Which features matter in Hilbert space
  hiddenPatterns: string[],        // Patterns invisible to classical methods
  analogy: string
}
```

### Analogy
> "Mapping data onto the surface of a hyper-dimensional sphere."
>
> Quantum feature maps encode classical data into quantum states living in
> 2^n dimensional Hilbert space. Patterns that are tangled in classical space
> become geometrically separable in quantum space.

### Example
```typescript
import { HilbertFeatureMapper } from '@/lib/quantum-services';

// XOR problem: classically non-separable
const result = await HilbertFeatureMapper.classify({
  trainingData: [[0, 0], [0, 1], [1, 0], [1, 1]],
  trainingLabels: [0, 1, 1, 0],
  testData: [[0.1, 0.1], [0.9, 0.1]],
  featureMap: 'zz',
  reps: 2
});

console.log(result.predictions);     // [0, 1]
console.log(result.hiddenPatterns);  // Reveals XOR structure
```

---

## 3. Entanglement Sampler

**Service ID:** `born_machine_sampler`
**Quantum Primitive:** Quantum Born Machine

### Use When
- Generating creative variations that must remain correlated
- Sampling from complex, multi-modal distributions
- Creating outputs that are valid but non-intuitive
- **Mutation Engine**: generating novel code structures

### Input Schema
```typescript
{
  constraints: string[],       // Rules samples must follow
  numSamples?: number,         // How many to generate (default: 10)
  dimensions?: number,         // Output dimensionality (default: 4)
  temperature?: number,        // Randomness (default: 1.0)
  seed?: number[],             // Reproducibility
  targetDistribution?: number[] // Distribution to approximate
}
```

### Output Schema
```typescript
{
  samples: number[][],             // Generated samples
  probabilities: number[],         // Probability of each
  noveltyScore: number,            // Uniqueness (0-1)
  constraintSatisfaction: number,  // Rule compliance (0-1)
  interferencePattern: {           // Visualization data
    amplitudes: number[],
    phases: number[]
  },
  analogy: string
}
```

### Analogy
> "Rolling dice that are magically connected across distance."
>
> Unlike classical sampling that follows a single probability distribution,
> quantum Born machines create interference patterns. Multiple "paths" to
> the same output can constructively or destructively interfere, creating
> distributions impossible to sample classically.

### Example
```typescript
import { BornMachineSampler } from '@/lib/quantum-services';

// Generate creative poem structures
const result = await BornMachineSampler.sample({
  constraints: ['alternating', 'balanced'],
  numSamples: 5,
  dimensions: 8,
  temperature: 1.5
});

// Samples that follow constraints but in unexpected ways
console.log(result.samples);
console.log(`Novelty: ${result.noveltyScore}`);
```

---

## 4. Context Compressor

**Service ID:** `qram_compressor`
**Quantum Primitive:** QPCA (Quantum Principal Component Analysis)

### Use When
- Compressing massive RAG databases
- Reducing conversation history while preserving meaning
- Creating compact "quantum fingerprints" of large datasets
- Agent memory consolidation

### Input Schema
```typescript
{
  data: number[][],              // Matrix to compress
  numComponents?: number,        // Principal components (auto if 0)
  targetCompression?: number,    // Info to preserve (default: 0.9)
  reconstructible?: boolean      // Return reconstruction error
}
```

### Output Schema
```typescript
{
  compressed: number[],            // Quantum fingerprint
  principalComponents: number[][],  // Eigenvectors
  eigenvalues: number[],           // Importance of each
  compressionRatio: number,        // Achieved compression
  informationPreserved: number,    // 0-1 (how much kept)
  reconstructionError?: number,    // If reconstructible
  analogy: string
}
```

### Analogy
> "Extracting the DNA of a massive dataset."
>
> QPCA finds the "eigenvectors" (core truths) of data exponentially faster
> than classical methods. A matrix of size N can be processed using only
> log₂(N) qubits, creating a tiny fingerprint that represents gigabytes.

### Example
```typescript
import { QRAMCompressor } from '@/lib/quantum-services';

// Compress conversation history
const conversationMatrix = [
  [0.1, 0.9, 0.3, 0.2],
  [0.2, 0.8, 0.4, 0.1],
  // ... hundreds of message embeddings
];

const result = await QRAMCompressor.compress({
  data: conversationMatrix,
  targetCompression: 0.95,
  reconstructible: true
});

console.log(`Compressed to ${result.compressionRatio * 100}%`);
console.log(`Information preserved: ${result.informationPreserved * 100}%`);
```

---

## Integration with Mutation Engine

The Quantum Services integrate with the Mutation Engine's cross-domain lens system:

### Thermodynamics Lens + Hamiltonian Optimizer
When mutating scheduling/sorting code, the thermodynamics lens can invoke the
Hamiltonian Optimizer to find provably optimal orderings via simulated annealing.

### Signal Processing Lens + Kernel Mapper
When analyzing time-series code, the signal lens can use quantum kernels to
detect patterns in frequency space invisible to classical FFT.

### Evolutionary Biology Lens + Entanglement Sampler
When generating code mutations, the evolutionary lens can use Born machine
sampling to create novel variations that classical random mutation cannot.

### Economics Lens + Context Compressor
When optimizing memory usage, the economics lens can apply QPCA to compress
large data structures into efficient representations.

---

## Usage in TypeScript

```typescript
import QuantumServices from '@/lib/quantum-services';

// Access the catalog
const catalog = QuantumServices.catalog();
console.log(catalog);

// Use individual services
const optimized = await QuantumServices.optimizer.optimize({...});
const classified = await QuantumServices.classifier.classify({...});
const samples = await QuantumServices.generator.sample({...});
const compressed = await QuantumServices.compressor.compress({...});
```

---

## Roadmap

| Phase | Status | Description |
|-------|--------|-------------|
| 1. Simulation | ✅ Complete | Classical simulations with quantum-faithful APIs |
| 2. Hybrid | 🔄 Planned | Cloud QPU integration (IBM, IonQ, Rigetti) |
| 3. Native | 🔮 Future | Direct QPU execution when FTQC available |

The API contracts defined here will remain stable across all phases. Only the
backend execution changes - the Mutation Engine and Agents use the same interface.
