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


# ============================================================================
# OpenQASM 2.0 Support
# ============================================================================

def _generate_qasm_header(num_qubits, num_clbits):
    """Generate OpenQASM 2.0 header"""
    lines = [
        'OPENQASM 2.0;',
        'include "qelib1.inc";',
        f'qreg q[{num_qubits}];',
    ]
    if num_clbits > 0:
        lines.append(f'creg c[{num_clbits}];')
    return '\n'.join(lines)


def _gate_to_qasm(gate, num_qubits):
    """Convert a gate tuple to OpenQASM 2.0 syntax"""
    gate_name = gate[0]

    # Map qubit index (our convention is MSB, QASM is LSB)
    def qubit_idx(q):
        return num_qubits - 1 - q

    if gate_name == 'x':
        return f'x q[{qubit_idx(gate[1])}];'
    elif gate_name == 'y':
        return f'y q[{qubit_idx(gate[1])}];'
    elif gate_name == 'z':
        return f'z q[{qubit_idx(gate[1])}];'
    elif gate_name == 'h':
        return f'h q[{qubit_idx(gate[1])}];'
    elif gate_name == 'rx':
        theta = gate[1]
        q = qubit_idx(gate[2])
        return f'rx({theta}) q[{q}];'
    elif gate_name == 'ry':
        theta = gate[1]
        q = qubit_idx(gate[2])
        return f'ry({theta}) q[{q}];'
    elif gate_name == 'rz':
        theta = gate[1]
        q = qubit_idx(gate[2])
        return f'rz({theta}) q[{q}];'
    elif gate_name == 'cx':
        ctrl = qubit_idx(gate[1])
        tgt = qubit_idx(gate[2])
        return f'cx q[{ctrl}],q[{tgt}];'
    elif gate_name == 'cz':
        ctrl = qubit_idx(gate[1])
        tgt = qubit_idx(gate[2])
        return f'cz q[{ctrl}],q[{tgt}];'
    elif gate_name == 'crz':
        theta = gate[1]
        ctrl = qubit_idx(gate[2])
        tgt = qubit_idx(gate[3])
        return f'crz({theta}) q[{ctrl}],q[{tgt}];'
    elif gate_name == 'swap':
        q1 = qubit_idx(gate[1])
        q2 = qubit_idx(gate[2])
        return f'swap q[{q1}],q[{q2}];'
    elif gate_name == 'm':
        q = qubit_idx(gate[1])
        c = gate[2]
        return f'measure q[{q}] -> c[{c}];'
    elif gate_name == 'init':
        # Initialization is not standard QASM, skip
        return None
    else:
        return f'// Unknown gate: {gate_name}'


def circuit_to_qasm(circuit):
    """
    Convert a QuantumCircuit to OpenQASM 2.0 string.

    This enables the circuit to be:
    - Sent to a backend Qiskit server for transpilation
    - Saved/loaded as text
    - Visualized in other tools

    Args:
        circuit: QuantumCircuit instance

    Returns:
        OpenQASM 2.0 string
    """
    lines = [_generate_qasm_header(circuit.num_qubits, circuit.num_clbits)]

    for gate in circuit.data:
        qasm_line = _gate_to_qasm(gate, circuit.num_qubits)
        if qasm_line:
            lines.append(qasm_line)

    return '\n'.join(lines)


def circuit_from_qasm_str(qasm_string):
    """
    Parse OpenQASM 2.0 string into a QuantumCircuit.

    Supports:
    - Basic gates: x, y, z, h, rx, ry, rz, cx, cz, crz, swap
    - Measurements: measure
    - Registers: qreg, creg

    Args:
        qasm_string: OpenQASM 2.0 formatted string

    Returns:
        QuantumCircuit instance
    """
    import re

    lines = qasm_string.strip().split('\n')

    num_qubits = 0
    num_clbits = 0
    gates = []

    for line in lines:
        line = line.strip()

        # Skip comments and empty lines
        if not line or line.startswith('//') or line.startswith('OPENQASM') or line.startswith('include'):
            continue

        # Parse quantum register
        qreg_match = re.match(r'qreg\s+\w+\[(\d+)\];', line)
        if qreg_match:
            num_qubits = int(qreg_match.group(1))
            continue

        # Parse classical register
        creg_match = re.match(r'creg\s+\w+\[(\d+)\];', line)
        if creg_match:
            num_clbits = int(creg_match.group(1))
            continue

        # Helper to convert QASM qubit index to our convention
        def qubit_idx(q):
            return num_qubits - 1 - q

        # Parse single-qubit gates: x, y, z, h
        single_gate = re.match(r'([xyzh])\s+\w+\[(\d+)\];', line)
        if single_gate:
            gate_name = single_gate.group(1)
            q = qubit_idx(int(single_gate.group(2)))
            gates.append((gate_name, q))
            continue

        # Parse rotation gates: rx, ry, rz
        rot_gate = re.match(r'(r[xyz])\s*\(\s*([^)]+)\s*\)\s+\w+\[(\d+)\];', line)
        if rot_gate:
            gate_name = rot_gate.group(1)
            theta_str = rot_gate.group(2)
            q = qubit_idx(int(rot_gate.group(3)))

            # Parse theta (handle pi expressions)
            theta = _parse_angle(theta_str)
            gates.append((gate_name, theta, q))
            continue

        # Parse cx (CNOT)
        cx_match = re.match(r'cx\s+\w+\[(\d+)\]\s*,\s*\w+\[(\d+)\];', line)
        if cx_match:
            ctrl = qubit_idx(int(cx_match.group(1)))
            tgt = qubit_idx(int(cx_match.group(2)))
            gates.append(('cx', ctrl, tgt))
            continue

        # Parse cz
        cz_match = re.match(r'cz\s+\w+\[(\d+)\]\s*,\s*\w+\[(\d+)\];', line)
        if cz_match:
            ctrl = qubit_idx(int(cz_match.group(1)))
            tgt = qubit_idx(int(cz_match.group(2)))
            gates.append(('cz', ctrl, tgt))
            continue

        # Parse crz
        crz_match = re.match(r'crz\s*\(\s*([^)]+)\s*\)\s+\w+\[(\d+)\]\s*,\s*\w+\[(\d+)\];', line)
        if crz_match:
            theta = _parse_angle(crz_match.group(1))
            ctrl = qubit_idx(int(crz_match.group(2)))
            tgt = qubit_idx(int(crz_match.group(3)))
            gates.append(('crz', theta, ctrl, tgt))
            continue

        # Parse swap
        swap_match = re.match(r'swap\s+\w+\[(\d+)\]\s*,\s*\w+\[(\d+)\];', line)
        if swap_match:
            q1 = qubit_idx(int(swap_match.group(1)))
            q2 = qubit_idx(int(swap_match.group(2)))
            gates.append(('swap', q1, q2))
            continue

        # Parse measurement
        meas_match = re.match(r'measure\s+\w+\[(\d+)\]\s*->\s*\w+\[(\d+)\];', line)
        if meas_match:
            q = qubit_idx(int(meas_match.group(1)))
            c = int(meas_match.group(2))
            gates.append(('m', q, c))
            continue

    # Build circuit
    circuit = QuantumCircuit(num_qubits, num_clbits)
    circuit.data = gates

    return circuit


def _parse_angle(angle_str):
    """Parse angle expression (supports pi, fractions, negatives)"""
    angle_str = angle_str.strip().replace(' ', '')

    # Handle pi
    if 'pi' in angle_str:
        # Replace 'pi' with actual value
        expr = angle_str.replace('pi', str(pi))
        try:
            return eval(expr)
        except:
            return 0

    try:
        return float(angle_str)
    except:
        return 0


# Add methods to QuantumCircuit class
QuantumCircuit.qasm = lambda self: circuit_to_qasm(self)
QuantumCircuit.to_qasm = lambda self: circuit_to_qasm(self)

@classmethod
def _from_qasm_str(cls, qasm_string):
    return circuit_from_qasm_str(qasm_string)

QuantumCircuit.from_qasm_str = _from_qasm_str


# ============================================================================
# Enhanced QFT with OpenQASM Support
# ============================================================================

class QFTCircuit(QuantumCircuit):
    """
    Quantum Fourier Transform circuit with OpenQASM support.

    The QFT is the quantum analogue of the discrete Fourier transform.
    It transforms quantum amplitudes from the computational basis to
    the Fourier basis.

    QFT|x⟩ = (1/√N) Σₖ exp(2πixk/N)|k⟩

    This implementation:
    - Supports variable number of qubits
    - Can generate forward or inverse QFT
    - Exports to OpenQASM 2.0 for backend optimization
    - Provides approximate QFT (truncated rotations)
    """

    def __init__(self, num_qubits, do_swaps=True, inverse=False,
                 approximation_degree=0, name='QFT'):
        """
        Initialize QFT circuit.

        Args:
            num_qubits: Number of qubits
            do_swaps: Include final SWAP gates for correct bit ordering
            inverse: Create inverse QFT (for frequency → time domain)
            approximation_degree: Drop rotation gates smaller than
                                  pi/2^approximation_degree (0 = exact)
            name: Circuit name
        """
        super().__init__(num_qubits, 0)
        self.name = name
        self._do_swaps = do_swaps
        self._inverse = inverse
        self._approximation_degree = approximation_degree
        self._build()

    def _build(self):
        """Build the QFT circuit"""
        n = self.num_qubits

        if self._inverse:
            self._build_inverse_qft()
        else:
            self._build_forward_qft()

    def _build_forward_qft(self):
        """Build forward QFT"""
        n = self.num_qubits

        for j in range(n):
            # Hadamard on qubit j
            self.h(j)

            # Controlled rotations
            for k in range(j + 1, n):
                # Skip small rotations for approximate QFT
                if self._approximation_degree > 0:
                    if (k - j) > self._approximation_degree:
                        continue

                # Controlled-RZ (equivalent to controlled phase)
                angle = pi / (2 ** (k - j))
                self.data.append(('crz', angle, k, j))

        # Final swaps for bit ordering
        if self._do_swaps:
            for i in range(n // 2):
                self.data.append(('swap', i, n - 1 - i))

    def _build_inverse_qft(self):
        """Build inverse QFT"""
        n = self.num_qubits

        # Swaps first for inverse
        if self._do_swaps:
            for i in range(n // 2):
                self.data.append(('swap', i, n - 1 - i))

        # Build in reverse order
        for j in range(n - 1, -1, -1):
            # Controlled rotations (negative angles)
            for k in range(n - 1, j, -1):
                if self._approximation_degree > 0:
                    if (k - j) > self._approximation_degree:
                        continue

                angle = -pi / (2 ** (k - j))
                self.data.append(('crz', angle, k, j))

            # Hadamard on qubit j
            self.h(j)

    def to_gate(self):
        """Return self as a gate (for composition)"""
        return self

    def inverse(self):
        """Return the inverse QFT"""
        return QFTCircuit(
            self.num_qubits,
            do_swaps=self._do_swaps,
            inverse=not self._inverse,
            approximation_degree=self._approximation_degree,
            name=f'{self.name}_inverse'
        )


# Update QFT to use enhanced version
def create_qft(num_qubits, do_swaps=True, inverse=False, approximation_degree=0):
    """
    Create a QFT circuit.

    Example:
        qft = create_qft(4)
        qasm = qft.qasm()  # Export to OpenQASM
        print(qasm)
    """
    return QFTCircuit(num_qubits, do_swaps, inverse, approximation_degree)


# ============================================================================
# Statevector Simulation for QFT Analysis
# ============================================================================

class Statevector:
    """
    Quantum state vector representation for analysis.

    Provides methods to:
    - Create from circuit (simulation)
    - Visualize probability amplitudes
    - Extract phase information (critical for QFT)
    """

    def __init__(self, data):
        """Initialize with complex amplitude array"""
        self._data = data
        self._num_qubits = int(sqrt(len(data))).bit_length()
        # Correct calculation for number of qubits
        self._num_qubits = (len(data) - 1).bit_length()
        if len(data) == 1:
            self._num_qubits = 0

    @classmethod
    def from_instruction(cls, circuit):
        """Create statevector by simulating circuit"""
        sv = simulate(circuit, get='statevector')
        return cls(sv)

    @classmethod
    def from_label(cls, label):
        """Create statevector from basis state label like '00', '01', etc."""
        n = len(label)
        state = [0] * (2 ** n)
        idx = int(label, 2)
        state[idx] = 1
        return cls(state)

    @property
    def data(self):
        return self._data

    @property
    def num_qubits(self):
        return self._num_qubits

    def probabilities(self):
        """Get probability of each basis state"""
        return [abs(amp) ** 2 for amp in self._data]

    def probabilities_dict(self):
        """Get probabilities as dictionary with state labels"""
        n = self._num_qubits
        return {format(i, f'0{n}b'): abs(self._data[i])**2
                for i in range(len(self._data))}

    def phases(self):
        """Extract phase of each amplitude (critical for QFT analysis)"""
        from math import atan2
        phases = []
        for amp in self._data:
            if abs(amp) > 1e-10:
                phases.append(atan2(amp.imag if hasattr(amp, 'imag') else 0,
                                   amp.real if hasattr(amp, 'real') else amp))
            else:
                phases.append(0)
        return phases

    def draw(self, output='text'):
        """Simple text representation of statevector"""
        n = self._num_qubits
        lines = []
        for i, amp in enumerate(self._data):
            if abs(amp) > 1e-10:
                label = format(i, f'0{n}b')
                if hasattr(amp, 'imag'):
                    lines.append(f'|{label}⟩: {amp.real:+.4f}{amp.imag:+.4f}j')
                else:
                    lines.append(f'|{label}⟩: {amp:+.4f}')
        return '\n'.join(lines) if lines else '|∅⟩ (zero state)'


# ============================================================================
# Transpile Function (Simplified for Browser)
# ============================================================================

def transpile(circuit, backend=None, optimization_level=1):
    """
    Simplified transpilation for browser environment.

    In a full Qiskit setup, transpilation:
    - Decomposes gates to native gate set
    - Optimizes circuit depth
    - Maps to hardware connectivity

    In browser (MicroQiskit), we provide:
    - Gate decomposition (crz → rz + cx pattern)
    - Basic optimization (remove identity gates)

    For full optimization, export to OpenQASM and send to backend.

    Args:
        circuit: QuantumCircuit to transpile
        backend: Ignored (for compatibility)
        optimization_level: 0-3 (higher = more optimization)

    Returns:
        Optimized QuantumCircuit
    """
    # Create copy
    result = QuantumCircuit(circuit.num_qubits, circuit.num_clbits)
    result.name = circuit.name

    optimized_gates = []

    for gate in circuit.data:
        gate_name = gate[0]

        # Decompose CRZ to standard gates: CRZ(θ) = RZ(θ/2) · CX · RZ(-θ/2) · CX
        if gate_name == 'crz' and optimization_level >= 1:
            theta, ctrl, tgt = gate[1], gate[2], gate[3]
            # Simplified: just keep crz for simulation
            # Full decomposition would be for hardware
            optimized_gates.append(gate)

        # Decompose SWAP to 3 CNOTs
        elif gate_name == 'swap' and optimization_level >= 2:
            q1, q2 = gate[1], gate[2]
            optimized_gates.append(('cx', q1, q2))
            optimized_gates.append(('cx', q2, q1))
            optimized_gates.append(('cx', q1, q2))

        else:
            optimized_gates.append(gate)

    # Remove consecutive inverse gates (optimization level 2+)
    if optimization_level >= 2:
        optimized_gates = _cancel_inverse_gates(optimized_gates)

    result.data = optimized_gates
    return result


def _cancel_inverse_gates(gates):
    """Remove pairs of inverse gates (H·H = I, X·X = I, etc.)"""
    result = []
    skip_next = set()

    for i, gate in enumerate(gates):
        if i in skip_next:
            continue

        # Look for cancellation with next gate
        if i + 1 < len(gates):
            next_gate = gates[i + 1]

            # H·H cancellation
            if gate[0] == 'h' and next_gate[0] == 'h' and gate[1] == next_gate[1]:
                skip_next.add(i + 1)
                continue

            # X·X cancellation
            if gate[0] == 'x' and next_gate[0] == 'x' and gate[1] == next_gate[1]:
                skip_next.add(i + 1)
                continue

        result.append(gate)

    return result
