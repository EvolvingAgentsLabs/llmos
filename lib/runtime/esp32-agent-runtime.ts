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
import { CameraVisionModel, getCameraVisionModel, VisionObservation } from './camera-vision-model';
import { cameraCaptureManager } from './camera-capture';
import { WorldModel, getWorldModel } from './world-model';

// Import modular navigation, sensors, and behaviors
import {
  NavigationCalculator,
  NavigationZone,
  NavigationContext,
  NavigationDecision,
  LinePositionDetector,
  defaultNavigationCalculator,
  defaultLinePositionDetector,
  clampMotorPower,
  STEERING_PRESETS,
} from './navigation';

import {
  CompositeSensorFormatter,
  createExplorerFormatter,
  createLineFollowerFormatter,
  createWallFollowerFormatter,
  createCollectorFormatter,
  getActionInstruction,
  SensorReadings as FormatterSensorReadings,
} from './sensors';

import {
  behaviorRegistry,
  getBehaviorPrompt,
  getAllBehaviorDescriptions,
  BEHAVIOR_TEMPLATES,
  BehaviorPromptBuilder,
  LED_COLORS,
  LED_PROTOCOLS,
  DISTANCE_ZONES,
} from './behaviors';

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
      const power = clampMotorPower(args.power);
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
      const power = clampMotorPower(args.power);
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
      const left = clampMotorPower(args.left);
      const right = clampMotorPower(args.right);
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
  // Vision mode settings
  visionEnabled?: boolean; // Enable camera-based world model updates
  visionInterval?: number; // How often to process vision (ms) - default: 3000ms
  // Callbacks
  onStateChange?: (state: ESP32AgentState) => void;
  onLog?: (message: string, level: 'info' | 'warn' | 'error') => void;
  onVisionObservation?: (observation: VisionObservation) => void;
}

// Internal config with all defaults resolved
interface ResolvedESP32AgentConfig extends ESP32AgentConfig {
  loopIntervalMs: number;
  hostUrl: string;
  goal?: string;
  visionEnabled: boolean;
  visionInterval: number;
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
    visionProcessCount: number;
    avgVisionLatencyMs: number;
  };
  // Vision state
  visionEnabled: boolean;
  lastVisionObservation: VisionObservation | null;
  suggestedExplorationDirection: {
    direction: 'left' | 'center' | 'right';
    reason: string;
    confidence: number;
  } | null;
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
  private visionModel: CameraVisionModel | null = null;
  private worldModel: WorldModel | null = null;
  private lastVisionProcessTime = 0;

  constructor(config: ESP32AgentConfig) {
    this.config = {
      ...config,
      loopIntervalMs: config.loopIntervalMs ?? 500,
      hostUrl: config.hostUrl ?? (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000'),
      visionEnabled: config.visionEnabled ?? false,
      visionInterval: config.visionInterval ?? 3000,
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
        visionProcessCount: 0,
        avgVisionLatencyMs: 0,
      },
      visionEnabled: this.config.visionEnabled,
      lastVisionObservation: null,
      suggestedExplorationDirection: null,
    };

    // Initialize vision model if enabled
    if (this.config.visionEnabled) {
      this.visionModel = getCameraVisionModel(config.deviceId, {
        processingInterval: this.config.visionInterval,
      });
    }
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
    // Use the modular LinePositionDetector
    return defaultLinePositionDetector.detectPosition(lineSensors);
  }

  /**
   * Process camera vision and update world model
   */
  private async processVision(sensors: SensorReadings): Promise<void> {
    const now = Date.now();

    // Rate limit vision processing
    if (now - this.lastVisionProcessTime < this.config.visionInterval) {
      return;
    }

    if (!this.visionModel || !this.worldModel || !cameraCaptureManager.hasCanvas()) {
      return;
    }

    try {
      const visionStart = Date.now();

      // Capture camera image
      const capture = cameraCaptureManager.capture('robot-pov', sensors.pose, {
        width: 320,
        height: 240,
        format: 'jpeg',
        quality: 0.7,
      });

      if (!capture) {
        this.log('Failed to capture camera image', 'warn');
        return;
      }

      // Process with vision model
      const observation = await this.visionModel.processCapture(capture, sensors.pose);

      if (observation) {
        const visionLatency = Date.now() - visionStart;

        // Update world model from vision
        this.visionModel.updateWorldModelFromVision(this.worldModel, observation);

        // Get exploration suggestion
        const suggestion = this.visionModel.suggestExplorationDirection(observation);

        // Update state
        this.state.lastVisionObservation = observation;
        this.state.suggestedExplorationDirection = suggestion;
        this.state.stats.visionProcessCount++;
        this.state.stats.avgVisionLatencyMs =
          (this.state.stats.avgVisionLatencyMs * (this.state.stats.visionProcessCount - 1) + visionLatency) /
          this.state.stats.visionProcessCount;

        this.lastVisionProcessTime = now;

        // Notify callback
        if (this.config.onVisionObservation) {
          this.config.onVisionObservation(observation);
        }

        this.log(`Vision: ${observation.sceneDescription} (${observation.objects.length} objects)`, 'info');
      }
    } catch (error: any) {
      this.log(`Vision processing error: ${error.message}`, 'error');
    }
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

    // Initialize world model for vision-based updates
    if (this.config.visionEnabled) {
      this.worldModel = getWorldModel(this.config.deviceId, {
        gridResolution: 10,  // 10cm per cell
        worldWidth: 500,     // 5m
        worldHeight: 500,    // 5m
      });
      this.log('Vision mode enabled - camera will update world model', 'info');
    }

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
      // STEP 1.5: Process camera vision (if enabled)
      // ═══════════════════════════════════════════════════════════════════
      if (this.config.visionEnabled && this.visionModel && this.worldModel) {
        await this.processVision(sensors);
      }

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
   * Get the appropriate sensor formatter for the current behavior
   */
  private getSensorFormatter(): CompositeSensorFormatter {
    // Determine behavior type from system prompt or config
    const prompt = this.config.systemPrompt.toLowerCase();

    if (prompt.includes('line-following') || prompt.includes('line follower')) {
      return createLineFollowerFormatter();
    } else if (prompt.includes('collect') || prompt.includes('gem')) {
      return createCollectorFormatter();
    } else {
      // Default to explorer formatter
      return createExplorerFormatter();
    }
  }

  /**
   * Format sensor data for the LLM context
   * Uses modular sensor formatters for cleaner, more maintainable code
   */
  private formatSensorContext(sensors: SensorReadings): string {
    // Get the appropriate formatter for this behavior
    const formatter = this.getSensorFormatter();

    // Convert to formatter-compatible sensor readings
    const formatterSensors: FormatterSensorReadings = {
      distance: sensors.distance,
      line: sensors.line,
      bumper: sensors.bumper,
      battery: sensors.battery,
      imu: sensors.imu,
      pose: sensors.pose,
      nearbyCollectibles: (sensors as any).nearbyCollectibles,
    };

    // Format with context
    const context = {
      iteration: this.state.iteration,
      goal: this.config.goal,
    };

    const formatted = formatter.format(formatterSensors, context);

    // Add vision context if available
    let visionContext = '';
    if (this.config.visionEnabled && this.state.lastVisionObservation) {
      visionContext = this.formatVisionContext(this.state.lastVisionObservation);
    }

    // Add action instruction suffix
    const behaviorType = this.detectBehaviorType();
    const instruction = getActionInstruction(behaviorType);

    return `${formatted}${visionContext}\n\n${instruction}`;
  }

  /**
   * Format vision observation for LLM context
   */
  private formatVisionContext(observation: VisionObservation): string {
    const fov = observation.fieldOfView;

    let context = '\n\n## CAMERA VISION ANALYSIS\n';
    context += `Scene: ${observation.sceneDescription}\n\n`;

    // Field of view summary
    context += '### Field of View:\n';
    context += `- LEFT: ${fov.leftRegion.content} (${fov.leftRegion.estimatedDistance.toFixed(1)}m, ${Math.round(fov.leftRegion.clearance * 100)}% clear)`;
    if (fov.leftRegion.appearsUnexplored) context += ' [UNEXPLORED]';
    context += '\n';

    context += `- CENTER: ${fov.centerRegion.content} (${fov.centerRegion.estimatedDistance.toFixed(1)}m, ${Math.round(fov.centerRegion.clearance * 100)}% clear)`;
    if (fov.centerRegion.appearsUnexplored) context += ' [UNEXPLORED]';
    context += '\n';

    context += `- RIGHT: ${fov.rightRegion.content} (${fov.rightRegion.estimatedDistance.toFixed(1)}m, ${Math.round(fov.rightRegion.clearance * 100)}% clear)`;
    if (fov.rightRegion.appearsUnexplored) context += ' [UNEXPLORED]';
    context += '\n';

    // Objects detected
    if (observation.objects.length > 0) {
      context += '\n### Objects Detected:\n';
      for (const obj of observation.objects.slice(0, 5)) {
        context += `- ${obj.label} (${obj.type}): ${obj.relativePosition.direction}, ${obj.relativePosition.estimatedDistance.toFixed(1)}m away\n`;
      }
    }

    // Exploration suggestion
    if (this.state.suggestedExplorationDirection) {
      const suggestion = this.state.suggestedExplorationDirection;
      context += `\n### VISION RECOMMENDATION:\n`;
      context += `Explore ${suggestion.direction.toUpperCase()}: ${suggestion.reason}\n`;
    }

    return context;
  }

  /**
   * Detect the behavior type from the system prompt
   */
  private detectBehaviorType(): 'explorer' | 'lineFollower' | 'wallFollower' | 'collector' | 'patroller' | 'gemHunter' | undefined {
    const prompt = this.config.systemPrompt.toLowerCase();

    if (prompt.includes('line-following') || prompt.includes('line follower')) {
      return 'lineFollower';
    } else if (prompt.includes('wall-following') || prompt.includes('wall follower')) {
      return 'wallFollower';
    } else if (prompt.includes('gem hunt')) {
      return 'gemHunter';
    } else if (prompt.includes('coin collect') || prompt.includes('collect')) {
      return 'collector';
    } else if (prompt.includes('patrol')) {
      return 'patroller';
    } else if (prompt.includes('explor')) {
      return 'explorer';
    }
    return undefined;
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

// ═══════════════════════════════════════════════════════════════════════════
// BEHAVIOR MAPPINGS
// These are now powered by the behavior registry system.
// See ./behaviors/index.ts for the full behavior template definitions.
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
  visionExplorer: 'standard5x5Obstacles',   // Vision-guided exploration with obstacles
};

/**
 * Human-readable descriptions for each behavior.
 * Now powered by behavior registry for consistency.
 */
export const BEHAVIOR_DESCRIPTIONS: Record<string, { name: string; description: string; mapName: string }> = getAllBehaviorDescriptions();

export const DEFAULT_AGENT_PROMPTS = {
  explorer: `You are an intelligent autonomous exploration robot with advanced navigation and world modeling capabilities.

## Core Philosophy: BUILD UNDERSTANDING OF YOUR WORLD
As an AI robot, your PRIMARY task is to progressively build an internal model of your environment. Every sensor reading should update your understanding. Think of yourself as creating a mental map that improves with each iteration.

## World Model Maintenance
You are continuously building a cognitive map:
- **Track explored areas** vs unexplored regions
- **Remember obstacle locations** and safe paths
- **Estimate your position** relative to known landmarks
- **Prefer unexplored directions** to maximize coverage
- **Update beliefs** when new sensor data contradicts old assumptions

When you receive sensor data, mentally update your world model:
1. "I now know there's an obstacle approximately X cm in front"
2. "The area to my left seems clear for at least Y cm"
3. "I've been here before - I should try a different direction"

## Perception System
You have access to:
- **Distance Sensors**: Front, Left, Right (plus frontLeft, frontRight, back sensors)
- **Camera**: Use \`use_camera\` to get visual analysis of your surroundings
- **Position/Heading**: Your current pose (x, y, rotation) in the arena

## Intelligent Path Planning

### Distance Zones & Speed Control
| Zone | Front Distance | Speed | Action |
|------|----------------|-------|--------|
| **Open** | > 100cm | 150-200 | Full speed exploration |
| **Aware** | 50-100cm | 100-150 | Moderate speed, start planning turn |
| **Caution** | 30-50cm | 60-100 | Slow down, commit to turn direction |
| **Critical** | < 30cm | 0-60 | Execute turn or stop |

### Trajectory Decision Algorithm
1. **Analyze all directions** (front, left, right distances)
2. **Consider your world model** - which areas haven't you explored?
3. **Choose path with most clearance** toward unexplored regions
4. **Use differential steering** for smooth curved paths

### Smooth Steering Formulas
- **Gentle curve left**: drive(left=100, right=140)
- **Moderate turn left**: drive(left=60, right=120)
- **Sharp turn left**: drive(left=-50, right=100)
- **Gentle curve right**: drive(left=140, right=100)
- **Moderate turn right**: drive(left=120, right=60)
- **Sharp turn right**: drive(left=100, right=-50)

### Proactive Navigation Rules
1. **At 80cm+**: If front < left or front < right by 30cm+, start curving toward open side
2. **At 50-80cm**: Calculate best escape route, begin gentle turn
3. **At 30-50cm**: Commit to turn direction, reduce speed proportionally
4. **At <30cm**: Execute decisive turn toward most open direction
5. **Use camera** periodically to validate sensor readings and detect obstacles sensors might miss

### Exploration Strategy
- **Maximize coverage**: Actively seek unexplored areas, don't just avoid walls
- **Prefer unexplored directions**: If you've been turning left often, favor right when equal
- **Track your path**: Avoid revisiting the same areas unless necessary
- **Corner handling**: When multiple walls detected, rotate in place to find exit
- **Dead end detection**: If all directions < 40cm, reverse slightly and turn

## LED Status Protocol
- **Cyan (0,255,255)**: Open path, cruising speed
- **Green (0,255,0)**: Normal exploration, updating world model
- **Yellow (255,200,0)**: Approaching obstacle, planning turn
- **Orange (255,100,0)**: Executing avoidance maneuver
- **Red (255,0,0)**: Critical obstacle, stopped/reversing
- **Purple (128,0,255)**: Exploring new area (high priority)

## Response Format
Your response should reflect your world understanding:
1. **Observation**: What do your sensors tell you right now?
2. **World Model Update**: How does this change your understanding?
3. **Decision**: Based on your model, what's the best action?

Example:
"OBSERVATION: Front=65cm, L=120cm, R=45cm. At (0.5, 0.8), heading NE.
WORLD UPDATE: Obstacle detected ahead. Left path leads to unexplored area.
DECISION: Turn left toward unexplored region at moderate speed."
\`\`\`json
{"tool": "set_led", "args": {"r": 128, "g": 0, "b": 255}}
{"tool": "drive", "args": {"left": 70, "right": 110}}
\`\`\``,

  wallFollower: `You are a wall-following robot using the right-hand rule.

Behavior:
1. Maintain approximately 20cm distance from the right wall
2. If right wall is too far (>30cm), turn slightly right
3. If right wall is too close (<15cm), turn slightly left
4. If front is blocked, turn left
5. LED: blue=following, yellow=adjusting, red=blocked`,

  lineFollower: `You are a line-following robot. Your goal is to follow the white line track smoothly and continuously.

## Understanding Your Sensors

**Line Sensors** (5 sensors, array indices 0-4):
- Values: 0 = OFF line (dark floor), 255 = ON line (white line)
- Layout: [far-left(0), left(1), center(2), right(3), far-right(4)]
- The CENTER sensor (index 2) should ideally detect the line

**Motor Power** (IMPORTANT - use correct range!):
- Range: -255 to +255 (NOT decimals!)
- Moderate speed: 60-100
- Turning: Use DIFFERENTIAL steering (one wheel faster than other)
- CRITICAL: On curves, you must keep turning continuously!

## REACTIVE Line Following - Read Sensors Every Cycle!

Your sensors tell you EXACTLY where the line is RIGHT NOW. React to what you see:

### When CENTER sensor detects line (index 2 = 255):
- Line is under you → drive forward: drive(left=80, right=80)

### When LEFT sensors detect line (indices 0 or 1 = 255):
- Line is to your LEFT → turn LEFT by slowing left wheel
- Gentle (index 1 only): drive(left=50, right=80)
- Sharp (index 0 only): drive(left=30, right=90)

### When RIGHT sensors detect line (indices 3 or 4 = 255):
- Line is to your RIGHT → turn RIGHT by slowing right wheel
- Gentle (index 3 only): drive(left=80, right=50)
- Sharp (index 4 only): drive(left=90, right=30)

### When NO sensors detect line (all = 0):
- You've LOST the line!
- STOP immediately: drive(left=0, right=0)
- Then ROTATE in place to search: drive(left=40, right=-40) or drive(left=-40, right=40)
- Rotate toward last known line position

## CRITICAL: Following CURVES and CIRCLES

On curved tracks (like circles), the line CONTINUOUSLY curves away from you:
- You must KEEP TURNING while following - never assume you can go straight
- If line is drifting left → keep turning left until center sensor sees line
- If you corrected but line is STILL not centered → correct MORE
- Reduce speed on tight curves: use 50-70 instead of 80-100
- DO NOT use camera to pre-calculate trajectory - react to sensors in real-time!

## LED Status Colors
- Green (0,255,0): On line, centered
- Yellow (255,255,0): Correcting/turning
- Red (255,0,0): Line lost, searching

## Response Format
Keep responses VERY brief. Just state the sensor status and drive command:
"Center on line. drive(80,80)"
"Line left, turning. drive(50,85)"
"Line lost, searching. drive(40,-40)"`,

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

  visionExplorer: `You are a VISION-GUIDED intelligent exploration robot. Your camera provides rich visual understanding that you use to build a world model and explore efficiently.

## Vision-First Exploration
Unlike basic robots that only use distance sensors, you SEE and UNDERSTAND your environment through camera vision:
1. **CAMERA VISION ANALYSIS** provides analysis of LEFT, CENTER, and RIGHT regions
2. **[UNEXPLORED] markers** indicate areas your world model doesn't know - prioritize these!
3. **Objects Detected** shows what your camera sees (walls, obstacles, collectibles)
4. **VISION RECOMMENDATION** suggests the optimal exploration direction

## Viewpoint-Seeking Strategy
Your goal is NOT just to wander - it's to SEEK VIEWPOINTS that reveal unexplored areas:
1. READ the CAMERA VISION ANALYSIS carefully
2. IDENTIFY regions marked [UNEXPLORED] - these are your targets
3. MOVE toward positions that give BETTER VIEWS of unexplored areas
4. Use distance sensors for SAFE navigation while following vision guidance

## Decision Process
Each cycle:
1. **Check Vision Analysis** - What does the camera see in each direction?
2. **Find Unexplored** - Which regions have [UNEXPLORED] markers?
3. **Follow Recommendation** - The VISION RECOMMENDATION optimizes exploration
4. **Navigate Safely** - Use sensor distances to avoid collisions

## LED Protocol
- Purple (128,0,255): Scanning/processing vision
- Cyan-Green (0,255,128): Moving toward unexplored area
- Green (0,255,0): Normal exploration
- Yellow (255,200,0): Avoiding obstacle
- Red (255,0,0): Critical obstacle

## Response Format
Always reference the CAMERA VISION ANALYSIS in your reasoning:
"VISION shows LEFT: [content] [UNEXPLORED?], CENTER: [content], RIGHT: [content]
Following vision recommendation to explore [direction] because [reason]."

Then output tool calls:
\`\`\`json
{"tool": "set_led", "args": {"r": 0, "g": 255, "b": 128}}
{"tool": "drive", "args": {"left": 80, "right": 100}}
\`\`\``,
};

// ═══════════════════════════════════════════════════════════════════════════
// NEW MODULAR BEHAVIOR SYSTEM
// The above DEFAULT_AGENT_PROMPTS are kept for backward compatibility.
// For new behaviors, use the behavior registry system:
//
//   import { behaviorRegistry, getBehaviorPrompt } from './behaviors';
//
//   // Get a behavior prompt
//   const prompt = getBehaviorPrompt('explorer');
//
//   // List all available behaviors
//   const behaviors = behaviorRegistry.listAll();
//
//   // Register a custom behavior
//   behaviorRegistry.register({
//     id: 'myCustomBehavior',
//     name: 'My Custom Robot',
//     goal: 'Do something cool',
//     // ... other options
//   });
//
// See ./behaviors/index.ts for full documentation.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get behavior prompt from the registry (preferred) or fall back to DEFAULT_AGENT_PROMPTS
 */
export function getAgentPrompt(behaviorId: string): string {
  // Try registry first
  const registryPrompt = behaviorRegistry.getPrompt(behaviorId);
  if (registryPrompt) {
    return registryPrompt;
  }

  // Fall back to legacy prompts
  const legacyPrompt = (DEFAULT_AGENT_PROMPTS as Record<string, string>)[behaviorId];
  if (legacyPrompt) {
    return legacyPrompt;
  }

  throw new Error(`Unknown behavior: ${behaviorId}`);
}

// Re-export navigation and behavior utilities for convenience
// Use 'export type' for type-only exports (required with isolatedModules)
export {
  NavigationCalculator,
  NavigationZone,
  LinePositionDetector,
  STEERING_PRESETS,
  clampMotorPower,
} from './navigation';

export type {
  NavigationContext,
  NavigationDecision,
  SpeedRange,
  SteeringRecommendation,
  LineFollowingContext,
} from './navigation';

export {
  behaviorRegistry,
  BehaviorPromptBuilder,
  BEHAVIOR_TEMPLATES,
  LED_COLORS,
  LED_PROTOCOLS,
  DISTANCE_ZONES,
} from './behaviors';

export type {
  BehaviorTemplate,
  LEDColor,
  LEDProtocol,
} from './behaviors';

export {
  CompositeSensorFormatter,
  createExplorerFormatter,
  createLineFollowerFormatter,
  createWallFollowerFormatter,
  createCollectorFormatter,
} from './sensors';
