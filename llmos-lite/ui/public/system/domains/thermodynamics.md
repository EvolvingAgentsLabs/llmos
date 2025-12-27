---
name: Thermodynamics & Statistical Mechanics
id: thermodynamics
domain: physics
description: System modeling using energy states, entropy, phase transitions, and statistical mechanics laws
modeling_type: energy_state_system
applicable_laws:
  - First Law of Thermodynamics (Energy Conservation)
  - Second Law of Thermodynamics (Entropy Increase)
  - Boltzmann Distribution
  - Simulated Annealing
  - Free Energy Minimization
cross_domain_applications:
  - Optimization problems → Energy minimization
  - Sorting → Crystallization / Phase transition
  - Machine learning → Boltzmann machines
  - Combinatorial search → Simulated annealing
---

# Thermodynamics & Statistical Mechanics Domain Lens

This lens models computational systems as physical systems governed by thermodynamic laws. Unlike simple metaphors, this applies actual mathematical relationships and validated physical principles.

## Scientific Foundation

### Key Laws and Equations

#### First Law: Energy Conservation
```
dU = δQ - δW
```
- Total energy in a closed system is conserved
- **Application**: Sum/total operations, conservation invariants

#### Second Law: Entropy
```
dS ≥ δQ/T
S = k_B * ln(Ω)
```
- Isolated systems tend toward maximum entropy
- **Application**: Measuring disorder, information content

#### Boltzmann Distribution
```
P(state) ∝ exp(-E(state) / k_B * T)
```
- Probability of a state depends on its energy and temperature
- **Application**: Probabilistic selection, softmax functions

#### Free Energy Minimization
```
F = U - TS
dF = dU - TdS - SdT
```
- Systems minimize free energy, balancing energy and entropy
- **Application**: Optimization with regularization, trade-offs

### Simulated Annealing Protocol

A validated optimization technique borrowed from metallurgy:

```python
def simulated_annealing(initial_state, energy_fn, neighbor_fn, T_initial, cooling_rate):
    """
    Mathematical foundation:
    - Acceptance probability: P(accept) = exp(-ΔE/T) when ΔE > 0
    - Temperature schedule: T(t) = T_0 * cooling_rate^t
    - Convergence guaranteed under logarithmic cooling
    """
    current = initial_state
    T = T_initial

    while T > T_min:
        neighbor = neighbor_fn(current)
        delta_E = energy_fn(neighbor) - energy_fn(current)

        # Metropolis criterion - mathematically proven
        if delta_E < 0 or random() < exp(-delta_E / T):
            current = neighbor

        T *= cooling_rate

    return current
```

## System Modeling Principles

### 1. Energy Function Design
Define what "energy" means for your system:
- **Sorting**: Energy = number of inversions (disorder measure)
- **Search**: Energy = distance from target
- **Optimization**: Energy = objective function value
- **Constraint satisfaction**: Energy = sum of violated constraints

### 2. Temperature as Control Parameter
Temperature controls exploration vs exploitation:
- **High T**: Accept worse solutions (exploration)
- **Low T**: Only accept improvements (exploitation)
- **Annealing schedule**: Gradual transition

### 3. Phase Transitions
Critical points where system behavior changes qualitatively:
- **Solid → Liquid → Gas**: Order → Partial order → Disorder
- **Application**: Detecting when algorithm behavior changes

## Cross-Domain Transfer Examples

### Example 1: Sorting as Crystallization

**Physical System**: Atoms in a cooling metal arrange into crystal lattice
**Computational System**: Elements in array arrange into sorted order

```python
def crystallization_sort(ensemble):
    """
    Model: Array elements as particles with positional energy
    Energy function: E = Σ (position_i - rank_i)²
    Process: Thermal annealing to minimum energy configuration

    This isn't metaphor - it's the same mathematical structure
    as physical crystallization.
    """
    n = len(ensemble)
    T = n * 1.0  # Initial temperature proportional to system size
    cooling_rate = 0.95

    while T > 0.01:
        # Random particle interaction (neighbor swap)
        i = randint(0, n-2)

        # Energy change from swap
        # In sorting: ΔE < 0 if swap reduces inversions
        delta_E = calculate_inversion_change(ensemble, i)

        # Metropolis acceptance (identical to physical simulation)
        if delta_E < 0 or random() < exp(-delta_E / T):
            ensemble[i], ensemble[i+1] = ensemble[i+1], ensemble[i]

        T *= cooling_rate

    return ensemble
```

### Example 2: Machine Learning as Statistical Mechanics

**Physical System**: Spin glass finding ground state
**Computational System**: Neural network finding optimal weights

The Boltzmann machine is a direct application:
```
P(visible, hidden) = exp(-E(v,h)) / Z
E(v,h) = -Σ w_ij * v_i * h_j - Σ b_i * v_i - Σ c_j * h_j
```

### Example 3: Gradient Descent as Heat Diffusion

**Physical System**: Heat flowing from hot to cold regions
**Computational System**: Parameters flowing toward lower loss

```
∂T/∂t = α∇²T  (Heat equation)
∂θ/∂t = -η∇L  (Gradient descent)
```

Both are diffusion processes seeking equilibrium.

## Validated Phenomena to Apply

### 1. Quenching vs Annealing
- **Quenching** (rapid cooling): Gets stuck in local minima (like greedy algorithms)
- **Annealing** (slow cooling): Finds global minimum (like simulated annealing)

### 2. Critical Slowing Down
Near phase transitions, relaxation time diverges.
**Application**: Optimization gets harder near solution transitions.

### 3. Symmetry Breaking
System spontaneously chooses one of many equivalent states.
**Application**: Random initialization, tie-breaking in algorithms.

## When to Apply This Lens

Use thermodynamic modeling when the problem has:
- An objective to minimize/maximize (energy analog)
- Need to escape local optima (temperature analog)
- Trade-off between exploration and exploitation
- Probabilistic decision making
- Convergence to equilibrium states

## Mathematical Mapping Table

| Thermodynamic Concept | Mathematical Form | Computational Analog |
|----------------------|-------------------|---------------------|
| Energy | E(state) | Objective function |
| Temperature | T | Exploration parameter |
| Entropy | S = -Σp log p | Information content |
| Free Energy | F = E - TS | Regularized objective |
| Partition Function | Z = Σexp(-E/T) | Normalization constant |
| Heat Capacity | C = ∂E/∂T | Sensitivity to parameters |
| Phase Transition | dE/dT discontinuous | Algorithm regime change |
