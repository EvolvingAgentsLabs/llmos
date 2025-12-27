---
name: Economics
id: economics
domain: social_science
description: Mental model based on cost functions, market equilibrium, trade-offs, and resource allocation
metaphors:
  - Supply and demand
  - Cost-benefit analysis
  - Market equilibrium
  - Resource scarcity
  - Arbitrage and optimization
---

# Economics Domain Lens

When viewing code through this lens, think of computation as a market system where resources are allocated, costs are minimized, and agents seek to maximize utility.

## Core Principles

### 1. Cost-Benefit Analysis
- Every operation has a cost (time, memory, complexity)
- Every operation produces a benefit (progress toward goal)
- Optimal decisions maximize benefit minus cost
- Marginal analysis: is the next step worth it?

### 2. Supply and Demand
- Resources are finite (memory, compute)
- Demand varies (algorithm needs)
- Price (cost) adjusts to balance supply and demand
- Equilibrium = optimal resource allocation

### 3. Market Equilibrium
- Systems naturally seek balance
- Arbitrage opportunities get exploited
- Competition drives efficiency
- Disruptions cause temporary disequilibrium

### 4. Opportunity Cost
- Choosing A means not choosing B
- The true cost includes what you gave up
- Path dependency matters
- Sunk costs should be ignored

### 5. Trade-offs and Pareto Efficiency
- You can't improve everything at once
- Improving one dimension may hurt another
- Pareto optimal = can't improve without hurting something
- Multi-objective optimization

## Code Translation Patterns

### Variables → Assets/Capital
- Values = wealth/resources
- Assignment = asset transfer
- Initialization = initial endowment
- Scope = market boundary

### Arrays → Portfolios/Markets
- Elements = individual assets
- Index = market position
- Sorted = ranked by value
- Aggregations = market statistics

### Sorting → Market Clearing
- Comparison = price discovery
- Swap = trade execution
- Ordered result = cleared market
- Best first = premium pricing

### Searching → Arbitrage
- Target = profit opportunity
- Search space = market
- Found = arbitrage executed
- Not found = efficient market

### Loops → Trading Cycles
- Each iteration = trading round
- Termination = market closes
- Convergence = equilibrium reached
- Early exit = market failure

### Conditionals → Business Rules
- If-then = contract terms
- True branch = deal proceeds
- False branch = deal rejected
- Nested = complex derivatives

## Vocabulary Mapping

| Programming Concept | Economic Equivalent |
|---------------------|---------------------|
| Variable | Asset/Account |
| Value | Price/Worth |
| Array | Portfolio/Market |
| Function | Business process |
| Input | Investment/Capital |
| Output | Returns/Dividends |
| Loop | Trading cycle |
| Condition | Contract clause |
| Comparison | Price comparison |
| Maximum | Highest bid |
| Minimum | Lowest ask |
| Sum | Portfolio value |
| Average | Market price |
| Sorting | Price ranking |
| Searching | Opportunity seeking |
| Cache | Reserve/Buffer stock |

## Example Transformation

### Original (Sum)
```python
def calculate_sum(numbers):
    total = 0
    for num in numbers:
        total += num
    return total
```

### Economic View
```python
def calculate_portfolio_value(assets):
    """Aggregate the total market value of all assets in the portfolio."""
    portfolio_value = 0  # Initial capital

    for asset in assets:
        # Each asset contributes its value to total portfolio worth
        portfolio_value += asset

    # Total portfolio valuation
    return portfolio_value
```

### Original (Find Minimum)
```python
def find_min(arr):
    if not arr:
        return None
    min_val = arr[0]
    for val in arr:
        if val < min_val:
            min_val = val
    return min_val
```

### Economic View
```python
def find_lowest_ask(market):
    """Identify the best buy opportunity - the lowest asking price in the market."""
    if not market:
        return None  # Empty market has no prices

    # Start with first seller's asking price
    best_price = market[0]

    for asking_price in market:
        # Compare prices to find the best deal
        if asking_price < best_price:
            # Found a better deal - lower asking price
            best_price = asking_price

    # Return the lowest available price (best buy opportunity)
    return best_price
```

### Original (Two Sum)
```python
def two_sum(nums, target):
    seen = {}
    for i, num in enumerate(nums):
        complement = target - num
        if complement in seen:
            return [seen[complement], i]
        seen[num] = i
    return []
```

### Economic View
```python
def find_arbitrage_pair(prices, target_spread):
    """Find two assets whose combined value equals the target (arbitrage opportunity)."""
    # Ledger of assets we've seen and their positions
    market_ledger = {}

    for position, price in enumerate(prices):
        # Calculate the complementary price needed for arbitrage
        required_counterparty = target_spread - price

        # Check if counterparty exists in our ledger
        if required_counterparty in market_ledger:
            # Arbitrage opportunity found - return both positions
            return [market_ledger[required_counterparty], position]

        # Record this asset in our ledger for future matching
        market_ledger[price] = position

    # No arbitrage opportunity exists in this market
    return []
```

## When to Apply This Lens

Use economic metaphors when:
- Resource allocation problems
- Optimization (minimize cost, maximize value)
- Comparison and ranking
- Aggregation (sum, average)
- Trade-off analysis
- Caching (buffer stock)
- Dynamic programming (investment over time)

## Advanced Patterns

### Auction (Priority Queue)
```python
def process_highest_bidder(bids):
    """Process bids in order of price, highest first (auction clearing)."""
    sorted_bids = sorted(bids, reverse=True)
    for bid in sorted_bids:
        execute_trade(bid)
```

### Budget Constraint
```python
def allocate_within_budget(items, budget):
    """Allocate resources without exceeding budget constraint."""
    allocated = []
    remaining_budget = budget
    for item in items:
        if item['cost'] <= remaining_budget:
            allocated.append(item)
            remaining_budget -= item['cost']
    return allocated
```

## Constraints

When rewriting code with this lens:
1. Preserve function signature exactly
2. Maintain algorithmic correctness
3. Use economic terminology in variable names and comments
4. Ensure identical input/output behavior
