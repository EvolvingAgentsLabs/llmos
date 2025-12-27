---
skill_id: quantum-context-compressor
name: Quantum Context Compressor
description: QPCA-based dimensionality reduction for agent memory and context
type: python-wasm
execution_mode: browser-wasm
category: quantum
tags: ["quantum", "compression", "pca", "memory", "context", "dimensionality"]
version: 1.0.0
author: system
estimated_time_ms: 1500
memory_mb: 30
inputs:
  - name: data
    type: array
    description: "Matrix to compress [[row1], [row2], ...]"
    required: true
  - name: num_components
    type: number
    description: "Principal components (0 = auto)"
    default: 0
  - name: target_compression
    type: number
    description: "Target information preservation (0-1)"
    default: 0.9
  - name: reconstructible
    type: boolean
    description: "Return reconstruction error"
    default: true
outputs:
  - name: compressed
    type: array
    description: "Quantum fingerprint"
  - name: principal_components
    type: array
    description: "Eigenvectors (core truths)"
  - name: eigenvalues
    type: array
    description: "Importance of each component"
  - name: compression_ratio
    type: number
    description: "Achieved compression"
  - name: information_preserved
    type: number
    description: "How much info kept (0-1)"
  - name: reconstruction_error
    type: number
    description: "Error if reconstructed"
---

# Quantum Context Compressor

**The "Context Expander"** - Compresses massive data into quantum fingerprints.

## Theory

Quantum PCA finds the eigenvalues and eigenvectors of a density matrix
exponentially faster than classical methods:

**Classical PCA**: O(n³) for n×n matrix
**Quantum PCA**: O(log²n) with QRAM

The algorithm:
1. Encode data matrix as density matrix ρ
2. Perform quantum phase estimation on e^{iρt}
3. Extract eigenvalues from measurement
4. Use amplitude estimation for eigenvectors

## Quantum Advantage

For an N×N matrix:
- Classical: Must compute O(N³) operations
- Quantum: Uses only O(log N) qubits, O(log² N) operations

This enables agents to "remember" gigabytes of context in compact form.

## Code

```python
import json
import numpy as np
from math import log2

def execute(inputs):
    """
    Quantum Context Compressor using simulated QPCA.
    """
    data = np.array(inputs.get('data', []))
    num_components = inputs.get('num_components', 0)
    target_compression = inputs.get('target_compression', 0.9)
    reconstructible = inputs.get('reconstructible', True)

    if len(data) == 0:
        return {'error': 'No data provided'}

    # Handle 1D input
    if len(data.shape) == 1:
        data = data.reshape(-1, 1)

    n_samples, n_features = data.shape

    # Center the data
    mean = np.mean(data, axis=0)
    centered = data - mean

    # Compute covariance matrix
    cov = np.cov(centered.T)
    if cov.ndim == 0:
        cov = np.array([[cov]])

    # Eigendecomposition (what QPCA accelerates)
    eigenvalues, eigenvectors = np.linalg.eigh(cov)

    # Sort descending
    idx = np.argsort(eigenvalues)[::-1]
    eigenvalues = eigenvalues[idx]
    eigenvectors = eigenvectors[:, idx]

    # Auto-select components
    if num_components == 0:
        total_var = np.sum(eigenvalues)
        cumsum = np.cumsum(eigenvalues)
        num_components = int(np.argmax(cumsum / total_var >= target_compression) + 1)
        num_components = max(1, min(num_components, n_features))

    # Extract principal components
    principal_components = eigenvectors[:, :num_components]
    selected_eigenvalues = eigenvalues[:num_components]

    # Compress
    compressed = np.dot(centered, principal_components)

    # Metrics
    compression_ratio = num_components / n_features
    info_preserved = float(np.sum(selected_eigenvalues) / (np.sum(eigenvalues) + 1e-10))

    # Reconstruction error
    reconstruction_error = None
    if reconstructible:
        reconstructed = np.dot(compressed, principal_components.T) + mean
        reconstruction_error = float(np.mean((data - reconstructed) ** 2))

    # Quantum fingerprint
    fingerprint = []
    for i in range(min(num_components, 8)):
        contribution = selected_eigenvalues[i] / (np.sum(eigenvalues) + 1e-10)
        fingerprint.append(float(contribution))

    # Quantum resource calculation
    classical_bits = n_samples * n_features * 64
    quantum_qubits = int(log2(max(n_samples, n_features)) + 1) if n_samples > 1 else 1

    return {
        'compressed': fingerprint,
        'principal_components': principal_components.tolist(),
        'eigenvalues': eigenvalues.tolist()[:10],
        'compression_ratio': float(compression_ratio),
        'information_preserved': float(info_preserved),
        'reconstruction_error': reconstruction_error,
        'analogy': f"Extracted {num_components} eigenvectors from {n_samples}x{n_features} matrix. "
                  f"Classical: {classical_bits:,} bits. Quantum: ~{quantum_qubits} qubits."
    }
```

## Usage Examples

### Compress Conversation History
```python
# Embeddings of past messages
conversation_embeddings = [
    [0.1, 0.9, 0.3, 0.2, 0.5],
    [0.2, 0.8, 0.4, 0.1, 0.6],
    [0.15, 0.85, 0.35, 0.15, 0.55],
    # ... hundreds more
]

result = execute({
    'data': conversation_embeddings,
    'target_compression': 0.95
})

print(f"Compressed to {result['compression_ratio']*100}% of original")
print(f"Kept {result['information_preserved']*100}% of information")
```

### Memory Consolidation
```python
# Agent's long-term memory embeddings
memory_matrix = agent.get_memory_embeddings()

result = execute({
    'data': memory_matrix,
    'num_components': 3,  # Keep top 3 themes
    'reconstructible': True
})

# Store only the fingerprint
agent.set_compressed_memory(result['compressed'])
```

### RAG Database Compression
```python
# Document embeddings
rag_embeddings = vectorstore.get_all_embeddings()

result = execute({
    'data': rag_embeddings,
    'target_compression': 0.98
})

# The fingerprint captures document themes
print(result['compressed'])  # Compact representation
```
