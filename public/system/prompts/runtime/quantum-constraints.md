---
name: QuantumRuntimeConstraints
type: runtime
version: "1.0"
description: Constraints for quantum computing code using MicroQiskit
variables: []
evolved_from: null
origin: extracted
extracted_from: lib/agent-executor.ts:290-297
---

# Quantum Computing Runtime Constraints

LLMos uses **MicroQiskit** - a minimal quantum circuit simulator for browser environments.

## What is MicroQiskit?

MicroQiskit is a lightweight implementation of Qiskit for educational purposes and simple simulations. It provides basic quantum circuit functionality without the heavy dependencies of full Qiskit.

## Available Features

### Circuit Building
```python
from qiskit import QuantumCircuit

# Create a circuit
qc = QuantumCircuit(2)  # 2 qubits

# Add gates
qc.h(0)        # Hadamard gate
qc.cx(0, 1)    # CNOT gate
qc.x(0)        # Pauli-X gate
qc.z(0)        # Pauli-Z gate
qc.ry(3.14, 0) # Rotation-Y gate

# Measurement
qc.measure_all()
```

### Execution
```python
from qiskit import execute

# Execute the circuit
result = execute(qc, shots=1024)
counts = result.get_counts()
print(counts)  # {'00': 512, '11': 512}
```

## Limitations

### Maximum Resources
- **Qubits**: Maximum 10 qubits
- **Gates**: Maximum ~20 gates per circuit
- **Shots**: Recommended 1024-4096

### NOT Available
- `qiskit_aer` - No Aer simulator
- `qiskit.visualization.circuit_drawer` - Use matplotlib instead
- `qiskit.providers` - No provider system
- Complex noise models
- Pulse-level control
- Real hardware backends

## Correct Usage

### Do:
```python
from qiskit import QuantumCircuit, execute

# Create Bell state
qc = QuantumCircuit(2)
qc.h(0)
qc.cx(0, 1)
qc.measure_all()

# Execute directly (no backend parameter)
result = execute(qc, shots=1024)
counts = result.get_counts()

# Visualize with matplotlib
import matplotlib.pyplot as plt
labels = list(counts.keys())
values = list(counts.values())
plt.bar(labels, values)
plt.xlabel('State')
plt.ylabel('Counts')
plt.title('Measurement Results')
plt.show()
```

### Don't:
```python
from qiskit import Aer  # NOT AVAILABLE
from qiskit.visualization import circuit_drawer  # NOT AVAILABLE

# Don't use backends
backend = Aer.get_backend('qasm_simulator')  # WRONG
result = execute(qc, backend, shots=1024)  # WRONG

# Don't use circuit_drawer
circuit_drawer(qc)  # WRONG - use matplotlib
```

## Alternative Visualizations

Since `circuit_drawer` is not available, create visualizations manually:

```python
import matplotlib.pyplot as plt

def visualize_circuit(qc):
    """Simple circuit visualization"""
    fig, ax = plt.subplots(figsize=(10, 4))
    ax.text(0.5, 0.5, f"Circuit: {qc.num_qubits} qubits, {len(qc.data)} gates",
            ha='center', va='center', fontsize=14)
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1)
    ax.axis('off')
    plt.title('Quantum Circuit Summary')
    plt.show()
```

## Example: Bell State Analysis

```python
from qiskit import QuantumCircuit, execute
import matplotlib.pyplot as plt

# Create Bell state
qc = QuantumCircuit(2)
qc.h(0)
qc.cx(0, 1)
qc.measure_all()

# Execute
result = execute(qc, shots=4096)
counts = result.get_counts()

# Analyze
print(f"Bell state measurement results:")
for state, count in sorted(counts.items()):
    probability = count / 4096
    print(f"  |{state}>: {count} ({probability:.2%})")

# Visualize
fig, ax = plt.subplots(figsize=(8, 5))
states = list(counts.keys())
probs = [c/4096 for c in counts.values()]
bars = ax.bar(states, probs, color=['#3498db', '#e74c3c'])
ax.set_ylabel('Probability')
ax.set_xlabel('Quantum State')
ax.set_title('Bell State |Φ+> Measurement')
ax.set_ylim(0, 0.6)
for bar, prob in zip(bars, probs):
    ax.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 0.02,
            f'{prob:.1%}', ha='center', fontsize=12)
plt.tight_layout()
plt.show()
```
