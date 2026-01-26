/**
 * Camera Vision Model - Vision-Based World Model Updates
 *
 * This module processes camera images through a vision-capable LLM to:
 * 1. Understand what the robot sees in its field of view
 * 2. Extract spatial information (objects, distances, layout)
 * 3. Update the world model based on visual perception
 * 4. Enable intelligent exploration based on visual coverage
 *
 * Philosophy: The robot should "see" the world through its camera, not just
 * feel it through distance sensors. This enables richer world understanding
 * and more intelligent exploration behavior.
 */

import { cameraCaptureManager, CameraCapture } from './camera-capture';
import { WorldModel, getWorldModel, CellState } from './world-model';
import { LLMClient, createLLMClient } from '../llm/client';
import { logger } from '../debug/logger';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Visual observation extracted from camera image analysis
 */
export interface VisionObservation {
  timestamp: number;
  robotPose: { x: number; y: number; rotation: number };

  // Field of view analysis
  fieldOfView: {
    leftRegion: RegionAnalysis;
    centerRegion: RegionAnalysis;
    rightRegion: RegionAnalysis;
  };

  // Detected objects in the scene
  objects: DetectedObject[];

  // Overall scene understanding
  sceneDescription: string;

  // Confidence in the analysis (0.0 to 1.0)
  confidence: number;

  // Raw LLM response for debugging
  rawResponse?: string;
}

/**
 * Analysis of a region in the robot's field of view
 */
export interface RegionAnalysis {
  region: 'left' | 'center' | 'right';

  // What is visible in this region
  content: 'open_space' | 'obstacle' | 'wall' | 'partially_blocked' | 'unknown';

  // Estimated distance to nearest obstacle (in meters)
  estimatedDistance: number;

  // How clear is the path in this direction (0.0 to 1.0)
  clearance: number;

  // Is this region unexplored (based on visual novelty)
  appearsUnexplored: boolean;

  // Confidence in this region's analysis
  confidence: number;
}

/**
 * An object detected in the camera image
 */
export interface DetectedObject {
  type: ObjectType;
  label: string;

  // Position relative to robot
  relativePosition: {
    direction: 'left' | 'center-left' | 'center' | 'center-right' | 'right';
    estimatedDistance: number; // meters
    verticalPosition: 'floor' | 'mid-height' | 'high';
  };

  // Size estimate
  estimatedSize: 'small' | 'medium' | 'large';

  // Color/appearance
  appearance: string;

  // Confidence in detection
  confidence: number;
}

export type ObjectType =
  | 'wall'
  | 'obstacle'
  | 'collectible'
  | 'floor_marking'
  | 'open_space'
  | 'corner'
  | 'doorway'
  | 'unknown';

/**
 * Configuration for the vision model processor
 */
export interface VisionModelConfig {
  // How often to process camera images (ms)
  processingInterval: number;

  // Camera capture resolution
  captureWidth: number;
  captureHeight: number;

  // Vision LLM settings
  visionPromptTemplate?: string;

  // Whether to include previous observations for temporal consistency
  useTemporalContext: boolean;

  // Maximum number of previous observations to keep
  maxHistorySize: number;

  // Field of view angle (degrees)
  fieldOfViewDegrees: number;

  // Maximum vision range for world model updates (meters)
  maxVisionRange: number;
}

const DEFAULT_CONFIG: VisionModelConfig = {
  processingInterval: 2000,  // Process every 2 seconds
  captureWidth: 320,
  captureHeight: 240,
  useTemporalContext: true,
  maxHistorySize: 5,
  fieldOfViewDegrees: 90,
  maxVisionRange: 3.0,
};

// ═══════════════════════════════════════════════════════════════════════════
// VISION ANALYSIS PROMPT
// ═══════════════════════════════════════════════════════════════════════════

const VISION_ANALYSIS_PROMPT = `You are a robot vision system analyzing a first-person camera view from inside a 3D arena. Your PRIMARY task is to help the robot understand its environment and AVOID COLLISIONS with walls and obstacles.

## CRITICAL: Arena Boundary Wall Detection
The arena has BOUNDARY WALLS that appear as:
- **Blue glowing vertical bars** at the edges of the arena
- They run along all four sides of the rectangular arena
- They are approximately 30cm tall with a bright blue emissive glow (#4a9eff color)
- When you see these blue walls, they are HARD BOUNDARIES - the robot CANNOT pass through them
- Distance to walls should be estimated carefully - if a wall fills a significant portion of the view, it is CLOSE (< 1 meter)

## Other Visual Elements
- **Red cylindrical obstacles**: Round obstacles the robot must navigate around
- **Green circular markers**: Checkpoints on the floor
- **Gold/colored floating objects**: Collectible items (coins, gems, stars)
- **Grid lines on floor**: Blue grid pattern on dark floor for spatial reference
- **Dark floor**: The arena floor is dark gray/black

IMPORTANT: Respond ONLY with valid JSON. No explanations or additional text.

## Analysis Instructions
Analyze the image and identify:
1. What's in the LEFT third of the image (robot's left side)
2. What's in the CENTER third of the image (straight ahead)
3. What's in the RIGHT third of the image (robot's right side)

For each region, determine:
- content: "open_space" | "obstacle" | "wall" | "partially_blocked" | "unknown"
  - Use "wall" specifically when you see the BLUE BOUNDARY WALLS
  - Use "obstacle" for red cylindrical obstacles
- estimatedDistance: distance in meters to nearest obstacle/wall
  - If blue wall is prominent/close in view: 0.3 to 1.0 meters
  - If wall is visible but further: 1.0 to 2.0 meters
  - If no obstacles/walls visible: 2.0 to 3.0 meters
- clearance: 0.0 to 1.0 (how clear/passable is this direction)
  - 0.0-0.3 = wall or obstacle very close, DO NOT GO THIS WAY
  - 0.3-0.6 = obstacle present, proceed with caution
  - 0.6-1.0 = relatively clear path
- appearsUnexplored: true if this area looks like somewhere the robot hasn't been

Also identify any distinct objects you can see, especially WALLS.

Respond with this exact JSON structure:
{
  "fieldOfView": {
    "leftRegion": {
      "content": "open_space|obstacle|wall|partially_blocked|unknown",
      "estimatedDistance": <number>,
      "clearance": <number 0-1>,
      "appearsUnexplored": <boolean>,
      "confidence": <number 0-1>
    },
    "centerRegion": { ... },
    "rightRegion": { ... }
  },
  "objects": [
    {
      "type": "wall|obstacle|collectible|floor_marking|open_space|corner|doorway|unknown",
      "label": "<descriptive label>",
      "relativePosition": {
        "direction": "left|center-left|center|center-right|right",
        "estimatedDistance": <number>,
        "verticalPosition": "floor|mid-height|high"
      },
      "estimatedSize": "small|medium|large",
      "appearance": "<color and appearance description>",
      "confidence": <number 0-1>
    }
  ],
  "sceneDescription": "<one sentence description of what the robot sees>",
  "overallConfidence": <number 0-1>
}`;

// ═══════════════════════════════════════════════════════════════════════════
// VISION MODEL PROCESSOR
// ═══════════════════════════════════════════════════════════════════════════

export class CameraVisionModel {
  private config: VisionModelConfig;
  private observationHistory: VisionObservation[] = [];
  private processing = false;
  private lastProcessTime = 0;
  private listeners: Set<(observation: VisionObservation) => void> = new Set();

  constructor(config: Partial<VisionModelConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Process a camera capture and return vision analysis
   */
  async processCapture(
    capture: CameraCapture,
    robotPose: { x: number; y: number; rotation: number }
  ): Promise<VisionObservation | null> {
    if (this.processing) {
      logger.debug('agent', 'Skipping - already processing');
      return null;
    }

    // Rate limiting
    const now = Date.now();
    if (now - this.lastProcessTime < this.config.processingInterval) {
      return null;
    }

    this.processing = true;
    this.lastProcessTime = now;

    try {
      const client = createLLMClient();
      if (!client) {
        logger.warn('agent', 'LLM client not available');
        return null;
      }

      // Build the vision analysis request
      const observation = await this.analyzeImage(client, capture, robotPose);

      if (observation) {
        // Add to history
        this.observationHistory.push(observation);
        if (this.observationHistory.length > this.config.maxHistorySize) {
          this.observationHistory.shift();
        }

        // Notify listeners
        this.notifyListeners(observation);

        logger.debug('agent', 'Vision analysis complete', {
          objects: observation.objects.length,
          confidence: observation.confidence,
        });
      }

      return observation;
    } catch (error) {
      logger.error('agent', 'Vision processing failed', { error });
      return null;
    } finally {
      this.processing = false;
    }
  }

  /**
   * Analyze image using vision LLM
   */
  private async analyzeImage(
    client: LLMClient,
    capture: CameraCapture,
    robotPose: { x: number; y: number; rotation: number }
  ): Promise<VisionObservation | null> {
    try {
      // Build messages with image
      // Note: OpenAI-compatible APIs support image content via data URLs
      const messages = [
        {
          role: 'system' as const,
          content: VISION_ANALYSIS_PROMPT,
        },
        {
          role: 'user' as const,
          content: this.buildVisionPrompt(capture, robotPose),
        },
      ];

      // Call the LLM
      const response = await client.chatDirect(messages);

      // Parse the JSON response
      return this.parseVisionResponse(response, robotPose);
    } catch (error) {
      logger.error('agent', 'Image analysis failed', { error });
      return null;
    }
  }

  /**
   * Build the vision prompt with image context
   */
  private buildVisionPrompt(
    capture: CameraCapture,
    robotPose: { x: number; y: number; rotation: number }
  ): string {
    const poseInfo = `Robot position: (${robotPose.x.toFixed(2)}, ${robotPose.y.toFixed(2)}) facing ${this.getCompassDirection(robotPose.rotation)}`;

    // Include previous context if enabled
    let contextInfo = '';
    if (this.config.useTemporalContext && this.observationHistory.length > 0) {
      const lastObs = this.observationHistory[this.observationHistory.length - 1];
      contextInfo = `\nPrevious observation: ${lastObs.sceneDescription}`;
    }

    // Include the image as a data URL reference
    // Note: The actual image passing depends on the LLM's multimodal capabilities
    // For now, we'll describe the image context and pass the data URL
    return `${poseInfo}${contextInfo}

Analyze the robot's camera view. The image shows a first-person perspective from the robot.
Image data: ${capture.dataUrl}

Provide your analysis as JSON:`;
  }

  /**
   * Parse the LLM's vision response into a VisionObservation
   */
  private parseVisionResponse(
    response: string,
    robotPose: { x: number; y: number; rotation: number }
  ): VisionObservation | null {
    try {
      // Extract JSON from response (handle markdown code blocks)
      let jsonStr = response;
      const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1];
      }

      // Try to find JSON object in the response
      const objectMatch = jsonStr.match(/\{[\s\S]*\}/);
      if (objectMatch) {
        jsonStr = objectMatch[0];
      }

      const parsed = JSON.parse(jsonStr);

      // Validate and construct observation
      const observation: VisionObservation = {
        timestamp: Date.now(),
        robotPose,
        fieldOfView: {
          leftRegion: this.parseRegion(parsed.fieldOfView?.leftRegion, 'left'),
          centerRegion: this.parseRegion(parsed.fieldOfView?.centerRegion, 'center'),
          rightRegion: this.parseRegion(parsed.fieldOfView?.rightRegion, 'right'),
        },
        objects: this.parseObjects(parsed.objects || []),
        sceneDescription: parsed.sceneDescription || 'Unable to describe scene',
        confidence: parsed.overallConfidence || 0.5,
        rawResponse: response,
      };

      return observation;
    } catch (error) {
      logger.warn('agent', 'Failed to parse vision response', { error, response: response.substring(0, 200) });

      // Return a default observation with low confidence
      return {
        timestamp: Date.now(),
        robotPose,
        fieldOfView: {
          leftRegion: this.createDefaultRegion('left'),
          centerRegion: this.createDefaultRegion('center'),
          rightRegion: this.createDefaultRegion('right'),
        },
        objects: [],
        sceneDescription: 'Vision analysis parsing failed',
        confidence: 0.1,
        rawResponse: response,
      };
    }
  }

  /**
   * Parse a region analysis from JSON
   */
  private parseRegion(data: any, region: 'left' | 'center' | 'right'): RegionAnalysis {
    if (!data) return this.createDefaultRegion(region);

    return {
      region,
      content: this.validateContent(data.content),
      estimatedDistance: Math.max(0, Math.min(10, data.estimatedDistance || 1.0)),
      clearance: Math.max(0, Math.min(1, data.clearance || 0.5)),
      appearsUnexplored: Boolean(data.appearsUnexplored),
      confidence: Math.max(0, Math.min(1, data.confidence || 0.5)),
    };
  }

  /**
   * Create a default region with unknown values
   */
  private createDefaultRegion(region: 'left' | 'center' | 'right'): RegionAnalysis {
    return {
      region,
      content: 'unknown',
      estimatedDistance: 1.0,
      clearance: 0.5,
      appearsUnexplored: true,
      confidence: 0.1,
    };
  }

  /**
   * Validate content type
   */
  private validateContent(content: string): RegionAnalysis['content'] {
    const valid = ['open_space', 'obstacle', 'wall', 'partially_blocked', 'unknown'];
    return valid.includes(content) ? content as RegionAnalysis['content'] : 'unknown';
  }

  /**
   * Parse detected objects from JSON
   */
  private parseObjects(objects: any[]): DetectedObject[] {
    if (!Array.isArray(objects)) return [];

    return objects.map(obj => ({
      type: this.validateObjectType(obj.type),
      label: String(obj.label || 'unknown object'),
      relativePosition: {
        direction: this.validateDirection(obj.relativePosition?.direction),
        estimatedDistance: Math.max(0, obj.relativePosition?.estimatedDistance || 1.0),
        verticalPosition: this.validateVertical(obj.relativePosition?.verticalPosition),
      },
      estimatedSize: this.validateSize(obj.estimatedSize),
      appearance: String(obj.appearance || 'unknown appearance'),
      confidence: Math.max(0, Math.min(1, obj.confidence || 0.5)),
    }));
  }

  private validateObjectType(type: string): ObjectType {
    const valid: ObjectType[] = ['wall', 'obstacle', 'collectible', 'floor_marking', 'open_space', 'corner', 'doorway', 'unknown'];
    return valid.includes(type as ObjectType) ? type as ObjectType : 'unknown';
  }

  private validateDirection(dir: string): DetectedObject['relativePosition']['direction'] {
    const valid = ['left', 'center-left', 'center', 'center-right', 'right'];
    return valid.includes(dir) ? dir as any : 'center';
  }

  private validateVertical(pos: string): DetectedObject['relativePosition']['verticalPosition'] {
    const valid = ['floor', 'mid-height', 'high'];
    return valid.includes(pos) ? pos as any : 'mid-height';
  }

  private validateSize(size: string): DetectedObject['estimatedSize'] {
    const valid = ['small', 'medium', 'large'];
    return valid.includes(size) ? size as any : 'medium';
  }

  /**
   * Get compass direction from rotation angle
   */
  private getCompassDirection(rotation: number): string {
    const normalized = ((rotation % (2 * Math.PI)) + (2 * Math.PI)) % (2 * Math.PI);
    const degrees = (normalized * 180) / Math.PI;

    if (degrees < 22.5 || degrees >= 337.5) return 'North';
    if (degrees < 67.5) return 'NE';
    if (degrees < 112.5) return 'East';
    if (degrees < 157.5) return 'SE';
    if (degrees < 202.5) return 'South';
    if (degrees < 247.5) return 'SW';
    if (degrees < 292.5) return 'West';
    return 'NW';
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // WORLD MODEL INTEGRATION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Update the world model based on a vision observation
   */
  updateWorldModelFromVision(worldModel: WorldModel, observation: VisionObservation): void {
    const pose = observation.robotPose;
    const fovRadians = (this.config.fieldOfViewDegrees * Math.PI) / 180;
    const halfFov = fovRadians / 2;

    // Update cells in the robot's field of view
    this.updateRegionInWorldModel(worldModel, pose, observation.fieldOfView.leftRegion, -halfFov, -halfFov / 3);
    this.updateRegionInWorldModel(worldModel, pose, observation.fieldOfView.centerRegion, -halfFov / 3, halfFov / 3);
    this.updateRegionInWorldModel(worldModel, pose, observation.fieldOfView.rightRegion, halfFov / 3, halfFov);

    // Update based on detected objects
    for (const obj of observation.objects) {
      this.updateObjectInWorldModel(worldModel, pose, obj);
    }

    logger.debug('agent', 'World model updated from vision', {
      pose: `(${pose.x.toFixed(2)}, ${pose.y.toFixed(2)})`,
      objectsProcessed: observation.objects.length,
    });
  }

  /**
   * Update a region in the world model based on vision analysis
   */
  private updateRegionInWorldModel(
    worldModel: WorldModel,
    pose: { x: number; y: number; rotation: number },
    region: RegionAnalysis,
    startAngle: number,
    endAngle: number
  ): void {
    const maxRange = Math.min(region.estimatedDistance, this.config.maxVisionRange);
    const confidence = region.confidence * 0.8; // Slightly reduce confidence for vision-based updates
    const stepSize = 0.1; // 10cm steps
    const angleSteps = 5;

    // Determine cell state based on region content
    let freeState: CellState = 'free';
    let obstacleState: CellState = 'obstacle';

    if (region.content === 'wall') {
      obstacleState = 'wall';
    }

    // Ray cast through the region
    for (let angleIdx = 0; angleIdx <= angleSteps; angleIdx++) {
      const angle = pose.rotation + startAngle + (endAngle - startAngle) * (angleIdx / angleSteps);

      // Mark cells as free up to the estimated distance
      for (let d = stepSize; d < maxRange; d += stepSize) {
        const wx = pose.x + Math.sin(angle) * d;
        const wy = pose.y - Math.cos(angle) * d;

        // Use the world model's coordinate conversion
        const gridCoord = worldModel.worldToGrid(wx, wy);
        if (worldModel.isValidGridCoord(gridCoord.gx, gridCoord.gy)) {
          worldModel['updateCell'](gridCoord.gx, gridCoord.gy, freeState, confidence * (1 - d / maxRange), Date.now());
        }
      }

      // Mark endpoint as obstacle if not open space
      if (region.content !== 'open_space' && region.content !== 'unknown') {
        const wx = pose.x + Math.sin(angle) * maxRange;
        const wy = pose.y - Math.cos(angle) * maxRange;

        const gridCoord = worldModel.worldToGrid(wx, wy);
        if (worldModel.isValidGridCoord(gridCoord.gx, gridCoord.gy)) {
          worldModel['updateCell'](gridCoord.gx, gridCoord.gy, obstacleState, confidence, Date.now());
        }
      }
    }
  }

  /**
   * Update world model based on a detected object
   */
  private updateObjectInWorldModel(
    worldModel: WorldModel,
    pose: { x: number; y: number; rotation: number },
    obj: DetectedObject
  ): void {
    // Convert relative direction to angle
    const directionAngles: Record<string, number> = {
      'left': -Math.PI / 3,
      'center-left': -Math.PI / 6,
      'center': 0,
      'center-right': Math.PI / 6,
      'right': Math.PI / 3,
    };

    const angleOffset = directionAngles[obj.relativePosition.direction] || 0;
    const angle = pose.rotation + angleOffset;
    const distance = obj.relativePosition.estimatedDistance;

    // Calculate world position of object
    const wx = pose.x + Math.sin(angle) * distance;
    const wy = pose.y - Math.cos(angle) * distance;

    // Determine cell state based on object type
    let state: CellState;
    switch (obj.type) {
      case 'wall':
        state = 'wall';
        break;
      case 'obstacle':
        state = 'obstacle';
        break;
      case 'collectible':
        state = 'collectible';
        // Also record the collectible
        const collectibleId = `vision-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        worldModel.recordCollectible(collectibleId, wx, wy);
        break;
      case 'open_space':
      case 'doorway':
        state = 'free';
        break;
      default:
        state = 'obstacle'; // Default to obstacle for unknown objects
    }

    // Update the cell
    const gridCoord = worldModel.worldToGrid(wx, wy);
    if (worldModel.isValidGridCoord(gridCoord.gx, gridCoord.gy)) {
      worldModel['updateCell'](gridCoord.gx, gridCoord.gy, state, obj.confidence * 0.7, Date.now());
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // EXPLORATION GUIDANCE
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Analyze current observation to suggest best exploration direction
   * Returns the direction with most unexplored area visible
   */
  suggestExplorationDirection(observation: VisionObservation): {
    direction: 'left' | 'center' | 'right';
    reason: string;
    confidence: number;
  } {
    const regions = [
      observation.fieldOfView.leftRegion,
      observation.fieldOfView.centerRegion,
      observation.fieldOfView.rightRegion,
    ];

    // Score each region based on exploration value
    const scores = regions.map(region => {
      let score = 0;

      // Unexplored areas are valuable
      if (region.appearsUnexplored) score += 3;

      // Open space means we can explore further
      if (region.content === 'open_space') score += 2;
      else if (region.content === 'partially_blocked') score += 1;

      // Higher clearance is better
      score += region.clearance * 2;

      // Longer distances mean more area to explore
      score += region.estimatedDistance / 2;

      // Weight by confidence
      score *= region.confidence;

      return score;
    });

    // Find best direction
    const maxScore = Math.max(...scores);
    const bestIndex = scores.indexOf(maxScore);
    const directions: Array<'left' | 'center' | 'right'> = ['left', 'center', 'right'];
    const bestDirection = directions[bestIndex];
    const bestRegion = regions[bestIndex];

    // Generate reason
    let reason = '';
    if (bestRegion.appearsUnexplored) {
      reason = `Unexplored area visible to the ${bestDirection}`;
    } else if (bestRegion.content === 'open_space') {
      reason = `Open space to the ${bestDirection} (${bestRegion.estimatedDistance.toFixed(1)}m clear)`;
    } else {
      reason = `Best clearance to the ${bestDirection}`;
    }

    return {
      direction: bestDirection,
      reason,
      confidence: bestRegion.confidence,
    };
  }

  /**
   * Calculate vision coverage score for current position
   * Used to evaluate how good a position is for gaining visual information
   */
  calculateViewpointScore(observation: VisionObservation): number {
    let score = 0;

    // Sum up visibility in all regions
    const regions = [
      observation.fieldOfView.leftRegion,
      observation.fieldOfView.centerRegion,
      observation.fieldOfView.rightRegion,
    ];

    for (const region of regions) {
      // More distance = better viewpoint
      score += region.estimatedDistance;

      // Higher clearance = better visibility
      score += region.clearance * 2;

      // Unexplored areas are valuable to observe
      if (region.appearsUnexplored) score += 2;

      // Weight by confidence
      score *= 0.5 + (region.confidence * 0.5);
    }

    // Bonus for detecting multiple objects
    score += observation.objects.length * 0.5;

    return score;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // EVENT LISTENERS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Add listener for new vision observations
   */
  addObservationListener(listener: (observation: VisionObservation) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(observation: VisionObservation): void {
    for (const listener of this.listeners) {
      try {
        listener(observation);
      } catch (error) {
        logger.error('agent', 'Listener error', { error });
      }
    }
  }

  /**
   * Get observation history
   */
  getObservationHistory(): VisionObservation[] {
    return [...this.observationHistory];
  }

  /**
   * Get last observation
   */
  getLastObservation(): VisionObservation | null {
    return this.observationHistory.length > 0
      ? this.observationHistory[this.observationHistory.length - 1]
      : null;
  }

  /**
   * Clear history
   */
  clearHistory(): void {
    this.observationHistory = [];
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SINGLETON INSTANCE MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

const visionModels = new Map<string, CameraVisionModel>();

/**
 * Get or create a vision model for a specific device
 */
export function getCameraVisionModel(
  deviceId: string,
  config?: Partial<VisionModelConfig>
): CameraVisionModel {
  if (!visionModels.has(deviceId)) {
    visionModels.set(deviceId, new CameraVisionModel(config));
  }
  return visionModels.get(deviceId)!;
}

/**
 * Clear vision model for a device
 */
export function clearCameraVisionModel(deviceId: string): void {
  const model = visionModels.get(deviceId);
  if (model) {
    model.clearHistory();
  }
  visionModels.delete(deviceId);
}

/**
 * Clear all vision models
 */
export function clearAllCameraVisionModels(): void {
  for (const model of visionModels.values()) {
    model.clearHistory();
  }
  visionModels.clear();
}

export default CameraVisionModel;
