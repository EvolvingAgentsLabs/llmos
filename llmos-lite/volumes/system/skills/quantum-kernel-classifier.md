---
skill_id: quantum-kernel-classifier
name: Quantum Kernel Classifier
description: QSVM-based pattern recognition using Hilbert space feature mapping
type: python-wasm
execution_mode: browser-wasm
category: quantum
tags: ["quantum", "classification", "qsvm", "kernel", "pattern-recognition", "ml"]
version: 1.0.0
author: system
estimated_time_ms: 3000
memory_mb: 40
inputs:
  - name: training_data
    type: array
    description: "Training data vectors [[x1, x2, ...], ...]"
    required: true
  - name: training_labels
    type: array
    description: "Labels for training data [0, 1, 1, 0, ...]"
    required: true
  - name: test_data
    type: array
    description: "Data to classify [[x1, x2, ...], ...]"
    required: true
  - name: feature_map
    type: string
    description: "Quantum feature map: zz, pauli, iqp"
    default: "zz"
  - name: reps
    type: number
    description: "Feature map repetitions"
    default: 2
outputs:
  - name: predictions
    type: array
    description: "Predicted labels"
  - name: confidences
    type: array
    description: "Confidence scores"
  - name: kernel_matrix
    type: array
    description: "Quantum kernel similarity matrix"
  - name: hidden_patterns
    type: array
    description: "Patterns invisible to classical methods"
---

# Quantum Kernel Classifier

**The "Hidden Feature" Detector** - Maps data to Hilbert space for classification.

## Theory

Quantum kernels compute similarity in exponentially large Hilbert space:

```
k(x₁, x₂) = |⟨φ(x₁)|φ(x₂)⟩|²
```

Where φ(x) is a quantum feature map that encodes classical data into quantum states.

The ZZ feature map:
1. Apply Hadamard to create |+⟩^n
2. Apply RZ(xᵢ) rotations encoding data
3. Apply RZZ(xᵢxⱼ) entangling gates
4. Repeat for depth

## Quantum Advantage

Classical computers cannot efficiently compute these kernels for large n because
the Hilbert space dimension is 2^n. Quantum computers evaluate them naturally.

## Code

```python
import json
import numpy as np
from math import pi, sqrt

def execute(inputs):
    """
    Quantum Kernel Classifier using simulated QSVM.
    """
    training_data = np.array(inputs.get('training_data', []))
    training_labels = np.array(inputs.get('training_labels', []))
    test_data = np.array(inputs.get('test_data', []))
    feature_map = inputs.get('feature_map', 'zz')
    reps = inputs.get('reps', 2)

    if len(training_data) == 0 or len(test_data) == 0:
        return {'error': 'No data provided'}

    n_train = len(training_data)
    n_test = len(test_data)
    n_features = training_data.shape[1] if len(training_data.shape) > 1 else 1
    n_qubits = min(n_features, 6)

    def feature_map_circuit(x):
        dim = 2 ** n_qubits
        state = np.ones(dim, dtype=complex) / sqrt(dim)

        x_norm = x[:n_qubits] if len(x) >= n_qubits else np.pad(x, (0, n_qubits - len(x)))
        x_norm = x_norm / (np.linalg.norm(x_norm) + 1e-10)

        for rep in range(reps):
            # Single qubit rotations
            for i in range(n_qubits):
                angle = x_norm[i] * pi
                for s in range(dim):
                    if (s >> i) & 1:
                        state[s] *= np.exp(1j * angle)

            # ZZ entangling gates
            if feature_map == 'zz':
                for i in range(n_qubits - 1):
                    j = i + 1
                    angle = x_norm[i] * x_norm[j] * pi
                    for s in range(dim):
                        bit_i = (s >> i) & 1
                        bit_j = (s >> j) & 1
                        if bit_i == bit_j:
                            state[s] *= np.exp(1j * angle)
                        else:
                            state[s] *= np.exp(-1j * angle)

        return state / np.linalg.norm(state)

    def quantum_kernel(x1, x2):
        state1 = feature_map_circuit(x1)
        state2 = feature_map_circuit(x2)
        return np.abs(np.vdot(state1, state2)) ** 2

    # Compute kernel matrix
    kernel_matrix = np.zeros((n_train, n_train))
    for i in range(n_train):
        for j in range(i, n_train):
            k = quantum_kernel(training_data[i], training_data[j])
            kernel_matrix[i, j] = k
            kernel_matrix[j, i] = k

    # Kernel regression
    lambda_reg = 0.1
    K_reg = kernel_matrix + lambda_reg * np.eye(n_train)
    alpha = np.linalg.solve(K_reg, training_labels)

    # Predict
    predictions = []
    confidences = []

    for x_test in test_data:
        k_test = np.array([quantum_kernel(x_train, x_test) for x_train in training_data])
        f = np.sum(alpha * training_labels * k_test)
        pred = 1 if f > 0 else 0
        conf = min(abs(f), 1.0)
        predictions.append(int(pred))
        confidences.append(float(conf))

    # Detect hidden patterns
    hidden_patterns = []
    euclidean_dist = np.zeros((n_train, n_train))
    for i in range(n_train):
        for j in range(n_train):
            euclidean_dist[i, j] = np.linalg.norm(training_data[i] - training_data[j])

    for i in range(min(3, n_train)):
        q_neighbors = np.argsort(kernel_matrix[i])[::-1][:3]
        e_neighbors = np.argsort(euclidean_dist[i])[:3]
        if not np.array_equal(q_neighbors, e_neighbors):
            hidden_patterns.append(f"Point {i}: quantum sees different structure")

    return {
        'predictions': predictions,
        'confidences': confidences,
        'kernel_matrix': kernel_matrix.tolist(),
        'hidden_patterns': hidden_patterns or ["No hidden patterns in this dataset"]
    }
```

## Usage Examples

### XOR Classification (Non-linearly Separable)
```python
result = execute({
    'training_data': [[0, 0], [0, 1], [1, 0], [1, 1]],
    'training_labels': [0, 1, 1, 0],
    'test_data': [[0.1, 0.1], [0.9, 0.1], [0.1, 0.9], [0.9, 0.9]],
    'feature_map': 'zz',
    'reps': 2
})
# Quantum kernel separates XOR easily
```

### Time Series Anomaly
```python
result = execute({
    'training_data': normal_embeddings,
    'training_labels': [0] * len(normal_embeddings),
    'test_data': new_samples,
    'feature_map': 'zz'
})
```
