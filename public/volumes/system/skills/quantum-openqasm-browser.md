---
skill_id: quantum-openqasm-browser
name: Quantum Computing with OpenQASM (Browser-Only)
description: Complete quantum computing in browser using MicroQiskit and OpenQASM 2.0
type: qiskit
execution_mode: browser-wasm
category: quantum
tags: ["quantum", "openqasm", "browser", "wasm", "qft", "tutorial"]
version: 1.0.0
author: system
estimated_time_ms: 200
memory_mb: 10
inputs:
  - name: example
    type: string
    description: Which example to run (bell, ghz, qft, openqasm_roundtrip)
    default: "qft"
    required: false
  - name: num_qubits
    type: number
    description: Number of qubits (2-8)
    default: 4
    required: false
outputs:
  - name: circuit_qasm
    type: string
    description: OpenQASM 2.0 representation
  - name: measurement_counts
    type: object
    description: Measurement results
  - name: statevector_info
    type: object
    description: Quantum state analysis
---

# Quantum Computing with OpenQASM (Browser-Only)

**Everything runs 100% in the browser** using MicroQiskit (WASM) and OpenQASM 2.0.
No backend server required!

## Architecture

```
┌──────────────────────────────────────────────────────┐
│                    BROWSER (WASM)                     │
│  ┌─────────────┐    ┌──────────────┐    ┌─────────┐  │
│  │ Build       │ -> │ OpenQASM 2.0 │ -> │ Simulate│  │
│  │ Circuit     │    │ (IR format)  │    │ & Plot  │  │
│  │             │ <- │              │ <- │         │  │
│  └─────────────┘    └──────────────┘    └─────────┘  │
│        MicroQiskit + Pyodide (Python in WASM)        │
└──────────────────────────────────────────────────────┘
```

## Code

```python
from qiskit import QuantumCircuit, execute
from qiskit.quantum_info import Statevector
import matplotlib.pyplot as plt
import numpy as np

def execute_skill(inputs):
    """
    Quantum computing examples - 100% browser-based.

    Uses MicroQiskit (lightweight Qiskit for WASM) with OpenQASM 2.0.
    """
    example = inputs.get('example', 'qft')
    num_qubits = min(int(inputs.get('num_qubits', 4)), 8)

    results = {}

    # ═══════════════════════════════════════════════════════════════
    # EXAMPLE 1: Bell State (Quantum Entanglement)
    # ═══════════════════════════════════════════════════════════════
    if example == 'bell':
        qc = QuantumCircuit(2, 2)
        qc.h(0)        # Hadamard: |0⟩ → (|0⟩+|1⟩)/√2
        qc.cx(0, 1)    # CNOT: entangle qubits
        qc.measure(0, 0)
        qc.measure(1, 1)

        # Export to OpenQASM
        qasm = qc.qasm()
        print("Bell State Circuit (OpenQASM 2.0):")
        print(qasm)

        # Simulate
        result = execute(qc, shots=1024).result()
        counts = result.get_counts()
        print(f"\nMeasurement results: {counts}")
        print("Note: Only |00⟩ and |11⟩ appear (entanglement!)")

        # Visualize
        plt.figure(figsize=(10, 4))
        plt.subplot(1, 2, 1)
        plt.bar(counts.keys(), counts.values(), color='steelblue')
        plt.title('Bell State Measurements')
        plt.xlabel('State')
        plt.ylabel('Counts')

        plt.subplot(1, 2, 2)
        plt.text(0.5, 0.5, qasm, fontfamily='monospace', fontsize=9,
                ha='center', va='center', transform=plt.gca().transAxes)
        plt.title('OpenQASM 2.0 Code')
        plt.axis('off')
        plt.tight_layout()
        plt.show()

        results = {
            'circuit_qasm': qasm,
            'measurement_counts': counts,
            'description': 'Bell state: maximally entangled 2-qubit state'
        }

    # ═══════════════════════════════════════════════════════════════
    # EXAMPLE 2: GHZ State (Multi-qubit Entanglement)
    # ═══════════════════════════════════════════════════════════════
    elif example == 'ghz':
        qc = QuantumCircuit(num_qubits, num_qubits)
        qc.h(0)
        for i in range(num_qubits - 1):
            qc.cx(i, i + 1)
        for i in range(num_qubits):
            qc.measure(i, i)

        qasm = qc.qasm()
        print(f"GHZ State ({num_qubits} qubits) - OpenQASM 2.0:")
        print(qasm)

        result = execute(qc, shots=1024).result()
        counts = result.get_counts()
        print(f"\nMeasurement results: {counts}")

        # Only |000...0⟩ and |111...1⟩ should appear
        expected_states = ['0' * num_qubits, '1' * num_qubits]
        print(f"Expected states: {expected_states}")

        plt.figure(figsize=(8, 5))
        plt.bar(counts.keys(), counts.values(), color='coral')
        plt.title(f'GHZ State ({num_qubits} qubits)')
        plt.xlabel('State')
        plt.ylabel('Counts')
        plt.show()

        results = {
            'circuit_qasm': qasm,
            'measurement_counts': counts,
            'description': f'GHZ state: {num_qubits}-qubit entanglement'
        }

    # ═══════════════════════════════════════════════════════════════
    # EXAMPLE 3: Quantum Fourier Transform (QFT)
    # ═══════════════════════════════════════════════════════════════
    elif example == 'qft':
        # Create QFT circuit using helper function
        qft = create_qft(num_qubits, do_swaps=True)

        # Export to OpenQASM
        qasm = qft.qasm()
        print(f"QFT ({num_qubits} qubits) - OpenQASM 2.0:")
        print(qasm)

        # Analyze statevector (no measurement for state analysis)
        sv = Statevector.from_instruction(qft)
        probs = sv.probabilities()
        phases = sv.phases()

        print(f"\nStatevector analysis:")
        print(f"  Amplitudes are uniform: {np.allclose(probs, 1/len(probs))}")
        print(f"  This is the Fourier basis!")

        # For measurement, add classical bits
        qc_meas = QuantumCircuit(num_qubits, num_qubits)
        for gate in qft.data:
            qc_meas.data.append(gate)
        for i in range(num_qubits):
            qc_meas.measure(i, i)

        result = execute(qc_meas, shots=1024).result()
        counts = result.get_counts()

        # Visualize
        fig, axes = plt.subplots(1, 3, figsize=(15, 4))

        # Probabilities
        states = [format(i, f'0{num_qubits}b') for i in range(2**num_qubits)]
        axes[0].bar(range(len(probs)), probs, color='steelblue', alpha=0.7)
        axes[0].set_title('QFT Output: Probability Distribution')
        axes[0].set_xlabel('Basis State')
        axes[0].set_ylabel('Probability')

        # Phases (the key feature of QFT!)
        colors = plt.cm.hsv([(p / (2*np.pi) + 0.5) % 1 for p in phases])
        axes[1].bar(range(len(phases)), phases, color=colors, alpha=0.7)
        axes[1].set_title('QFT Output: Phase Distribution')
        axes[1].set_xlabel('Basis State')
        axes[1].set_ylabel('Phase (radians)')
        axes[1].axhline(y=0, color='gray', linestyle='--', alpha=0.5)

        # Measurement counts
        sorted_counts = sorted(counts.items(), key=lambda x: x[1], reverse=True)
        axes[2].bar([s for s, c in sorted_counts[:8]],
                   [c for s, c in sorted_counts[:8]], color='coral')
        axes[2].set_title('Measurement Results (1024 shots)')
        axes[2].tick_params(axis='x', rotation=45)

        plt.tight_layout()
        plt.show()

        results = {
            'circuit_qasm': qasm,
            'measurement_counts': counts,
            'statevector_info': {
                'uniform_probability': float(np.mean(probs)),
                'num_states': len(probs),
                'phases_encoded': True
            },
            'description': 'QFT transforms computational basis to Fourier basis'
        }

    # ═══════════════════════════════════════════════════════════════
    # EXAMPLE 4: OpenQASM Round-Trip (Export → Import → Execute)
    # ═══════════════════════════════════════════════════════════════
    elif example == 'openqasm_roundtrip':
        # Step 1: Build circuit
        print("Step 1: Build a quantum circuit")
        qc = QuantumCircuit(3, 3)
        qc.h(0)
        qc.h(1)
        qc.cx(0, 2)
        qc.cx(1, 2)
        qc.measure(0, 0)
        qc.measure(1, 1)
        qc.measure(2, 2)

        original_gates = len(qc.data)
        print(f"   Original circuit: {original_gates} gates")

        # Step 2: Export to OpenQASM
        print("\nStep 2: Export to OpenQASM 2.0")
        qasm = qc.qasm()
        print(qasm)

        # Step 3: Import back from OpenQASM
        print("\nStep 3: Import back from OpenQASM")
        qc_imported = QuantumCircuit.from_qasm_str(qasm)
        imported_gates = len(qc_imported.data)
        print(f"   Imported circuit: {imported_gates} gates")
        print(f"   Round-trip successful: {original_gates == imported_gates}")

        # Step 4: Execute imported circuit
        print("\nStep 4: Execute imported circuit")
        result = execute(qc_imported, shots=1024).result()
        counts = result.get_counts()
        print(f"   Measurement results: {counts}")

        # Step 5: Modify and re-export (demonstrating workflow)
        print("\nStep 5: Demonstrating OpenQASM as IR")
        print("   OpenQASM can be:")
        print("   - Stored as text files")
        print("   - Sent to other quantum tools")
        print("   - Versioned with git")
        print("   - Shared between browser and server")

        # Visualize
        plt.figure(figsize=(10, 5))

        plt.subplot(1, 2, 1)
        plt.bar(counts.keys(), counts.values(), color='purple', alpha=0.7)
        plt.title('Measurement Results')
        plt.xlabel('State')
        plt.ylabel('Counts')

        plt.subplot(1, 2, 2)
        plt.text(0.1, 0.9, "OpenQASM 2.0 Round-Trip:", fontweight='bold',
                transform=plt.gca().transAxes, fontsize=12)
        plt.text(0.1, 0.7, f"1. Build circuit ({original_gates} gates)",
                transform=plt.gca().transAxes)
        plt.text(0.1, 0.55, "2. Export: circuit.qasm()",
                transform=plt.gca().transAxes)
        plt.text(0.1, 0.4, "3. Import: QuantumCircuit.from_qasm_str()",
                transform=plt.gca().transAxes)
        plt.text(0.1, 0.25, f"4. Execute: {sum(counts.values())} shots",
                transform=plt.gca().transAxes)
        plt.text(0.1, 0.1, f"5. Results: {len(counts)} unique states",
                transform=plt.gca().transAxes)
        plt.axis('off')
        plt.title('Workflow')

        plt.tight_layout()
        plt.show()

        results = {
            'circuit_qasm': qasm,
            'measurement_counts': counts,
            'roundtrip_valid': original_gates == imported_gates,
            'description': 'OpenQASM enables circuit serialization and sharing'
        }

    else:
        results = {'error': f"Unknown example: {example}. Use: bell, ghz, qft, openqasm_roundtrip"}

    return results


# Run the example
if __name__ == '__main__':
    # Change 'example' to try different ones
    result = execute_skill({
        'example': 'qft',      # Try: bell, ghz, qft, openqasm_roundtrip
        'num_qubits': 4
    })
    print("\n" + "="*50)
    print("Result:", result)
```

## Quick Reference

### Available Gates (MicroQiskit)
| Gate | Syntax | Description |
|------|--------|-------------|
| H | `qc.h(q)` | Hadamard (superposition) |
| X | `qc.x(q)` | Pauli-X (NOT gate) |
| Y | `qc.y(q)` | Pauli-Y |
| Z | `qc.z(q)` | Pauli-Z (phase flip) |
| RX | `qc.rx(θ, q)` | Rotation around X |
| RY | `qc.ry(θ, q)` | Rotation around Y |
| RZ | `qc.rz(θ, q)` | Rotation around Z |
| CX | `qc.cx(c, t)` | CNOT (controlled-NOT) |

### OpenQASM Operations
```python
# Export to OpenQASM
qasm_string = circuit.qasm()

# Import from OpenQASM
circuit = QuantumCircuit.from_qasm_str(qasm_string)

# Create QFT circuit
qft = create_qft(4, do_swaps=True, approximation_degree=0)

# Analyze quantum state
sv = Statevector.from_instruction(circuit)
probs = sv.probabilities()
phases = sv.phases()
```

### Performance Limits (Browser)
- **Max qubits**: ~10 (memory: 2^n amplitudes)
- **Max gates**: ~100 for responsive execution
- **Timeout**: 30 seconds default
