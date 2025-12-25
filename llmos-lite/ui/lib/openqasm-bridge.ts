/**
 * OpenQASM Bridge Service
 *
 * Provides the WASM (Browser) ↔ OpenQASM ↔ Backend (Qiskit) bridge
 *
 * Architecture:
 * ┌─────────────────┐     OpenQASM 2.0      ┌──────────────────┐
 * │  Browser/WASM   │ ──────────────────>   │  Backend Qiskit  │
 * │  (MicroQiskit)  │                       │  (Full Python)   │
 * │                 │ <──────────────────   │                  │
 * │  • Build QFT    │   Optimized QASM      │  • Transpile     │
 * │  • Visualize    │                       │  • Optimize      │
 * │  • Small sims   │                       │  • Hardware run  │
 * └─────────────────┘                       └──────────────────┘
 */

export interface QASMCircuit {
  qasm: string;
  numQubits: number;
  numClassicalBits: number;
  gateCount: number;
  metadata?: {
    name?: string;
    version?: string;
    description?: string;
  };
}

export interface TranspileRequest {
  qasm: string;
  optimizationLevel: 0 | 1 | 2 | 3;
  targetBasis?: string[]; // e.g., ['cx', 'u1', 'u2', 'u3']
  approximationDegree?: number;
}

export interface TranspileResponse {
  success: boolean;
  optimizedQasm?: string;
  originalGateCount: number;
  optimizedGateCount: number;
  originalDepth: number;
  optimizedDepth: number;
  error?: string;
}

export interface ExecutionRequest {
  qasm: string;
  shots: number;
  backend?: 'simulator' | 'ibmq_qasm_simulator' | 'ibmq_manila' | 'ibmq_quito';
}

export interface ExecutionResponse {
  success: boolean;
  counts?: Record<string, number>;
  statevector?: number[][];  // Complex amplitudes as [real, imag] pairs
  executionTime?: number;
  error?: string;
}

/**
 * Parse OpenQASM 2.0 to extract circuit information
 */
export function parseQASM(qasm: string): QASMCircuit {
  const lines = qasm.split('\n').filter(l => l.trim() && !l.trim().startsWith('//'));

  let numQubits = 0;
  let numClassicalBits = 0;
  let gateCount = 0;

  for (const line of lines) {
    // Extract qubit count
    const qregMatch = line.match(/qreg\s+\w+\[(\d+)\]/);
    if (qregMatch) {
      numQubits = parseInt(qregMatch[1]);
    }

    // Extract classical bit count
    const cregMatch = line.match(/creg\s+\w+\[(\d+)\]/);
    if (cregMatch) {
      numClassicalBits = parseInt(cregMatch[1]);
    }

    // Count gates (lines with operations on qubits)
    if (line.match(/\s*[a-z]+\s+(q\[|q,)/i) && !line.startsWith('qreg') && !line.startsWith('creg')) {
      gateCount++;
    }
  }

  return {
    qasm,
    numQubits,
    numClassicalBits,
    gateCount,
  };
}

/**
 * Validate OpenQASM 2.0 syntax
 */
export function validateQASM(qasm: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check header
  if (!qasm.includes('OPENQASM 2.0')) {
    errors.push('Missing OPENQASM 2.0 header');
  }

  // Check for register declarations
  if (!qasm.includes('qreg')) {
    errors.push('Missing quantum register declaration (qreg)');
  }

  // Check for balanced brackets
  const openBrackets = (qasm.match(/\[/g) || []).length;
  const closeBrackets = (qasm.match(/\]/g) || []).length;
  if (openBrackets !== closeBrackets) {
    errors.push('Unbalanced brackets');
  }

  // Check for valid gate syntax
  const gatePattern = /^(x|y|z|h|rx|ry|rz|cx|cz|crz|swap|measure)\s*(\([^)]*\))?\s+/m;
  const lines = qasm.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('//') && !trimmed.startsWith('OPENQASM') &&
        !trimmed.startsWith('include') && !trimmed.startsWith('qreg') &&
        !trimmed.startsWith('creg') && trimmed.length > 0) {
      // This should be a gate or measurement
      if (!trimmed.match(/^(x|y|z|h|rx|ry|rz|cx|cz|crz|swap|measure|barrier)/i)) {
        if (!trimmed.startsWith('//')) {
          errors.push(`Unknown instruction: ${trimmed.substring(0, 30)}...`);
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * OpenQASM Bridge client for backend communication
 */
export class OpenQASMBridge {
  private backendUrl: string;
  private apiKey?: string;

  constructor(backendUrl: string = '/api/quantum', apiKey?: string) {
    this.backendUrl = backendUrl;
    this.apiKey = apiKey;
  }

  /**
   * Transpile circuit on backend Qiskit
   */
  async transpile(request: TranspileRequest): Promise<TranspileResponse> {
    try {
      const response = await fetch(`${this.backendUrl}/transpile`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.apiKey && { 'Authorization': `Bearer ${this.apiKey}` }),
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        return {
          success: false,
          originalGateCount: 0,
          optimizedGateCount: 0,
          originalDepth: 0,
          optimizedDepth: 0,
          error: `Backend error: ${response.status}`,
        };
      }

      return await response.json();
    } catch (error) {
      return {
        success: false,
        originalGateCount: 0,
        optimizedGateCount: 0,
        originalDepth: 0,
        optimizedDepth: 0,
        error: `Network error: ${error}`,
      };
    }
  }

  /**
   * Execute circuit on backend (simulator or hardware)
   */
  async execute(request: ExecutionRequest): Promise<ExecutionResponse> {
    try {
      const response = await fetch(`${this.backendUrl}/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.apiKey && { 'Authorization': `Bearer ${this.apiKey}` }),
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        return {
          success: false,
          error: `Backend error: ${response.status}`,
        };
      }

      return await response.json();
    } catch (error) {
      return {
        success: false,
        error: `Network error: ${error}`,
      };
    }
  }

  /**
   * Check if backend is available
   */
  async isBackendAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.backendUrl}/health`, {
        method: 'GET',
        headers: {
          ...(this.apiKey && { 'Authorization': `Bearer ${this.apiKey}` }),
        },
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}

/**
 * Common QFT circuit templates in OpenQASM
 */
export const QFTTemplates = {
  /**
   * Generate QFT circuit for n qubits
   */
  generateQFT(numQubits: number, includeSwaps = true): string {
    const lines: string[] = [
      'OPENQASM 2.0;',
      'include "qelib1.inc";',
      `qreg q[${numQubits}];`,
    ];

    // QFT circuit
    for (let j = 0; j < numQubits; j++) {
      lines.push(`h q[${j}];`);
      for (let k = j + 1; k < numQubits; k++) {
        const angle = Math.PI / Math.pow(2, k - j);
        lines.push(`crz(${angle}) q[${k}],q[${j}];`);
      }
    }

    // Swap gates for bit reversal
    if (includeSwaps) {
      for (let i = 0; i < Math.floor(numQubits / 2); i++) {
        lines.push(`swap q[${i}],q[${numQubits - 1 - i}];`);
      }
    }

    return lines.join('\n');
  },

  /**
   * Generate inverse QFT circuit
   */
  generateInverseQFT(numQubits: number, includeSwaps = true): string {
    const lines: string[] = [
      'OPENQASM 2.0;',
      'include "qelib1.inc";',
      `qreg q[${numQubits}];`,
    ];

    // Swap gates first for inverse
    if (includeSwaps) {
      for (let i = 0; i < Math.floor(numQubits / 2); i++) {
        lines.push(`swap q[${i}],q[${numQubits - 1 - i}];`);
      }
    }

    // Inverse QFT (reverse order, negative angles)
    for (let j = numQubits - 1; j >= 0; j--) {
      for (let k = numQubits - 1; k > j; k--) {
        const angle = -Math.PI / Math.pow(2, k - j);
        lines.push(`crz(${angle}) q[${k}],q[${j}];`);
      }
      lines.push(`h q[${j}];`);
    }

    return lines.join('\n');
  },

  /**
   * Generate Bell state circuit
   */
  generateBellState(): string {
    return `OPENQASM 2.0;
include "qelib1.inc";
qreg q[2];
creg c[2];
h q[0];
cx q[0],q[1];
measure q[0] -> c[0];
measure q[1] -> c[1];`;
  },

  /**
   * Generate GHZ state circuit
   */
  generateGHZState(numQubits: number): string {
    const lines: string[] = [
      'OPENQASM 2.0;',
      'include "qelib1.inc";',
      `qreg q[${numQubits}];`,
      `creg c[${numQubits}];`,
      'h q[0];',
    ];

    for (let i = 0; i < numQubits - 1; i++) {
      lines.push(`cx q[${i}],q[${i + 1}];`);
    }

    for (let i = 0; i < numQubits; i++) {
      lines.push(`measure q[${i}] -> c[${i}];`);
    }

    return lines.join('\n');
  },
};

/**
 * Utility functions for working with quantum circuits
 */
export const QuantumUtils = {
  /**
   * Calculate circuit depth from QASM
   */
  calculateDepth(qasm: string): number {
    const circuit = parseQASM(qasm);
    // Simple estimation: assume sequential execution
    // Real depth would require DAG analysis
    return Math.ceil(circuit.gateCount / circuit.numQubits);
  },

  /**
   * Estimate execution time (in ms) based on gate count
   */
  estimateExecutionTime(qasm: string, backend: 'browser' | 'server' = 'browser'): number {
    const circuit = parseQASM(qasm);
    const baseTimePerGate = backend === 'browser' ? 0.1 : 0.01; // ms per gate
    const overheadPerQubit = backend === 'browser' ? 10 : 1; // ms per qubit

    return circuit.gateCount * baseTimePerGate +
           Math.pow(2, circuit.numQubits) * overheadPerQubit;
  },

  /**
   * Check if circuit can run efficiently in browser
   */
  canRunInBrowser(qasm: string): { canRun: boolean; reason?: string } {
    const circuit = parseQASM(qasm);

    if (circuit.numQubits > 10) {
      return {
        canRun: false,
        reason: `Too many qubits (${circuit.numQubits}). Browser limit is 10.`,
      };
    }

    if (circuit.gateCount > 100) {
      return {
        canRun: true,
        reason: `High gate count (${circuit.gateCount}). Performance may be slow.`,
      };
    }

    return { canRun: true };
  },

  /**
   * Format QASM for display (with syntax highlighting hints)
   */
  formatForDisplay(qasm: string): string {
    return qasm
      .split('\n')
      .map((line, i) => `${(i + 1).toString().padStart(3, ' ')} | ${line}`)
      .join('\n');
  },
};

// Default bridge instance
let defaultBridge: OpenQASMBridge | null = null;

/**
 * Get or create the default OpenQASM bridge
 */
export function getOpenQASMBridge(backendUrl?: string, apiKey?: string): OpenQASMBridge {
  if (!defaultBridge || backendUrl) {
    defaultBridge = new OpenQASMBridge(backendUrl, apiKey);
  }
  return defaultBridge;
}
