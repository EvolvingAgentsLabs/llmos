/**
 * Quantum Circuit Solver
 *
 * Generates and executes quantum circuits to achieve specified goals.
 * Runs 100% in browser using MicroQiskit + OpenQASM 2.0.
 */

import { executePython } from './pyodide-runtime';

export type QuantumGoal =
  | 'entanglement'           // Create entangled states (Bell, GHZ)
  | 'superposition'          // Create superposition states
  | 'frequency_analysis'     // QFT for frequency domain
  | 'phase_estimation'       // Estimate eigenphase
  | 'amplitude_amplification' // Grover-style amplification
  | 'state_preparation'      // Prepare specific quantum state
  | 'random_number'          // Quantum random number generation
  | 'interference'           // Demonstrate quantum interference
  | 'custom';                // Custom circuit from OpenQASM

export interface QuantumGoalParams {
  goal: QuantumGoal;
  numQubits?: number;
  targetState?: string;        // For state_preparation: "0101", "+-+", etc.
  targetAmplitudes?: number[]; // For state_preparation: amplitude array
  searchTarget?: number;       // For amplitude_amplification: target index
  qasm?: string;               // For custom: OpenQASM code
  shots?: number;
  analyze?: boolean;           // Return statevector analysis
}

export interface QuantumResult {
  success: boolean;
  goal: QuantumGoal;
  qasm: string;                // Generated OpenQASM
  counts?: Record<string, number>;
  statevector?: {
    amplitudes: Record<string, { real: number; imag: number; prob: number }>;
    phases: Record<string, number>;
  };
  analysis?: string;           // Human-readable analysis
  error?: string;
}

/**
 * Solve a quantum computing goal
 */
export async function solveQuantumGoal(params: QuantumGoalParams): Promise<QuantumResult> {
  const { goal, numQubits = 4, shots = 1024, analyze = true } = params;

  const pythonCode = generateSolverCode(params);

  try {
    const result = await executePython(pythonCode, { timeout: 60000 });

    if (!result.success) {
      return {
        success: false,
        goal,
        qasm: '',
        error: result.error || 'Execution failed',
      };
    }

    // Parse the JSON output from Python
    const output = result.stdout?.trim() || '';
    const jsonMatch = output.match(/RESULT_JSON:(.*?)(?:$|\n)/s);

    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[1]);
      return {
        success: true,
        goal,
        ...parsed,
      };
    }

    return {
      success: true,
      goal,
      qasm: '',
      analysis: output,
    };
  } catch (error) {
    return {
      success: false,
      goal,
      qasm: '',
      error: String(error),
    };
  }
}

function generateSolverCode(params: QuantumGoalParams): string {
  const { goal, numQubits = 4, shots = 1024, analyze = true } = params;

  return `
import json
from qiskit import QuantumCircuit, execute
from qiskit.quantum_info import Statevector
from math import pi, sqrt, asin
import numpy as np

def solve_quantum_goal():
    goal = "${goal}"
    n = ${numQubits}
    shots = ${shots}
    analyze = ${analyze ? 'True' : 'False'}

    result = {
        'qasm': '',
        'counts': {},
        'statevector': None,
        'analysis': ''
    }

    # ═══════════════════════════════════════════════════════════════
    # GOAL: Entanglement (Bell/GHZ states)
    # ═══════════════════════════════════════════════════════════════
    if goal == 'entanglement':
        qc = QuantumCircuit(n, n)
        qc.h(0)  # Superposition on first qubit
        for i in range(n - 1):
            qc.cx(i, i + 1)  # Entangle chain

        result['analysis'] = f"""Entanglement Circuit ({n} qubits)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Created {'Bell state' if n == 2 else 'GHZ state'}: (|{'0'*n}⟩ + |{'1'*n}⟩)/√2

Properties:
• Maximally entangled state
• Measurement collapses ALL qubits simultaneously
• Perfect correlations: all 0s or all 1s
• Violates Bell inequalities (proves quantum nature)

Applications:
• Quantum teleportation
• Superdense coding
• Quantum key distribution
• Quantum error correction"""

    # ═══════════════════════════════════════════════════════════════
    # GOAL: Superposition
    # ═══════════════════════════════════════════════════════════════
    elif goal == 'superposition':
        qc = QuantumCircuit(n, n)
        for i in range(n):
            qc.h(i)  # Hadamard on all qubits

        result['analysis'] = f"""Superposition Circuit ({n} qubits)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Created equal superposition of all {2**n} basis states.

State: |ψ⟩ = (1/√{2**n}) Σ|x⟩ for all x ∈ {{0,1}}^{n}

Each basis state has:
• Probability: 1/{2**n} = {1/(2**n):.6f}
• Amplitude: 1/√{2**n} = {1/sqrt(2**n):.6f}

Applications:
• Quantum parallelism (evaluate function on ALL inputs)
• First step of most quantum algorithms
• Grover's search initialization
• Quantum machine learning"""

    # ═══════════════════════════════════════════════════════════════
    # GOAL: Frequency Analysis (QFT)
    # ═══════════════════════════════════════════════════════════════
    elif goal == 'frequency_analysis':
        qc = create_qft(n, do_swaps=True)

        result['analysis'] = f"""Quantum Fourier Transform ({n} qubits)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
QFT transforms computational basis → Fourier basis.

Mathematical definition:
QFT|x⟩ = (1/√N) Σₖ exp(2πixk/N)|k⟩  where N = {2**n}

Key insight:
• Input: amplitude encodes TIME-domain signal
• Output: amplitude encodes FREQUENCY-domain
• Phases encode frequency information!

Complexity:
• Classical FFT: O(N log N) = O({n} × {2**n})
• Quantum QFT: O(n²) = O({n**2}) gates

Applications:
• Shor's algorithm (period finding)
• Quantum phase estimation
• Signal processing
• Quantum simulation"""

    # ═══════════════════════════════════════════════════════════════
    # GOAL: Phase Estimation
    # ═══════════════════════════════════════════════════════════════
    elif goal == 'phase_estimation':
        # Simplified QPE: estimate phase of Z gate (eigenvalue = -1, phase = π)
        qc = QuantumCircuit(n, n)

        # Counting qubits in superposition
        for i in range(n - 1):
            qc.h(i)

        # Target qubit in |1⟩ eigenstate of Z
        qc.x(n - 1)

        # Controlled-Z rotations (phase kickback)
        for i in range(n - 1):
            for _ in range(2 ** i):
                qc.data.append(('cz', i, n - 1))

        # Inverse QFT on counting qubits
        inv_qft = create_qft(n - 1, inverse=True)
        for gate in inv_qft.data:
            qc.data.append(gate)

        result['analysis'] = f"""Quantum Phase Estimation ({n} qubits)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Estimates eigenphase θ where U|ψ⟩ = e^(2πiθ)|ψ⟩

Circuit structure:
• {n-1} counting qubits (determine precision)
• 1 target qubit (in eigenstate)
• Precision: {n-1} bits = 1/{2**(n-1)} = {1/(2**(n-1)):.6f}

For this demo (Z gate on |1⟩):
• Eigenvalue: -1 = e^(iπ)
• Phase θ = 0.5 (since -1 = e^(2πi×0.5))
• Expected measurement: {'1'*(n-1)} (binary 0.111... ≈ 0.5)

Applications:
• Shor's algorithm (order finding)
• Quantum chemistry (energy estimation)
• Hamiltonian simulation"""

    # ═══════════════════════════════════════════════════════════════
    # GOAL: Amplitude Amplification (Grover-style)
    # ═══════════════════════════════════════════════════════════════
    elif goal == 'amplitude_amplification':
        target = ${params.searchTarget ?? 0}
        qc = QuantumCircuit(n, n)

        # Initial superposition
        for i in range(n):
            qc.h(i)

        # Optimal number of iterations
        num_iterations = max(1, int(round(pi/4 * sqrt(2**n))))

        for _ in range(min(num_iterations, 3)):  # Cap for browser perf
            # Oracle: mark target state with phase flip
            target_bits = format(target, f'0{n}b')
            for i, bit in enumerate(target_bits):
                if bit == '0':
                    qc.x(i)

            # Multi-controlled Z (simplified as phase on |11...1⟩)
            if n == 2:
                qc.data.append(('cz', 0, 1))
            else:
                # Use decomposition for n > 2
                qc.h(n - 1)
                for i in range(n - 1):
                    qc.data.append(('cx', i, n - 1))
                qc.h(n - 1)

            for i, bit in enumerate(target_bits):
                if bit == '0':
                    qc.x(i)

            # Diffusion operator
            for i in range(n):
                qc.h(i)
                qc.x(i)

            if n == 2:
                qc.data.append(('cz', 0, 1))
            else:
                qc.h(n - 1)
                for i in range(n - 1):
                    qc.data.append(('cx', i, n - 1))
                qc.h(n - 1)

            for i in range(n):
                qc.x(i)
                qc.h(i)

        result['analysis'] = f"""Amplitude Amplification ({n} qubits)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Grover's algorithm to find target |{format(target, f'0{n}b')}⟩

Search space: {2**n} states
Target: |{format(target, f'0{n}b')}⟩ (index {target})
Iterations: {min(num_iterations, 3)} (optimal ≈ π/4 × √N = {num_iterations})

Amplification factor:
• Initial probability: 1/{2**n} = {1/(2**n):.4f}
• After amplification: ~{min(0.99, (2*min(num_iterations,3)+1)**2 / (2**n)):.4f}

Quadratic speedup:
• Classical: O(N) = O({2**n})
• Quantum: O(√N) = O({int(sqrt(2**n))})

Applications:
• Database search
• SAT solving
• Optimization problems"""

    # ═══════════════════════════════════════════════════════════════
    # GOAL: State Preparation
    # ═══════════════════════════════════════════════════════════════
    elif goal == 'state_preparation':
        target = "${params.targetState || '+'.repeat(numQubits)}"
        qc = QuantumCircuit(n, n)

        for i, s in enumerate(target[:n]):
            if s == '1':
                qc.x(i)
            elif s == '+':
                qc.h(i)
            elif s == '-':
                qc.x(i)
                qc.h(i)
            elif s == 'i':  # |+i⟩ state
                qc.h(i)
                qc.data.append(('rz', pi/2, i))

        result['analysis'] = f"""State Preparation ({n} qubits)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Prepared state: |{target[:n]}⟩

Encoding:
• '0' → |0⟩
• '1' → |1⟩ (X gate)
• '+' → |+⟩ = (|0⟩+|1⟩)/√2 (H gate)
• '-' → |-⟩ = (|0⟩-|1⟩)/√2 (X then H)
• 'i' → |+i⟩ = (|0⟩+i|1⟩)/√2 (H then S)

This is the foundation for:
• Quantum memory initialization
• Variational quantum circuits
• Quantum machine learning inputs"""

    # ═══════════════════════════════════════════════════════════════
    # GOAL: Quantum Random Number
    # ═══════════════════════════════════════════════════════════════
    elif goal == 'random_number':
        qc = QuantumCircuit(n, n)
        for i in range(n):
            qc.h(i)  # Perfect superposition

        result['analysis'] = f"""Quantum Random Number Generator ({n} qubits)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Generates truly random {n}-bit numbers.

Why quantum randomness is special:
• NOT pseudo-random (no algorithm)
• Fundamental quantum uncertainty
• Cannot be predicted even in principle
• Certified by laws of physics

Output range: 0 to {2**n - 1}
Each value has probability exactly 1/{2**n}

Applications:
• Cryptographic key generation
• Monte Carlo simulations
• Fair lottery systems
• Quantum key distribution"""

    # ═══════════════════════════════════════════════════════════════
    # GOAL: Quantum Interference
    # ═══════════════════════════════════════════════════════════════
    elif goal == 'interference':
        qc = QuantumCircuit(n, n)
        # Create superposition
        for i in range(n):
            qc.h(i)

        # Add phase differences
        for i in range(n):
            qc.data.append(('rz', pi * i / n, i))

        # Interfere
        for i in range(n):
            qc.h(i)

        result['analysis'] = f"""Quantum Interference ({n} qubits)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Demonstrates wave-like interference of quantum amplitudes.

Process:
1. Create superposition (all paths exist)
2. Add phase shifts (path differences)
3. Interfere paths (second H gates)

Result:
• Constructive interference → high probability
• Destructive interference → low/zero probability

This is THE quantum advantage:
• Paths that lead to wrong answers cancel out
• Paths to correct answers reinforce
• Enables quantum speedups!"""

    # ═══════════════════════════════════════════════════════════════
    # GOAL: Custom (from OpenQASM)
    # ═══════════════════════════════════════════════════════════════
    elif goal == 'custom':
        qasm_input = '''${params.qasm?.replace(/'/g, "\\'")}'''
        qc = QuantumCircuit.from_qasm_str(qasm_input)
        result['analysis'] = f"Custom circuit loaded from OpenQASM ({qc.num_qubits} qubits, {len(qc.data)} gates)"

    else:
        qc = QuantumCircuit(n, n)
        result['analysis'] = f"Unknown goal: {goal}"

    # ═══════════════════════════════════════════════════════════════
    # Generate OpenQASM
    # ═══════════════════════════════════════════════════════════════
    result['qasm'] = qc.qasm()

    # ═══════════════════════════════════════════════════════════════
    # Statevector Analysis (before measurement)
    # ═══════════════════════════════════════════════════════════════
    if analyze:
        sv = Statevector.from_instruction(qc)
        probs = sv.probabilities()
        phases = sv.phases()

        amplitudes = {}
        phase_dict = {}
        for i, (p, ph) in enumerate(zip(probs, phases)):
            if p > 0.001:  # Only significant amplitudes
                label = format(i, f'0{qc.num_qubits}b')
                amp = sv.data[i]
                amplitudes[label] = {
                    'real': float(amp.real) if hasattr(amp, 'real') else float(amp),
                    'imag': float(amp.imag) if hasattr(amp, 'imag') else 0,
                    'prob': float(p)
                }
                phase_dict[label] = float(ph)

        result['statevector'] = {
            'amplitudes': amplitudes,
            'phases': phase_dict
        }

    # ═══════════════════════════════════════════════════════════════
    # Measurement
    # ═══════════════════════════════════════════════════════════════
    qc_meas = QuantumCircuit(qc.num_qubits, qc.num_qubits)
    qc_meas.data = qc.data.copy()
    for i in range(qc.num_qubits):
        qc_meas.measure(i, i)

    exec_result = execute(qc_meas, shots=shots).result()
    result['counts'] = exec_result.get_counts()

    return result

# Execute and output
result = solve_quantum_goal()
print("RESULT_JSON:" + json.dumps(result))
`;
}

/**
 * High-level quantum problem solver
 */
export const QuantumSolver = {
  /**
   * Create entangled qubits
   */
  async entangle(numQubits: number = 2): Promise<QuantumResult> {
    return solveQuantumGoal({ goal: 'entanglement', numQubits });
  },

  /**
   * Create superposition of all states
   */
  async superpose(numQubits: number = 4): Promise<QuantumResult> {
    return solveQuantumGoal({ goal: 'superposition', numQubits });
  },

  /**
   * Perform quantum Fourier transform
   */
  async qft(numQubits: number = 4): Promise<QuantumResult> {
    return solveQuantumGoal({ goal: 'frequency_analysis', numQubits });
  },

  /**
   * Search for a target state (Grover's algorithm)
   */
  async search(numQubits: number, target: number): Promise<QuantumResult> {
    return solveQuantumGoal({
      goal: 'amplitude_amplification',
      numQubits,
      searchTarget: target,
    });
  },

  /**
   * Prepare a specific quantum state
   */
  async prepare(state: string): Promise<QuantumResult> {
    return solveQuantumGoal({
      goal: 'state_preparation',
      numQubits: state.length,
      targetState: state,
    });
  },

  /**
   * Generate quantum random number
   */
  async random(bits: number = 8): Promise<QuantumResult> {
    return solveQuantumGoal({ goal: 'random_number', numQubits: bits });
  },

  /**
   * Execute custom OpenQASM circuit
   */
  async execute(qasm: string, shots: number = 1024): Promise<QuantumResult> {
    return solveQuantumGoal({ goal: 'custom', qasm, shots });
  },

  /**
   * Demonstrate quantum interference
   */
  async interfere(numQubits: number = 4): Promise<QuantumResult> {
    return solveQuantumGoal({ goal: 'interference', numQubits });
  },

  /**
   * Estimate phase (quantum phase estimation)
   */
  async estimatePhase(precision: number = 4): Promise<QuantumResult> {
    return solveQuantumGoal({ goal: 'phase_estimation', numQubits: precision + 1 });
  },
};

export default QuantumSolver;
