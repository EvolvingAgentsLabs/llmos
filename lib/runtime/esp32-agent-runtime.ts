/**
 * ESP32 Agent Runtime
 *
 * Simulates the agentic loop that runs ON THE ESP32-S3 DEVICE.
 *
 * Architecture:
 * ┌─────────────────────────────────────────────────────────────────┐
 * │                    ESP32-S3 Device                              │
 * │  ┌─────────────────────────────────────────────────────────┐   │
 * │  │              ESP32AgentRuntime                          │   │
 * │  │  ┌──────────┐  ┌─────────────┐  ┌──────────────────┐   │   │
 * │  │  │ Sensors  │→ │ Agent Loop  │→ │ Local Tools      │   │   │
 * │  │  │ (local)  │  │             │  │ - left wheel     │   │   │
 * │  │  └──────────┘  │  1. Read    │  │ - right wheel    │   │   │
 * │  │                │  2. Call    │  │ - camera         │   │   │
 * │  │                │     Host    │  │ - LED            │   │   │
 * │  │                │  3. Execute │  │ - sensors        │   │   │
 * │  │                │  4. Repeat  │  └──────────────────┘   │   │
 * │  │                └──────┬──────┘                         │   │
 * │  └───────────────────────│────────────────────────────────┘   │
 * └──────────────────────────│────────────────────────────────────┘
 *                            │ HTTP/WebSocket
 *                            ▼
 * ┌─────────────────────────────────────────────────────────────────┐
 * │                    LLMOS Host                                   │
 * │  ┌─────────────────────────────────────────────────────────┐   │
 * │  │  /api/device/llm-request                                │   │
 * │  │  - Receives: deviceId, agentPrompt, sensorContext       │   │
 * │  │  - Returns: LLM response with tool calls                │   │
 * │  └─────────────────────────────────────────────────────────┘   │
 * └─────────────────────────────────────────────────────────────────┘
 *
 * The same code structure works for:
 * 1. Browser simulation (this file simulates the ESP32 behavior)
 * 2. Physical ESP32-S3 (C/MicroPython code with same logic)
 */

import { getDeviceManager } from '../hardware/esp32-device-manager';

// ═══════════════════════════════════════════════════════════════════════════
// DEVICE-SIDE TOOL DEFINITIONS
// These represent the physical capabilities of the ESP32-S3 robot
// ═══════════════════════════════════════════════════════════════════════════

export interface DeviceTool {
  name: string;
  description: string;
  parameters: Record<string, { type: string; description: string; required?: boolean }>;
  // Execute runs LOCALLY on the device, controlling physical hardware
  execute: (args: Record<string, any>, deviceContext: DeviceContext) => Promise<ToolResult>;
}

export interface ToolResult {
  success: boolean;
  data?: any;
  error?: string;
}

export interface DeviceContext {
  deviceId: string;
  // Direct hardware access (in simulation, these map to the VM)
  setLeftWheel: (power: number) => void;
  setRightWheel: (power: number) => void;
  setLED: (r: number, g: number, b: number) => void;
  getSensors: () => SensorReadings;
  captureCamera: () => CameraFrame;
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
  line: number[]; // 5 IR line sensors
  bumper: { front: boolean; back: boolean };
  battery: { voltage: number; percentage: number };
  imu?: { accelX: number; accelY: number; accelZ: number; gyroZ: number };
  pose: { x: number; y: number; rotation: number };
}

export interface CameraFrame {
  width: number;
  height: number;
  timestamp: number;
  // In simulation: derived from sensor data
  // On physical device: actual camera frame
  data?: Uint8Array;
  analysis: {
    frontObstacle: boolean;
    frontObstacleDistance: number;
    leftClear: boolean;
    rightClear: boolean;
    lineDetected: boolean;
    linePosition?: 'left' | 'center' | 'right';
  };
}

/**
 * Device-side tools - these run on the ESP32-S3
 */
export const DEVICE_TOOLS: DeviceTool[] = [
  {
    name: 'control_left_wheel',
    description: 'Set left wheel motor power. Positive = forward, negative = backward.',
    parameters: {
      power: { type: 'number', description: 'Motor power from -255 to 255', required: true },
    },
    execute: async (args, ctx) => {
      const power = Math.max(-255, Math.min(255, Math.round(args.power)));
      ctx.setLeftWheel(power);
      return { success: true, data: { wheel: 'left', power } };
    },
  },
  {
    name: 'control_right_wheel',
    description: 'Set right wheel motor power. Positive = forward, negative = backward.',
    parameters: {
      power: { type: 'number', description: 'Motor power from -255 to 255', required: true },
    },
    execute: async (args, ctx) => {
      const power = Math.max(-255, Math.min(255, Math.round(args.power)));
      ctx.setRightWheel(power);
      return { success: true, data: { wheel: 'right', power } };
    },
  },
  {
    name: 'drive',
    description: 'Set both wheel motors at once for coordinated movement.',
    parameters: {
      left: { type: 'number', description: 'Left motor power (-255 to 255)', required: true },
      right: { type: 'number', description: 'Right motor power (-255 to 255)', required: true },
    },
    execute: async (args, ctx) => {
      const left = Math.max(-255, Math.min(255, Math.round(args.left)));
      const right = Math.max(-255, Math.min(255, Math.round(args.right)));
      ctx.setLeftWheel(left);
      ctx.setRightWheel(right);
      return { success: true, data: { left, right } };
    },
  },
  {
    name: 'stop',
    description: 'Stop both motors immediately.',
    parameters: {},
    execute: async (args, ctx) => {
      ctx.setLeftWheel(0);
      ctx.setRightWheel(0);
      return { success: true, data: { stopped: true } };
    },
  },
  {
    name: 'set_led',
    description: 'Set RGB LED color for status indication.',
    parameters: {
      r: { type: 'number', description: 'Red (0-255)', required: true },
      g: { type: 'number', description: 'Green (0-255)', required: true },
      b: { type: 'number', description: 'Blue (0-255)', required: true },
    },
    execute: async (args, ctx) => {
      const r = Math.max(0, Math.min(255, Math.round(args.r)));
      const g = Math.max(0, Math.min(255, Math.round(args.g)));
      const b = Math.max(0, Math.min(255, Math.round(args.b)));
      ctx.setLED(r, g, b);
      return { success: true, data: { r, g, b } };
    },
  },
  {
    name: 'read_sensors',
    description: 'Read all sensors: distance, line, bumpers, battery, position.',
    parameters: {},
    execute: async (args, ctx) => {
      const sensors = ctx.getSensors();
      return { success: true, data: sensors };
    },
  },
  {
    name: 'use_camera',
    description: 'Capture camera frame and get visual analysis.',
    parameters: {
      look_for: { type: 'string', description: 'What to look for (optional)', required: false },
    },
    execute: async (args, ctx) => {
      const frame = ctx.captureCamera();
      return {
        success: true,
        data: {
          width: frame.width,
          height: frame.height,
          timestamp: frame.timestamp,
          analysis: frame.analysis,
          query: args.look_for || null,
        },
      };
    },
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// AGENT CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

export interface ESP32AgentConfig {
  id: string;
  name: string;
  deviceId: string;
  // The system prompt defining robot behavior (stored in user volume)
  systemPrompt: string;
  // Optional goal for the agent to achieve (e.g., "collect all coins", "transport the ball to location X")
  goal?: string;
  // Loop timing
  loopIntervalMs?: number; // How often to run the control loop (default: 500ms)
  maxIterations?: number; // Optional limit
  // Host connection for LLM requests
  hostUrl?: string; // Default: current host
  // Callbacks
  onStateChange?: (state: ESP32AgentState) => void;
  onLog?: (message: string, level: 'info' | 'warn' | 'error') => void;
}

// Internal config with all defaults resolved
interface ResolvedESP32AgentConfig extends ESP32AgentConfig {
  loopIntervalMs: number;
  hostUrl: string;
  goal?: string;
}

export interface ESP32AgentState {
  running: boolean;
  iteration: number;
  lastSensorReading: SensorReadings | null;
  lastLLMResponse: string | null;
  lastToolCalls: Array<{ tool: string; args: any; result: ToolResult }>;
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
// ESP32 AGENT RUNTIME
// This simulates the agentic loop running on the ESP32-S3 device
// ═══════════════════════════════════════════════════════════════════════════

export class ESP32AgentRuntime {
  private config: ResolvedESP32AgentConfig;
  private state: ESP32AgentState;
  private deviceContext: DeviceContext | null = null;
  private loopHandle: any = null;
  private leftWheelPower = 0;
  private rightWheelPower = 0;

  constructor(config: ESP32AgentConfig) {
    this.config = {
      ...config,
      loopIntervalMs: config.loopIntervalMs ?? 500,
      hostUrl: config.hostUrl ?? (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000'),
    };

    this.state = {
      running: false,
      iteration: 0,
      lastSensorReading: null,
      lastLLMResponse: null,
      lastToolCalls: [],
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
   * Initialize the device context (connect to hardware or simulation)
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
      captureCamera: (): CameraFrame => {
        const state = manager.getDeviceState(deviceId);
        if (!state) {
          throw new Error('Device not found');
        }
        // Simulate camera analysis from sensor data
        const d = state.robot.sensors.distance;
        return {
          width: 160,
          height: 120,
          timestamp: Date.now(),
          analysis: {
            frontObstacle: d.front < 30,
            frontObstacleDistance: d.front,
            leftClear: d.left > 30 && d.frontLeft > 30,
            rightClear: d.right > 30 && d.frontRight > 30,
            lineDetected: state.robot.sensors.line.some((v: number) => v > 500),
            linePosition: this.detectLinePosition(state.robot.sensors.line),
          },
        };
      },
    };
  }

  private detectLinePosition(lineSensors: number[]): 'left' | 'center' | 'right' | undefined {
    // 5 sensors: [far-left, left, center, right, far-right]
    const threshold = 500;
    const [fl, l, c, r, fr] = lineSensors;

    if (c > threshold) return 'center';
    if ((l > threshold || fl > threshold) && r < threshold) return 'left';
    if ((r > threshold || fr > threshold) && l < threshold) return 'right';
    return undefined;
  }

  /**
   * Start the agent control loop
   */
  start(): void {
    if (this.state.running) {
      this.log('Agent already running', 'warn');
      return;
    }

    this.log(`Starting ESP32 agent: ${this.config.name}`, 'info');

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
  stop(): void {
    if (!this.state.running) return;

    this.log(`Stopping ESP32 agent: ${this.config.name}`, 'info');

    if (this.loopHandle) {
      clearTimeout(this.loopHandle);
      this.loopHandle = null;
    }

    // Stop motors
    if (this.deviceContext) {
      this.deviceContext.setLeftWheel(0);
      this.deviceContext.setRightWheel(0);
      this.deviceContext.setLED(0, 0, 0);
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
   * Main control loop - this is what runs on the ESP32-S3
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
      // ═══════════════════════════════════════════════════════════════════
      // STEP 1: Read sensors (LOCAL on ESP32)
      // ═══════════════════════════════════════════════════════════════════
      const sensors = this.deviceContext.getSensors();
      this.state.lastSensorReading = sensors;

      // ═══════════════════════════════════════════════════════════════════
      // STEP 2: Call host for LLM response (REMOTE call to LLMOS)
      // ═══════════════════════════════════════════════════════════════════
      const llmStart = Date.now();
      const llmResponse = await this.callHostForLLMResponse(sensors);
      const llmLatency = Date.now() - llmStart;

      this.state.lastLLMResponse = llmResponse;
      this.state.stats.llmCallCount++;
      this.state.stats.avgLLMLatencyMs =
        (this.state.stats.avgLLMLatencyMs * (this.state.stats.llmCallCount - 1) + llmLatency) /
        this.state.stats.llmCallCount;

      // ═══════════════════════════════════════════════════════════════════
      // STEP 3: Parse and execute tool calls (LOCAL on ESP32)
      // ═══════════════════════════════════════════════════════════════════
      console.log('[ESP32Agent] Raw LLM response:', llmResponse);
      const toolCalls = this.parseToolCalls(llmResponse);
      console.log('[ESP32Agent] Parsed tool calls:', toolCalls);
      this.state.lastToolCalls = [];

      for (const { tool, args } of toolCalls) {
        const toolDef = DEVICE_TOOLS.find((t) => t.name === tool);
        if (toolDef) {
          const result = await toolDef.execute(args, this.deviceContext);
          this.state.lastToolCalls.push({ tool, args, result });
          this.state.stats.totalToolCalls++;
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

    // ═══════════════════════════════════════════════════════════════════
    // STEP 4: Schedule next iteration
    // ═══════════════════════════════════════════════════════════════════
    if (this.state.running) {
      this.loopHandle = setTimeout(() => this.runLoop(), this.config.loopIntervalMs);
    }
  }

  /**
   * Call the LLMOS host to get an LLM response
   * On physical ESP32, this would be an HTTP request to the host
   */
  private async callHostForLLMResponse(sensors: SensorReadings): Promise<string> {
    // Build the context message with sensor data
    const sensorContext = this.formatSensorContext(sensors);

    // In browser simulation, we can call the LLM client directly
    // On physical device, this would be an HTTP POST to /api/device/llm-request
    if (typeof window !== 'undefined') {
      // Browser simulation - use LLM client directly
      const { createLLMClient } = await import('../llm/client');
      const client = createLLMClient();

      if (!client) {
        throw new Error('LLM client not available');
      }

      const messages = [
        { role: 'system' as const, content: this.buildSystemPrompt() },
        { role: 'user' as const, content: sensorContext },
      ];

      return await client.chatDirect(messages);
    } else {
      // Physical device would make HTTP request
      const response = await fetch(`${this.config.hostUrl}/api/device/llm-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId: this.config.deviceId,
          agentId: this.config.id,
          systemPrompt: this.buildSystemPrompt(),
          sensorContext,
        }),
      });

      if (!response.ok) {
        throw new Error(`Host LLM request failed: ${response.status}`);
      }

      const data = await response.json();
      return data.response;
    }
  }

  /**
   * Build the system prompt for the LLM
   */
  private buildSystemPrompt(): string {
    const toolDocs = DEVICE_TOOLS.map(
      (t) =>
        `- ${t.name}: ${t.description}\n  Parameters: ${JSON.stringify(
          Object.entries(t.parameters)
            .filter(([_, p]) => p.required !== false)
            .map(([name, p]) => `${name} (${p.type})`)
        )}`
    ).join('\n');

    // Build goal section if a goal is specified
    const goalSection = this.config.goal
      ? `\n\n## Current Goal\n**${this.config.goal}**\n\nYou must work toward achieving this goal. Use your sensors and available tools to make progress. Report your observations and reasoning as you work toward the goal.`
      : '';

    return `${this.config.systemPrompt}${goalSection}

## Available Tools (executed locally on device)
${toolDocs}

## Response Format
Respond with your reasoning, then tool calls in this JSON format:
\`\`\`json
{"tool": "tool_name", "args": {"param": value}}
\`\`\`

You can make multiple tool calls. Each tool executes immediately on the robot hardware.`;
  }

  /**
   * Format sensor data for the LLM context
   */
  private formatSensorContext(sensors: SensorReadings): string {
    return `## Current Sensor Readings (Iteration ${this.state.iteration})

**Distance Sensors (cm):**
- Front: ${sensors.distance.front.toFixed(1)}
- Front-Left: ${sensors.distance.frontLeft.toFixed(1)}, Front-Right: ${sensors.distance.frontRight.toFixed(1)}
- Left: ${sensors.distance.left.toFixed(1)}, Right: ${sensors.distance.right.toFixed(1)}
- Back: ${sensors.distance.back.toFixed(1)}

**Line Sensors:** [${sensors.line.map((v) => v.toFixed(0)).join(', ')}]
**Bumpers:** Front=${sensors.bumper.front ? 'TRIGGERED' : 'clear'}, Back=${sensors.bumper.back ? 'TRIGGERED' : 'clear'}
**Battery:** ${sensors.battery.percentage.toFixed(0)}% (${sensors.battery.voltage.toFixed(2)}V)
**Position:** (${sensors.pose.x.toFixed(2)}, ${sensors.pose.y.toFixed(2)}) heading ${((sensors.pose.rotation * 180) / Math.PI).toFixed(1)}°

Based on these readings, decide what action to take next.`;
  }

  /**
   * Parse tool calls from LLM response
   */
  private parseToolCalls(response: string): Array<{ tool: string; args: Record<string, any> }> {
    const calls: Array<{ tool: string; args: Record<string, any> }> = [];

    // Extract JSON objects by properly tracking brace nesting
    const jsonObjects = this.extractJsonObjects(response);

    console.log('[parseToolCalls] Found JSON objects:', jsonObjects.length, jsonObjects);

    for (const jsonStr of jsonObjects) {
      try {
        const parsed = JSON.parse(jsonStr);
        console.log('[parseToolCalls] Parsed object:', parsed);

        if (parsed.tool && typeof parsed.tool === 'string') {
          calls.push({
            tool: parsed.tool,
            args: parsed.args || {},
          });
          console.log('[parseToolCalls] Added tool call:', parsed.tool);
        }
        // Also handle {"tool_calls": [...]} format
        if (Array.isArray(parsed.tool_calls)) {
          for (const call of parsed.tool_calls) {
            if (call.tool && typeof call.tool === 'string') {
              calls.push({
                tool: call.tool,
                args: call.args || {},
              });
              console.log('[parseToolCalls] Added tool_calls item:', call.tool);
            }
          }
        }
      } catch (e) {
        console.log('[parseToolCalls] JSON parse error for:', jsonStr.substring(0, 100), e);
      }
    }

    console.log('[parseToolCalls] Total calls extracted:', calls.length);
    return calls;
  }

  /**
   * Extract complete JSON objects from text, properly handling nested braces
   */
  private extractJsonObjects(text: string): string[] {
    const objects: string[] = [];
    let i = 0;

    while (i < text.length) {
      // Find the start of a JSON object
      const start = text.indexOf('{', i);
      if (start === -1) break;

      // Track brace nesting to find the complete object
      let depth = 0;
      let end = start;
      let inString = false;
      let escape = false;

      for (let j = start; j < text.length; j++) {
        const char = text[j];

        if (escape) {
          escape = false;
          continue;
        }

        if (char === '\\' && inString) {
          escape = true;
          continue;
        }

        if (char === '"' && !escape) {
          inString = !inString;
          continue;
        }

        if (!inString) {
          if (char === '{') {
            depth++;
          } else if (char === '}') {
            depth--;
            if (depth === 0) {
              end = j;
              break;
            }
          }
        }
      }

      if (depth === 0 && end > start) {
        const jsonStr = text.slice(start, end + 1);
        // Only include if it contains "tool"
        if (jsonStr.includes('"tool"')) {
          objects.push(jsonStr);
        }
        i = end + 1;
      } else {
        // Unbalanced braces, move past this opening brace
        i = start + 1;
      }
    }

    return objects;
  }

  private log(message: string, level: 'info' | 'warn' | 'error'): void {
    const prefix = `[ESP32Agent:${this.config.name}]`;
    if (this.config.onLog) {
      this.config.onLog(`${prefix} ${message}`, level);
    }
    if (level === 'error') {
      console.error(prefix, message);
    } else if (level === 'warn') {
      console.warn(prefix, message);
    } else {
      console.log(prefix, message);
    }
  }

  private emitStateChange(): void {
    if (this.config.onStateChange) {
      this.config.onStateChange({ ...this.state });
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// GLOBAL AGENT REGISTRY
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

// ═══════════════════════════════════════════════════════════════════════════
// DEFAULT AGENT PROMPTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Mapping of behavior types to their recommended floor maps.
 * This ensures the 3D world matches the selected behavior.
 */
export const BEHAVIOR_TO_MAP: Record<string, string> = {
  explorer: 'standard5x5Obstacles',      // Needs obstacles to explore around
  wallFollower: 'standard5x5Maze',       // Needs walls to follow
  lineFollower: 'standard5x5LineTrack',  // Needs line track to follow
  patroller: 'standard5x5Empty',         // Needs open space for patrol pattern
};

/**
 * Human-readable descriptions for each behavior
 */
export const BEHAVIOR_DESCRIPTIONS: Record<string, { name: string; description: string; mapName: string }> = {
  explorer: {
    name: 'Explorer',
    description: 'Explores environment while avoiding obstacles',
    mapName: '5m × 5m Obstacles',
  },
  wallFollower: {
    name: 'Wall Follower',
    description: 'Follows walls using right-hand rule',
    mapName: '5m × 5m Maze',
  },
  lineFollower: {
    name: 'Line Follower',
    description: 'Follows line track using IR sensors',
    mapName: '5m × 5m Line Track',
  },
  patroller: {
    name: 'Patroller',
    description: 'Patrols in rectangular pattern',
    mapName: '5m × 5m Empty',
  },
};

export const DEFAULT_AGENT_PROMPTS = {
  explorer: `You are an autonomous exploration robot. Your goal is to explore the environment while avoiding obstacles.

Behavior:
1. Move forward when path is clear (front distance > 30cm)
2. Turn away from obstacles when detected
3. Use LED to indicate state: green=exploring, yellow=turning, red=stopped
4. Prefer turning toward the more open direction`,

  wallFollower: `You are a wall-following robot using the right-hand rule.

Behavior:
1. Maintain approximately 20cm distance from the right wall
2. If right wall is too far (>30cm), turn slightly right
3. If right wall is too close (<15cm), turn slightly left
4. If front is blocked, turn left
5. LED: blue=following, yellow=adjusting, red=blocked`,

  lineFollower: `You are a line-following robot.

Behavior:
1. Center line sensor detects line = drive straight
2. Left sensors detect line = turn left
3. Right sensors detect line = turn right
4. No line detected = slow down and search
5. LED: green=on line, yellow=searching, red=lost`,

  patroller: `You are a patrol robot that moves in a systematic pattern.

Behavior:
1. Drive forward until obstacle detected
2. Turn 90 degrees right
3. Continue patrol pattern
4. Return to start after N iterations
5. LED: white=patrolling, purple=turning, red=returning`,
};
