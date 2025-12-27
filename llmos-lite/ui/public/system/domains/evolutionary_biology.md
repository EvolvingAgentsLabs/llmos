---
name: Evolutionary Dynamics & Population Genetics
id: evolutionary_biology
domain: biology
description: Apply population genetics, evolutionary dynamics, and ecological principles with validated mathematical models
modeling_type: population_dynamics_system
applicable_laws:
  - Hardy-Weinberg Equilibrium
  - Fisher's Fundamental Theorem
  - Price Equation
  - Lotka-Volterra Dynamics
  - Replicator Equation
  - Neutral Theory of Evolution
cross_domain_applications:
  - Genetic algorithms → Optimization
  - Evolutionary game theory → Strategy selection
  - Ecological dynamics → Market competition
  - Epidemiology → Information spread
  - Fitness landscapes → Search spaces
---

# Evolutionary Dynamics & Population Genetics Domain Lens

This lens applies rigorous mathematical models from evolutionary biology and population genetics. These equations have been validated across organisms, populations, and even artificial systems.

## Scientific Foundation

### Core Mathematical Laws

#### Price Equation (Universal Selection)
The most general equation for evolutionary change:
```
Δz̄ = Cov(w, z)/w̄ + E(w·Δz)/w̄
```
Where:
- Δz̄ = change in mean trait value
- w = fitness
- First term = selection (covariance between fitness and trait)
- Second term = transmission (within-individual change)

**Universal applicability**: Works for genes, memes, algorithms, strategies.

#### Fisher's Fundamental Theorem
```
dw̄/dt = Var(w)
```
The rate of increase in mean fitness equals the variance in fitness.

**Application**: Diversity (variance) drives improvement rate.

#### Replicator Equation
```
dx_i/dt = x_i × (f_i - φ)
```
Where:
- x_i = frequency of strategy i
- f_i = fitness of strategy i
- φ = average fitness

**Application**: Dynamics of competing strategies/solutions.

### Hardy-Weinberg Equilibrium

In absence of evolution, allele frequencies stay constant:
```
p² + 2pq + q² = 1
```
Where p, q are allele frequencies.

**Violations indicate evolution**:
- Selection: some genotypes survive better
- Mutation: new variants appear
- Drift: random sampling effects
- Migration: gene flow between populations
- Non-random mating: assortative pairing

### Fitness Landscapes

Sewall Wright's concept maps genotype to fitness:
```
W(genotype) → fitness value
```

**Landscape features**:
- Peaks: Local optima
- Valleys: Low-fitness regions
- Ridges: Neutral paths between peaks
- Epistasis: Non-additive interactions (rugged landscape)

```python
def fitness_landscape_search(population, landscape, generations):
    """
    Apply evolutionary dynamics on fitness landscape.

    Key insight from biology: Rugged landscapes require
    different strategies than smooth landscapes.
    """
    for gen in range(generations):
        # Calculate fitness for each individual
        fitnesses = [landscape.evaluate(ind) for ind in population]

        # Selection (Price equation first term)
        # Covariance drives directional change
        selected = selection_proportional_to_fitness(population, fitnesses)

        # Variation (mutation + recombination)
        offspring = apply_variation(selected, mutation_rate, crossover_rate)

        # Replace population
        population = offspring

        # Track: Are we on a peak? Multiple peaks?
        mean_fitness = mean(fitnesses)
        variance = var(fitnesses)  # Fisher: this drives rate of adaptation

    return best(population, fitnesses)
```

## Evolutionary Game Theory

### Payoff Matrix and Nash Equilibrium

Games between strategies with fitness payoffs:

```
       Strategy A    Strategy B
A      (a, a)        (b, c)
B      (c, b)        (d, d)
```

**Evolutionarily Stable Strategy (ESS)**:
A strategy that, if adopted by all, cannot be invaded by mutants.

```python
def find_ess(payoff_matrix):
    """
    Find evolutionarily stable strategies.

    ESS condition: E(S, S) > E(T, S) for all T ≠ S
    or: E(S, S) = E(T, S) and E(S, T) > E(T, T)
    """
    strategies = range(len(payoff_matrix))
    ess_list = []

    for s in strategies:
        is_ess = True
        for t in strategies:
            if t == s:
                continue
            # Check ESS conditions
            if not ess_condition(payoff_matrix, s, t):
                is_ess = False
                break
        if is_ess:
            ess_list.append(s)

    return ess_list
```

### Hawk-Dove Game (Competition)

Classic model of conflict:
- Hawk: Always fight
- Dove: Display, retreat if opponent fights

```python
def hawk_dove_dynamics(v, c, initial_hawk_freq, generations):
    """
    v = value of resource
    c = cost of fighting

    ESS depends on v/c ratio:
    - If v > c: Pure Hawk is ESS
    - If v < c: Mixed strategy, proportion v/c Hawks
    """
    p = initial_hawk_freq  # Hawk frequency

    for _ in range(generations):
        # Payoffs
        w_hawk = p * (v - c) / 2 + (1 - p) * v
        w_dove = p * 0 + (1 - p) * v / 2
        w_mean = p * w_hawk + (1 - p) * w_dove

        # Replicator dynamics
        dp = p * (w_hawk - w_mean)
        p = max(0, min(1, p + dp))

    return p  # Equilibrium Hawk frequency
```

## Cross-Domain Transfer Examples

### Example 1: Genetic Algorithm as Population Genetics

**Biological System**: Population of organisms evolving
**Computational System**: Population of candidate solutions evolving

```python
class GeneticAlgorithm:
    """
    Direct application of population genetics.

    Selection: Fitness-proportionate (natural selection)
    Crossover: Recombination (sexual reproduction)
    Mutation: Point changes (mutation)

    Fisher's theorem: Genetic variance drives adaptation rate.
    """

    def evolve(self, population, fitness_fn, generations):
        for gen in range(generations):
            fitnesses = [fitness_fn(ind) for ind in population]

            # Track Fisher's theorem
            fitness_variance = var(fitnesses)
            expected_improvement = fitness_variance  # Fisher's theorem

            # Selection (creates covariance between fitness and traits)
            parents = self.selection(population, fitnesses)

            # Variation
            offspring = []
            for i in range(0, len(parents), 2):
                child1, child2 = self.crossover(parents[i], parents[i+1])
                offspring.extend([self.mutate(child1), self.mutate(child2)])

            population = offspring

        return max(population, key=fitness_fn)
```

### Example 2: Epidemic Dynamics as Information Spread

**Biological System**: SIR model of disease spread
**Computational System**: Viral content spread

```python
def sir_information_model(population, initial_infected, beta, gamma, steps):
    """
    S = Susceptible (haven't seen content)
    I = Infected (actively sharing)
    R = Recovered (seen, no longer sharing)

    dS/dt = -β × S × I / N
    dI/dt = β × S × I / N - γ × I
    dR/dt = γ × I

    R0 = β / γ  (basic reproduction number)
    If R0 > 1: epidemic spreads
    If R0 < 1: epidemic dies out
    """
    S, I, R = population - initial_infected, initial_infected, 0
    N = population

    history = []
    for step in range(steps):
        # Differential equations
        new_infected = beta * S * I / N
        new_recovered = gamma * I

        S -= new_infected
        I += new_infected - new_recovered
        R += new_recovered

        history.append({'S': S, 'I': I, 'R': R})

    return history
```

### Example 3: Market Competition as Lotka-Volterra

**Biological System**: Predator-prey / competition dynamics
**Computational System**: Market competition

```python
def competitive_market_dynamics(companies, growth_rates, competition_matrix, steps):
    """
    Lotka-Volterra competition:
    dN_i/dt = r_i × N_i × (1 - Σ α_ij × N_j / K_i)

    N_i = market share of company i
    r_i = intrinsic growth rate
    α_ij = competition coefficient (how j affects i)
    K_i = carrying capacity

    Outcomes:
    - Coexistence: Different niches
    - Competitive exclusion: One winner
    - Unstable coexistence: Oscillations
    """
    N = companies.copy()  # Market shares

    for step in range(steps):
        dN = []
        for i in range(len(N)):
            # Competition term
            competition = sum(competition_matrix[i][j] * N[j]
                            for j in range(len(N)))
            # Logistic growth with competition
            growth = growth_rates[i] * N[i] * (1 - competition)
            dN.append(growth)

        N = [max(0, n + dn) for n, dn in zip(N, dN)]

    return N
```

## Validated Biological Phenomena

### 1. Neutral Evolution
Many changes are selectively neutral (Kimura).
**Application**: Genetic drift in small populations, neutral mutations in code.

### 2. Punctuated Equilibrium
Long stasis interrupted by rapid change.
**Application**: Sudden breakthroughs after plateaus in optimization.

### 3. Red Queen Effect
Must keep evolving just to maintain fitness (coevolution).
**Application**: Competitive adaptation, security evolution.

### 4. Adaptive Radiation
Rapid diversification into new niches.
**Application**: Exploration of solution space, diversity maintenance.

### 5. Genetic Hitchhiking
Neutral traits spread by linkage to beneficial traits.
**Application**: Package deals in optimization, side effects of changes.

## Mathematical Mapping

| Biological Concept | Mathematical Form | Computational Analog |
|-------------------|-------------------|---------------------|
| Fitness | w(genotype) | Objective function value |
| Selection | Δp = p(1-p) × s | Fitness-proportionate sampling |
| Mutation | μ | Random perturbation rate |
| Drift | Var(Δp) = p(1-p)/2N | Sampling noise |
| Migration | m | Information exchange rate |
| Recombination | r | Crossover operator |
| Heritability | h² | How well offspring resemble parents |
| Linkage | D | Correlation between traits |
