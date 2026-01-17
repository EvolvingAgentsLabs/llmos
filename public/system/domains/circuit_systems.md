---
name: Circuit & Systems Modeling
id: circuit_systems
domain: engineering
description: Model any dynamical system using electrical circuit analogies - resistors, capacitors, inductors, and network topology
modeling_type: linear_network_system
applicable_laws:
  - Kirchhoff's Current Law (KCL) - Node conservation
  - Kirchhoff's Voltage Law (KVL) - Loop conservation
  - Ohm's Law - Linear proportionality
  - Thevenin/Norton Equivalence
  - Superposition Principle
cross_domain_applications:
  - Data flow → Current flow
  - Bottlenecks → Resistance
  - Buffers/Queues → Capacitance
  - Momentum/Inertia → Inductance
  - Parallel processing → Parallel circuits
  - Sequential processing → Series circuits
---

# Circuit & Systems Modeling Domain Lens

This lens uses electrical circuit theory as a universal language for modeling any dynamical system. The power comes from the fact that thermal, hydraulic, mechanical, acoustic, and computational systems all share the same mathematical structure.

## Scientific Foundation

### Universal Analogies Table

The same differential equations govern different physical domains:

| Electrical | Hydraulic | Thermal | Mechanical | Computational |
|-----------|-----------|---------|------------|---------------|
| Voltage (V) | Pressure (P) | Temperature (T) | Force (F) | Priority/Potential |
| Current (I) | Flow rate (Q) | Heat flow (Φ) | Velocity (v) | Data rate |
| Resistance (R) | Fluid resistance | Thermal resistance | Friction | Processing cost |
| Capacitance (C) | Tank volume | Heat capacity | Spring compliance | Buffer/Queue size |
| Inductance (L) | Fluid inertia | (none) | Mass | Momentum/Batch size |
| Charge (q) | Volume | Heat | Position | Accumulated data |

### Fundamental Laws

#### Ohm's Law (Linear Proportionality)
```
V = I × R
```
**Cross-domain**: Flow is proportional to driving force divided by resistance
```
Data_rate = Priority_difference / Processing_cost
```

#### Kirchhoff's Current Law (Conservation at Nodes)
```
Σ I_in = Σ I_out
```
**Cross-domain**: What flows into a node must flow out
```python
# In data processing:
def process_node(inputs):
    total_in = sum(inputs)
    # Conservation: outputs must equal inputs
    return distribute(total_in, output_channels)
```

#### Kirchhoff's Voltage Law (Loop Conservation)
```
Σ V_loop = 0
```
**Cross-domain**: Changes around any closed loop sum to zero
```python
# In priority systems:
# If A > B and B > C, then A > C (transitivity)
# Going around: (A-B) + (B-C) + (C-A) = 0
```

### Circuit Topology Patterns

#### Series Connection (Sequential)
```
R_total = R1 + R2 + R3
```
- Components share the same current (throughput)
- Voltages (efforts) add up
- **Application**: Sequential processing pipeline
- **Total latency** = sum of individual latencies

```python
def series_pipeline(data, stages):
    """Each stage processes the full flow sequentially."""
    result = data
    total_time = 0
    for stage in stages:
        result, time = stage.process(result)
        total_time += time  # Times add in series
    return result, total_time
```

#### Parallel Connection (Concurrent)
```
1/R_total = 1/R1 + 1/R2 + 1/R3
```
- Components share the same voltage (driving force)
- Currents (flows) add up
- **Application**: Parallel processing, load balancing
- **Total throughput** = sum of individual throughputs

```python
def parallel_pipeline(data, workers):
    """Work is divided among parallel paths."""
    chunks = split(data, len(workers))
    results = [w.process(c) for w, c in zip(workers, chunks)]
    return merge(results)
    # Total throughput = sum of worker throughputs
```

#### RC Circuit (Smoothing/Buffering)
```
τ = R × C  (time constant)
V_out(t) = V_in × (1 - e^(-t/τ))
```
- Capacitor smooths out variations
- **Application**: Moving average, rate limiting, buffers

```python
def exponential_smoothing(values, tau):
    """RC low-pass filter analog for data smoothing."""
    smoothed = []
    current = values[0]
    alpha = 1.0 / tau  # Smoothing factor

    for value in values:
        current = alpha * value + (1 - alpha) * current
        smoothed.append(current)

    return smoothed
```

## System Modeling Methodology

### Step 1: Identify Flow Variables
What "flows" through your system?
- Data packets, requests, items, money, resources

### Step 2: Identify Effort Variables
What "drives" the flow?
- Priority, urgency, demand, potential, pressure

### Step 3: Map Components

| Your System Element | Circuit Element | Behavior |
|--------------------|-----------------|----------|
| Processing stage | Resistor | Consumes "effort", limits flow |
| Buffer/Queue | Capacitor | Stores flow, smooths variations |
| Batch accumulator | Inductor | Resists change in flow rate |
| Fork/Splitter | Parallel junction | Divides flow |
| Join/Merge | Series junction | Combines flow |

### Step 4: Write Node Equations

For each node, apply KCL:
```python
# At node N:
# flow_in_1 + flow_in_2 = flow_out_1 + flow_out_2 + stored_in_buffer

def node_balance(inputs, outputs, buffer):
    total_in = sum(inputs)
    total_out = sum(outputs)
    buffer.store(total_in - total_out)  # Capacitor charging
```

## Cross-Domain Transfer Examples

### Example 1: Load Balancer as Parallel Resistors

**Electrical**: Current divides inversely proportional to resistance
**Computational**: Requests divide inversely proportional to server load

```python
def load_balance(requests, servers):
    """
    Circuit model: Parallel resistors with current source
    Each server is a resistor with R = current_load
    Current (requests) divides inversely with resistance (load)
    """
    total_conductance = sum(1/s.load for s in servers)

    distribution = []
    for server in servers:
        # Current divider formula: I_k = I_total × (G_k / G_total)
        conductance = 1 / server.load
        fraction = conductance / total_conductance
        distribution.append((server, requests * fraction))

    return distribution
```

### Example 2: Rate Limiter as RC Circuit

**Electrical**: Capacitor limits how fast voltage can change
**Computational**: Buffer limits how fast requests pass through

```python
class RateLimiter:
    """
    Model: RC circuit with time constant τ = R×C
    R = processing time per request
    C = buffer capacity
    τ = average time to process buffer contents
    """
    def __init__(self, rate_limit, buffer_size):
        self.R = 1.0 / rate_limit  # Resistance = 1/rate
        self.C = buffer_size       # Capacitance = buffer
        self.tau = self.R * self.C # Time constant
        self.buffer = []

    def submit(self, request):
        if len(self.buffer) < self.C:
            self.buffer.append(request)
            return True
        return False  # Buffer full = capacitor charged

    def process(self, dt):
        # Discharge rate follows RC dynamics
        discharge_rate = len(self.buffer) / self.tau
        num_to_process = min(int(discharge_rate * dt), len(self.buffer))
        return [self.buffer.pop(0) for _ in range(num_to_process)]
```

### Example 3: Pipeline as Transmission Line

**Electrical**: Transmission line with distributed R, L, C
**Computational**: Pipeline with distributed latency, inertia, buffering

```python
def transmission_line_model(pipeline_stages):
    """
    Each stage has:
    - R: processing resistance (latency)
    - L: startup inertia (batch warmup)
    - C: local buffer (capacity)

    Wave propagation: signals take time to traverse
    Impedance matching: stages should have compatible rates
    """
    for i, stage in enumerate(pipeline_stages[:-1]):
        next_stage = pipeline_stages[i + 1]

        # Impedance matching condition
        # Z = sqrt(L/C) should be similar between stages
        z_current = sqrt(stage.L / stage.C)
        z_next = sqrt(next_stage.L / next_stage.C)

        if abs(z_current - z_next) > threshold:
            # Impedance mismatch = reflection = backpressure
            insert_matching_buffer(stage, next_stage)
```

## Validated Circuit Phenomena to Apply

### 1. Impedance Matching
Maximum power transfer when source and load impedances match.
**Application**: Pipeline stage matching, API rate matching.

### 2. Resonance
At resonant frequency, system response is maximized.
**Application**: Periodic batch processing optimization.

### 3. Transient Response
System response to sudden changes (step response).
**Application**: Startup behavior, load spike handling.

### 4. Feedback and Stability
Negative feedback stabilizes; positive feedback destabilizes.
**Application**: Control loops, auto-scaling.

## Mathematical Mapping

| Circuit Analysis | System Analysis |
|-----------------|-----------------|
| Nodal analysis | Balance equations at each node |
| Mesh analysis | Conservation around loops |
| Thevenin equivalent | Simplify complex subsystem to simple model |
| Transfer function | Input-output relationship |
| Frequency response | Behavior at different rates |
| Bode plot | Performance vs load characteristic |
