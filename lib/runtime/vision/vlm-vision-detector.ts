/**
 * VLM (Vision-Language Model) Vision Detector for LLMos
 *
 * Uses Qwen3-VL-8B-Instruct, a unified multimodal vision-language model
 * that processes camera frames directly — no separate object detector needed.
 *
 * Architecture:
 *   Camera Frame → Qwen3-VL-8B-Instruct (image + text) → VisionFrame JSON + Reasoning
 *
 * Capabilities:
 * - Direct image understanding — sees and reasons about raw camera frames
 * - Richer scene understanding — not limited to fixed object class vocabularies
 * - Native OCR in 32 languages, spatial reasoning, GUI understanding
 * - Handles unusual objects, signage, text in environment
 * - 131K context window supports vision history for temporal reasoning
 * - Single model for both perception AND instinct-level reasoning
 * - Multimodal RSA: each RSA candidate independently analyzes the scene,
 *   aggregation cross-references spatial observations for better accuracy
 *
 * For emergency collision avoidance, reactive rules in the dual-brain
 * controller bypass the VLM entirely (rule-based, <5ms).
 *
 * References:
 * - Qwen3-VL: https://huggingface.co/Qwen/Qwen3-VL-8B-Instruct
 * - OpenRouter: qwen/qwen3-vl-8b-instruct ($0.08/M input, $0.50/M output)
 */

import type { VisionFrame, Detection, SceneAnalysis, BoundingBox } from './mobilenet-detector';
import { getRegion, analyzeScene } from './mobilenet-detector';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Interface for the VLM backend that processes images directly.
 * Uses an OpenAI-compatible vision API (Qwen3-VL supports this format).
 */
export interface VLMBackend {
  /** Send an image + text prompt and get a structured response. */
  analyzeImage(
    imageBase64: string,
    prompt: string,
    options?: { temperature?: number; maxTokens?: number }
  ): Promise<string>;
  /** Whether the backend is ready. */
  isReady(): boolean;
}

/** Configuration for the VLM Vision Detector. */
export interface VLMVisionDetectorConfig {
  /** Minimum confidence to include a detection (0-1). */
  minConfidence: number;
  /** Maximum number of detections to return. */
  maxDetections: number;
  /** Whether to include scene analysis in the VLM prompt. */
  analyzeSceneEnabled: boolean;
  /** Whether to request depth estimates from the VLM. */
  estimateDepth: boolean;
  /** Image detail level for the VLM ('low' saves tokens, 'high' for detail). */
  imageDetail: 'low' | 'high' | 'auto';
  /** Temperature for VLM inference. */
  temperature: number;
  /** Max tokens for VLM response. */
  maxTokens: number;
}

const DEFAULT_VLM_CONFIG: VLMVisionDetectorConfig = {
  minConfidence: 0.3,
  maxDetections: 20,
  analyzeSceneEnabled: true,
  estimateDepth: true,
  imageDetail: 'low',
  temperature: 0.2,
  maxTokens: 1024,
};

// ═══════════════════════════════════════════════════════════════════════════
// VLM VISION PROMPT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Structured prompt that instructs Qwen3-VL-8B to produce VisionFrame-compatible output.
 * The VLM replaces both MobileNet (object detection) and the instinct LLM (scene understanding).
 */
const VISION_ANALYSIS_PROMPT = `You are a robot vision system. Analyze this camera frame and output structured JSON.

Detect all visible objects and estimate their properties. Output ONLY valid JSON matching this schema:

{
  "detections": [
    {
      "label": "object class name",
      "confidence": 0.0-1.0,
      "bbox": { "x": 0.0-1.0, "y": 0.0-1.0, "width": 0.0-1.0, "height": 0.0-1.0 },
      "estimatedDepthCm": 10-1000,
      "depthMethod": "vlm_estimate",
      "region": "left|center|right"
    }
  ],
  "scene": {
    "openings": ["left", "center", "right"],
    "blocked": [],
    "floorVisiblePercent": 0.0-1.0,
    "environment": "indoor|outdoor|unknown",
    "dominantSurface": "floor|carpet|ground|unknown"
  },
  "summary": "Brief natural language description of what you see"
}

Rules:
- bbox coordinates are normalized 0-1 (x=0 is left edge, y=0 is top edge)
- region: left (<0.33), center (0.33-0.66), right (>0.66) based on bbox center x
- estimatedDepthCm: estimate how far each object is from the camera in centimeters
- openings: directions with clear paths for robot navigation
- blocked: directions with obstacles within ~80cm
- Include ALL visible objects, not just common ones
- Read any text/signs visible in the scene
- Output ONLY the JSON, no markdown fences or explanation`;

// ═══════════════════════════════════════════════════════════════════════════
// VLM VISION DETECTOR
// ═══════════════════════════════════════════════════════════════════════════

/**
 * VLM-based vision detector using Qwen3-VL-8B-Instruct.
 *
 * Replaces MobileNet SSD with a unified vision-language model that
 * processes raw camera frames and outputs structured VisionFrames.
 *
 * Usage:
 * ```ts
 * const detector = new VLMVisionDetector(vlmBackend);
 *
 * // In sensing loop (~2-5Hz with VLM, vs 30Hz with MobileNet):
 * const frame = await detector.processFrame(imageBase64);
 * // frame.detections = [{label: "office chair", depth: 120cm, region: "left"}, ...]
 * // frame.scene = {openings: ["center", "right"], blocked: ["left"]}
 * ```
 */
export class VLMVisionDetector {
  private backend: VLMBackend;
  private config: VLMVisionDetectorConfig;
  private frameCounter: number = 0;

  constructor(backend: VLMBackend, config?: Partial<VLMVisionDetectorConfig>) {
    this.backend = backend;
    this.config = { ...DEFAULT_VLM_CONFIG, ...config };
  }

  /** Check if detector is ready. */
  isReady(): boolean {
    return this.backend.isReady();
  }

  /**
   * Process a camera frame using the VLM.
   * The VLM receives the raw image and produces structured VisionFrame data.
   *
   * @param imageBase64 - Base64-encoded image (JPEG or PNG)
   * @param imageWidth - Image width in pixels (for metadata)
   * @param imageHeight - Image height in pixels (for metadata)
   */
  async processFrame(
    imageBase64: string,
    imageWidth: number = 640,
    imageHeight: number = 480
  ): Promise<VisionFrame> {
    const startTime = performance.now();
    this.frameCounter++;

    const response = await this.backend.analyzeImage(
      imageBase64,
      VISION_ANALYSIS_PROMPT,
      {
        temperature: this.config.temperature,
        maxTokens: this.config.maxTokens,
      }
    );

    // Parse VLM response into VisionFrame
    const frame = this.parseVLMResponse(response, imageWidth, imageHeight, startTime);
    return frame;
  }

  /**
   * Parse the VLM's JSON response into a VisionFrame.
   * Handles malformed responses gracefully.
   */
  private parseVLMResponse(
    response: string,
    imageWidth: number,
    imageHeight: number,
    startTime: number
  ): VisionFrame {
    try {
      // Strip markdown code fences if present
      let jsonStr = response.trim();
      if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
      }

      const parsed = JSON.parse(jsonStr);

      // Validate and normalize detections
      const detections: Detection[] = (parsed.detections || [])
        .filter((d: Record<string, unknown>) => {
          const conf = d.confidence as number;
          return conf >= this.config.minConfidence;
        })
        .slice(0, this.config.maxDetections)
        .map((d: Record<string, unknown>) => {
          const bbox = d.bbox as BoundingBox;
          return {
            label: String(d.label || 'unknown'),
            confidence: Math.max(0, Math.min(1, d.confidence as number)),
            bbox: {
              x: Math.max(0, Math.min(1, bbox?.x ?? 0)),
              y: Math.max(0, Math.min(1, bbox?.y ?? 0)),
              width: Math.max(0, Math.min(1, bbox?.width ?? 0)),
              height: Math.max(0, Math.min(1, bbox?.height ?? 0)),
            },
            estimatedDepthCm: Math.max(5, Math.min(1000, (d.estimatedDepthCm as number) || 200)),
            depthMethod: 'vlm_estimate' as Detection['depthMethod'],
            region: (d.region as Detection['region']) || getRegion(bbox),
          };
        });

      // Parse scene analysis or derive from detections
      const scene: SceneAnalysis = parsed.scene
        ? {
            openings: parsed.scene.openings || [],
            blocked: parsed.scene.blocked || [],
            floorVisiblePercent: parsed.scene.floorVisiblePercent ?? 0.5,
            environment: parsed.scene.environment || 'unknown',
            dominantSurface: parsed.scene.dominantSurface || 'unknown',
          }
        : analyzeScene(detections);

      return {
        detections,
        scene,
        timestamp: Date.now(),
        processingMs: performance.now() - startTime,
        imageSize: { width: imageWidth, height: imageHeight },
        frameId: this.frameCounter,
      };
    } catch {
      // VLM response wasn't valid JSON — return empty frame
      return {
        detections: [],
        scene: {
          openings: ['left', 'center', 'right'],
          blocked: [],
          floorVisiblePercent: 1,
          environment: 'unknown',
          dominantSurface: 'unknown',
        },
        timestamp: Date.now(),
        processingMs: performance.now() - startTime,
        imageSize: { width: imageWidth, height: imageHeight },
        frameId: this.frameCounter,
      };
    }
  }

  /**
   * Format a VisionFrame as a text summary for the planner brain.
   * When using Qwen3-VL as both vision and instinct, the planner
   * may still need a text summary for RSA aggregation.
   */
  static formatForLLM(frame: VisionFrame): string {
    if (frame.detections.length === 0) {
      return `## Vision (Frame #${frame.frameId})\nNo objects detected. Path appears clear.`;
    }

    const lines = [`## Vision (Frame #${frame.frameId}, ${frame.processingMs.toFixed(0)}ms)`];

    lines.push('### Detected Objects');
    for (const det of frame.detections) {
      lines.push(
        `- **${det.label}** (${(det.confidence * 100).toFixed(0)}%) — ${det.region} region, ~${det.estimatedDepthCm}cm away`
      );
    }

    lines.push('### Scene Analysis');
    if (frame.scene.openings.length > 0) {
      lines.push(`- Clear paths: ${frame.scene.openings.join(', ')}`);
    }
    if (frame.scene.blocked.length > 0) {
      lines.push(`- Blocked: ${frame.scene.blocked.join(', ')}`);
    }
    if (frame.scene.environment !== 'unknown') {
      lines.push(`- Environment: ${frame.scene.environment}`);
    }

    return lines.join('\n');
  }

  /**
   * Format a VisionFrame as compact JSON.
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
        environment: frame.scene.environment,
      },
    }, null, 2);
  }

  /** Update configuration. */
  setConfig(config: Partial<VLMVisionDetectorConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

export default VLMVisionDetector;
