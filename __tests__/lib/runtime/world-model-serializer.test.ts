import {
  rleEncode,
  rleDecode,
  flattenGrid,
  downsampleGrid,
  WorldModelSerializer,
  type SerializedCellState,
} from '../../../lib/runtime/world-model-serializer';
import type { GridCell, CellState } from '../../../lib/runtime/world-model';

// =============================================================================
// Helpers
// =============================================================================

function makeCell(state: CellState, x = 0, y = 0): GridCell {
  return { x, y, state, confidence: 0.5, lastUpdated: 0, visitCount: 0 };
}

function makeGrid(rows: number, cols: number, fill: CellState = 'unknown'): GridCell[][] {
  const grid: GridCell[][] = [];
  for (let y = 0; y < rows; y++) {
    grid[y] = [];
    for (let x = 0; x < cols; x++) {
      grid[y][x] = makeCell(fill, x, y);
    }
  }
  return grid;
}

// =============================================================================
// RLE Encoding / Decoding
// =============================================================================

describe('rleEncode', () => {
  it('encodes a uniform array', () => {
    const states: SerializedCellState[] = Array(10).fill('U');
    expect(rleEncode(states)).toBe('U:10');
  });

  it('encodes alternating states', () => {
    const states: SerializedCellState[] = ['U', 'F', 'U', 'F'];
    expect(rleEncode(states)).toBe('U:1,F:1,U:1,F:1');
  });

  it('encodes a mixed array', () => {
    const states: SerializedCellState[] = ['U', 'U', 'U', 'F', 'F', 'O', 'O', 'O'];
    expect(rleEncode(states)).toBe('U:3,F:2,O:3');
  });

  it('encodes a single element', () => {
    expect(rleEncode(['F'])).toBe('F:1');
  });

  it('returns empty string for empty array', () => {
    expect(rleEncode([])).toBe('');
  });

  it('encodes all state types', () => {
    const states: SerializedCellState[] = ['U', 'F', 'O', 'W', 'E', 'P', 'C', 'X'];
    expect(rleEncode(states)).toBe('U:1,F:1,O:1,W:1,E:1,P:1,C:1,X:1');
  });
});

describe('rleDecode', () => {
  it('decodes a uniform run', () => {
    const result = rleDecode('U:5');
    expect(result).toEqual(['U', 'U', 'U', 'U', 'U']);
  });

  it('decodes multiple runs', () => {
    const result = rleDecode('U:3,F:2,O:1');
    expect(result).toEqual(['U', 'U', 'U', 'F', 'F', 'O']);
  });

  it('returns empty for empty string', () => {
    expect(rleDecode('')).toEqual([]);
  });

  it('roundtrips with rleEncode', () => {
    const original: SerializedCellState[] = ['U', 'U', 'F', 'F', 'F', 'O', 'E', 'E'];
    const encoded = rleEncode(original);
    const decoded = rleDecode(encoded);
    expect(decoded).toEqual(original);
  });

  it('roundtrips a large uniform grid', () => {
    const original: SerializedCellState[] = Array(2500).fill('U');
    const encoded = rleEncode(original);
    expect(encoded).toBe('U:2500');
    const decoded = rleDecode(encoded);
    expect(decoded.length).toBe(2500);
    expect(decoded.every(s => s === 'U')).toBe(true);
  });
});

// =============================================================================
// Grid Flattening
// =============================================================================

describe('flattenGrid', () => {
  it('flattens a 2x2 grid in row-major order', () => {
    const grid = makeGrid(2, 2, 'unknown');
    grid[0][1].state = 'free';
    grid[1][0].state = 'obstacle';
    grid[1][1].state = 'wall';

    const flat = flattenGrid(grid);
    expect(flat).toEqual(['U', 'F', 'O', 'W']);
  });

  it('flattens a 50x50 grid to 2500 elements', () => {
    const grid = makeGrid(50, 50, 'unknown');
    const flat = flattenGrid(grid);
    expect(flat.length).toBe(2500);
  });
});

// =============================================================================
// Downsampling
// =============================================================================

describe('downsampleGrid', () => {
  it('downsamples 4x4 to 2x2 using max priority', () => {
    const grid = makeGrid(4, 4, 'unknown');
    // Put an obstacle in the top-left 2x2 block
    grid[0][0].state = 'obstacle';
    // Put free cells in top-right block
    grid[0][2].state = 'free';
    grid[0][3].state = 'free';
    grid[1][2].state = 'free';
    grid[1][3].state = 'free';

    const down = downsampleGrid(grid, 2);
    expect(down.length).toBe(2);
    expect(down[0].length).toBe(2);
    // Top-left: obstacle wins over unknown
    expect(down[0][0]).toBe('obstacle');
    // Top-right: free wins over unknown (but all are free here)
    expect(down[0][1]).toBe('free');
    // Bottom-left: all unknown
    expect(down[1][0]).toBe('unknown');
    // Bottom-right: all unknown
    expect(down[1][1]).toBe('unknown');
  });

  it('downsamples 50x50 to 25x25', () => {
    const grid = makeGrid(50, 50, 'unknown');
    const down = downsampleGrid(grid, 2);
    expect(down.length).toBe(25);
    expect(down[0].length).toBe(25);
  });

  it('wall has highest priority in a block', () => {
    const grid = makeGrid(2, 2, 'free');
    grid[1][1].state = 'wall';

    const down = downsampleGrid(grid, 2);
    expect(down[0][0]).toBe('wall');
  });

  it('handles odd-sized grids by ceiling', () => {
    const grid = makeGrid(5, 5, 'unknown');
    const down = downsampleGrid(grid, 2);
    expect(down.length).toBe(3);
    expect(down[0].length).toBe(3);
  });
});

// =============================================================================
// WorldModelSerializer — JSON
// =============================================================================

describe('WorldModelSerializer JSON', () => {
  const worldConfig = { worldWidth: 500, worldHeight: 500, gridResolution: 10 };
  const robotPose = { x: 0.5, y: 0.5, rotation: 0 };

  it('serializes a blank 50x50 grid', () => {
    const serializer = new WorldModelSerializer();
    const grid = makeGrid(50, 50, 'unknown');

    const result = serializer.serializeToJSON(grid, robotPose, worldConfig);

    expect(result.frame).toBe('world');
    expect(result.size_m).toEqual([5.0, 5.0]);
    expect(result.resolution_m).toBe(0.1);
    expect(result.grid_size).toEqual([50, 50]);
    expect(result.occupancy_rle).toBe('U:2500');
    expect(result.exploration).toBe(0);
    expect(result.robot.pose_m).toEqual([0.5, 0.5]);
    expect(result.robot.yaw_deg).toBe(0);
  });

  it('includes goal when provided', () => {
    const serializer = new WorldModelSerializer();
    const grid = makeGrid(50, 50, 'unknown');
    const goal = { x: 4.0, y: 4.0, tolerance: 0.3 };

    const result = serializer.serializeToJSON(grid, robotPose, worldConfig, goal);

    expect(result.goal).toBeDefined();
    expect(result.goal!.pose_m).toEqual([4.0, 4.0]);
    expect(result.goal!.tolerance_m).toBe(0.3);
  });

  it('computes exploration progress', () => {
    const serializer = new WorldModelSerializer();
    const grid = makeGrid(50, 50, 'unknown');
    // Mark 500 cells as explored (20%)
    for (let y = 0; y < 10; y++) {
      for (let x = 0; x < 50; x++) {
        grid[y][x].state = 'explored';
      }
    }

    const result = serializer.serializeToJSON(grid, robotPose, worldConfig);
    expect(result.exploration).toBeCloseTo(0.2, 2);
  });

  it('produces compact RLE for partially explored grid', () => {
    const serializer = new WorldModelSerializer();
    const grid = makeGrid(50, 50, 'unknown');
    // Mark first row as free
    for (let x = 0; x < 50; x++) {
      grid[0][x].state = 'free';
    }
    // Mark two cells as obstacles
    grid[1][10].state = 'obstacle';
    grid[1][11].state = 'obstacle';

    const result = serializer.serializeToJSON(grid, robotPose, worldConfig);
    // Should start with F:50 (first row all free)
    expect(result.occupancy_rle).toMatch(/^F:50,/);
    // Should contain O:2 for the two obstacles
    expect(result.occupancy_rle).toContain('O:2');
  });

  it('converts yaw from radians to degrees', () => {
    const serializer = new WorldModelSerializer();
    const grid = makeGrid(10, 10, 'unknown');
    const pose = { x: 1.0, y: 1.0, rotation: Math.PI / 2 }; // 90 degrees

    const result = serializer.serializeToJSON(grid, pose, worldConfig);
    expect(result.robot.yaw_deg).toBe(90);
  });
});

// =============================================================================
// WorldModelSerializer — ASCII
// =============================================================================

describe('WorldModelSerializer ASCII', () => {
  const worldToGrid = (wx: number, wy: number) => ({
    gx: Math.floor(wx * 10) + 25,
    gy: Math.floor(wy * 10) + 25,
  });

  it('produces a 25x25 grid from 50x50 input', () => {
    const serializer = new WorldModelSerializer();
    const grid = makeGrid(50, 50, 'unknown');
    const robotPose = { x: 0, y: 0, rotation: 0 };

    const result = serializer.serializeToASCII(grid, robotPose, worldToGrid);

    const lines = result.grid.split('\n');
    expect(lines.length).toBe(25);
    expect(lines[0].length).toBe(25);
    expect(result.type).toBe('ascii');
  });

  it('marks robot position with heading character', () => {
    const serializer = new WorldModelSerializer();
    const grid = makeGrid(50, 50, 'unknown');
    const robotPose = { x: 0, y: 0, rotation: 0 }; // heading north = ^

    const result = serializer.serializeToASCII(grid, robotPose, worldToGrid);
    // Robot should appear as ^ somewhere in the grid
    expect(result.grid).toContain('^');
  });

  it('marks goal position with G', () => {
    const serializer = new WorldModelSerializer();
    const grid = makeGrid(50, 50, 'unknown');
    const robotPose = { x: -2, y: -2, rotation: 0 };
    const goal = { x: 2, y: 2 };

    const result = serializer.serializeToASCII(grid, robotPose, worldToGrid, goal);
    expect(result.grid).toContain('G');
  });

  it('shows obstacles as #', () => {
    const serializer = new WorldModelSerializer();
    const grid = makeGrid(50, 50, 'unknown');
    // Mark a 2x2 block as obstacles (will downsample to one # cell)
    grid[0][0].state = 'obstacle';
    grid[0][1].state = 'obstacle';
    grid[1][0].state = 'obstacle';
    grid[1][1].state = 'obstacle';
    const robotPose = { x: 2, y: 2, rotation: 0 };

    const result = serializer.serializeToASCII(grid, robotPose, worldToGrid);
    expect(result.grid).toContain('#');
  });

  it('includes a legend', () => {
    const serializer = new WorldModelSerializer();
    const grid = makeGrid(50, 50, 'unknown');
    const robotPose = { x: 0, y: 0, rotation: 0 };

    const result = serializer.serializeToASCII(grid, robotPose, worldToGrid);
    expect(result.legend).toContain('#');
    expect(result.legend).toContain('obstacle');
    expect(result.legend).toContain('robot');
  });
});

// =============================================================================
// WorldModelSerializer — Patches
// =============================================================================

describe('WorldModelSerializer patches', () => {
  const worldConfig = { worldWidth: 500, worldHeight: 500, gridResolution: 10 };
  const robotPose = { x: 0.5, y: 0.5, rotation: 0 };

  it('returns null on first call to computePatch', () => {
    const serializer = new WorldModelSerializer();
    const grid = makeGrid(50, 50, 'unknown');

    const patch = serializer.computePatch(grid, robotPose);
    expect(patch).toBeNull();
  });

  it('detects changed cells after initial serialization', () => {
    const serializer = new WorldModelSerializer();
    const grid = makeGrid(10, 10, 'unknown');

    // First call: establish baseline
    serializer.serializeToJSON(grid, robotPose, worldConfig);

    // Change some cells
    grid[0][0].state = 'free';
    grid[5][5].state = 'obstacle';

    const patch = serializer.computePatch(grid, robotPose);
    expect(patch).not.toBeNull();
    expect(patch!.frame).toBe('world_patch');
    expect(patch!.num_changes).toBe(2);
    expect(patch!.changes).toContainEqual([0, 0, 'F']);
    expect(patch!.changes).toContainEqual([5, 5, 'O']);
  });

  it('returns empty changes when nothing changed', () => {
    const serializer = new WorldModelSerializer();
    const grid = makeGrid(10, 10, 'unknown');

    serializer.serializeToJSON(grid, robotPose, worldConfig);

    const patch = serializer.computePatch(grid, robotPose);
    expect(patch!.num_changes).toBe(0);
    expect(patch!.changes).toEqual([]);
  });

  it('auto mode sends full frame on first call', () => {
    const serializer = new WorldModelSerializer();
    const grid = makeGrid(10, 10, 'unknown');

    const result = serializer.serialize(grid, robotPose, worldConfig);
    expect(result.frame).toBe('world');
  });

  it('auto mode sends patch when few cells changed', () => {
    const serializer = new WorldModelSerializer();
    const grid = makeGrid(10, 10, 'unknown');

    // First call: full frame
    serializer.serialize(grid, robotPose, worldConfig);

    // Change 2 cells (2% of 100 cells, well under 30% threshold)
    grid[0][0].state = 'free';
    grid[1][1].state = 'explored';

    const result = serializer.serialize(grid, robotPose, worldConfig);
    expect(result.frame).toBe('world_patch');
  });

  it('auto mode sends full frame when >30% cells changed', () => {
    const serializer = new WorldModelSerializer();
    const grid = makeGrid(10, 10, 'unknown');

    // First call: full frame
    serializer.serialize(grid, robotPose, worldConfig);

    // Change 40 cells (40% of 100 cells)
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 10; x++) {
        grid[y][x].state = 'explored';
      }
    }

    const result = serializer.serialize(grid, robotPose, worldConfig);
    expect(result.frame).toBe('world');
  });

  it('auto mode sends full frame when forceFull is true', () => {
    const serializer = new WorldModelSerializer();
    const grid = makeGrid(10, 10, 'unknown');

    serializer.serialize(grid, robotPose, worldConfig);

    const result = serializer.serialize(grid, robotPose, worldConfig, { forceFull: true });
    expect(result.frame).toBe('world');
  });
});

// =============================================================================
// WorldModelSerializer — Reset
// =============================================================================

describe('WorldModelSerializer reset', () => {
  it('resets cycle counter and previous state', () => {
    const serializer = new WorldModelSerializer();
    const grid = makeGrid(10, 10, 'unknown');
    const worldConfig = { worldWidth: 500, worldHeight: 500, gridResolution: 10 };
    const robotPose = { x: 0, y: 0, rotation: 0 };

    serializer.serializeToJSON(grid, robotPose, worldConfig);
    expect(serializer.getCycle()).toBe(1);

    serializer.reset();
    expect(serializer.getCycle()).toBe(0);

    // After reset, computePatch should return null (no baseline)
    const patch = serializer.computePatch(grid, robotPose);
    expect(patch).toBeNull();
  });
});

// =============================================================================
// RLE Compression Ratio
// =============================================================================

describe('RLE compression efficiency', () => {
  it('compresses a mostly-unknown 50x50 grid significantly', () => {
    const grid = makeGrid(50, 50, 'unknown');
    // Small explored area in center
    for (let y = 20; y < 30; y++) {
      for (let x = 20; x < 30; x++) {
        grid[y][x].state = 'explored';
      }
    }
    // A few obstacles
    grid[25][15].state = 'obstacle';
    grid[25][35].state = 'obstacle';

    const flat = flattenGrid(grid);
    const rle = rleEncode(flat);

    // Raw would be 2500 chars. RLE should be much shorter.
    expect(rle.length).toBeLessThan(200);
    // Verify roundtrip
    expect(rleDecode(rle)).toEqual(flat);
  });
});
