/**
 * Predictive World Model (Phase 5)
 *
 * Predicts what's in unknown grid cells based on observed patterns.
 * Uses spatial heuristics to extrapolate from known regions:
 *
 *   1. Wall continuation: if a wall is observed, predict it continues
 *   2. Corridor detection: if walls form a corridor, predict continuation
 *   3. Open space expansion: if a large open area is seen, predict it extends
 *   4. Symmetry: if the arena has symmetry, mirror known structure
 *
 * Predictions are marked with low confidence and verified when the
 * robot actually observes those cells. Correct predictions boost the
 * model's confidence; incorrect predictions trigger re-evaluation.
 *
 * Pipeline:
 *   Observed Grid → Pattern Extraction → Spatial Heuristics
 *     → Fill Unknown Cells (low confidence) → Verification on Observation
 *
 * This is NOT an LLM-based prediction — it's a fast, deterministic
 * spatial extrapolation that runs every cycle without inference cost.
 */

import type WorldModel from './world-model';
import type { GridCell, CellState } from './world-model';

// =============================================================================
// Types
// =============================================================================

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

// =============================================================================
// Predictive World Model
// =============================================================================

export class PredictiveWorldModel {
  private config: PredictiveModelConfig;
  private predictions: Map<string, Prediction> = new Map();
  private verifiedCount: number = 0;
  private wrongCount: number = 0;

  constructor(config: Partial<PredictiveModelConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Run prediction pass: analyze the current grid and fill unknown cells.
   * Returns the number of new predictions made.
   */
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

  /**
   * Verify predictions against new observations.
   * Call this after updating the grid with real sensor data.
   */
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

  /**
   * Get prediction statistics.
   */
  getResult(): PredictionResult {
    const total = this.verifiedCount + this.wrongCount;
    return {
      predictedCount: this.predictions.size,
      verifiedCount: this.verifiedCount,
      wrongCount: this.wrongCount,
      accuracy: total > 0 ? this.verifiedCount / total : 1,
      predictions: Array.from(this.predictions.values()),
    };
  }

  /**
   * Reset all predictions and statistics.
   */
  reset(): void {
    this.predictions.clear();
    this.verifiedCount = 0;
    this.wrongCount = 0;
  }

  // ---------------------------------------------------------------------------
  // Heuristic 1: Wall Continuation
  // ---------------------------------------------------------------------------

  private predictWallContinuation(
    grid: GridCell[][],
    dims: { width: number; height: number },
    now: number
  ): number {
    let count = 0;

    for (let gy = 1; gy < dims.height - 1; gy++) {
      for (let gx = 1; gx < dims.width - 1; gx++) {
        const cell = grid[gy][gx];
        if (cell.state !== 'wall' && cell.state !== 'obstacle') continue;

        // Check 4 directions for wall continuation into unknown
        const directions = [
          { dx: 1, dy: 0 }, { dx: -1, dy: 0 },
          { dx: 0, dy: 1 }, { dx: 0, dy: -1 },
        ];

        for (const { dx, dy } of directions) {
          // Check if there's a wall segment in this direction (at least 2 cells)
          const prevX = gx - dx;
          const prevY = gy - dy;
          if (this.isValidCoord(prevX, prevY, dims) &&
              (grid[prevY][prevX].state === 'wall' || grid[prevY][prevX].state === 'obstacle')) {
            // Wall continues in this direction — extrapolate
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
          }
        }
      }
    }

    return count;
  }

  // ---------------------------------------------------------------------------
  // Heuristic 2: Corridor Detection
  // ---------------------------------------------------------------------------

  private predictCorridors(
    grid: GridCell[][],
    dims: { width: number; height: number },
    now: number
  ): number {
    let count = 0;

    // Scan for horizontal corridors (walls above and below free cells)
    for (let gy = 2; gy < dims.height - 2; gy++) {
      let corridorLen = 0;
      for (let gx = 0; gx < dims.width; gx++) {
        const isWallAbove = this.isWallOrObs(grid, gx, gy - 1, dims);
        const isWallBelow = this.isWallOrObs(grid, gx, gy + 1, dims);
        const isFreeCenter = grid[gy][gx].state === 'free' || grid[gy][gx].state === 'explored';

        if (isWallAbove && isWallBelow && isFreeCenter) {
          corridorLen++;
        } else {
          if (corridorLen >= this.config.minCorridorLength) {
            // Extrapolate corridor continuation
            count += this.extrapolateCorridor(grid, dims, gx, gy, 1, 0, now);
          }
          corridorLen = 0;
        }
      }
      if (corridorLen >= this.config.minCorridorLength) {
        count += this.extrapolateCorridor(grid, dims, dims.width - 1, gy, 1, 0, now);
      }
    }

    // Scan for vertical corridors (walls left and right of free cells)
    for (let gx = 2; gx < dims.width - 2; gx++) {
      let corridorLen = 0;
      for (let gy = 0; gy < dims.height; gy++) {
        const isWallLeft = this.isWallOrObs(grid, gx - 1, gy, dims);
        const isWallRight = this.isWallOrObs(grid, gx + 1, gy, dims);
        const isFreeCenter = grid[gy][gx].state === 'free' || grid[gy][gx].state === 'explored';

        if (isWallLeft && isWallRight && isFreeCenter) {
          corridorLen++;
        } else {
          if (corridorLen >= this.config.minCorridorLength) {
            count += this.extrapolateCorridor(grid, dims, gx, gy, 0, 1, now);
          }
          corridorLen = 0;
        }
      }
      if (corridorLen >= this.config.minCorridorLength) {
        count += this.extrapolateCorridor(grid, dims, gx, dims.height - 1, 0, 1, now);
      }
    }

    return count;
  }

  private extrapolateCorridor(
    grid: GridCell[][],
    dims: { width: number; height: number },
    endX: number, endY: number,
    dx: number, dy: number,
    now: number
  ): number {
    let count = 0;

    for (let step = 1; step <= this.config.maxWallExtrapolation; step++) {
      const nx = endX + dx * step;
      const ny = endY + dy * step;
      if (!this.isValidCoord(nx, ny, dims)) break;
      if (grid[ny][nx].state !== 'unknown') break;

      const key = `${nx},${ny}`;
      if (!this.predictions.has(key)) {
        this.predictions.set(key, {
          gx: nx, gy: ny,
          predictedState: 'free',
          confidence: this.config.corridorConfidence,
          source: 'corridor',
          timestamp: now,
        });
        count++;
      }

      // Also predict walls on the sides of the corridor continuation
      if (dx !== 0) {
        // Horizontal corridor → walls above and below
        for (const wallDy of [-1, 1]) {
          const wy = ny + wallDy;
          if (this.isValidCoord(nx, wy, dims) && grid[wy][nx].state === 'unknown') {
            const wKey = `${nx},${wy}`;
            if (!this.predictions.has(wKey)) {
              this.predictions.set(wKey, {
                gx: nx, gy: wy,
                predictedState: 'wall',
                confidence: this.config.corridorConfidence * 0.8,
                source: 'corridor',
                timestamp: now,
              });
              count++;
            }
          }
        }
      } else {
        // Vertical corridor → walls left and right
        for (const wallDx of [-1, 1]) {
          const wx = nx + wallDx;
          if (this.isValidCoord(wx, ny, dims) && grid[ny][wx].state === 'unknown') {
            const wKey = `${wx},${ny}`;
            if (!this.predictions.has(wKey)) {
              this.predictions.set(wKey, {
                gx: wx, gy: ny,
                predictedState: 'wall',
                confidence: this.config.corridorConfidence * 0.8,
                source: 'corridor',
                timestamp: now,
              });
              count++;
            }
          }
        }
      }
    }

    return count;
  }

  // ---------------------------------------------------------------------------
  // Heuristic 3: Open Space Expansion
  // ---------------------------------------------------------------------------

  private predictOpenSpace(
    grid: GridCell[][],
    dims: { width: number; height: number },
    now: number
  ): number {
    let count = 0;

    // Find free cells adjacent to unknown cells and predict free expansion
    for (let gy = 1; gy < dims.height - 1; gy++) {
      for (let gx = 1; gx < dims.width - 1; gx++) {
        const cell = grid[gy][gx];
        if (cell.state !== 'free' && cell.state !== 'explored') continue;

        // Count free neighbors vs obstacle neighbors
        let freeNeighbors = 0;
        let unknownNeighbors = 0;
        const neighbors = [
          [gx - 1, gy], [gx + 1, gy], [gx, gy - 1], [gx, gy + 1],
        ];

        for (const [nx, ny] of neighbors) {
          if (!this.isValidCoord(nx, ny, dims)) continue;
          const nState = grid[ny][nx].state;
          if (nState === 'free' || nState === 'explored') freeNeighbors++;
          if (nState === 'unknown') unknownNeighbors++;
        }

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
      }
    }

    return count;
  }

  // ---------------------------------------------------------------------------
  // Heuristic 4: Boundary Walls
  // ---------------------------------------------------------------------------

  private predictBoundaryWalls(
    grid: GridCell[][],
    dims: { width: number; height: number },
    now: number
  ): number {
    let count = 0;

    // If we see walls at grid edges, predict the entire edge is walled
    const edges = [
      // Top edge
      ...Array.from({ length: dims.width }, (_, x) => ({ gx: x, gy: 0 })),
      // Bottom edge
      ...Array.from({ length: dims.width }, (_, x) => ({ gx: x, gy: dims.height - 1 })),
      // Left edge
      ...Array.from({ length: dims.height }, (_, y) => ({ gx: 0, gy: y })),
      // Right edge
      ...Array.from({ length: dims.height }, (_, y) => ({ gx: dims.width - 1, gy: y })),
    ];

    // Check if any edge cells are walls
    let edgeWallCount = 0;
    for (const { gx, gy } of edges) {
      if (grid[gy][gx].state === 'wall') edgeWallCount++;
    }

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

    return count;
  }

  // ---------------------------------------------------------------------------
  // Apply Predictions to Grid
  // ---------------------------------------------------------------------------

  private applyPredictions(worldModel: WorldModel): void {
    const grid = worldModel.getGrid();

    for (const prediction of this.predictions.values()) {
      const { gx, gy } = prediction;
      if (!worldModel.isValidGridCoord(gx, gy)) continue;

      const cell = grid[gy][gx];

      // Only apply to unknown cells or cells with lower confidence
      if (cell.state === 'unknown' || cell.confidence < prediction.confidence) {
        cell.state = prediction.predictedState;
        cell.confidence = prediction.confidence;
        // Don't update lastUpdated — this is a prediction, not an observation
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private isValidCoord(x: number, y: number, dims: { width: number; height: number }): boolean {
    return x >= 0 && x < dims.width && y >= 0 && y < dims.height;
  }

  private isWallOrObs(
    grid: GridCell[][],
    x: number, y: number,
    dims: { width: number; height: number }
  ): boolean {
    if (!this.isValidCoord(x, y, dims)) return false;
    return grid[y][x].state === 'wall' || grid[y][x].state === 'obstacle';
  }
}

// =============================================================================
// Factory
// =============================================================================

export function createPredictiveModel(
  config: Partial<PredictiveModelConfig> = {}
): PredictiveWorldModel {
  return new PredictiveWorldModel(config);
}
