/**
 * Vision → SceneGraph Bridge
 *
 * Converts VisionFrame detections into SceneGraph observations,
 * connecting the camera perception pipeline to the semantic world model.
 *
 * Each VLM detection (label, depth, region) is projected into world
 * coordinates and registered as a SceneGraph node via observeObject().
 *
 * Pipeline:
 *   VisionFrame.detections → project to world coords → map to ObjectCategory
 *     → SceneGraphManager.observeObject() → SceneNode
 *
 * Deduplication: detections near existing nodes update them rather than
 * creating duplicates. Uses a spatial threshold (default: 0.3m).
 */

import type { VisionFrame, Detection } from './vision/mobilenet-detector';
import type { SceneGraphManager, ObjectObservation } from './scene-graph/scene-graph-manager';
import type { ObjectCategory } from './scene-graph/types';

// =============================================================================
// Types
// =============================================================================

export interface VisionSceneBridgeConfig {
  /** Distance threshold for deduplication (meters, default: 0.3) */
  deduplicationThresholdM: number;
  /** Minimum detection confidence to register (default: 0.4) */
  minConfidence: number;
  /** Camera horizontal FOV in radians (default: π/3 = 60°) */
  cameraFovRad: number;
  /** Whether to run confidence decay on each frame (default: true) */
  enableDecay: boolean;
}

const DEFAULT_CONFIG: VisionSceneBridgeConfig = {
  deduplicationThresholdM: 0.3,
  minConfidence: 0.4,
  cameraFovRad: Math.PI / 3,
  enableDecay: true,
};

/** Map common VLM detection labels to SceneGraph categories. */
const LABEL_TO_CATEGORY: Record<string, ObjectCategory> = {
  // Furniture
  chair: 'furniture',
  table: 'furniture',
  couch: 'furniture',
  bed: 'furniture',
  desk: 'furniture',
  sofa: 'furniture',
  bench: 'furniture',
  // Walls and doors
  wall: 'wall',
  door: 'door',
  // Obstacles
  obstacle: 'obstacle',
  box: 'obstacle',
  cone: 'obstacle',
  barrel: 'obstacle',
  // Collectibles
  ball: 'collectible',
  bottle: 'collectible',
  cup: 'collectible',
  book: 'collectible',
  // Containers
  backpack: 'container',
  suitcase: 'container',
  // Surfaces
  tv: 'surface',
  laptop: 'surface',
  keyboard: 'surface',
  // Decorations
  plant: 'decoration',
  clock: 'decoration',
  vase: 'decoration',
};

/** Map VLM region labels to angular offsets from robot heading. */
const REGION_ANGLES: Record<string, number> = {
  left: Math.PI / 6,
  center: 0,
  right: -Math.PI / 6,
};

// =============================================================================
// Vision → SceneGraph Bridge
// =============================================================================

export class VisionSceneBridge {
  private config: VisionSceneBridgeConfig;
  private manager: SceneGraphManager;
  private detectionCounter: number = 0;

  constructor(manager: SceneGraphManager, config: Partial<VisionSceneBridgeConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.manager = manager;
  }

  /**
   * Process a VisionFrame and register detections in the SceneGraph.
   * Returns the number of new or updated observations.
   */
  processFrame(
    pose: { x: number; y: number; rotation: number },
    frame: VisionFrame
  ): number {
    // Decay confidence of old scene graph nodes before adding new observations
    if (this.config.enableDecay) {
      const sg = this.manager.getSceneGraph();
      sg.decayConfidence();
      sg.pruneStale();
    }

    let count = 0;

    for (const detection of frame.detections) {
      if (detection.confidence < this.config.minConfidence) continue;

      const observation = this.detectionToObservation(pose, detection, frame.timestamp);
      if (observation) {
        this.manager.observeObject(observation);
        count++;
      }
    }

    return count;
  }

  /**
   * Convert a single VLM detection into a SceneGraph ObjectObservation.
   */
  private detectionToObservation(
    pose: { x: number; y: number; rotation: number },
    detection: Detection,
    timestamp: number
  ): ObjectObservation | null {
    // Project detection to world coordinates
    const worldPos = this.projectToWorld(pose, detection);
    if (!worldPos) return null;

    this.detectionCounter++;
    const category = this.labelToCategory(detection.label);

    // Estimate dimensions from depth and bbox
    const depthM = detection.estimatedDepthCm / 100;
    const angularWidth = detection.bbox.width * this.config.cameraFovRad;
    const estimatedWidthM = 2 * depthM * Math.tan(angularWidth / 2);
    const estimatedHeightM = estimatedWidthM * (detection.bbox.height / Math.max(0.01, detection.bbox.width));

    return {
      id: `vlm-${this.detectionCounter}`,
      label: detection.label,
      position: { x: worldPos.x, y: 0, z: worldPos.y }, // y=0 for ground plane, z=world-y
      dimensions: {
        x: Math.max(0.1, estimatedWidthM),
        y: Math.max(0.1, estimatedHeightM),
        z: Math.max(0.1, estimatedWidthM),
      },
      category,
      confidence: detection.confidence,
      timestamp,
      attributes: {
        source: 'vlm',
        region: detection.region,
        depthCm: detection.estimatedDepthCm,
        depthMethod: detection.depthMethod,
      },
    };
  }

  /**
   * Project a detection from image space to world coordinates.
   * Uses robot pose + detection region + depth estimate.
   */
  private projectToWorld(
    pose: { x: number; y: number; rotation: number },
    detection: Detection
  ): { x: number; y: number } | null {
    const depthM = detection.estimatedDepthCm / 100;
    if (depthM <= 0.01) return null;

    // Use bbox center for angular position within FOV
    const bboxCenterX = detection.bbox.x + detection.bbox.width / 2;
    const fovOffset = (bboxCenterX - 0.5) * this.config.cameraFovRad;
    const angle = pose.rotation - fovOffset;

    // Project using sin/cos convention
    const worldX = pose.x + Math.sin(angle) * depthM;
    const worldY = pose.y - Math.cos(angle) * depthM;

    return { x: worldX, y: worldY };
  }

  /**
   * Map a VLM detection label to a SceneGraph ObjectCategory.
   */
  private labelToCategory(label: string): ObjectCategory {
    const normalized = label.toLowerCase().replace(/[_\s]+/g, '');
    return LABEL_TO_CATEGORY[normalized] ?? 'unknown';
  }
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Create a VisionSceneBridge.
 *
 * ```typescript
 * const manager = getSceneGraphManager('robot-1');
 * const bridge = createVisionSceneBridge(manager);
 * bridge.processFrame(pose, visionFrame);
 * ```
 */
export function createVisionSceneBridge(
  manager: SceneGraphManager,
  config: Partial<VisionSceneBridgeConfig> = {}
): VisionSceneBridge {
  return new VisionSceneBridge(manager, config);
}
