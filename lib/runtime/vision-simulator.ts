/**
 * Ground-Truth Vision Simulator
 *
 * Converts arena ground-truth knowledge (walls, obstacles, bounds) into
 * VisionFrame output — simulating what a perfect VLM would report from
 * a given robot pose and camera direction.
 *
 * This enables end-to-end testing of the VisionWorldModelBridge pipeline
 * without needing real VLM inference or camera frames. The simulator:
 *
 *   1. Computes which obstacles and walls are visible within the camera FOV
 *   2. Calculates actual depth (distance) to each visible object
 *   3. Maps detections to left/center/right regions based on angular position
 *   4. Produces scene.openings/blocked based on clearance in each direction
 *   5. Returns a VisionFrame compatible with VisionWorldModelBridge.updateFromVision()
 *
 * Usage:
 * ```typescript
 * const sim = new GroundTruthVisionSimulator(arena.world);
 * const frame = sim.generateFrame(pose);
 * visionBridge.updateFromVision(pose, frame);
 * ```
 */

import type { Robot4World } from './robot4-runtime';
import type { VisionFrame, Detection, SceneAnalysis, BoundingBox } from './vision/mobilenet-detector';

// =============================================================================
// Types
// =============================================================================

export interface VisionSimulatorConfig {
  /** Camera horizontal field of view in radians (default: π/3 = 60°) */
  cameraFovRad: number;
  /** Maximum detection range in meters (default: 3.0) */
  maxRangeM: number;
  /** Ray-cast step size for visibility checks in meters (default: 0.05) */
  rayStepM: number;
  /** Minimum distance for a wall/obstacle to count as "blocking" (default: 0.8m) */
  blockThresholdM: number;
  /** Image dimensions for the simulated frame */
  imageSize: { width: number; height: number };
  /** Number of rays per region for clearance checking (default: 5) */
  raysPerRegion: number;
}

const DEFAULT_SIMULATOR_CONFIG: VisionSimulatorConfig = {
  cameraFovRad: Math.PI / 3, // 60°
  maxRangeM: 3.0,
  rayStepM: 0.05,
  blockThresholdM: 0.8,
  imageSize: { width: 160, height: 120 },
  raysPerRegion: 5,
};

// =============================================================================
// Ground-Truth Vision Simulator
// =============================================================================

export class GroundTruthVisionSimulator {
  private world: Robot4World;
  private config: VisionSimulatorConfig;
  private frameCounter: number = 0;

  constructor(world: Robot4World, config: Partial<VisionSimulatorConfig> = {}) {
    this.world = world;
    this.config = { ...DEFAULT_SIMULATOR_CONFIG, ...config };
  }

  /**
   * Generate a VisionFrame from the robot's current pose.
   * Simulates what a perfect VLM would output from a camera image.
   */
  generateFrame(pose: { x: number; y: number; rotation: number }): VisionFrame {
    this.frameCounter++;
    const startTime = performance.now();

    const detections = this.detectVisibleObjects(pose);
    const scene = this.analyzeScene(pose, detections);

    return {
      detections,
      scene,
      timestamp: Date.now(),
      processingMs: performance.now() - startTime,
      imageSize: this.config.imageSize,
      frameId: this.frameCounter,
    };
  }

  // ---------------------------------------------------------------------------
  // Object Detection
  // ---------------------------------------------------------------------------

  /**
   * Find all obstacles and wall segments visible within the camera FOV.
   */
  private detectVisibleObjects(
    pose: { x: number; y: number; rotation: number }
  ): Detection[] {
    const detections: Detection[] = [];
    const halfFov = this.config.cameraFovRad / 2;

    // Detect circular obstacles
    for (const obs of this.world.obstacles) {
      const dx = obs.x - pose.x;
      const dy = obs.y - pose.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > this.config.maxRangeM + obs.radius) continue;

      // Angle from robot to obstacle center
      const angleToObs = Math.atan2(dx, -dy); // sin=dx, -cos=dy convention
      const relAngle = this.normalizeAngle(angleToObs - pose.rotation);

      // Check if within FOV (with margin for obstacle radius)
      const angularRadius = Math.atan2(obs.radius, Math.max(0.1, dist));
      if (Math.abs(relAngle) > halfFov + angularRadius) continue;

      // Compute distance to surface
      const surfaceDist = Math.max(0.05, dist - obs.radius);

      // Check line-of-sight (no wall between robot and obstacle)
      if (!this.hasLineOfSight(pose.x, pose.y, obs.x, obs.y)) continue;

      const detection = this.createDetection(
        'obstacle',
        surfaceDist,
        relAngle,
        obs.radius,
        dist
      );
      detections.push(detection);
    }

    // Detect wall segments: sample multiple points along each visible wall
    for (const wall of this.world.walls) {
      const wallDetections = this.detectWallSegmentMultiPoint(pose, wall);
      detections.push(...wallDetections);
    }

    return detections;
  }

  /**
   * Detect multiple points along a wall segment visible in the camera FOV.
   * Samples at regular intervals to create a continuous barrier on the grid.
   */
  private detectWallSegmentMultiPoint(
    pose: { x: number; y: number; rotation: number },
    wall: { x1: number; y1: number; x2: number; y2: number }
  ): Detection[] {
    const halfFov = this.config.cameraFovRad / 2;
    const detections: Detection[] = [];

    // Sample the wall at intervals of ~0.2m (roughly 2 grid cells)
    const wallDx = wall.x2 - wall.x1;
    const wallDy = wall.y2 - wall.y1;
    const wallLen = Math.sqrt(wallDx * wallDx + wallDy * wallDy);
    if (wallLen < 0.01) return detections;

    const sampleStep = 0.2; // meters between wall samples
    const numSamples = Math.max(2, Math.ceil(wallLen / sampleStep) + 1);

    for (let i = 0; i < numSamples; i++) {
      const t = i / (numSamples - 1);
      const wx = wall.x1 + wallDx * t;
      const wy = wall.y1 + wallDy * t;

      const dx = wx - pose.x;
      const dy = wy - pose.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > this.config.maxRangeM || dist < 0.01) continue;

      const angle = Math.atan2(dx, -dy);
      const relAngle = this.normalizeAngle(angle - pose.rotation);

      if (Math.abs(relAngle) > halfFov) continue;

      // Check line-of-sight to this wall point
      if (!this.hasLineOfSight(pose.x, pose.y, wx, wy)) continue;

      detections.push(this.createDetection('wall', dist, relAngle, 0.05, dist));
    }

    return detections;
  }

  /**
   * Create a Detection object from geometric properties.
   */
  private createDetection(
    label: string,
    surfaceDistM: number,
    relAngle: number,
    physicalRadiusM: number,
    centerDistM: number
  ): Detection {
    const halfFov = this.config.cameraFovRad / 2;

    // Map relative angle to image x-position (0=left, 1=right)
    // relAngle: negative=right, positive=left in robot frame
    // Image: left=0, right=1
    const normalizedX = 0.5 - (relAngle / (2 * halfFov));
    const bboxCenterX = Math.max(0, Math.min(1, normalizedX));

    // Estimate bbox width from physical size and distance
    const angularSize = 2 * Math.atan2(physicalRadiusM, Math.max(0.1, centerDistM));
    const bboxWidth = Math.min(0.9, angularSize / this.config.cameraFovRad);

    // Estimate bbox height (assume roughly square-ish for obstacles)
    const bboxHeight = Math.min(0.9, bboxWidth * 1.2);

    // Estimate bbox y position: closer objects appear lower in frame
    const bboxY = Math.max(0, 0.8 - surfaceDistM / this.config.maxRangeM);

    const bbox: BoundingBox = {
      x: Math.max(0, Math.min(1 - bboxWidth, bboxCenterX - bboxWidth / 2)),
      y: bboxY,
      width: bboxWidth,
      height: bboxHeight,
    };

    // Region determination
    const region = this.getRegion(bboxCenterX);

    return {
      label,
      confidence: this.distanceToConfidence(surfaceDistM),
      bbox,
      estimatedDepthCm: Math.round(surfaceDistM * 100),
      depthMethod: 'vlm_estimate',
      region,
    };
  }

  // ---------------------------------------------------------------------------
  // Scene Analysis
  // ---------------------------------------------------------------------------

  /**
   * Analyze the scene to determine which directions are open vs blocked.
   * Casts rays in each region (left, center, right) and checks clearance.
   */
  private analyzeScene(
    pose: { x: number; y: number; rotation: number },
    detections: Detection[]
  ): SceneAnalysis {
    const halfFov = this.config.cameraFovRad / 2;
    const regions: Array<'left' | 'center' | 'right'> = ['left', 'center', 'right'];
    const openings: Array<'left' | 'center' | 'right'> = [];
    const blocked: Array<'left' | 'center' | 'right'> = [];

    // Region angular ranges within the FOV
    const regionRanges: Record<string, { min: number; max: number }> = {
      left:   { min: halfFov / 3,      max: halfFov },
      center: { min: -halfFov / 3,     max: halfFov / 3 },
      right:  { min: -halfFov,         max: -halfFov / 3 },
    };

    for (const region of regions) {
      const range = regionRanges[region];
      let minClearance = this.config.maxRangeM;

      // Cast multiple rays across the region
      for (let i = 0; i < this.config.raysPerRegion; i++) {
        const t = this.config.raysPerRegion === 1
          ? 0.5
          : i / (this.config.raysPerRegion - 1);
        const relAngle = range.min + t * (range.max - range.min);
        const absAngle = pose.rotation + relAngle;

        const hitDist = this.castRay(pose.x, pose.y, absAngle);
        if (hitDist < minClearance) {
          minClearance = hitDist;
        }
      }

      if (minClearance < this.config.blockThresholdM) {
        blocked.push(region);
      } else {
        openings.push(region);
      }
    }

    // Floor visibility: proportion of area without close obstacles
    const totalDetections = detections.length;
    const closeDetections = detections.filter(d => d.estimatedDepthCm < 80).length;
    const floorVisiblePercent = Math.max(0, 1 - closeDetections * 0.25);

    return {
      openings,
      blocked,
      floorVisiblePercent,
      environment: 'indoor',
      dominantSurface: 'floor',
    };
  }

  // ---------------------------------------------------------------------------
  // Ray-casting and Geometry
  // ---------------------------------------------------------------------------

  /**
   * Cast a ray from (x, y) in direction angle and return the hit distance.
   * Checks walls, obstacles, and arena bounds.
   */
  private castRay(x: number, y: number, angle: number): number {
    const step = this.config.rayStepM;
    const maxRange = this.config.maxRangeM;
    const sinA = Math.sin(angle);
    const cosA = Math.cos(angle);

    for (let d = step; d <= maxRange; d += step) {
      const rx = x + sinA * d;
      const ry = y - cosA * d;

      // Check bounds
      const b = this.world.bounds;
      if (rx < b.minX || rx > b.maxX || ry < b.minY || ry > b.maxY) {
        return d;
      }

      // Check obstacles
      for (const obs of this.world.obstacles) {
        const dx = rx - obs.x;
        const dy = ry - obs.y;
        if (Math.sqrt(dx * dx + dy * dy) <= obs.radius) {
          return d;
        }
      }

      // Check walls (point-to-segment distance)
      for (const wall of this.world.walls) {
        const wallDist = this.pointToSegmentDist(
          rx, ry,
          wall.x1, wall.y1, wall.x2, wall.y2
        );
        if (wallDist < step * 0.5) {
          return d;
        }
      }
    }

    return maxRange;
  }

  /**
   * Check if there's line of sight between two points.
   * Returns true if no walls block the path.
   */
  private hasLineOfSight(
    x1: number, y1: number,
    x2: number, y2: number
  ): boolean {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 0.01) return true;

    const step = this.config.rayStepM;
    const steps = Math.ceil(dist / step);

    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const rx = x1 + dx * t;
      const ry = y1 + dy * t;

      // Check walls only (not obstacles — we want to see the obstacle itself)
      for (const wall of this.world.walls) {
        if (this.pointToSegmentDist(rx, ry, wall.x1, wall.y1, wall.x2, wall.y2) < step * 0.5) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Closest point on line segment (x1,y1)-(x2,y2) to point (px,py).
   */
  private closestPointOnSegment(
    px: number, py: number,
    x1: number, y1: number,
    x2: number, y2: number
  ): { x: number; y: number } {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;

    if (lenSq === 0) return { x: x1, y: y1 };

    let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));

    return {
      x: x1 + t * dx,
      y: y1 + t * dy,
    };
  }

  /**
   * Minimum distance from point to line segment.
   */
  private pointToSegmentDist(
    px: number, py: number,
    x1: number, y1: number,
    x2: number, y2: number
  ): number {
    const closest = this.closestPointOnSegment(px, py, x1, y1, x2, y2);
    return Math.sqrt((px - closest.x) ** 2 + (py - closest.y) ** 2);
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * Map image x-position to region.
   */
  private getRegion(normalizedX: number): 'left' | 'center' | 'right' {
    if (normalizedX < 0.33) return 'left';
    if (normalizedX > 0.66) return 'right';
    return 'center';
  }

  /**
   * Convert distance to detection confidence.
   * Closer objects get higher confidence.
   */
  private distanceToConfidence(distM: number): number {
    return Math.max(0.3, Math.min(0.99, 1.0 - distM / (this.config.maxRangeM * 1.5)));
  }

  /**
   * Normalize angle to [-π, π].
   */
  private normalizeAngle(angle: number): number {
    while (angle > Math.PI) angle -= 2 * Math.PI;
    while (angle < -Math.PI) angle += 2 * Math.PI;
    return angle;
  }
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Create a GroundTruthVisionSimulator for an arena.
 *
 * ```typescript
 * const sim = createVisionSimulator(ARENA_SIMPLE_NAVIGATION.world);
 * const frame = sim.generateFrame({ x: 0, y: 0, rotation: 0 });
 * ```
 */
export function createVisionSimulator(
  world: Robot4World,
  config: Partial<VisionSimulatorConfig> = {}
): GroundTruthVisionSimulator {
  return new GroundTruthVisionSimulator(world, config);
}
