---
name: Economics & Game Theory
id: economics
domain: social_science
description: Apply mathematical economics, game theory, and mechanism design with validated equilibrium and optimization models
modeling_type: market_equilibrium_system
applicable_laws:
  - Nash Equilibrium
  - Pareto Efficiency
  - Arrow-Debreu Equilibrium
  - Utility Maximization
  - Mechanism Design (Revelation Principle)
  - Auction Theory (Vickrey)
cross_domain_applications:
  - Game theory → Multi-agent systems
  - Auction mechanisms → Resource allocation
  - Portfolio theory → Risk management
  - Supply/demand → Load balancing
  - Market clearing → Scheduling
---

# Economics & Game Theory Domain Lens

This lens applies rigorous mathematical models from economics and game theory. These equations describe rational behavior under constraints and have been validated in markets, auctions, and competitive systems.

## Scientific Foundation

### Core Mathematical Laws

#### Utility Maximization (Rational Choice)
The foundational model of economic behavior:
```
max U(x) subject to p·x ≤ w
```
Where:
- U(x) = utility function (preferences)
- p = price vector
- x = consumption bundle
- w = wealth/budget

**First-order condition** (MRS = price ratio):
```
∂U/∂x_i   p_i
-------- = ---
∂U/∂x_j   p_j
```

**Application**: Resource allocation under constraints.

#### Nash Equilibrium
A strategy profile where no player can benefit by unilateral deviation:
```
For all players i:
u_i(s_i*, s_{-i}*) ≥ u_i(s_i, s_{-i}*) for all s_i
```

Where:
- s_i* = optimal strategy for player i
- s_{-i}* = other players' strategies
- u_i = player i's utility function

**Application**: Multi-agent coordination, competitive algorithms.

#### Pareto Efficiency
An allocation where no one can be made better off without making someone worse off:
```
No allocation x' exists such that:
u_i(x') ≥ u_i(x) for all i, and
u_j(x') > u_j(x) for some j
```

**Application**: Multi-objective optimization frontier.

### Market Equilibrium

#### Supply and Demand
At equilibrium, supply equals demand:
```
S(p*) = D(p*)
```

**Price dynamics** (tâtonnement):
```
dp/dt = k × (D(p) - S(p))
```
Price rises when demand exceeds supply, falls when supply exceeds demand.

#### Walrasian Equilibrium
General equilibrium with market clearing in all markets simultaneously:
```
For all goods j:
Σ_i x_ij(p) = Σ_i e_ij
```

Where:
- x_ij = agent i's demand for good j
- e_ij = agent i's endowment of good j

**Application**: Multi-resource allocation systems.

## Game Theory

### Strategic Form Games

#### Dominant Strategy Equilibrium
A strategy that's best regardless of others' choices:
```python
def is_dominant(strategy, player, game):
    """
    Strategy s is dominant if:
    u(s, t) ≥ u(s', t) for all s', for all opponent strategies t
    """
    for opponent_strategy in game.opponent_strategies:
        for alternative in game.my_strategies:
            if alternative == strategy:
                continue
            if game.utility(alternative, opponent_strategy) > \
               game.utility(strategy, opponent_strategy):
                return False
    return True
```

#### Mixed Strategy Nash Equilibrium
When pure strategies have no equilibrium, mix probabilities:
```
σ_i* makes player i indifferent among opponent's pure strategies
```

```python
def mixed_nash_2x2(payoff_matrix):
    """
    For 2x2 game, find mixing probabilities that make
    opponent indifferent between strategies.

    Mathematical solution:
    If A plays Up with prob p:
    E[B plays Left] = E[B plays Right]
    p × a + (1-p) × c = p × b + (1-p) × d
    """
    # Player A's payoffs when B plays Left vs Right
    a11, a12 = payoff_matrix[0][0][0], payoff_matrix[0][1][0]
    a21, a22 = payoff_matrix[1][0][0], payoff_matrix[1][1][0]

    # Player B's indifference condition
    p = (a22 - a21) / (a11 - a12 - a21 + a22)
    return max(0, min(1, p))  # Probability in [0,1]
```

### Mechanism Design

#### Revelation Principle
Any outcome achievable by any mechanism can be achieved by a direct mechanism where truthful reporting is optimal:

```python
def truthful_mechanism(reports, allocation_rule, payment_rule):
    """
    A mechanism is truthful (incentive compatible) if:
    u_i(truthful report) ≥ u_i(any other report)

    Achieved through proper payment design.
    """
    allocation = allocation_rule(reports)
    payments = payment_rule(reports)
    return allocation, payments
```

#### Vickrey-Clarke-Groves (VCG) Mechanism
Truthful auction where winner pays second-highest bid:
```
Payment_i = max_{j≠i} v_j  (second price)
```

**Key property**: Dominant strategy to bid true value.

```python
def vcg_auction(bids):
    """
    VCG auction: truthful bidding is dominant strategy.

    Winner: highest bidder
    Payment: second-highest bid

    Mathematical guarantee:
    Bidding v_i = true value is optimal regardless of others
    """
    sorted_bids = sorted(enumerate(bids), key=lambda x: -x[1])
    winner = sorted_bids[0][0]
    payment = sorted_bids[1][1] if len(sorted_bids) > 1 else 0
    return winner, payment
```

## Cross-Domain Transfer Examples

### Example 1: Load Balancer as Market Clearing

**Economic System**: Price adjusts until supply equals demand
**Computational System**: Load balancer distributes requests

```python
class MarketClearingLoadBalancer:
    """
    Apply market equilibrium to load balancing.

    Mathematical isomorphism:
    - Requests = Demand
    - Server capacity = Supply
    - "Price" = Current load (high load = high price)
    - Equilibrium = Balanced load across servers
    """

    def __init__(self, servers):
        self.servers = servers
        self.prices = {s: 0.0 for s in servers}  # Load as price

    def route_request(self, request):
        # Demand goes to lowest-price server (market clearing)
        best_server = min(self.servers, key=lambda s: self.prices[s])

        # Execute trade
        result = best_server.handle(request)

        # Update price (load increases)
        self.prices[best_server] += 1

        return result

    def complete_request(self, server):
        # Supply frees up (price decreases)
        self.prices[server] = max(0, self.prices[server] - 1)
```

### Example 2: Resource Allocation as Auction

**Economic System**: VCG auction allocates goods efficiently
**Computational System**: Task scheduling with priorities

```python
def vcg_task_scheduler(tasks, resources):
    """
    Apply VCG mechanism to task scheduling.

    Each task "bids" its priority/value.
    Truthful reporting of priority is dominant strategy.

    Mathematical guarantee:
    Tasks can't benefit by misreporting priority.
    """
    # Sort by value (truthful bids)
    sorted_tasks = sorted(tasks, key=lambda t: -t.priority)

    allocation = []
    for task in sorted_tasks:
        if resources.available():
            # Winner gets resource
            resources.allocate(task)
            allocation.append(task)

            # VCG payment: externality imposed on others
            # (In scheduling: delay caused to other tasks)

    return allocation
```

### Example 3: Multi-Objective as Pareto Frontier

**Economic System**: Pareto efficiency in allocation
**Computational System**: Multi-objective optimization

```python
def find_pareto_frontier(solutions, objectives):
    """
    Find Pareto-efficient solutions.

    A solution is Pareto-optimal if no other solution
    is better in all objectives.

    Mathematical definition:
    x* is Pareto-optimal if there is no x such that
    f_i(x) ≥ f_i(x*) for all i, with strict inequality for some i.
    """
    pareto = []

    for candidate in solutions:
        is_dominated = False

        for other in solutions:
            if other == candidate:
                continue

            # Check if 'other' dominates 'candidate'
            all_better_or_equal = all(
                objectives[i](other) >= objectives[i](candidate)
                for i in range(len(objectives))
            )
            some_strictly_better = any(
                objectives[i](other) > objectives[i](candidate)
                for i in range(len(objectives))
            )

            if all_better_or_equal and some_strictly_better:
                is_dominated = True
                break

        if not is_dominated:
            pareto.append(candidate)

    return pareto
```

### Example 4: Competitive Dynamics as Price War

**Economic System**: Bertrand competition (price competition)
**Computational System**: Algorithm performance competition

```python
def bertrand_competition_dynamics(firms, marginal_costs, max_steps):
    """
    Bertrand model: firms compete on price.

    Equilibrium: P = MC (marginal cost)

    In competition, prices are driven down to cost.
    Application: Competitive optimization drives to efficiency frontier.
    """
    prices = {f: f.initial_price for f in firms}

    for step in range(max_steps):
        # Each firm undercuts lowest competitor
        for firm in firms:
            competitors_prices = [p for f, p in prices.items() if f != firm]
            min_competitor = min(competitors_prices)

            # Undercut if profitable
            if min_competitor > marginal_costs[firm]:
                prices[firm] = min_competitor - 0.01
            else:
                prices[firm] = marginal_costs[firm]

    return prices  # Converges to marginal cost
```

## Validated Economic Phenomena

### 1. Invisible Hand (Market Efficiency)
Competitive equilibrium is Pareto efficient (First Welfare Theorem).
**Application**: Decentralized algorithms can achieve global optimality.

### 2. Price Signals
Prices encode information about scarcity and value.
**Application**: Cost metrics in systems encode resource scarcity.

### 3. Tragedy of the Commons
Shared resources are overused without proper incentives.
**Application**: Rate limiting, quotas, congestion pricing.

### 4. Network Effects
Value increases with number of users.
**Application**: Viral growth, platform dynamics.

### 5. Arbitrage Elimination
Profit opportunities are quickly exploited away.
**Application**: Caching, optimization, market making.

## Mathematical Mapping

| Economic Concept | Mathematical Form | Computational Analog |
|-----------------|-------------------|---------------------|
| Utility | U(x) | Objective function |
| Budget constraint | p·x ≤ w | Resource limits |
| Price | p | Cost/priority |
| Demand | D(p) | Resource requests |
| Supply | S(p) | Available capacity |
| Equilibrium | S(p*)=D(p*) | Balanced load |
| Nash equilibrium | Best response fixed point | Stable multi-agent state |
| Pareto frontier | Non-dominated set | Trade-off boundary |
| Auction | max bid wins, pays price | Priority queue with pricing |
| Mechanism design | Incentive compatibility | Truthful reporting protocols |
