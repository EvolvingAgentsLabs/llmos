/**
 * World Model Serializer
 *
 * Converts the WorldModel's 50x50 occupancy grid into compact formats
 * that the Runtime LLM can consume efficiently each cycle.
 *
 * Three output formats:
 *   Format A — RLE JSON: Compact run-length encoded grid + robot/goal pose
 *   Format C — ASCII:    25x25 downsampled text grid for debugging/lightweight contexts
 *   Patch   — Delta:     Only cells changed since last serialization
 *
 * Format B (top-down PNG image) lives in map-renderer.ts (separate concern).
 *
 * Design rules (from NEXT_STEPS_POC.md):
 *   - Never dump the full 2500-cell grid raw
 *   - Use RLE for JSON format
 *   - Use patch updates for subsequent cycles
 *   - Use downsampling for ASCII
 */

import type { CellState, GridCell } from './world-model';

// =============================================================================
// Types
// =============================================================================

/**
 * Format A: Compact JSON with RLE encoding.
 * Primary format for structured LLM reasoning.
 */
export interface GridSerializationJSON {
  frame: 'world';
  /** World size in meters [width, height] */
  size_m: [number, number];
  /** Cell resolution in meters */
  resolution_m: number;
  /** Grid origin in meters [x, y] */
  origin_m: [number, number];
  /** Grid dimensions [cols, rows] */
  grid_size: [number, number];
  /** Run-length encoded occupancy: "U:1200,F:1000,O:300" */
  occupancy_rle: string;
  /** Exploration progress 0-1 */
  exploration: number;
  /** Robot pose */
  robot: { pose_m: [number, number]; yaw_deg: number };
  /** Goal position (if set) */
  goal?: { pose_m: [number, number]; tolerance_m: number };
}

/**
 * Format C: ASCII grid for debugging and lightweight contexts.
 * 25x25 downsampled from 50x50.
 */
export interface GridSerializationASCII {
  type: 'ascii';
  /** Multi-line ASCII art grid */
  grid: string;
  /** Legend explaining symbols */
  legend: string;
}

/**
 * Patch update: only cells that changed since last serialization.
 * Sent on subsequent cycles to minimize token usage.
 */
export interface GridPatchUpdate {
  frame: 'world_patch';
  /** Cycle number this patch applies to */
  cycle: number;
  /** Changed cells as [gridX, gridY, newState] tuples */
  changes: Array<[number, number, SerializedCellState]>;
  /** Updated robot pose */
  robot: { pose_m: [number, number]; yaw_deg: number };
  /** Updated exploration progress */
  exploration: number;
  /** Number of cells changed */
  num_changes: number;
}

/**
 * Simplified cell states for serialization.
 * Maps the full CellState enum to single characters for RLE.
 */
export type SerializedCellState = 'U' | 'F' | 'O' | 'W' | 'E' | 'P' | 'C' | 'X';

// =============================================================================
// Cell State Mapping
// =============================================================================

const CELL_STATE_TO_SERIAL: Record<CellState, SerializedCellState> = {
  'unknown':     'U',
  'free':        'F',
  'obstacle':    'O',
  'wall':        'W',
  'explored':    'E',
  'path':        'P',
  'collectible': 'C',
  'collected':   'X',
};

const SERIAL_TO_CELL_STATE: Record<SerializedCellState, CellState> = {
  'U': 'unknown',
  'F': 'free',
  'O': 'obstacle',
  'W': 'wall',
  'E': 'explored',
  'P': 'path',
  'C': 'collectible',
  'X': 'collected',
};

/** ASCII characters for the downsampled grid */
const CELL_STATE_TO_ASCII: Record<CellState, string> = {
  'unknown':     '?',
  'free':        '.',
  'obstacle':    '#',
  'wall':        '=',
  'explored':    '.',
  'path':        'o',
  'collectible': '*',
  'collected':   'x',
};

// =============================================================================
// RLE Encoding / Decoding
// =============================================================================

/**
 * Run-length encode a flat array of serialized cell states.
 * Example: "UUUFFFOO" → "U:3,F:3,O:2"
 */
export function rleEncode(states: SerializedCellState[]): string {
  if (states.length === 0) return '';

  const runs: string[] = [];
  let current = states[0];
  let count = 1;

  for (let i = 1; i < states.length; i++) {
    if (states[i] === current) {
      count++;
    } else {
      runs.push(`${current}:${count}`);
      current = states[i];
      count = 1;
    }
  }
  runs.push(`${current}:${count}`);

  return runs.join(',');
}

/**
 * Decode an RLE string back to a flat array of cell states.
 * Example: "U:3,F:3,O:2" → ['U','U','U','F','F','F','O','O']
 */
export function rleDecode(rle: string): SerializedCellState[] {
  if (!rle) return [];

  const result: SerializedCellState[] = [];
  const runs = rle.split(',');

  for (const run of runs) {
    const [state, countStr] = run.split(':');
    const count = parseInt(countStr, 10);
    for (let i = 0; i < count; i++) {
      result.push(state as SerializedCellState);
    }
  }

  return result;
}

// =============================================================================
// Grid Flattening
// =============================================================================

/**
 * Flatten a 2D grid into a 1D array of serialized states.
 * Row-major order: row 0 left-to-right, then row 1, etc.
 */
export function flattenGrid(grid: GridCell[][]): SerializedCellState[] {
  const result: SerializedCellState[] = [];
  for (const row of grid) {
    for (const cell of row) {
      result.push(CELL_STATE_TO_SERIAL[cell.state]);
    }
  }
  return result;
}

// =============================================================================
// Downsampling (50x50 → 25x25)
// =============================================================================

/** Priority order for resolving 2x2 blocks: obstacles/walls win over free space */
const STATE_PRIORITY: Record<CellState, number> = {
  'wall':        6,
  'obstacle':    5,
  'collectible': 4,
  'collected':   3,
  'explored':    2,
  'path':        2,
  'free':        1,
  'unknown':     0,
};

/**
 * Downsample a grid by factor of 2 using max-priority rule.
 * Each 2x2 block becomes one cell with the highest-priority state.
 */
export function downsampleGrid(
  grid: GridCell[][],
  factor: number = 2
): CellState[][] {
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;
  const outRows = Math.ceil(rows / factor);
  const outCols = Math.ceil(cols / factor);
  const result: CellState[][] = [];

  for (let oy = 0; oy < outRows; oy++) {
    const row: CellState[] = [];
    for (let ox = 0; ox < outCols; ox++) {
      let bestState: CellState = 'unknown';
      let bestPriority = -1;

      for (let dy = 0; dy < factor; dy++) {
        for (let dx = 0; dx < factor; dx++) {
          const sy = oy * factor + dy;
          const sx = ox * factor + dx;
          if (sy < rows && sx < cols) {
            const state = grid[sy][sx].state;
            const priority = STATE_PRIORITY[state];
            if (priority > bestPriority) {
              bestPriority = priority;
              bestState = state;
            }
          }
        }
      }

      row.push(bestState);
    }
    result.push(row);
  }

  return result;
}

// =============================================================================
// World Model Serializer
// =============================================================================

export interface SerializerConfig {
  /** Downsample factor for ASCII output (default: 2, producing 25x25 from 50x50) */
  asciiDownsampleFactor: number;
  /** Include confidence data in JSON output (default: false, saves tokens) */
  includeConfidence: boolean;
}

const DEFAULT_CONFIG: SerializerConfig = {
  asciiDownsampleFactor: 2,
  includeConfidence: false,
};

export class WorldModelSerializer {
  private config: SerializerConfig;
  /** Previous grid state for computing patches */
  private previousStates: SerializedCellState[] | null = null;
  private cycleCounter: number = 0;

  constructor(config: Partial<SerializerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ---------------------------------------------------------------------------
  // Format A: RLE JSON
  // ---------------------------------------------------------------------------

  /**
   * Serialize the grid to compact RLE JSON.
   *
   * @param grid      The 2D grid from WorldModel
   * @param robotPose Robot position in world coordinates (meters) and rotation (radians)
   * @param worldConfig World dimensions from WorldModelConfig
   * @param goal      Optional goal position in world coordinates
   */
  serializeToJSON(
    grid: GridCell[][],
    robotPose: { x: number; y: number; rotation: number },
    worldConfig: { worldWidth: number; worldHeight: number; gridResolution: number },
    goal?: { x: number; y: number; tolerance?: number }
  ): GridSerializationJSON {
    const flat = flattenGrid(grid);
    const rle = rleEncode(flat);

    // Store for patch computation
    this.previousStates = flat;
    this.cycleCounter++;

    // Count explored cells
    let explored = 0;
    for (const s of flat) {
      if (s !== 'U') explored++;
    }

    const result: GridSerializationJSON = {
      frame: 'world',
      size_m: [worldConfig.worldWidth / 100, worldConfig.worldHeight / 100],
      resolution_m: worldConfig.gridResolution / 100,
      origin_m: [0, 0],
      grid_size: [grid[0]?.length ?? 0, grid.length],
      occupancy_rle: rle,
      exploration: explored / flat.length,
      robot: {
        pose_m: [
          Math.round(robotPose.x * 100) / 100,
          Math.round(robotPose.y * 100) / 100,
        ],
        yaw_deg: Math.round((robotPose.rotation * 180) / Math.PI),
      },
    };

    if (goal) {
      result.goal = {
        pose_m: [
          Math.round(goal.x * 100) / 100,
          Math.round(goal.y * 100) / 100,
        ],
        tolerance_m: goal.tolerance ?? 0.3,
      };
    }

    return result;
  }

  // ---------------------------------------------------------------------------
  // Format C: ASCII Grid
  // ---------------------------------------------------------------------------

  /**
   * Serialize the grid to a 25x25 ASCII representation.
   *
   * @param grid      The 2D grid from WorldModel
   * @param robotPose Robot position in world coordinates (meters) and rotation (radians)
   * @param worldToGrid Function to convert world coords to grid coords
   * @param goal      Optional goal position in world coordinates
   */
  serializeToASCII(
    grid: GridCell[][],
    robotPose: { x: number; y: number; rotation: number },
    worldToGrid: (wx: number, wy: number) => { gx: number; gy: number },
    goal?: { x: number; y: number }
  ): GridSerializationASCII {
    const factor = this.config.asciiDownsampleFactor;
    const downsampled = downsampleGrid(grid, factor);

    // Convert robot position to downsampled grid coords
    const robotGrid = worldToGrid(robotPose.x, robotPose.y);
    const robotDx = Math.floor(robotGrid.gx / factor);
    const robotDy = Math.floor(robotGrid.gy / factor);

    // Convert goal position if provided
    let goalDx = -1;
    let goalDy = -1;
    if (goal) {
      const goalGrid = worldToGrid(goal.x, goal.y);
      goalDx = Math.floor(goalGrid.gx / factor);
      goalDy = Math.floor(goalGrid.gy / factor);
    }

    // Robot heading arrow
    const headingChar = getHeadingChar(robotPose.rotation);

    // Build ASCII grid
    const lines: string[] = [];
    for (let y = 0; y < downsampled.length; y++) {
      let line = '';
      for (let x = 0; x < downsampled[y].length; x++) {
        if (x === robotDx && y === robotDy) {
          line += headingChar;
        } else if (x === goalDx && y === goalDy) {
          line += 'G';
        } else {
          line += CELL_STATE_TO_ASCII[downsampled[y][x]];
        }
      }
      lines.push(line);
    }

    return {
      type: 'ascii',
      grid: lines.join('\n'),
      legend: '# obstacle  = wall  . free  ? unknown  G goal  ^ v < > robot heading  * collectible',
    };
  }

  // ---------------------------------------------------------------------------
  // Patch Updates
  // ---------------------------------------------------------------------------

  /**
   * Compute a patch update containing only cells that changed since the last
   * call to serializeToJSON() or computePatch().
   *
   * Returns null if no previous state exists (first cycle should use full JSON).
   */
  computePatch(
    grid: GridCell[][],
    robotPose: { x: number; y: number; rotation: number }
  ): GridPatchUpdate | null {
    if (!this.previousStates) return null;

    const currentFlat = flattenGrid(grid);
    const cols = grid[0]?.length ?? 0;
    const changes: Array<[number, number, SerializedCellState]> = [];

    for (let i = 0; i < currentFlat.length; i++) {
      if (currentFlat[i] !== this.previousStates[i]) {
        const gx = i % cols;
        const gy = Math.floor(i / cols);
        changes.push([gx, gy, currentFlat[i]]);
      }
    }

    // Update stored state
    this.previousStates = currentFlat;
    this.cycleCounter++;

    // Count explored
    let explored = 0;
    for (const s of currentFlat) {
      if (s !== 'U') explored++;
    }

    return {
      frame: 'world_patch',
      cycle: this.cycleCounter,
      changes,
      robot: {
        pose_m: [
          Math.round(robotPose.x * 100) / 100,
          Math.round(robotPose.y * 100) / 100,
        ],
        yaw_deg: Math.round((robotPose.rotation * 180) / Math.PI),
      },
      exploration: explored / currentFlat.length,
      num_changes: changes.length,
    };
  }

  /**
   * Decide whether to send a full JSON frame or a patch.
   * Use full frame when: first cycle, too many changes (>30% of grid), or forced.
   */
  serialize(
    grid: GridCell[][],
    robotPose: { x: number; y: number; rotation: number },
    worldConfig: { worldWidth: number; worldHeight: number; gridResolution: number },
    options?: { forceFull?: boolean; goal?: { x: number; y: number; tolerance?: number } }
  ): GridSerializationJSON | GridPatchUpdate {
    const forceFull = options?.forceFull ?? false;
    const totalCells = grid.length * (grid[0]?.length ?? 0);

    // First cycle or forced: send full frame
    if (!this.previousStates || forceFull) {
      return this.serializeToJSON(grid, robotPose, worldConfig, options?.goal);
    }

    // Compute patch
    const patch = this.computePatch(grid, robotPose);
    if (!patch) {
      return this.serializeToJSON(grid, robotPose, worldConfig, options?.goal);
    }

    // If too many changes, send full frame instead (patch would be larger)
    const changeRatio = patch.num_changes / totalCells;
    if (changeRatio > 0.3) {
      // Re-serialize as full since we already updated previousStates in computePatch
      return this.serializeToJSON(grid, robotPose, worldConfig, options?.goal);
    }

    return patch;
  }

  /**
   * Reset serializer state (e.g. when simulation resets)
   */
  reset(): void {
    this.previousStates = null;
    this.cycleCounter = 0;
  }

  /**
   * Get the current cycle counter
   */
  getCycle(): number {
    return this.cycleCounter;
  }
}

// =============================================================================
// Helpers
// =============================================================================

function getHeadingChar(rotationRad: number): string {
  const normalized = ((rotationRad % (2 * Math.PI)) + (2 * Math.PI)) % (2 * Math.PI);
  const deg = (normalized * 180) / Math.PI;

  if (deg < 45 || deg >= 315) return '^';   // North
  if (deg < 135) return '>';                  // East
  if (deg < 225) return 'v';                  // South
  return '<';                                  // West
}

// =============================================================================
// Exports
// =============================================================================

export { CELL_STATE_TO_SERIAL, SERIAL_TO_CELL_STATE, CELL_STATE_TO_ASCII };
