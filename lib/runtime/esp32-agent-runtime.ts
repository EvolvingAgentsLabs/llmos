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
  simple: `You are a simple autonomous robot with a camera and two wheels.

## Your Tools
You have exactly 3 tools:
1. **take_picture** - See what's around you (obstacles, clear paths)
2. **left_wheel** - Control left wheel: "forward", "backward", or "stop"
3. **right_wheel** - Control right wheel: "forward", "backward", or "stop"

## How to Move
- **Go straight**: Both wheels forward
- **Turn left**: Right wheel forward, left wheel stop (or backward for sharper turn)
- **Turn right**: Left wheel forward, right wheel stop (or backward for sharper turn)
- **Stop**: Both wheels stop
- **Back up**: Both wheels backward

## CRITICAL: Obstacle Avoidance Rules
1. **If obstacle < 30cm ahead**: BACK UP FIRST (both wheels backward), then turn
2. **If obstacle 30-80cm ahead**: Turn toward the clearer side
3. **If path clear (> 80cm)**: Go forward
4. **NEVER keep taking pictures when obstacle is close** - ACT on what you already see!

## Your Behavior Cycle
1. **LOOK**: Take a picture (only if you don't have recent info)
2. **THINK**: Decide based on what you see
3. **ACT**: Control wheels immediately - don't hesitate when obstacle is close!

## Response Format
Briefly state your plan, then output wheel commands as JSON:
{"tool": "left_wheel", "args": {"direction": "forward"}}
{"tool": "right_wheel", "args": {"direction": "forward"}}

## Examples
Obstacle close (< 30cm): "Obstacle too close! Backing up."
{"tool": "left_wheel", "args": {"direction": "backward"}}
{"tool": "right_wheel", "args": {"direction": "backward"}}

After backing up, turn: "Now turning right to avoid."
{"tool": "left_wheel", "args": {"direction": "forward"}}
{"tool": "right_wheel", "args": {"direction": "backward"}}

Path clear: "Path clear, moving forward."
{"tool": "left_wheel", "args": {"direction": "forward"}}
{"tool": "right_wheel", "args": {"direction": "forward"}}`,
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
  lastSensorReading: SensorReadings | null;
  lastLLMResponse: string | null;
  lastToolCalls: Array<{ tool: string; args: any; result: ToolResult }>;
  lastPicture: CameraAnalysis | null;
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
      lastSensorReading: null,
      lastLLMResponse: null,
      lastToolCalls: [],
      lastPicture: null,
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
   * Call LLM for decision
   */
  private async callLLM(sensors: SensorReadings): Promise<string> {
    // Build the prompt based on current situation
    let prompt = `Cycle ${this.state.iteration}: Time to act.\n\n`;

    if (this.state.lastPicture) {
      const hasObstacle = this.state.lastPicture.obstacles.front;
      const distance = this.state.lastPicture.obstacles.frontDistance;

      prompt += `Current view: ${this.state.lastPicture.scene}\n`;
      prompt += `Recommendation: ${this.state.lastPicture.recommendation}\n\n`;

      // If there's a close obstacle, be very explicit about what to do
      if (hasObstacle && distance < 30) {
        prompt += `⚠️ OBSTACLE VERY CLOSE (${distance}cm)! You MUST act NOW:\n`;
        prompt += `1. First, set BOTH wheels to "backward" to back up\n`;
        prompt += `2. Then turn toward the clearer side\n\n`;
        prompt += 'Do NOT take another picture - act immediately with wheel controls!';
      } else if (hasObstacle) {
        prompt += `Obstacle detected at ${distance}cm. Follow the recommendation and control the wheels to avoid it.`;
      } else {
        prompt += 'Path is clear. You may take a picture to check surroundings, or continue forward.';
      }
    } else {
      prompt += 'No recent observation. Take a picture first to see your surroundings.';
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
      return '{"tool": "left_wheel", "args": {"direction": "stop"}}\n{"tool": "right_wheel", "args": {"direction": "stop"}}';
    }

    // Call the LLM API
    try {
      const response = await fetch('/api/robot-llm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId: this.config.deviceId,
          systemPrompt: this.config.systemPrompt,
          userPrompt: prompt,
          tools: toolsDescription,
          // Pass LLM config from client storage
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
      return data.response || '';
    } catch (error: any) {
      this.log(`LLM call failed: ${error.message}`, 'error');
      // Return a safe fallback - stop the robot
      return '{"tool": "left_wheel", "args": {"direction": "stop"}}\n{"tool": "right_wheel", "args": {"direction": "stop"}}';
    }
  }

  /**
   * Parse tool calls from LLM response
   */
  private parseToolCalls(response: string): Array<{ tool: string; args: Record<string, any> }> {
    const calls: Array<{ tool: string; args: Record<string, any> }> = [];

    // Find all JSON objects with tool and args
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
