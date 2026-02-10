/**
 * Vision Test Scenarios for Camera Analysis Prompt Validation
 *
 * Defines hardcoded 3D scenes (robot position + floor map) for each test scenario.
 * Used by the UI to render robot camera views and export them as test fixtures
 * (images + prompts + expected results) in a downloadable zip file.
 *
 * Each scenario matches a prompt-X.txt / result-X.txt pair in tests/vision-prompts/
 */

import type { FloorMap, RobotPose } from '@/lib/hardware/cube-robot-simulator';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface VisionTestScenario {
  /** Scenario ID (matches file numbering: prompt-X.txt) */
  id: number;
  /** Short human-readable name */
  name: string;
  /** Description of what this scenario tests */
  description: string;
  /** Robot pose for this scenario (x, y in meters, rotation in radians) */
  robotPose: RobotPose;
  /** Floor map defining the arena geometry */
  floorMap: FloorMap;
  /** The prompt text to send to the vision LLM */
  promptText: string;
  /** The expected result JSON (as formatted string) */
  expectedResult: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// STANDARD ARENA BUILDING BLOCKS
// ═══════════════════════════════════════════════════════════════════════════

/** Standard 5m x 5m boundary walls */
const STANDARD_WALLS = [
  { x1: -2.5, y1: -2.5, x2: 2.5, y2: -2.5 },  // Bottom
  { x1: 2.5, y1: -2.5, x2: 2.5, y2: 2.5 },     // Right
  { x1: 2.5, y1: 2.5, x2: -2.5, y2: 2.5 },     // Top
  { x1: -2.5, y1: 2.5, x2: -2.5, y2: -2.5 },   // Left
];

const STANDARD_BOUNDS = { minX: -2.5, maxX: 2.5, minY: -2.5, maxY: 2.5 };

// ═══════════════════════════════════════════════════════════════════════════
// TEST SCENARIO DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

export const VISION_TEST_SCENARIOS: VisionTestScenario[] = [
  // ─── Scenario 1: Empty Arena ─────────────────────────────────────────
  {
    id: 1,
    name: 'Empty Arena - Open Space',
    description: 'Robot at bottom-center facing north in empty arena. Tests open-space detection and wall distance estimation using grid.',
    robotPose: { x: 0, y: -2.0, rotation: Math.PI / 2 },
    floorMap: {
      bounds: STANDARD_BOUNDS,
      walls: STANDARD_WALLS,
      obstacles: [],
      lines: [],
      checkpoints: [],
      startPosition: { x: 0, y: -2.0, rotation: Math.PI / 2 },
    },
    promptText: `Scenario: Empty Arena - Open Space Ahead
Robot Position: (0, -2.0) facing North (rotation = PI/2)
Map: 5m x 5m empty arena with boundary walls only

I need the description of the scene for robot navigation, try to describe the objects, sizes, direction and distance.

Context: The robot is at the bottom-center of an empty 5m x 5m arena, facing north. The floor has a grid pattern with lines every 0.5m (thicker lines every 1.0m). Only boundary walls are present at 2.5m in each direction. The robot should see mostly open floor with grid lines stretching ahead, and walls visible in the far distance.`,
    expectedResult: `{
  "fieldOfView": {
    "leftRegion": { "content": "open_space", "estimatedDistance": 2.5, "clearance": 1.0, "appearsUnexplored": true, "confidence": 0.9 },
    "centerRegion": { "content": "open_space", "estimatedDistance": 3.0, "clearance": 1.0, "appearsUnexplored": true, "confidence": 0.9 },
    "rightRegion": { "content": "open_space", "estimatedDistance": 2.5, "clearance": 1.0, "appearsUnexplored": true, "confidence": 0.9 }
  },
  "objects": [
    { "type": "wall", "label": "boundary wall (far north)", "relativePosition": { "direction": "center", "estimatedDistance": 4.5, "verticalPosition": "mid-height" }, "estimatedSize": "large", "appearance": "blue wall with white chevron pattern", "confidence": 0.7 }
  ],
  "sceneDescription": "Open arena floor stretching ahead with visible 0.5m grid pattern. No obstacles in any direction. Blue boundary wall faintly visible ~4.5m ahead.",
  "navigationAdvice": "All directions are clear. Proceed forward to explore.",
  "gridReference": "Floor grid clearly visible with 0.5m spacing. ~9 grid squares visible ahead.",
  "overallConfidence": 0.9
}`,
  },

  // ─── Scenario 2: Single Obstacle Ahead ───────────────────────────────
  {
    id: 2,
    name: 'Single Obstacle Ahead',
    description: 'Robot facing a large central obstacle directly ahead. Tests obstacle detection, size estimation, and navigation advice.',
    robotPose: { x: 0, y: -1.0, rotation: Math.PI / 2 },
    floorMap: {
      bounds: STANDARD_BOUNDS,
      walls: STANDARD_WALLS,
      obstacles: [{ x: 0, y: 0, radius: 0.35 }],
      lines: [],
      checkpoints: [],
      startPosition: { x: 0, y: -1.0, rotation: Math.PI / 2 },
    },
    promptText: `Scenario: Single Obstacle Directly Ahead
Robot Position: (0, -1.0) facing North (rotation = PI/2)
Map: 5m x 5m arena with a large central obstacle at (0, 0) radius 0.35m

I need the description of the scene for robot navigation, try to describe the objects, sizes, direction and distance.

Context: The robot is 1.0m south of the arena center, facing north directly toward a large cylindrical obstacle (radius 0.35m) at the center. The obstacle is approximately 1.0m away (2 grid squares). The floor grid is visible with 0.5m spacing. The obstacle has red-and-white diagonal stripes.`,
    expectedResult: `{
  "fieldOfView": {
    "leftRegion": { "content": "partially_blocked", "estimatedDistance": 1.0, "clearance": 0.6, "appearsUnexplored": true, "confidence": 0.85 },
    "centerRegion": { "content": "obstacle", "estimatedDistance": 0.65, "clearance": 0.1, "appearsUnexplored": false, "confidence": 0.95 },
    "rightRegion": { "content": "partially_blocked", "estimatedDistance": 1.0, "clearance": 0.6, "appearsUnexplored": true, "confidence": 0.85 }
  },
  "objects": [
    { "type": "obstacle", "label": "large cylindrical obstacle with red-white diagonal stripes", "relativePosition": { "direction": "center", "estimatedDistance": 0.65, "verticalPosition": "floor" }, "estimatedSize": "large", "appearance": "Cylinder ~0.7m diameter with diagonal red-and-white stripes", "confidence": 0.95 }
  ],
  "sceneDescription": "Large red-white striped cylinder directly ahead ~0.65m (1.3 grid squares). Blocks center. Open space left and right.",
  "navigationAdvice": "Turn left or right to navigate around the obstacle.",
  "gridReference": "Obstacle is ~1.3 grid squares ahead. ~2 squares clearance on each side.",
  "overallConfidence": 0.9
}`,
  },

  // ─── Scenario 3: Wall Close Ahead ────────────────────────────────────
  {
    id: 3,
    name: 'Wall Close Ahead',
    description: 'Robot very close to boundary wall. Tests wall proximity detection and urgent turn-around advice.',
    robotPose: { x: 0, y: 2.0, rotation: Math.PI / 2 },
    floorMap: {
      bounds: STANDARD_BOUNDS,
      walls: STANDARD_WALLS,
      obstacles: [],
      lines: [],
      checkpoints: [],
      startPosition: { x: 0, y: 2.0, rotation: Math.PI / 2 },
    },
    promptText: `Scenario: Wall Close Ahead
Robot Position: (0, 2.0) facing North (rotation = PI/2)
Map: 5m x 5m arena with boundary walls at +/-2.5m

I need the description of the scene for robot navigation, try to describe the objects, sizes, direction and distance.

Context: The robot is near the top boundary of a 5m x 5m arena, facing north toward the wall that is only 0.5m away (1 grid square). The wall has a blue color with white chevron patterns. The floor grid is visible but limited due to proximity to the wall.`,
    expectedResult: `{
  "fieldOfView": {
    "leftRegion": { "content": "wall", "estimatedDistance": 0.5, "clearance": 0.0, "appearsUnexplored": false, "confidence": 0.95 },
    "centerRegion": { "content": "wall", "estimatedDistance": 0.5, "clearance": 0.0, "appearsUnexplored": false, "confidence": 0.95 },
    "rightRegion": { "content": "wall", "estimatedDistance": 0.5, "clearance": 0.0, "appearsUnexplored": false, "confidence": 0.95 }
  },
  "objects": [
    { "type": "wall", "label": "boundary wall with blue chevron pattern", "relativePosition": { "direction": "center", "estimatedDistance": 0.5, "verticalPosition": "mid-height" }, "estimatedSize": "large", "appearance": "Blue wall with white chevron arrows, spans full view", "confidence": 0.95 }
  ],
  "sceneDescription": "Blue chevron wall fills entire view ~0.5m ahead (1 grid square). No passage.",
  "navigationAdvice": "STOP and turn 180 degrees. Wall at 0.5m.",
  "gridReference": "Only 1 grid square visible before wall.",
  "overallConfidence": 0.95
}`,
  },

  // ─── Scenario 4: Obstacle Left, Open Right ───────────────────────────
  {
    id: 4,
    name: 'Obstacle Left, Open Right',
    description: 'Obstacle to upper-left, clear space right and ahead. Tests asymmetric scene description and directional navigation.',
    robotPose: { x: -0.8, y: 0, rotation: Math.PI / 2 },
    floorMap: {
      bounds: STANDARD_BOUNDS,
      walls: STANDARD_WALLS,
      obstacles: [{ x: -1.2, y: 1.2, radius: 0.20 }],
      lines: [],
      checkpoints: [],
      startPosition: { x: -0.8, y: 0, rotation: Math.PI / 2 },
    },
    promptText: `Scenario: Obstacle on Left, Open Space Right
Robot Position: (-0.8, 0) facing North (rotation = PI/2)
Map: 5m x 5m arena with obstacle at (-1.2, 1.2) radius 0.20m to the upper-left.

I need the description of the scene for robot navigation, try to describe the objects, sizes, direction and distance.

Context: The robot is in the left portion of the arena facing north. A cylindrical obstacle with red-white stripes is approximately 1.3m away to the upper-left. The right side is completely open with clear floor stretching to the boundary wall. The floor grid (0.5m spacing) is visible.`,
    expectedResult: `{
  "fieldOfView": {
    "leftRegion": { "content": "partially_blocked", "estimatedDistance": 1.3, "clearance": 0.4, "appearsUnexplored": true, "confidence": 0.85 },
    "centerRegion": { "content": "open_space", "estimatedDistance": 2.5, "clearance": 0.9, "appearsUnexplored": true, "confidence": 0.85 },
    "rightRegion": { "content": "open_space", "estimatedDistance": 3.0, "clearance": 1.0, "appearsUnexplored": true, "confidence": 0.9 }
  },
  "objects": [
    { "type": "obstacle", "label": "cylindrical obstacle with red-white stripes", "relativePosition": { "direction": "left", "estimatedDistance": 1.3, "verticalPosition": "floor" }, "estimatedSize": "medium", "appearance": "Cylinder ~0.4m diameter with red-white diagonal stripes", "confidence": 0.85 }
  ],
  "sceneDescription": "Obstacle to upper-left ~1.3m (2.5 grid squares). Center and right open for 2.5-3.0m.",
  "navigationAdvice": "Steer slightly right or continue straight to avoid left obstacle.",
  "gridReference": "Obstacle ~2.5 grid squares to upper-left. 5-6 squares clear ahead.",
  "overallConfidence": 0.85
}`,
  },

  // ─── Scenario 5: Multiple Obstacles ──────────────────────────────────
  {
    id: 5,
    name: 'Multiple Obstacles Field',
    description: 'Complex scene with multiple obstacles at various distances. Tests multi-object detection and path planning.',
    robotPose: { x: 0, y: -2.0, rotation: Math.PI / 2 },
    floorMap: {
      bounds: STANDARD_BOUNDS,
      walls: STANDARD_WALLS,
      obstacles: [
        { x: 0, y: 0, radius: 0.35 },       // Large central
        { x: 0, y: -1.2, radius: 0.12 },     // Near center
        { x: -1.2, y: 0, radius: 0.12 },     // Left mid
        { x: 1.2, y: 0, radius: 0.12 },      // Right mid
        { x: -1.2, y: -1.2, radius: 0.25 },  // Bottom-left
        { x: 1.2, y: -1.2, radius: 0.20 },   // Bottom-right
      ],
      lines: [],
      checkpoints: [],
      startPosition: { x: 0, y: -2.0, rotation: Math.PI / 2 },
    },
    promptText: `Scenario: Multiple Obstacles Scattered
Robot Position: (0, -2.0) facing North (rotation = PI/2)
Map: standard5x5Obstacles - 5m x 5m arena with multiple obstacles

I need the description of the scene for robot navigation, try to describe the objects, sizes, direction and distance.

Context: The robot is at the bottom-center facing north into an arena with multiple obstacles. The central large obstacle (radius 0.35m) is at (0,0), approximately 2.0m ahead. Smaller obstacles are scattered. The floor grid (0.5m spacing) is visible. This is a complex scene requiring careful path planning.`,
    expectedResult: `{
  "fieldOfView": {
    "leftRegion": { "content": "partially_blocked", "estimatedDistance": 1.5, "clearance": 0.5, "appearsUnexplored": true, "confidence": 0.8 },
    "centerRegion": { "content": "obstacle", "estimatedDistance": 0.8, "clearance": 0.2, "appearsUnexplored": false, "confidence": 0.9 },
    "rightRegion": { "content": "partially_blocked", "estimatedDistance": 1.5, "clearance": 0.5, "appearsUnexplored": true, "confidence": 0.8 }
  },
  "objects": [
    { "type": "obstacle", "label": "small obstacle (near center)", "relativePosition": { "direction": "center", "estimatedDistance": 0.8, "verticalPosition": "floor" }, "estimatedSize": "small", "appearance": "Small cylinder ~0.24m diameter, red-white stripes", "confidence": 0.9 },
    { "type": "obstacle", "label": "large central obstacle", "relativePosition": { "direction": "center", "estimatedDistance": 2.0, "verticalPosition": "floor" }, "estimatedSize": "large", "appearance": "Large cylinder ~0.7m diameter, red-white stripes", "confidence": 0.85 }
  ],
  "sceneDescription": "Complex obstacle field. Nearest obstacle 0.8m ahead (1.6 grid squares). Large central obstacle 2.0m away (4 grid squares). Narrow corridors exist between obstacles.",
  "navigationAdvice": "Navigate around right side where corridor appears wider.",
  "gridReference": "Grid helps estimate corridor widths between obstacles.",
  "overallConfidence": 0.8
}`,
  },

  // ─── Scenario 6: Corner View ─────────────────────────────────────────
  {
    id: 6,
    name: 'Corner View - Two Walls',
    description: 'Robot in corner facing diagonally toward center. Tests corner detection and wall intersection.',
    robotPose: { x: -2.0, y: -2.0, rotation: Math.PI / 4 },
    floorMap: {
      bounds: STANDARD_BOUNDS,
      walls: STANDARD_WALLS,
      obstacles: [],
      lines: [],
      checkpoints: [],
      startPosition: { x: -2.0, y: -2.0, rotation: Math.PI / 4 },
    },
    promptText: `Scenario: Corner View - Two Walls Visible
Robot Position: (-2.0, -2.0) facing diagonal NE (rotation = PI/4)
Map: 5m x 5m empty arena

I need the description of the scene for robot navigation, try to describe the objects, sizes, direction and distance.

Context: The robot is in the bottom-left corner facing diagonally northeast. The left wall (x=-2.5) is ~0.5m to the left. The bottom wall (y=-2.5) is behind/right. Open arena stretches ahead.`,
    expectedResult: `{
  "fieldOfView": {
    "leftRegion": { "content": "wall", "estimatedDistance": 0.5, "clearance": 0.1, "appearsUnexplored": false, "confidence": 0.9 },
    "centerRegion": { "content": "open_space", "estimatedDistance": 3.0, "clearance": 0.9, "appearsUnexplored": true, "confidence": 0.85 },
    "rightRegion": { "content": "open_space", "estimatedDistance": 2.0, "clearance": 0.8, "appearsUnexplored": true, "confidence": 0.85 }
  },
  "objects": [
    { "type": "wall", "label": "west boundary wall", "relativePosition": { "direction": "left", "estimatedDistance": 0.5, "verticalPosition": "mid-height" }, "estimatedSize": "large", "appearance": "Blue chevron pattern", "confidence": 0.9 },
    { "type": "corner", "label": "arena corner SW", "relativePosition": { "direction": "center-left", "estimatedDistance": 0.7, "verticalPosition": "mid-height" }, "estimatedSize": "small", "appearance": "Two blue walls meeting at 90 degrees", "confidence": 0.85 }
  ],
  "sceneDescription": "Corner of arena. West wall 0.5m to the left. Open space ahead (~3.0m, 6 grid squares) toward arena center.",
  "navigationAdvice": "Move forward northeast into open space. Keep clear of left wall.",
  "gridReference": "Wall is 1 grid square to the left. 6 grid squares clear ahead.",
  "overallConfidence": 0.85
}`,
  },

  // ─── Scenario 7: Collectibles on Floor ───────────────────────────────
  {
    id: 7,
    name: 'Collectibles on Floor',
    description: 'Arena with collectible coins visible ahead. Tests small object detection and collection path planning.',
    robotPose: { x: 0, y: -1.5, rotation: Math.PI / 2 },
    floorMap: {
      bounds: STANDARD_BOUNDS,
      walls: STANDARD_WALLS,
      obstacles: [],
      lines: [],
      checkpoints: [],
      collectibles: [
        { id: 'coin-1', type: 'coin', x: 0.5, y: 0, radius: 0.08, color: '#FFD700', points: 10 },
        { id: 'coin-2', type: 'coin', x: -0.5, y: 0.5, radius: 0.08, color: '#FFD700', points: 10 },
        { id: 'gem-1', type: 'gem', x: 0, y: 1.5, radius: 0.1, color: '#00FF88', points: 25 },
      ],
      startPosition: { x: 0, y: -1.5, rotation: Math.PI / 2 },
    },
    promptText: `Scenario: Collectibles Visible on Floor
Robot Position: (0, -1.5) facing North (rotation = PI/2)
Map: Arena with collectible coins and gems on floor

I need the description of the scene for robot navigation, try to describe the objects, sizes, direction and distance.

Context: The robot is facing north with collectible items on the floor. Gold coins (~0.16m diameter, glowing golden) at (0.5, 0) and (-0.5, 0.5). A green gem at (0, 1.5). Floor grid (0.5m spacing) is visible.`,
    expectedResult: `{
  "fieldOfView": {
    "leftRegion": { "content": "open_space", "estimatedDistance": 2.5, "clearance": 0.9, "appearsUnexplored": true, "confidence": 0.85 },
    "centerRegion": { "content": "open_space", "estimatedDistance": 3.0, "clearance": 0.95, "appearsUnexplored": true, "confidence": 0.85 },
    "rightRegion": { "content": "open_space", "estimatedDistance": 2.5, "clearance": 0.9, "appearsUnexplored": true, "confidence": 0.85 }
  },
  "objects": [
    { "type": "collectible", "label": "gold coin", "relativePosition": { "direction": "center-right", "estimatedDistance": 1.5, "verticalPosition": "floor" }, "estimatedSize": "small", "appearance": "Golden disc with emissive glow, ~0.16m diameter", "confidence": 0.8 },
    { "type": "collectible", "label": "gold coin", "relativePosition": { "direction": "center-left", "estimatedDistance": 2.0, "verticalPosition": "floor" }, "estimatedSize": "small", "appearance": "Golden disc with emissive glow", "confidence": 0.75 },
    { "type": "collectible", "label": "green gem", "relativePosition": { "direction": "center", "estimatedDistance": 3.0, "verticalPosition": "floor" }, "estimatedSize": "small", "appearance": "Green glowing gem, ~0.2m diameter", "confidence": 0.7 }
  ],
  "sceneDescription": "Open arena with collectible items. Gold coin 1.5m ahead right (3 grid squares). Gold coin 2.0m ahead left (4 squares). Green gem 3.0m ahead center (6 squares). Path clear to all.",
  "navigationAdvice": "Navigate to nearest gold coin (center-right, 1.5m). Path clear.",
  "gridReference": "Grid confirms distances to collectibles. Nearest coin 3 grid squares away.",
  "overallConfidence": 0.8
}`,
  },

  // ─── Scenario 8: Narrow Corridor ─────────────────────────────────────
  {
    id: 8,
    name: 'Narrow Corridor Between Obstacles',
    description: 'Two obstacles forming a narrow passage. Tests gap width estimation and precision navigation advice.',
    robotPose: { x: 0, y: -0.5, rotation: Math.PI / 2 },
    floorMap: {
      bounds: STANDARD_BOUNDS,
      walls: STANDARD_WALLS,
      obstacles: [
        { x: -0.6, y: 0.5, radius: 0.25 },
        { x: 0.6, y: 0.5, radius: 0.25 },
      ],
      lines: [],
      checkpoints: [],
      startPosition: { x: 0, y: -0.5, rotation: Math.PI / 2 },
    },
    promptText: `Scenario: Narrow Corridor Between Obstacles
Robot Position: (0, -0.5) facing North (rotation = PI/2)
Map: Arena with two obstacles creating a narrow passage at (-0.6, 0.5) r=0.25m and (0.6, 0.5) r=0.25m

I need the description of the scene for robot navigation, try to describe the objects, sizes, direction and distance.

Context: Two cylindrical obstacles form a ~0.7m wide corridor ahead at ~1.0m distance. Floor grid (0.5m spacing) helps judge passage width.`,
    expectedResult: `{
  "fieldOfView": {
    "leftRegion": { "content": "obstacle", "estimatedDistance": 1.0, "clearance": 0.2, "appearsUnexplored": false, "confidence": 0.9 },
    "centerRegion": { "content": "partially_blocked", "estimatedDistance": 1.0, "clearance": 0.4, "appearsUnexplored": true, "confidence": 0.85 },
    "rightRegion": { "content": "obstacle", "estimatedDistance": 1.0, "clearance": 0.2, "appearsUnexplored": false, "confidence": 0.9 }
  },
  "objects": [
    { "type": "obstacle", "label": "left obstacle", "relativePosition": { "direction": "center-left", "estimatedDistance": 1.1, "verticalPosition": "floor" }, "estimatedSize": "medium", "appearance": "Cylinder ~0.5m diameter, red-white stripes", "confidence": 0.9 },
    { "type": "obstacle", "label": "right obstacle", "relativePosition": { "direction": "center-right", "estimatedDistance": 1.1, "verticalPosition": "floor" }, "estimatedSize": "medium", "appearance": "Cylinder ~0.5m diameter, red-white stripes", "confidence": 0.9 }
  ],
  "sceneDescription": "Two obstacles form narrow corridor ~0.7m wide (1.4 grid squares), 1.0m ahead. Open space beyond.",
  "navigationAdvice": "Proceed carefully through center of corridor. Passage is navigable.",
  "gridReference": "Gap spans ~1.4 grid squares. Each obstacle 2 grid squares ahead.",
  "overallConfidence": 0.85
}`,
  },
];

/**
 * Get all scenario IDs
 */
export function getScenarioIds(): number[] {
  return VISION_TEST_SCENARIOS.map(s => s.id);
}

/**
 * Get a specific scenario by ID
 */
export function getScenario(id: number): VisionTestScenario | undefined {
  return VISION_TEST_SCENARIOS.find(s => s.id === id);
}
