/**
 * ESP32 Agent Runtime - Simplified
 *
 * Ultra-simple robot control with just 3 tools:
 * - take_picture: Capture camera for visual planning
 * - left_wheel: Control left wheel (forward/backward/stop)
 * - right_wheel: Control right wheel (forward/backward/stop)
 *
 * Fixed speed: 80 for forward, -80 for backward, 0 for stop
 *
 * Default behavior cycle:
 * 1. Take picture
 * 2. Plan direction based on what's seen (and main goal if any)
 * 3. Rotate to face desired direction
 * 4. Go straight a short distance
 * 5. Stop
 * 6. Repeat
 */

import { getDeviceManager } from '../hardware/esp32-device-manager';
import { LLMStorage, DEFAULT_BASE_URL } from '../llm/storage';
import { cameraCaptureManager } from '../runtime/camera-capture';
import {
  useDiagnosticsStore,
  analyzePerception,
  analyzeDecision,
  analyzePhysics,
  analyzeCameraPerspective,
  analyzeRepresentation,
  type PerceptionSnapshot,
  type DecisionSnapshot,
  type PhysicsSnapshot,
} from '../debug/agent-diagnostics';

// Fixed speed constants - simple and predictable
export const WHEEL_SPEED = {
  FORWARD: 80,   // Single forward speed
  BACKWARD: -80, // Single backward speed
  STOP: 0,       // Stop
} as const;

export type WheelDirection = 'forward' | 'backward' | 'stop';

// ═══════════════════════════════════════════════════════════════════════════
// SIMPLE DEVICE TOOLS - Just 3 tools
// ═══════════════════════════════════════════════════════════════════════════

export interface DeviceTool {
  name: string;
  description: string;
  parameters: Record<string, { type: string; description: string; required?: boolean; enum?: string[] }>;
  execute: (args: Record<string, any>, deviceContext: DeviceContext) => Promise<ToolResult>;
}

export interface ToolResult {
  success: boolean;
  data?: any;
  error?: string;
}

export interface DeviceContext {
  deviceId: string;
  setLeftWheel: (power: number) => void;
  setRightWheel: (power: number) => void;
  setLED: (r: number, g: number, b: number) => void;
  getSensors: () => SensorReadings;
}

export interface SensorReadings {
  distance: {
    front: number;
    frontLeft: number;
    frontRight: number;
    left: number;
    right: number;
    backLeft: number;
    backRight: number;
    back: number;
  };
  line: number[];
  bumper: { front: boolean; back: boolean };
  battery: { voltage: number; percentage: number };
  pose: { x: number; y: number; rotation: number };
  // Pushable objects detected nearby
  nearbyPushables?: {
    id: string;
    label: string;
    distance: number;
    angle: number;
    color: string;
    dockedIn?: string;
  }[];
  // Dock zones detected nearby
  nearbyDockZones?: {
    id: string;
    label: string;
    distance: number;
    angle: number;
    color: string;
    hasObject: boolean;
  }[];
}

export interface CameraAnalysis {
  timestamp: number;
  scene: string;
  imageDataUrl?: string; // Real camera image from Three.js canvas
  obstacles: {
    front: boolean;
    frontLeft: boolean;
    frontRight: boolean;
    left: boolean;
    right: boolean;
    back: boolean;
    backLeft: boolean;
    backRight: boolean;
    frontDistance: number;
  };
  distances: {
    front: number;
    frontLeft: number;
    frontRight: number;
    left: number;
    right: number;
    back: number;
    backLeft: number;
    backRight: number;
  };
  recommendation: string;
  spatialContext?: string; // Arena layout and object positions
}

// ═══════════════════════════════════════════════════════════════════════════
// STRUCTURED RESPONSE TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type BehaviorStep = 'OBSERVE' | 'ANALYZE' | 'PLAN' | 'ROTATE' | 'MOVE' | 'STOP' | 'SCAN';

export interface WorldModelObstacle {
  direction: 'front' | 'left' | 'right' | 'back';
  distance_cm: number;
  type: 'wall' | 'object' | 'unknown';
}

export interface WorldModel {
  robot_position: { x: number; y: number; rotation: number };
  obstacles: WorldModelObstacle[];
  // Track last known position for stuck detection
  lastPosition?: { x: number; y: number; rotation: number };
  stuckCounter?: number;
  explored_areas: string[];
  unexplored_directions: string[];
  // 360-degree scan state
  scanState?: {
    active: boolean;
    startHeading: number;       // Heading when scan started (degrees)
    currentScanStep: number;    // 0-7 (8 steps at 45 degrees each)
    totalScanSteps: number;     // 8 by default
    scanResults: Array<{
      heading_degrees: number;
      scene_description: string;
      detected_objects: string[];  // e.g., ['red_cube', 'green_dock', 'wall']
      imageDataUrl?: string;       // Camera image captured at this heading
    }>;
    targetDetected?: {
      object: string;
      heading_degrees: number;
      description: string;
    };
  };
}

export interface StructuredObservation {
  front_clear: boolean;
  front_distance_cm: number;
  left_clear: boolean;
  right_clear: boolean;
  scene_description: string;
}

export interface StructuredDecision {
  reasoning: string;
  target_direction: 'forward' | 'left' | 'right' | 'backward' | null;
  action_type: 'observe' | 'rotate' | 'move' | 'stop' | 'backup';
}

export interface StructuredResponse {
  cycle: number;
  current_step: BehaviorStep;
  goal: string;
  world_model: WorldModel;
  observation: StructuredObservation | null;
  decision: StructuredDecision;
  wheel_commands: {
    left_wheel: WheelDirection;
    right_wheel: WheelDirection;
  };
  next_step: string;
}

export interface ConversationMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Helper: Convert direction to power
 */
function getWheelPower(direction: WheelDirection): number {
  switch (direction) {
    case 'forward':
      return WHEEL_SPEED.FORWARD;
    case 'backward':
      return WHEEL_SPEED.BACKWARD;
    case 'stop':
    default:
      return WHEEL_SPEED.STOP;
  }
}

/**
 * Helper: Describe the scene from all 8 sensor readings
 */
function describeScene(dist: {
  front: number; frontLeft: number; frontRight: number;
  left: number; right: number;
  back: number; backLeft: number; backRight: number;
}): string {
  const descDir = (name: string, value: number): string => {
    if (value > 100) return `${name}: clear (${Math.round(value)}cm)`;
    if (value > 50) return `${name}: obstacle at ${Math.round(value)}cm`;
    if (value > 20) return `${name}: CLOSE obstacle at ${Math.round(value)}cm`;
    return `${name}: DANGER ${Math.round(value)}cm`;
  };

  return [
    descDir('Front', dist.front),
    descDir('Front-Left', dist.frontLeft),
    descDir('Front-Right', dist.frontRight),
    descDir('Left', dist.left),
    descDir('Right', dist.right),
    descDir('Back', dist.back),
    descDir('Back-Left', dist.backLeft),
    descDir('Back-Right', dist.backRight),
  ].join(' | ');
}

/**
 * Helper: Suggest direction based on all 8 sensors
 */
function suggestDirection(dist: {
  front: number; frontLeft: number; frontRight: number;
  left: number; right: number;
  back: number; backLeft: number; backRight: number;
}): string {
  // CRITICAL: Check for dangerous proximity FIRST - must back up before turning
  if (dist.front < 20) {
    if (dist.back > 40) {
      return 'DANGER: Too close to obstacle! Back up immediately, then turn';
    }
    return 'DANGER: Boxed in! Obstacle very close front AND back. Try rotating in place';
  }

  // If close but not critical, suggest backing up first
  if (dist.front < 40) {
    // Use diagonal sensors to pick best turn direction
    const leftScore = dist.frontLeft + dist.left;
    const rightScore = dist.frontRight + dist.right;
    if (rightScore > leftScore && dist.right > 50) {
      return 'Obstacle close ahead - back up slightly, then turn right (front-right clearer)';
    }
    if (leftScore > rightScore && dist.left > 50) {
      return 'Obstacle close ahead - back up slightly, then turn left (front-left clearer)';
    }
    if (dist.back > 40) {
      return 'Obstacle close ahead - back up first to get room to turn';
    }
    return 'Tight space - rotate in place to find opening';
  }

  // Path is clear - go forward, but warn about diagonal obstacles
  if (dist.front > 80) {
    if (dist.frontLeft < 30) return 'Path ahead mostly clear - veer slightly right (obstacle front-left)';
    if (dist.frontRight < 30) return 'Path ahead mostly clear - veer slightly left (obstacle front-right)';
    return 'Path ahead is clear - go forward';
  }

  // Moderate distance (40-80cm) - can turn safely without backing up
  const leftScore = dist.frontLeft + dist.left;
  const rightScore = dist.frontRight + dist.right;
  if (leftScore > rightScore && dist.left > 50) {
    return 'Turn left - more space on the left side';
  }
  if (rightScore > leftScore && dist.right > 50) {
    return 'Turn right - more space on the right side';
  }

  return 'Limited space - turn slowly to find open path';
}

/**
 * Helper: Build spatial context string with arena layout, object positions, and relationships.
 * This gives the LLM a map-like understanding of the environment.
 */
function buildSpatialContext(sensors: SensorReadings): string {
  const pose = sensors.pose;
  const headingDeg = Math.round((pose.rotation * 180) / Math.PI);
  const cardinalDir =
    headingDeg > -45 && headingDeg <= 45 ? 'North (+Y)' :
    headingDeg > 45 && headingDeg <= 135 ? 'East (+X)' :
    headingDeg > -135 && headingDeg <= -45 ? 'West (-X)' : 'South (-Y)';

  const lines: string[] = [
    `=== SPATIAL CONTEXT ===`,
    `Arena: 5m x 5m (bounds: -2.5 to +2.5 on both axes)`,
    `Robot position: (${pose.x.toFixed(2)}m, ${pose.y.toFixed(2)}m)`,
    `Robot heading: ${headingDeg}deg (facing ${cardinalDir})`,
    ``,
    `NOTE: You have NO distance sensors. Use the camera image to see your surroundings.`,
  ];

  // Nearby objects with absolute positions
  if (sensors.nearbyPushables && sensors.nearbyPushables.length > 0) {
    lines.push('');
    lines.push('Nearby pushable objects:');
    for (const p of sensors.nearbyPushables) {
      const absAngle = pose.rotation + (p.angle * Math.PI) / 180;
      const objX = pose.x + (p.distance / 100) * Math.sin(absAngle);
      const objY = pose.y + (p.distance / 100) * Math.cos(absAngle);
      const dockStatus = p.dockedIn ? ` [DOCKED in ${p.dockedIn}]` : '';
      lines.push(`  - ${p.label} (${p.color}): distance=${p.distance}cm, angle=${p.angle}deg, approx pos=(${objX.toFixed(2)}m, ${objY.toFixed(2)}m)${dockStatus}`);
    }
  }

  if (sensors.nearbyDockZones && sensors.nearbyDockZones.length > 0) {
    lines.push('');
    lines.push('Nearby dock zones (target areas):');
    for (const d of sensors.nearbyDockZones) {
      const absAngle = pose.rotation + (d.angle * Math.PI) / 180;
      const dockX = pose.x + (d.distance / 100) * Math.sin(absAngle);
      const dockY = pose.y + (d.distance / 100) * Math.cos(absAngle);
      const objStatus = d.hasObject ? ' [HAS OBJECT - GOAL COMPLETE]' : ' [EMPTY - push object here]';
      lines.push(`  - ${d.label}: distance=${d.distance}cm, angle=${d.angle}deg, approx pos=(${dockX.toFixed(2)}m, ${dockY.toFixed(2)}m)${objStatus}`);
    }
  }

  // Tactical advice based on spatial layout
  lines.push('');
  lines.push('Tactical notes:');
  if (sensors.nearbyPushables && sensors.nearbyPushables.length > 0 && sensors.nearbyDockZones && sensors.nearbyDockZones.length > 0) {
    const obj = sensors.nearbyPushables[0];
    const dock = sensors.nearbyDockZones[0];
    if (!obj.dockedIn) {
      lines.push(`  To push ${obj.label} into ${dock.label}: position yourself on the opposite side of the object from the dock, then drive forward through the object toward the dock.`);
      const angleDiff = dock.angle - obj.angle;
      if (Math.abs(angleDiff) < 20) {
        lines.push(`  Object and dock are roughly aligned from your position - good pushing angle!`);
      } else {
        lines.push(`  Object and dock are at different angles (${Math.round(obj.angle)}deg vs ${Math.round(dock.angle)}deg) - you may need to reposition.`);
      }
    }
  }

  return lines.join('\n');
}

/**
 * Simple Device Tools - Just 3 tools for basic planning and control
 */
export const DEVICE_TOOLS: DeviceTool[] = [
  {
    name: 'take_picture',
    description: 'Take a picture with the robot camera. Returns a real camera image from the 3D scene showing what the robot sees, along with nearby objects and spatial context. Use this to visually plan your next move - look for the red cube, green dock, blue walls, and red obstacles in the image.',
    parameters: {},
    execute: async (args, ctx) => {
      const sensors = ctx.getSensors();

      // Build scene description from nearby objects (no distance sensors)
      let sceneDesc = 'Camera image captured. Look at the image to understand your surroundings.';

      // Add pushable objects to scene description
      if (sensors.nearbyPushables && sensors.nearbyPushables.length > 0) {
        const objDescs = sensors.nearbyPushables.map(p => {
          const dir = p.angle > 30 ? 'to the right' : p.angle < -30 ? 'to the left' : 'ahead';
          const status = p.dockedIn ? ' (DOCKED in target zone!)' : '';
          return `${p.label} (${p.color}) ${dir} at ${p.distance}cm${status}`;
        });
        sceneDesc += ` | Pushable objects: ${objDescs.join('; ')}`;
      }

      // Add dock zones to scene description
      if (sensors.nearbyDockZones && sensors.nearbyDockZones.length > 0) {
        const dockDescs = sensors.nearbyDockZones.map(d => {
          const dir = d.angle > 30 ? 'to the right' : d.angle < -30 ? 'to the left' : 'ahead';
          const status = d.hasObject ? ' (OBJECT INSIDE - GOAL COMPLETE!)' : ' (empty - push object here)';
          return `${d.label} ${dir} at ${d.distance}cm${status}`;
        });
        sceneDesc += ` | Dock zones: ${dockDescs.join('; ')}`;
      }

      // Capture real camera image from the Three.js canvas
      let imageDataUrl: string | undefined;
      try {
        if (cameraCaptureManager.hasCanvas()) {
          const capture = cameraCaptureManager.capture(
            'robot-pov',
            sensors.pose ? { x: sensors.pose.x, y: sensors.pose.y, rotation: sensors.pose.rotation } : undefined,
            { width: 512, height: 384, quality: 0.85, format: 'jpeg' }
          );
          if (capture) {
            imageDataUrl = capture.dataUrl;
          }
        }
      } catch (e) {
        // Camera capture is optional - don't fail the tool
        console.warn('[take_picture] Canvas capture failed:', e);
      }

      // Build spatial context: arena layout + object positions relative to robot
      let spatialContext = buildSpatialContext(sensors);

      const recommendation = 'Use the camera image to decide your next move. Look for the red cube and green dock zone.';

      const analysis: CameraAnalysis = {
        timestamp: Date.now(),
        scene: sceneDesc,
        imageDataUrl,
        obstacles: {
          front: false, frontLeft: false, frontRight: false,
          left: false, right: false, back: false, backLeft: false, backRight: false,
          frontDistance: 200,
        },
        distances: {
          front: 200, frontLeft: 200, frontRight: 200,
          left: 200, right: 200, back: 200, backLeft: 200, backRight: 200,
        },
        recommendation,
        spatialContext,
      };

      return {
        success: true,
        data: analysis,
      };
    },
  },
  {
    name: 'left_wheel',
    description: 'Control the left wheel. Use "forward" to move forward, "backward" to move backward, or "stop" to stop the wheel. Only one speed is available for each direction.',
    parameters: {
      direction: {
        type: 'string',
        description: 'Direction: "forward", "backward", or "stop"',
        required: true,
        enum: ['forward', 'backward', 'stop'],
      },
    },
    execute: async (args, ctx) => {
      const direction = (args.direction || 'stop') as WheelDirection;
      const power = getWheelPower(direction);
      ctx.setLeftWheel(power);
      return {
        success: true,
        data: { wheel: 'left', direction, power },
      };
    },
  },
  {
    name: 'right_wheel',
    description: 'Control the right wheel. Use "forward" to move forward, "backward" to move backward, or "stop" to stop the wheel. Only one speed is available for each direction.',
    parameters: {
      direction: {
        type: 'string',
        description: 'Direction: "forward", "backward", or "stop"',
        required: true,
        enum: ['forward', 'backward', 'stop'],
      },
    },
    execute: async (args, ctx) => {
      const direction = (args.direction || 'stop') as WheelDirection;
      const power = getWheelPower(direction);
      ctx.setRightWheel(power);
      return {
        success: true,
        data: { wheel: 'right', direction, power },
      };
    },
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// DEFAULT AGENT PROMPT - Simple behavior cycle
// ═══════════════════════════════════════════════════════════════════════════

export const DEFAULT_AGENT_PROMPTS = {
  simple: `You are a structured autonomous robot with a CAMERA and two wheels. You navigate using ONLY your camera image - you have NO distance sensors.

## Your Tools
1. **take_picture** - Capture a fresh camera image to see your environment
2. **left_wheel** - Control left wheel: "forward", "backward", or "stop"
3. **right_wheel** - Control right wheel: "forward", "backward", or "stop"

## Movement Reference
| Movement      | Left Wheel | Right Wheel |
|---------------|------------|-------------|
| Forward       | forward    | forward     |
| Backward      | backward   | backward    |
| Rotate Left   | backward   | forward     |
| Rotate Right  | forward    | backward    |
| Stop          | stop       | stop        |

## CAMERA-BASED NAVIGATION
**You receive a camera image with EVERY sensor update.** Use it to:
- **See the RED CUBE** - A bright red box you need to push. It looks like a red square/rectangle in your view.
- **See the GREEN DOCK** - A bright green zone on the floor in a visible corner of the arena with green corner markers. This is where you push the cube to.
- **See WALLS** - Blue barriers with white chevron patterns at the edges of the arena.
- **See OBSTACLES** - Red cylindrical obstacles with white diagonal stripes in the arena.
- **Judge DISTANCES** - Objects that appear larger are closer. Objects that appear smaller are farther away.

## STRICT BEHAVIOR CYCLE
Follow this cycle EXACTLY:
1. **OBSERVE** → Look at the camera image to understand your surroundings
2. **ANALYZE** → Identify where the red cube, green dock, and obstacles are in the image
3. **PLAN** → Decide how to approach: navigate toward the red cube, position behind it, then push toward dock
4. **ROTATE** → Turn to face target direction (if needed)
5. **MOVE** → Go forward toward target
6. **STOP** → Halt wheels, return to step 1

**AUTOMATIC 360° SCAN**: When you get stuck (no progress for 3 cycles), the system will automatically perform a 360-degree scan:
- Rotates in 8 steps of ~45° each, taking a camera image at each heading
- Detects objects (red cube, green dock, obstacles) at each heading
- Injects a scan summary into your conversation with detected object positions
- After scan, you receive a full panoramic report - use it to plan your next move!

## PUSHING STRATEGY
1. First, navigate TO the red cube
2. Position yourself on the OPPOSITE side of the cube from the green dock
3. Drive FORWARD to push the cube toward the green dock
4. The dock is in a corner of the arena - look for the bright green zone with corner markers

## REQUIRED: Structured JSON Response
EVERY response MUST be valid JSON with this EXACT structure:

{
  "cycle": <number>,
  "current_step": "<OBSERVE|ANALYZE|PLAN|ROTATE|MOVE|STOP|SCAN>",
  "goal": "<your goal>",
  "world_model": {
    "robot_position": {"x": <number>, "y": <number>, "rotation": <degrees>},
    "obstacles": [{"direction": "<front|left|right|back>", "distance_cm": <number>, "type": "<wall|object|unknown>"}],
    "explored_areas": ["<descriptions>"],
    "unexplored_directions": ["<directions>"]
  },
  "observation": {
    "front_clear": <boolean>,
    "front_distance_cm": <number>,
    "left_clear": <boolean>,
    "right_clear": <boolean>,
    "scene_description": "<describe what you SEE in the camera image>"
  },
  "decision": {
    "reasoning": "<why this action based on what you SEE>",
    "target_direction": "<forward|left|right|backward|null>",
    "action_type": "<observe|rotate|move|stop|backup>"
  },
  "wheel_commands": {
    "left_wheel": "<forward|backward|stop>",
    "right_wheel": "<forward|backward|stop>"
  },
  "next_step": "<next step in cycle>"
}

## CRITICAL: USE THE CAMERA IMAGE
- **ALWAYS look at the attached camera image** before deciding your action
- The image shows your first-person view from the robot's perspective
- If you see the RED CUBE in the image, drive TOWARD it
- If you see the GREEN DOCK, remember its location for pushing
- If you see a WALL or OBSTACLE ahead, turn to avoid it
- If you don't see the red cube, ROTATE to scan the environment

## LEARNING FROM PREVIOUS ACTIONS
**CRITICAL: Analyze your conversation history before deciding!**
- If the last movement made no progress → TRY A DIFFERENT approach
- If you have been rotating in the same direction multiple times → try the OPPOSITE rotation
- Compare what you see in the camera with what you expected
- NEVER repeat the exact same wheel_commands if they failed to make progress
- If stuck, try: rotate 90 degrees, then reassess from camera

## CRITICAL RULES
1. Output ONLY valid JSON - no extra text before or after
2. ALWAYS base decisions on the CAMERA IMAGE - it is your primary sensor
3. Drive TOWARD the red cube when you see it - do NOT turn away from it
4. Consider GOAL when planning direction
5. LEARN from failures - if an action didn't work, DO SOMETHING DIFFERENT
6. Keep moving! Stopping without reason wastes time.`,

  reactive: `You are a robot controller with a camera, two wheels, and MEMORY. You maintain a mental grid map of the world.

## BEHAVIOR CYCLE (Follow This Loop)

OBSERVE → PLAN → MOVE → STOP → REPEAT

1. **OBSERVE**: Call take_picture to get sensor readings
2. **PLAN**: Update world map grid, review history, decide action
3. **MOVE**: Execute wheel commands
4. **STOP**: Stop wheels, return to OBSERVE

## Tools

Use this format: [TOOL] tool_name argument

| Tool | Example |
|------|---------|
| take_picture | [TOOL] take_picture |
| left_wheel | [TOOL] left_wheel forward |
| right_wheel | [TOOL] right_wheel backward |

## Movement Reference

| Action | Left Wheel | Right Wheel |
|--------|------------|-------------|
| Forward | forward | forward |
| Backward | backward | backward |
| Turn Left | backward | forward |
| Turn Right | forward | backward |
| Stop | stop | stop |

## WORLD MAP (Grid)

Maintain a grid map. Start at (0,0) facing NORTH.

Legend: R=Robot, .=Unknown, ~=Clear, #=Obstacle, ?=Visited

Example 3x3 map:
    -1   0  +1
   ┌───┬───┬───┐
+1 │ ~ │ ~ │ . │
   ├───┼───┼───┤
 0 │ # │ R │ ~ │
   └───┴───┴───┘

Update rules:
- front > 80cm → cells ahead = ~ (clear)
- front < 40cm → cell ahead = # (obstacle)
- After move → update position, old cell = ?

Position tracking:
- Forward: +1 in heading direction
- Turn Left: heading -= 90°
- Turn Right: heading += 90°

## RESPONSE FORMAT

Every response MUST have:
1. State line (OBSERVE: readings)
2. World Map (ASCII grid)
3. Plan line
4. [TOOL] lines

Example:
OBSERVE: Front=120cm (clear), Left=45cm (obstacle), Right=200cm (clear)

World Map (pos: 0,0 heading: N):
    -1   0  +1
   ┌───┬───┬───┐
+1 │ ~ │ ~ │ ~ │
   ├───┼───┼───┤
 0 │ # │ R │ ~ │
   └───┴───┴───┘

PLAN: Clear ahead. Moving forward.

[TOOL] left_wheel forward
[TOOL] right_wheel forward

## Safety Rules

| Distance | Action |
|----------|--------|
| < 20cm | DANGER! Backup now |
| 20-40cm | Stop, turn away |
| 40-80cm | Safe to turn |
| > 80cm | Clear, go forward |

## Using History

CRITICAL: Check previous messages!
- What did you see before?
- Did last move work?
- Same readings 2+ cycles = stuck, try different action
- Build cumulative map from all observations

## CRITICAL RULES

1. ALWAYS output world map
2. ALWAYS output [TOOL] lines
3. ALWAYS check safety first
4. UPDATE position after moves
5. USE HISTORY to build map
6. VARY ACTIONS if stuck`,
};

// Backwards compatibility - these now all point to the same simple behavior
export const BEHAVIOR_TO_MAP: Record<string, string> = {
  simple: 'standard5x5Empty',
  reactive: 'standard5x5Empty',
};

export const BEHAVIOR_DESCRIPTIONS: Record<string, { name: string; description: string; mapName: string }> = {
  simple: {
    name: 'Simple Explorer',
    description: 'Structured JSON-based behavior with world model building',
    mapName: '5m × 5m Empty',
  },
  reactive: {
    name: 'Reactive Explorer',
    description: 'OBSERVE-PLAN-MOVE-STOP cycle with grid world mapping - recommended',
    mapName: '5m × 5m Empty',
  },
};

export function getAgentPrompt(behaviorId: string): string {
  if (behaviorId === 'reactive') {
    return DEFAULT_AGENT_PROMPTS.reactive;
  }
  return DEFAULT_AGENT_PROMPTS.simple;
}

// ═══════════════════════════════════════════════════════════════════════════
// AGENT CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

export interface ESP32AgentConfig {
  id: string;
  name: string;
  deviceId: string;
  systemPrompt: string;
  goal?: string;
  loopIntervalMs?: number;
  maxIterations?: number;
  onStateChange?: (state: ESP32AgentState) => void;
  onLog?: (message: string, level: 'info' | 'warn' | 'error') => void;
}

export interface ESP32AgentState {
  running: boolean;
  iteration: number;
  currentStep: BehaviorStep;
  lastSensorReading: SensorReadings | null;
  lastLLMResponse: string | null;
  lastStructuredResponse: StructuredResponse | null;
  lastToolCalls: Array<{ tool: string; args: any; result: ToolResult }>;
  lastPicture: CameraAnalysis | null;
  conversationHistory: ConversationMessage[];
  worldModel: WorldModel;
  errors: string[];
  stats: {
    totalIterations: number;
    totalToolCalls: number;
    avgLoopTimeMs: number;
    llmCallCount: number;
    avgLLMLatencyMs: number;
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// ESP32 AGENT RUNTIME - Simplified
// ═══════════════════════════════════════════════════════════════════════════

export class ESP32AgentRuntime {
  private config: ESP32AgentConfig;
  private state: ESP32AgentState;
  private deviceContext: DeviceContext | null = null;
  private loopHandle: any = null;
  private leftWheelPower = 0;
  private rightWheelPower = 0;

  constructor(config: ESP32AgentConfig) {
    this.config = {
      ...config,
      loopIntervalMs: config.loopIntervalMs ?? 2000,
    };

    // Add goal to system prompt if provided
    let systemPrompt = config.systemPrompt || DEFAULT_AGENT_PROMPTS.simple;
    if (config.goal) {
      systemPrompt += `\n\n## Your Main Goal\n**${config.goal}**\n\nKeep this goal in mind when deciding which direction to go.`;
    }
    this.config.systemPrompt = systemPrompt;

    this.state = {
      running: false,
      iteration: 0,
      currentStep: 'OBSERVE',
      lastSensorReading: null,
      lastLLMResponse: null,
      lastStructuredResponse: null,
      lastToolCalls: [],
      lastPicture: null,
      conversationHistory: [],
      worldModel: {
        robot_position: { x: 0, y: 0, rotation: 0 },
        obstacles: [],
        explored_areas: [],
        unexplored_directions: ['front', 'left', 'right', 'back'],
      },
      errors: [],
      stats: {
        totalIterations: 0,
        totalToolCalls: 0,
        avgLoopTimeMs: 0,
        llmCallCount: 0,
        avgLLMLatencyMs: 0,
      },
    };
  }

  /**
   * Initialize the device context
   */
  private initDeviceContext(): DeviceContext {
    const manager = getDeviceManager();
    const deviceId = this.config.deviceId;

    return {
      deviceId,
      setLeftWheel: (power: number) => {
        this.leftWheelPower = power;
        manager.sendCommand(deviceId, {
          type: 'drive',
          payload: { left: power, right: this.rightWheelPower },
        });
      },
      setRightWheel: (power: number) => {
        this.rightWheelPower = power;
        manager.sendCommand(deviceId, {
          type: 'drive',
          payload: { left: this.leftWheelPower, right: power },
        });
      },
      setLED: (r: number, g: number, b: number) => {
        manager.sendCommand(deviceId, {
          type: 'led',
          payload: { r, g, b },
        });
      },
      getSensors: (): SensorReadings => {
        const state = manager.getDeviceState(deviceId);
        if (!state) {
          throw new Error('Device not found');
        }
        return {
          distance: state.robot.sensors.distance,
          line: state.robot.sensors.line,
          bumper: state.robot.sensors.bumper,
          battery: state.robot.battery,
          pose: state.robot.pose,
          nearbyPushables: state.robot.sensors.nearbyPushables,
          nearbyDockZones: state.robot.sensors.nearbyDockZones,
        };
      },
    };
  }

  /**
   * Start the agent control loop
   */
  async start(): Promise<void> {
    if (this.state.running) {
      this.log('Agent already running', 'warn');
      return;
    }

    this.log(`Starting agent: ${this.config.name}`, 'info');

    // Clear diagnostics from previous run
    useDiagnosticsStore.getState().clear();

    // Initialize device context
    this.deviceContext = this.initDeviceContext();

    this.state.running = true;
    this.state.iteration = 0;
    this.state.errors = [];
    this.emitStateChange();

    // Start the control loop
    this.runLoop();
  }

  /**
   * Stop the agent control loop
   */
  async stop(): Promise<void> {
    if (!this.state.running) return;

    this.log(`Stopping agent: ${this.config.name}`, 'info');

    if (this.loopHandle) {
      clearTimeout(this.loopHandle);
      this.loopHandle = null;
    }

    // Stop motors
    if (this.deviceContext) {
      this.deviceContext.setLeftWheel(0);
      this.deviceContext.setRightWheel(0);
    }

    this.state.running = false;
    this.emitStateChange();
  }

  /**
   * Get current state
   */
  getState(): ESP32AgentState {
    return { ...this.state };
  }

  /**
   * Main control loop
   */
  private async runLoop(): Promise<void> {
    if (!this.state.running || !this.deviceContext) return;

    const loopStart = Date.now();
    this.state.iteration++;
    this.state.stats.totalIterations++;

    // Check iteration limit
    if (this.config.maxIterations && this.state.iteration > this.config.maxIterations) {
      this.log(`Reached max iterations (${this.config.maxIterations})`, 'info');
      this.stop();
      return;
    }

    try {
      // STEP 1: Read sensors
      const sensors = this.deviceContext.getSensors();
      this.state.lastSensorReading = sensors;

      // SCAN MODE: If in SCAN step, execute scan logic instead of normal LLM loop
      if (this.state.currentStep === 'SCAN') {
        const scanComplete = await this.executeScanStep(sensors);
        if (!scanComplete) {
          // More scan steps needed - schedule next iteration quickly
          this.emitStateChange();
          if (this.state.running) {
            this.loopHandle = setTimeout(() => this.runLoop(), 500); // Faster interval during scan
          }
          return;
        }
        // Scan complete - fall through to normal loop which will now run with OBSERVE step
        // and the scan results injected into conversation history
        this.emitStateChange();
        if (this.state.running) {
          this.loopHandle = setTimeout(() => this.runLoop(), this.config.loopIntervalMs);
        }
        return;
      }

      // STEP 1.5: Always capture a fresh camera image before calling LLM
      // This ensures the LLM always gets a current visual of the scene
      try {
        if (cameraCaptureManager.hasCanvas()) {
          const capture = cameraCaptureManager.capture(
            'robot-pov',
            sensors.pose ? { x: sensors.pose.x, y: sensors.pose.y, rotation: sensors.pose.rotation } : undefined,
            { width: 512, height: 384, quality: 0.85, format: 'jpeg' }
          );
          if (capture) {
            // Update lastPicture with fresh camera image so callLLM can use it
            if (!this.state.lastPicture) {
              this.state.lastPicture = {
                timestamp: Date.now(),
                scene: '',
                imageDataUrl: capture.dataUrl,
                obstacles: { front: false, frontLeft: false, frontRight: false, left: false, right: false, back: false, backLeft: false, backRight: false, frontDistance: 200 },
                distances: { front: 200, frontLeft: 200, frontRight: 200, left: 200, right: 200, back: 200, backLeft: 200, backRight: 200 },
                recommendation: '',
              };
            } else {
              this.state.lastPicture.imageDataUrl = capture.dataUrl;
              this.state.lastPicture.timestamp = Date.now();
            }
          }
        }
      } catch (e) {
        // Camera capture is optional - don't fail the loop
        console.warn('[ESP32Agent] Pre-loop camera capture failed:', e);
      }

      // STEP 2: Call LLM for decision
      const llmStart = Date.now();
      const llmResponse = await this.callLLM(sensors);
      const llmLatency = Date.now() - llmStart;

      this.state.lastLLMResponse = llmResponse;
      this.state.stats.llmCallCount++;
      this.state.stats.avgLLMLatencyMs =
        (this.state.stats.avgLLMLatencyMs * (this.state.stats.llmCallCount - 1) + llmLatency) /
        this.state.stats.llmCallCount;

      // STEP 3: Parse and execute tool calls
      const toolCalls = this.parseToolCalls(llmResponse);
      this.state.lastToolCalls = [];

      for (const { tool, args } of toolCalls) {
        const toolDef = DEVICE_TOOLS.find((t) => t.name === tool);
        if (toolDef) {
          const result = await toolDef.execute(args, this.deviceContext);
          this.state.lastToolCalls.push({ tool, args, result });
          this.state.stats.totalToolCalls++;

          // Store camera analysis
          if (tool === 'take_picture' && result.success && result.data) {
            this.state.lastPicture = result.data;
          }

          this.log(`Tool ${tool}: ${JSON.stringify(result.data)}`, 'info');
        } else {
          this.log(`Unknown tool: ${tool}`, 'warn');
        }
      }

      // CRITICAL: Add tool results to conversation history so LLM can see them
      if (this.state.lastToolCalls.length > 0) {
        this.addToolResultsToHistory(this.state.lastToolCalls);
      }

      // AUTOMATIC CYCLE PROGRESSION & STUCK DETECTION
      // This ensures the robot advances through the cycle even if LLM doesn't set next_step correctly
      this.handleAutomaticCycleProgression(sensors, toolCalls);

      // ═══════════════════════════════════════════════════════════════════
      // DIAGNOSTIC INSTRUMENTATION
      // ═══════════════════════════════════════════════════════════════════
      this.emitDiagnostics(sensors, llmLatency, toolCalls);

      // Update loop timing stats
      const loopTime = Date.now() - loopStart;
      this.state.stats.avgLoopTimeMs =
        (this.state.stats.avgLoopTimeMs * (this.state.iteration - 1) + loopTime) /
        this.state.iteration;

      this.emitStateChange();
    } catch (error: any) {
      this.log(`Loop error: ${error.message}`, 'error');
      this.state.errors.push(error.message);
      this.emitStateChange();
    }

    // Schedule next iteration
    if (this.state.running) {
      this.loopHandle = setTimeout(() => this.runLoop(), this.config.loopIntervalMs);
    }
  }

  /**
   * Call LLM for decision with conversation history
   */
  private async callLLM(sensors: SensorReadings): Promise<string> {
    // Build structured user prompt with sensor data
    // NOTE: Distance sensors have been removed. The robot relies on camera vision only.
    const sensorContext: Record<string, any> = {
      cycle: this.state.iteration,
      current_step: this.state.currentStep,
      robot_pose: {
        x: sensors.pose.x.toFixed(3),
        y: sensors.pose.y.toFixed(3),
        heading_degrees: Math.round((sensors.pose.rotation * 180) / Math.PI),
      },
      has_camera_image: !!this.state.lastPicture?.imageDataUrl,
      current_world_model: this.state.worldModel,
      goal: this.config.goal || 'explore safely',
    };

    // Include last scan results if a scan was recently completed
    if (this.state.worldModel.scanState && !this.state.worldModel.scanState.active && this.state.worldModel.scanState.scanResults.length > 0) {
      sensorContext.last_scan_results = {
        total_headings_scanned: this.state.worldModel.scanState.scanResults.length,
        target_detected: this.state.worldModel.scanState.targetDetected || null,
        scan_summary: this.state.worldModel.scanState.scanResults.map(r => ({
          heading: r.heading_degrees,
          objects: r.detected_objects,
        })),
      };
    }

    // Include pushable objects sensor data if available
    if (sensors.nearbyPushables && sensors.nearbyPushables.length > 0) {
      sensorContext.nearby_pushable_objects = sensors.nearbyPushables.map(p => ({
        id: p.id,
        label: p.label,
        distance_cm: p.distance,
        angle_degrees: p.angle,
        color: p.color,
        docked_in: p.dockedIn || null,
      }));
    }

    // Include dock zones sensor data if available
    if (sensors.nearbyDockZones && sensors.nearbyDockZones.length > 0) {
      sensorContext.nearby_dock_zones = sensors.nearbyDockZones.map(d => ({
        id: d.id,
        label: d.label,
        distance_cm: d.distance,
        angle_degrees: d.angle,
        color: d.color,
        has_object_inside: d.hasObject,
      }));
    }

    const userPrompt = `CYCLE ${this.state.iteration} - SENSOR UPDATE:
${JSON.stringify(sensorContext, null, 2)}

Continue the behavior cycle. Current step: ${this.state.currentStep}
Respond with ONLY valid JSON in the required structured format.`;

    // Add to conversation history
    this.state.conversationHistory.push({
      role: 'user',
      content: userPrompt,
    });

    // Keep only last 10 exchanges to prevent context overflow
    if (this.state.conversationHistory.length > 20) {
      this.state.conversationHistory = this.state.conversationHistory.slice(-20);
    }

    // Format tools description
    const toolsDescription = DEVICE_TOOLS.map(
      (tool) => `Tool: ${tool.name}\nDescription: ${tool.description}\nParameters: ${JSON.stringify(tool.parameters)}`
    ).join('\n\n');

    // Get LLM config from browser storage (runs client-side)
    const apiKey = LLMStorage.getApiKey();
    const model = LLMStorage.getModel();
    const baseURL = LLMStorage.getBaseUrl() || DEFAULT_BASE_URL;

    if (!apiKey || !model) {
      this.log('LLM not configured - set API key in settings', 'error');
      return this.createFallbackResponse('stop', 'LLM not configured');
    }

    // Collect camera image if available (from last take_picture)
    const cameraImageDataUrl = this.state.lastPicture?.imageDataUrl || null;

    // Call the LLM API with conversation history and optional vision image
    try {
      const response = await fetch('/api/robot-llm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId: this.config.deviceId,
          systemPrompt: this.config.systemPrompt,
          userPrompt: userPrompt,
          tools: toolsDescription,
          conversationHistory: this.state.conversationHistory,
          cameraImageDataUrl,
          llmConfig: {
            apiKey,
            model,
            baseURL,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`LLM API error: ${response.status}`);
      }

      const data = await response.json();
      const llmResponse = data.response || '';

      // Add assistant response to conversation history
      this.state.conversationHistory.push({
        role: 'assistant',
        content: llmResponse,
      });

      // Parse and update state from structured response
      this.parseStructuredResponse(llmResponse);

      return llmResponse;
    } catch (error: any) {
      this.log(`LLM call failed: ${error.message}`, 'error');
      return this.createFallbackResponse('stop', error.message);
    }
  }

  /**
   * Add tool results to conversation history so LLM can see what happened
   */
  private addToolResultsToHistory(toolCalls: Array<{ tool: string; args: any; result: ToolResult }>): void {
    if (toolCalls.length === 0) return;

    const resultsSummary = toolCalls.map(tc => {
      if (tc.tool === 'take_picture' && tc.result.success && tc.result.data) {
        const data = tc.result.data as CameraAnalysis;
        const cameraResult: Record<string, any> = {
          scene: data.scene,
          recommendation: data.recommendation,
        };
        if (data.spatialContext) {
          cameraResult.spatial_context = data.spatialContext;
        }
        if (data.imageDataUrl) {
          cameraResult.has_camera_image = true; // Don't put base64 in text - it's sent via vision API
          cameraResult.note = 'A camera image is attached to this message. Use it to see red obstacles, blue walls, the red cube, and green dock.';
        }
        return `TOOL RESULT [take_picture]:\n${JSON.stringify(cameraResult, null, 2)}`;
      }
      return `TOOL RESULT [${tc.tool}]: ${JSON.stringify(tc.result.data)}`;
    }).join('\n\n');

    this.state.conversationHistory.push({
      role: 'user',
      content: `--- TOOL EXECUTION RESULTS ---\n${resultsSummary}\n\nNow decide your next action based on these results.`,
    });
  }

  /**
   * Handle automatic cycle progression and stuck detection
   * This ensures the robot moves even if the LLM doesn't properly advance the cycle
   */
  private handleAutomaticCycleProgression(
    sensors: SensorReadings,
    toolCalls: Array<{ tool: string; args: Record<string, any> }>
  ): void {
    const currentPos = sensors.pose;
    const lastPos = this.state.worldModel.lastPosition;

    // Check if robot has moved since last cycle
    const hasMoved = !lastPos ||
      Math.abs(currentPos.x - lastPos.x) > 0.1 ||
      Math.abs(currentPos.y - lastPos.y) > 0.1 ||
      Math.abs(currentPos.rotation - lastPos.rotation) > 5;

    // Update last position
    this.state.worldModel.lastPosition = { ...currentPos };

    // Check if we executed a stop command this cycle
    const executedStop = toolCalls.some(tc =>
      (tc.tool === 'left_wheel' || tc.tool === 'right_wheel') &&
      tc.args.direction === 'stop'
    );

    // Stuck detection: robot hasn't moved and executed stop (position-based, no distance sensors)
    if (!hasMoved && executedStop) {
      this.state.worldModel.stuckCounter = (this.state.worldModel.stuckCounter || 0) + 1;
      this.log(`Stuck detection: counter=${this.state.worldModel.stuckCounter}`, 'warn');
    } else if (hasMoved) {
      // Reset stuck counter if robot moved
      this.state.worldModel.stuckCounter = 0;
    }

    // FORCE 360-SCAN if stuck for 3+ cycles - instead of blindly moving forward,
    // do a systematic 360-degree scan to find the target
    if ((this.state.worldModel.stuckCounter || 0) >= 3) {
      this.log('STUCK DETECTED - Initiating 360-degree SCAN to find target!', 'warn');
      this.initiateScan(sensors);
      this.state.worldModel.stuckCounter = 0;
      return; // Skip normal cycle advancement
    }

    // If currently in SCAN mode, handle scan progression
    if (this.state.currentStep === 'SCAN') {
      // SCAN is handled by executeScanStep() in the runLoop - don't interfere here
      return;
    }

    // AUTOMATIC CYCLE ADVANCEMENT based on what tools were executed
    // This helps ensure the cycle progresses even if LLM doesn't set next_step
    const tookPicture = toolCalls.some(tc => tc.tool === 'take_picture');
    const executedMove = toolCalls.some(tc =>
      (tc.tool === 'left_wheel' || tc.tool === 'right_wheel') &&
      tc.args.direction !== 'stop'
    );

    // Simple cycle advancement logic:
    // - After OBSERVE (take_picture), advance to PLAN
    // - After MOVE (forward/backward commands), advance to STOP
    // - After STOP (stop commands), advance to OBSERVE
    if (this.state.currentStep === 'OBSERVE' && tookPicture) {
      this.state.currentStep = 'PLAN';
      this.log('Cycle: OBSERVE → PLAN (took picture)', 'info');
    } else if ((this.state.currentStep === 'PLAN' || this.state.currentStep === 'ROTATE') && executedMove) {
      this.state.currentStep = 'MOVE';
      this.log('Cycle: → MOVE (wheels moving)', 'info');
    } else if (this.state.currentStep === 'MOVE' && executedStop) {
      this.state.currentStep = 'STOP';
      this.log('Cycle: MOVE → STOP (wheels stopped)', 'info');
    } else if (this.state.currentStep === 'STOP') {
      this.state.currentStep = 'OBSERVE';
      this.log('Cycle: STOP → OBSERVE (restarting cycle)', 'info');
    }
  }

  /**
   * Initiate a 360-degree scan: rotate in 45-degree increments, taking a picture at each step
   * to build a panoramic understanding of the environment and detect the target
   */
  private initiateScan(sensors: SensorReadings): void {
    const currentHeading = Math.round((sensors.pose.rotation * 180) / Math.PI);
    this.state.worldModel.scanState = {
      active: true,
      startHeading: currentHeading,
      currentScanStep: 0,
      totalScanSteps: 8,  // 8 steps x 45 degrees = 360 degrees
      scanResults: [],
      targetDetected: undefined,
    };
    this.state.currentStep = 'SCAN';
    this.log(`SCAN initiated: starting at heading ${currentHeading}°, will rotate 8x45°=360°`, 'info');
  }

  /**
   * Normalize an angle to the range (-180, 180] degrees
   */
  private normalizeAngleDeg(angle: number): number {
    while (angle > 180) angle -= 360;
    while (angle <= -180) angle += 360;
    return angle;
  }

  /**
   * Execute one step of the 360-degree scan.
   * Each step: stop → take picture → analyze → rotate exactly 45° using heading feedback.
   * Returns true if scan is complete, false if more steps needed.
   */
  private async executeScanStep(sensors: SensorReadings): Promise<boolean> {
    const scan = this.state.worldModel.scanState;
    if (!scan || !scan.active) return true;

    const stepIndex = scan.currentScanStep;

    // PHASE 1: Stop and stabilize
    this.deviceContext?.setLeftWheel(WHEEL_SPEED.STOP);
    this.deviceContext?.setRightWheel(WHEEL_SPEED.STOP);
    await new Promise(resolve => setTimeout(resolve, 200));

    // Re-read sensors after stopping for accurate heading
    const stoppedSensors = this.deviceContext!.getSensors();
    const captureHeading = Math.round((stoppedSensors.pose.rotation * 180) / Math.PI);

    this.log(`SCAN step ${stepIndex + 1}/${scan.totalScanSteps} at heading ${captureHeading}°`, 'info');

    // PHASE 2: Capture camera image at this heading
    let capturedImageDataUrl: string | undefined;
    try {
      if (cameraCaptureManager.hasCanvas()) {
        const capture = cameraCaptureManager.capture(
          'robot-pov',
          { x: stoppedSensors.pose.x, y: stoppedSensors.pose.y, rotation: stoppedSensors.pose.rotation },
          { width: 512, height: 384, quality: 0.85, format: 'jpeg' }
        );
        if (capture) {
          capturedImageDataUrl = capture.dataUrl;
          // Update lastPicture with this scan capture
          if (!this.state.lastPicture) {
            this.state.lastPicture = {
              timestamp: Date.now(),
              scene: '',
              imageDataUrl: capture.dataUrl,
              obstacles: { front: false, frontLeft: false, frontRight: false, left: false, right: false, back: false, backLeft: false, backRight: false, frontDistance: 200 },
              distances: { front: 200, frontLeft: 200, frontRight: 200, left: 200, right: 200, back: 200, backLeft: 200, backRight: 200 },
              recommendation: '',
            };
          } else {
            this.state.lastPicture.imageDataUrl = capture.dataUrl;
            this.state.lastPicture.timestamp = Date.now();
          }
        }
      }
    } catch (e) {
      console.warn('[ESP32Agent] Scan camera capture failed:', e);
    }

    // PHASE 3: Analyze sensor data for nearby objects at this heading
    let sceneDescription = '';
    let detectedObjects: string[] = [];

    if (stoppedSensors.nearbyPushables && stoppedSensors.nearbyPushables.length > 0) {
      for (const p of stoppedSensors.nearbyPushables) {
        if (Math.abs(p.angle) < 45) {
          detectedObjects.push(`${p.label || p.id} (${p.distance}cm, angle=${p.angle}°)`);
          if (p.label?.toLowerCase().includes('red') || p.color === '#e53935') {
            sceneDescription += `RED CUBE detected at ${p.distance}cm, angle ${p.angle}°! `;
            scan.targetDetected = {
              object: 'red_cube',
              heading_degrees: captureHeading,
              description: `Red Cube at heading ${captureHeading}°, distance ${p.distance}cm, angle ${p.angle}°`,
            };
          }
        }
      }
    }

    if (stoppedSensors.nearbyDockZones && stoppedSensors.nearbyDockZones.length > 0) {
      for (const d of stoppedSensors.nearbyDockZones) {
        if (Math.abs(d.angle) < 45) {
          detectedObjects.push(`${d.label || d.id} (${d.distance}cm, angle=${d.angle}°)`);
        }
      }
    }

    if (!sceneDescription) {
      sceneDescription = detectedObjects.length > 0
        ? `Objects visible: ${detectedObjects.join(', ')}`
        : 'No target objects visible at this heading';
    }

    // Record scan result (including the captured image)
    scan.scanResults.push({
      heading_degrees: captureHeading,
      scene_description: sceneDescription,
      detected_objects: detectedObjects,
      imageDataUrl: capturedImageDataUrl,
    });

    scan.currentScanStep++;

    // Check if scan is complete
    if (scan.currentScanStep >= scan.totalScanSteps) {
      scan.active = false;
      this.log(`SCAN complete! ${scan.scanResults.length} headings scanned.`, 'info');

      if (scan.targetDetected) {
        this.log(`TARGET FOUND during scan: ${scan.targetDetected.description}`, 'info');
      } else {
        this.log('No target detected during scan - will move to new position and scan again', 'warn');
      }

      // Create composite image from all scan captures and set as lastPicture
      // so the next LLM call includes the panoramic view
      try {
        const compositeDataUrl = await this.createScanCompositeImage(scan.scanResults);
        if (compositeDataUrl) {
          if (!this.state.lastPicture) {
            this.state.lastPicture = {
              timestamp: Date.now(),
              scene: '360° panoramic scan composite',
              imageDataUrl: compositeDataUrl,
              obstacles: { front: false, frontLeft: false, frontRight: false, left: false, right: false, back: false, backLeft: false, backRight: false, frontDistance: 200 },
              distances: { front: 200, frontLeft: 200, frontRight: 200, left: 200, right: 200, back: 200, backLeft: 200, backRight: 200 },
              recommendation: 'Analyze the 360° panoramic view to find the red cube and green dock.',
            };
          } else {
            this.state.lastPicture.imageDataUrl = compositeDataUrl;
            this.state.lastPicture.scene = '360° panoramic scan composite';
            this.state.lastPicture.timestamp = Date.now();
          }
          this.log('Created 360° composite image for LLM analysis', 'info');
        }
      } catch (e) {
        console.warn('[ESP32Agent] Failed to create scan composite image:', e);
      }

      // Build scan summary and inject into conversation history for LLM awareness
      this.injectScanResultsIntoHistory(scan);

      // Transition back to OBSERVE so LLM can plan based on scan results
      this.state.currentStep = 'OBSERVE';
      return true;
    }

    // PHASE 4: Rotate exactly 45° clockwise using heading-based feedback
    // Use a lower PWM for precise rotation control
    const SCAN_ROTATE_PWM = 40; // Lower speed for precision (deadband minimum)
    const targetHeading = this.normalizeAngleDeg(captureHeading - 45);

    this.log(`SCAN: rotating from ${captureHeading}° to target ${targetHeading}° (45° clockwise)`, 'info');
    this.deviceContext?.setLeftWheel(SCAN_ROTATE_PWM);
    this.deviceContext?.setRightWheel(-SCAN_ROTATE_PWM);

    // Poll heading until we reach the target (with safety timeout)
    const rotateStart = Date.now();
    const MAX_ROTATE_MS = 3000;
    let reachedTarget = false;

    while (Date.now() - rotateStart < MAX_ROTATE_MS) {
      await new Promise(resolve => setTimeout(resolve, 30));
      const currentSensors = this.deviceContext!.getSensors();
      const currentDeg = (currentSensors.pose.rotation * 180) / Math.PI;
      const diff = this.normalizeAngleDeg(currentDeg - targetHeading);
      if (Math.abs(diff) < 6) {
        reachedTarget = true;
        break;
      }
    }

    // Stop rotation
    this.deviceContext?.setLeftWheel(WHEEL_SPEED.STOP);
    this.deviceContext?.setRightWheel(WHEEL_SPEED.STOP);

    if (!reachedTarget) {
      this.log(`SCAN: rotation timeout - may not have reached exact 45°`, 'warn');
    }

    return false;
  }

  /**
   * Create a composite image from all scan captures arranged in a grid.
   * Each image is scaled down and arranged in a 4×2 grid with heading labels.
   * This gives the LLM a panoramic view of the entire 360° environment.
   */
  private async createScanCompositeImage(
    scanResults: Array<{ heading_degrees: number; imageDataUrl?: string }>
  ): Promise<string | null> {
    const withImages = scanResults.filter(r => r.imageDataUrl);
    if (withImages.length === 0) return null;

    const TILE_W = 128, TILE_H = 96;
    const COLS = 4, ROWS = Math.ceil(withImages.length / 4);
    const canvas = document.createElement('canvas');
    canvas.width = COLS * TILE_W;
    canvas.height = ROWS * TILE_H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // Fill background
    ctx.fillStyle = '#111111';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let i = 0; i < withImages.length && i < COLS * ROWS; i++) {
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      const x = col * TILE_W;
      const y = row * TILE_H;

      // Load and draw the scan image
      try {
        const img = new Image();
        img.src = withImages[i].imageDataUrl!;
        await new Promise<void>((resolve) => {
          img.onload = () => resolve();
          img.onerror = () => resolve();
        });
        ctx.drawImage(img, x, y, TILE_W, TILE_H);
      } catch {
        // Skip failed images
      }

      // Draw heading label overlay
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      ctx.fillRect(x, y, TILE_W, 16);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 11px monospace';
      ctx.fillText(`Step ${i + 1}: ${withImages[i].heading_degrees}°`, x + 3, y + 12);
    }

    return canvas.toDataURL('image/jpeg', 0.75);
  }

  /**
   * Inject 360-scan results into the LLM conversation history so the agent
   * can make an informed decision about where to go next
   */
  private injectScanResultsIntoHistory(scan: NonNullable<WorldModel['scanState']>): void {
    // Get current robot heading for relative instructions
    const currentSensors = this.deviceContext?.getSensors();
    const currentHeading = currentSensors
      ? Math.round((currentSensors.pose.rotation * 180) / Math.PI)
      : scan.scanResults[scan.scanResults.length - 1]?.heading_degrees || 0;

    let summary = '--- 360° ENVIRONMENT SCAN COMPLETE ---\n';
    summary += `A composite image of all ${scan.scanResults.length} scan directions is attached. Each tile shows a camera view at a different heading.\n`;
    summary += `Scanned ${scan.scanResults.length} directions (every 45°):\n\n`;

    for (const result of scan.scanResults) {
      const hasImage = result.imageDataUrl ? ' [IMAGE CAPTURED]' : '';
      summary += `  Heading ${result.heading_degrees}°: ${result.scene_description}${hasImage}\n`;
      if (result.detected_objects.length > 0) {
        summary += `    Objects: ${result.detected_objects.join(', ')}\n`;
      }
    }

    summary += `\nYour current heading is: ${currentHeading}°\n`;

    if (scan.targetDetected) {
      const targetHeading = scan.targetDetected.heading_degrees;
      const rotationNeeded = this.normalizeAngleDeg(targetHeading - currentHeading);
      const turnDir = rotationNeeded > 0 ? 'LEFT' : 'RIGHT';
      const turnAmount = Math.abs(Math.round(rotationNeeded));

      summary += `\n🎯 TARGET DETECTED: ${scan.targetDetected.description}\n`;
      summary += `\n=== ACTION PLAN ===\n`;
      summary += `1. ROTATE: Turn ${turnDir} ~${turnAmount}° to face heading ${targetHeading}°\n`;
      summary += `   (${turnDir === 'LEFT' ? 'left_wheel=backward, right_wheel=forward' : 'left_wheel=forward, right_wheel=backward'})\n`;
      summary += `2. MOVE: Drive FORWARD toward the target\n`;
      summary += `   (left_wheel=forward, right_wheel=forward)\n`;
      summary += `3. STOP: After moving, stop both wheels and take a new picture to reassess\n`;
      summary += `\nIMPORTANT: Execute steps in order. First rotate, then move forward, then stop.\n`;
    } else {
      summary += `\nNo target found in current position.\n`;
      summary += `\n=== ACTION PLAN ===\n`;
      summary += `1. MOVE: Drive forward to explore a new area (left_wheel=forward, right_wheel=forward)\n`;
      summary += `2. STOP: After moving ~50cm, stop both wheels\n`;
      summary += `3. The system will scan again automatically if needed\n`;
    }

    this.state.conversationHistory.push({
      role: 'user',
      content: summary,
    });

    this.log(`Injected scan results into conversation history`, 'info');
  }

  /**
   * Parse structured JSON response and update state
   */
  private parseStructuredResponse(response: string): void {
    try {
      // Try to extract JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        this.log('No JSON found in response', 'warn');
        return;
      }

      const parsed: StructuredResponse = JSON.parse(jsonMatch[0]);
      this.state.lastStructuredResponse = parsed;

      // NOTE: We no longer update currentStep from LLM's current_step.
      // The system controls the cycle state through handleAutomaticCycleProgression().
      // This prevents the LLM from getting the robot stuck in a single step.

      // Update world model from response
      if (parsed.world_model) {
        // Merge new world model data
        if (parsed.world_model.robot_position) {
          this.state.worldModel.robot_position = parsed.world_model.robot_position;
        }
        if (parsed.world_model.obstacles) {
          // Merge obstacles, avoiding duplicates
          const existingDirs = new Set(this.state.worldModel.obstacles.map(o => o.direction));
          for (const obs of parsed.world_model.obstacles) {
            if (existingDirs.has(obs.direction)) {
              // Update existing obstacle
              const idx = this.state.worldModel.obstacles.findIndex(o => o.direction === obs.direction);
              if (idx >= 0) this.state.worldModel.obstacles[idx] = obs;
            } else {
              this.state.worldModel.obstacles.push(obs);
            }
          }
        }
        if (parsed.world_model.explored_areas) {
          // Add new explored areas
          for (const area of parsed.world_model.explored_areas) {
            if (!this.state.worldModel.explored_areas.includes(area)) {
              this.state.worldModel.explored_areas.push(area);
            }
          }
        }
        if (parsed.world_model.unexplored_directions) {
          this.state.worldModel.unexplored_directions = parsed.world_model.unexplored_directions;
        }
      }

      // NOTE: We no longer update currentStep from LLM's next_step here.
      // The automatic cycle progression in handleAutomaticCycleProgression() is now
      // the authoritative source for cycle state transitions. This fixes the bug where
      // the robot got stuck if the LLM always returned "next_step": "STOP".
      // The LLM's next_step is logged for debugging but doesn't drive the state machine.
      this.log(`Parsed structured response: step=${parsed.current_step}, llm_next_step=${parsed.next_step}, action=${parsed.decision?.action_type}`, 'info');
    } catch (error: any) {
      this.log(`Failed to parse structured response: ${error.message}`, 'warn');
    }
  }

  /**
   * Create a fallback structured response
   */
  private createFallbackResponse(action: 'stop' | 'backup', reason: string): string {
    const fallback: StructuredResponse = {
      cycle: this.state.iteration,
      current_step: 'STOP',
      goal: this.config.goal || 'explore safely',
      world_model: this.state.worldModel,
      observation: null,
      decision: {
        reasoning: `Fallback action due to: ${reason}`,
        target_direction: action === 'backup' ? 'backward' : null,
        action_type: action,
      },
      wheel_commands: {
        left_wheel: action === 'backup' ? 'backward' : 'stop',
        right_wheel: action === 'backup' ? 'backward' : 'stop',
      },
      next_step: 'OBSERVE',
    };
    return JSON.stringify(fallback);
  }

  /**
   * Parse tool calls from LLM response (supports multiple formats)
   */
  private parseToolCalls(response: string): Array<{ tool: string; args: Record<string, any> }> {
    const calls: Array<{ tool: string; args: Record<string, any> }> = [];

    // Format 1: Simple [TOOL] format - e.g., "[TOOL] left_wheel forward"
    const simpleToolPattern = /\[TOOL\]\s+(take_picture|left_wheel|right_wheel)(?:\s+(forward|backward|stop))?/gi;
    let simpleMatch;
    while ((simpleMatch = simpleToolPattern.exec(response)) !== null) {
      const toolName = simpleMatch[1].toLowerCase();
      const direction = simpleMatch[2]?.toLowerCase();

      if (toolName === 'take_picture') {
        calls.push({ tool: 'take_picture', args: {} });
      } else if (toolName === 'left_wheel' || toolName === 'right_wheel') {
        calls.push({ tool: toolName, args: { direction: direction || 'stop' } });
      }
    }

    // If simple format found calls, return them
    if (calls.length > 0) {
      return calls;
    }

    // Format 2: Try to extract from structured response format
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);

        // Check for structured wheel_commands
        if (parsed.wheel_commands) {
          if (parsed.wheel_commands.left_wheel) {
            calls.push({
              tool: 'left_wheel',
              args: { direction: parsed.wheel_commands.left_wheel },
            });
          }
          if (parsed.wheel_commands.right_wheel) {
            calls.push({
              tool: 'right_wheel',
              args: { direction: parsed.wheel_commands.right_wheel },
            });
          }
        }

        // Check if decision says to observe (take picture)
        if (parsed.decision?.action_type === 'observe' || parsed.current_step === 'OBSERVE') {
          // Only add take_picture if no picture recently
          if (!this.state.lastPicture || Date.now() - this.state.lastPicture.timestamp > 1000) {
            calls.unshift({ tool: 'take_picture', args: {} });
          }
        }

        if (calls.length > 0) {
          return calls;
        }
      }
    } catch {
      // Fall through to legacy parsing
    }

    // Legacy format: Find all JSON objects with tool and args
    const jsonPattern = /\{[^{}]*"tool"\s*:\s*"([^"]+)"[^{}]*"args"\s*:\s*(\{[^{}]*\})[^{}]*\}/g;
    let match;

    while ((match = jsonPattern.exec(response)) !== null) {
      try {
        const fullMatch = match[0];
        const parsed = JSON.parse(fullMatch);
        if (parsed.tool && typeof parsed.args === 'object') {
          calls.push({ tool: parsed.tool, args: parsed.args });
        }
      } catch {
        // Try alternative parsing
        try {
          const toolName = match[1];
          const argsStr = match[2];
          const args = JSON.parse(argsStr);
          calls.push({ tool: toolName, args });
        } catch {
          // Ignore malformed JSON
        }
      }
    }

    // Also try simpler patterns
    if (calls.length === 0) {
      const simplePattern = /\{\s*"tool"\s*:\s*"([^"]+)"\s*,\s*"args"\s*:\s*\{([^}]*)\}\s*\}/g;
      while ((match = simplePattern.exec(response)) !== null) {
        try {
          const parsed = JSON.parse(match[0]);
          calls.push({ tool: parsed.tool, args: parsed.args });
        } catch {
          // Ignore
        }
      }
    }

    return calls;
  }

  /**
   * Emit diagnostic data for the current cycle.
   * Feeds the AgentDiagnosticsPanel with perception, decision, physics, and camera analysis.
   */
  private emitDiagnostics(
    sensors: SensorReadings,
    llmLatency: number,
    toolCalls: Array<{ tool: string; args: Record<string, any> }>
  ): void {
    try {
      const diag = useDiagnosticsStore.getState();
      const cycle = this.state.iteration;
      const goal = this.config.goal || 'explore safely';

      // ── PERCEPTION SNAPSHOT ──────────────────────────────────────────
      const sceneDesc = this.state.lastPicture?.scene || '';
      const recommendation = this.state.lastPicture?.recommendation || '';

      const perceptionSnapshot: PerceptionSnapshot = {
        cycle,
        timestamp: Date.now(),
        sensors: {
          front: sensors.distance.front,
          frontLeft: sensors.distance.frontLeft,
          frontRight: sensors.distance.frontRight,
          left: sensors.distance.left,
          right: sensors.distance.right,
          back: sensors.distance.back,
          backLeft: sensors.distance.backLeft,
          backRight: sensors.distance.backRight,
        },
        frontBlocked: sensors.distance.front < 40,
        leftBlocked: sensors.distance.left < 40,
        rightBlocked: sensors.distance.right < 40,
        backBlocked: sensors.distance.back < 40,
        pushableObjectsDetected: sensors.nearbyPushables?.length || 0,
        dockZonesDetected: sensors.nearbyDockZones?.length || 0,
        sceneDescription: sceneDesc,
        recommendation,
      };
      diag.addPerception(perceptionSnapshot);

      const perceptionAnalysis = analyzePerception(
        perceptionSnapshot.sensors,
        perceptionSnapshot.pushableObjectsDetected,
        perceptionSnapshot.dockZonesDetected,
        goal
      );
      diag.updateHealth({ perception: perceptionAnalysis.score });

      for (const issue of perceptionAnalysis.issues) {
        diag.addEvent({
          cycle,
          category: 'perception',
          severity: issue.includes('DANGER') ? 'critical' : issue.includes('not detected') ? 'warning' : 'info',
          title: 'Perception Issue',
          detail: issue,
        });
      }

      // ── DECISION SNAPSHOT ────────────────────────────────────────────
      const structured = this.state.lastStructuredResponse;
      const prevDecision = diag.decisionHistory[diag.decisionHistory.length - 1] || null;

      const wheelCmds = structured?.wheel_commands || { left_wheel: 'stop', right_wheel: 'stop' };
      const prevWheelCmds = prevDecision?.wheelCommands || { left: '', right: '' };
      const repeatsLast =
        wheelCmds.left_wheel === prevWheelCmds.left &&
        wheelCmds.right_wheel === prevWheelCmds.right;

      // Check if decision matches sensor recommendation
      const recLower = recommendation.toLowerCase();
      const targetDir = structured?.decision?.target_direction || null;
      let matchesSensorRec = true;
      if (recLower.includes('back up') && targetDir === 'forward') matchesSensorRec = false;
      if (recLower.includes('turn right') && targetDir === 'left') matchesSensorRec = false;
      if (recLower.includes('turn left') && targetDir === 'right') matchesSensorRec = false;

      const decisionSnapshot: DecisionSnapshot = {
        cycle,
        timestamp: Date.now(),
        reasoning: structured?.decision?.reasoning || '(no reasoning)',
        actionType: structured?.decision?.action_type || 'unknown',
        targetDirection: targetDir,
        wheelCommands: {
          left: wheelCmds.left_wheel,
          right: wheelCmds.right_wheel,
        },
        responseTimeMs: llmLatency,
        parsedSuccessfully: structured !== null,
        toolCallsExtracted: toolCalls.length,
        matchesSensorRecommendation: matchesSensorRec,
        repeatsLastAction: repeatsLast,
      };
      diag.addDecision(decisionSnapshot);

      const decisionAnalysis = analyzeDecision(decisionSnapshot, perceptionSnapshot, prevDecision);
      diag.updateHealth({ decisionQuality: decisionAnalysis.score });

      for (const issue of decisionAnalysis.issues) {
        diag.addEvent({
          cycle,
          category: 'decision',
          severity: issue.includes('FAILED') || issue.includes('collide')
            ? 'error'
            : issue.includes('slow') || issue.includes('stuck')
            ? 'warning'
            : 'info',
          title: 'Decision Issue',
          detail: issue,
        });
      }

      // ── PHYSICS SNAPSHOT ─────────────────────────────────────────────
      const prevPhysics = diag.physicsHistory[diag.physicsHistory.length - 1] || null;
      const pose = sensors.pose;
      const distanceMoved = prevPhysics
        ? Math.sqrt(
            (pose.x - prevPhysics.pose.x) ** 2 +
            (pose.y - prevPhysics.pose.y) ** 2
          )
        : 0;
      const rotationChanged = prevPhysics
        ? Math.abs(pose.rotation - prevPhysics.pose.rotation)
        : 0;

      // Check pushable objects
      const prevPushablePositions = prevPhysics?.pushableObjectsMoved; // just tracking the flag
      const objectsDockedNow = sensors.nearbyPushables?.filter(p => p.dockedIn).length || 0;

      const physicsSnapshot: PhysicsSnapshot = {
        cycle,
        timestamp: Date.now(),
        pose: { x: pose.x, y: pose.y, rotation: pose.rotation },
        velocity: {
          linear: this.state.worldModel.lastPosition
            ? distanceMoved / ((this.config.loopIntervalMs || 2000) / 1000)
            : 0,
          angular: rotationChanged / ((this.config.loopIntervalMs || 2000) / 1000),
        },
        distanceMoved,
        rotationChanged,
        frontBumper: sensors.bumper.front,
        backBumper: sensors.bumper.back,
        closestWallDistance: Math.min(
          sensors.distance.front,
          sensors.distance.left,
          sensors.distance.right,
          sensors.distance.back
        ),
        closestObstacleDistance: Math.min(
          sensors.distance.front,
          sensors.distance.frontLeft,
          sensors.distance.frontRight,
          sensors.distance.left,
          sensors.distance.right
        ),
        pushableObjectsMoved: false, // Will be set by next cycle comparison
        objectsInDockZones: objectsDockedNow,
      };
      diag.addPhysics(physicsSnapshot);

      const physicsAnalysis = analyzePhysics(physicsSnapshot, prevPhysics);
      const movementScore = distanceMoved > 0.01 ? 80 : distanceMoved > 0.005 ? 50 : 20;
      diag.updateHealth({ movement: Math.max(movementScore, physicsAnalysis.score) });

      for (const issue of physicsAnalysis.issues) {
        diag.addEvent({
          cycle,
          category: 'physics',
          severity: issue.includes('collision') || issue.includes('bumper') ? 'error' : 'warning',
          title: 'Physics Issue',
          detail: issue,
          data: { pose, distanceMoved },
        });
      }

      // ── CAMERA / PERSPECTIVE SNAPSHOT ────────────────────────────────
      const cameraAnalysis = analyzeCameraPerspective(
        perceptionSnapshot.sensors,
        goal,
        { x: pose.x, y: pose.y, rotation: pose.rotation },
        sensors.nearbyPushables?.map(p => ({
          distance: p.distance,
          angle: p.angle,
          dockedIn: p.dockedIn,
        })),
        sensors.nearbyDockZones?.map(d => ({
          distance: d.distance,
          angle: d.angle,
          hasObject: d.hasObject,
        }))
      );
      cameraAnalysis.cycle = cycle;
      diag.addCamera(cameraAnalysis);

      // ── REPRESENTATION ANALYSIS (once on first cycle) ────────────────
      if (cycle === 1) {
        // We don't have direct access to the map here, but we can infer from sensors
        const repIssues = analyzeRepresentation(
          4, // Assume standard 4-wall arena (boundary walls)
          0, // We can't detect exact obstacle count from sensors alone
          sensors.nearbyPushables?.length || 0,
          sensors.nearbyDockZones?.length || 0,
          { width: 5, height: 5 } // Default arena size
        );
        for (const issue of repIssues) {
          diag.addRepresentationIssue(issue);
        }
        for (const issue of repIssues) {
          diag.addEvent({
            cycle,
            category: 'representation',
            severity: 'info',
            title: 'Representation Note',
            detail: issue,
          });
        }
      }

      // ── STUCK DETECTION EVENT ────────────────────────────────────────
      const stuckCycles = diag.stuckCycles;
      if (stuckCycles >= 3) {
        diag.addEvent({
          cycle,
          category: 'stuck',
          severity: 'critical',
          title: `Robot stuck for ${stuckCycles} cycles`,
          detail: `Position: (${pose.x.toFixed(3)}, ${pose.y.toFixed(3)}), ` +
            `distance moved: ${distanceMoved.toFixed(4)}m. ` +
            `Front: ${sensors.distance.front}cm, Left: ${sensors.distance.left}cm, Right: ${sensors.distance.right}cm`,
          data: { stuckCycles, pose, distanceMoved },
        });
      }

      // ── GOAL PROGRESS ────────────────────────────────────────────────
      let goalProgress = 0;
      if (goal.toLowerCase().includes('dock') || goal.toLowerCase().includes('push')) {
        // Goal is to push object to dock
        if (objectsDockedNow > 0) {
          goalProgress = 100;
          diag.addEvent({
            cycle,
            category: 'navigation',
            severity: 'ok',
            title: 'GOAL ACHIEVED: Object docked!',
            detail: `${objectsDockedNow} object(s) in dock zone(s)`,
          });
        } else if (sensors.nearbyPushables && sensors.nearbyPushables.length > 0) {
          // Can see the pushable - partial progress
          const closest = sensors.nearbyPushables[0];
          goalProgress = closest.distance < 30 ? 60 : closest.distance < 100 ? 40 : 20;
        }
      } else if (goal.toLowerCase().includes('explore')) {
        // Exploration goal - based on area coverage
        const uniquePositions = diag.physicsHistory.length;
        goalProgress = Math.min(100, uniquePositions * 2);
      }
      diag.updateHealth({ goalProgress });

      // ── OVERALL CYCLE EVENT ──────────────────────────────────────────
      const overallSeverity: 'ok' | 'info' | 'warning' | 'error' =
        diag.health.overall >= 70 ? 'ok' :
        diag.health.overall >= 40 ? 'warning' : 'error';

      diag.addEvent({
        cycle,
        category: 'navigation',
        severity: overallSeverity,
        title: `Cycle ${cycle}: ${structured?.decision?.action_type || 'unknown'} -> ${targetDir || 'none'}`,
        detail: `Front: ${sensors.distance.front}cm | Moved: ${(distanceMoved * 100).toFixed(1)}cm | LLM: ${llmLatency}ms | Health: ${diag.health.overall}%`,
        data: {
          health: diag.health,
          wheelCommands: wheelCmds,
        },
      });
    } catch (e) {
      // Diagnostics should never crash the agent
      console.warn('[Diagnostics] Error emitting diagnostics:', e);
    }
  }

  private log(message: string, level: 'info' | 'warn' | 'error'): void {
    const prefix = `[ESP32Agent:${this.config.name}]`;
    if (level === 'error') {
      console.error(prefix, message);
    } else if (level === 'warn') {
      console.warn(prefix, message);
    } else {
      console.log(prefix, message);
    }

    if (this.config.onLog) {
      this.config.onLog(message, level);
    }
  }

  private emitStateChange(): void {
    if (this.config.onStateChange) {
      this.config.onStateChange({ ...this.state });
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// AGENT REGISTRY
// ═══════════════════════════════════════════════════════════════════════════

const activeAgents = new Map<string, ESP32AgentRuntime>();

export function createESP32Agent(config: ESP32AgentConfig): ESP32AgentRuntime {
  const agent = new ESP32AgentRuntime(config);
  activeAgents.set(config.id, agent);
  return agent;
}

export function getESP32Agent(id: string): ESP32AgentRuntime | undefined {
  return activeAgents.get(id);
}

export function stopESP32Agent(id: string): boolean {
  const agent = activeAgents.get(id);
  if (agent) {
    agent.stop();
    activeAgents.delete(id);
    return true;
  }
  return false;
}

export function listActiveESP32Agents(): string[] {
  return Array.from(activeAgents.keys());
}
