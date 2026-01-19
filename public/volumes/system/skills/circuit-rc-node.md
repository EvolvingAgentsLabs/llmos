---
skill_id: circuit-rc-node
name: RC Circuit Simulator
description: Simulates an RC (Resistor-Capacitor) circuit and plots voltage response
type: spice
execution_mode: browser-wasm
category: electronics
tags: ["electronics", "circuit", "spice", "simulation"]
version: 1.0.0
author: system
estimated_time_ms: 200
memory_mb: 10
inputs:
  - name: resistance
    type: number
    description: Resistance in Ohms
    default: 1000
    required: true
  - name: capacitance
    type: number
    description: Capacitance in Farads (e.g., 1e-6 for 1µF)
    default: 0.000001
    required: true
  - name: input_voltage
    type: number
    description: Input voltage (V)
    default: 5
    required: true
  - name: simulation_time
    type: number
    description: Simulation time in seconds
    default: 0.01
    required: true
outputs:
  - name: voltage_data
    type: array
    description: Time-series voltage data across capacitor
  - name: time_constant
    type: number
    description: RC time constant (tau = R*C)
  - name: steady_state_voltage
    type: number
    description: Final voltage across capacitor
  - name: netlist
    type: string
    description: SPICE netlist used for simulation
---

# RC Circuit Simulator

Simulates a simple RC circuit and provides voltage response over time.

## Inputs
- **resistance** (number): Resistance in Ohms
- **capacitance** (number): Capacitance in Farads (e.g., 1e-6 for 1µF)
- **input_voltage** (number): Input voltage (V)
- **simulation_time** (number): Simulation time in seconds

## Outputs
- **voltage_data** (array): Time-series voltage data across capacitor
- **time_constant** (number): RC time constant (tau = R*C)
- **steady_state_voltage** (number): Final voltage across capacitor
- **netlist** (string): SPICE netlist used for simulation

## Code

```python
import numpy as np

def execute(inputs):
    """
    RC circuit simulation using analytical solution.

    For production, would use ngspice.js (SPICE compiled to Wasm).
    This simplified version uses the analytical formula:
    V(t) = V_in * (1 - exp(-t / (R*C)))
    """

    R = float(inputs.get('resistance', 1000))  # Ohms
    C = float(inputs.get('capacitance', 1e-6))  # Farads
    V_in = float(inputs.get('input_voltage', 5))  # Volts
    t_sim = float(inputs.get('simulation_time', 0.01))  # Seconds

    # Calculate time constant
    tau = R * C

    # Generate time points (1000 samples)
    t = np.linspace(0, t_sim, 1000)

    # Analytical solution for charging capacitor
    V_c = V_in * (1 - np.exp(-t / tau))

    # Prepare voltage data for plotting
    voltage_data = [
        {"time": float(t_i), "voltage": float(v_i)}
        for t_i, v_i in zip(t, V_c)
    ]

    # Steady state voltage (at t = 5*tau, ~99% charged)
    steady_state = V_in * (1 - np.exp(-min(t_sim, 5*tau) / tau))

    # Generate SPICE netlist
    netlist = f"""* RC Circuit Simulation
V1 in 0 DC {V_in}
R1 in out {R}
C1 out 0 {C} IC=0
.tran 1e-6 {t_sim}
.print tran v(out)
.end
"""

    return {
        "voltage_data": voltage_data,
        "time_constant": float(tau),
        "steady_state_voltage": float(steady_state),
        "netlist": netlist.strip()
    }
```

## Usage Notes

This node executes in browser-wasm.
Estimated execution time: 200ms
Memory usage: ~10MB

### Example Workflow

1. Connect to "Plot" node to visualize voltage response
2. Chain with "Frequency Response" node for AC analysis
3. Connect to "Parameter Sweep" to analyze different R/C values

### Circuit Diagram

```
    R
    ┌─────┐
 in o     o out
    └─┬───┘
      C
      ┴
```

### Mathematical Background

The voltage across the capacitor follows:
- **Charging**: V(t) = V_in * (1 - e^(-t/τ))
- **Time constant**: τ = R * C
- **Charging time**: ~5τ for 99% charge

### Integration with Ngspice.js

For production use with real SPICE simulation:
```javascript
// Pseudo-code for Ngspice.js integration
const ngspice = await loadNgspice();
ngspice.command(netlist);
const results = ngspice.getVectorData('v(out)');
```
