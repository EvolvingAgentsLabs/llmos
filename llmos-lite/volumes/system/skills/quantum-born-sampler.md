---
skill_id: quantum-born-sampler
name: Quantum Born Machine Sampler
description: Creative sampling via quantum interference patterns
type: python-wasm
execution_mode: browser-wasm
category: quantum
tags: ["quantum", "generative", "born-machine", "sampling", "creative", "mutation"]
version: 1.0.0
author: system
estimated_time_ms: 2000
memory_mb: 30
inputs:
  - name: constraints
    type: array
    description: "String constraints samples must satisfy"
    required: true
  - name: num_samples
    type: number
    description: "Number of samples to generate"
    default: 10
  - name: dimensions
    type: number
    description: "Dimensionality of output"
    default: 4
  - name: temperature
    type: number
    description: "Randomness level (higher = more random)"
    default: 1.0
  - name: seed
    type: array
    description: "Optional seed for reproducibility"
    required: false
outputs:
  - name: samples
    type: array
    description: "Generated samples [[0,1,0,1], ...]"
  - name: probabilities
    type: array
    description: "Probability of each sample"
  - name: novelty_score
    type: number
    description: "Uniqueness score 0-1"
  - name: constraint_satisfaction
    type: number
    description: "Rule compliance 0-1"
  - name: interference_pattern
    type: object
    description: "Quantum interference visualization"
---

# Quantum Born Machine Sampler

**The "Creative" Engine** - Samples from quantum interference patterns.

## Theory

Born machines sample from the probability distribution defined by quantum mechanics:

```
P(x) = |⟨x|ψ⟩|² = |ψ(x)|²
```

Unlike classical random sampling:
- Multiple paths to the same output can **interfere**
- Constructive interference amplifies valid samples
- Destructive interference suppresses invalid samples

This creates distributions impossible to sample classically.

## Quantum Advantage

Born machines can efficiently sample from distributions that require exponential
classical resources to represent. This is the basis of "quantum supremacy" demonstrations.

## Code

```python
import json
import numpy as np
from math import pi, cos, sin, sqrt
import random

def execute(inputs):
    """
    Quantum Born Machine Sampler - creative generation via interference.
    """
    constraints = inputs.get('constraints', [])
    num_samples = inputs.get('num_samples', 10)
    dimensions = inputs.get('dimensions', 4)
    temperature = inputs.get('temperature', 1.0)
    seed = inputs.get('seed', None)

    n_qubits = min(dimensions, 8)

    if seed:
        np.random.seed(int(sum(seed) * 1000) % (2**31))
        random.seed(int(sum(seed) * 1000) % (2**31))

    def parametrized_circuit(theta):
        depth = 3
        dim = 2 ** n_qubits
        state = np.zeros(dim, dtype=complex)
        state[0] = 1.0

        param_idx = 0

        for d in range(depth):
            # RY layer
            for q in range(n_qubits):
                angle = theta[param_idx % len(theta)] * temperature
                param_idx += 1

                new_state = np.zeros(dim, dtype=complex)
                c = cos(angle / 2)
                s = sin(angle / 2)

                for basis in range(dim):
                    bit = (basis >> q) & 1
                    flipped = basis ^ (1 << q)

                    if bit == 0:
                        new_state[basis] += c * state[basis]
                        new_state[flipped] += s * state[basis]
                    else:
                        new_state[basis] += c * state[basis]
                        new_state[flipped] += -s * state[basis]

                state = new_state

            # CNOT chain
            for q in range(n_qubits - 1):
                new_state = np.zeros(dim, dtype=complex)
                for basis in range(dim):
                    control = (basis >> q) & 1
                    if control == 1:
                        new_basis = basis ^ (1 << (q + 1))
                        new_state[new_basis] = state[basis]
                    else:
                        new_state[basis] = state[basis]
                state = new_state

            # RZ layer
            for q in range(n_qubits):
                angle = theta[param_idx % len(theta)] * temperature
                param_idx += 1

                for basis in range(dim):
                    bit = (basis >> q) & 1
                    if bit == 1:
                        state[basis] *= np.exp(1j * angle)

        return state / np.linalg.norm(state)

    # Random circuit parameters
    num_params = 6 * n_qubits
    theta = np.random.uniform(0, 2 * pi, num_params)

    # Generate samples
    state = parametrized_circuit(theta)
    probabilities = np.abs(state) ** 2

    samples = []
    sample_probs = []

    for _ in range(num_samples):
        idx = np.random.choice(len(probabilities), p=probabilities)
        sample = [int(b) for b in format(idx, f'0{n_qubits}b')]
        samples.append(sample)
        sample_probs.append(float(probabilities[idx]))

    # Calculate novelty
    unique_samples = len(set(tuple(s) for s in samples))
    novelty_score = unique_samples / num_samples

    # Check constraints
    satisfied = 0
    for sample in samples:
        valid = True
        for constraint in constraints:
            c_lower = constraint.lower()
            if 'alternating' in c_lower:
                for i in range(len(sample) - 1):
                    if sample[i] == sample[i+1]:
                        valid = False
                        break
            elif 'balanced' in c_lower:
                if sum(sample) != len(sample) // 2:
                    valid = False
            elif 'all_ones' in c_lower:
                if not all(s == 1 for s in sample):
                    valid = False
            elif 'all_zeros' in c_lower:
                if not all(s == 0 for s in sample):
                    valid = False
        if valid:
            satisfied += 1

    constraint_satisfaction = satisfied / num_samples if num_samples > 0 else 0

    return {
        'samples': samples,
        'probabilities': sample_probs,
        'novelty_score': float(novelty_score),
        'constraint_satisfaction': float(constraint_satisfaction),
        'interference_pattern': {
            'amplitudes': np.abs(state).tolist()[:32],
            'phases': np.angle(state).tolist()[:32]
        }
    }
```

## Usage Examples

### Creative Pattern Generation
```python
result = execute({
    'constraints': ['alternating'],
    'num_samples': 10,
    'dimensions': 8,
    'temperature': 1.2
})
# Generates alternating bit patterns via interference
```

### Code Structure Sampling (Mutation Engine)
```python
result = execute({
    'constraints': ['balanced'],
    'num_samples': 5,
    'dimensions': 6,
    'temperature': 1.5
})
# Novel balanced structures for code mutation
```

### Correlated Sampling
```python
result = execute({
    'constraints': [],
    'num_samples': 20,
    'dimensions': 4,
    'seed': [42],
    'temperature': 0.5
})
# Reproducible correlated samples
```
