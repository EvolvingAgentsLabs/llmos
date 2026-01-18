/**
 * Robot Agent Runtime
 *
 * Executes AI robot agents with LLM control loops.
 * Agents have access to robot control tools (motors, LED, sensors, camera).
 */

import { createLLMClient } from '../llm/client';
import { Message } from '../llm/types';
import { getDeviceManager } from '../hardware/esp32-device-manager';

export interface RobotAgentConfig {
  id: string;
  name: string;
  description: string;
  deviceId: string;
  systemPrompt: string;
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
}

/**
 * Robot Control Tools - LLM can call these to control the robot
 */
const ROBOT_TOOLS: RobotAgentTool[] = [
  {
    name: 'drive_motors',
    description: 'Set motor power for left and right wheels. Values from -255 (full reverse) to 255 (full forward).',
    parameters: {
      type: 'object',
      properties: {
        left: {
          type: 'number',
          description: 'Left motor power (-255 to 255)',
          minimum: -255,
          maximum: 255,
        },
        right: {
          type: 'number',
          description: 'Right motor power (-255 to 255)',
          minimum: -255,
          maximum: 255,
        },
      },
      required: ['left', 'right'],
    },
    execute: async (args, deviceId) => {
      const manager = getDeviceManager();
      const success = await manager.sendCommand(deviceId, {
        type: 'drive',
        payload: { left: args.left, right: args.right },
      });
      return {
        success,
        message: success
          ? `Motors set: L=${args.left}, R=${args.right}`
          : 'Failed to set motors',
      };
    },
  },
  {
    name: 'stop_motors',
    description: 'Stop both motors immediately.',
    parameters: {
      type: 'object',
      properties: {},
    },
    execute: async (args, deviceId) => {
      const manager = getDeviceManager();
      const success = await manager.sendCommand(deviceId, {
        type: 'drive',
        payload: { left: 0, right: 0 },
      });
      return {
        success,
        message: success ? 'Motors stopped' : 'Failed to stop motors',
      };
    },
  },
  {
    name: 'set_led',
    description: 'Set RGB LED color. Values from 0-255 for each color channel.',
    parameters: {
      type: 'object',
      properties: {
        r: {
          type: 'number',
          description: 'Red channel (0-255)',
          minimum: 0,
          maximum: 255,
        },
        g: {
          type: 'number',
          description: 'Green channel (0-255)',
          minimum: 0,
          maximum: 255,
        },
        b: {
          type: 'number',
          description: 'Blue channel (0-255)',
          minimum: 0,
          maximum: 255,
        },
      },
      required: ['r', 'g', 'b'],
    },
    execute: async (args, deviceId) => {
      const manager = getDeviceManager();
      const success = await manager.sendCommand(deviceId, {
        type: 'led',
        payload: { r: args.r, g: args.g, b: args.b },
      });
      return {
        success,
        message: success
          ? `LED set to RGB(${args.r}, ${args.g}, ${args.b})`
          : 'Failed to set LED',
      };
    },
  },
  {
    name: 'get_sensors',
    description: 'Read all robot sensors: distance sensors, line sensors, bumpers, battery level.',
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
          error: 'Device not found or has no state',
        };
      }

      return {
        success: true,
        sensors: {
          distance: {
            front: state.robot.sensors.distance.front,
            frontLeft: state.robot.sensors.distance.frontLeft,
            frontRight: state.robot.sensors.distance.frontRight,
            left: state.robot.sensors.distance.left,
            right: state.robot.sensors.distance.right,
            backLeft: state.robot.sensors.distance.backLeft,
            backRight: state.robot.sensors.distance.backRight,
            back: state.robot.sensors.distance.back,
          },
          line: state.robot.sensors.line,
          bumper: {
            front: state.robot.sensors.bumper.front,
            back: state.robot.sensors.bumper.back,
          },
          battery: {
            percentage: state.robot.battery.percentage,
            voltage: state.robot.battery.voltage,
          },
          pose: {
            x: state.robot.pose.x.toFixed(3),
            y: state.robot.pose.y.toFixed(3),
            rotation: ((state.robot.pose.rotation * 180) / Math.PI).toFixed(1) + '°',
          },
        },
      };
    },
  },
];

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

    this.state = {
      running: false,
      iteration: 0,
      lastThought: '',
      lastAction: null,
      conversationHistory: [
        {
          role: 'system',
          content: config.systemPrompt,
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

    // Stop the robot motors
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
      // Get current sensor readings
      const sensorTool = ROBOT_TOOLS.find((t) => t.name === 'get_sensors');
      const sensorData = await sensorTool!.execute({}, this.config.deviceId);

      // Format sensor data for LLM
      const sensorPrompt = `Current Sensor Readings (Iteration ${this.state.iteration}):
- Distance Sensors: Front=${sensorData.sensors.distance.front}cm, Left=${sensorData.sensors.distance.left}cm, Right=${sensorData.sensors.distance.right}cm
- Line Sensors: [${sensorData.sensors.line.join(', ')}]
- Battery: ${sensorData.sensors.battery.percentage}%
- Position: (${sensorData.sensors.pose.x}, ${sensorData.sensors.pose.y}), facing ${sensorData.sensors.pose.rotation}

Based on these sensor readings, what should the robot do next? Use the available tools to control the robot.

Available tools:
- drive_motors(left, right): Set motor power (-255 to 255)
- stop_motors(): Stop both motors
- set_led(r, g, b): Set LED color (0-255)
- get_sensors(): Read all sensors (already called above)`;

      // Add sensor data to conversation
      this.state.conversationHistory.push({
        role: 'user',
        content: sensorPrompt,
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
    // Try to extract JSON tool call
    const jsonMatch = response.match(/\{[\s\S]*"tool"[\s\S]*"args"[\s\S]*\}/);

    if (!jsonMatch) {
      console.log(`[RobotAgent:${this.config.name}] No tool call in response`);
      this.state.lastAction = null;
      return;
    }

    try {
      const toolCall = JSON.parse(jsonMatch[0]);
      const { tool, args } = toolCall;

      console.log(`[RobotAgent:${this.config.name}] Calling tool: ${tool}`, args);

      // Find and execute the tool
      const toolDef = ROBOT_TOOLS.find((t) => t.name === tool);

      if (!toolDef) {
        throw new Error(`Unknown tool: ${tool}`);
      }

      const result = await toolDef.execute(args, this.config.deviceId);

      this.state.lastAction = `${tool}(${JSON.stringify(args)}) -> ${JSON.stringify(result)}`;

      // Add tool result to conversation
      this.state.conversationHistory.push({
        role: 'user',
        content: `Tool ${tool} executed: ${JSON.stringify(result)}`,
      });

      this.emitStateChange();
    } catch (error: any) {
      console.error(`[RobotAgent:${this.config.name}] Failed to execute tool:`, error);
      this.state.errors.push(`Tool execution failed: ${error.message}`);
      this.state.lastAction = null;
      this.emitStateChange();
    }
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
