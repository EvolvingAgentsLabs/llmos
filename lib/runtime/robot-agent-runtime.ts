/**
 * Robot Agent Runtime - Simplified
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

import { createLLMClient } from '../llm/client';
import { Message } from '../llm/types';
import { getDeviceManager } from '../hardware/esp32-device-manager';

// Fixed speed constants - simple and predictable
export const WHEEL_SPEED = {
  FORWARD: 80,   // Single forward speed
  BACKWARD: -80, // Single backward speed
  STOP: 0,       // Stop
} as const;

export type WheelDirection = 'forward' | 'backward' | 'stop';

export interface RobotAgentConfig {
  id: string;
  name: string;
  description: string;
  deviceId: string;
  systemPrompt: string;
  goal?: string; // Main goal for the robot to consider when planning
  loopInterval?: number; // milliseconds between LLM calls (default: 2000)
  maxIterations?: number; // max control loop iterations (default: unlimited)
}

export interface RobotAgentTool {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
  execute: (args: Record<string, any>, deviceId: string) => Promise<any>;
}

export interface RobotAgentState {
  running: boolean;
  iteration: number;
  lastThought: string;
  lastAction: string | null;
  conversationHistory: Message[];
  errors: string[];
  lastPicture?: CameraAnalysis;
}

export interface CameraAnalysis {
  timestamp: number;
  scene: string;
  obstacles: {
    front: boolean;
    left: boolean;
    right: boolean;
    frontDistance?: number;
  };
  recommendation?: string;
}

/**
 * Simple Robot Control Tools - Just 3 tools for basic planning and control
 */
const ROBOT_TOOLS: RobotAgentTool[] = [
  {
    name: 'take_picture',
    description: 'Take a picture with the camera to see the environment. Returns what the robot sees ahead, to the left, and to the right. Use this before planning your next move.',
    parameters: {
      type: 'object',
      properties: {},
    },
    execute: async (args, deviceId) => {
      const manager = getDeviceManager();
      const state = manager.getDeviceState(deviceId);

      if (!state) {
        return {
          success: false,
          error: 'Device not found',
        };
      }

      // Create a simple scene analysis from sensor data
      const sensors = state.robot.sensors;
      const frontDist = sensors.distance.front;
      const leftDist = sensors.distance.left;
      const rightDist = sensors.distance.right;

      const analysis: CameraAnalysis = {
        timestamp: Date.now(),
        scene: describeSene(frontDist, leftDist, rightDist),
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
        picture: analysis,
      };
    },
  },
  {
    name: 'left_wheel',
    description: 'Control the left wheel. Use "forward" to move forward, "backward" to move backward, or "stop" to stop the wheel. Only one speed is available for each direction.',
    parameters: {
      type: 'object',
      properties: {
        direction: {
          type: 'string',
          enum: ['forward', 'backward', 'stop'],
          description: 'Direction: "forward", "backward", or "stop"',
        },
      },
      required: ['direction'],
    },
    execute: async (args, deviceId) => {
      const direction = args.direction as WheelDirection;
      const power = getWheelPower(direction);

      const manager = getDeviceManager();
      const state = manager.getDeviceState(deviceId);

      if (!state) {
        return { success: false, error: 'Device not found' };
      }

      // Get current right wheel power to send combined command
      const currentRightPower = state.robot.motors?.right || 0;

      const success = await manager.sendCommand(deviceId, {
        type: 'drive',
        payload: { left: power, right: currentRightPower },
      });

      return {
        success,
        message: success
          ? `Left wheel: ${direction} (power: ${power})`
          : 'Failed to control left wheel',
      };
    },
  },
  {
    name: 'right_wheel',
    description: 'Control the right wheel. Use "forward" to move forward, "backward" to move backward, or "stop" to stop the wheel. Only one speed is available for each direction.',
    parameters: {
      type: 'object',
      properties: {
        direction: {
          type: 'string',
          enum: ['forward', 'backward', 'stop'],
          description: 'Direction: "forward", "backward", or "stop"',
        },
      },
      required: ['direction'],
    },
    execute: async (args, deviceId) => {
      const direction = args.direction as WheelDirection;
      const power = getWheelPower(direction);

      const manager = getDeviceManager();
      const state = manager.getDeviceState(deviceId);

      if (!state) {
        return { success: false, error: 'Device not found' };
      }

      // Get current left wheel power to send combined command
      const currentLeftPower = state.robot.motors?.left || 0;

      const success = await manager.sendCommand(deviceId, {
        type: 'drive',
        payload: { left: currentLeftPower, right: power },
      });

      return {
        success,
        message: success
          ? `Right wheel: ${direction} (power: ${power})`
          : 'Failed to control right wheel',
      };
    },
  },
];

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
function describeSene(front: number, left: number, right: number): string {
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
  if (front > 80) {
    return 'Path ahead is clear - can go forward';
  }

  if (left > right && left > 50) {
    return 'Turn left - more space on the left side';
  }

  if (right > left && right > 50) {
    return 'Turn right - more space on the right side';
  }

  if (front < 30) {
    return 'Too close to obstacle - back up first';
  }

  return 'Limited space - turn slowly to find open path';
}

/**
 * Default system prompt for simple robot behavior
 */
export const SIMPLE_ROBOT_PROMPT = `You are a simple autonomous robot with a camera and two wheels.

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

## Your Behavior Cycle
Every turn, follow this cycle:
1. **LOOK**: Take a picture to see your surroundings
2. **THINK**: Based on what you see (and your goal), decide direction
3. **ORIENT**: Rotate to face the desired direction
4. **MOVE**: Go forward a short distance
5. **STOP**: Stop and prepare for next cycle

## Decision Making
- If path ahead is clear → go forward
- If obstacle ahead → turn toward clearer side
- If stuck → back up, then turn
- Always consider your main goal when choosing direction

## Response Format
First briefly describe what you see and your plan, then output tool calls as JSON:
{"tool": "tool_name", "args": {...}}

Example:
"I see a clear path ahead. Going forward."
{"tool": "left_wheel", "args": {"direction": "forward"}}
{"tool": "right_wheel", "args": {"direction": "forward"}}`;

/**
 * Robot Agent Runtime - Manages LLM control loop for a robot agent
 */
export class RobotAgentRuntime {
  private config: RobotAgentConfig;
  private state: RobotAgentState;
  private llmClient: any;
  private intervalHandle: any = null;
  private onStateChange?: (state: RobotAgentState) => void;

  constructor(config: RobotAgentConfig, onStateChange?: (state: RobotAgentState) => void) {
    this.config = {
      ...config,
      loopInterval: config.loopInterval || 2000,
      maxIterations: config.maxIterations,
    };

    // Build system prompt with goal if provided
    let systemPrompt = config.systemPrompt || SIMPLE_ROBOT_PROMPT;
    if (config.goal) {
      systemPrompt = `${systemPrompt}\n\n## Your Main Goal\n**${config.goal}**\n\nKeep this goal in mind when deciding which direction to go.`;
    }

    this.state = {
      running: false,
      iteration: 0,
      lastThought: '',
      lastAction: null,
      conversationHistory: [
        {
          role: 'system',
          content: systemPrompt,
        },
      ],
      errors: [],
    };

    this.onStateChange = onStateChange;
    this.llmClient = createLLMClient();

    if (!this.llmClient) {
      throw new Error('Failed to create LLM client - check API key configuration');
    }
  }

  /**
   * Start the agent control loop
   */
  start(): void {
    if (this.state.running) {
      console.warn(`[RobotAgent:${this.config.name}] Already running`);
      return;
    }

    console.log(`[RobotAgent:${this.config.name}] Starting control loop`);
    this.state.running = true;
    this.state.iteration = 0;
    this.state.errors = [];
    this.emitStateChange();

    // Start the control loop
    this.runControlLoop();
  }

  /**
   * Stop the agent control loop
   */
  stop(): void {
    if (!this.state.running) {
      return;
    }

    console.log(`[RobotAgent:${this.config.name}] Stopping control loop`);

    if (this.intervalHandle) {
      clearTimeout(this.intervalHandle);
      this.intervalHandle = null;
    }

    this.state.running = false;
    this.emitStateChange();

    // Stop the robot wheels
    const manager = getDeviceManager();
    manager.sendCommand(this.config.deviceId, {
      type: 'drive',
      payload: { left: 0, right: 0 },
    });
  }

  /**
   * Get current agent state
   */
  getState(): RobotAgentState {
    return { ...this.state };
  }

  /**
   * Main control loop - calls LLM to decide actions
   */
  private async runControlLoop(): Promise<void> {
    if (!this.state.running) {
      return;
    }

    // Check max iterations
    if (this.config.maxIterations && this.state.iteration >= this.config.maxIterations) {
      console.log(`[RobotAgent:${this.config.name}] Reached max iterations (${this.config.maxIterations})`);
      this.stop();
      return;
    }

    this.state.iteration++;
    console.log(`[RobotAgent:${this.config.name}] Iteration ${this.state.iteration}`);

    try {
      // Build user prompt for this cycle
      const userPrompt = this.buildCyclePrompt();

      // Add to conversation
      this.state.conversationHistory.push({
        role: 'user',
        content: userPrompt,
      });

      // Call LLM with tool descriptions
      const response = await this.callLLMWithTools();

      // Parse and execute any tool calls
      await this.executeToolCalls(response);

      // Schedule next iteration
      this.intervalHandle = setTimeout(() => {
        this.runControlLoop();
      }, this.config.loopInterval);
    } catch (error: any) {
      console.error(`[RobotAgent:${this.config.name}] Error in control loop:`, error);
      this.state.errors.push(error.message || String(error));
      this.emitStateChange();

      // Retry after interval
      if (this.state.running) {
        this.intervalHandle = setTimeout(() => {
          this.runControlLoop();
        }, this.config.loopInterval);
      }
    }
  }

  /**
   * Build the prompt for this cycle
   */
  private buildCyclePrompt(): string {
    let prompt = `Cycle ${this.state.iteration}: Time to observe and act.\n\n`;

    prompt += 'Remember the cycle: LOOK (take_picture) → THINK → ORIENT → MOVE → STOP\n\n';

    if (this.state.lastPicture) {
      prompt += `Last observation: ${this.state.lastPicture.scene}\n`;
      prompt += `Suggestion: ${this.state.lastPicture.recommendation}\n\n`;
    }

    prompt += 'What will you do? Start by taking a picture if you need to see, then control the wheels.';

    return prompt;
  }

  /**
   * Call LLM with tool descriptions
   */
  private async callLLMWithTools(): Promise<string> {
    // Format tools for LLM
    const toolsDescription = ROBOT_TOOLS.map(
      (tool) => `
Tool: ${tool.name}
Description: ${tool.description}
Parameters: ${JSON.stringify(tool.parameters, null, 2)}`
    ).join('\n\n');

    // Add tools to system message
    const messagesWithTools = [
      ...this.state.conversationHistory,
      {
        role: 'system' as const,
        content: `Available Tools:\n${toolsDescription}\n\nTo use a tool, respond with a JSON object: {"tool": "tool_name", "args": {...}}`,
      },
    ];

    const response = await this.llmClient.chatDirect(messagesWithTools);

    // Store LLM response
    this.state.lastThought = response;
    this.state.conversationHistory.push({
      role: 'assistant',
      content: response,
    });

    this.emitStateChange();

    return response;
  }

  /**
   * Parse and execute tool calls from LLM response
   */
  private async executeToolCalls(response: string): Promise<void> {
    // Find all JSON tool calls in the response
    const jsonPattern = /\{[\s\S]*?"tool"[\s\S]*?"args"[\s\S]*?\}/g;
    const matches = response.match(jsonPattern);

    if (!matches) {
      console.log(`[RobotAgent:${this.config.name}] No tool call in response`);
      this.state.lastAction = null;
      return;
    }

    const results: string[] = [];

    for (const jsonMatch of matches) {
      try {
        const toolCall = JSON.parse(jsonMatch);
        const { tool, args } = toolCall;

        console.log(`[RobotAgent:${this.config.name}] Calling tool: ${tool}`, args);

        // Find and execute the tool
        const toolDef = ROBOT_TOOLS.find((t) => t.name === tool);

        if (!toolDef) {
          throw new Error(`Unknown tool: ${tool}`);
        }

        const result = await toolDef.execute(args || {}, this.config.deviceId);

        // Store camera analysis if this was a picture
        if (tool === 'take_picture' && result.success && result.picture) {
          this.state.lastPicture = result.picture;
        }

        results.push(`${tool}(${JSON.stringify(args || {})}) -> ${JSON.stringify(result)}`);
      } catch (error: any) {
        console.error(`[RobotAgent:${this.config.name}] Failed to execute tool:`, error);
        this.state.errors.push(`Tool execution failed: ${error.message}`);
      }
    }

    this.state.lastAction = results.join('\n');

    // Add tool results to conversation
    if (results.length > 0) {
      this.state.conversationHistory.push({
        role: 'user',
        content: `Tool results:\n${results.join('\n')}`,
      });
    }

    this.emitStateChange();
  }

  private emitStateChange(): void {
    if (this.onStateChange) {
      this.onStateChange({ ...this.state });
    }
  }
}

/**
 * Global registry of active robot agents
 */
const activeAgents = new Map<string, RobotAgentRuntime>();

export function createRobotAgent(
  config: RobotAgentConfig,
  onStateChange?: (state: RobotAgentState) => void
): RobotAgentRuntime {
  const agent = new RobotAgentRuntime(config, onStateChange);
  activeAgents.set(config.id, agent);
  return agent;
}

export function getRobotAgent(id: string): RobotAgentRuntime | undefined {
  return activeAgents.get(id);
}

export function stopRobotAgent(id: string): boolean {
  const agent = activeAgents.get(id);
  if (agent) {
    agent.stop();
    activeAgents.delete(id);
    return true;
  }
  return false;
}

export function listActiveAgents(): string[] {
  return Array.from(activeAgents.keys());
}
