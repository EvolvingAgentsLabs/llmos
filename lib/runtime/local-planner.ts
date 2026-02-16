/**
 * Local Planner — A* Pathfinding on Occupancy Grid
 *
 * The LLM chooses WHERE to go (subgoal selection).
 * The local planner figures out HOW to get there (collision-free path).
 *
 * Pipeline:
 *   LLM decision (MOVE_TO target) → A* path on grid → waypoint list → HAL execution
 *
 * Safety guarantees:
 *   - Path is always collision-free at planning time
 *   - Emergency stop if distance sensor < safety threshold during execution
 *   - Reports failure back to LLM for replanning if path blocked
 *
 * The planner is the deterministic safety net. Even if the LLM makes a
 * questionable choice, the planner enforces collision-free paths and the
 * HAL enforces motor limits.
 */

import type { GridCell } from './world-model';

// =============================================================================
// Types
// =============================================================================

export interface PlannerConfig {
  /** Algorithm to use (default: 'astar') */
  algorithm: 'astar';
  /** Maximum planning time in ms (default: 100) */
  maxPlanningTimeMs: number;
  /** Obstacle inflation in cells for path planning (default: 1) */
  obstacleInflationCells: number;
  /** Waypoint spacing in grid cells (default: 3) */
  waypointSpacing: number;
  /** Distance to consider waypoint reached, in grid cells (default: 1) */
  waypointReachedThreshold: number;
  /** Whether to allow diagonal movement (default: true) */
  allowDiagonal: boolean;
  /** Cost multiplier for cells near obstacles (default: 2.0) */
  nearObstacleCostMultiplier: number;
  /** Cost for unknown cells — higher values make planner prefer known-free paths (default: 5) */
  unknownCellCost: number;
}

export interface PathResult {
  /** Whether a path was found */
  success: boolean;
  /** Waypoints in world coordinates (meters) */
  waypoints: PathWaypoint[];
  /** Total path cost (grid-distance units) */
  totalCost: number;
  /** Total path length in meters */
  pathLengthM: number;
  /** Number of grid cells in the raw path */
  rawPathLength: number;
  /** Planning time in ms */
  planningTimeMs: number;
  /** Error message if path not found */
  error?: string;
}

export interface PathWaypoint {
  /** World X coordinate (meters) */
  x: number;
  /** World Y coordinate (meters) */
  y: number;
  /** Grid X coordinate */
  gx: number;
  /** Grid Y coordinate */
  gy: number;
  /** Index in the waypoint list */
  index: number;
}

/** A* node for the priority queue */
interface AStarNode {
  gx: number;
  gy: number;
  /** Cost from start */
  g: number;
  /** Estimated total cost (g + heuristic) */
  f: number;
  /** Parent node for path reconstruction */
  parent: AStarNode | null;
}

const DEFAULT_CONFIG: PlannerConfig = {
  algorithm: 'astar',
  maxPlanningTimeMs: 100,
  obstacleInflationCells: 1,
  waypointSpacing: 3,
  waypointReachedThreshold: 1,
  allowDiagonal: true,
  nearObstacleCostMultiplier: 2.0,
  unknownCellCost: 5,
};

// =============================================================================
// Local Planner
// =============================================================================

export class LocalPlanner {
  private config: PlannerConfig;

  constructor(config: Partial<PlannerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Plan a path from start to goal on the occupancy grid.
   *
   * @param grid         The 2D occupancy grid from WorldModel
   * @param startGx      Start grid X
   * @param startGy      Start grid Y
   * @param goalGx       Goal grid X
   * @param goalGy       Goal grid Y
   * @param gridToWorld   Function to convert grid coords to world coords
   */
  planPath(
    grid: GridCell[][],
    startGx: number,
    startGy: number,
    goalGx: number,
    goalGy: number,
    gridToWorld: (gx: number, gy: number) => { x: number; y: number }
  ): PathResult {
    const startTime = performance.now();
    const rows = grid.length;
    const cols = grid[0]?.length ?? 0;

    // Validate start and goal
    if (!this.isInBounds(startGx, startGy, cols, rows)) {
      return this.failResult('Start position out of bounds', startTime);
    }
    if (!this.isInBounds(goalGx, goalGy, cols, rows)) {
      return this.failResult('Goal position out of bounds', startTime);
    }
    if (this.isBlocked(grid, goalGx, goalGy)) {
      return this.failResult('Goal position is blocked', startTime);
    }

    // Check if already at goal
    if (startGx === goalGx && startGy === goalGy) {
      const worldPos = gridToWorld(startGx, startGy);
      return {
        success: true,
        waypoints: [{ x: worldPos.x, y: worldPos.y, gx: startGx, gy: startGy, index: 0 }],
        totalCost: 0,
        pathLengthM: 0,
        rawPathLength: 1,
        planningTimeMs: performance.now() - startTime,
      };
    }

    // Build cost map (inflate obstacles)
    const costMap = this.buildCostMap(grid, rows, cols);

    // A* search
    const rawPath = this.astar(costMap, startGx, startGy, goalGx, goalGy, cols, rows, startTime);

    if (!rawPath) {
      return this.failResult('No path found — goal is unreachable', startTime);
    }

    // Downsample path to waypoints
    const waypoints = this.pathToWaypoints(rawPath, gridToWorld);

    // Calculate path length in meters
    let pathLength = 0;
    for (let i = 1; i < waypoints.length; i++) {
      const dx = waypoints[i].x - waypoints[i - 1].x;
      const dy = waypoints[i].y - waypoints[i - 1].y;
      pathLength += Math.sqrt(dx * dx + dy * dy);
    }

    // Calculate total cost
    let totalCost = 0;
    for (const [gx, gy] of rawPath) {
      totalCost += costMap[gy][gx];
    }

    return {
      success: true,
      waypoints,
      totalCost,
      pathLengthM: Math.round(pathLength * 100) / 100,
      rawPathLength: rawPath.length,
      planningTimeMs: Math.round((performance.now() - startTime) * 100) / 100,
    };
  }

  /**
   * Plan a path using world coordinates.
   * Convenience wrapper that handles coordinate conversion.
   */
  planPathWorld(
    grid: GridCell[][],
    startM: { x: number; y: number },
    goalM: { x: number; y: number },
    worldToGrid: (wx: number, wy: number) => { gx: number; gy: number },
    gridToWorld: (gx: number, gy: number) => { x: number; y: number }
  ): PathResult {
    const start = worldToGrid(startM.x, startM.y);
    const goal = worldToGrid(goalM.x, goalM.y);
    return this.planPath(grid, start.gx, start.gy, goal.gx, goal.gy, gridToWorld);
  }

  // ---------------------------------------------------------------------------
  // A* Implementation
  // ---------------------------------------------------------------------------

  private astar(
    costMap: number[][],
    startGx: number,
    startGy: number,
    goalGx: number,
    goalGy: number,
    cols: number,
    rows: number,
    startTime: number
  ): Array<[number, number]> | null {
    // Open set as a simple array (sorted by f-score)
    // For 50x50 grid this is fast enough; no need for a binary heap
    const open: AStarNode[] = [];
    const closed = new Set<number>();

    const startNode: AStarNode = {
      gx: startGx,
      gy: startGy,
      g: 0,
      f: this.heuristic(startGx, startGy, goalGx, goalGy),
      parent: null,
    };
    open.push(startNode);

    // Neighbor offsets
    const neighbors = this.config.allowDiagonal
      ? [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]]
      : [[-1, 0], [1, 0], [0, -1], [0, 1]];

    const diagonalCost = Math.SQRT2;

    while (open.length > 0) {
      // Check timeout
      if (performance.now() - startTime > this.config.maxPlanningTimeMs) {
        return null;
      }

      // Get node with lowest f-score
      let bestIdx = 0;
      for (let i = 1; i < open.length; i++) {
        if (open[i].f < open[bestIdx].f) bestIdx = i;
      }
      const current = open.splice(bestIdx, 1)[0];

      // Goal reached
      if (current.gx === goalGx && current.gy === goalGy) {
        return this.reconstructPath(current);
      }

      const currentKey = current.gy * cols + current.gx;
      if (closed.has(currentKey)) continue;
      closed.add(currentKey);

      // Expand neighbors
      for (const [dx, dy] of neighbors) {
        const nx = current.gx + dx;
        const ny = current.gy + dy;

        if (!this.isInBounds(nx, ny, cols, rows)) continue;

        const neighborKey = ny * cols + nx;
        if (closed.has(neighborKey)) continue;

        const cellCost = costMap[ny][nx];
        if (cellCost >= 999) continue; // Impassable

        // Movement cost (diagonal costs more)
        const isDiagonal = dx !== 0 && dy !== 0;
        const moveCost = isDiagonal ? diagonalCost : 1;

        const newG = current.g + moveCost * cellCost;
        const newF = newG + this.heuristic(nx, ny, goalGx, goalGy);

        // Check if we already have a better path to this node
        const existing = open.find(n => n.gx === nx && n.gy === ny);
        if (existing && existing.g <= newG) continue;

        if (existing) {
          // Update existing node
          existing.g = newG;
          existing.f = newF;
          existing.parent = current;
        } else {
          open.push({
            gx: nx,
            gy: ny,
            g: newG,
            f: newF,
            parent: current,
          });
        }
      }
    }

    return null; // No path found
  }

  /** Octile distance heuristic (consistent for 8-directional movement) */
  private heuristic(ax: number, ay: number, bx: number, by: number): number {
    const dx = Math.abs(ax - bx);
    const dy = Math.abs(ay - by);
    return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
  }

  private reconstructPath(node: AStarNode): Array<[number, number]> {
    const path: Array<[number, number]> = [];
    let current: AStarNode | null = node;
    while (current) {
      path.push([current.gx, current.gy]);
      current = current.parent;
    }
    path.reverse();
    return path;
  }

  // ---------------------------------------------------------------------------
  // Cost Map
  // ---------------------------------------------------------------------------

  /**
   * Build a cost map from the occupancy grid.
   * Obstacles/walls = 999 (impassable), free = 1, near obstacles = higher cost.
   */
  private buildCostMap(grid: GridCell[][], rows: number, cols: number): number[][] {
    const costMap: number[][] = [];

    // Base costs
    for (let y = 0; y < rows; y++) {
      costMap[y] = [];
      for (let x = 0; x < cols; x++) {
        const state = grid[y][x].state;
        if (state === 'obstacle' || state === 'wall') {
          costMap[y][x] = 999;
        } else if (state === 'unknown') {
          costMap[y][x] = this.config.unknownCellCost;
        } else {
          costMap[y][x] = 1;
        }
      }
    }

    // Inflate obstacle costs (cells near obstacles cost more)
    if (this.config.obstacleInflationCells > 0) {
      const inflation = this.config.obstacleInflationCells;
      const multiplier = this.config.nearObstacleCostMultiplier;

      // Collect obstacle positions first
      const obstacles: Array<[number, number]> = [];
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          if (costMap[y][x] >= 999) {
            obstacles.push([x, y]);
          }
        }
      }

      // Apply cost inflation around each obstacle
      for (const [ox, oy] of obstacles) {
        for (let dy = -inflation; dy <= inflation; dy++) {
          for (let dx = -inflation; dx <= inflation; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = ox + dx;
            const ny = oy + dy;
            if (this.isInBounds(nx, ny, cols, rows) && costMap[ny][nx] < 999) {
              const dist = Math.sqrt(dx * dx + dy * dy);
              const inflatedCost = 1 + (multiplier - 1) * (1 - dist / (inflation + 1));
              costMap[ny][nx] = Math.max(costMap[ny][nx], inflatedCost);
            }
          }
        }
      }
    }

    return costMap;
  }

  // ---------------------------------------------------------------------------
  // Path → Waypoints
  // ---------------------------------------------------------------------------

  /**
   * Downsample a raw grid path into spaced waypoints.
   * Always includes start and end points.
   */
  private pathToWaypoints(
    rawPath: Array<[number, number]>,
    gridToWorld: (gx: number, gy: number) => { x: number; y: number }
  ): PathWaypoint[] {
    if (rawPath.length === 0) return [];

    const waypoints: PathWaypoint[] = [];
    const spacing = this.config.waypointSpacing;

    // Always include start
    const [sx, sy] = rawPath[0];
    const startWorld = gridToWorld(sx, sy);
    waypoints.push({ x: startWorld.x, y: startWorld.y, gx: sx, gy: sy, index: 0 });

    // Add intermediate waypoints at spacing intervals
    let lastAdded = 0;
    for (let i = spacing; i < rawPath.length - 1; i += spacing) {
      const [gx, gy] = rawPath[i];
      const worldPos = gridToWorld(gx, gy);
      waypoints.push({
        x: worldPos.x,
        y: worldPos.y,
        gx,
        gy,
        index: waypoints.length,
      });
      lastAdded = i;
    }

    // Always include end (if different from last added)
    const [ex, ey] = rawPath[rawPath.length - 1];
    if (lastAdded < rawPath.length - 1 || rawPath.length === 1) {
      const endWorld = gridToWorld(ex, ey);
      waypoints.push({
        x: endWorld.x,
        y: endWorld.y,
        gx: ex,
        gy: ey,
        index: waypoints.length,
      });
    }

    return waypoints;
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private isInBounds(gx: number, gy: number, cols: number, rows: number): boolean {
    return gx >= 0 && gx < cols && gy >= 0 && gy < rows;
  }

  private isBlocked(grid: GridCell[][], gx: number, gy: number): boolean {
    const state = grid[gy]?.[gx]?.state;
    return state === 'obstacle' || state === 'wall';
  }

  private failResult(error: string, startTime: number): PathResult {
    return {
      success: false,
      waypoints: [],
      totalCost: 0,
      pathLengthM: 0,
      rawPathLength: 0,
      planningTimeMs: Math.round((performance.now() - startTime) * 100) / 100,
      error,
    };
  }
}
