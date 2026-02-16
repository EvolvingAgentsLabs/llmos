/**
 * Vision-Based World Model Bridge
 *
 * Builds the occupancy grid from camera + VLM output alone — no distance
 * sensors. Each cycle, the VLM processes a camera frame and produces a
 * VisionFrame with detections (label, depth estimate, region) and scene
 * analysis (openings, blocked directions).
 *
 * This bridge converts VisionFrame data into grid cell updates:
 *
 *   1. Camera FOV cone: mark cells within the camera's field of view
 *   2. Openings: directions the VLM says are clear → mark free cells
 *   3. Detections: objects with depth estimates → mark obstacle cells
 *   4. Blocked directions: mark obstacles at a conservative distance
 *
 * Pipeline:
 *   Camera Frame → VLM (Qwen3-VL) → VisionFrame
 *     → project detections onto grid (region → angle, depth → distance)
 *     → mark free cells in open directions
 *     → mark obstacle cells at detection positions
 *     → compute frontier cells at observation boundary
 *     → produce identical serialized output as ground-truth bridge
 *
 * Key differences from ground-truth bridge:
 *   - No rasterize() call — grid builds incrementally from VLM observations
 *   - Lower confidence (VLM depth estimates vs perfect knowledge)
 *   - Grid starts fully unknown, explored area grows with movement
 *   - Limited to camera FOV (~60°) per frame — no 360° awareness
 *   - Wall vs obstacle indistinct: all solid objects marked as 'obstacle'
 */

import WorldModel, { getWorldModel, type WorldModelConfig } from './world-model';
import type { IWorldModelBridge, FrontierCell } from './world-model-bridge';
import type { VisionFrame, Detection, SceneAnalysis } from './vision/mobilenet-detector';

// =============================================================================
// Types
// =============================================================================

export interface VisionBridgeConfig {
  /** Device/robot ID for the WorldModel singleton */
  deviceId: string;
  /** Camera horizontal field of view in radians (default: ~60° = 1.05 rad) */
  cameraFovRad: number;
  /** Default free-space depth when VLM says a direction is "open" (meters, default: 1.0) */
  defaultOpenDepthM: number;
  /** Default obstacle depth when VLM says a direction is "blocked" but
   *  no specific detection gives a distance (meters, default: 0.5) */
  defaultBlockedDepthM: number;
  /** Confidence assigned to VLM-derived free cells (default: 0.7) */
  freeConfidence: number;
  /** Confidence assigned to VLM-derived obstacle cells (default: 0.8) */
  obstacleConfidence: number;
  /** Grid cell step size for ray-casting (meters, default: 0.1) */
  rayStepM: number;
  /** Whether to enable temporal confidence decay (default: true) */
  enableDecay: boolean;
  /** Age in ms after which cells start losing confidence (default: 5000) */
  decayStartMs: number;
  /** Age in ms after which non-explored cells revert to unknown (default: 30000) */
  staleThresholdMs: number;
  /** Confidence decay rate per second after decayStartMs (default: 0.05) */
  decayRatePerSec: number;
  /** Minimum confidence below which a cell reverts to unknown (default: 0.2) */
  minConfidence: number;
  /** World model config overrides */
  worldModelConfig?: Partial<WorldModelConfig>;
}

const DEFAULT_VISION_BRIDGE_CONFIG: VisionBridgeConfig = {
  deviceId: 'vision',
  cameraFovRad: Math.PI / 3, // 60°
  defaultOpenDepthM: 1.0,
  defaultBlockedDepthM: 0.5,
  freeConfidence: 0.7,
  obstacleConfidence: 0.8,
  rayStepM: 0.1,
  enableDecay: true,
  decayStartMs: 5000,
  staleThresholdMs: 30000,
  decayRatePerSec: 0.05,
  minConfidence: 0.2,
};

/** Map VLM region labels to angular offsets from robot heading. */
const REGION_ANGLES: Record<string, number> = {
  left: Math.PI / 6,     // +30° (left of center)
  center: 0,             // straight ahead
  right: -Math.PI / 6,   // -30° (right of center)
};

// =============================================================================
// Vision-Based World Model Bridge
// =============================================================================

export class VisionWorldModelBridge implements IWorldModelBridge {
  private config: VisionBridgeConfig;
  private worldModel: WorldModel;
  private initialized: boolean = false;

  constructor(config: Partial<VisionBridgeConfig> = {}) {
    this.config = { ...DEFAULT_VISION_BRIDGE_CONFIG, ...config };
    const wmConfig = this.config.worldModelConfig ?? {};
    this.worldModel = getWorldModel(this.config.deviceId, wmConfig);
  }

  /**
   * Get the underlying WorldModel instance.
   */
  getWorldModel(): WorldModel {
    return this.worldModel;
  }

  /**
   * Update the grid from a VLM-processed camera frame.
   *
   * This is the primary update method — replaces rasterize() from ground-truth
   * bridge and updateFromSensors() from the distance-sensor bridge.
   *
   * Call each cycle with the robot's pose and the VisionFrame from the VLM.
   */
  updateFromVision(
    pose: { x: number; y: number; rotation: number },
    vision: VisionFrame,
    timestamp: number = Date.now()
  ): void {
    // Mark robot position as explored
    this.markExplored(pose, timestamp);

    // Process scene analysis: mark free cells in open directions
    this.processOpenings(pose, vision.scene, timestamp);

    // Process detections: mark obstacles at estimated positions
    this.processDetections(pose, vision.detections, timestamp);

    // Process blocked directions: mark conservative obstacles
    this.processBlocked(pose, vision.scene, vision.detections, timestamp);

    // Decay confidence of old cells
    if (this.config.enableDecay) {
      this.decayOldCells(timestamp);
    }

    this.initialized = true;
  }

  /**
   * Update the bridge with current robot pose.
   * Marks the robot's current cell as 'explored'.
   */
  updateRobotPose(
    pose: { x: number; y: number; rotation: number },
    timestamp: number = Date.now()
  ): void {
    this.markExplored(pose, timestamp);
  }

  /**
   * Find frontier cells: free/explored cells adjacent to unknown cells.
   * Identical algorithm to ground-truth bridge.
   */
  findFrontiers(): FrontierCell[] {
    const grid = this.worldModel.getGrid();
    const dims = this.worldModel.getGridDimensions();
    const frontiers: FrontierCell[] = [];

    for (let gy = 1; gy < dims.height - 1; gy++) {
      for (let gx = 1; gx < dims.width - 1; gx++) {
        const cell = grid[gy][gx];
        if (cell.state !== 'free' && cell.state !== 'explored') continue;

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

    frontiers.sort((a, b) => b.unknownNeighbors - a.unknownNeighbors);
    return frontiers;
  }

  /**
   * Check whether the bridge has received at least one vision update.
   */
  isRasterized(): boolean {
    return this.initialized;
  }

  /**
   * Reset the bridge state.
   */
  reset(): void {
    this.initialized = false;
    this.worldModel.resetSerializer();
  }

  // ---------------------------------------------------------------------------
  // Temporal Coherence: Confidence Decay
  // ---------------------------------------------------------------------------

  /**
   * Decay confidence of cells that haven't been re-observed recently.
   * Cells older than decayStartMs lose confidence gradually.
   * Cells older than staleThresholdMs with low confidence revert to unknown.
   * Explored cells (robot was physically there) are exempt from staleness.
   */
  private decayOldCells(now: number): void {
    const grid = this.worldModel.getGrid();
    const dims = this.worldModel.getGridDimensions();

    for (let gy = 0; gy < dims.height; gy++) {
      for (let gx = 0; gx < dims.width; gx++) {
        const cell = grid[gy][gx];

        // Skip unknown cells (nothing to decay) and explored cells (robot was there)
        if (cell.state === 'unknown' || cell.state === 'explored') continue;
        if (cell.lastUpdated === 0) continue;

        const age = now - cell.lastUpdated;

        // No decay if cell was recently updated
        if (age < this.config.decayStartMs) continue;

        // Compute decayed confidence
        const decayTime = (age - this.config.decayStartMs) / 1000;
        const decayedConfidence = cell.confidence - decayTime * this.config.decayRatePerSec;

        if (decayedConfidence < this.config.minConfidence || age > this.config.staleThresholdMs) {
          // Revert to unknown — this forces re-observation
          cell.state = 'unknown';
          cell.confidence = 0;
        } else {
          cell.confidence = decayedConfidence;
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Internal: Grid update methods
  // ---------------------------------------------------------------------------

  /**
   * Mark the robot's current cell as explored.
   */
  private markExplored(
    pose: { x: number; y: number; rotation: number },
    timestamp: number
  ): void {
    const { gx, gy } = this.worldModel.worldToGrid(pose.x, pose.y);
    if (this.worldModel.isValidGridCoord(gx, gy)) {
      const grid = this.worldModel.getGrid();
      const cell = grid[gy][gx];
      if (cell.state === 'free' || cell.state === 'explored' || cell.state === 'unknown') {
        cell.state = 'explored';
        cell.confidence = 1.0;
        cell.lastUpdated = timestamp;
        cell.visitCount++;
      }
    }
  }

  /**
   * Mark free cells in directions the VLM says are open.
   * Casts rays from robot position in each opening direction.
   */
  private processOpenings(
    pose: { x: number; y: number; rotation: number },
    scene: SceneAnalysis,
    timestamp: number
  ): void {
    for (const direction of scene.openings) {
      const angleOffset = REGION_ANGLES[direction] ?? 0;
      const angle = pose.rotation + angleOffset;
      this.castFreeRay(pose, angle, this.config.defaultOpenDepthM, timestamp);
    }
  }

  /**
   * Project VLM detections onto the grid as obstacles.
   * Each detection has a region (→ angle) and depth estimate (→ distance).
   */
  private processDetections(
    pose: { x: number; y: number; rotation: number },
    detections: Detection[],
    timestamp: number
  ): void {
    for (const det of detections) {
      const angleOffset = REGION_ANGLES[det.region] ?? 0;

      // Use bbox x-center for finer angular resolution within the region
      const bboxCenterX = det.bbox.x + det.bbox.width / 2;
      // Map bbox center (0-1) to angle within FOV
      const fovOffset = (bboxCenterX - 0.5) * this.config.cameraFovRad;
      const angle = pose.rotation - fovOffset; // Negative because image-left = robot-left

      const depthM = det.estimatedDepthCm / 100;

      // Mark free cells along the ray up to the obstacle
      this.castFreeRay(pose, angle, Math.max(0, depthM - this.config.rayStepM), timestamp);

      // Mark obstacle at the detection position
      const obsX = pose.x + Math.sin(angle) * depthM;
      const obsY = pose.y - Math.cos(angle) * depthM;
      this.markObstacle(obsX, obsY, det.confidence, timestamp);
    }
  }

  /**
   * Mark conservative obstacles in directions the VLM says are blocked,
   * but only if no specific detection already covers that direction.
   */
  private processBlocked(
    pose: { x: number; y: number; rotation: number },
    scene: SceneAnalysis,
    detections: Detection[],
    timestamp: number
  ): void {
    const detectedRegions = new Set(detections.map(d => d.region));

    for (const direction of scene.blocked) {
      // Skip if a specific detection already covers this region
      if (detectedRegions.has(direction as Detection['region'])) continue;

      const angleOffset = REGION_ANGLES[direction] ?? 0;
      const angle = pose.rotation + angleOffset;
      const depthM = this.config.defaultBlockedDepthM;

      // Mark free cells up to the blocked distance
      this.castFreeRay(pose, angle, Math.max(0, depthM - this.config.rayStepM), timestamp);

      // Mark obstacle at blocked distance
      const obsX = pose.x + Math.sin(angle) * depthM;
      const obsY = pose.y - Math.cos(angle) * depthM;
      this.markObstacle(obsX, obsY, 0.6, timestamp);
    }
  }

  /**
   * Cast a ray from robot position, marking cells as free along the way.
   * Uses sin(angle) for X, -cos(angle) for Y (matching robot coordinate system).
   */
  private castFreeRay(
    pose: { x: number; y: number },
    angle: number,
    depthM: number,
    timestamp: number
  ): void {
    const step = this.config.rayStepM;
    const grid = this.worldModel.getGrid();

    for (let d = step; d <= depthM; d += step) {
      const wx = pose.x + Math.sin(angle) * d;
      const wy = pose.y - Math.cos(angle) * d;
      const { gx, gy } = this.worldModel.worldToGrid(wx, wy);

      if (this.worldModel.isValidGridCoord(gx, gy)) {
        const cell = grid[gy][gx];
        // Only mark as free if unknown or already free (don't overwrite explored/obstacle)
        if (cell.state === 'unknown' || cell.state === 'free') {
          const confidence = this.config.freeConfidence * Math.max(0.5, 1.0 - d / (depthM + 0.01));
          if (confidence >= cell.confidence || cell.state === 'unknown') {
            cell.state = 'free';
            cell.confidence = Math.max(cell.confidence, confidence);
            cell.lastUpdated = timestamp;
          }
        }
      }
    }
  }

  /**
   * Mark a world-coordinate position as obstacle on the grid.
   */
  private markObstacle(
    wx: number,
    wy: number,
    confidence: number,
    timestamp: number
  ): void {
    const { gx, gy } = this.worldModel.worldToGrid(wx, wy);
    if (this.worldModel.isValidGridCoord(gx, gy)) {
      const grid = this.worldModel.getGrid();
      const cell = grid[gy][gx];
      const adjConfidence = confidence * this.config.obstacleConfidence;
      // Obstacle overwrites free/unknown but not explored (robot was there)
      if (cell.state !== 'explored') {
        cell.state = 'obstacle';
        cell.confidence = Math.max(cell.confidence, adjConfidence);
        cell.lastUpdated = timestamp;
      }
    }
  }
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Create a VisionWorldModelBridge for camera-based navigation.
 *
 * Usage:
 * ```typescript
 * const bridge = createVisionBridge({ deviceId: 'robot-1' });
 * // Each cycle:
 * const visionFrame = await vlmDetector.processFrame(cameraImage);
 * bridge.updateFromVision(pose, visionFrame);
 * const frame = bridge.getWorldModel().serialize('auto', pose, goal);
 * ```
 */
export function createVisionBridge(
  config: Partial<VisionBridgeConfig> = {}
): VisionWorldModelBridge {
  return new VisionWorldModelBridge(config);
}
