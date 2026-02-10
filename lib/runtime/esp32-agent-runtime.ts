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

export type BehaviorStep = 'OBSERVE' | 'ANALYZE' | 'PLAN' | 'ROTATE' | 'MOVE' | 'STOP';

export interface WorldModelObstacle {
  direction: 'front' | 'left' | 'right' | 'back';
  distance_cm: number;
  type: 'wall' | 'object' | 'unknown';
}

export interface WorldModel {
  robot_position: { x: number; y: number; rotation: number };
  obstacles: WorldModelObstacle[];
  explored_areas: string[];
  unexplored_directions: string[];
  // Known objects with absolute world positions (updated each cycle from sensors)
  known_objects: Array<{
    id: string;
    label: string;
    world_x: number;
    world_y: number;
    last_seen_cycle: number;
  }>;
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

## BEHAVIOR CYCLE (System-Controlled)
The system controls which step you are on. Each message tells you the current step. Follow it:

1. **OBSERVE** → Describe what you see in the camera image. Identify the red cube, green dock, walls, obstacles. Wheels are stopped (this is expected).
2. **PLAN** → Based on your observation, decide your next move. Explain your reasoning. Wheels remain stopped (this is expected during planning).
3. **MOVE** → Execute your plan NOW. You MUST output wheel_commands that physically move the robot (forward, backward, or rotate). NEVER output "stop" for both wheels during MOVE.
4. **STOP** → The system stops the wheels automatically. Assess whether your last move made progress.

The system advances steps automatically: OBSERVE → PLAN → MOVE → STOP → OBSERVE → ...
You do NOT need to set next_step - it is handled for you.

## PUSHING STRATEGY
1. First, navigate TO the red cube
2. Position yourself on the OPPOSITE side of the cube from the green dock
3. Drive FORWARD to push the cube toward the green dock
4. The dock is in a corner of the arena - look for the bright green zone with corner markers

## REQUIRED: Structured JSON Response
EVERY response MUST be valid JSON with this EXACT structure:

{
  "cycle": <number>,
  "current_step": "<OBSERVE|PLAN|MOVE|STOP>",
  "goal": "<your goal>",
  "observation": {
    "scene_description": "<describe what you SEE in the camera image>",
    "red_cube_visible": <boolean>,
    "red_cube_direction": "<left|center|right|not_visible>",
    "green_dock_visible": <boolean>,
    "obstacles_ahead": <boolean>
  },
  "decision": {
    "reasoning": "<why this action based on what you SEE>",
    "target_direction": "<forward|left|right|backward|null>",
    "action_type": "<observe|rotate|move|stop|backup>"
  },
  "wheel_commands": {
    "left_wheel": "<forward|backward|stop>",
    "right_wheel": "<forward|backward|stop>"
  }
}

**Step-specific wheel_commands rules:**
- OBSERVE step: wheel_commands should be "stop"/"stop" (you are observing)
- PLAN step: wheel_commands should be "stop"/"stop" (you are planning)
- MOVE step: wheel_commands MUST move the robot - NEVER "stop"/"stop"
- STOP step: wheel_commands should be "stop"/"stop" (system handles this)

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
  private previousPosition: { x: number; y: number } | null = null;
  private previousHeading: number | null = null;
  private stuckCycleCount = 0;
  private rotationOnlyCount = 0; // Tracks cycles where heading changes but position doesn't
  private lastEffectiveStep: BehaviorStep = 'OBSERVE'; // The effective step used in the last LLM call

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
        known_objects: [],
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
    this.stuckCycleCount = 0;
    this.rotationOnlyCount = 0;
    this.previousPosition = null;
    this.previousHeading = null;
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
   * Execute a controlled rotation of approximately the given degrees.
   * Polls heading sensor and stops once the target angle is reached.
   * Returns the actual degrees rotated.
   */
  private async executeControlledRotation(
    targetDegrees: number,
    direction: 'left' | 'right'
  ): Promise<number> {
    if (!this.deviceContext) return 0;

    const POLL_MS = 50;
    const TIMEOUT_MS = 2000;
    const TOLERANCE_RAD = 0.087; // ~5 degrees
    const targetRad = (Math.abs(targetDegrees) * Math.PI) / 180;

    const startSensors = this.deviceContext.getSensors();
    const startHeading = startSensors.pose.rotation;

    // Set rotation wheels
    const leftPower = direction === 'left' ? WHEEL_SPEED.BACKWARD : WHEEL_SPEED.FORWARD;
    const rightPower = direction === 'left' ? WHEEL_SPEED.FORWARD : WHEEL_SPEED.BACKWARD;
    this.deviceContext.setLeftWheel(leftPower);
    this.deviceContext.setRightWheel(rightPower);

    const startTime = Date.now();
    let rotatedRad = 0;

    while (Date.now() - startTime < TIMEOUT_MS) {
      await new Promise(resolve => setTimeout(resolve, POLL_MS));
      if (!this.deviceContext || !this.state.running) break;

      const currentSensors = this.deviceContext.getSensors();
      const currentHeading = currentSensors.pose.rotation;
      let delta = Math.abs(currentHeading - startHeading);
      if (delta > Math.PI) delta = 2 * Math.PI - delta;
      rotatedRad = delta;

      if (rotatedRad >= targetRad - TOLERANCE_RAD) {
        break; // Reached target
      }
    }

    // Stop wheels after rotation
    this.deviceContext.setLeftWheel(0);
    this.deviceContext.setRightWheel(0);

    const actualDegrees = (rotatedRad * 180) / Math.PI;
    this.log(`Controlled rotation: ${direction} ${actualDegrees.toFixed(1)}° (target: ${targetDegrees}°)`, 'info');
    return actualDegrees;
  }

  /**
   * Execute a forward drive pulse for a given duration.
   * Drives both wheels forward then stops. Ensures the robot makes
   * linear progress after rotation instead of just spinning in place.
   */
  private async executeForwardPulse(durationMs: number = 500): Promise<void> {
    if (!this.deviceContext) return;

    this.deviceContext.setLeftWheel(WHEEL_SPEED.FORWARD);
    this.deviceContext.setRightWheel(WHEEL_SPEED.FORWARD);

    await new Promise(resolve => setTimeout(resolve, durationMs));

    if (this.deviceContext) {
      this.deviceContext.setLeftWheel(0);
      this.deviceContext.setRightWheel(0);
    }

    this.log(`Forward pulse: ${durationMs}ms`, 'info');
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
      // STEP 0: Stop wheels from previous cycle before reading sensors
      // This ensures stable sensor readings and prevents uncontrolled continuous rotation
      this.deviceContext.setLeftWheel(0);
      this.deviceContext.setRightWheel(0);

      // STEP 1: Read sensors
      const sensors = this.deviceContext.getSensors();
      this.state.lastSensorReading = sensors;

      // STEP 1.1: Stuck detection - check if robot position OR heading has changed
      const currentPos = { x: sensors.pose.x, y: sensors.pose.y };
      const currentHeading = sensors.pose.rotation; // radians
      if (this.previousPosition) {
        const distFromLast = Math.sqrt(
          (currentPos.x - this.previousPosition.x) ** 2 +
          (currentPos.y - this.previousPosition.y) ** 2
        );
        // Check if heading changed significantly (>10 degrees = ~0.17 rad)
        let headingChanged = false;
        if (this.previousHeading !== null) {
          const headingDelta = Math.abs(currentHeading - this.previousHeading);
          // Normalize for wrapping (e.g. -179° to 179°)
          const normalizedDelta = headingDelta > Math.PI ? (2 * Math.PI - headingDelta) : headingDelta;
          headingChanged = normalizedDelta > 0.17; // ~10 degrees
        }
        const positionUnchanged = distFromLast < 0.01;
        if (positionUnchanged && !headingChanged) {
          // Truly stuck: no position AND no heading change
          this.stuckCycleCount++;
        } else {
          this.stuckCycleCount = 0;
        }
        // Track rotation-only stuck: heading changes but position doesn't move
        if (positionUnchanged && headingChanged) {
          this.rotationOnlyCount++;
        } else if (!positionUnchanged) {
          this.rotationOnlyCount = 0;
        }
      }
      this.previousPosition = currentPos;
      this.previousHeading = currentHeading;

      // If stuck for too long, clear conversation history to break the pattern
      if ((this.stuckCycleCount >= 5 || this.rotationOnlyCount >= 4) && this.state.conversationHistory.length > 2) {
        const reason = this.stuckCycleCount >= 5 ? 'fully stuck' : 'rotation-only stuck';
        this.log(`${reason} for ${Math.max(this.stuckCycleCount, this.rotationOnlyCount)} cycles - clearing conversation history to break pattern`, 'warn');
        this.state.conversationHistory = [];
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
      let toolCalls = this.parseToolCalls(llmResponse);

      // STEP 3.0: MOVE-step wheel validation
      // During MOVE step, the LLM MUST output movement commands. If it outputs stop, override with forward.
      // During OBSERVE/PLAN/STOP steps, stop is expected and acceptable.
      if (this.lastEffectiveStep === 'MOVE') {
        const wheelCalls = toolCalls.filter(tc => tc.tool === 'left_wheel' || tc.tool === 'right_wheel');
        const allStop = wheelCalls.length === 0 || wheelCalls.every(tc => tc.args.direction === 'stop');
        if (allStop) {
          this.log(`MOVE step but LLM output stop - overriding with forward`, 'warn');
          toolCalls = toolCalls.filter(tc => tc.tool !== 'left_wheel' && tc.tool !== 'right_wheel');
          toolCalls.push(
            { tool: 'left_wheel', args: { direction: 'forward' } },
            { tool: 'right_wheel', args: { direction: 'forward' } },
          );
        }
      }

      // STEP 3.1: Force a controlled 45° rotation if robot is truly stuck and LLM returned stop commands
      let controlledRotationDone = false;
      if (this.stuckCycleCount >= 3) {
        const wheelCalls = toolCalls.filter(tc => tc.tool === 'left_wheel' || tc.tool === 'right_wheel');
        const allStop = wheelCalls.length === 0 || wheelCalls.every(tc => tc.args.direction === 'stop');
        if (allStop) {
          this.log(`Stuck for ${this.stuckCycleCount} cycles with stop commands - forcing controlled 45° rotation + forward pulse`, 'warn');
          const rotateLeft = (this.stuckCycleCount % 6) < 3;
          await this.executeControlledRotation(45, rotateLeft ? 'left' : 'right');
          await this.executeForwardPulse(500);
          controlledRotationDone = true;
          // Record forced rotation + forward in tool calls for history
          toolCalls = [
            { tool: 'left_wheel', args: { direction: 'forward' } },
            { tool: 'right_wheel', args: { direction: 'forward' } },
          ];
        }
      }

      // STEP 3.1b: Force forward movement if robot is only rotating without positional progress
      if (!controlledRotationDone && this.rotationOnlyCount >= 2) {
        const wheelCalls = toolCalls.filter(tc => tc.tool === 'left_wheel' || tc.tool === 'right_wheel');
        const isRotationCommand = wheelCalls.length >= 2 &&
          wheelCalls.some(tc => tc.args.direction === 'forward') &&
          wheelCalls.some(tc => tc.args.direction === 'backward');
        const allStop = wheelCalls.length === 0 || wheelCalls.every(tc => tc.args.direction === 'stop');

        if (isRotationCommand || allStop) {
          this.log(`Rotation-only stuck for ${this.rotationOnlyCount} cycles - forcing forward movement`, 'warn');
          await this.executeForwardPulse(600);
          controlledRotationDone = true;
          toolCalls = [
            { tool: 'left_wheel', args: { direction: 'forward' } },
            { tool: 'right_wheel', args: { direction: 'forward' } },
          ];
        }
      }

      // STEP 3.2: Detect rotation commands and use controlled rotation instead of raw wheel spinning
      const leftCall = toolCalls.find(tc => tc.tool === 'left_wheel');
      const rightCall = toolCalls.find(tc => tc.tool === 'right_wheel');
      const isRotation = leftCall && rightCall &&
        ((leftCall.args.direction === 'backward' && rightCall.args.direction === 'forward') ||
         (leftCall.args.direction === 'forward' && rightCall.args.direction === 'backward'));

      if (isRotation && !controlledRotationDone) {
        // Use controlled rotation instead of raw wheel commands
        const direction = leftCall.args.direction === 'backward' ? 'left' : 'right';

        // Adaptive rotation: use smaller angle when target is nearby in a similar direction
        let rotationAngle = 45; // default
        const nearestTarget = sensors.nearbyPushables?.[0] || sensors.nearbyDockZones?.[0];
        if (nearestTarget) {
          const absAngle = Math.abs(nearestTarget.angle);
          if (absAngle <= 20) {
            rotationAngle = 15; // Small correction when target is nearly ahead
          } else if (absAngle <= 45) {
            rotationAngle = 30; // Medium rotation for moderate angles
          }
        }

        await this.executeControlledRotation(rotationAngle, direction);
        // After rotation, drive forward briefly to ensure the robot makes positional progress
        await this.executeForwardPulse(400);
        controlledRotationDone = true;
      }

      this.state.lastToolCalls = [];

      for (const { tool, args } of toolCalls) {
        // Skip raw wheel execution if we already did a controlled rotation
        if (controlledRotationDone && (tool === 'left_wheel' || tool === 'right_wheel')) {
          // Record the command but don't execute it (already done via controlled rotation)
          const power = tool === 'left_wheel'
            ? getWheelPower(args.direction)
            : getWheelPower(args.direction);
          this.state.lastToolCalls.push({
            tool,
            args,
            result: { success: true, data: { wheel: tool === 'left_wheel' ? 'left' : 'right', direction: args.direction, power } },
          });
          this.state.stats.totalToolCalls++;
          this.log(`Tool ${tool} (controlled rotation): ${args.direction}`, 'info');
          continue;
        }

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

      // ═══════════════════════════════════════════════════════════════════
      // DIAGNOSTIC INSTRUMENTATION
      // ═══════════════════════════════════════════════════════════════════
      this.emitDiagnostics(sensors, llmLatency, toolCalls);

      // Advance to next step in the cycle: OBSERVE → PLAN → MOVE → STOP → OBSERVE
      this.advanceStep();

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
    const headingDeg = Math.round((sensors.pose.rotation * 180) / Math.PI);
    const robotX = sensors.pose.x;
    const robotY = sensors.pose.y;

    // ── Update world model from actual sensor data ──
    this.state.worldModel.robot_position = {
      x: Number(robotX.toFixed(3)),
      y: Number(robotY.toFixed(3)),
      rotation: headingDeg,
    };

    // Convert detected objects to world coordinates and update known_objects
    const allDetected: Array<{ id: string; label: string; distance: number; angle: number; color: string; docked_in?: string | null }> = [];
    for (const p of sensors.nearbyPushables || []) {
      allDetected.push({ id: p.id, label: p.label, distance: p.distance, angle: p.angle, color: p.color, docked_in: p.dockedIn || null });
    }
    for (const d of sensors.nearbyDockZones || []) {
      allDetected.push({ id: d.id, label: d.label, distance: d.distance, angle: d.angle, color: d.color });
    }

    for (const obj of allDetected) {
      const objWorldAngleRad = sensors.pose.rotation + (obj.angle * Math.PI) / 180;
      const distM = obj.distance / 100;
      const worldX = Number((robotX + Math.cos(objWorldAngleRad) * distM).toFixed(3));
      const worldY = Number((robotY + Math.sin(objWorldAngleRad) * distM).toFixed(3));
      const existing = this.state.worldModel.known_objects.find(o => o.id === obj.id);
      if (existing) {
        existing.world_x = worldX;
        existing.world_y = worldY;
        existing.last_seen_cycle = this.state.iteration;
      } else {
        this.state.worldModel.known_objects.push({
          id: obj.id, label: obj.label, world_x: worldX, world_y: worldY, last_seen_cycle: this.state.iteration,
        });
      }
    }

    // ── Build sensor context with world model ──
    const sensorContext: Record<string, any> = {
      cycle: this.state.iteration,
      current_step: this.state.currentStep,
      goal: this.config.goal || 'explore safely',
      has_camera_image: !!this.state.lastPicture?.imageDataUrl,
      robot: {
        x: Number(robotX.toFixed(3)),
        y: Number(robotY.toFixed(3)),
        heading_degrees: headingDeg,
      },
    };

    // Nearby objects with both relative AND absolute positions
    if (allDetected.length > 0) {
      sensorContext.nearby_objects = allDetected.map(obj => {
        const known = this.state.worldModel.known_objects.find(o => o.id === obj.id);
        return {
          id: obj.id,
          label: obj.label,
          relative_distance_cm: obj.distance,
          relative_angle_degrees: obj.angle,
          world_x: known?.world_x,
          world_y: known?.world_y,
          ...(('docked_in' in obj) ? { docked_in: obj.docked_in } : {}),
        };
      });
    }

    // All known objects in world (including from previous scans)
    if (this.state.worldModel.known_objects.length > 0) {
      sensorContext.world_model = {
        known_objects: this.state.worldModel.known_objects.map(o => ({
          id: o.id, label: o.label, world_x: o.world_x, world_y: o.world_y,
          last_seen_cycle: o.last_seen_cycle,
        })),
      };
    }

    // System-controlled step: use current step directly (advanced by advanceStep() at end of loop)
    // Override to MOVE when stuck, so the system forces movement
    let effectiveStep = this.state.currentStep;
    if (this.stuckCycleCount >= 3 || this.rotationOnlyCount >= 2) {
      effectiveStep = 'MOVE'; // Force MOVE step when stuck - robot must physically move
    }
    this.lastEffectiveStep = effectiveStep; // Store for runLoop() to use

    // Step-specific instructions that match the cycle expectations
    let stepInstruction = '';
    switch (effectiveStep) {
      case 'OBSERVE':
        stepInstruction = `You are OBSERVING. Look at the camera image carefully. Describe what you see: the red cube, green dock, walls, obstacles. Set wheel_commands to "stop"/"stop" (you are just observing). Focus on building situational awareness.`;
        break;
      case 'PLAN':
        stepInstruction = `You are PLANNING. Based on your latest observation, decide what movement to make next. Explain your reasoning in decision.reasoning. Set wheel_commands to "stop"/"stop" (you are just planning). Think about: Where is the red cube? Where is the dock? What direction should you move?`;
        break;
      case 'MOVE':
        stepInstruction = `You are EXECUTING movement. Output wheel_commands that physically move the robot NOW.
CRITICAL: You MUST set wheel_commands to move - NEVER "stop"/"stop" during MOVE step.
- If target is ahead (relative_angle between -20 and 20): "left_wheel": "forward", "right_wheel": "forward"
- If target is to the left (relative_angle < -20): "left_wheel": "backward", "right_wheel": "forward" (rotate left)
- If target is to the right (relative_angle > 20): "left_wheel": "forward", "right_wheel": "backward" (rotate right)
- If unsure, default to "forward"/"forward"`;
        break;
      case 'STOP':
        stepInstruction = `Wheels are being stopped by the system. Assess whether your last movement made progress. Set wheel_commands to "stop"/"stop".`;
        break;
      default:
        stepInstruction = `Output wheel_commands based on what you see.`;
    }

    let userPrompt = `CYCLE ${this.state.iteration} | Step: ${effectiveStep}
${JSON.stringify(sensorContext, null, 2)}

${stepInstruction}
Respond with ONLY valid JSON.`;

    // Add stuck warning when robot hasn't moved
    if (this.stuckCycleCount >= 3) {
      userPrompt += `\n\n⚠️ STUCK ALERT: You have NOT MOVED for ${this.stuckCycleCount} consecutive cycles!`;
      userPrompt += `\nYou are in MOVE step. You MUST output movement commands NOW.`;
      userPrompt += `\nDefault: "left_wheel": "forward", "right_wheel": "forward"`;
    }

    // Add rotation-only stuck warning
    if (this.rotationOnlyCount >= 2) {
      userPrompt += `\n\n⚠️ ROTATION-ONLY ALERT: You have been ONLY ROTATING for ${this.rotationOnlyCount} cycles without moving forward!`;
      userPrompt += `\nYou MUST drive FORWARD: "left_wheel": "forward", "right_wheel": "forward".`;
    }

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

      // Note: step advancement is now system-controlled via advanceStep().
      // The LLM's next_step field is parsed for diagnostics but does NOT control advancement.

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

      this.log(`Parsed structured response: step=${parsed.current_step}, next_step=${parsed.next_step}, action=${parsed.decision?.action_type}`, 'info');
    } catch (error: any) {
      this.log(`Failed to parse structured response: ${error.message}`, 'warn');
    }
  }

  /**
   * Advance the behavior step deterministically: OBSERVE → PLAN → MOVE → STOP → OBSERVE
   * The system controls step advancement, not the LLM.
   */
  private advanceStep(): void {
    const cycle: BehaviorStep[] = ['OBSERVE', 'PLAN', 'MOVE', 'STOP'];
    const currentIdx = cycle.indexOf(this.state.currentStep);
    if (currentIdx >= 0) {
      this.state.currentStep = cycle[(currentIdx + 1) % cycle.length];
    } else {
      // If current step is not in the 4-step cycle (e.g. ANALYZE, ROTATE from old cycle),
      // reset to OBSERVE
      this.state.currentStep = 'OBSERVE';
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
          linear: prevPhysics
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

      // ── CAMERA IMAGE UPDATE ──────────────────────────────────────────
      if (this.state.lastPicture?.imageDataUrl) {
        diag.updateCameraImage(this.state.lastPicture.imageDataUrl);
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
