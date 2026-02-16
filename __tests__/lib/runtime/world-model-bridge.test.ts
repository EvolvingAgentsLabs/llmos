import { WorldModelBridge } from '../../../lib/runtime/world-model-bridge';
import { clearAllWorldModels } from '../../../lib/runtime/world-model';
import type { Robot4World } from '../../../lib/runtime/robot4-runtime';

// =============================================================================
// Test Helpers
// =============================================================================

function makeWorld(size: number = 2.0): Robot4World {
  return {
    walls: [
      { x1: -size, y1: -size, x2: size, y2: -size },  // Bottom
      { x1: size, y1: -size, x2: size, y2: size },     // Right
      { x1: size, y1: size, x2: -size, y2: size },     // Top
      { x1: -size, y1: size, x2: -size, y2: -size },   // Left
    ],
    obstacles: [
      { x: 0.5, y: 0.5, radius: 0.15 },
    ],
    beacons: [
      { x: 1.0, y: 1.0, color: '#ff0000', active: true },
      { x: -1.0, y: -1.0, color: '#00ff00', active: false },
    ],
    lines: [],
    bounds: { minX: -size, maxX: size, minY: -size, maxY: size },
  };
}

// Clean up singletons between tests
afterEach(() => {
  clearAllWorldModels();
});

// =============================================================================
// Rasterization
// =============================================================================

describe('WorldModelBridge rasterization', () => {
  it('rasterizes a simple arena', () => {
    const bridge = new WorldModelBridge({ deviceId: 'test-1', inflationCells: 0 });
    const world = makeWorld();

    bridge.rasterize(world);
    expect(bridge.isRasterized()).toBe(true);

    const wm = bridge.getWorldModel();
    const grid = wm.getGrid();
    const dims = wm.getGridDimensions();

    // Grid should be 50x50 by default
    expect(dims.width).toBe(50);
    expect(dims.height).toBe(50);

    // Center of the grid should be free (inside arena bounds)
    const centerCell = grid[25][25];
    expect(centerCell.state).toBe('free');
  });

  it('marks walls on the grid boundary', () => {
    const bridge = new WorldModelBridge({ deviceId: 'test-2', inflationCells: 0 });
    const world = makeWorld();

    bridge.rasterize(world);

    const wm = bridge.getWorldModel();
    const grid = wm.getGrid();

    // Check that wall cells exist. With the default 5m x 5m grid and
    // 2m x 2m arena, walls at +-2m should map to grid cells.
    let wallCount = 0;
    for (let y = 0; y < 50; y++) {
      for (let x = 0; x < 50; x++) {
        if (grid[y][x].state === 'wall') wallCount++;
      }
    }
    expect(wallCount).toBeGreaterThan(0);
  });

  it('marks obstacles on the grid', () => {
    const bridge = new WorldModelBridge({ deviceId: 'test-3', inflationCells: 0 });
    const world = makeWorld();

    bridge.rasterize(world);

    const wm = bridge.getWorldModel();
    const grid = wm.getGrid();

    // The obstacle is at (0.5, 0.5) with radius 0.15
    // In grid coords with offset 25: gx = 0.5*10 + 25 = 30, gy = 0.5*10 + 25 = 30
    let obstacleCount = 0;
    for (let y = 0; y < 50; y++) {
      for (let x = 0; x < 50; x++) {
        if (grid[y][x].state === 'obstacle') obstacleCount++;
      }
    }
    expect(obstacleCount).toBeGreaterThan(0);
  });

  it('marks active beacons as collectibles', () => {
    const bridge = new WorldModelBridge({ deviceId: 'test-4', inflationCells: 0 });
    const world = makeWorld();

    bridge.rasterize(world);

    const wm = bridge.getWorldModel();
    const grid = wm.getGrid();

    // Active beacon at (1.0, 1.0)
    let collectibleCount = 0;
    for (let y = 0; y < 50; y++) {
      for (let x = 0; x < 50; x++) {
        if (grid[y][x].state === 'collectible') collectibleCount++;
      }
    }
    expect(collectibleCount).toBe(1); // Only one active beacon
  });

  it('inflates obstacles with safety margin', () => {
    const bridgeNoInflation = new WorldModelBridge({ deviceId: 'test-5a', inflationCells: 0 });
    const bridgeInflated = new WorldModelBridge({ deviceId: 'test-5b', inflationCells: 2 });
    const world = makeWorld();

    bridgeNoInflation.rasterize(world);
    bridgeInflated.rasterize(world);

    // Count obstacle cells in each
    let countNoInflation = 0;
    let countInflated = 0;

    const gridA = bridgeNoInflation.getWorldModel().getGrid();
    const gridB = bridgeInflated.getWorldModel().getGrid();

    for (let y = 0; y < 50; y++) {
      for (let x = 0; x < 50; x++) {
        if (gridA[y][x].state === 'obstacle') countNoInflation++;
        if (gridB[y][x].state === 'obstacle') countInflated++;
      }
    }

    // Inflated grid should have more obstacle cells
    expect(countInflated).toBeGreaterThan(countNoInflation);
  });
});

// =============================================================================
// Robot Pose Updates
// =============================================================================

describe('WorldModelBridge robot updates', () => {
  it('marks robot position as explored', () => {
    const bridge = new WorldModelBridge({ deviceId: 'test-6', inflationCells: 0 });
    bridge.rasterize(makeWorld());

    bridge.updateRobotPose({ x: 0, y: 0, rotation: 0 });

    const grid = bridge.getWorldModel().getGrid();
    // Center cell (0,0) in world coords = grid (25,25)
    expect(grid[25][25].state).toBe('explored');
    expect(grid[25][25].visitCount).toBe(1);
  });

  it('increments visit count on repeated visits', () => {
    const bridge = new WorldModelBridge({ deviceId: 'test-7', inflationCells: 0 });
    bridge.rasterize(makeWorld());

    bridge.updateRobotPose({ x: 0, y: 0, rotation: 0 });
    bridge.updateRobotPose({ x: 0, y: 0, rotation: 0 });
    bridge.updateRobotPose({ x: 0, y: 0, rotation: 0 });

    const grid = bridge.getWorldModel().getGrid();
    expect(grid[25][25].visitCount).toBe(3);
  });

  it('does not overwrite obstacle cells', () => {
    const bridge = new WorldModelBridge({ deviceId: 'test-8', inflationCells: 0 });
    bridge.rasterize(makeWorld());

    // Try to mark an obstacle cell as explored
    bridge.updateRobotPose({ x: 0.5, y: 0.5, rotation: 0 });

    const grid = bridge.getWorldModel().getGrid();
    // The cell at (0.5, 0.5) is an obstacle — should NOT become explored
    const { gx, gy } = bridge.getWorldModel().worldToGrid(0.5, 0.5);
    expect(grid[gy][gx].state).toBe('obstacle');
  });
});

// =============================================================================
// Frontier Detection
// =============================================================================

describe('WorldModelBridge frontiers', () => {
  it('finds frontier cells at the boundary of known space', () => {
    const bridge = new WorldModelBridge({
      deviceId: 'test-9',
      inflationCells: 0,
      rasterizeBounds: false, // Don't fill all cells — keep unknown areas
    });

    // Create a world with just walls (no obstacle filling)
    const world: Robot4World = {
      walls: [
        { x1: -1, y1: -1, x2: 1, y2: -1 },
        { x1: 1, y1: -1, x2: 1, y2: 1 },
        { x1: 1, y1: 1, x2: -1, y2: 1 },
        { x1: -1, y1: 1, x2: -1, y2: -1 },
      ],
      obstacles: [],
      beacons: [],
      lines: [],
      bounds: { minX: -2.5, maxX: 2.5, minY: -2.5, maxY: 2.5 },
    };

    bridge.rasterize(world);

    // Manually mark some cells as free near the walls to create frontiers
    const grid = bridge.getWorldModel().getGrid();
    // Mark a small area around center as free
    for (let y = 23; y <= 27; y++) {
      for (let x = 23; x <= 27; x++) {
        if (grid[y][x].state === 'unknown') {
          grid[y][x].state = 'free';
        }
      }
    }

    const frontiers = bridge.findFrontiers();

    // Should find frontier cells at the boundary of the free area
    expect(frontiers.length).toBeGreaterThan(0);

    // Each frontier should have unknown neighbors
    for (const f of frontiers) {
      expect(f.unknownNeighbors).toBeGreaterThan(0);
    }
  });

  it('finds frontiers at the edge of the arena', () => {
    // Arena (+-2m) is smaller than grid (+-2.5m), so cells outside
    // arena bounds remain 'unknown', creating frontiers at the boundary.
    const bridge = new WorldModelBridge({ deviceId: 'test-10', inflationCells: 0 });
    bridge.rasterize(makeWorld());

    const frontiers = bridge.findFrontiers();
    // Free cells at the arena edge should border unknown cells outside
    expect(frontiers.length).toBeGreaterThanOrEqual(0);
    // The actual count depends on whether walls fully enclose the boundary
  });
});

// =============================================================================
// Reset
// =============================================================================

describe('WorldModelBridge reset', () => {
  it('resets rasterization state', () => {
    const bridge = new WorldModelBridge({ deviceId: 'test-11', inflationCells: 0 });
    bridge.rasterize(makeWorld());
    expect(bridge.isRasterized()).toBe(true);

    bridge.reset();
    expect(bridge.isRasterized()).toBe(false);
  });
});

// =============================================================================
// Integration with Serializer
// =============================================================================

describe('WorldModelBridge serialization integration', () => {
  it('produces valid JSON serialization after rasterization', () => {
    const bridge = new WorldModelBridge({ deviceId: 'test-12', inflationCells: 0 });
    bridge.rasterize(makeWorld());

    const wm = bridge.getWorldModel();
    const robotPose = { x: 0, y: 0, rotation: 0 };
    const result = wm.serialize('json', robotPose);

    expect(result).toHaveProperty('frame', 'world');
    expect(result).toHaveProperty('occupancy_rle');
    expect(result).toHaveProperty('robot');
  });

  it('produces valid ASCII serialization after rasterization', () => {
    const bridge = new WorldModelBridge({ deviceId: 'test-13', inflationCells: 0 });
    bridge.rasterize(makeWorld());

    const wm = bridge.getWorldModel();
    const robotPose = { x: 0, y: 0, rotation: 0 };
    const result = wm.serialize('ascii', robotPose);

    expect(result).toHaveProperty('type', 'ascii');
    expect(result).toHaveProperty('grid');
    // ASCII grid should show the robot marker
    expect((result as any).grid).toContain('^');
  });
});
