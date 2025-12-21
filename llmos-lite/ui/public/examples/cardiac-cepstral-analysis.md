# Cardiac Pressure Wave Cepstral Analysis

This example demonstrates cepstral analysis for detecting echoes in cardiac pressure waves using scipy and numpy (works in browser!).

## Example Code

```python
import numpy as np
import matplotlib.pyplot as plt
from scipy import signal
from scipy.fft import fft, ifft, fftfreq

# Create a realistic cardiac pressure wave with echo
def create_cardiac_pressure_signal(n_samples=512, fs=1000):
    """
    Simulate a cardiac pressure wave with echoes

    Parameters:
    - n_samples: Number of samples
    - fs: Sampling frequency (Hz)

    Returns:
    - time array, signal array
    """
    t = np.linspace(0, n_samples/fs, n_samples)

    # Main cardiac wave (systolic peak + diastolic decay)
    # Typical heart rate: 60-100 bpm, using 75 bpm = 1.25 Hz
    heart_rate = 1.25  # Hz

    # Systolic component (sharp rise and fall)
    systolic = signal.gausspulse(t - 0.1, fc=5, bw=0.5) * 120  # 120 mmHg peak

    # Diastolic component (slower decay)
    diastolic = 80 + 20 * np.exp(-10 * (t - 0.1)) * (t > 0.1)  # 80 mmHg baseline

    # Combine components
    main_signal = systolic + diastolic

    # Add echo from valve closure or arterial reflection
    # Typical delay: 40-60ms for aortic reflection
    echo_delay_samples = int(0.05 * fs)  # 50ms delay
    echo_amplitude = 0.3

    echo = np.zeros_like(main_signal)
    echo[echo_delay_samples:] = echo_amplitude * main_signal[:-echo_delay_samples]

    # Combined signal
    cardiac_signal = main_signal + echo

    # Add realistic noise
    noise = np.random.normal(0, 2, n_samples)
    cardiac_signal += noise

    return t, cardiac_signal

# Cepstral analysis function
def cepstral_analysis(signal_data, fs):
    """
    Perform cepstral analysis to detect echoes

    Cepstrum = IFFT(log(|FFT(signal)|))

    Parameters:
    - signal_data: Input signal
    - fs: Sampling frequency

    Returns:
    - quefrency array, cepstrum values
    """
    # Compute FFT
    fft_signal = fft(signal_data)

    # Compute magnitude spectrum
    magnitude_spectrum = np.abs(fft_signal)

    # Avoid log(0) by adding small epsilon
    epsilon = 1e-10
    log_magnitude = np.log(magnitude_spectrum + epsilon)

    # Compute cepstrum (IFFT of log magnitude)
    cepstrum = np.real(ifft(log_magnitude))

    # Quefrency axis (time-like axis in cepstral domain)
    quefrency = np.arange(len(cepstrum)) / fs

    return quefrency, cepstrum

# Generate signal
print("Generating cardiac pressure wave with echo...")
fs = 1000  # 1000 Hz sampling rate
n_samples = 512
t, cardiac_signal = create_cardiac_pressure_signal(n_samples, fs)

print(f"Signal parameters:")
print(f"  Samples: {n_samples}")
print(f"  Sampling rate: {fs} Hz")
print(f"  Duration: {n_samples/fs:.3f} seconds")
print(f"  Expected echo delay: ~50 ms")

# Perform cepstral analysis
print("\nPerforming cepstral analysis...")
quefrency, cepstrum = cepstral_analysis(cardiac_signal, fs)

# Find peaks in cepstrum (echo detection)
# Look for peaks after the main peak (quefrency > 10ms)
start_idx = int(0.01 * fs)  # Start looking after 10ms
cepstrum_search = np.abs(cepstrum[start_idx:start_idx+100])
peak_idx = np.argmax(cepstrum_search) + start_idx
detected_delay = quefrency[peak_idx] * 1000  # Convert to ms

print(f"\nEcho Detection Results:")
print(f"  Detected echo delay: {detected_delay:.1f} ms")
print(f"  Echo strength: {np.abs(cepstrum[peak_idx]):.4f}")

# Create comprehensive visualization
fig, axes = plt.subplots(2, 2, figsize=(14, 10))
fig.suptitle('Cardiac Pressure Wave Cepstral Analysis for Echo Detection',
             fontsize=14, fontweight='bold')

# Plot 1: Original cardiac pressure wave
axes[0, 0].plot(t * 1000, cardiac_signal, 'b-', linewidth=1.5)
axes[0, 0].axvline(x=50, color='r', linestyle='--', linewidth=2,
                   label='Expected Echo (50ms)', alpha=0.7)
axes[0, 0].set_title('Input: Cardiac Pressure Wave with Echo', fontweight='bold')
axes[0, 0].set_xlabel('Time (ms)')
axes[0, 0].set_ylabel('Pressure (mmHg)')
axes[0, 0].grid(True, alpha=0.3)
axes[0, 0].legend()
axes[0, 0].set_xlim([0, 200])

# Plot 2: Frequency spectrum (FFT magnitude)
fft_vals = fft(cardiac_signal)
freqs = fftfreq(len(cardiac_signal), 1/fs)
magnitude = np.abs(fft_vals)

axes[0, 1].plot(freqs[:len(freqs)//2], magnitude[:len(magnitude)//2],
                'g-', linewidth=1.5)
axes[0, 1].set_title('Frequency Spectrum (FFT Magnitude)', fontweight='bold')
axes[0, 1].set_xlabel('Frequency (Hz)')
axes[0, 1].set_ylabel('Magnitude')
axes[0, 1].grid(True, alpha=0.3)
axes[0, 1].set_xlim([0, 50])

# Plot 3: Log magnitude spectrum
log_mag = np.log(magnitude[:len(magnitude)//2] + 1e-10)
axes[1, 0].plot(freqs[:len(freqs)//2], log_mag, 'orange', linewidth=1.5)
axes[1, 0].set_title('Log Magnitude Spectrum', fontweight='bold')
axes[1, 0].set_xlabel('Frequency (Hz)')
axes[1, 0].set_ylabel('Log Magnitude')
axes[1, 0].grid(True, alpha=0.3)
axes[1, 0].set_xlim([0, 50])

# Plot 4: Cepstrum (echo detection)
quefrency_ms = quefrency * 1000  # Convert to milliseconds
axes[1, 1].plot(quefrency_ms[:len(quefrency_ms)//2],
                np.abs(cepstrum[:len(cepstrum)//2]),
                'purple', linewidth=2)
axes[1, 1].axvline(x=detected_delay, color='red', linestyle='--',
                   linewidth=2, label=f'Detected Echo: {detected_delay:.1f}ms')
axes[1, 1].axvline(x=50, color='orange', linestyle=':',
                   linewidth=2, label='Expected: 50ms', alpha=0.7)
axes[1, 1].set_title('Cepstrum (Echo Detection)', fontweight='bold')
axes[1, 1].set_xlabel('Quefrency (ms)')
axes[1, 1].set_ylabel('Cepstral Magnitude')
axes[1, 1].grid(True, alpha=0.3)
axes[1, 1].legend()
axes[1, 1].set_xlim([0, 100])

# Add annotations
axes[1, 1].annotate('Echo Peak',
                    xy=(detected_delay, np.abs(cepstrum[peak_idx])),
                    xytext=(detected_delay + 15, np.abs(cepstrum[peak_idx]) * 1.2),
                    arrowprops=dict(arrowstyle='->', color='red', lw=2),
                    fontsize=10, fontweight='bold', color='red')

plt.tight_layout()
plt.show()

print("\n" + "="*60)
print("Analysis Complete!")
print("\nClinical Interpretation:")
print("  - Cepstral peaks indicate echo reflections")
print("  - Early echoes (20-60ms): Aortic valve/ascending aorta reflections")
print("  - Late echoes (>100ms): Peripheral arterial reflections")
print("  - Echo strength correlates with arterial stiffness")
print("="*60)
```

## What This Does

1. **Generates realistic cardiac signal**: Simulates systolic/diastolic pressure patterns
2. **Adds echo**: Models reflection from aortic valve (50ms delay)
3. **Cepstral analysis**: Detects echo timing using FFT → log → IFFT
4. **Visualizes results**: Shows signal, spectrum, and cepstrum

## Medical Applications

- **Valve abnormalities**: Detect reflections from stenotic/regurgitant valves
- **Arterial stiffness**: Analyze reflection patterns
- **Heart failure**: Assess hemodynamic changes
- **Non-invasive diagnosis**: Alternative to invasive catheterization

## Try It!

Copy the code above and run it in the chat. The scipy-based implementation works entirely in your browser!
