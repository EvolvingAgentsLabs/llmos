---
skill_id: quantum-solver
name: Quantum Circuit Solver
description: Solve quantum computing goals - generates and executes circuits automatically
type: qiskit
execution_mode: browser-wasm
category: quantum
tags: ["quantum", "solver", "qft", "grover", "entanglement", "openqasm"]
version: 1.0.0
author: system
estimated_time_ms: 500
memory_mb: 20
inputs:
  - name: goal
    type: string
    description: "What to achieve: entangle, superpose, qft, search, prepare, random, interfere, phase_estimate"
    required: true
  - name: num_qubits
    type: number
    description: Number of qubits (2-10)
    default: 4
  - name: target
    type: string
    description: "For search: target index. For prepare: state like '++01' or '0101'"
    default: ""
  - name: shots
    type: number
    description: Number of measurement shots
    default: 1024
outputs:
  - name: qasm
    type: string
    description: Generated OpenQASM 2.0 circuit
  - name: counts
    type: object
    description: Measurement results
  - name: statevector
    type: object
    description: Quantum state analysis
  - name: analysis
    type: string
    description: Explanation of what was achieved
---

# Quantum Circuit Solver

Automatically generates quantum circuits to achieve specified goals.
**100% browser-based** - no server required.

## Supported Goals

| Goal | Description | Example |
|------|-------------|---------|
| `entangle` | Create Bell/GHZ entangled states | `entangle(4)` → 4-qubit GHZ |
| `superpose` | Equal superposition of all states | `superpose(3)` → 8 states |
| `qft` | Quantum Fourier Transform | `qft(4)` → frequency analysis |
| `search` | Grover's amplitude amplification | `search(4, target=5)` |
| `prepare` | Prepare specific quantum state | `prepare("++01")` |
| `random` | Quantum random number generator | `random(8)` → 8-bit random |
| `interfere` | Demonstrate quantum interference | `interfere(4)` |
| `phase_estimate` | Quantum phase estimation | `phase_estimate(4)` |

## Code

```python
from qiskit import QuantumCircuit, execute
from qiskit.quantum_info import Statevector
from math import pi, sqrt
import json

def execute(inputs):
    """
    Quantum Circuit Solver - achieves quantum computing goals.
    """
    goal = inputs.get('goal', 'superpose')
    n = min(int(inputs.get('num_qubits', 4)), 10)
    target = inputs.get('target', '')
    shots = int(inputs.get('shots', 1024))

    result = {'goal': goal, 'qasm': '', 'counts': {}, 'analysis': ''}

    # ═══════════════════════════════════════════════════════════════
    # ENTANGLEMENT: Create maximally entangled states
    # ═══════════════════════════════════════════════════════════════
    if goal == 'entangle':
        qc = QuantumCircuit(n, n)
        qc.h(0)
        for i in range(n - 1):
            qc.cx(i, i + 1)

        result['analysis'] = f"""✓ Created {'Bell' if n == 2 else 'GHZ'} state with {n} qubits
State: (|{'0'*n}⟩ + |{'1'*n}⟩)/√2
Property: Maximally entangled - measuring one qubit instantly determines all others"""

    # ═══════════════════════════════════════════════════════════════
    # SUPERPOSITION: Equal probability of all computational states
    # ═══════════════════════════════════════════════════════════════
    elif goal == 'superpose':
        qc = QuantumCircuit(n, n)
        for i in range(n):
            qc.h(i)

        result['analysis'] = f"""✓ Created superposition of {2**n} states
Each state |x⟩ has probability 1/{2**n} = {1/(2**n):.6f}
This enables quantum parallelism - process all {2**n} inputs simultaneously"""

    # ═══════════════════════════════════════════════════════════════
    # QFT: Quantum Fourier Transform
    # ═══════════════════════════════════════════════════════════════
    elif goal == 'qft':
        qc = create_qft(n, do_swaps=True)
        result['analysis'] = f"""✓ Quantum Fourier Transform on {n} qubits
Transforms: computational basis → Fourier basis
Complexity: O({n**2}) gates vs classical O({n * 2**n})
Used in: Shor's algorithm, phase estimation, quantum simulation"""

    # ═══════════════════════════════════════════════════════════════
    # SEARCH: Grover's amplitude amplification
    # ═══════════════════════════════════════════════════════════════
    elif goal == 'search':
        target_idx = int(target) if target.isdigit() else 0
        target_idx = target_idx % (2**n)

        qc = QuantumCircuit(n, n)

        # Initial superposition
        for i in range(n):
            qc.h(i)

        # Grover iterations
        iterations = max(1, int(round(pi/4 * sqrt(2**n))))
        iterations = min(iterations, 5)  # Cap for performance

        for _ in range(iterations):
            # Oracle: flip phase of target
            target_bits = format(target_idx, f'0{n}b')
            for i, bit in enumerate(target_bits):
                if bit == '0':
                    qc.x(i)

            # Multi-controlled Z
            if n >= 2:
                qc.h(n-1)
                for i in range(n-1):
                    qc.data.append(('cx', i, n-1))
                qc.h(n-1)

            for i, bit in enumerate(target_bits):
                if bit == '0':
                    qc.x(i)

            # Diffusion
            for i in range(n):
                qc.h(i)
                qc.x(i)

            if n >= 2:
                qc.h(n-1)
                for i in range(n-1):
                    qc.data.append(('cx', i, n-1))
                qc.h(n-1)

            for i in range(n):
                qc.x(i)
                qc.h(i)

        result['analysis'] = f"""✓ Grover's search for |{format(target_idx, f'0{n}b')}⟩
Search space: {2**n} states
Iterations: {iterations} (optimal ≈ π/4 × √{2**n})
Speedup: O(√N) quantum vs O(N) classical"""

    # ═══════════════════════════════════════════════════════════════
    # PREPARE: Create specific quantum state
    # ═══════════════════════════════════════════════════════════════
    elif goal == 'prepare':
        state = target if target else '+' * n
        state = state[:n].ljust(n, '0')

        qc = QuantumCircuit(n, n)
        for i, s in enumerate(state):
            if s == '1':
                qc.x(i)
            elif s == '+':
                qc.h(i)
            elif s == '-':
                qc.x(i)
                qc.h(i)
            elif s == 'i':
                qc.h(i)
                qc.data.append(('rz', pi/2, i))

        result['analysis'] = f"""✓ Prepared state |{state}⟩
Encoding: 0=|0⟩, 1=|1⟩, +=|+⟩, -=|-⟩, i=|+i⟩
Ready for quantum computation"""

    # ═══════════════════════════════════════════════════════════════
    # RANDOM: True quantum random number generator
    # ═══════════════════════════════════════════════════════════════
    elif goal == 'random':
        qc = QuantumCircuit(n, n)
        for i in range(n):
            qc.h(i)

        result['analysis'] = f"""✓ Quantum Random Number Generator ({n} bits)
Range: 0 to {2**n - 1}
True randomness from quantum measurement (not pseudo-random!)
Each value has exactly 1/{2**n} probability"""

    # ═══════════════════════════════════════════════════════════════
    # INTERFERE: Demonstrate quantum interference
    # ═══════════════════════════════════════════════════════════════
    elif goal == 'interfere':
        qc = QuantumCircuit(n, n)
        for i in range(n):
            qc.h(i)
        for i in range(n):
            qc.data.append(('rz', pi * i / n, i))
        for i in range(n):
            qc.h(i)

        result['analysis'] = f"""✓ Quantum Interference on {n} qubits
1. Created superposition (all paths)
2. Added phase shifts (path differences)
3. Interfered paths (constructive/destructive)
This is THE source of quantum advantage!"""

    # ═══════════════════════════════════════════════════════════════
    # PHASE ESTIMATION
    # ═══════════════════════════════════════════════════════════════
    elif goal == 'phase_estimate':
        qc = QuantumCircuit(n, n)

        # Counting qubits
        for i in range(n - 1):
            qc.h(i)

        # Target in eigenstate
        qc.x(n - 1)

        # Controlled rotations
        for i in range(n - 1):
            for _ in range(2 ** i):
                qc.data.append(('cz', i, n - 1))

        # Inverse QFT
        inv_qft = create_qft(n - 1, inverse=True)
        for gate in inv_qft.data:
            qc.data.append(gate)

        result['analysis'] = f"""✓ Quantum Phase Estimation
Precision: {n-1} bits = ±{1/(2**n):.6f}
Estimating eigenphase of Z gate on |1⟩
Expected result encodes phase = 0.5 (since Z|1⟩ = -|1⟩ = e^(iπ)|1⟩)"""

    else:
        qc = QuantumCircuit(n, n)
        result['analysis'] = f"Unknown goal: {goal}. Try: entangle, superpose, qft, search, prepare, random, interfere, phase_estimate"

    # ═══════════════════════════════════════════════════════════════
    # Generate OpenQASM and execute
    # ═══════════════════════════════════════════════════════════════
    result['qasm'] = qc.qasm()

    # Statevector analysis
    sv = Statevector.from_instruction(qc)
    probs = sv.probabilities()
    phases_list = sv.phases()

    significant = {}
    for i, (p, ph) in enumerate(zip(probs, phases_list)):
        if p > 0.001:
            label = format(i, f'0{n}b')
            significant[label] = {'prob': round(p, 6), 'phase': round(ph, 4)}

    result['statevector'] = significant

    # Measurement
    qc_meas = QuantumCircuit(qc.num_qubits, qc.num_qubits)
    qc_meas.data = qc.data.copy()
    for i in range(qc.num_qubits):
        qc_meas.measure(i, i)

    exec_result = execute(qc_meas, shots=shots).result()
    result['counts'] = exec_result.get_counts()

    return result
```

## Usage Examples

### Entangle qubits
```python
result = execute({'goal': 'entangle', 'num_qubits': 4})
# Creates GHZ state: (|0000⟩ + |1111⟩)/√2
```

### Search with Grover's algorithm
```python
result = execute({'goal': 'search', 'num_qubits': 4, 'target': '7'})
# Amplifies probability of finding |0111⟩ (index 7)
```

### Quantum Fourier Transform
```python
result = execute({'goal': 'qft', 'num_qubits': 4})
print(result['qasm'])  # Get OpenQASM code
```

### Prepare custom state
```python
result = execute({'goal': 'prepare', 'target': '++01'})
# Creates |+⟩|+⟩|0⟩|1⟩
```

### Generate random number
```python
result = execute({'goal': 'random', 'num_qubits': 8})
# True quantum random 8-bit number
print(max(result['counts'], key=result['counts'].get))
```
