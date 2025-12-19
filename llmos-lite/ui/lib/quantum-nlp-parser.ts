/**
 * Quantum Circuit NLP Parser
 *
 * Converts natural language descriptions into executable quantum circuit graphs
 *
 * Example:
 * "create a quantum circuit to process a cardiac pressure signal and detect echoes
 *  using two quantum fourier transforms"
 *
 * → Generates graph with nodes: SignalInput → QFT → Processing → QFT → EchoDetection
 */

import { Node, Edge } from 'reactflow';
import { createQuantumSkill } from './quantum-skill-creator';
import { ParsedSkill } from './skill-parser';

export interface CircuitParseResult {
  nodes: Node[];
  edges: Edge[];
  description: string;
  confidence: number;
  skills: ParsedSkill[]; // Generated skill markdown files
}

export interface ParsedIntent {
  operation: string;
  domain: 'quantum' | 'signal-processing' | 'medical' | 'general';
  keywords: string[];
  nodeTypes: string[];
}

/**
 * Parse natural language to extract quantum circuit intent
 */
export function parseCircuitIntent(input: string): ParsedIntent {
  const lowerInput = input.toLowerCase();

  // Extract domain
  let domain: ParsedIntent['domain'] = 'general';
  if (lowerInput.includes('quantum') || lowerInput.includes('qubit') || lowerInput.includes('superposition')) {
    domain = 'quantum';
  } else if (lowerInput.includes('signal') || lowerInput.includes('frequency') || lowerInput.includes('fourier')) {
    domain = 'signal-processing';
  } else if (lowerInput.includes('cardiac') || lowerInput.includes('medical') || lowerInput.includes('echo')) {
    domain = 'medical';
  }

  // Extract keywords
  const keywords: string[] = [];
  const keywordPatterns = [
    /quantum fourier transform|qft/gi,
    /hadamard/gi,
    /measurement/gi,
    /cepstrum/gi,
    /echo detection/gi,
    /cardiac signal/gi,
    /pressure signal/gi,
    /superposition/gi,
    /entanglement/gi,
    /vqe/gi,
    /ansatz/gi,
  ];

  keywordPatterns.forEach(pattern => {
    const matches = input.match(pattern);
    if (matches) {
      keywords.push(...matches.map(m => m.toLowerCase()));
    }
  });

  // Determine node types needed
  const nodeTypes: string[] = [];

  if (lowerInput.includes('signal') || lowerInput.includes('input')) {
    nodeTypes.push('SignalInput');
  }

  if (lowerInput.includes('qft') || lowerInput.includes('fourier transform')) {
    const count = (lowerInput.match(/qft|fourier transform/g) || []).length;
    const explicitCount = lowerInput.match(/two|2|twice|double/)?.[0];
    const qftCount = explicitCount ? 2 : count;
    for (let i = 0; i < qftCount; i++) {
      nodeTypes.push('QFT');
    }
  }

  if (lowerInput.includes('hadamard')) {
    nodeTypes.push('Hadamard');
  }

  if (lowerInput.includes('cepstrum') || lowerInput.includes('cepstral')) {
    nodeTypes.push('Cepstrum');
  }

  if (lowerInput.includes('echo detection') || lowerInput.includes('detect echo')) {
    nodeTypes.push('EchoDetection');
  }

  if (lowerInput.includes('measurement') || lowerInput.includes('measure')) {
    nodeTypes.push('Measurement');
  }

  if (lowerInput.includes('plot') || lowerInput.includes('visualize') || lowerInput.includes('display')) {
    nodeTypes.push('Visualization');
  }

  // Default nodes if none detected
  if (nodeTypes.length === 0) {
    nodeTypes.push('SignalInput', 'QFT', 'Measurement', 'Visualization');
  }

  return {
    operation: 'create_circuit',
    domain,
    keywords,
    nodeTypes,
  };
}

/**
 * Generate circuit graph from parsed intent
 * NOW USES SKILL-BASED SYSTEM: Each node is a generated .md skill
 */
export function generateCircuitGraph(intent: ParsedIntent): CircuitParseResult {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const skills: ParsedSkill[] = [];

  let yPosition = 100;
  const xPosition = 300;
  const ySpacing = 150;

  // Track previous node for edge creation
  let previousNodeId: string | null = null;

  // Context for skill generation
  const context = intent.domain === 'medical' ? 'cardiac echo detection' : undefined;

  // Generate nodes based on intent
  intent.nodeTypes.forEach((nodeType, index) => {
    const nodeId = `${nodeType.toLowerCase()}-${index + 1}`;

    // CREATE SKILL ON-DEMAND
    const skill = createQuantumSkill({
      type: nodeType as any,
      context,
    });

    skills.push(skill);

    const node: Node = {
      id: nodeId,
      type: 'quantumNode',
      position: { x: xPosition, y: yPosition },
      data: {
        label: skill.metadata.name,
        type: nodeType,
        code: skill.code,
        inputs: skill.metadata.inputs,
        outputs: skill.metadata.outputs,
        status: 'pending',
        description: skill.metadata.description,
        skillId: skill.metadata.skill_id, // Link to skill
        skillMarkdown: skill.markdown, // Store full markdown
      },
    };

    nodes.push(node);

    // Create edge from previous node
    if (previousNodeId) {
      edges.push({
        id: `e-${previousNodeId}-${nodeId}`,
        source: previousNodeId,
        target: nodeId,
        animated: false,
        style: { stroke: '#666' },
      });
    }

    previousNodeId = nodeId;
    yPosition += ySpacing;
  });

  return {
    nodes,
    edges,
    skills,
    description: `Generated ${skills.length} quantum circuit skills`,
    confidence: 0.85,
  };
}

/**
 * Get default configuration for a node type
 */
function getNodeConfig(nodeType: string): {
  label: string;
  description: string;
  defaultCode: string;
  inputs: Array<{ name: string; type: string }>;
  outputs: Array<{ name: string; type: string }>;
} {
  const configs: Record<string, any> = {
    SignalInput: {
      label: 'Signal Input',
      description: 'Load and prepare input signal data',
      inputs: [
        { name: 'n_samples', type: 'number' },
        { name: 'signal_type', type: 'string' },
      ],
      outputs: [
        { name: 'signal', type: 'ndarray' },
        { name: 'time', type: 'ndarray' },
      ],
      defaultCode: `import numpy as np

def execute(inputs):
    """Generate or load input signal"""
    n_samples = inputs.get('n_samples', 64)

    # Create time array
    t = np.linspace(0, 1, n_samples)

    # Generate cardiac signal with echo
    signal = np.zeros(n_samples)
    pulse_width = n_samples // 8
    signal[n_samples//8:n_samples//8 + pulse_width] = 1.0

    # Add echo at 40% delay
    echo_delay = int(0.4 * n_samples)
    signal[echo_delay:min(echo_delay + pulse_width, n_samples)] += 0.3

    # Normalize
    signal = signal / np.max(signal)

    return {
        'signal': signal,
        'time': t
    }`,
    },

    QFT: {
      label: 'Quantum Fourier Transform',
      description: 'Perform Quantum Fourier Transform on input data',
      inputs: [
        { name: 'signal', type: 'ndarray' },
        { name: 'n_qubits', type: 'number' },
      ],
      outputs: [
        { name: 'spectrum', type: 'ndarray' },
        { name: 'circuit', type: 'QuantumCircuit' },
      ],
      defaultCode: `from qiskit import QuantumCircuit, execute
from qiskit.circuit.library import QFT
import numpy as np
from scipy import signal as sp_signal

def execute(inputs):
    """Quantum Fourier Transform"""
    input_signal = inputs['signal']
    n_qubits = inputs.get('n_qubits', 4)
    n_samples = 2**n_qubits

    # Resample signal
    if len(input_signal) != n_samples:
        input_signal = sp_signal.resample(input_signal, n_samples)

    # Normalize
    norm = np.linalg.norm(input_signal)
    if norm > 0:
        input_signal = input_signal / norm

    # Create quantum circuit
    qc = QuantumCircuit(n_qubits, n_qubits)

    # Initialize with superposition
    for i in range(n_qubits):
        qc.h(i)

    # Apply QFT
    qft = QFT(n_qubits, do_swaps=True)
    qc.compose(qft, inplace=True)

    # Measure
    qc.measure(range(n_qubits), range(n_qubits))

    # Execute
    result = execute(qc, shots=1024).result()
    counts = result.get_counts()

    # Convert to spectrum
    spectrum = np.zeros(n_samples)
    for bitstring, count in counts.items():
        idx = int(bitstring, 2)
        spectrum[idx] = count

    return {
        'spectrum': spectrum,
        'circuit': qc,
        'n_qubits': n_qubits
    }`,
    },

    Hadamard: {
      label: 'Hadamard Gate',
      description: 'Create superposition state',
      inputs: [
        { name: 'n_qubits', type: 'number' },
      ],
      outputs: [
        { name: 'circuit', type: 'QuantumCircuit' },
      ],
      defaultCode: `from qiskit import QuantumCircuit

def execute(inputs):
    """Apply Hadamard gates"""
    n_qubits = inputs.get('n_qubits', 4)

    qc = QuantumCircuit(n_qubits)
    for i in range(n_qubits):
        qc.h(i)

    return {'circuit': qc}`,
    },

    Cepstrum: {
      label: 'Cepstrum Analysis',
      description: 'Classical cepstrum for echo detection',
      inputs: [
        { name: 'signal', type: 'ndarray' },
      ],
      outputs: [
        { name: 'cepstrum', type: 'ndarray' },
        { name: 'peak_idx', type: 'number' },
      ],
      defaultCode: `import numpy as np

def execute(inputs):
    """Compute cepstrum"""
    signal_data = inputs['signal']

    # Classical cepstrum = IFFT(log(|FFT(signal)|))
    spectrum = np.fft.fft(signal_data)
    log_magnitude = np.log(np.abs(spectrum) + 1e-10)
    cepstrum = np.fft.ifft(log_magnitude).real

    # Detect peak (echo)
    peak_idx = np.argmax(np.abs(cepstrum[5:30])) + 5

    return {
        'cepstrum': cepstrum,
        'peak_idx': peak_idx
    }`,
    },

    EchoDetection: {
      label: 'Echo Detection',
      description: 'Detect and analyze echoes in signal',
      inputs: [
        { name: 'cepstrum', type: 'ndarray' },
        { name: 'threshold', type: 'number' },
      ],
      outputs: [
        { name: 'echo_position', type: 'number' },
        { name: 'echo_strength', type: 'number' },
      ],
      defaultCode: `import numpy as np

def execute(inputs):
    """Detect echo from cepstrum"""
    cepstrum = inputs['cepstrum']
    threshold = inputs.get('threshold', 0.1)

    # Find peaks in cepstrum
    peak_idx = np.argmax(np.abs(cepstrum[5:30])) + 5
    peak_value = np.abs(cepstrum[peak_idx])

    return {
        'echo_position': peak_idx,
        'echo_strength': peak_value
    }`,
    },

    Measurement: {
      label: 'Quantum Measurement',
      description: 'Measure quantum state',
      inputs: [
        { name: 'circuit', type: 'QuantumCircuit' },
      ],
      outputs: [
        { name: 'counts', type: 'dict' },
        { name: 'result', type: 'object' },
      ],
      defaultCode: `from qiskit import execute

def execute(inputs):
    """Execute and measure circuit"""
    qc = inputs['circuit']

    result = execute(qc, shots=1024).result()
    counts = result.get_counts()

    return {
        'counts': counts,
        'result': result
    }`,
    },

    Visualization: {
      label: 'Visualization',
      description: 'Plot results and analysis',
      inputs: [
        { name: 'signal', type: 'ndarray' },
        { name: 'spectrum', type: 'ndarray' },
        { name: 'cepstrum', type: 'ndarray' },
      ],
      outputs: [
        { name: 'plot', type: 'figure' },
      ],
      defaultCode: `import matplotlib.pyplot as plt
import numpy as np

def execute(inputs):
    """Create visualization"""
    signal = inputs.get('signal')
    spectrum = inputs.get('spectrum')
    cepstrum = inputs.get('cepstrum')

    fig, axes = plt.subplots(2, 2, figsize=(12, 10))

    # Plot signal
    if signal is not None:
        axes[0, 0].plot(signal)
        axes[0, 0].set_title('Input Signal')
        axes[0, 0].set_xlabel('Sample')
        axes[0, 0].set_ylabel('Amplitude')

    # Plot spectrum
    if spectrum is not None:
        axes[0, 1].bar(range(len(spectrum)), spectrum)
        axes[0, 1].set_title('Quantum Spectrum')
        axes[0, 1].set_xlabel('Frequency Bin')
        axes[0, 1].set_ylabel('Counts')

    # Plot cepstrum
    if cepstrum is not None:
        axes[1, 0].plot(np.abs(cepstrum))
        axes[1, 0].set_title('Cepstrum')
        axes[1, 0].set_xlabel('Quefrency')
        axes[1, 0].set_ylabel('Magnitude')

    plt.tight_layout()
    plt.show()

    return {'plot': fig}`,
    },
  };

  return configs[nodeType] || {
    label: nodeType,
    description: 'Custom node',
    inputs: [],
    outputs: [],
    defaultCode: 'def execute(inputs):\n    return {}',
  };
}

/**
 * Main entry point: Parse natural language and generate circuit
 */
export function parseNaturalLanguageToCircuit(input: string): CircuitParseResult {
  const intent = parseCircuitIntent(input);
  return generateCircuitGraph(intent);
}
