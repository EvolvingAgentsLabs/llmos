/**
 * World Model Bridge
 *
 * Bridges the Three.js simulation state (Robot4World) to the WorldModel
 * occupancy grid. This is the ground-truth pipeline: the simulation knows
 * where every wall, obstacle, and beacon is, and we rasterize that knowledge
 * onto the 50x50 grid.
 *
 * In Phase 4, this bridge will be swapped for an observation-based bridge
 * that builds the grid from sensor data alone. The LLM never knows the
 * difference — the serialization format is identical.
 *
 * Pipeline:
 *   Robot4World (walls, obstacles, beacons, bounds)
 *     → rasterize onto WorldModel grid
 *     → register objects in SceneGraph (optional)
 *     → compute frontier cells
 *     → produce serialized output via WorldModelSerializer
 */

import WorldModel, { getWorldModel, type CellState, type WorldModelConfig } from './world-model';
import type { Robot4World } from './robot4-runtime';

// =============================================================================
// Types
// =============================================================================

export interface BridgeConfig {
  /** Device/robot ID for the WorldModel singleton */
  deviceId: string;
  /** Obstacle inflation radius in grid cells (safety margin) */
  inflationCells: number;
  /** Whether to mark the full arena boundary as walls */
  rasterizeBounds: boolean;
  /** Whether to mark beacons as collectibles */
  rasterizeBeacons: boolean;
  /** World model config overrides */
  worldModelConfig?: Partial<WorldModelConfig>;
}

const DEFAULT_BRIDGE_CONFIG: BridgeConfig = {
  deviceId: 'sim',
  inflationCells: 1,
  rasterizeBounds: true,
  rasterizeBeacons: true,
};

export interface FrontierCell {
  /** Grid X coordinate */
  gx: number;
  /** Grid Y coordinate */
  gy: number;
  /** World X coordinate (meters) */
  wx: number;
  /** World Y coordinate (meters) */
  wy: number;
  /** Number of unknown neighbors (higher = more frontier-like) */
  unknownNeighbors: number;
}

// =============================================================================
// Bridge Interface
// =============================================================================

/**
 * Abstract bridge interface for feeding world model data to the navigation stack.
 *
 * Two implementations:
 *   1. WorldModelBridge (ground-truth): rasterizes the full simulation world
 *   2. VisionWorldModelBridge (observation-based): builds grid from camera + VLM output
 *
 * The navigation loop, candidate generator, and world model provider all
 * depend on this interface — never on a concrete implementation.
 */
export interface IWorldModelBridge {
  /** Get the underlying WorldModel instance */
  getWorldModel(): WorldModel;
  /** Update the bridge with current robot pose (marks cell as explored) */
  updateRobotPose(pose: { x: number; y: number; rotation: number }, timestamp?: number): void;
  /** Find frontier cells (free/explored cells adjacent to unknown cells) */
  findFrontiers(): FrontierCell[];
  /** Check whether the bridge has been initialized (rasterized or first sensor update) */
  isRasterized(): boolean;
  /** Reset the bridge state */
  reset(): void;
}

// =============================================================================
// Ground-Truth World Model Bridge (Simulation)
// =============================================================================

export class WorldModelBridge implements IWorldModelBridge {
  private config: BridgeConfig;
  private worldModel: WorldModel;
  private rasterized: boolean = false;

  constructor(config: Partial<BridgeConfig> = {}) {
    this.config = { ...DEFAULT_BRIDGE_CONFIG, ...config };

    // Determine world model config from bridge config
    const wmConfig = this.config.worldModelConfig ?? {};
    this.worldModel = getWorldModel(this.config.deviceId, wmConfig);
  }

  /**
   * Get the underlying WorldModel instance
   */
  getWorldModel(): WorldModel {
    return this.worldModel;
  }

  /**
   * Rasterize the simulation world onto the occupancy grid.
   * Call this once when the simulation starts, or when the world changes.
   *
   * This writes ground-truth knowledge: walls become 'wall' cells,
   * obstacles become 'obstacle' cells, and all other cells inside bounds
   * become 'free'.
   */
  rasterize(world: Robot4World): void {
    const grid = this.worldModel.getGrid();
    const dims = this.worldModel.getGridDimensions();
    const timestamp = Date.now();

    // Step 1: Mark all cells inside bounds as 'free'
    if (this.config.rasterizeBounds) {
      for (let gy = 0; gy < dims.height; gy++) {
        for (let gx = 0; gx < dims.width; gx++) {
          const { x: wx, y: wy } = this.worldModel.gridToWorld(gx, gy);
          if (
            wx >= world.bounds.minX &&
            wx <= world.bounds.maxX &&
            wy >= world.bounds.minY &&
            wy <= world.bounds.maxY
          ) {
            grid[gy][gx].state = 'free';
            grid[gy][gx].confidence = 1.0;
            grid[gy][gx].lastUpdated = timestamp;
          }
        }
      }
    }

    // Step 2: Rasterize walls as line segments
    for (const wall of world.walls) {
      this.rasterizeLine(
        wall.x1, wall.y1, wall.x2, wall.y2,
        'wall', 1.0, timestamp
      );
    }

    // Step 3: Rasterize circular obstacles
    for (const obs of world.obstacles) {
      this.rasterizeCircle(
        obs.x, obs.y, obs.radius,
        'obstacle', 1.0, timestamp
      );
    }

    // Step 4: Rasterize beacons as collectibles
    if (this.config.rasterizeBeacons) {
      for (const beacon of world.beacons) {
        if (beacon.active) {
          const { gx, gy } = this.worldModel.worldToGrid(beacon.x, beacon.y);
          if (this.worldModel.isValidGridCoord(gx, gy)) {
            grid[gy][gx].state = 'collectible';
            grid[gy][gx].confidence = 1.0;
            grid[gy][gx].lastUpdated = timestamp;
          }
        }
      }
    }

    // Step 5: Apply obstacle inflation (safety margin)
    if (this.config.inflationCells > 0) {
      this.inflateObstacles(this.config.inflationCells);
    }

    this.rasterized = true;
  }

  /**
   * Update the bridge with current robot state.
   * Marks the robot's current cell as 'explored'.
   */
  updateRobotPose(
    pose: { x: number; y: number; rotation: number },
    timestamp: number = Date.now()
  ): void {
    const { gx, gy } = this.worldModel.worldToGrid(pose.x, pose.y);
    if (this.worldModel.isValidGridCoord(gx, gy)) {
      const grid = this.worldModel.getGrid();
      const cell = grid[gy][gx];
      // Only mark as explored if it's free (don't overwrite walls/obstacles)
      if (cell.state === 'free' || cell.state === 'explored') {
        cell.state = 'explored';
        cell.confidence = 1.0;
        cell.lastUpdated = timestamp;
        cell.visitCount++;
      }
    }
  }

  /**
   * Find frontier cells: free/explored cells adjacent to unknown cells.
   * These are the boundaries of knowledge — natural exploration targets.
   */
  findFrontiers(): FrontierCell[] {
    const grid = this.worldModel.getGrid();
    const dims = this.worldModel.getGridDimensions();
    const frontiers: FrontierCell[] = [];

    for (let gy = 1; gy < dims.height - 1; gy++) {
      for (let gx = 1; gx < dims.width - 1; gx++) {
        const cell = grid[gy][gx];
        // Frontier cells must be free or explored
        if (cell.state !== 'free' && cell.state !== 'explored') continue;

        // Count unknown neighbors (4-connected)
        let unknownNeighbors = 0;
        if (grid[gy - 1][gx].state === 'unknown') unknownNeighbors++;
        if (grid[gy + 1][gx].state === 'unknown') unknownNeighbors++;
        if (grid[gy][gx - 1].state === 'unknown') unknownNeighbors++;
        if (grid[gy][gx + 1].state === 'unknown') unknownNeighbors++;

        if (unknownNeighbors > 0) {
          const { x: wx, y: wy } = this.worldModel.gridToWorld(gx, gy);
          frontiers.push({ gx, gy, wx, wy, unknownNeighbors });
        }
      }
    }

    // Sort by number of unknown neighbors (more frontier-like first)
    frontiers.sort((a, b) => b.unknownNeighbors - a.unknownNeighbors);

    return frontiers;
  }

  /**
   * Check if the world has been rasterized
   */
  isRasterized(): boolean {
    return this.rasterized;
  }

  /**
   * Reset the bridge (clear WorldModel and rasterization state)
   */
  reset(): void {
    this.rasterized = false;
    this.worldModel.resetSerializer();
  }

  // ---------------------------------------------------------------------------
  // Rasterization primitives
  // ---------------------------------------------------------------------------

  /**
   * Rasterize a line segment onto the grid using Bresenham's algorithm.
   */
  private rasterizeLine(
    x1: number, y1: number,
    x2: number, y2: number,
    state: CellState,
    confidence: number,
    timestamp: number
  ): void {
    const grid = this.worldModel.getGrid();
    const start = this.worldModel.worldToGrid(x1, y1);
    const end = this.worldModel.worldToGrid(x2, y2);

    // Bresenham's line algorithm
    let gx = start.gx;
    let gy = start.gy;
    const dx = Math.abs(end.gx - start.gx);
    const dy = Math.abs(end.gy - start.gy);
    const sx = start.gx < end.gx ? 1 : -1;
    const sy = start.gy < end.gy ? 1 : -1;
    let err = dx - dy;

    while (true) {
      if (this.worldModel.isValidGridCoord(gx, gy)) {
        grid[gy][gx].state = state;
        grid[gy][gx].confidence = confidence;
        grid[gy][gx].lastUpdated = timestamp;
      }

      if (gx === end.gx && gy === end.gy) break;

      const e2 = 2 * err;
      if (e2 > -dy) {
        err -= dy;
        gx += sx;
      }
      if (e2 < dx) {
        err += dx;
        gy += sy;
      }
    }
  }

  /**
   * Rasterize a filled circle onto the grid.
   */
  private rasterizeCircle(
    cx: number, cy: number, radius: number,
    state: CellState,
    confidence: number,
    timestamp: number
  ): void {
    const grid = this.worldModel.getGrid();
    const config = this.worldModel.getWorldConfig();
    const cellSize = config.gridResolution / 100; // cell size in meters

    // Scan a bounding box around the circle
    const minWx = cx - radius - cellSize;
    const maxWx = cx + radius + cellSize;
    const minWy = cy - radius - cellSize;
    const maxWy = cy + radius + cellSize;

    const minGrid = this.worldModel.worldToGrid(minWx, minWy);
    const maxGrid = this.worldModel.worldToGrid(maxWx, maxWy);

    const dims = this.worldModel.getGridDimensions();

    for (let gy = Math.max(0, minGrid.gy); gy <= Math.min(dims.height - 1, maxGrid.gy); gy++) {
      for (let gx = Math.max(0, minGrid.gx); gx <= Math.min(dims.width - 1, maxGrid.gx); gx++) {
        const { x: wx, y: wy } = this.worldModel.gridToWorld(gx, gy);
        const dist = Math.sqrt((wx - cx) ** 2 + (wy - cy) ** 2);

        if (dist <= radius) {
          grid[gy][gx].state = state;
          grid[gy][gx].confidence = confidence;
          grid[gy][gx].lastUpdated = timestamp;
        }
      }
    }
  }

  /**
   * Inflate obstacles by N cells in all directions.
   * Creates a safety margin around walls and obstacles.
   * Inflated cells are marked as 'obstacle' to prevent the planner
   * from generating paths too close to walls.
   */
  private inflateObstacles(cells: number): void {
    const grid = this.worldModel.getGrid();
    const dims = this.worldModel.getGridDimensions();

    // Collect all obstacle/wall positions
    const obstacles: Array<[number, number]> = [];
    for (let gy = 0; gy < dims.height; gy++) {
      for (let gx = 0; gx < dims.width; gx++) {
        const state = grid[gy][gx].state;
        if (state === 'obstacle' || state === 'wall') {
          obstacles.push([gx, gy]);
        }
      }
    }

    // Inflate each obstacle cell
    for (const [ox, oy] of obstacles) {
      for (let dy = -cells; dy <= cells; dy++) {
        for (let dx = -cells; dx <= cells; dx++) {
          if (dx === 0 && dy === 0) continue;

          const nx = ox + dx;
          const ny = oy + dy;

          if (this.worldModel.isValidGridCoord(nx, ny)) {
            const neighbor = grid[ny][nx];
            // Only inflate into free cells — don't overwrite other states
            if (neighbor.state === 'free') {
              neighbor.state = 'obstacle';
              neighbor.confidence = 0.7; // Lower confidence for inflated cells
            }
          }
        }
      }
    }
  }
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Create a WorldModelBridge for a simulation.
 * Typical usage:
 *
 * ```typescript
 * const bridge = createWorldModelBridge({ deviceId: 'robot-1' });
 * bridge.rasterize(runtime.getWorld());
 * // ... each cycle:
 * bridge.updateRobotPose(state.pose);
 * const frame = bridge.getWorldModel().serialize('auto', state.pose, goal);
 * ```
 */
export function createWorldModelBridge(
  config: Partial<BridgeConfig> = {}
): IWorldModelBridge {
  return new WorldModelBridge(config);
}
