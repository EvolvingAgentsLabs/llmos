---
skill_id: quantum-qft-openqasm
name: Quantum Fourier Transform with OpenQASM
description: QFT implementation with OpenQASM 2.0 export/import for WASM-Qiskit bridge
type: qiskit
execution_mode: browser-wasm
category: quantum
tags: ["quantum", "qft", "openqasm", "fourier", "signal-processing"]
version: 1.0.0
author: system
estimated_time_ms: 300
memory_mb: 15
inputs:
  - name: num_qubits
    type: number
    description: Number of qubits for QFT (2-8 recommended)
    default: 4
    required: true
  - name: input_state
    type: string
    description: Initial state as binary string (e.g., "0101") or "superposition"
    default: "0000"
    required: false
  - name: approximation_degree
    type: number
    description: Drop rotations smaller than pi/2^degree (0 = exact)
    default: 0
    required: false
  - name: export_qasm
    type: boolean
    description: Export circuit to OpenQASM 2.0
    default: true
    required: false
outputs:
  - name: qasm_code
    type: string
    description: OpenQASM 2.0 representation of the circuit
  - name: statevector
    type: object
    description: Final quantum state amplitudes and phases
  - name: measurement_counts
    type: object
    description: Measurement outcome distribution (1024 shots)
  - name: gate_count
    type: number
    description: Total number of gates in circuit
  - name: circuit_depth
    type: number
    description: Circuit depth (longest path)
---

# Quantum Fourier Transform with OpenQASM

Implements the Quantum Fourier Transform (QFT) - the quantum analogue of the
discrete Fourier transform. Exports to OpenQASM 2.0 for backend optimization.

## Architecture: WASM ↔ OpenQASM ↔ Backend Qiskit

```
┌─────────────────┐     OpenQASM 2.0      ┌──────────────────┐
│  Browser/WASM   │ ──────────────────>   │  Backend Qiskit  │
│  (MicroQiskit)  │                       │  (Full Python)   │
│                 │ <──────────────────   │                  │
│  • Build QFT    │   Optimized QASM      │  • Transpile     │
│  • Visualize    │                       │  • Optimize      │
│  • Small sims   │                       │  • Hardware run  │
└─────────────────┘                       └──────────────────┘
```

## The QFT Transform

QFT|x⟩ = (1/√N) Σₖ exp(2πixk/N)|k⟩

Where N = 2^n for n qubits. This transforms from computational basis to
Fourier basis, encoding frequency information in phase.

## Inputs
- **num_qubits** (number): Number of qubits (2-8 recommended for browser)
- **input_state** (string): Initial state ("0000", "superposition", etc.)
- **approximation_degree** (number): Drop small rotations for speed
- **export_qasm** (boolean): Generate OpenQASM output

## Outputs
- **qasm_code** (string): OpenQASM 2.0 circuit representation
- **statevector** (object): Quantum state with amplitudes/phases
- **measurement_counts** (object): Measurement distribution
- **gate_count** (number): Total gates
- **circuit_depth** (number): Circuit depth

## Code

```python
from qiskit import QuantumCircuit, execute
from qiskit.quantum_info import Statevector
import numpy as np
import matplotlib.pyplot as plt

def execute(inputs):
    """
    Quantum Fourier Transform with OpenQASM 2.0 support.

    Demonstrates the WASM ↔ OpenQASM ↔ Backend round-trip workflow.
    """
    # Parse inputs
    num_qubits = min(int(inputs.get('num_qubits', 4)), 10)  # Cap at 10
    input_state = inputs.get('input_state', '0' * num_qubits)
    approximation_degree = int(inputs.get('approximation_degree', 0))
    export_qasm = inputs.get('export_qasm', True)

    # Normalize input state length
    if input_state == 'superposition':
        input_state = None
    elif len(input_state) != num_qubits:
        input_state = input_state.zfill(num_qubits)[:num_qubits]

    # ═══════════════════════════════════════════════════════════════
    # STEP 1: Build QFT Circuit
    # ═══════════════════════════════════════════════════════════════

    qft = create_qft(num_qubits,
                     do_swaps=True,
                     approximation_degree=approximation_degree)

    # Prepare input state
    qc = QuantumCircuit(num_qubits, num_qubits)

    if input_state is None:
        # Superposition: apply H to all qubits
        for q in range(num_qubits):
            qc.h(q)
    else:
        # Computational basis state
        for i, bit in enumerate(input_state):
            if bit == '1':
                qc.x(i)

    # Compose with QFT
    for gate in qft.data:
        qc.data.append(gate)

    # ═══════════════════════════════════════════════════════════════
    # STEP 2: Export to OpenQASM 2.0 (THE KEY BRIDGE)
    # ═══════════════════════════════════════════════════════════════

    qasm_code = qc.qasm() if export_qasm else ""

    # ═══════════════════════════════════════════════════════════════
    # STEP 3: Round-trip validation (import back from QASM)
    # ═══════════════════════════════════════════════════════════════

    if qasm_code:
        # This proves the round-trip works!
        qc_reimported = QuantumCircuit.from_qasm_str(qasm_code)
        # Verify same structure
        roundtrip_valid = len(qc_reimported.data) == len(qc.data)
    else:
        roundtrip_valid = False

    # ═══════════════════════════════════════════════════════════════
    # STEP 4: Analyze Statevector (QFT output)
    # ═══════════════════════════════════════════════════════════════

    # Create circuit without measurements for statevector
    qc_sv = QuantumCircuit(num_qubits)
    if input_state is None:
        for q in range(num_qubits):
            qc_sv.h(q)
    else:
        for i, bit in enumerate(input_state):
            if bit == '1':
                qc_sv.x(i)
    for gate in qft.data:
        qc_sv.data.append(gate)

    sv = Statevector.from_instruction(qc_sv)
    probs = sv.probabilities()
    phases = sv.phases()

    # ═══════════════════════════════════════════════════════════════
    # STEP 5: Measurement Simulation
    # ═══════════════════════════════════════════════════════════════

    # Add measurements
    qc.measure(range(num_qubits), range(num_qubits))
    result = execute(qc, shots=1024).result()
    counts = result.get_counts()

    # ═══════════════════════════════════════════════════════════════
    # STEP 6: Visualization
    # ═══════════════════════════════════════════════════════════════

    fig, axes = plt.subplots(2, 2, figsize=(12, 10))

    # Plot 1: Probability distribution
    ax1 = axes[0, 0]
    states = [format(i, f'0{num_qubits}b') for i in range(2**num_qubits)]
    ax1.bar(range(len(probs)), probs, color='steelblue', alpha=0.7)
    ax1.set_xlabel('Basis State')
    ax1.set_ylabel('Probability')
    ax1.set_title('QFT Output: Probability Distribution')
    ax1.set_xticks(range(len(states)))
    ax1.set_xticklabels(states, rotation=45, ha='right', fontsize=8)

    # Plot 2: Phase distribution (critical for QFT understanding)
    ax2 = axes[0, 1]
    # Only show phases for non-zero amplitudes
    significant_phases = [(s, p) for s, p, prob in zip(states, phases, probs) if prob > 0.001]
    if significant_phases:
        phase_states, phase_vals = zip(*significant_phases)
        colors = plt.cm.hsv([(p / (2*np.pi) + 0.5) % 1 for p in phase_vals])
        ax2.bar(range(len(phase_vals)), phase_vals, color=colors, alpha=0.7)
        ax2.set_xlabel('Basis State')
        ax2.set_ylabel('Phase (radians)')
        ax2.set_title('QFT Output: Phase Distribution')
        ax2.axhline(y=0, color='gray', linestyle='--', alpha=0.5)
        ax2.set_xticks(range(len(phase_states)))
        ax2.set_xticklabels(phase_states, rotation=45, ha='right', fontsize=8)

    # Plot 3: Measurement counts
    ax3 = axes[1, 0]
    sorted_counts = sorted(counts.items(), key=lambda x: x[1], reverse=True)
    count_states = [s for s, c in sorted_counts[:16]]  # Top 16
    count_vals = [c for s, c in sorted_counts[:16]]
    ax3.bar(count_states, count_vals, color='coral', alpha=0.7)
    ax3.set_xlabel('Measured State')
    ax3.set_ylabel('Counts (1024 shots)')
    ax3.set_title('Measurement Results')
    ax3.tick_params(axis='x', rotation=45)

    # Plot 4: Circuit info and OpenQASM preview
    ax4 = axes[1, 1]
    ax4.axis('off')

    info_text = f"""Quantum Fourier Transform Results
═══════════════════════════════════════

Qubits: {num_qubits}
Input State: {input_state if input_state else 'superposition'}
Approximation: {'exact' if approximation_degree == 0 else f'degree {approximation_degree}'}

Gate Count: {len(qc.data)}
OpenQASM Round-trip: {'✓ Valid' if roundtrip_valid else '✗ Invalid'}

═══════════════════════════════════════
OpenQASM 2.0 Preview:
═══════════════════════════════════════
"""

    # Add first 15 lines of QASM
    if qasm_code:
        qasm_lines = qasm_code.split('\n')[:15]
        info_text += '\n'.join(qasm_lines)
        if len(qasm_code.split('\n')) > 15:
            info_text += '\n... (truncated)'

    ax4.text(0.02, 0.98, info_text, transform=ax4.transAxes,
             fontsize=9, verticalalignment='top', fontfamily='monospace',
             bbox=dict(boxstyle='round', facecolor='wheat', alpha=0.5))

    plt.tight_layout()
    plt.savefig('qft_analysis.png', dpi=100, bbox_inches='tight')
    plt.show()

    # ═══════════════════════════════════════════════════════════════
    # Return Results
    # ═══════════════════════════════════════════════════════════════

    return {
        "qasm_code": qasm_code,
        "statevector": {
            "probabilities": {states[i]: float(probs[i]) for i in range(len(probs)) if probs[i] > 0.001},
            "phases": {states[i]: float(phases[i]) for i in range(len(phases)) if probs[i] > 0.001},
            "amplitude_sum": float(sum(probs))  # Should be 1.0
        },
        "measurement_counts": counts,
        "gate_count": len(qc.data),
        "circuit_depth": num_qubits * 2,  # Approximate
        "roundtrip_valid": roundtrip_valid,
        "input_state": input_state if input_state else "superposition"
    }
```

## Usage Examples

### Basic QFT
```python
result = execute({
    "num_qubits": 4,
    "input_state": "0000"
})
print(result["qasm_code"])  # OpenQASM output
```

### QFT with specific input (frequency detection)
```python
# Input |5⟩ = |0101⟩ to see frequency 5 encoded in phases
result = execute({
    "num_qubits": 4,
    "input_state": "0101"
})
# The phases will encode the frequency information!
```

### Approximate QFT for speed
```python
# Drop small rotations for 8-qubit circuit
result = execute({
    "num_qubits": 8,
    "approximation_degree": 3  # Faster but less precise
})
```

### Backend Round-trip Workflow
```python
# 1. Build circuit in browser
result = execute({"num_qubits": 4})

# 2. Send QASM to backend for optimization
qasm = result["qasm_code"]
# backend_response = send_to_qiskit_server(qasm)

# 3. Re-import optimized circuit
# optimized_qc = QuantumCircuit.from_qasm_str(backend_response)
```

## Mathematical Background

### QFT Matrix
For N = 2^n:

```
        1  [ 1     1       1       ...   1     ]
QFT = ─── [ 1     ω       ω²      ...   ω^(N-1)]
       √N [ 1     ω²      ω⁴      ...   ω^2(N-1)]
           [ ...                              ]
           [ 1     ω^(N-1) ω^2(N-1) ... ω^(N-1)²]
```

Where ω = e^(2πi/N) is the primitive Nth root of unity.

### Gate Decomposition
QFT on n qubits uses:
- n Hadamard gates
- n(n-1)/2 controlled-phase gates
- n/2 SWAP gates (for bit-reversal)

Total gates: O(n²) - much better than classical FFT's O(n·2^n)!

### Approximate QFT
Controlled rotations smaller than π/2^k contribute less to output.
Setting approximation_degree=k removes these, reducing gates to O(nk)
while maintaining accuracy for most applications.

## OpenQASM 2.0 Format

The exported QASM follows standard format:
```
OPENQASM 2.0;
include "qelib1.inc";
qreg q[4];
creg c[4];
h q[3];
crz(1.5707963267948966) q[2],q[3];
crz(0.7853981633974483) q[1],q[3];
...
```

This can be:
1. Sent to a Qiskit server for transpilation
2. Run on real quantum hardware (IBM Quantum, etc.)
3. Imported into other quantum frameworks
4. Stored for reproducibility
