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
}

export interface CameraAnalysis {
  timestamp: number;
  scene: string;
  obstacles: {
    front: boolean;
    left: boolean;
    right: boolean;
    frontDistance: number;
  };
  recommendation: string;
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
 * Helper: Describe the scene from sensor readings
 */
function describeScene(front: number, left: number, right: number): string {
  const parts: string[] = [];

  if (front > 100) {
    parts.push('Clear path ahead');
  } else if (front > 50) {
    parts.push(`Obstacle ahead at ~${Math.round(front)}cm`);
  } else {
    parts.push(`Close obstacle ahead at ~${Math.round(front)}cm`);
  }

  if (left < 40) {
    parts.push('obstacle on left');
  } else {
    parts.push('left side clear');
  }

  if (right < 40) {
    parts.push('obstacle on right');
  } else {
    parts.push('right side clear');
  }

  return parts.join(', ');
}

/**
 * Helper: Suggest direction based on sensors
 */
function suggestDirection(front: number, left: number, right: number): string {
  // CRITICAL: Check for dangerous proximity FIRST - must back up before turning
  if (front < 20) {
    return 'DANGER: Too close to obstacle! Back up immediately, then turn';
  }

  // If close but not critical, suggest backing up first
  if (front < 40) {
    if (right > left && right > 50) {
      return 'Obstacle close ahead - back up slightly, then turn right';
    }
    if (left > right && left > 50) {
      return 'Obstacle close ahead - back up slightly, then turn left';
    }
    return 'Obstacle close ahead - back up first to get room to turn';
  }

  // Path is clear - go forward
  if (front > 80) {
    return 'Path ahead is clear - go forward';
  }

  // Moderate distance (40-80cm) - can turn safely without backing up
  if (left > right && left > 50) {
    return 'Turn left - more space on the left side';
  }

  if (right > left && right > 50) {
    return 'Turn right - more space on the right side';
  }

  return 'Limited space - turn slowly to find open path';
}

/**
 * Simple Device Tools - Just 3 tools for basic planning and control
 */
export const DEVICE_TOOLS: DeviceTool[] = [
  {
    name: 'take_picture',
    description: 'Take a picture with the camera to see the environment. Returns what the robot sees ahead, to the left, and to the right. Use this before planning your next move.',
    parameters: {},
    execute: async (args, ctx) => {
      const sensors = ctx.getSensors();
      const frontDist = sensors.distance.front;
      const leftDist = sensors.distance.left;
      const rightDist = sensors.distance.right;

      const analysis: CameraAnalysis = {
        timestamp: Date.now(),
        scene: describeScene(frontDist, leftDist, rightDist),
        obstacles: {
          front: frontDist < 50,
          left: leftDist < 40,
          right: rightDist < 40,
          frontDistance: frontDist,
        },
        recommendation: suggestDirection(frontDist, leftDist, rightDist),
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
  simple: `You are a structured autonomous robot with a camera and two wheels.

## Your Tools
1. **take_picture** - See environment (call during OBSERVE step)
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

## STRICT BEHAVIOR CYCLE
Follow this cycle EXACTLY:
1. **OBSERVE** → Call take_picture to see environment
2. **ANALYZE** → Update world_model with new obstacle/position data
3. **PLAN** → Choose direction based on obstacles and GOAL
4. **ROTATE** → Turn to face target direction (if needed)
5. **MOVE** → Go forward (if path clear)
6. **STOP** → Halt wheels, return to step 1

## Obstacle Avoidance Rules (PRIORITY)
1. **< 20cm**: DANGER! Backup immediately
2. **20-40cm**: Stop and rotate away
3. **40-80cm**: Safe to rotate
4. **> 80cm**: Clear, can move forward

## REQUIRED: Structured JSON Response
EVERY response MUST be valid JSON with this EXACT structure:

{
  "cycle": <number>,
  "current_step": "<OBSERVE|ANALYZE|PLAN|ROTATE|MOVE|STOP>",
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
    "scene_description": "<what you see>"
  },
  "decision": {
    "reasoning": "<why this action>",
    "target_direction": "<forward|left|right|backward|null>",
    "action_type": "<observe|rotate|move|stop|backup>"
  },
  "wheel_commands": {
    "left_wheel": "<forward|backward|stop>",
    "right_wheel": "<forward|backward|stop>"
  },
  "next_step": "<next step in cycle>"
}

## LEARNING FROM PREVIOUS ACTIONS
**CRITICAL: Analyze your conversation history before deciding!**
- If the last movement resulted in a COLLISION or getting TOO CLOSE to an obstacle → you MUST choose a DIFFERENT direction
- If the last decision led to the same sensor readings (no progress) → TRY A DIFFERENT approach
- If you have been rotating in the same direction multiple times → try the OPPOSITE rotation
- If backing up didn't help → try rotating first, THEN backing up
- Compare current sensor data with previous readings to detect if you're stuck in a loop
- NEVER repeat the exact same wheel_commands if they failed to make progress

## CRITICAL RULES
1. Output ONLY valid JSON - no extra text before or after
2. Update world_model EVERY cycle with new information
3. Safety first - backup when < 20cm from obstacle
4. Build internal map of arena over time
5. Consider GOAL when planning direction
6. LEARN from failures - if an action didn't work, DO SOMETHING DIFFERENT`,
};

// Backwards compatibility - these now all point to the same simple behavior
export const BEHAVIOR_TO_MAP: Record<string, string> = {
  simple: 'standard5x5Empty',
};

export const BEHAVIOR_DESCRIPTIONS: Record<string, { name: string; description: string; mapName: string }> = {
  simple: {
    name: 'Simple Explorer',
    description: 'Basic look-think-move behavior with 3 simple tools',
    mapName: '5m × 5m Empty',
  },
};

export function getAgentPrompt(behaviorId: string): string {
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

      // CRITICAL: Always sync world model position from actual sensor data
      // This ensures the robot's position is always accurate, not dependent on LLM parsing
      this.syncWorldModelFromSensors(sensors);

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

      // FALLBACK: If no wheel commands from LLM, use sensor-based reactive behavior
      const hasWheelCommand = toolCalls.some(
        (c) => c.tool === 'left_wheel' || c.tool === 'right_wheel'
      );
      if (!hasWheelCommand) {
        this.log('No wheel commands from LLM, using sensor-based fallback', 'warn');
        const fallbackCalls = this.getSensorBasedFallbackCommands(sensors);
        toolCalls = [...toolCalls, ...fallbackCalls];
      }

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
    const sensorContext = {
      cycle: this.state.iteration,
      current_step: this.state.currentStep,
      sensor_data: {
        front_distance_cm: Math.round(sensors.distance.front),
        left_distance_cm: Math.round(sensors.distance.left),
        right_distance_cm: Math.round(sensors.distance.right),
        back_distance_cm: Math.round(sensors.distance.back),
        robot_pose: sensors.pose,
      },
      last_observation: this.state.lastPicture ? {
        scene: this.state.lastPicture.scene,
        recommendation: this.state.lastPicture.recommendation,
        front_distance: this.state.lastPicture.obstacles.frontDistance,
      } : null,
      current_world_model: this.state.worldModel,
      goal: this.config.goal || 'explore safely',
    };

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

    // Call the LLM API with conversation history
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

      // Update current step
      if (parsed.current_step) {
        this.state.currentStep = parsed.current_step;
      }

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

      // Determine next step in cycle
      if (parsed.next_step) {
        const nextStepMap: Record<string, BehaviorStep> = {
          'OBSERVE': 'OBSERVE',
          'ANALYZE': 'ANALYZE',
          'PLAN': 'PLAN',
          'ROTATE': 'ROTATE',
          'MOVE': 'MOVE',
          'STOP': 'STOP',
        };
        const nextStep = nextStepMap[parsed.next_step.toUpperCase()];
        if (nextStep) {
          this.state.currentStep = nextStep;
        }
      }

      this.log(`Parsed structured response: step=${parsed.current_step}, action=${parsed.decision?.action_type}`, 'info');
    } catch (error: any) {
      this.log(`Failed to parse structured response: ${error.message}`, 'warn');
      // When JSON parsing fails, advance the step automatically to prevent getting stuck
      this.advanceStepAutomatically();
    }
  }

  /**
   * Sync world model from actual sensor data - ensures position is always accurate
   */
  private syncWorldModelFromSensors(sensors: SensorReadings): void {
    // Update position from actual sensor pose (source of truth)
    const newPos = sensors.pose;
    const oldPos = this.state.worldModel.robot_position;

    // Check if robot has moved significantly (> 0.1 units)
    const hasMoved =
      Math.abs(newPos.x - oldPos.x) > 0.1 ||
      Math.abs(newPos.y - oldPos.y) > 0.1 ||
      Math.abs(newPos.rotation - oldPos.rotation) > 5;

    // Always update position from sensors
    this.state.worldModel.robot_position = {
      x: newPos.x,
      y: newPos.y,
      rotation: newPos.rotation,
    };

    // Automatically track explored areas based on actual position
    if (hasMoved) {
      this.trackExploredArea(newPos);
    }

    // Update obstacles from current sensor readings
    this.updateObstaclesFromSensors(sensors);

    // Update unexplored directions based on sensor readings
    this.updateUnexploredDirections(sensors);
  }

  /**
   * Track explored areas automatically based on robot position
   */
  private trackExploredArea(pose: { x: number; y: number; rotation: number }): void {
    // Grid-based exploration tracking (0.5 unit cells)
    const gridX = Math.round(pose.x * 2) / 2;
    const gridY = Math.round(pose.y * 2) / 2;
    const areaKey = `position(${gridX.toFixed(1)},${gridY.toFixed(1)})`;

    if (!this.state.worldModel.explored_areas.includes(areaKey)) {
      this.state.worldModel.explored_areas.push(areaKey);
      // Keep only last 50 explored areas to prevent memory bloat
      if (this.state.worldModel.explored_areas.length > 50) {
        this.state.worldModel.explored_areas = this.state.worldModel.explored_areas.slice(-50);
      }
    }
  }

  /**
   * Update obstacles from current sensor readings
   */
  private updateObstaclesFromSensors(sensors: SensorReadings): void {
    const OBSTACLE_THRESHOLD_CM = 80; // Consider something an obstacle if closer than this
    const obstacles: WorldModelObstacle[] = [];

    if (sensors.distance.front < OBSTACLE_THRESHOLD_CM) {
      obstacles.push({
        direction: 'front',
        distance_cm: Math.round(sensors.distance.front),
        type: sensors.distance.front < 30 ? 'wall' : 'object',
      });
    }
    if (sensors.distance.left < OBSTACLE_THRESHOLD_CM) {
      obstacles.push({
        direction: 'left',
        distance_cm: Math.round(sensors.distance.left),
        type: sensors.distance.left < 30 ? 'wall' : 'object',
      });
    }
    if (sensors.distance.right < OBSTACLE_THRESHOLD_CM) {
      obstacles.push({
        direction: 'right',
        distance_cm: Math.round(sensors.distance.right),
        type: sensors.distance.right < 30 ? 'wall' : 'object',
      });
    }
    if (sensors.distance.back < OBSTACLE_THRESHOLD_CM) {
      obstacles.push({
        direction: 'back',
        distance_cm: Math.round(sensors.distance.back),
        type: sensors.distance.back < 30 ? 'wall' : 'object',
      });
    }

    this.state.worldModel.obstacles = obstacles;
  }

  /**
   * Update unexplored directions based on sensor readings
   */
  private updateUnexploredDirections(sensors: SensorReadings): void {
    const unexplored: string[] = [];
    const CLEAR_THRESHOLD_CM = 100; // Direction is explorable if > 100cm clear

    if (sensors.distance.front > CLEAR_THRESHOLD_CM) unexplored.push('front');
    if (sensors.distance.left > CLEAR_THRESHOLD_CM) unexplored.push('left');
    if (sensors.distance.right > CLEAR_THRESHOLD_CM) unexplored.push('right');
    if (sensors.distance.back > CLEAR_THRESHOLD_CM) unexplored.push('back');

    // If all directions are blocked, keep them all as options
    if (unexplored.length === 0) {
      unexplored.push('front', 'left', 'right', 'back');
    }

    this.state.worldModel.unexplored_directions = unexplored;
  }

  /**
   * Advance the behavior step automatically when LLM parsing fails
   * This prevents the robot from getting stuck in one step
   */
  private advanceStepAutomatically(): void {
    const stepOrder: BehaviorStep[] = ['OBSERVE', 'ANALYZE', 'PLAN', 'ROTATE', 'MOVE', 'STOP'];
    const currentIdx = stepOrder.indexOf(this.state.currentStep);
    const nextIdx = (currentIdx + 1) % stepOrder.length;
    const nextStep = stepOrder[nextIdx];

    this.log(`Auto-advancing step: ${this.state.currentStep} -> ${nextStep}`, 'info');
    this.state.currentStep = nextStep;
  }

  /**
   * Generate sensor-based fallback wheel commands when LLM fails to provide them
   * This ensures the robot always has reactive behavior even without LLM guidance
   */
  private getSensorBasedFallbackCommands(
    sensors: SensorReadings
  ): Array<{ tool: string; args: Record<string, any> }> {
    const front = sensors.distance.front;
    const left = sensors.distance.left;
    const right = sensors.distance.right;

    let leftDir: WheelDirection = 'stop';
    let rightDir: WheelDirection = 'stop';

    // DANGER: Too close - back up immediately
    if (front < 20) {
      leftDir = 'backward';
      rightDir = 'backward';
      this.log(`FALLBACK: Backing up (front=${Math.round(front)}cm)`, 'info');
    }
    // Close obstacle - rotate away
    else if (front < 40) {
      if (right > left) {
        // Rotate right (left forward, right backward)
        leftDir = 'forward';
        rightDir = 'backward';
        this.log(`FALLBACK: Rotating right (front=${Math.round(front)}cm)`, 'info');
      } else {
        // Rotate left (left backward, right forward)
        leftDir = 'backward';
        rightDir = 'forward';
        this.log(`FALLBACK: Rotating left (front=${Math.round(front)}cm)`, 'info');
      }
    }
    // Moderate distance - can turn or move
    else if (front < 80) {
      // Slight turn toward more open space
      if (right > left && right > 60) {
        leftDir = 'forward';
        rightDir = 'stop'; // Curve right
        this.log(`FALLBACK: Curving right (front=${Math.round(front)}cm)`, 'info');
      } else if (left > right && left > 60) {
        leftDir = 'stop';
        rightDir = 'forward'; // Curve left
        this.log(`FALLBACK: Curving left (front=${Math.round(front)}cm)`, 'info');
      } else {
        // Just go forward slowly
        leftDir = 'forward';
        rightDir = 'forward';
        this.log(`FALLBACK: Moving forward cautiously (front=${Math.round(front)}cm)`, 'info');
      }
    }
    // Clear path - go forward
    else {
      leftDir = 'forward';
      rightDir = 'forward';
      this.log(`FALLBACK: Path clear, moving forward (front=${Math.round(front)}cm)`, 'info');
    }

    return [
      { tool: 'left_wheel', args: { direction: leftDir } },
      { tool: 'right_wheel', args: { direction: rightDir } },
    ];
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
   * Parse tool calls from LLM response (supports both structured and legacy formats)
   */
  private parseToolCalls(response: string): Array<{ tool: string; args: Record<string, any> }> {
    const calls: Array<{ tool: string; args: Record<string, any> }> = [];

    // First, try to extract from structured response format
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
