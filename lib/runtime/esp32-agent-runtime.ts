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
            lineDetected: state.robot.sensors.line.some((v: number) => v > 127),
            linePosition: this.detectLinePosition(state.robot.sensors.line),
          },
        };
      },
    };
  }

  private detectLinePosition(lineSensors: number[]): 'left' | 'center' | 'right' | undefined {
    // 5 sensors: [far-left, left, center, right, far-right]
    // Line sensors return 0 (off line) or 255 (on line), threshold should be midpoint
    const threshold = 127;
    const [fl, l, c, r, fr] = lineSensors;

    if (c > threshold) return 'center';
    if ((l > threshold || fl > threshold) && r < threshold && fr < threshold) return 'left';
    if ((r > threshold || fr > threshold) && l < threshold && fl < threshold) return 'right';
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
Keep responses BRIEF. State your observation (1 line), then tool calls.

Format for tool calls:
\`\`\`json
{"tool": "tool_name", "args": {"param": value}}
\`\`\`

Example response:
"Line centered, driving forward.
\`\`\`json
{"tool": "drive", "args": {"left": 120, "right": 120}}
\`\`\`"

IMPORTANT: Use integer motor values in range -255 to 255 (NOT decimals like 0.5!)`;
  }

  /**
   * Format sensor data for the LLM context
   */
  private formatSensorContext(sensors: SensorReadings): string {
    // Build collectibles section if there are nearby collectibles
    let collectiblesSection = '';
    const nearbyCollectibles = (sensors as any).nearbyCollectibles;
    if (nearbyCollectibles && nearbyCollectibles.length > 0) {
      const items = nearbyCollectibles.map((c: any) =>
        `- ${c.type} (${c.id}): ${c.distance}cm away, ${c.angle}° ${c.angle > 0 ? 'right' : c.angle < 0 ? 'left' : 'ahead'}, worth ${c.points} points`
      ).join('\n');
      collectiblesSection = `\n\n**Nearby Collectibles (within 2m):**\n${items}`;
    } else if (this.config.goal && this.config.goal.toLowerCase().includes('collect')) {
      collectiblesSection = '\n\n**Nearby Collectibles:** None detected within range. Explore to find more!';
    }

    // Interpret line sensor position for easier LLM understanding
    // Sensors: [far-left(0), left(1), center(2), right(3), far-right(4)]
    const lineThreshold = 127;
    const onLine = sensors.line.map(v => v > lineThreshold);
    let lineStatus = '';

    if (!onLine.some(v => v)) {
      lineStatus = '⚠️ LINE LOST - search needed!';
    } else if (onLine[2]) {
      if (onLine[0] || onLine[1]) {
        lineStatus = '↖️ Line drifting LEFT - turn left';
      } else if (onLine[3] || onLine[4]) {
        lineStatus = '↗️ Line drifting RIGHT - turn right';
      } else {
        lineStatus = '✓ CENTERED - drive straight';
      }
    } else if (onLine[0] || onLine[1]) {
      lineStatus = '⬅️ Line is LEFT - turn left sharply';
    } else if (onLine[3] || onLine[4]) {
      lineStatus = '➡️ Line is RIGHT - turn right sharply';
    }

    // Visual representation of line sensors
    const lineVisual = onLine.map(v => v ? '●' : '○').join(' ');

    return `## Sensor Readings (Iteration ${this.state.iteration})

**Line Sensors:** [${lineVisual}] ${lineStatus}
Raw: [${sensors.line.map((v) => v.toFixed(0)).join(', ')}]

**Distance:** Front=${sensors.distance.front.toFixed(0)}cm, L=${sensors.distance.left.toFixed(0)}cm, R=${sensors.distance.right.toFixed(0)}cm
**Position:** (${sensors.pose.x.toFixed(2)}, ${sensors.pose.y.toFixed(2)}) heading ${((sensors.pose.rotation * 180) / Math.PI).toFixed(1)}°${collectiblesSection}

Decide your action based on the line status above.`;
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
  explorer: 'standard5x5Obstacles',         // Needs obstacles to explore around
  wallFollower: 'standard5x5Maze',          // Needs walls to follow
  lineFollower: 'standard5x5LineTrack',     // Needs line track to follow
  patroller: 'standard5x5Empty',            // Needs open space for patrol pattern
  collector: 'standard5x5CoinCollection',   // Coin collection challenge
  gemHunter: 'standard5x5GemHunt',          // Gem hunt with varied point values
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
  collector: {
    name: 'Coin Collector',
    description: 'Collects all coins scattered around the arena',
    mapName: '5m × 5m Coin Collection',
  },
  gemHunter: {
    name: 'Gem Hunter',
    description: 'Hunts gems of different values while avoiding obstacles',
    mapName: '5m × 5m Gem Hunt',
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

  lineFollower: `You are a line-following robot. Your goal is to follow the white line track as smoothly and quickly as possible.

## Understanding Your Sensors

**Line Sensors** (5 sensors, array indices 0-4):
- Values: 0 = OFF line (dark floor), 255 = ON line (white line)
- Layout: [far-left, left, center, right, far-right]
- Index 2 is CENTER sensor - ideally this should detect the line

**Motor Power** (IMPORTANT - use correct range!):
- Range: -255 to +255 (NOT 0-1!)
- Forward speed: 80-150 for moderate, 150-200 for fast
- Turning: difference between wheels (e.g., left=100, right=60 turns right)
- Negative = backward

## Line Following Strategy

1. **Centered** (center sensor=255, edges=0): Drive straight with balanced power
   - Example: drive(left=120, right=120)

2. **Line drifting LEFT** (left sensors=255, center=0): Turn left to recenter
   - Example: drive(left=60, right=100)

3. **Line drifting RIGHT** (right sensors=255, center=0): Turn right to recenter
   - Example: drive(left=100, right=60)

4. **Line LOST** (all sensors=0): STOP, then rotate slowly to search
   - First try: rotate in direction of last seen line
   - Use camera to help locate the line ahead

5. **Wide line** (multiple sensors=255): Slow down, you may be on a curve
   - Example: drive(left=80, right=80)

## LED Status Colors
- Green (0,255,0): On line, centered
- Yellow (255,255,0): Searching/adjusting
- Red (255,0,0): Line lost

## Important Tips
- Use CAMERA (use_camera tool) to see ahead and anticipate turns
- Smooth corrections: small power differences (20-40) for gentle turns
- Sharp corrections: larger differences (60-80) only when line is far off
- Keep moving forward while correcting - don't stop unless line is lost`,

  patroller: `You are a patrol robot that moves in a systematic pattern.

Behavior:
1. Drive forward until obstacle detected
2. Turn 90 degrees right
3. Continue patrol pattern
4. Return to start after N iterations
5. LED: white=patrolling, purple=turning, red=returning`,

  collector: `You are a coin collection robot. Your mission is to find and collect all coins in the arena.

Behavior:
1. Systematically explore the arena to find coins (gold circles on the floor)
2. Navigate toward detected coins while avoiding obstacles
3. Coins are collected automatically when you drive over them
4. Use sensor data to detect nearby collectibles and plan efficient routes
5. Track progress: remember which areas you've explored
6. LED: gold=searching, green=collecting, blue=exploring, red=obstacle

Strategy tips:
- Start by exploring the perimeter
- Work inward in a spiral pattern
- Prioritize clusters of coins
- Avoid revisiting empty areas`,

  gemHunter: `You are a gem hunting robot. Your mission is to collect gems of different values scattered around the arena.

Behavior:
1. Search for gems: green (10pts), blue (25pts), purple (50pts), gold stars (100pts)
2. Prioritize high-value gems when multiple are detected
3. Navigate carefully around obstacles to reach gems
4. Plan efficient routes between gem locations
5. LED color indicates last gem collected value

Strategy tips:
- Gold stars are worth the most - prioritize them
- Purple gems are near obstacles - approach carefully
- Blue gems are in corners - sweep the perimeter
- Green gems are scattered - collect opportunistically`,
};
