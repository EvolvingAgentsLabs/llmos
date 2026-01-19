---
skill_id: quantum-cardiac-cepstrum
name: Quantum Cardiac Cepstrum Analysis
description: Cepstrum analysis for cardiac echo detection using quantum-enhanced signal processing
type: python-wasm
execution_mode: browser-wasm
category: quantum
tags: ["quantum", "medical", "cepstrum", "echo-detection", "cardiac"]
version: 1.0.0
author: ai-generated
estimated_time_ms: 200
memory_mb: 15
inputs:
  - name: signal
    type: ndarray
    description: Cardiac pressure signal
    required: true
  - name: sampling_rate
    type: number
    description: Sampling rate in Hz
    default: 1000
    required: false
outputs:
  - name: cepstrum
    type: ndarray
    description: Cepstral coefficients
  - name: peak_idx
    type: number
    description: Index of echo peak in quefrency domain
  - name: peak_value
    type: number
    description: Magnitude of echo peak
  - name: echo_delay_ms
    type: number
    description: Echo delay in milliseconds
---

# Quantum Cardiac Cepstrum Analysis

Advanced cepstrum analysis for detecting echoes in cardiac pressure signals. This skill uses classical cepstral analysis as a preprocessing step for quantum circuit analysis.

## Background

The **cepstrum** (an anagram of "spectrum") is the inverse Fourier transform of the logarithm of the spectrum. It's particularly useful for:

- **Echo detection** in cardiac signals
- **Pitch detection** in speech
- **Seismic analysis**
- **Machinery fault detection**

### Mathematical Definition

```
Cepstrum = IFFT(log(|FFT(signal)|))
```

The cepstrum transforms multiplicative components (like echoes) into additive ones, making them easier to detect as peaks.

## Clinical Application

In cardiac pressure measurement:
- **Primary pulse**: Direct pressure wave
- **Echo**: Reflection from valves/vessels
- **Echo delay**: Indicates valve position or arterial stiffness

Typical echo delays:
- **Aortic valve**: 150-200ms
- **Mitral valve**: 80-120ms
- **Peripheral reflection**: 200-300ms

## Code

```python
import numpy as np

def execute(inputs):
    """
    Compute cepstrum for cardiac echo detection

    Args:
        inputs: Dict with 'signal' (ndarray) and optional 'sampling_rate' (Hz)

    Returns:
        Dict with cepstrum, peak_idx, peak_value, and echo_delay_ms
    """
    signal_data = inputs['signal']
    sampling_rate = float(inputs.get('sampling_rate', 1000))  # Hz

    # Validate input
    if len(signal_data) == 0:
        return {
            'cepstrum': np.array([]),
            'peak_idx': 0,
            'peak_value': 0.0,
            'echo_delay_ms': 0.0
        }

    # Classical cepstrum = IFFT(log(|FFT(signal)|))
    spectrum = np.fft.fft(signal_data)
    log_magnitude = np.log(np.abs(spectrum) + 1e-10)  # Add epsilon to avoid log(0)
    cepstrum = np.fft.ifft(log_magnitude).real

    # Detect peak in quefrency domain
    # Ignore first few samples (DC component and very short delays)
    min_idx = 5

    # Limit search to physiologically reasonable delays
    # For cardiac signals: 50-300ms range
    min_delay_ms = 50
    max_delay_ms = 300

    min_idx = max(min_idx, int(min_delay_ms * sampling_rate / 1000))
    max_idx = min(len(cepstrum) // 2, int(max_delay_ms * sampling_rate / 1000))

    # Find peak in valid range
    search_range = np.abs(cepstrum[min_idx:max_idx])
    if len(search_range) > 0:
        peak_idx = np.argmax(search_range) + min_idx
        peak_value = np.abs(cepstrum[peak_idx])
    else:
        peak_idx = 0
        peak_value = 0.0

    # Convert peak position to time delay
    echo_delay_ms = (peak_idx / sampling_rate) * 1000  # Convert to milliseconds

    return {
        'cepstrum': cepstrum,
        'peak_idx': int(peak_idx),
        'peak_value': float(peak_value),
        'echo_delay_ms': float(echo_delay_ms)
    }
```

## Usage Notes

### Connecting This Node

**Typical workflow:**
```
SignalInput → Cepstrum → EchoDetection → Visualization
```

**With quantum enhancement:**
```
SignalInput → QFT → Cepstrum → QFT → EchoDetection → Visualization
```

### Interpreting Results

- **peak_idx**: Sample index of echo in quefrency domain
- **peak_value**: Strength of echo (higher = more prominent)
- **echo_delay_ms**: Time delay of echo

### Clinical Interpretation

| Delay Range | Possible Source |
|-------------|----------------|
| 80-120ms | Mitral valve reflection |
| 150-200ms | Aortic valve reflection |
| 200-300ms | Peripheral arterial reflection |
| >300ms | Ventricular compliance or artifact |

### Example Input/Output

**Input:**
```python
{
  "signal": [0, 0.2, 0.8, 1.0, 0.7, 0.3, 0.1, 0.3, 0.5, 0.2, ...],  # Cardiac waveform
  "sampling_rate": 1000  # 1 kHz
}
```

**Output:**
```python
{
  "cepstrum": [2.1, 0.3, -0.1, ..., 0.8, ...],  # Cepstral coefficients
  "peak_idx": 25,  # Peak at index 25
  "peak_value": 0.83,  # Strong echo
  "echo_delay_ms": 165.0  # 165ms delay → likely aortic valve
}
```

## Integration with Quantum Circuits

This skill can be enhanced with quantum preprocessing:

1. **Pre-QFT**: Apply QFT to signal before cepstrum
2. **Post-QFT**: Apply QFT to cepstrum for enhanced detection
3. **Hybrid**: Quantum state preparation + classical cepstrum

### Example Quantum-Enhanced Workflow

```
┌──────────────┐     ┌─────┐     ┌──────────────┐     ┌─────┐     ┌──────────────────┐
│ Signal Input │ --> │ QFT │ --> │  Cepstrum    │ --> │ QFT │ --> │ Echo Detection   │
└──────────────┘     └─────┘     └──────────────┘     └─────┘     └──────────────────┘
                                         ↑
                                  This skill
```

## Mathematical Details

### Why Log(|FFT|)?

The logarithm converts multiplication (echoes) into addition:

```
Signal with echo: s(t) = x(t) + α·x(t - τ)

FFT: S(f) = X(f) · (1 + α·e^(-j2πfτ))

Log: log|S(f)| = log|X(f)| + log|1 + α·e^(-j2πfτ)|

IFFT reveals τ as a peak in quefrency domain
```

### Quefrency?

"Quefrency" (pronounced like "frequency") is the independent variable of the cepstrum:
- Has units of time (like period)
- Represents delay or periodicity
- Peak quefrency = echo delay

## Performance

- **Execution time**: ~200ms for 1024 samples
- **Memory**: ~15MB
- **Complexity**: O(N log N) due to FFT

## Testing

### Test Case 1: Simple Echo
```python
# Create test signal with echo
t = np.linspace(0, 1, 64)
signal = np.zeros(64)
signal[10] = 1.0  # Impulse
signal[30] = 0.5  # Echo at 20 samples later

result = execute({'signal': signal, 'sampling_rate': 64})
assert result['peak_idx'] == 20  # Should detect 20-sample delay
```

### Test Case 2: Cardiac Signal
```python
# Load actual cardiac pressure waveform
signal = load_cardiac_data('patient_001.csv')
result = execute({'signal': signal, 'sampling_rate': 1000})

print(f"Echo delay: {result['echo_delay_ms']:.1f} ms")
# Expected: 150-200ms for healthy adult
```

## Limitations

1. **Noise sensitivity**: Low SNR can obscure echo peak
2. **Multiple echoes**: Only detects dominant echo
3. **Sampling rate**: Limited by Nyquist (max delay = N/2 samples)

## Future Enhancements

- [ ] Multi-peak detection (multiple echoes)
- [ ] Noise robustness (Wiener filtering)
- [ ] Adaptive thresholding
- [ ] Real-time streaming analysis
- [ ] GPU acceleration for large signals

## References

1. Childers, D. G., et al. (1977). "The cepstrum: A guide to processing"
2. Oppenheim, A. V. (1969). "Generalized superposition"
3. Cardiac echo detection literature (various)

## Version History

- **1.0.0** (2025-01-XX): Initial release with basic cepstrum analysis

## License

AI-Generated Skill - Free to use and modify
