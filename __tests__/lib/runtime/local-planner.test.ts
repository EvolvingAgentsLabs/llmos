import { LocalPlanner } from '../../../lib/runtime/local-planner';
import type { GridCell, CellState } from '../../../lib/runtime/world-model';

// =============================================================================
// Helpers
// =============================================================================

function makeCell(state: CellState, x = 0, y = 0): GridCell {
  return { x, y, state, confidence: 1, lastUpdated: 0, visitCount: 0 };
}

function makeGrid(rows: number, cols: number, fill: CellState = 'free'): GridCell[][] {
  const grid: GridCell[][] = [];
  for (let y = 0; y < rows; y++) {
    grid[y] = [];
    for (let x = 0; x < cols; x++) {
      grid[y][x] = makeCell(fill, x, y);
    }
  }
  return grid;
}

function gridToWorld(gx: number, gy: number): { x: number; y: number } {
  return { x: (gx - 5) * 0.1, y: (gy - 5) * 0.1 };
}

function worldToGrid(wx: number, wy: number): { gx: number; gy: number } {
  return { gx: Math.floor(wx / 0.1 + 5), gy: Math.floor(wy / 0.1 + 5) };
}

// =============================================================================
// Basic Pathfinding
// =============================================================================

describe('LocalPlanner A*', () => {
  it('finds a straight-line path in open space', () => {
    const planner = new LocalPlanner({ obstacleInflationCells: 0 });
    const grid = makeGrid(10, 10, 'free');

    const result = planner.planPath(grid, 0, 0, 9, 9, gridToWorld);

    expect(result.success).toBe(true);
    expect(result.waypoints.length).toBeGreaterThan(0);
    expect(result.pathLengthM).toBeGreaterThan(0);
    // Should start at (0,0) and end at (9,9)
    expect(result.waypoints[0].gx).toBe(0);
    expect(result.waypoints[0].gy).toBe(0);
    expect(result.waypoints[result.waypoints.length - 1].gx).toBe(9);
    expect(result.waypoints[result.waypoints.length - 1].gy).toBe(9);
  });

  it('finds path around an obstacle', () => {
    const planner = new LocalPlanner({ obstacleInflationCells: 0 });
    const grid = makeGrid(10, 10, 'free');

    // Wall across the middle (except one gap)
    for (let x = 0; x < 9; x++) {
      grid[5][x].state = 'wall';
    }
    // Gap at x=9

    const result = planner.planPath(grid, 0, 0, 0, 9, gridToWorld);

    expect(result.success).toBe(true);
    // Path should go around the wall
    expect(result.rawPathLength).toBeGreaterThan(9);
  });

  it('returns failure when goal is blocked', () => {
    const planner = new LocalPlanner();
    const grid = makeGrid(10, 10, 'free');
    grid[9][9].state = 'obstacle';

    const result = planner.planPath(grid, 0, 0, 9, 9, gridToWorld);

    expect(result.success).toBe(false);
    expect(result.error).toContain('blocked');
  });

  it('returns failure when path is fully blocked', () => {
    const planner = new LocalPlanner({ obstacleInflationCells: 0 });
    const grid = makeGrid(10, 10, 'free');

    // Complete wall with no gap
    for (let x = 0; x < 10; x++) {
      grid[5][x].state = 'wall';
    }

    const result = planner.planPath(grid, 0, 0, 0, 9, gridToWorld);

    expect(result.success).toBe(false);
    expect(result.error).toContain('unreachable');
  });

  it('handles start == goal', () => {
    const planner = new LocalPlanner();
    const grid = makeGrid(10, 10, 'free');

    const result = planner.planPath(grid, 5, 5, 5, 5, gridToWorld);

    expect(result.success).toBe(true);
    expect(result.waypoints.length).toBe(1);
    expect(result.pathLengthM).toBe(0);
  });

  it('returns failure for out-of-bounds start', () => {
    const planner = new LocalPlanner();
    const grid = makeGrid(10, 10, 'free');

    const result = planner.planPath(grid, -1, 0, 5, 5, gridToWorld);

    expect(result.success).toBe(false);
    expect(result.error).toContain('out of bounds');
  });
});

// =============================================================================
// Waypoint Spacing
// =============================================================================

describe('LocalPlanner waypoints', () => {
  it('spaces waypoints according to config', () => {
    const planner = new LocalPlanner({
      obstacleInflationCells: 0,
      waypointSpacing: 3,
    });
    const grid = makeGrid(20, 20, 'free');

    const result = planner.planPath(grid, 0, 0, 19, 0, gridToWorld);

    expect(result.success).toBe(true);
    // With spacing 3 and ~19 cells, expect roughly 7 waypoints
    expect(result.waypoints.length).toBeGreaterThan(2);
    expect(result.waypoints.length).toBeLessThan(20);
  });

  it('always includes start and end', () => {
    const planner = new LocalPlanner({
      obstacleInflationCells: 0,
      waypointSpacing: 5,
    });
    const grid = makeGrid(10, 10, 'free');

    const result = planner.planPath(grid, 1, 1, 8, 8, gridToWorld);

    expect(result.success).toBe(true);
    expect(result.waypoints[0].gx).toBe(1);
    expect(result.waypoints[0].gy).toBe(1);
    expect(result.waypoints[result.waypoints.length - 1].gx).toBe(8);
    expect(result.waypoints[result.waypoints.length - 1].gy).toBe(8);
  });
});

// =============================================================================
// Cost Map & Inflation
// =============================================================================

describe('LocalPlanner cost map', () => {
  it('inflated obstacles increase path cost', () => {
    const plannerNoInflation = new LocalPlanner({ obstacleInflationCells: 0 });
    const plannerInflated = new LocalPlanner({ obstacleInflationCells: 2 });
    const grid = makeGrid(10, 10, 'free');

    // Single obstacle in the path
    grid[5][5].state = 'obstacle';

    const resultA = plannerNoInflation.planPath(grid, 0, 5, 9, 5, gridToWorld);
    const resultB = plannerInflated.planPath(grid, 0, 5, 9, 5, gridToWorld);

    expect(resultA.success).toBe(true);
    expect(resultB.success).toBe(true);
    // Inflated path should cost more (goes wider around obstacle)
    expect(resultB.totalCost).toBeGreaterThanOrEqual(resultA.totalCost);
  });

  it('penalizes unknown cells but allows traversal', () => {
    const planner = new LocalPlanner({ obstacleInflationCells: 0 });
    const grid = makeGrid(10, 10, 'unknown');
    // Clear a corridor
    for (let x = 0; x < 10; x++) {
      grid[5][x].state = 'free';
    }

    // Path through free corridor
    const resultFree = planner.planPath(grid, 0, 5, 9, 5, gridToWorld);
    // Path through unknown area
    const resultUnknown = planner.planPath(grid, 0, 0, 9, 0, gridToWorld);

    expect(resultFree.success).toBe(true);
    expect(resultUnknown.success).toBe(true);
    // Unknown path should be more expensive
    expect(resultUnknown.totalCost).toBeGreaterThan(resultFree.totalCost);
  });
});

// =============================================================================
// World Coordinate Convenience
// =============================================================================

describe('LocalPlanner planPathWorld', () => {
  it('plans path using world coordinates', () => {
    const planner = new LocalPlanner({ obstacleInflationCells: 0 });
    const grid = makeGrid(10, 10, 'free');

    const result = planner.planPathWorld(
      grid,
      { x: -0.5, y: -0.5 },
      { x: 0.4, y: 0.4 },
      worldToGrid,
      gridToWorld
    );

    expect(result.success).toBe(true);
    expect(result.waypoints.length).toBeGreaterThan(0);
  });
});

// =============================================================================
// Performance
// =============================================================================

describe('LocalPlanner performance', () => {
  it('plans on 50x50 grid in under 100ms', () => {
    const planner = new LocalPlanner({ obstacleInflationCells: 1 });
    const grid = makeGrid(50, 50, 'free');

    // Add some obstacles
    for (let i = 10; i < 40; i++) {
      grid[25][i].state = 'obstacle';
    }

    const gToW = (gx: number, gy: number) => ({ x: (gx - 25) * 0.1, y: (gy - 25) * 0.1 });
    const result = planner.planPath(grid, 5, 5, 45, 45, gToW);

    expect(result.success).toBe(true);
    expect(result.planningTimeMs).toBeLessThan(100);
  });
});
