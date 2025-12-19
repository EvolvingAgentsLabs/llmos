/**
 * Quantum Skill Creator
 *
 * Creates quantum circuit skills on-demand from natural language
 * Skills are saved as markdown files in /volumes/system/skills/
 */

import { SkillMetadata, generateSkillMarkdown } from './skill-parser';

export interface SkillCreationRequest {
  type: 'SignalInput' | 'QFT' | 'Hadamard' | 'Cepstrum' | 'EchoDetection' | 'Measurement' | 'Visualization';
  context?: string; // e.g., "cardiac echo detection"
}

/**
 * Create a quantum circuit skill from a request
 */
export function createQuantumSkill(request: SkillCreationRequest): {
  metadata: SkillMetadata;
  code: string;
  markdown: string;
} {
  const skillId = `quantum-${request.type.toLowerCase()}-${Date.now()}`;

  const skillConfig = getSkillConfig(request.type, request.context);

  const metadata: SkillMetadata = {
    skill_id: skillId,
    name: skillConfig.name,
    description: skillConfig.description,
    type: 'python-wasm',
    execution_mode: 'browser-wasm',
    category: 'quantum',
    tags: ['quantum', 'circuit', request.type.toLowerCase()],
    version: '1.0.0',
    author: 'ai-generated',
    estimated_time_ms: skillConfig.estimated_time_ms,
    memory_mb: skillConfig.memory_mb,
    inputs: skillConfig.inputs,
    outputs: skillConfig.outputs,
  };

  const markdown = generateSkillMarkdown(metadata, skillConfig.code, skillConfig.usageNotes);

  return {
    metadata,
    code: skillConfig.code,
    markdown,
  };
}

/**
 * Get skill configuration based on type
 */
function getSkillConfig(type: string, context?: string): {
  name: string;
  description: string;
  code: string;
  inputs: any[];
  outputs: any[];
  estimated_time_ms: number;
  memory_mb: number;
  usageNotes: string;
} {
  const configs: Record<string, any> = {
    SignalInput: {
      name: 'Signal Input',
      description: `Load and prepare input signal data${context ? ` for ${context}` : ''}`,
      estimated_time_ms: 100,
      memory_mb: 10,
      inputs: [
        { name: 'n_samples', type: 'number', description: 'Number of samples in signal', default: 64, required: true },
        { name: 'signal_type', type: 'string', description: 'Type of signal to generate', default: 'cardiac', required: false },
      ],
      outputs: [
        { name: 'signal', type: 'ndarray', description: 'Generated signal data' },
        { name: 'time', type: 'ndarray', description: 'Time array' },
      ],
      code: `import numpy as np

def execute(inputs):
    """Generate or load input signal"""
    n_samples = int(inputs.get('n_samples', 64))
    signal_type = inputs.get('signal_type', 'cardiac')

    # Create time array
    t = np.linspace(0, 1, n_samples)

    # Generate signal based on type
    if signal_type == 'cardiac':
        # Cardiac signal with echo
        signal = np.zeros(n_samples)
        pulse_width = n_samples // 8
        signal[n_samples//8:n_samples//8 + pulse_width] = 1.0

        # Add echo at 40% delay
        echo_delay = int(0.4 * n_samples)
        signal[echo_delay:min(echo_delay + pulse_width, n_samples)] += 0.3

        # Normalize
        signal = signal / np.max(signal)
    else:
        # Generic sine wave
        signal = np.sin(2 * np.pi * 2 * t)

    return {
        'signal': signal,
        'time': t,
        'n_samples': n_samples
    }`,
      usageNotes: `## Usage

Connect this node to QFT or other processing nodes.
The signal can be configured for different types (cardiac, sine, etc.).`,
    },

    QFT: {
      name: 'Quantum Fourier Transform',
      description: `Perform Quantum Fourier Transform${context ? ` for ${context}` : ''}`,
      estimated_time_ms: 500,
      memory_mb: 20,
      inputs: [
        { name: 'signal', type: 'ndarray', description: 'Input signal to transform', required: true },
        { name: 'n_qubits', type: 'number', description: 'Number of qubits', default: 4, required: false },
      ],
      outputs: [
        { name: 'spectrum', type: 'ndarray', description: 'Frequency spectrum from QFT' },
        { name: 'circuit', type: 'QuantumCircuit', description: 'Quantum circuit used' },
        { name: 'n_qubits', type: 'number', description: 'Number of qubits used' },
      ],
      code: `from qiskit import QuantumCircuit, execute
from qiskit.circuit.library import QFT
import numpy as np
from scipy import signal as sp_signal

def execute(inputs):
    """Quantum Fourier Transform"""
    input_signal = inputs['signal']
    n_qubits = int(inputs.get('n_qubits', 4))
    n_samples = 2**n_qubits

    # Resample signal to match quantum state size
    if len(input_signal) != n_samples:
        input_signal = sp_signal.resample(input_signal, n_samples)

    # Normalize signal
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

    # Measure all qubits
    qc.measure(range(n_qubits), range(n_qubits))

    # Execute circuit
    result = execute(qc, shots=1024).result()
    counts = result.get_counts()

    # Convert measurement counts to frequency spectrum
    spectrum = np.zeros(n_samples)
    for bitstring, count in counts.items():
        idx = int(bitstring, 2)
        spectrum[idx] = count

    return {
        'spectrum': spectrum,
        'circuit': qc,
        'n_qubits': n_qubits,
        'measurement_counts': counts
    }`,
      usageNotes: `## Usage

The QFT node transforms a classical signal into the quantum frequency domain.
Connect input from SignalInput node and output to visualization or further processing.

## Mathematical Background

The QFT performs: |j⟩ → (1/√N) Σ_k e^(2πijk/N) |k⟩`,
    },

    Cepstrum: {
      name: 'Cepstrum Analysis',
      description: `Classical cepstrum analysis${context ? ` for ${context}` : ''}`,
      estimated_time_ms: 200,
      memory_mb: 15,
      inputs: [
        { name: 'signal', type: 'ndarray', description: 'Input signal', required: true },
      ],
      outputs: [
        { name: 'cepstrum', type: 'ndarray', description: 'Cepstral coefficients' },
        { name: 'peak_idx', type: 'number', description: 'Index of peak (echo position)' },
        { name: 'peak_value', type: 'number', description: 'Peak magnitude' },
      ],
      code: `import numpy as np

def execute(inputs):
    """Compute cepstrum for echo detection"""
    signal_data = inputs['signal']

    # Classical cepstrum = IFFT(log(|FFT(signal)|))
    spectrum = np.fft.fft(signal_data)
    log_magnitude = np.log(np.abs(spectrum) + 1e-10)
    cepstrum = np.fft.ifft(log_magnitude).real

    # Detect peak (echo) - ignore first few samples
    min_idx = 5
    max_idx = min(30, len(cepstrum) // 2)
    search_range = np.abs(cepstrum[min_idx:max_idx])
    peak_idx = np.argmax(search_range) + min_idx
    peak_value = np.abs(cepstrum[peak_idx])

    return {
        'cepstrum': cepstrum,
        'peak_idx': int(peak_idx),
        'peak_value': float(peak_value)
    }`,
      usageNotes: `## Usage

Cepstrum analysis detects echoes and periodic components in signals.
The peak position indicates the delay of the echo.

## Theory

Cepstrum = IFFT(log(|FFT(signal)|))
Used in speech processing, echo detection, and pitch estimation.`,
    },

    EchoDetection: {
      name: 'Echo Detection',
      description: `Detect and analyze echoes${context ? ` in ${context}` : ''}`,
      estimated_time_ms: 150,
      memory_mb: 10,
      inputs: [
        { name: 'cepstrum', type: 'ndarray', description: 'Cepstrum data', required: true },
        { name: 'threshold', type: 'number', description: 'Detection threshold', default: 0.1, required: false },
      ],
      outputs: [
        { name: 'echo_position', type: 'number', description: 'Sample index of echo' },
        { name: 'echo_strength', type: 'number', description: 'Echo magnitude' },
        { name: 'echo_delay_ms', type: 'number', description: 'Echo delay in milliseconds (assuming 1kHz sampling)' },
      ],
      code: `import numpy as np

def execute(inputs):
    """Detect echo from cepstrum"""
    cepstrum = inputs['cepstrum']
    threshold = float(inputs.get('threshold', 0.1))

    # Find peaks in cepstrum (excluding DC component)
    min_idx = 5
    max_idx = min(len(cepstrum) // 2, 30)
    search_range = np.abs(cepstrum[min_idx:max_idx])

    peak_idx = np.argmax(search_range) + min_idx
    peak_value = np.abs(cepstrum[peak_idx])

    # Calculate delay in ms (assuming 1kHz sampling rate)
    delay_ms = peak_idx * 1.0  # 1ms per sample at 1kHz

    # Check if peak exceeds threshold
    detected = peak_value > threshold

    return {
        'echo_position': int(peak_idx),
        'echo_strength': float(peak_value),
        'echo_delay_ms': float(delay_ms),
        'detected': bool(detected)
    }`,
      usageNotes: `## Usage

Connect from Cepstrum node to detect echo position and strength.
Outputs can be used for visualization or further analysis.`,
    },

    Measurement: {
      name: 'Quantum Measurement',
      description: 'Measure quantum state and collapse to classical',
      estimated_time_ms: 100,
      memory_mb: 5,
      inputs: [
        { name: 'circuit', type: 'QuantumCircuit', description: 'Quantum circuit to measure', required: false },
        { name: 'shots', type: 'number', description: 'Number of measurement shots', default: 1024, required: false },
      ],
      outputs: [
        { name: 'counts', type: 'dict', description: 'Measurement outcome counts' },
        { name: 'probabilities', type: 'dict', description: 'Normalized probabilities' },
      ],
      code: `from qiskit import execute
import numpy as np

def execute(inputs):
    """Execute and measure quantum circuit"""
    qc = inputs.get('circuit')
    shots = int(inputs.get('shots', 1024))

    if qc is None:
        # Return empty results if no circuit
        return {
            'counts': {},
            'probabilities': {}
        }

    # Execute circuit
    result = execute(qc, shots=shots).result()
    counts = result.get_counts()

    # Calculate probabilities
    probabilities = {
        state: count / shots
        for state, count in counts.items()
    }

    return {
        'counts': counts,
        'probabilities': probabilities,
        'total_shots': shots
    }`,
      usageNotes: `## Usage

Measures a quantum circuit and returns classical measurement outcomes.
Connect from QFT or other quantum nodes.`,
    },

    Visualization: {
      name: 'Signal Visualization',
      description: `Plot signal analysis results${context ? ` for ${context}` : ''}`,
      estimated_time_ms: 300,
      memory_mb: 25,
      inputs: [
        { name: 'signal', type: 'ndarray', description: 'Original signal', required: false },
        { name: 'spectrum', type: 'ndarray', description: 'Frequency spectrum', required: false },
        { name: 'cepstrum', type: 'ndarray', description: 'Cepstrum', required: false },
        { name: 'echo_position', type: 'number', description: 'Echo position', required: false },
      ],
      outputs: [
        { name: 'plot', type: 'figure', description: 'Matplotlib figure' },
      ],
      code: `import matplotlib.pyplot as plt
import numpy as np

def execute(inputs):
    """Create comprehensive visualization"""
    signal = inputs.get('signal')
    spectrum = inputs.get('spectrum')
    cepstrum = inputs.get('cepstrum')
    echo_pos = inputs.get('echo_position')

    # Determine subplot layout
    plots_needed = sum([
        signal is not None,
        spectrum is not None,
        cepstrum is not None,
    ])

    if plots_needed == 0:
        return {'plot': None}

    fig, axes = plt.subplots(2, 2, figsize=(12, 10))
    axes = axes.flatten()
    plot_idx = 0

    # Plot signal
    if signal is not None:
        axes[plot_idx].plot(signal, 'b-', linewidth=2)
        axes[plot_idx].set_title('Input Signal')
        axes[plot_idx].set_xlabel('Sample')
        axes[plot_idx].set_ylabel('Amplitude')
        axes[plot_idx].grid(True, alpha=0.3)
        plot_idx += 1

    # Plot spectrum
    if spectrum is not None:
        axes[plot_idx].bar(range(len(spectrum)), spectrum, color='purple', alpha=0.7)
        axes[plot_idx].set_title('Quantum Frequency Spectrum')
        axes[plot_idx].set_xlabel('Frequency Bin')
        axes[plot_idx].set_ylabel('Measurement Counts')
        axes[plot_idx].grid(True, alpha=0.3)
        plot_idx += 1

    # Plot cepstrum
    if cepstrum is not None:
        axes[plot_idx].plot(np.abs(cepstrum), 'g-', linewidth=2)
        axes[plot_idx].set_title('Cepstrum (Echo Detection)')
        axes[plot_idx].set_xlabel('Quefrency (samples)')
        axes[plot_idx].set_ylabel('|Cepstrum|')
        axes[plot_idx].grid(True, alpha=0.3)

        # Mark echo position if provided
        if echo_pos is not None:
            axes[plot_idx].axvline(echo_pos, color='r', linestyle='--', label=f'Echo @ {echo_pos}')
            axes[plot_idx].legend()

        plot_idx += 1

    # Hide unused subplots
    for i in range(plot_idx, 4):
        axes[i].set_visible(False)

    plt.tight_layout()
    plt.show()

    return {'plot': fig}`,
      usageNotes: `## Usage

Connects to multiple input nodes to create comprehensive visualization.
Automatically adapts layout based on available data.`,
    },
  };

  return configs[type] || configs.SignalInput;
}
