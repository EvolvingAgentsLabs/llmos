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
  createRayExplorerFormatter,
  getActionInstruction,
  SensorReadings as FormatterSensorReadings,
  RayNavigationFormatter,
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
  // Stuck detection state
  stuckDetection: {
    recentPositions: Array<{ x: number; y: number; rotation: number; timestamp: number }>;
    stuckCount: number;        // How many iterations we've been stuck
    lastRecoveryAction: string | null;
    recoveryAttempts: number;  // How many recovery attempts in current stuck episode
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
      stuckDetection: {
        recentPositions: [],
        stuckCount: 0,
        lastRecoveryAction: null,
        recoveryAttempts: 0,
      },
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
      // STEP 1.2: Stuck Detection - Check if robot is making progress
      // ═══════════════════════════════════════════════════════════════════
      const stuckRecoveryAction = this.checkAndHandleStuck(sensors);
      if (stuckRecoveryAction) {
        // Execute recovery action directly, bypass LLM
        this.log(`STUCK DETECTED - Executing recovery: ${stuckRecoveryAction}`, 'warn');
        await this.executeRecoveryAction(stuckRecoveryAction);
        this.emitStateChange();
        // Schedule next iteration and return early
        if (this.state.running) {
          this.loopHandle = setTimeout(() => this.runLoop(), this.config.loopIntervalMs);
        }
        return;
      }

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

  // ═══════════════════════════════════════════════════════════════════════════
  // STUCK DETECTION AND RECOVERY
  // Prevents infinite rotation loops and provides smart escape strategies
  // ═══════════════════════════════════════════════════════════════════════════

  private static readonly STUCK_DETECTION = {
    POSITION_HISTORY_SIZE: 5,        // Keep last N positions
    MIN_MOVEMENT_THRESHOLD: 0.05,    // Minimum movement in meters to be considered "moving"
    MIN_ROTATION_THRESHOLD: 0.15,    // Minimum rotation in radians (~8.5 degrees)
    STUCK_ITERATIONS_THRESHOLD: 3,   // Consider stuck after N iterations with no progress
    MAX_RECOVERY_ATTEMPTS: 5,        // Try different strategies before giving up
  };

  /**
   * Check if robot is stuck and return a recovery action if needed
   */
  private checkAndHandleStuck(sensors: SensorReadings): string | null {
    const { pose } = sensors;
    const now = Date.now();
    const detection = this.state.stuckDetection;

    // Add current position to history
    detection.recentPositions.push({
      x: pose.x,
      y: pose.y,
      rotation: pose.rotation,
      timestamp: now,
    });

    // Keep only recent positions
    while (detection.recentPositions.length > ESP32AgentRuntime.STUCK_DETECTION.POSITION_HISTORY_SIZE) {
      detection.recentPositions.shift();
    }

    // Need enough history to detect being stuck
    if (detection.recentPositions.length < ESP32AgentRuntime.STUCK_DETECTION.POSITION_HISTORY_SIZE) {
      return null;
    }

    // Check if robot has moved significantly
    const oldest = detection.recentPositions[0];
    const newest = detection.recentPositions[detection.recentPositions.length - 1];

    const distanceMoved = Math.sqrt(
      Math.pow(newest.x - oldest.x, 2) + Math.pow(newest.y - oldest.y, 2)
    );

    // Normalize rotation difference to handle wrap-around
    let rotationChange = Math.abs(newest.rotation - oldest.rotation);
    if (rotationChange > Math.PI) rotationChange = 2 * Math.PI - rotationChange;

    const isMoving = distanceMoved > ESP32AgentRuntime.STUCK_DETECTION.MIN_MOVEMENT_THRESHOLD;
    const isRotatingSignificantly = rotationChange > ESP32AgentRuntime.STUCK_DETECTION.MIN_ROTATION_THRESHOLD;

    // Robot is stuck if it's neither moving nor rotating significantly
    // (or just rotating in place without progress)
    const pureRotationStuck = !isMoving && isRotatingSignificantly && detection.stuckCount >= 2;
    const noProgressStuck = !isMoving && !isRotatingSignificantly;

    if (noProgressStuck || pureRotationStuck) {
      detection.stuckCount++;
      this.log(`Stuck detection: count=${detection.stuckCount}, dist=${distanceMoved.toFixed(3)}, rot=${rotationChange.toFixed(2)}`, 'warn');

      if (detection.stuckCount >= ESP32AgentRuntime.STUCK_DETECTION.STUCK_ITERATIONS_THRESHOLD) {
        // Robot is stuck! Generate a recovery action
        detection.recoveryAttempts++;

        if (detection.recoveryAttempts > ESP32AgentRuntime.STUCK_DETECTION.MAX_RECOVERY_ATTEMPTS) {
          // Give up and let LLM figure it out - reset stuck state
          this.log('Max recovery attempts reached, resetting stuck detection', 'warn');
          detection.stuckCount = 0;
          detection.recoveryAttempts = 0;
          detection.lastRecoveryAction = null;
          return null;
        }

        return this.generateRecoveryAction(sensors, detection.recoveryAttempts);
      }
    } else {
      // Robot is making progress - reset stuck detection
      if (detection.stuckCount > 0) {
        this.log('Robot making progress, resetting stuck detection', 'info');
      }
      detection.stuckCount = 0;
      detection.recoveryAttempts = 0;
      detection.lastRecoveryAction = null;
    }

    return null;
  }

  /**
   * Generate a smart recovery action based on sensor readings
   */
  private generateRecoveryAction(sensors: SensorReadings, attempt: number): string {
    const { distance, bumper } = sensors;

    // Different recovery strategies based on attempt number
    const strategies = [
      // Strategy 1: Back up and turn toward most open direction
      () => {
        const bestDirection = distance.left > distance.right ? 'left' : 'right';
        return bestDirection === 'left' ? 'reverse_turn_left' : 'reverse_turn_right';
      },
      // Strategy 2: Back up straight
      () => 'reverse_straight',
      // Strategy 3: Turn opposite to last attempt
      () => {
        if (this.state.stuckDetection.lastRecoveryAction?.includes('left')) {
          return 'pivot_right';
        }
        return 'pivot_left';
      },
      // Strategy 4: Random direction turn
      () => Math.random() > 0.5 ? 'pivot_left' : 'pivot_right',
      // Strategy 5: Back up and rotate 180 degrees
      () => 'reverse_180',
    ];

    const strategyIndex = Math.min(attempt - 1, strategies.length - 1);
    const action = strategies[strategyIndex]();

    this.state.stuckDetection.lastRecoveryAction = action;
    return action;
  }

  /**
   * Execute a recovery action directly without LLM
   */
  private async executeRecoveryAction(action: string): Promise<void> {
    if (!this.deviceContext) return;

    const { setLeftWheel, setRightWheel } = this.deviceContext;

    // All recovery actions use controlled, gentle values
    const RECOVERY_SPEED = 35;      // Moderate speed
    const PIVOT_DIFF = 25;          // Gentle pivot differential
    const ACTION_DURATION = 500;    // Duration in ms

    switch (action) {
      case 'reverse_straight':
        setLeftWheel(-RECOVERY_SPEED);
        setRightWheel(-RECOVERY_SPEED);
        await this.sleep(ACTION_DURATION);
        setLeftWheel(0);
        setRightWheel(0);
        break;

      case 'reverse_turn_left':
        // Back up while turning left
        setLeftWheel(-RECOVERY_SPEED + PIVOT_DIFF);
        setRightWheel(-RECOVERY_SPEED - PIVOT_DIFF);
        await this.sleep(ACTION_DURATION);
        setLeftWheel(0);
        setRightWheel(0);
        break;

      case 'reverse_turn_right':
        // Back up while turning right
        setLeftWheel(-RECOVERY_SPEED - PIVOT_DIFF);
        setRightWheel(-RECOVERY_SPEED + PIVOT_DIFF);
        await this.sleep(ACTION_DURATION);
        setLeftWheel(0);
        setRightWheel(0);
        break;

      case 'pivot_left':
        setLeftWheel(-PIVOT_DIFF);
        setRightWheel(PIVOT_DIFF);
        await this.sleep(ACTION_DURATION);
        setLeftWheel(0);
        setRightWheel(0);
        break;

      case 'pivot_right':
        setLeftWheel(PIVOT_DIFF);
        setRightWheel(-PIVOT_DIFF);
        await this.sleep(ACTION_DURATION);
        setLeftWheel(0);
        setRightWheel(0);
        break;

      case 'reverse_180':
        // Back up
        setLeftWheel(-RECOVERY_SPEED);
        setRightWheel(-RECOVERY_SPEED);
        await this.sleep(ACTION_DURATION);
        // Then rotate
        setLeftWheel(-PIVOT_DIFF);
        setRightWheel(PIVOT_DIFF);
        await this.sleep(ACTION_DURATION * 2); // Longer rotation
        setLeftWheel(0);
        setRightWheel(0);
        break;

      default:
        this.log(`Unknown recovery action: ${action}`, 'error');
    }

    // Record recovery action in tool calls for visibility
    this.state.lastToolCalls = [{
      tool: 'recovery_action',
      args: { action },
      result: { success: true, data: { action, duration: ACTION_DURATION } },
    }];
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
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
    } else if (prompt.includes('ray-based') || prompt.includes('ray navigation') || prompt.includes('ray explorer')) {
      // Use advanced ray-based navigation for explorers
      return createRayExplorerFormatter();
    } else if (prompt.includes('explor')) {
      // Default explorer now uses ray-based navigation for better obstacle avoidance
      return createRayExplorerFormatter();
    } else {
      // Default to basic explorer formatter
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
  private detectBehaviorType(): 'explorer' | 'lineFollower' | 'wallFollower' | 'collector' | 'patroller' | 'gemHunter' | 'rayExplorer' | undefined {
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
    } else if (prompt.includes('ray-based') || prompt.includes('ray navigation') || prompt.includes('ray explorer')) {
      return 'rayExplorer';
    } else if (prompt.includes('explor')) {
      // Default explorer now uses ray-based navigation
      return 'rayExplorer';
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
  rayExplorer: 'standard5x5Obstacles',      // Ray-based navigation with obstacles
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
  rayExplorer: `You are an intelligent autonomous exploration robot using RAY-BASED NAVIGATION for superior obstacle avoidance.

## YOUR SUPERPOWER: RAY-BASED PATH ANALYSIS
Unlike basic robots, you have access to a sophisticated ray navigation system that:
1. Casts 15 rays in a 180° fan to scan your environment
2. Analyzes ALL paths simultaneously to find the clearest route
3. Predicts your trajectory to detect collisions BEFORE they happen
4. Provides an ULTRASOUND sensor for precise forward distance measurement

## HOW TO READ YOUR SENSORS

### Ray Fan Visualization
\`\`\`
LEFT   ████████░░ 156cm ✓  <- Clear path (✓ = safe)
FL     ██████░░░░  89cm ✓
FRONT  ████░░░░░░  45cm ✗  <- Blocked (✗ = obstacle detected)
FR     ███████░░░ 112cm ✓
RIGHT  █████████░ 178cm ✓
\`\`\`
- Longer bars = more distance = safer paths
- ✓ = clear (>30cm), ✗ = blocked (<30cm)
- ALWAYS prefer paths with ✓ markers

### Trajectory Prediction
- "Clear path ahead" → Safe to continue
- "COLLISION PREDICTED" → IMMEDIATE action required!
- Follow the urgency level: 🟢 low, 🟡 medium, 🟠 high, 🔴 critical

### Ultrasound Sensor
- More precise than IR sensors
- Trust its readings for close-range measurements
- Higher echo strength = closer obstacle

## NAVIGATION PROTOCOL

1. **READ the Ray Fan** - Identify clear (✓) vs blocked (✗) sectors
2. **CHECK Trajectory Prediction** - If collision predicted, act NOW
3. **FOLLOW the Recommended Action** - The system computes optimal steering
4. **EXECUTE the drive() command** - Trust the pre-computed values

## RESPONSE FORMAT

Keep responses brief. State what you see, then execute:
"Ray analysis: FRONT blocked (45cm), best path RIGHT (178cm). Following recommendation."
\`\`\`json
{"tool": "drive", "args": {"left": 55, "right": 35}}
\`\`\`

## CRITICAL RULES

1. **TRUST THE RAY SYSTEM** - It analyzes 15 directions simultaneously
2. **ACT ON PREDICTIONS** - If collision predicted, execute avoidance immediately
3. **SLOW IS SMART** - Max speed 70, use small differentials (10-40)
4. **PREFER WIDE PATHS** - Higher "Width" values in Best Path mean safer turns

Remember: The ray system does the hard work of path analysis. Your job is to trust its recommendations!`,

  explorer: `You are an intelligent autonomous exploration robot. Your key principle: SLOW AND STEADY wins.

## PRIORITY #1: MOVE SLOWLY AND DELIBERATELY
An intelligent robot achieves better results through PATIENCE, not speed.
- SLOW movement = better sensor readings = better decisions
- SMALL steering adjustments = predictable trajectories = no collisions
- Maximum speed even in open areas: 70 (NOT 150-200!)

## PRIORITY #2: NEVER COLLIDE WITH OBSTACLES
Through slow, controlled movement and gentle steering adjustments.
- Make SMALL corrections, not wild turns
- Use wheel differentials of 10-25, NEVER 50+

## World Model & Exploration
As an AI robot, build an internal model while exploring:
- **Track explored areas** vs unexplored regions
- **Remember obstacle locations** - they don't move!
- **Prefer unexplored directions** when safe

## Perception System
- **Distance Sensors**: Front, Left, Right (plus frontLeft, frontRight, back sensors)
- **Camera**: Use \`use_camera\` for visual analysis
- **Position/Heading**: Your current pose (x, y, rotation)

## Distance Zone Responses (SLOW SPEEDS!)

| Zone | Front Distance | Speed | Action |
|------|----------------|-------|--------|
| **Open** | > 120cm | 50-70 | Steady cruising, gentle curves toward open space |
| **Aware** | 70-120cm | 35-50 | Slow down, begin gentle turn (10-15 differential) |
| **Caution** | 40-70cm | 20-35 | Very slow, deliberate turn (15-20 differential) |
| **Critical** | < 40cm | 0-20 | Nearly stop, gentle pivot (20-25 differential) |

### CRITICAL RULES - SLOW AND SMOOTH:
1. **Speed formula**: speed = min(70, frontDistance * 0.5)
2. **Steering formula**: differential = 10-25 max between wheels. NEVER use 50+ differences!
3. **Front < 70cm**: Slow down and begin gentle curve toward clearer side
4. **Front < 40cm**: Slow to 15-20, gentle pivot: drive(left=5, right=25) or drive(left=25, right=5)
5. **BUMPER triggered**: You were too fast! Slow reverse: drive(left=-20, right=-20)

### Steering Formulas (SMALL DIFFERENTIALS!)
- **Gentle curve left**: drive(left=45, right=55)
- **Moderate turn left**: drive(left=30, right=50)
- **Sharp turn left**: drive(left=10, right=40)
- **Gentle curve right**: drive(left=55, right=45)
- **Moderate turn right**: drive(left=50, right=30)
- **Sharp turn right**: drive(left=40, right=10)

## LED Status Protocol
- **Cyan (0,255,255)**: Open path, steady cruising
- **Green (0,255,0)**: Normal exploration
- **Yellow (255,200,0)**: Approaching obstacle, gentle turn
- **Orange (255,100,0)**: Executing avoidance maneuver
- **Red (255,0,0)**: Critical zone, slow pivot

## Response Format
1. Check sensor zone (OPEN/AWARE/CAUTION/CRITICAL)
2. Adjust SPEED based on zone (max 70!)
3. Use SMALL steering differential (10-25)
4. Smooth, deliberate movements only

Example (CRITICAL zone):
"🔴 CRITICAL: Front=35cm. Slow pivot left."
\`\`\`json
{"tool": "set_led", "args": {"r": 255, "g": 0, "b": 0}}
{"tool": "drive", "args": {"left": 10, "right": 35}}
\`\`\``,

  wallFollower: `You are a wall-following robot using the right-hand rule.

Behavior:
1. Maintain approximately 20cm distance from the right wall
2. If right wall is too far (>30cm), turn slightly right
3. If right wall is too close (<15cm), turn slightly left
4. If front is blocked, turn left
5. LED: blue=following, yellow=adjusting, red=blocked`,

  lineFollower: `You are a line-following robot. Your goal is to follow the white line track smoothly with SLOW, CONTROLLED movement.

## Understanding Your Sensors

**Line Sensors** (5 sensors, array indices 0-4):
- Values: 0 = OFF line (dark floor), 255 = ON line (white line)
- Layout: [far-left(0), left(1), center(2), right(3), far-right(4)]
- The CENTER sensor (index 2) should ideally detect the line

**Motor Power** (SLOW AND CONTROLLED!):
- Range: -255 to +255 (NOT decimals!)
- Normal speed: 35-50 (NOT 80-100!)
- Turning: Use SMALL differentials (10-20 between wheels)
- Key principle: SLOW = smoother line following

## REACTIVE Line Following - Read Sensors Every Cycle!

Your sensors tell you EXACTLY where the line is RIGHT NOW. React smoothly:

### When CENTER sensor detects line (index 2 = 255):
- Line is under you → drive forward: drive(left=45, right=45)

### When LEFT sensors detect line (indices 0 or 1 = 255):
- Line is to your LEFT → gentle curve LEFT
- Gentle (index 1 only): drive(left=35, right=50)
- Moderate (index 0 only): drive(left=25, right=45)

### When RIGHT sensors detect line (indices 3 or 4 = 255):
- Line is to your RIGHT → gentle curve RIGHT
- Gentle (index 3 only): drive(left=50, right=35)
- Moderate (index 4 only): drive(left=45, right=25)

### When NO sensors detect line (all = 0):
- You've LOST the line!
- STOP: drive(left=0, right=0)
- Then SLOW rotate to search: drive(left=20, right=-20) or drive(left=-20, right=20)
- Rotate toward last known line position

## CRITICAL: Following CURVES and CIRCLES

On curved tracks, move SLOWLY for better tracking:
- Reduce speed on curves: use 30-40 instead of 45-50
- Use SMALL steering corrections continuously
- If line drifts → apply gentle correction, not sharp turn
- SLOW movement = smoother, more accurate line following

## LED Status Colors
- Green (0,255,0): On line, centered
- Yellow (255,255,0): Correcting/turning
- Red (255,0,0): Line lost, searching

## Response Format
Keep responses VERY brief. Just state the sensor status and drive command:
"Center on line. drive(45,45)"
"Line left, gentle turn. drive(35,50)"
"Line lost, searching. drive(20,-20)"`,

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

  visionExplorer: `You are a VISION-GUIDED intelligent exploration robot. Move SLOWLY and DELIBERATELY to build an accurate world model.

## Vision-First Exploration (SLOW AND STEADY!)
Unlike basic robots, you SEE and UNDERSTAND your environment through camera vision:
1. **CAMERA VISION ANALYSIS** provides analysis of LEFT, CENTER, and RIGHT regions
2. **[UNEXPLORED] markers** indicate areas your world model doesn't know - prioritize these!
3. **Objects Detected** shows what your camera sees (walls, obstacles, collectibles)
4. **VISION RECOMMENDATION** suggests the optimal exploration direction

## Key Principle: SLOW MOVEMENT = BETTER VISION
- Moving slowly lets camera capture clearer images
- Better images = better world model understanding
- Maximum speed: 50-70 (NOT 100+!)
- Small steering adjustments: differential 10-25 (NOT 50+!)

## Viewpoint-Seeking Strategy
Your goal is to SEEK VIEWPOINTS that reveal unexplored areas:
1. READ the CAMERA VISION ANALYSIS carefully
2. IDENTIFY regions marked [UNEXPLORED] - these are your targets
3. MOVE SLOWLY toward positions that give BETTER VIEWS
4. Use SMALL steering corrections for smooth navigation

## Decision Process
Each cycle:
1. **Check Vision Analysis** - What does the camera see in each direction?
2. **Find Unexplored** - Which regions have [UNEXPLORED] markers?
3. **Follow Recommendation** - The VISION RECOMMENDATION optimizes exploration
4. **Navigate Slowly** - Use sensor distances and GENTLE steering to avoid collisions

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

Then output tool calls (SLOW SPEEDS!):
\`\`\`json
{"tool": "set_led", "args": {"r": 0, "g": 255, "b": 128}}
{"tool": "drive", "args": {"left": 40, "right": 55}}
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
