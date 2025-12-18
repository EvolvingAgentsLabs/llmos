"""
MicroQiskit - Lightweight Quantum Circuit Simulator for Browser
Based on qiskit-community/MicroQiskit
Optimized for Pyodide/WebAssembly execution
"""

import random
from math import cos, sin, pi, sqrt

r2 = 0.70710678118  # 1/sqrt(2)


class QuantumCircuit:
    """
    Simplified quantum circuit implementation compatible with Pyodide.

    Supports gates: x, y, z, h, rx, ry, rz, cx (CNOT)
    Compatible with basic Qiskit circuit API
    """

    def __init__(self, n, m=0):
        """
        Initialize quantum circuit.

        Args:
            n: Number of qubits
            m: Number of classical bits (for measurements)
        """
        self.num_qubits = n
        self.num_clbits = m
        self.name = ''
        self.data = []

    def __add__(self, other):
        """Combine two circuits"""
        result = QuantumCircuit(
            max(self.num_qubits, other.num_qubits),
            max(self.num_clbits, other.num_clbits)
        )
        result.data = self.data + other.data
        result.name = self.name
        return result

    def initialize(self, state_vector):
        """Initialize circuit with custom state vector"""
        self.data = []
        self.data.append(('init', [e for e in state_vector]))

    def x(self, q):
        """Pauli X gate (NOT gate)"""
        self.data.append(('x', q))

    def y(self, q):
        """Pauli Y gate"""
        self.data.append(('y', q))

    def z(self, q):
        """Pauli Z gate"""
        self.data.append(('z', q))

    def h(self, q):
        """Hadamard gate"""
        self.data.append(('h', q))

    def rx(self, theta, q):
        """Rotation around X-axis"""
        self.data.append(('rx', theta, q))

    def ry(self, theta, q):
        """Rotation around Y-axis"""
        self.data.append(('ry', theta, q))

    def rz(self, theta, q):
        """Rotation around Z-axis"""
        self.data.append(('rz', theta, q))

    def cx(self, control, target):
        """Controlled-NOT (CNOT) gate"""
        self.data.append(('cx', control, target))

    def measure(self, q, b):
        """Measure qubit q into classical bit b"""
        assert b < self.num_clbits, 'Classical bit index out of range'
        assert q < self.num_qubits, 'Qubit index out of range'
        self.data.append(('m', q, b))

    def measure_all(self):
        """Measure all qubits"""
        self.num_clbits = max(self.num_clbits, self.num_qubits)
        for q in range(self.num_qubits):
            self.measure(q, q)


def simulate(circuit, shots=1024, get='counts'):
    """
    Simulate quantum circuit.

    Args:
        circuit: QuantumCircuit to simulate
        shots: Number of measurement shots
        get: 'counts' for measurement counts, 'statevector' for state vector,
             'memory' for individual shot results

    Returns:
        Dictionary with simulation results
    """
    n = circuit.num_qubits

    # Initialize state vector: |00...0⟩
    state = [0] * (2 ** n)
    state[0] = 1

    # Check if there's an initialization
    for gate in circuit.data:
        if gate[0] == 'init':
            state = gate[1]
            break

    # Apply gates
    for gate in circuit.data:
        if gate[0] == 'init':
            continue
        elif gate[0] == 'x':
            state = _apply_x(state, gate[1], n)
        elif gate[0] == 'y':
            state = _apply_y(state, gate[1], n)
        elif gate[0] == 'z':
            state = _apply_z(state, gate[1], n)
        elif gate[0] == 'h':
            state = _apply_h(state, gate[1], n)
        elif gate[0] == 'rx':
            state = _apply_rx(state, gate[1], gate[2], n)
        elif gate[0] == 'ry':
            state = _apply_ry(state, gate[1], gate[2], n)
        elif gate[0] == 'rz':
            state = _apply_rz(state, gate[1], gate[2], n)
        elif gate[0] == 'cx':
            state = _apply_cx(state, gate[1], gate[2], n)

    if get == 'statevector':
        return state

    # Perform measurements
    counts = {}
    memory = []

    for _ in range(shots):
        # Calculate probabilities
        probs = [abs(amp) ** 2 for amp in state]

        # Sample from probability distribution
        rand = random.random()
        cumulative = 0
        outcome = 0

        for i, prob in enumerate(probs):
            cumulative += prob
            if rand < cumulative:
                outcome = i
                break

        # Convert to binary string
        outcome_str = format(outcome, f'0{n}b')

        # Apply measurement gates if specified
        measured = outcome_str
        if any(gate[0] == 'm' for gate in circuit.data):
            # Handle partial measurements
            bits = ['0'] * circuit.num_clbits
            for gate in circuit.data:
                if gate[0] == 'm':
                    q, b = gate[1], gate[2]
                    bits[b] = outcome_str[n - 1 - q]
            measured = ''.join(reversed(bits))

        # Store results
        memory.append(measured)
        counts[measured] = counts.get(measured, 0) + 1

    if get == 'counts':
        return counts
    elif get == 'memory':
        return memory
    else:
        return {'counts': counts, 'statevector': state, 'memory': memory}


# Gate implementations

def _apply_x(state, q, n):
    """Apply X gate to qubit q"""
    new_state = state[:]
    for i in range(2 ** n):
        if _get_bit(i, q):
            j = i - (1 << (n - 1 - q))
        else:
            j = i + (1 << (n - 1 - q))
        new_state[i] = state[j]
    return new_state


def _apply_y(state, q, n):
    """Apply Y gate to qubit q"""
    new_state = [0] * (2 ** n)
    for i in range(2 ** n):
        if _get_bit(i, q):
            j = i - (1 << (n - 1 - q))
            new_state[i] = -1j * state[j]
        else:
            j = i + (1 << (n - 1 - q))
            new_state[i] = 1j * state[j]
    return new_state


def _apply_z(state, q, n):
    """Apply Z gate to qubit q"""
    new_state = state[:]
    for i in range(2 ** n):
        if _get_bit(i, q):
            new_state[i] = -state[i]
    return new_state


def _apply_h(state, q, n):
    """Apply Hadamard gate to qubit q"""
    new_state = [0] * (2 ** n)
    for i in range(2 ** n):
        if _get_bit(i, q):
            j = i - (1 << (n - 1 - q))
        else:
            j = i + (1 << (n - 1 - q))
        new_state[i] = r2 * (state[j] + (1 if _get_bit(i, q) else -1) * state[i])
    return new_state


def _apply_rx(state, theta, q, n):
    """Apply RX rotation gate"""
    new_state = [0] * (2 ** n)
    c = cos(theta / 2)
    s = sin(theta / 2)

    for i in range(2 ** n):
        if _get_bit(i, q):
            j = i - (1 << (n - 1 - q))
            new_state[i] = c * state[i] - 1j * s * state[j]
        else:
            j = i + (1 << (n - 1 - q))
            new_state[i] = c * state[i] - 1j * s * state[j]
    return new_state


def _apply_ry(state, theta, q, n):
    """Apply RY rotation gate"""
    new_state = [0] * (2 ** n)
    c = cos(theta / 2)
    s = sin(theta / 2)

    for i in range(2 ** n):
        if _get_bit(i, q):
            j = i - (1 << (n - 1 - q))
            new_state[i] = c * state[i] + s * state[j]
        else:
            j = i + (1 << (n - 1 - q))
            new_state[i] = c * state[i] - s * state[j]
    return new_state


def _apply_rz(state, theta, q, n):
    """Apply RZ rotation gate"""
    new_state = state[:]
    for i in range(2 ** n):
        phase = -1j * theta / 2 if _get_bit(i, q) else 1j * theta / 2
        new_state[i] = state[i] * (cos(abs(theta) / 2) + 1j * sin(abs(theta) / 2) * (1 if _get_bit(i, q) else -1))
    return new_state


def _apply_cx(state, control, target, n):
    """Apply CNOT gate"""
    new_state = state[:]
    for i in range(2 ** n):
        if _get_bit(i, control):
            # Flip target bit
            if _get_bit(i, target):
                j = i - (1 << (n - 1 - target))
            else:
                j = i + (1 << (n - 1 - target))
            new_state[i] = state[j]
    return new_state


def _get_bit(num, pos):
    """Get bit at position pos (0 is leftmost)"""
    return bool((num >> pos) & 1)


# QFT Implementation
class QFT:
    """Quantum Fourier Transform circuit"""

    def __init__(self, num_qubits, do_swaps=True, inverse=False, name='QFT'):
        self.num_qubits = num_qubits
        self.do_swaps = do_swaps
        self.inverse = inverse
        self.name = name

    def to_circuit(self):
        """Convert to QuantumCircuit"""
        qc = QuantumCircuit(self.num_qubits)

        if self.inverse:
            # Inverse QFT
            if self.do_swaps:
                for i in range(self.num_qubits // 2):
                    qc.data.append(('swap', i, self.num_qubits - 1 - i))

            for j in range(self.num_qubits - 1, -1, -1):
                for m in range(j - 1, -1, -1):
                    qc.data.append(('crz', -pi / (2 ** (j - m)), m, j))
                qc.h(j)
        else:
            # Forward QFT
            for j in range(self.num_qubits):
                qc.h(j)
                for m in range(j + 1, self.num_qubits):
                    qc.data.append(('crz', pi / (2 ** (m - j)), m, j))

            if self.do_swaps:
                for i in range(self.num_qubits // 2):
                    qc.data.append(('swap', i, self.num_qubits - 1 - i))

        return qc


# Compatibility aliases
def execute(circuit, backend=None, shots=1024):
    """Execute circuit (Qiskit-compatible interface)"""
    return {'result': lambda: {'get_counts': lambda: simulate(circuit, shots=shots, get='counts')}}


class Aer:
    """Mock Aer backend for compatibility"""
    @staticmethod
    def get_backend(name='qasm_simulator'):
        return None
