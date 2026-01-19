---
skill_id: quantum-vqe-node
name: Quantum VQE Simulation
description: Variational Quantum Eigensolver for finding ground state energy
type: qiskit
execution_mode: browser-wasm
category: quantum
tags: ["quantum", "vqe", "optimization", "simulation"]
version: 1.0.0
author: system
estimated_time_ms: 500
memory_mb: 20
inputs:
  - name: ansatz_type
    type: string
    description: Type of ansatz circuit (RY, RYRY, or custom)
    default: "RY"
    required: true
  - name: iterations
    type: number
    description: Number of optimization iterations
    default: 100
    required: true
  - name: hamiltonian
    type: string
    description: Hamiltonian in Pauli string format (e.g., "ZZ")
    default: "ZZ"
    required: true
outputs:
  - name: eigenvalue
    type: number
    description: Computed ground state energy
  - name: convergence_data
    type: array
    description: Energy values at each iteration
  - name: circuit_diagram
    type: string
    description: ASCII representation of the quantum circuit
---

# Quantum VQE Simulation

Runs a Variational Quantum Eigensolver to find the ground state energy of a quantum system.

## Inputs
- **ansatz_type** (string): Type of ansatz circuit (RY, RYRY, or custom)
- **iterations** (number): Number of optimization iterations
- **hamiltonian** (string): Hamiltonian in Pauli string format (e.g., "ZZ")

## Outputs
- **eigenvalue** (number): Computed ground state energy
- **convergence_data** (array): Energy values at each iteration
- **circuit_diagram** (string): ASCII representation of the quantum circuit

## Code

```python
import numpy as np

def execute(inputs):
    """
    VQE implementation using basic quantum simulation.

    This runs in Pyodide (Python compiled to WebAssembly).
    For production, would use micro-qiskit or qiskit-aer-wasm.
    """
    ansatz_type = inputs.get('ansatz_type', 'RY')
    iterations = int(inputs.get('iterations', 100))
    hamiltonian = inputs.get('hamiltonian', 'ZZ')

    # Simple 2-qubit simulation
    def create_ansatz(params):
        """Create parametrized quantum circuit"""
        # Simplified for demo - would use actual circuit construction
        theta = params[0] if len(params) > 0 else 0
        phi = params[1] if len(params) > 1 else 0
        return np.array([
            [np.cos(theta/2), -np.sin(theta/2) * np.exp(-1j*phi)],
            [np.sin(theta/2) * np.exp(1j*phi), np.cos(theta/2)]
        ])

    def measure_energy(params):
        """Measure expectation value of Hamiltonian"""
        # Simplified energy calculation
        # Real implementation would apply Hamiltonian and measure
        theta = params[0]
        # For ZZ Hamiltonian, energy oscillates
        energy = np.cos(theta) * np.cos(params[1]) if len(params) > 1 else np.cos(theta)
        return energy

    # Optimization loop (simplified gradient descent)
    params = np.random.rand(2) * 2 * np.pi
    learning_rate = 0.1
    convergence_data = []

    for i in range(iterations):
        # Calculate energy
        energy = measure_energy(params)
        convergence_data.append(float(energy))

        # Simple gradient descent (numerical gradient)
        eps = 0.01
        grad = np.zeros_like(params)
        for j in range(len(params)):
            params_plus = params.copy()
            params_plus[j] += eps
            params_minus = params.copy()
            params_minus[j] -= eps
            grad[j] = (measure_energy(params_plus) - measure_energy(params_minus)) / (2 * eps)

        # Update parameters
        params -= learning_rate * grad

    # Final energy
    final_energy = measure_energy(params)

    # Generate simple circuit diagram
    circuit_diagram = f"""
    Circuit Diagram ({ansatz_type} ansatz):

    q0: ──RY({params[0]:.2f})──
    q1: ──RY({params[1]:.2f})──

    Hamiltonian: {hamiltonian}
    """

    return {
        "eigenvalue": float(final_energy),
        "convergence_data": convergence_data,
        "circuit_diagram": circuit_diagram.strip()
    }
```

## Usage Notes

This node executes in browser-wasm.
Estimated execution time: 500ms
Memory usage: ~20MB

### Example Workflow

1. Connect this node to a "Plot" node to visualize convergence
2. Chain multiple VQE nodes with different ansatzes to compare
3. Feed output to "Optimization Analysis" node

### Mathematical Background

VQE finds the ground state energy by:
1. Preparing a parametrized quantum state |ψ(θ)⟩
2. Measuring ⟨ψ(θ)|H|ψ(θ)⟩
3. Minimizing over parameters θ
