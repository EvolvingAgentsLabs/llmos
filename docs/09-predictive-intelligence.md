# Chapter 9: Predictive Intelligence -- Thinking Before Acting

A robot exploring an unfamiliar building has a problem that no path planner can solve: most of the world is unknown. At any given moment, the occupancy grid is a small island of observed cells surrounded by a vast sea of grey `unknown` territory. A naive explorer treats every unknown cell the same way -- as a void with no information. But a smarter system can do better. If the robot has observed three wall cells in a straight line, it is a reasonable bet that the fourth cell in that direction is also a wall. If it has seen parallel walls flanking a corridor for five cells, the corridor probably continues. These are not certainties, they are hunches -- spatial hunches that let the robot plan better paths, avoid dead ends, and explore more efficiently. In LLMos, this capability lives in the **Predictive World Model**.

## Why Predict?

The navigation loop (Chapter 4) generates candidates for the LLM to evaluate and plans paths using A* on the occupancy grid. Both of these systems are limited by what the robot has actually observed. Candidate generation only proposes frontiers (cells adjacent to unknown space), and A* can only route through cells marked `free` or `explored`. Everything else is a wall or a mystery.

This creates a bootstrapping problem. Early in exploration, the robot has seen almost nothing. Candidate generation produces dozens of frontier cells with no way to rank them. A* paths must route around enormous unknown regions. The LLM has to make decisions with very little spatial context.

Prediction changes the equation. By filling in some of those unknown cells with low-confidence guesses, the system gives the path planner more terrain to work with, helps candidate generation prioritize promising directions, and provides the LLM with a more complete picture of the arena. The key constraint is that predictions must be clearly marked as predictions -- low confidence, easily overridden by real observations -- so they never mislead the system into treating a guess as a fact.

## The Architecture: Heuristics, Not LLMs

The Predictive World Model is deliberately not an LLM-based predictor. It runs zero inference calls. It is a fast, deterministic set of spatial heuristics that execute in microseconds on every navigation cycle. The design rationale is simple: prediction happens on the hot path, every single cycle, and adding even a 100ms inference call would double the cycle time. Spatial extrapolation from observed patterns is exactly the kind of task that hand-coded heuristics handle well.

The implementation lives in `lib/runtime/predictive-world-model.ts`.

## Types and Configuration

Every prediction carries metadata about what was predicted, how confident the system is, and which heuristic produced it:

```typescript
// lib/runtime/predictive-world-model.ts

export interface Prediction {
  /** Grid coordinates */
  gx: number;
  gy: number;
  /** Predicted cell state */
  predictedState: CellState;
  /** Prediction confidence */
  confidence: number;
  /** Which heuristic produced this prediction */
  source: 'wall_continuation' | 'corridor' | 'open_space' | 'boundary';
  /** Timestamp of prediction */
  timestamp: number;
}
```

The `source` field is critical for diagnostics. When a prediction turns out to be wrong, knowing which heuristic generated it tells you whether wall continuation is too aggressive, or whether corridor detection is misfiring on non-corridor geometry.

Prediction results aggregate statistics across the model's lifetime:

```typescript
// lib/runtime/predictive-world-model.ts

export interface PredictionResult {
  /** Number of cells predicted */
  predictedCount: number;
  /** Number of cells verified (matched observation) */
  verifiedCount: number;
  /** Number of cells that were wrong */
  wrongCount: number;
  /** Prediction accuracy (verified / (verified + wrong)) */
  accuracy: number;
  /** All active predictions */
  predictions: Prediction[];
}
```

Configuration controls how aggressively each heuristic operates:

```typescript
// lib/runtime/predictive-world-model.ts

export interface PredictiveModelConfig {
  /** Confidence assigned to wall continuation predictions (default: 0.3) */
  wallContinuationConfidence: number;
  /** Confidence assigned to corridor predictions (default: 0.25) */
  corridorConfidence: number;
  /** Confidence assigned to open space predictions (default: 0.2) */
  openSpaceConfidence: number;
  /** Max distance to extrapolate wall continuation in cells (default: 5) */
  maxWallExtrapolation: number;
  /** Min corridor length in cells before predicting continuation (default: 3) */
  minCorridorLength: number;
  /** Whether predictions can be overridden by observations (default: true) */
  verifyOnObservation: boolean;
}

const DEFAULT_CONFIG: PredictiveModelConfig = {
  wallContinuationConfidence: 0.3,
  corridorConfidence: 0.25,
  openSpaceConfidence: 0.2,
  maxWallExtrapolation: 5,
  minCorridorLength: 3,
  verifyOnObservation: true,
};
```

Notice the confidence values. Wall continuation is the most confident at 0.3 -- still well below the 0.6+ confidence that real sensor readings produce. Open space is the least confident at 0.2. These values ensure that any real observation will override a prediction, because sensor data always arrives with higher confidence.

## The Four Heuristics

The `predict()` method runs four heuristics in sequence. Each one scans the grid for a specific pattern and fills unknown cells with predictions. Here is the top-level orchestration:

```typescript
// lib/runtime/predictive-world-model.ts

predict(worldModel: WorldModel): number {
  const grid = worldModel.getGrid();
  const dims = worldModel.getGridDimensions();
  const now = Date.now();
  let newPredictions = 0;

  // Pass 1: Wall continuation — extend observed walls into unknown territory
  newPredictions += this.predictWallContinuation(grid, dims, now);

  // Pass 2: Corridor detection — if parallel walls, predict they continue
  newPredictions += this.predictCorridors(grid, dims, now);

  // Pass 3: Open space — if large free area, predict it extends
  newPredictions += this.predictOpenSpace(grid, dims, now);

  // Pass 4: Boundary walls — if arena has bounds, predict walls at edges
  newPredictions += this.predictBoundaryWalls(grid, dims, now);

  // Apply predictions to the grid
  this.applyPredictions(worldModel);

  return newPredictions;
}
```

### Heuristic 1: Wall Continuation

The simplest and most reliable heuristic. If the robot has observed two or more wall/obstacle cells in a line, it predicts the wall continues in that direction for up to `maxWallExtrapolation` cells (default: 5).

The algorithm scans every wall cell, checks each of the four cardinal directions for an adjacent wall cell behind it (confirming a wall segment of at least two cells), then projects forward into unknown territory:

```typescript
// lib/runtime/predictive-world-model.ts

for (let step = 1; step <= this.config.maxWallExtrapolation; step++) {
  const nx = gx + dx * step;
  const ny = gy + dy * step;
  if (!this.isValidCoord(nx, ny, dims)) break;
  if (grid[ny][nx].state !== 'unknown') break;

  const key = `${nx},${ny}`;
  if (!this.predictions.has(key)) {
    this.predictions.set(key, {
      gx: nx, gy: ny,
      predictedState: 'wall',
      confidence: this.config.wallContinuationConfidence * (1 - step * 0.1),
      source: 'wall_continuation',
      timestamp: now,
    });
    count++;
  }
}
```

The confidence decay formula -- `0.3 * (1 - step * 0.1)` -- means the first predicted cell gets confidence 0.27, the second gets 0.24, and by the fifth cell the confidence is down to 0.15. The farther from observed reality, the less confident the system is. This is epistemic humility encoded directly in the math.

The projection stops immediately if it hits a cell that is already known (not `unknown`). There is no point predicting what the robot has already seen.

### Heuristic 2: Corridor Detection

Corridors are one of the most common indoor structures: parallel walls with free space between them. If the robot has observed this pattern for at least `minCorridorLength` cells (default: 3), the heuristic predicts the corridor continues.

The detection scans in two passes -- horizontal corridors (walls above and below free cells) and vertical corridors (walls left and right of free cells):

```typescript
// lib/runtime/predictive-world-model.ts

const isWallAbove = this.isWallOrObs(grid, gx, gy - 1, dims);
const isWallBelow = this.isWallOrObs(grid, gx, gy + 1, dims);
const isFreeCenter = grid[gy][gx].state === 'free' || grid[gy][gx].state === 'explored';

if (isWallAbove && isWallBelow && isFreeCenter) {
  corridorLen++;
}
```

When a corridor of sufficient length is found, the `extrapolateCorridor()` method projects it forward. Crucially, it predicts not just the free center cells but also the walls on either side, creating a complete corridor structure in the predicted region. The wall predictions use 80% of the corridor confidence (`corridorConfidence * 0.8`), reflecting slightly less certainty about the walls than the passable center.

### Heuristic 3: Open Space Expansion

If a free cell has two or more free neighbors and at least one unknown neighbor, the heuristic predicts the unknown neighbor is also free. This captures the intuition that open rooms tend to extend beyond their observed boundaries.

```typescript
// lib/runtime/predictive-world-model.ts

// If mostly free neighbors and some unknown, predict unknown as free
if (freeNeighbors >= 2 && unknownNeighbors > 0) {
  for (const [nx, ny] of neighbors) {
    if (!this.isValidCoord(nx, ny, dims)) continue;
    if (grid[ny][nx].state !== 'unknown') continue;

    const key = `${nx},${ny}`;
    if (!this.predictions.has(key)) {
      this.predictions.set(key, {
        gx: nx, gy: ny,
        predictedState: 'free',
        confidence: this.config.openSpaceConfidence,
        source: 'open_space',
        timestamp: now,
      });
      count++;
    }
  }
}
```

This is the least confident heuristic at 0.2. Open spaces are harder to predict than walls because they have fewer structural constraints. A wall is a wall, but an open room could have furniture, columns, or doorways anywhere within it.

### Heuristic 4: Boundary Walls

Most indoor arenas have walls at their edges. If the robot has observed more than five wall cells along the grid boundaries (top, bottom, left, right edges), it predicts that all remaining unknown edge cells are also walls:

```typescript
// lib/runtime/predictive-world-model.ts

// If some edges have walls, predict remaining edge unknowns as walls
if (edgeWallCount > 5) {
  for (const { gx, gy } of edges) {
    if (grid[gy][gx].state !== 'unknown') continue;

    const key = `${gx},${gy}`;
    if (!this.predictions.has(key)) {
      this.predictions.set(key, {
        gx, gy,
        predictedState: 'wall',
        confidence: this.config.wallContinuationConfidence,
        source: 'boundary',
        timestamp: now,
      });
      count++;
    }
  }
}
```

The threshold of five wall cells prevents false positives when the robot has barely started exploring. Once it has seen enough of the boundary to confirm a pattern, it fills in the rest.

## The Verification Pipeline

Predictions are only useful if the system knows whether they were right or wrong. The `verify()` method handles this. It runs before `predict()` in each cycle, checking whether any previously predicted cells have since been observed by real sensors:

```typescript
// lib/runtime/predictive-world-model.ts

verify(worldModel: WorldModel): { verified: number; wrong: number } {
  if (!this.config.verifyOnObservation) return { verified: 0, wrong: 0 };

  const grid = worldModel.getGrid();
  let verified = 0;
  let wrong = 0;

  for (const [key, prediction] of this.predictions.entries()) {
    const { gx, gy } = prediction;
    if (!worldModel.isValidGridCoord(gx, gy)) {
      this.predictions.delete(key);
      continue;
    }

    const cell = grid[gy][gx];

    // Cell has been observed (confidence > prediction confidence)
    if (cell.confidence > prediction.confidence && cell.lastUpdated > prediction.timestamp) {
      const isObstacleType = (s: CellState) => s === 'obstacle' || s === 'wall';
      const isFreeType = (s: CellState) => s === 'free' || s === 'explored';

      const predictionCorrect =
        (isObstacleType(prediction.predictedState) && isObstacleType(cell.state)) ||
        (isFreeType(prediction.predictedState) && isFreeType(cell.state)) ||
        (prediction.predictedState === cell.state);

      if (predictionCorrect) {
        verified++;
        this.verifiedCount++;
      } else {
        wrong++;
        this.wrongCount++;
      }

      this.predictions.delete(key);
    }
  }

  return { verified, wrong };
}
```

The verification logic is intentionally forgiving about exact state matches. A prediction of `wall` that turns out to be `obstacle` is counted as correct, because both are impassable. A prediction of `free` that turns out to be `explored` is also correct -- the robot just happened to visit it. What matters for navigation is whether the cell is traversable or not, not the precise label.

The overall accuracy is tracked as `verifiedCount / (verifiedCount + wrongCount)` and is available via `getResult()`. This metric tells you how much to trust the predictive model's output. An accuracy above 0.7 means predictions are reliable enough to meaningfully improve path planning.

## Integration with the Navigation Loop

The predictive model is integrated into the navigation loop via a configuration flag. In `lib/runtime/navigation-loop.ts`:

```typescript
// lib/runtime/navigation-loop.ts

export interface NavigationConfig {
  // ... other config fields ...
  /** Whether to run predictive world model each cycle (default: false) */
  enablePredictiveModel: boolean;
}
```

When enabled, the navigation loop creates a `PredictiveWorldModel` instance on initialization and runs it on every cycle, after sensor updates but before path planning:

```typescript
// lib/runtime/navigation-loop.ts

if (this.config.enablePredictiveModel) {
  this.predictiveModel = new PredictiveWorldModel();
}

// ... inside the cycle method:

// 7c. Run predictive world model (if enabled)
if (this.predictiveModel) {
  this.predictiveModel.verify(worldModel);
  this.predictiveModel.predict(worldModel);
}
```

The ordering matters. Verification happens first, so the system checks old predictions against the latest sensor data. Then prediction runs, generating new guesses based on the updated grid. By the time A* runs in step 8, the grid contains both observed cells and predicted cells, giving the planner a richer map to work with.

The feature is disabled by default (`enablePredictiveModel: false`) because it is an optimization, not a requirement. The navigation system works correctly without predictions -- it just explores more slowly. Enabling it is a single flag:

```typescript
const loop = new NavigationLoop(worldModel, bridge, infer, {
  enablePredictiveModel: true,
});
```

## Design Tradeoffs

The predictive model embodies several deliberate tradeoffs:

**Conservative confidence.** Predictions max out at 0.3 confidence. This guarantees that one real sensor reading will override any prediction. The system never convinces itself that a prediction is fact.

**No memory decay.** Predictions stay active until verified or overridden. In a slowly-exploring robot, a prediction made 30 seconds ago is just as valid as one made 2 seconds ago. There is no time-based expiration.

**Cardinal directions only.** Wall continuation only projects along the four cardinal directions, not diagonals. This is simpler and avoids ambiguity about which direction a wall segment is "pointing."

**No cross-heuristic interaction.** Each heuristic runs independently. A corridor prediction does not influence wall continuation, and vice versa. This keeps the system modular and debuggable, at the cost of missing some compound patterns.

## Chapter Summary

The Predictive World Model is a lightweight spatial extrapolation engine that fills unknown grid cells with low-confidence guesses. Four heuristics -- wall continuation, corridor detection, open space expansion, and boundary walls -- analyze observed patterns and project them into unexplored territory. Every prediction carries metadata about its source and confidence, and every prediction is verified when the robot eventually observes that cell. The system provides honest feedback about its own accuracy and never lets a guess override real sensor data. It runs on every navigation cycle with zero inference cost, making exploration faster without compromising the integrity of the world model.

---

*Previous: [Chapter 8 -- Agents, Skills, and the Markdown OS](08-agents-and-skills.md)*

*Next: [Chapter 10 -- Fleet Coordination: Multiple Robots, One World](10-fleet-coordination.md)*
