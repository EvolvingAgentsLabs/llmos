/**
 * MobileNet Object Detection Pipeline for LLMos (Legacy/Fallback)
 *
 * Provides fast, local object detection using MobileNet SSD
 * running via TensorFlow.js or ONNX Runtime in the browser/Electron.
 *
 * NOTE: The primary vision pipeline now uses Qwen3-VL-8B-Instruct
 * (see vlm-vision-detector.ts) which unifies vision + language into
 * a single multimodal model. MobileNet is retained as a lightweight
 * fallback for environments without VLM access or when sub-50ms
 * latency is required (e.g., emergency collision avoidance).
 *
 * Legacy Architecture (MobileNet):
 * Camera Frame → MobileNet SSD (30ms) → Structured JSON (VisionFrame)
 *
 * Primary Architecture (VLM):
 * Camera Frame → Qwen3-VL-8B (~200-500ms) → VisionFrame + Reasoning
 *
 * VisionFrame structure (shared by both pipelines):
 *                            ┌───────────────────────────────────┐
 *                            │         VisionFrame               │
 *                            │  {                                │
 *                            │    detections: [                  │
 *                            │      { label, bbox, depth_est }   │
 *                            │    ],                             │
 *                            │    scene: { openings, blocked }   │
 *                            │  }                                │
 *                            └───────────────────────────────────┘
 *                                    ↓                ↓
 *                            Instinct Brain     Planner Brain
 *                            (Qwen3-VL-8B)      (Qwen3-VL-8B + RSA)
 *
 * Key design decision: Output structured JSON, not raw tensors.
 * Both the instinct (single-pass LLM) and planner (RSA) consume
 * the same VisionFrame — they reason over semantics, not pixels.
 *
 * Depth estimation uses bbox-area-ratio for known object classes
 * and floor-position heuristic for unknown objects. This is simpler
 * than monocular depth networks but sufficient for indoor navigation.
 *
 * References:
 * - MobileNet V2: https://arxiv.org/abs/1801.04381
 * - MobileNet SSD: https://arxiv.org/abs/1704.04861
 * - TensorFlow.js: https://www.tensorflow.org/js
 * - COCO-SSD Model: https://github.com/tensorflow/tfjs-models/tree/master/coco-ssd
 */

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

/** Bounding box in normalized coordinates [0, 1]. */
export interface BoundingBox {
  x: number;      // Left edge (0-1)
  y: number;      // Top edge (0-1)
  width: number;  // Width (0-1)
  height: number; // Height (0-1)
}

/** A single detected object. */
export interface Detection {
  /** Object class label (COCO vocabulary). */
  label: string;
  /** Detection confidence (0-1). */
  confidence: number;
  /** Bounding box in normalized image coordinates. */
  bbox: BoundingBox;
  /** Estimated depth in cm, derived from bbox size + class priors. */
  estimatedDepthCm: number;
  /** Method used for depth estimation. */
  depthMethod: 'known_object_size' | 'bbox_area_ratio' | 'floor_position' | 'vlm_estimate' | 'unknown';
  /** Estimated real-world width of object in cm (if class is known). */
  estimatedWidthCm?: number;
  /** Region of frame: 'left' | 'center' | 'right'. */
  region: 'left' | 'center' | 'right';
}

/** Scene-level analysis derived from detections. */
export interface SceneAnalysis {
  /** Directions with clear paths (no obstacles detected). */
  openings: Array<'left' | 'center' | 'right'>;
  /** Directions with detected obstacles. */
  blocked: Array<'left' | 'center' | 'right'>;
  /** Percentage of frame that shows floor (proxy for open space). */
  floorVisiblePercent: number;
  /** Whether the scene appears to be indoors or outdoors. */
  environment: 'indoor' | 'outdoor' | 'unknown';
  /** Dominant surface type. */
  dominantSurface: 'floor' | 'carpet' | 'ground' | 'unknown';
}

/**
 * Complete vision frame — the bridge between MobileNet and LLM brains.
 * Both the instinct and planner brains consume this same structure.
 */
export interface VisionFrame {
  /** All detected objects with depth estimates. */
  detections: Detection[];
  /** Scene-level analysis. */
  scene: SceneAnalysis;
  /** Frame timestamp. */
  timestamp: number;
  /** Processing latency in ms. */
  processingMs: number;
  /** Image dimensions. */
  imageSize: { width: number; height: number };
  /** Frame sequence number (for temporal tracking). */
  frameId: number;
}

/**
 * Known object sizes (width in cm) for depth estimation.
 * When we know the real-world size of an object class, we can estimate
 * depth from how large it appears in the image (pinhole camera model).
 */
export const KNOWN_OBJECT_SIZES: Record<string, { widthCm: number; heightCm: number }> = {
  person: { widthCm: 45, heightCm: 170 },
  chair: { widthCm: 45, heightCm: 80 },
  door: { widthCm: 80, heightCm: 200 },
  bottle: { widthCm: 8, heightCm: 25 },
  cup: { widthCm: 8, heightCm: 10 },
  book: { widthCm: 15, heightCm: 22 },
  laptop: { widthCm: 35, heightCm: 25 },
  tv: { widthCm: 100, heightCm: 60 },
  car: { widthCm: 180, heightCm: 150 },
  cat: { widthCm: 30, heightCm: 25 },
  dog: { widthCm: 40, heightCm: 50 },
  backpack: { widthCm: 30, heightCm: 45 },
  cell_phone: { widthCm: 7, heightCm: 14 },
  keyboard: { widthCm: 45, heightCm: 15 },
  mouse: { widthCm: 6, heightCm: 10 },
  // Robotics-specific objects
  wall: { widthCm: 300, heightCm: 250 },
  box: { widthCm: 30, heightCm: 30 },
  cone: { widthCm: 15, heightCm: 30 },
  ball: { widthCm: 20, heightCm: 20 },
};

/** Camera intrinsics for depth estimation (default for typical webcam). */
export interface CameraIntrinsics {
  /** Horizontal field of view in degrees. */
  fovDegrees: number;
  /** Image width in pixels. */
  imageWidth: number;
  /** Image height in pixels. */
  imageHeight: number;
}

export const DEFAULT_CAMERA: CameraIntrinsics = {
  fovDegrees: 60,
  imageWidth: 640,
  imageHeight: 480,
};

// ═══════════════════════════════════════════════════════════════════════════
// DEPTH ESTIMATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Estimate depth from bounding box using known object size (pinhole model).
 *
 * depth = (realWidth * focalLength) / (bboxWidth * imageWidth)
 * focalLength = (imageWidth / 2) / tan(fov / 2)
 */
export function estimateDepthFromKnownSize(
  bbox: BoundingBox,
  objectClass: string,
  camera: CameraIntrinsics = DEFAULT_CAMERA
): { depthCm: number; method: Detection['depthMethod'] } {
  const known = KNOWN_OBJECT_SIZES[objectClass];
  if (!known) {
    return estimateDepthFromBboxArea(bbox, camera);
  }

  const fovRad = (camera.fovDegrees * Math.PI) / 180;
  const focalLengthPx = (camera.imageWidth / 2) / Math.tan(fovRad / 2);
  const bboxWidthPx = bbox.width * camera.imageWidth;

  if (bboxWidthPx < 1) {
    return { depthCm: 500, method: 'unknown' };
  }

  const depthCm = (known.widthCm * focalLengthPx) / bboxWidthPx;

  return {
    depthCm: Math.round(Math.max(5, Math.min(1000, depthCm))),
    method: 'known_object_size',
  };
}

/**
 * Estimate depth from bbox area ratio (heuristic).
 * Larger bounding boxes → closer objects.
 * Uses an empirical power-law relationship.
 */
export function estimateDepthFromBboxArea(
  bbox: BoundingBox,
  camera: CameraIntrinsics = DEFAULT_CAMERA
): { depthCm: number; method: Detection['depthMethod'] } {
  const area = bbox.width * bbox.height;

  if (area < 0.001) {
    return { depthCm: 500, method: 'bbox_area_ratio' };
  }

  // Empirical relationship: depth ≈ k / sqrt(area)
  // Calibrated for typical indoor robot scenarios
  const k = 50; // Calibration constant (adjust per camera)
  const depthCm = k / Math.sqrt(area);

  return {
    depthCm: Math.round(Math.max(5, Math.min(1000, depthCm))),
    method: 'bbox_area_ratio',
  };
}

/**
 * Estimate depth from floor position (y-coordinate in image).
 * Objects lower in the image (higher y) are closer.
 * Assumes a forward-facing camera with slight downward tilt.
 */
export function estimateDepthFromFloorPosition(
  bbox: BoundingBox,
  camera: CameraIntrinsics = DEFAULT_CAMERA
): { depthCm: number; method: Detection['depthMethod'] } {
  // Bottom of bounding box y-coordinate (0 = top, 1 = bottom)
  const bottomY = bbox.y + bbox.height;

  if (bottomY < 0.3) {
    // Object is in upper part of frame — far away
    return { depthCm: 300, method: 'floor_position' };
  }

  // Linear mapping: bottomY 0.3→1.0 maps to depth 300→10 cm
  const depthCm = 300 - (bottomY - 0.3) * (290 / 0.7);

  return {
    depthCm: Math.round(Math.max(10, Math.min(300, depthCm))),
    method: 'floor_position',
  };
}

/**
 * Best-effort depth estimation combining multiple methods.
 */
export function estimateDepth(
  bbox: BoundingBox,
  objectClass: string,
  camera: CameraIntrinsics = DEFAULT_CAMERA
): { depthCm: number; method: Detection['depthMethod']; estimatedWidthCm?: number } {
  // Try known object size first (most accurate)
  const known = KNOWN_OBJECT_SIZES[objectClass];
  if (known) {
    const result = estimateDepthFromKnownSize(bbox, objectClass, camera);
    return { ...result, estimatedWidthCm: known.widthCm };
  }

  // For large objects (likely walls/furniture), use floor position
  if (bbox.width > 0.3 || bbox.height > 0.4) {
    return estimateDepthFromFloorPosition(bbox, camera);
  }

  // Default: bbox area heuristic
  return estimateDepthFromBboxArea(bbox, camera);
}

// ═══════════════════════════════════════════════════════════════════════════
// SCENE ANALYSIS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Determine which region of the frame a detection falls in.
 */
export function getRegion(bbox: BoundingBox): 'left' | 'center' | 'right' {
  const centerX = bbox.x + bbox.width / 2;
  if (centerX < 0.33) return 'left';
  if (centerX > 0.66) return 'right';
  return 'center';
}

/**
 * Analyze the scene from detections to determine openings and blocked directions.
 */
export function analyzeScene(detections: Detection[]): SceneAnalysis {
  const regions: Record<string, Detection[]> = { left: [], center: [], right: [] };

  for (const det of detections) {
    regions[det.region].push(det);
  }

  const blocked: Array<'left' | 'center' | 'right'> = [];
  const openings: Array<'left' | 'center' | 'right'> = [];

  for (const region of ['left', 'center', 'right'] as const) {
    const nearObstacles = regions[region].filter(
      (d) => d.estimatedDepthCm < 80 && d.confidence > 0.4
    );
    if (nearObstacles.length > 0) {
      blocked.push(region);
    } else {
      openings.push(region);
    }
  }

  // Floor visibility heuristic: if few detections in lower frame, floor is visible
  const lowerFrameDetections = detections.filter(
    (d) => d.bbox.y + d.bbox.height > 0.7
  );
  const floorVisiblePercent = Math.max(0, 1 - lowerFrameDetections.length * 0.2);

  return {
    openings,
    blocked,
    floorVisiblePercent,
    environment: 'unknown',
    dominantSurface: 'unknown',
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// MOBILENET DETECTOR CLASS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Interface for the actual ML model backend.
 * This allows swapping between TensorFlow.js COCO-SSD, ONNX Runtime, etc.
 */
export interface ObjectDetectionBackend {
  /** Load the model (called once at startup). */
  load(): Promise<void>;
  /** Run detection on an image. Returns raw detections. */
  detect(imageData: ImageData | HTMLCanvasElement | HTMLVideoElement): Promise<Array<{
    class: string;
    score: number;
    bbox: [number, number, number, number]; // [x, y, width, height] in pixels
  }>>;
  /** Whether the model is loaded and ready. */
  isReady(): boolean;
}

export interface MobileNetDetectorConfig {
  /** Minimum confidence to include a detection. */
  minConfidence: number;
  /** Maximum number of detections to return. */
  maxDetections: number;
  /** Camera intrinsics for depth estimation. */
  camera: CameraIntrinsics;
  /** Whether to run scene analysis. */
  analyzeSceneEnabled: boolean;
}

const DEFAULT_DETECTOR_CONFIG: MobileNetDetectorConfig = {
  minConfidence: 0.3,
  maxDetections: 20,
  camera: DEFAULT_CAMERA,
  analyzeSceneEnabled: true,
};

/**
 * MobileNet-based object detector that produces structured VisionFrames.
 *
 * Usage:
 * ```ts
 * const detector = new MobileNetDetector(backend);
 * await detector.initialize();
 *
 * // In sensing loop (~30fps):
 * const frame = await detector.processFrame(canvas);
 * // frame.detections = [{label: "chair", depth: 120cm, region: "left"}, ...]
 * // frame.scene = {openings: ["center", "right"], blocked: ["left"]}
 * ```
 */
export class MobileNetDetector {
  private backend: ObjectDetectionBackend;
  private config: MobileNetDetectorConfig;
  private frameCounter: number = 0;
  private initialized: boolean = false;

  constructor(backend: ObjectDetectionBackend, config?: Partial<MobileNetDetectorConfig>) {
    this.backend = backend;
    this.config = { ...DEFAULT_DETECTOR_CONFIG, ...config };
  }

  /** Initialize the detector (loads model weights). */
  async initialize(): Promise<void> {
    await this.backend.load();
    this.initialized = true;
  }

  /** Check if detector is ready. */
  isReady(): boolean {
    return this.initialized && this.backend.isReady();
  }

  /**
   * Process a single camera frame and return a structured VisionFrame.
   * This is the main method called in the sensing loop.
   */
  async processFrame(
    imageSource: ImageData | HTMLCanvasElement | HTMLVideoElement
  ): Promise<VisionFrame> {
    const startTime = performance.now();
    this.frameCounter++;

    // Run object detection
    const rawDetections = await this.backend.detect(imageSource);

    // Get image dimensions
    const imgWidth = 'width' in imageSource
      ? imageSource.width
      : this.config.camera.imageWidth;
    const imgHeight = 'height' in imageSource
      ? imageSource.height
      : this.config.camera.imageHeight;

    // Convert raw detections to structured format with depth estimation
    const detections: Detection[] = rawDetections
      .filter((d) => d.score >= this.config.minConfidence)
      .slice(0, this.config.maxDetections)
      .map((raw) => {
        const bbox: BoundingBox = {
          x: raw.bbox[0] / imgWidth,
          y: raw.bbox[1] / imgHeight,
          width: raw.bbox[2] / imgWidth,
          height: raw.bbox[3] / imgHeight,
        };

        const depthResult = estimateDepth(bbox, raw.class, this.config.camera);
        const region = getRegion(bbox);

        return {
          label: raw.class,
          confidence: raw.score,
          bbox,
          estimatedDepthCm: depthResult.depthCm,
          depthMethod: depthResult.method,
          estimatedWidthCm: depthResult.estimatedWidthCm,
          region,
        };
      });

    // Scene analysis
    const scene = this.config.analyzeSceneEnabled
      ? analyzeScene(detections)
      : {
          openings: ['left', 'center', 'right'] as Array<'left' | 'center' | 'right'>,
          blocked: [] as Array<'left' | 'center' | 'right'>,
          floorVisiblePercent: 1,
          environment: 'unknown' as const,
          dominantSurface: 'unknown' as const,
        };

    return {
      detections,
      scene,
      timestamp: Date.now(),
      processingMs: performance.now() - startTime,
      imageSize: { width: imgWidth, height: imgHeight },
      frameId: this.frameCounter,
    };
  }

  /**
   * Format a VisionFrame as a text summary for LLM consumption.
   * Both instinct and planner brains use this.
   */
  static formatForLLM(frame: VisionFrame): string {
    if (frame.detections.length === 0) {
      return `## Vision (Frame #${frame.frameId})\nNo objects detected. Path appears clear.`;
    }

    const lines = [`## Vision (Frame #${frame.frameId}, ${frame.processingMs.toFixed(0)}ms)`];

    // Detections summary
    lines.push('### Detected Objects');
    for (const det of frame.detections) {
      lines.push(
        `- **${det.label}** (${(det.confidence * 100).toFixed(0)}%) — ${det.region} region, ~${det.estimatedDepthCm}cm away`
      );
    }

    // Scene summary
    lines.push('### Scene Analysis');
    if (frame.scene.openings.length > 0) {
      lines.push(`- Clear paths: ${frame.scene.openings.join(', ')}`);
    }
    if (frame.scene.blocked.length > 0) {
      lines.push(`- Blocked: ${frame.scene.blocked.join(', ')}`);
    }

    return lines.join('\n');
  }

  /**
   * Format a VisionFrame as structured JSON for the instinct brain.
   * More compact than the LLM text format.
   */
  static formatAsJSON(frame: VisionFrame): string {
    return JSON.stringify({
      objects: frame.detections.map((d) => ({
        label: d.label,
        confidence: Math.round(d.confidence * 100) / 100,
        depth_cm: d.estimatedDepthCm,
        region: d.region,
      })),
      scene: {
        openings: frame.scene.openings,
        blocked: frame.scene.blocked,
        floor_pct: Math.round(frame.scene.floorVisiblePercent * 100) / 100,
      },
    }, null, 2);
  }

  /** Update configuration. */
  setConfig(config: Partial<MobileNetDetectorConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

export default MobileNetDetector;
