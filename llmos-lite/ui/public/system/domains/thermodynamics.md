---
name: Thermodynamics
id: thermodynamics
domain: physics
description: Mental model based on energy minimization, entropy, and thermal equilibrium
metaphors:
  - Energy states and transitions
  - Entropy and disorder
  - Annealing and cooling
  - Heat diffusion
  - Equilibrium seeking
---

# Thermodynamics Domain Lens

When viewing code through this lens, think of computation as a physical system seeking equilibrium.

## Core Principles

### 1. Energy Minimization
- Every system naturally seeks its lowest energy state
- Algorithms should "flow downhill" toward optimal solutions
- Local minima are stable but may not be globally optimal
- "Temperature" controls the ability to escape local minima

### 2. Entropy and Information
- Entropy measures disorder/randomness in a system
- Sorting reduces entropy (increases order)
- Searching explores the entropy landscape
- Information processing is entropy management

### 3. Thermal Annealing
- Start "hot" (high randomness, explore widely)
- Gradually "cool" (reduce randomness, refine solutions)
- Slower cooling = better final solutions
- Reheating can help escape local minima

### 4. Heat Diffusion
- Information/values spread from high to low concentration
- Boundaries constrain diffusion
- Equilibrium = uniform distribution
- Rate depends on "conductivity" (connectivity)

## Code Translation Patterns

### Sorting → Crystallization
- Unsorted array = high-entropy gas state
- Sorting = cooling toward crystalline order
- Comparison = energy evaluation
- Swap = thermal fluctuation

### Searching → Energy Landscape Exploration
- Solution space = energy landscape
- Target = energy minimum
- Search = particle exploring the landscape
- Found = reached equilibrium state

### Iteration → Thermal Relaxation
- Each iteration = time step in cooling
- Convergence = reaching thermal equilibrium
- Early termination = rapid quenching
- Tolerance = temperature threshold

### Data Structures → Phase States
- Unstructured data = gas (high entropy)
- Partially ordered = liquid (medium entropy)
- Fully structured = solid (low entropy)
- Transformations = phase transitions

## Vocabulary Mapping

| Programming Concept | Thermodynamic Equivalent |
|---------------------|-------------------------|
| Variable | Particle/Molecule |
| Array | Ensemble of particles |
| Loop | Thermal cycles |
| Condition | Energy barrier |
| Optimization | Energy minimization |
| Random | Thermal noise |
| Convergence | Equilibrium |
| Error | Entropy increase |
| Cache | Heat reservoir |
| Recursion | Cascading energy transfer |

## Example Transformation

### Original (Bubble Sort)
```python
def sort(arr):
    for i in range(len(arr)):
        for j in range(len(arr) - 1):
            if arr[j] > arr[j + 1]:
                arr[j], arr[j + 1] = arr[j + 1], arr[j]
    return arr
```

### Thermodynamic View
```python
def crystallize(ensemble):
    """Allow thermal fluctuations until crystalline order emerges."""
    temperature_cycles = len(ensemble)  # Cooling cycles

    for cooling_step in range(temperature_cycles):
        # Each cycle allows neighboring particles to exchange energy
        for particle_idx in range(len(ensemble) - 1):
            current_energy = ensemble[particle_idx]
            neighbor_energy = ensemble[particle_idx + 1]

            # Higher energy particle transfers to lower position (heat flows down)
            if current_energy > neighbor_energy:
                # Thermal exchange - particles swap positions
                ensemble[particle_idx], ensemble[particle_idx + 1] = \
                    neighbor_energy, current_energy

    # System has reached minimum energy configuration
    return ensemble
```

## When to Apply This Lens

Use thermodynamics metaphors when:
- Optimization problems (find minimum/maximum)
- Sorting and ordering operations
- Convergence algorithms
- Random/probabilistic computations
- Relaxation methods
- Gradient-based operations

## Constraints

When rewriting code with this lens:
1. Preserve function signature exactly
2. Maintain algorithmic correctness
3. Keep comments explaining the thermodynamic metaphor
4. Ensure identical input/output behavior
