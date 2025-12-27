---
name: Evolutionary Biology
id: evolutionary_biology
domain: biology
description: Mental model based on natural selection, mutation, populations, and fitness
metaphors:
  - Natural selection
  - Genetic mutation
  - Population dynamics
  - Fitness landscapes
  - Survival and reproduction
---

# Evolutionary Biology Domain Lens

When viewing code through this lens, think of computation as an evolutionary process where solutions compete, mutate, and reproduce.

## Core Principles

### 1. Natural Selection
- Fitter solutions survive and reproduce
- Unfit solutions die out
- Environment (problem constraints) determines fitness
- Selection pressure drives improvement

### 2. Mutation and Variation
- Random changes introduce diversity
- Most mutations are neutral or harmful
- Beneficial mutations are rare but powerful
- Mutation rate affects exploration vs exploitation

### 3. Population Dynamics
- Multiple candidate solutions coexist
- Competition for limited resources
- Diversity provides robustness
- Convergence = species dominance

### 4. Fitness Landscapes
- Solution space = terrain to navigate
- Peaks = optimal solutions
- Valleys = poor solutions
- Rugged landscapes = complex problems

## Code Translation Patterns

### Arrays → Populations
- Elements = individual organisms
- Values = genetic traits
- Index = habitat/niche
- Length = population size

### Sorting → Survival of the Fittest
- Comparison = fitness evaluation
- Swap = competitive displacement
- Ordered result = evolutionary hierarchy
- Best at front = apex predators

### Searching → Foraging/Hunting
- Target = prey or resource
- Search space = habitat
- Found = successful hunt
- Not found = extinction/migration

### Loops → Generations
- Each iteration = one generation
- Termination = evolution stops
- Early exit = extinction event
- Convergence = speciation complete

### Conditionals → Selection Pressure
- If-then = environmental filter
- True branch = survivors
- False branch = eliminated
- Nested conditions = multiple selection pressures

## Vocabulary Mapping

| Programming Concept | Evolutionary Equivalent |
|---------------------|------------------------|
| Variable | Organism/Gene |
| Array | Population |
| Function | Phenotype expression |
| Loop | Generational cycle |
| Condition | Selection pressure |
| Comparison | Fitness evaluation |
| Swap | Competitive displacement |
| Maximum | Apex fitness |
| Minimum | Extinction threshold |
| Random | Mutation |
| Recursion | Lineage/Ancestry |
| Return value | Offspring/Legacy |

## Example Transformation

### Original (Find Maximum)
```python
def find_max(arr):
    if not arr:
        return None
    max_val = arr[0]
    for val in arr:
        if val > max_val:
            max_val = val
    return max_val
```

### Evolutionary View
```python
def find_apex_organism(population):
    """Natural selection identifies the fittest organism in the population."""
    if not population:
        return None  # Extinct population has no apex

    # First organism is the current alpha
    alpha = population[0]

    # Each organism competes for alpha status
    for challenger in population:
        # Fitness evaluation through competition
        if challenger > alpha:
            # Challenger has superior fitness - becomes new alpha
            alpha = challenger

    # The apex organism survives all challenges
    return alpha
```

### Original (Filter)
```python
def filter_positive(arr):
    return [x for x in arr if x > 0]
```

### Evolutionary View
```python
def natural_selection(population):
    """Environmental pressure eliminates organisms with non-positive fitness."""
    survivors = []

    for organism in population:
        # Selection pressure: only positive fitness survives
        if organism > 0:
            survivors.append(organism)

    # Surviving population after selection event
    return survivors
```

## When to Apply This Lens

Use evolutionary metaphors when:
- Selection/filtering operations
- Finding best/worst elements
- Competitive comparisons
- Iterative refinement
- Population-based algorithms
- Genetic algorithms (obviously)
- Any survival/elimination logic

## Advanced Patterns

### Crossover (Combining Solutions)
```python
def crossover(parent_a, parent_b, crossover_point):
    """Sexual reproduction - combine genetic material from two parents."""
    offspring = parent_a[:crossover_point] + parent_b[crossover_point:]
    return offspring
```

### Mutation
```python
def mutate(genome, mutation_rate, mutation_range):
    """Random mutations introduce genetic variation."""
    import random
    mutated = genome.copy()
    for i in range(len(mutated)):
        if random.random() < mutation_rate:
            mutated[i] += random.uniform(-mutation_range, mutation_range)
    return mutated
```

## Constraints

When rewriting code with this lens:
1. Preserve function signature exactly
2. Maintain algorithmic correctness
3. Use biological terminology in variable names and comments
4. Ensure identical input/output behavior
