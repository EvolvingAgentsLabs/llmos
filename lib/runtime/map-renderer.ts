/**
 * Map Renderer
 *
 * Renders the occupancy grid as a top-down image for the VLM.
 * This is Format B from the world representation spec.
 *
 * Color scheme:
 *   Black   = obstacle/wall
 *   White   = free space
 *   Gray    = unknown
 *   Green   = robot (with heading arrow)
 *   Red     = goal
 *   Blue    = candidate subgoals
 *   Yellow  = frontier cells
 *   Cyan    = explored cells (light tint)
 *
 * Output: 500x500 pixel image (10px per grid cell for 50x50 grid)
 *
 * The VLM sees both the camera frame (egocentric) and this map
 * (allocentric) simultaneously, enabling spatial reasoning that
 * neither alone could support.
 */

import type { GridCell, CellState } from './world-model';
import type { Candidate } from './candidate-generator';

// =============================================================================
// Types
// =============================================================================

export interface MapRenderConfig {
  /** Output image width in pixels (default: 500) */
  width: number;
  /** Output image height in pixels (default: 500) */
  height: number;
  /** Draw grid lines every N cells (default: 10, = 1m markers) */
  gridLineInterval: number;
  /** Grid line color (default: rgba(100,100,100,0.3)) */
  gridLineColor: string;
  /** Draw robot FOV cone (default: true) */
  drawFOV: boolean;
  /** Robot FOV angle in radians (default: PI/2 = 90 degrees) */
  fovAngle: number;
  /** FOV range in meters (default: 2.0) */
  fovRange: number;
  /** Draw candidate markers (default: true) */
  drawCandidates: boolean;
  /** Draw frontier overlay (default: false) */
  drawFrontiers: boolean;
}

export interface MapRenderOptions {
  /** Robot pose in world coordinates (meters + radians) */
  robotPose: { x: number; y: number; rotation: number };
  /** Goal position in world coordinates (optional) */
  goal?: { x: number; y: number };
  /** Candidate subgoals to render (optional) */
  candidates?: Candidate[];
  /** Frontier cells to highlight (optional) */
  frontiers?: Array<{ gx: number; gy: number }>;
}

export interface RenderedMap {
  /** Image data URL (base64 PNG) — null if canvas unavailable */
  dataUrl: string | null;
  /** Raw pixel data as RGBA array — null if canvas unavailable */
  imageData: ImageData | null;
  /** Image dimensions */
  width: number;
  height: number;
}

const DEFAULT_CONFIG: MapRenderConfig = {
  width: 500,
  height: 500,
  gridLineInterval: 10,
  gridLineColor: 'rgba(100,100,100,0.3)',
  drawFOV: true,
  fovAngle: Math.PI / 2,
  fovRange: 2.0,
  drawCandidates: true,
  drawFrontiers: false,
};

// =============================================================================
// Color Scheme
// =============================================================================

const CELL_COLORS: Record<CellState, string> = {
  'unknown':     '#808080',  // Gray
  'free':        '#FFFFFF',  // White
  'explored':    '#E8F5E9',  // Light green tint
  'obstacle':    '#1A1A1A',  // Near-black
  'wall':        '#000000',  // Black
  'path':        '#E3F2FD',  // Light blue tint
  'collectible': '#FFD700',  // Gold
  'collected':   '#B0B0B0',  // Dimmed gray
};

// =============================================================================
// Map Renderer
// =============================================================================

export class MapRenderer {
  private config: MapRenderConfig;

  constructor(config: Partial<MapRenderConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Render the occupancy grid to a canvas.
   * Returns a data URL of the rendered image.
   *
   * @param grid       The 2D occupancy grid from WorldModel
   * @param worldToGrid Coordinate conversion function
   * @param gridToWorld Coordinate conversion function
   * @param options     Render options (robot pose, goal, candidates)
   */
  render(
    grid: GridCell[][],
    worldToGrid: (wx: number, wy: number) => { gx: number; gy: number },
    gridToWorld: (gx: number, gy: number) => { x: number; y: number },
    options: MapRenderOptions
  ): RenderedMap {
    // Check for canvas availability (not available in Node.js without polyfill)
    if (typeof document === 'undefined') {
      return { dataUrl: null, imageData: null, width: this.config.width, height: this.config.height };
    }

    const canvas = document.createElement('canvas');
    canvas.width = this.config.width;
    canvas.height = this.config.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return { dataUrl: null, imageData: null, width: this.config.width, height: this.config.height };
    }

    const gridRows = grid.length;
    const gridCols = grid[0]?.length ?? 0;
    const cellW = this.config.width / gridCols;
    const cellH = this.config.height / gridRows;

    // 1. Draw grid cells
    this.drawCells(ctx, grid, cellW, cellH);

    // 2. Draw grid lines
    if (this.config.gridLineInterval > 0) {
      this.drawGridLines(ctx, gridRows, gridCols, cellW, cellH);
    }

    // 3. Draw frontiers
    if (this.config.drawFrontiers && options.frontiers) {
      this.drawFrontierCells(ctx, options.frontiers, cellW, cellH);
    }

    // 4. Draw robot FOV
    if (this.config.drawFOV) {
      this.drawRobotFOV(ctx, options.robotPose, worldToGrid, cellW, cellH);
    }

    // 5. Draw candidates
    if (this.config.drawCandidates && options.candidates) {
      this.drawCandidateMarkers(ctx, options.candidates, worldToGrid, cellW, cellH);
    }

    // 6. Draw goal
    if (options.goal) {
      this.drawGoal(ctx, options.goal, worldToGrid, cellW, cellH);
    }

    // 7. Draw robot (last, so it's on top)
    this.drawRobot(ctx, options.robotPose, worldToGrid, cellW, cellH);

    const imageData = ctx.getImageData(0, 0, this.config.width, this.config.height);
    const dataUrl = canvas.toDataURL('image/png');

    return {
      dataUrl,
      imageData,
      width: this.config.width,
      height: this.config.height,
    };
  }

  /**
   * Render the grid to an RGBA pixel buffer (works without DOM canvas).
   * Useful for server-side rendering or testing.
   */
  renderToBuffer(grid: GridCell[][]): Uint8ClampedArray {
    const gridRows = grid.length;
    const gridCols = grid[0]?.length ?? 0;
    const cellW = Math.floor(this.config.width / gridCols);
    const cellH = Math.floor(this.config.height / gridRows);
    const width = cellW * gridCols;
    const height = cellH * gridRows;
    const buffer = new Uint8ClampedArray(width * height * 4);

    for (let gy = 0; gy < gridRows; gy++) {
      for (let gx = 0; gx < gridCols; gx++) {
        const color = hexToRGB(CELL_COLORS[grid[gy][gx].state]);
        const px0 = gx * cellW;
        const py0 = gy * cellH;

        for (let dy = 0; dy < cellH; dy++) {
          for (let dx = 0; dx < cellW; dx++) {
            const idx = ((py0 + dy) * width + (px0 + dx)) * 4;
            buffer[idx] = color.r;
            buffer[idx + 1] = color.g;
            buffer[idx + 2] = color.b;
            buffer[idx + 3] = 255;
          }
        }
      }
    }

    return buffer;
  }

  // ---------------------------------------------------------------------------
  // Drawing helpers
  // ---------------------------------------------------------------------------

  private drawCells(
    ctx: CanvasRenderingContext2D,
    grid: GridCell[][],
    cellW: number,
    cellH: number
  ): void {
    for (let gy = 0; gy < grid.length; gy++) {
      for (let gx = 0; gx < grid[gy].length; gx++) {
        ctx.fillStyle = CELL_COLORS[grid[gy][gx].state];
        ctx.fillRect(gx * cellW, gy * cellH, cellW, cellH);
      }
    }
  }

  private drawGridLines(
    ctx: CanvasRenderingContext2D,
    rows: number,
    cols: number,
    cellW: number,
    cellH: number
  ): void {
    ctx.strokeStyle = this.config.gridLineColor;
    ctx.lineWidth = 1;

    const interval = this.config.gridLineInterval;
    for (let x = 0; x <= cols; x += interval) {
      ctx.beginPath();
      ctx.moveTo(x * cellW, 0);
      ctx.lineTo(x * cellW, rows * cellH);
      ctx.stroke();
    }
    for (let y = 0; y <= rows; y += interval) {
      ctx.beginPath();
      ctx.moveTo(0, y * cellH);
      ctx.lineTo(cols * cellW, y * cellH);
      ctx.stroke();
    }
  }

  private drawFrontierCells(
    ctx: CanvasRenderingContext2D,
    frontiers: Array<{ gx: number; gy: number }>,
    cellW: number,
    cellH: number
  ): void {
    ctx.fillStyle = 'rgba(255, 255, 0, 0.4)'; // Semi-transparent yellow
    for (const f of frontiers) {
      ctx.fillRect(f.gx * cellW, f.gy * cellH, cellW, cellH);
    }
  }

  private drawRobotFOV(
    ctx: CanvasRenderingContext2D,
    robotPose: { x: number; y: number; rotation: number },
    worldToGrid: (wx: number, wy: number) => { gx: number; gy: number },
    cellW: number,
    cellH: number
  ): void {
    const robotGrid = worldToGrid(robotPose.x, robotPose.y);
    const cx = robotGrid.gx * cellW + cellW / 2;
    const cy = robotGrid.gy * cellH + cellH / 2;

    // FOV range in pixels (approximate)
    const rangePixels = (this.config.fovRange / 0.1) * cellW; // 0.1m per cell

    const halfFov = this.config.fovAngle / 2;
    // Adjust angle: grid Y increases downward, rotation 0 = north = up
    const startAngle = -Math.PI / 2 + robotPose.rotation - halfFov;
    const endAngle = -Math.PI / 2 + robotPose.rotation + halfFov;

    ctx.fillStyle = 'rgba(0, 255, 255, 0.1)';
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, rangePixels, startAngle, endAngle);
    ctx.closePath();
    ctx.fill();
  }

  private drawCandidateMarkers(
    ctx: CanvasRenderingContext2D,
    candidates: Candidate[],
    worldToGrid: (wx: number, wy: number) => { gx: number; gy: number },
    cellW: number,
    cellH: number
  ): void {
    for (const candidate of candidates) {
      const g = worldToGrid(candidate.pos_m[0], candidate.pos_m[1]);
      const cx = g.gx * cellW + cellW / 2;
      const cy = g.gy * cellH + cellH / 2;
      const radius = Math.max(4, cellW * 0.6);

      // Color by type
      switch (candidate.type) {
        case 'subgoal':  ctx.fillStyle = '#2196F3'; break; // Blue
        case 'frontier': ctx.fillStyle = '#FF9800'; break; // Orange
        case 'recovery': ctx.fillStyle = '#9C27B0'; break; // Purple
        case 'waypoint': ctx.fillStyle = '#00BCD4'; break; // Cyan
        default:         ctx.fillStyle = '#2196F3'; break;
      }

      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();

      // Label
      ctx.fillStyle = '#FFFFFF';
      ctx.font = `${Math.max(8, cellW * 0.7)}px monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(candidate.id, cx, cy);
    }
  }

  private drawGoal(
    ctx: CanvasRenderingContext2D,
    goal: { x: number; y: number },
    worldToGrid: (wx: number, wy: number) => { gx: number; gy: number },
    cellW: number,
    cellH: number
  ): void {
    const g = worldToGrid(goal.x, goal.y);
    const cx = g.gx * cellW + cellW / 2;
    const cy = g.gy * cellH + cellH / 2;
    const radius = Math.max(5, cellW * 0.8);

    // Red target circle
    ctx.strokeStyle = '#FF0000';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();

    // Inner dot
    ctx.fillStyle = '#FF0000';
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 0.4, 0, Math.PI * 2);
    ctx.fill();

    // Crosshair
    ctx.beginPath();
    ctx.moveTo(cx - radius * 1.3, cy);
    ctx.lineTo(cx + radius * 1.3, cy);
    ctx.moveTo(cx, cy - radius * 1.3);
    ctx.lineTo(cx, cy + radius * 1.3);
    ctx.stroke();
  }

  private drawRobot(
    ctx: CanvasRenderingContext2D,
    robotPose: { x: number; y: number; rotation: number },
    worldToGrid: (wx: number, wy: number) => { gx: number; gy: number },
    cellW: number,
    cellH: number
  ): void {
    const g = worldToGrid(robotPose.x, robotPose.y);
    const cx = g.gx * cellW + cellW / 2;
    const cy = g.gy * cellH + cellH / 2;
    const radius = Math.max(5, cellW * 0.8);

    // Green circle for robot body
    ctx.fillStyle = '#4CAF50';
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();

    // Border
    ctx.strokeStyle = '#1B5E20';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Heading arrow
    // rotation 0 = north = up in grid coordinates
    const arrowLen = radius * 1.8;
    const arrowAngle = robotPose.rotation - Math.PI / 2; // Convert to canvas angle
    const ax = cx + Math.cos(arrowAngle) * arrowLen;
    const ay = cy + Math.sin(arrowAngle) * arrowLen;

    ctx.strokeStyle = '#1B5E20';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(ax, ay);
    ctx.stroke();

    // Arrowhead
    const headLen = radius * 0.6;
    const headAngle = Math.PI / 6;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(
      ax - headLen * Math.cos(arrowAngle - headAngle),
      ay - headLen * Math.sin(arrowAngle - headAngle)
    );
    ctx.moveTo(ax, ay);
    ctx.lineTo(
      ax - headLen * Math.cos(arrowAngle + headAngle),
      ay - headLen * Math.sin(arrowAngle + headAngle)
    );
    ctx.stroke();
  }
}

// =============================================================================
// Helpers
// =============================================================================

function hexToRGB(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : { r: 128, g: 128, b: 128 };
}

// =============================================================================
// Export
// =============================================================================

export { CELL_COLORS };
