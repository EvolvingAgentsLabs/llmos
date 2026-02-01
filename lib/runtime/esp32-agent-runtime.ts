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
import { TrajectoryPlanner, getTrajectoryPlanner, clearTrajectoryPlanner } from './trajectory-planner';

// HAL Integration - Hardware Abstraction Layer for simulation/physical duality
import {
  HALToolExecutor,
  getHALToolExecutor,
  setGlobalHAL,
  createHAL,
  HAL_TOOL_DEFINITIONS,
  HardwareAbstractionLayer,
  HALToolCall,
} from '../hal';

// Physical Skill Loader - "Skill Cartridge" system
import {
  PhysicalSkill,
  getPhysicalSkillLoader,
} from '../skills/physical-skill-loader';

// Dreaming Engine - BlackBox recording for evolution
import {
  getBlackBoxRecorder,
  RecordingSession,
} from '../evolution/black-box-recorder';

// Robot Navigation Debugger - Comprehensive debugging for navigation issues
import {
  getRobotDebugger,
  RobotNavigationDebugger,
} from '../debug/robot-navigation-debugger';

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
  FormatContext,
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
  velocity?: { linear: number; angular: number }; // For trajectory prediction
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
// HAL-COMPATIBLE DEVICE TOOLS
// These provide the Hardware Abstraction Layer interface for Physical Skills.
// Same tool names work in simulation and on physical ESP32 hardware.
// ═══════════════════════════════════════════════════════════════════════════

export const HAL_DEVICE_TOOLS: DeviceTool[] = [
  {
    name: 'hal_drive',
    description: 'Control wheel motors for differential drive locomotion. HAL-compatible.',
    parameters: {
      left: { type: 'number', description: 'Left wheel power (-255 to 255)', required: true },
      right: { type: 'number', description: 'Right wheel power (-255 to 255)', required: true },
      duration_ms: { type: 'number', description: 'Optional duration before auto-stop', required: false },
    },
    execute: async (args, ctx) => {
      const left = clampMotorPower(args.left);
      const right = clampMotorPower(args.right);
      ctx.setLeftWheel(left);
      ctx.setRightWheel(right);

      // Handle duration if specified
      if (args.duration_ms && args.duration_ms > 0) {
        setTimeout(() => {
          ctx.setLeftWheel(0);
          ctx.setRightWheel(0);
        }, args.duration_ms);
      }

      return { success: true, data: { left, right, duration_ms: args.duration_ms } };
    },
  },
  {
    name: 'hal_stop',
    description: 'Stop all locomotion immediately. HAL-compatible.',
    parameters: {},
    execute: async (args, ctx) => {
      ctx.setLeftWheel(0);
      ctx.setRightWheel(0);
      return { success: true, data: { stopped: true } };
    },
  },
  {
    name: 'hal_set_led',
    description: 'Control robot LED indicators. HAL-compatible.',
    parameters: {
      r: { type: 'number', description: 'Red (0-255)', required: true },
      g: { type: 'number', description: 'Green (0-255)', required: true },
      b: { type: 'number', description: 'Blue (0-255)', required: true },
      pattern: { type: 'string', description: 'Pattern: solid, blink, pulse', required: false },
    },
    execute: async (args, ctx) => {
      const r = Math.max(0, Math.min(255, Math.round(args.r)));
      const g = Math.max(0, Math.min(255, Math.round(args.g)));
      const b = Math.max(0, Math.min(255, Math.round(args.b)));
      ctx.setLED(r, g, b);
      return { success: true, data: { r, g, b, pattern: args.pattern || 'solid' } };
    },
  },
  {
    name: 'hal_get_distance',
    description: 'Get distance sensor readings from all directions. HAL-compatible.',
    parameters: {},
    execute: async (args, ctx) => {
      const sensors = ctx.getSensors();
      return { success: true, data: sensors.distance };
    },
  },
  {
    name: 'hal_vision_scan',
    description: 'Scan environment and return detected objects. HAL-compatible.',
    parameters: {
      mode: { type: 'string', description: 'Scan mode: full, targeted, quick', required: false },
    },
    execute: async (args, ctx) => {
      const frame = ctx.captureCamera();
      const sensors = ctx.getSensors();

      // Combine camera analysis with sensor data for comprehensive scan
      return {
        success: true,
        data: {
          mode: args.mode || 'quick',
          frontObstacle: frame.analysis.frontObstacle,
          frontDistance: frame.analysis.frontObstacleDistance,
          leftClear: frame.analysis.leftClear,
          rightClear: frame.analysis.rightClear,
          distances: sensors.distance,
          pose: sensors.pose,
          timestamp: frame.timestamp,
        },
      };
    },
  },
  {
    name: 'hal_capture_frame',
    description: 'Capture current camera frame. HAL-compatible.',
    parameters: {},
    execute: async (args, ctx) => {
      const frame = ctx.captureCamera();
      return {
        success: true,
        data: {
          width: frame.width,
          height: frame.height,
          timestamp: frame.timestamp,
          analysis: frame.analysis,
        },
      };
    },
  },
  {
    name: 'hal_emergency_stop',
    description: 'Immediately stop all robot motion (safety). HAL-compatible.',
    parameters: {
      reason: { type: 'string', description: 'Reason for emergency stop', required: false },
    },
    execute: async (args, ctx) => {
      ctx.setLeftWheel(0);
      ctx.setRightWheel(0);
      ctx.setLED(255, 0, 0); // Red LED for emergency
      return { success: true, data: { stopped: true, reason: args.reason || 'Emergency stop activated' } };
    },
  },
];

/**
 * Get combined tool set (legacy + HAL)
 * Returns tools based on whether HAL mode is enabled
 */
export function getAllDeviceTools(useHAL: boolean = false): DeviceTool[] {
  if (useHAL) {
    // HAL mode: Use HAL tools with legacy tools as fallback
    return [...HAL_DEVICE_TOOLS, ...DEVICE_TOOLS];
  }
  // Legacy mode: Use original tools
  return DEVICE_TOOLS;
}

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
  loopIntervalMs?: number; // How often to run the control loop (default: 200ms)
  maxIterations?: number; // Optional limit
  // Host connection for LLM requests
  hostUrl?: string; // Default: current host
  // Vision mode settings
  visionEnabled?: boolean; // Enable camera-based world model updates
  visionInterval?: number; // How often to process vision (ms) - default: 3000ms

  // ═══════════════════════════════════════════════════════════════════
  // HAL & PHYSICAL SKILL INTEGRATION
  // ═══════════════════════════════════════════════════════════════════

  /** Enable HAL (Hardware Abstraction Layer) mode for simulation/physical duality */
  useHAL?: boolean;
  /** Physical skill to load (path or skill object) */
  physicalSkill?: PhysicalSkill | string;
  /** Enable BlackBox recording for Dreaming Engine */
  enableRecording?: boolean;
  /** Callback when skill is loaded */
  onSkillLoaded?: (skill: PhysicalSkill) => void;
  /** Callback when recording session starts */
  onRecordingStart?: (sessionId: string) => void;
  /** Callback when recording ends */
  onRecordingEnd?: (session: RecordingSession) => void;

  // ═══════════════════════════════════════════════════════════════════
  // TRAJECTORY PLANNING OPTIONS
  // ═══════════════════════════════════════════════════════════════════

  /** Enable trajectory planning mode (stop-plan-execute-replan cycle) */
  enableTrajectoryPlanning?: boolean;
  /** How often to stop and replan (ms) - default: 8000ms */
  replanIntervalMs?: number;
  /** Callback when trajectory is planned */
  onTrajectoryPlanned?: (trajectory: { id: string; waypoints: number; goal: string }) => void;

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
  useHAL: boolean;
  enableRecording: boolean;
  enableTrajectoryPlanning: boolean;
  replanIntervalMs: number;
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
  // Turn rate limiting state - prevents excessive rotation
  turnRateLimiting: {
    lastYaw: number | null;
    lastTimestamp: number | null;
    recentAngularRates: number[]; // Track recent angular velocities for smoothing
  };

  // HAL & Physical Skill state
  halEnabled: boolean;
  activeSkill: PhysicalSkill | null;
  recordingSessionId: string | null;
  recordingActive: boolean;

  // Trajectory planning state
  trajectoryPlanningEnabled: boolean;
  trajectoryMode: 'planning' | 'executing' | 'replanning' | 'reactive' | null;
  currentTrajectoryId: string | null;
  trajectoryProgress: string | null;
  lastReplanReason: string | null;
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

  // HAL & Recording state
  private halExecutor: HALToolExecutor | null = null;
  private activeSkill: PhysicalSkill | null = null;
  private recordingSessionId: string | null = null;

  // Trajectory planning
  private trajectoryPlanner: TrajectoryPlanner | null = null;

  // Navigation debugger for comprehensive logging
  private navDebugger: RobotNavigationDebugger;

  constructor(config: ESP32AgentConfig) {
    this.config = {
      ...config,
      loopIntervalMs: config.loopIntervalMs ?? 200, // Reduced from 500ms for faster obstacle response
      hostUrl: config.hostUrl ?? (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000'),
      visionEnabled: config.visionEnabled ?? false,
      visionInterval: config.visionInterval ?? 3000,
      useHAL: config.useHAL ?? false,
      enableRecording: config.enableRecording ?? false,
      enableTrajectoryPlanning: config.enableTrajectoryPlanning ?? false,
      replanIntervalMs: config.replanIntervalMs ?? 8000,
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
      turnRateLimiting: {
        lastYaw: null,
        lastTimestamp: null,
        recentAngularRates: [],
      },
      halEnabled: this.config.useHAL,
      activeSkill: null,
      recordingSessionId: null,
      recordingActive: false,
      trajectoryPlanningEnabled: this.config.enableTrajectoryPlanning,
      trajectoryMode: this.config.enableTrajectoryPlanning ? 'planning' : null,
      currentTrajectoryId: null,
      trajectoryProgress: null,
      lastReplanReason: null,
    };

    // Initialize vision model if enabled
    if (this.config.visionEnabled) {
      this.visionModel = getCameraVisionModel(config.deviceId, {
        processingInterval: this.config.visionInterval,
      });
    }

    // Initialize HAL if enabled
    if (this.config.useHAL) {
      this.halExecutor = getHALToolExecutor();
    }

    // Initialize navigation debugger
    this.navDebugger = getRobotDebugger();
  }

  /**
   * Enable/disable navigation debugging
   */
  setNavigationDebugging(enabled: boolean, verbosity: 'minimal' | 'normal' | 'detailed' | 'verbose' = 'detailed'): void {
    this.navDebugger.setEnabled(enabled);
    this.navDebugger.setVerbosity(verbosity);
  }

  /**
   * Get navigation debugger for external access
   */
  getNavigationDebugger(): RobotNavigationDebugger {
    return this.navDebugger;
  }

  /**
   * Load a physical skill (skill cartridge) to use for this agent
   */
  async loadPhysicalSkill(skillPathOrSkill: PhysicalSkill | string): Promise<boolean> {
    try {
      let skill: PhysicalSkill;

      if (typeof skillPathOrSkill === 'string') {
        // Load from path
        const loader = getPhysicalSkillLoader();
        const result = await loader.loadSkill(skillPathOrSkill);
        if (!result.ok) {
          this.log(`Failed to load skill: ${result.error}`, 'error');
          return false;
        }
        skill = result.value;
      } else {
        skill = skillPathOrSkill;
      }

      this.activeSkill = skill;
      this.state.activeSkill = skill;

      // Update system prompt from skill
      this.config.systemPrompt = skill.role;
      if (skill.objective) {
        this.config.goal = skill.objective;
      }

      // Initialize Agentic Vision if skill requires it
      if (skill.frontmatter.agentic_vision && this.visionModel) {
        this.visionModel.setActiveSkill(skill);
      }

      this.log(`Loaded physical skill: ${skill.frontmatter.name} v${skill.frontmatter.version}`, 'info');

      if (this.config.onSkillLoaded) {
        this.config.onSkillLoaded(skill);
      }

      return true;
    } catch (error) {
      this.log(`Error loading skill: ${error}`, 'error');
      return false;
    }
  }

  /**
   * Get the currently active physical skill
   */
  getActiveSkill(): PhysicalSkill | null {
    return this.activeSkill;
  }

  /**
   * Start BlackBox recording session
   */
  startRecording(): string | null {
    if (!this.config.enableRecording) {
      return null;
    }

    try {
      const recorder = getBlackBoxRecorder();
      const skillName = this.activeSkill?.frontmatter.name || this.config.name;

      this.recordingSessionId = recorder.startSession({
        skillName,
        deviceId: this.config.deviceId,
        metadata: {
          agentId: this.config.id,
          goal: this.config.goal,
          halEnabled: this.config.useHAL,
        },
      });

      this.state.recordingSessionId = this.recordingSessionId;
      this.state.recordingActive = true;

      this.log(`Started recording session: ${this.recordingSessionId}`, 'info');

      if (this.config.onRecordingStart) {
        this.config.onRecordingStart(this.recordingSessionId);
      }

      return this.recordingSessionId;
    } catch (error) {
      this.log(`Failed to start recording: ${error}`, 'error');
      return null;
    }
  }

  /**
   * Stop BlackBox recording and save session
   */
  async stopRecording(): Promise<RecordingSession | null> {
    if (!this.recordingSessionId) {
      return null;
    }

    try {
      const recorder = getBlackBoxRecorder();
      const session = await recorder.endSession();

      this.state.recordingActive = false;
      this.log(`Stopped recording session: ${this.recordingSessionId}`, 'info');

      if (session && this.config.onRecordingEnd) {
        this.config.onRecordingEnd(session);
      }

      this.recordingSessionId = null;
      this.state.recordingSessionId = null;

      return session;
    } catch (error) {
      this.log(`Failed to stop recording: ${error}`, 'error');
      return null;
    }
  }

  /**
   * Record a failure for the Dreaming Engine
   */
  recordFailure(
    type: 'collision' | 'timeout' | 'low_confidence' | 'safety_stop' | 'skill_error' | 'unknown',
    description: string,
    severity: 'minor' | 'moderate' | 'critical' = 'moderate'
  ): void {
    if (!this.recordingSessionId) {
      return;
    }

    try {
      const recorder = getBlackBoxRecorder();
      recorder.markFailure({
        type,
        description,
        severity,
      });

      this.log(`Recorded failure: ${type} - ${description}`, 'warn');
    } catch (error) {
      this.log(`Failed to record failure: ${error}`, 'error');
    }
  }

  /**
   * Record a telemetry frame for the Dreaming Engine
   */
  private recordTelemetryFrame(
    sensors: SensorReadings,
    toolCalls: Array<{ tool: string; args: Record<string, any> }>
  ): void {
    try {
      const recorder = getBlackBoxRecorder();
      recorder.recordFrame({
        telemetry: {
          timestamp: Date.now(),
          deviceId: this.config.deviceId,
          mode: this.config.useHAL ? 'simulation' : 'physical',
          pose: sensors.pose
            ? { x: sensors.pose.x, y: sensors.pose.y, z: 0, yaw: sensors.pose.rotation || 0 }
            : { x: 0, y: 0, z: 0, yaw: 0 },
          sensors: {
            distance: sensors.distance
              ? [
                  sensors.distance.front,
                  sensors.distance.frontLeft,
                  sensors.distance.frontRight,
                  sensors.distance.left,
                  sensors.distance.right,
                  sensors.distance.back,
                ]
              : [],
            line: sensors.line || [],
            battery: sensors.battery?.percentage ?? 100,
          },
          motors: {
            left: this.leftWheelPower,
            right: this.rightWheelPower,
          },
          led: { r: 0, g: 0, b: 0 },
        },
        toolCalls: toolCalls.map(tc => ({
          name: tc.tool,
          args: tc.args,
        })),
      });
    } catch (error) {
      // Don't spam logs for recording errors
      console.debug('[ESP32Agent] Frame recording error:', error);
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
  async start(): Promise<void> {
    if (this.state.running) {
      this.log('Agent already running', 'warn');
      return;
    }

    this.log(`Starting ESP32 agent: ${this.config.name}`, 'info');

    // Initialize device context
    this.deviceContext = this.initDeviceContext();

    // Initialize world model for spatial memory and trajectory tracking
    // The world model is essential for cognitive navigation - it stores:
    // - Accumulated obstacle observations from sensors
    // - Robot trajectory history
    // - Explored vs unexplored areas
    // This context is provided to the LLM for better decision making
    this.worldModel = getWorldModel(this.config.deviceId, {
      gridResolution: 10,  // 10cm per cell
      worldWidth: 500,     // 5m
      worldHeight: 500,    // 5m
    });
    this.log('World model initialized for spatial memory and navigation', 'info');

    if (this.config.visionEnabled) {
      this.log('Vision mode enabled - camera will also update world model', 'info');
    }

    // Initialize trajectory planner if enabled
    if (this.config.enableTrajectoryPlanning) {
      this.trajectoryPlanner = getTrajectoryPlanner(this.config.deviceId, {
        replanIntervalMs: this.config.replanIntervalMs,
      });
      this.log('Trajectory planning enabled - using stop-plan-execute-replan cycle', 'info');
    }

    // Load physical skill if specified
    if (this.config.physicalSkill) {
      const loaded = await this.loadPhysicalSkill(this.config.physicalSkill);
      if (loaded) {
        this.log(`Physical skill loaded: ${this.activeSkill?.frontmatter.name}`, 'info');
      }
    }

    // Start recording if enabled
    if (this.config.enableRecording) {
      this.startRecording();
    }

    // Log HAL mode status
    if (this.config.useHAL) {
      this.log('HAL mode enabled - using hardware abstraction layer tools', 'info');
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
  async stop(): Promise<void> {
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

    // Stop recording if active
    if (this.recordingSessionId) {
      await this.stopRecording();
    }

    // Reset trajectory planner
    if (this.trajectoryPlanner) {
      this.trajectoryPlanner.reset();
      this.state.trajectoryMode = null;
      this.state.currentTrajectoryId = null;
      this.state.trajectoryProgress = null;
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

    // Start debug iteration
    this.navDebugger.startIteration(this.state.iteration);

    try {
      // ═══════════════════════════════════════════════════════════════════
      // STEP 1: Read sensors (LOCAL on ESP32)
      // ═══════════════════════════════════════════════════════════════════
      const sensors = this.deviceContext.getSensors();
      this.state.lastSensorReading = sensors;

      // Debug: Log sensor readings
      this.navDebugger.logSensors({
        distance: sensors.distance,
        pose: sensors.pose,
        velocity: (sensors as any).velocity,
        bumper: sensors.bumper,
      });

      // ═══════════════════════════════════════════════════════════════════
      // STEP 1.0.5: Update World Model from Sensors (builds spatial memory)
      // This incrementally builds the robot's understanding of the arena
      // ═══════════════════════════════════════════════════════════════════
      if (this.worldModel) {
        this.worldModel.updateFromSensors(
          sensors.pose,
          {
            front: sensors.distance.front,
            frontLeft: sensors.distance.frontLeft,
            frontRight: sensors.distance.frontRight,
            left: sensors.distance.left,
            right: sensors.distance.right,
            back: sensors.distance.back,
          },
          Date.now()
        );
      }

      // ═══════════════════════════════════════════════════════════════════
      // STEP 1.1: Auto-detect failures for Dreaming Engine
      // ═══════════════════════════════════════════════════════════════════
      if (this.recordingSessionId) {
        // Detect bumper collision
        if (sensors.bumper.front || sensors.bumper.back) {
          this.recordFailure(
            'collision',
            `Bumper triggered: ${sensors.bumper.front ? 'front' : 'back'}`,
            'critical'
          );
        }

        // Detect low battery
        if (sensors.battery.percentage < 10) {
          this.recordFailure('safety_stop', `Battery critically low at ${sensors.battery.percentage}%`, 'critical');
        }

        // Detect too-close obstacle approach (should have avoided)
        if (sensors.distance.front < 5) {
          this.recordFailure(
            'collision',
            `Front obstacle at ${sensors.distance.front}cm - should have turned earlier`,
            'moderate'
          );
        }
      }

      // ═══════════════════════════════════════════════════════════════════
      // STEP 1.2: Stuck Detection - Check if robot is making progress
      // ═══════════════════════════════════════════════════════════════════
      const stuckRecoveryAction = this.checkAndHandleStuck(sensors);
      if (stuckRecoveryAction) {
        // Execute recovery action directly, bypass LLM
        this.log(`STUCK DETECTED - Executing recovery: ${stuckRecoveryAction}`, 'warn');
        await this.executeRecoveryAction(stuckRecoveryAction, sensors);
        this.emitStateChange();
        // Schedule next iteration and return early
        if (this.state.running) {
          this.loopHandle = setTimeout(() => this.runLoop(), this.config.loopIntervalMs);
        }
        return;
      }

      // ═══════════════════════════════════════════════════════════════════
      // STEP 1.3: HARDWARE REFLEXES - Local safety rules (NO LLM DEPENDENCY)
      // These execute at control loop frequency (~5Hz) to prevent collisions
      // ═══════════════════════════════════════════════════════════════════
      const reflexAction = this.evaluateHardwareReflexes(sensors);
      if (reflexAction) {
        // Execute reflex locally without LLM - this is critical for safety
        this.log(`🛡️ REFLEX: ${reflexAction.action} - ${reflexAction.reason}`, 'warn');
        await this.executeReflexAction(reflexAction);

        // Record reflex activation for analysis
        if (this.recordingSessionId) {
          this.recordFailure('safety_stop', `Hardware reflex: ${reflexAction.reason}`, 'moderate');
        }

        // Debug: Log reflex activation
        this.navDebugger.logSensors({
          distance: sensors.distance,
          pose: sensors.pose,
          velocity: (sensors as any).velocity,
          bumper: sensors.bumper,
        });

        this.emitStateChange();

        // Schedule next iteration - skip LLM this cycle for faster response
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
      // STEP 1.6: TRAJECTORY PLANNING - Stop, Plan, Execute cycle
      // Instead of reactive frame-by-frame control, plan ahead and follow
      // ═══════════════════════════════════════════════════════════════════
      if (this.config.enableTrajectoryPlanning && this.trajectoryPlanner) {
        const trajectoryAction = await this.handleTrajectoryPlanning(sensors);
        if (trajectoryAction) {
          // Trajectory planner provided a motor command
          const { left, right, action, skipLLM } = trajectoryAction;

          // Execute the trajectory command
          if (this.deviceContext) {
            this.deviceContext.setLeftWheel(left);
            this.deviceContext.setRightWheel(right);
          }

          // Update state
          this.state.lastToolCalls = [{
            tool: 'trajectory_follow',
            args: { left, right, action },
            result: { success: true, data: { action, left, right } },
          }];

          // Log trajectory action
          this.log(`📍 TRAJECTORY: ${action} - L=${left}, R=${right}`, 'info');

          if (skipLLM) {
            // Trajectory planner is handling movement, skip LLM this cycle
            this.emitStateChange();
            if (this.state.running) {
              this.loopHandle = setTimeout(() => this.runLoop(), this.config.loopIntervalMs);
            }
            return;
          }
        }
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
      // Debug: Log LLM response
      this.navDebugger.logLLMResponse(llmResponse);

      const toolCalls = this.parseToolCalls(llmResponse);

      // Debug: Log parsed tool calls
      this.navDebugger.logParsedToolCalls(toolCalls);

      this.state.lastToolCalls = [];

      // Select tool set based on HAL mode
      const availableTools = getAllDeviceTools(this.config.useHAL);

      for (const { tool, args } of toolCalls) {
        // ═══════════════════════════════════════════════════════════════════
        // PRE-EXECUTION SAFETY FILTER: Validate motor commands against sensors
        // This prevents the LLM from commanding dangerous movements
        // ═══════════════════════════════════════════════════════════════════
        const safeArgs = this.applyMotorSafetyFilter(tool, args, sensors);
        if (safeArgs !== args) {
          this.log(`🛡️ SAFETY FILTER: Modified ${tool} args for safety`, 'warn');
        }

        const toolDef = availableTools.find((t) => t.name === tool);
        if (toolDef) {
          const result = await toolDef.execute(safeArgs, this.deviceContext);
          this.state.lastToolCalls.push({ tool, args: safeArgs, result });
          this.state.stats.totalToolCalls++;
          this.log(`Tool ${tool}: ${JSON.stringify(result.data)}`, 'info');

          // Debug: Log executed command
          this.navDebugger.logExecutedCommand(tool, safeArgs, result);

          // Record tool call failure for Dreaming Engine
          if (!result.success && this.recordingSessionId) {
            this.recordFailure('skill_error', `Tool ${tool} failed: ${result.error}`, 'moderate');
          }
        } else {
          this.log(`Unknown tool: ${tool}`, 'warn');
          // Record unknown tool as failure
          if (this.recordingSessionId) {
            this.recordFailure('skill_error', `Unknown tool requested: ${tool}`, 'minor');
          }
        }
      }

      // ═══════════════════════════════════════════════════════════════════
      // STEP 3.5: Record telemetry frame for Dreaming Engine
      // ═══════════════════════════════════════════════════════════════════
      if (this.recordingSessionId) {
        this.recordTelemetryFrame(sensors, toolCalls);
      }

      // Update loop timing stats
      const loopTime = Date.now() - loopStart;
      this.state.stats.avgLoopTimeMs =
        (this.state.stats.avgLoopTimeMs * (this.state.iteration - 1) + loopTime) /
        this.state.iteration;

      // Debug: End iteration logging
      this.navDebugger.endIteration();

      this.emitStateChange();
    } catch (error: any) {
      this.log(`Loop error: ${error.message}`, 'error');
      this.state.errors.push(error.message);
      // Debug: End iteration even on error
      this.navDebugger.endIteration();
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
    POSITION_HISTORY_SIZE: 8,        // Keep last N positions (increased for smoother maneuvers)
    MIN_MOVEMENT_THRESHOLD: 0.03,    // Minimum movement in meters to be considered "moving" (reduced)
    MIN_ROTATION_THRESHOLD: 0.5,     // Minimum rotation in radians (~28 degrees) - increased to allow turns
    STUCK_ITERATIONS_THRESHOLD: 6,   // Consider stuck after N iterations (increased to allow maneuvers)
    MAX_RECOVERY_ATTEMPTS: 5,        // Try different strategies before giving up
    PURE_ROTATION_ITERATIONS: 5,     // Require more iterations before flagging pure rotation as stuck
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
    // Pure rotation (turning in place) is allowed for longer - it's often a valid maneuver
    const pureRotationStuck = !isMoving && isRotatingSignificantly &&
      detection.stuckCount >= ESP32AgentRuntime.STUCK_DETECTION.PURE_ROTATION_ITERATIONS;
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

    // CRITICAL: When front is very close (<10cm), ALWAYS back up first
    // This prevents pivot attempts that would clip the obstacle
    if (distance.front < 10) {
      this.log(`Front obstacle at ${distance.front}cm - forcing reverse-first recovery`, 'warn');
      const bestDirection = distance.left > distance.right ? 'left' : 'right';
      return bestDirection === 'left' ? 'reverse_turn_left' : 'reverse_turn_right';
    }

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
  private async executeRecoveryAction(action: string, sensors?: SensorReadings): Promise<void> {
    if (!this.deviceContext) return;

    const { setLeftWheel, setRightWheel } = this.deviceContext;

    // All recovery actions use controlled, gentle values
    const RECOVERY_SPEED = 35;      // Moderate speed
    const PIVOT_DIFF = 25;          // Gentle pivot differential
    // Dynamic action duration: longer backup when very close to obstacles
    const frontDist = sensors?.distance?.front ?? 50;
    const ACTION_DURATION = frontDist < 15 ? 800 : 500;  // Longer backup when close
    // Higher turn differential allowed in critical escape situations
    const ESCAPE_PIVOT_DIFF = frontDist < 15 ? 40 : PIVOT_DIFF;

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
        // When front is very close, back up first to get clearance for pivot
        if (frontDist < 15) {
          this.log(`Front at ${frontDist}cm - backing up before pivot`, 'info');
          setLeftWheel(-RECOVERY_SPEED);
          setRightWheel(-RECOVERY_SPEED);
          await this.sleep(400);  // Brief backup to clear obstacle
        }
        setLeftWheel(-ESCAPE_PIVOT_DIFF);
        setRightWheel(ESCAPE_PIVOT_DIFF);
        await this.sleep(ACTION_DURATION);
        setLeftWheel(0);
        setRightWheel(0);
        break;

      case 'pivot_right':
        // When front is very close, back up first to get clearance for pivot
        if (frontDist < 15) {
          this.log(`Front at ${frontDist}cm - backing up before pivot`, 'info');
          setLeftWheel(-RECOVERY_SPEED);
          setRightWheel(-RECOVERY_SPEED);
          await this.sleep(400);  // Brief backup to clear obstacle
        }
        setLeftWheel(ESCAPE_PIVOT_DIFF);
        setRightWheel(-ESCAPE_PIVOT_DIFF);
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
        setLeftWheel(-ESCAPE_PIVOT_DIFF);
        setRightWheel(ESCAPE_PIVOT_DIFF);
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

  // ═══════════════════════════════════════════════════════════════════════════
  // TRAJECTORY PLANNING - Stop, Plan, Execute, Replan Cycle
  // This provides smooth, predictable navigation instead of reactive jerky motion
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Handle trajectory planning and execution
   * Returns motor command if trajectory planner is controlling, null if LLM should take over
   */
  private async handleTrajectoryPlanning(
    sensors: SensorReadings
  ): Promise<{ left: number; right: number; action: string; skipLLM: boolean } | null> {
    if (!this.trajectoryPlanner) return null;

    const pose = sensors.pose;

    // Check if we need to replan
    const shouldReplan = this.trajectoryPlanner.shouldReplan(sensors);

    if (shouldReplan) {
      // STOP AND PLAN - This is the key insight: stop, analyze, then move
      this.log('🎯 TRAJECTORY PLANNING: Stopping to analyze and plan...', 'info');
      this.state.trajectoryMode = 'planning';
      this.state.lastReplanReason = this.getReplanReason(sensors);

      // Stop motors during planning
      if (this.deviceContext) {
        this.deviceContext.setLeftWheel(0);
        this.deviceContext.setRightWheel(0);
      }

      // Plan new trajectory
      const trajectory = this.trajectoryPlanner.planTrajectory(pose, sensors, 'explore');

      // Update state
      this.state.currentTrajectoryId = trajectory.id;
      this.state.trajectoryProgress = `0/${trajectory.waypoints.length} waypoints`;
      this.state.trajectoryMode = 'executing';

      this.log(`🎯 TRAJECTORY PLANNED: ${trajectory.goalDescription} (${trajectory.waypoints.length} waypoints)`, 'info');

      // Notify callback
      if (this.config.onTrajectoryPlanned) {
        this.config.onTrajectoryPlanned({
          id: trajectory.id,
          waypoints: trajectory.waypoints.length,
          goal: trajectory.goalDescription,
        });
      }

      // Return stop command for this cycle (planning takes 1 cycle)
      return { left: 0, right: 0, action: 'planning', skipLLM: true };
    }

    // Get motor command from trajectory planner
    const command = this.trajectoryPlanner.getMotorCommand(pose, sensors);

    if (command) {
      // Update trajectory progress in state
      const status = this.trajectoryPlanner.getTrajectoryStatus();
      this.state.trajectoryProgress = status.progress;
      this.state.trajectoryMode = 'executing';

      // Return trajectory-guided motor command
      return {
        left: command.left,
        right: command.right,
        action: command.action,
        skipLLM: true, // Skip LLM when trajectory is providing good guidance
      };
    }

    // Trajectory complete or no trajectory - let LLM take over for this cycle
    // (will replan next cycle)
    this.state.trajectoryMode = 'replanning';
    return null;
  }

  /**
   * Get the reason for replanning (for logging/debugging)
   */
  private getReplanReason(sensors: SensorReadings): string {
    if (!this.trajectoryPlanner) return 'No planner';

    const status = this.trajectoryPlanner.getTrajectoryStatus();

    if (!status.trajectoryId) {
      return 'Initial planning';
    }

    if (status.mode === 'complete') {
      return 'Trajectory complete';
    }

    if (sensors.distance.front < 20) {
      return 'Unexpected obstacle ahead';
    }

    return 'Periodic replan';
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HARDWARE REFLEXES - Local Safety Rules (LLM-Independent)
  // These execute at control loop frequency (~5Hz) to prevent collisions
  // Critical for real-time safety when LLM latency is too slow
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Hardware Reflex Configuration
   * These thresholds define when local safety rules override LLM control
   */
  private static readonly HARDWARE_REFLEXES = {
    // Distance thresholds (in cm)
    EMERGENCY_STOP_DISTANCE: 8,      // Immediate stop if obstacle this close
    COLLISION_WARNING_DISTANCE: 15,  // Slow down / prepare to evade
    SAFE_REVERSE_DISTANCE: 20,       // Safe to reverse at full speed

    // Velocity thresholds
    MAX_SPEED_NEAR_OBSTACLE: 30,     // Max motor power when near obstacles
    REFLEX_SPEED: 40,                // Motor power for reflex maneuvers

    // Timing
    REFLEX_DURATION: 300,            // Duration of reflex actions (ms)
    SENSOR_STALENESS_THRESHOLD: 500, // Max age of sensor data (ms)

    // Turn rate limiting - prevents over-rotation
    MAX_TURN_DIFFERENTIAL: 30,       // Max difference between left and right motor
    MAX_ANGULAR_RATE: 1.0,           // Max radians per second (about 57 degrees/sec)
  };

  /**
   * Evaluate hardware reflexes based on current sensor state
   * Returns a reflex action if safety intervention is needed, null otherwise
   */
  private evaluateHardwareReflexes(sensors: SensorReadings): { action: string; reason: string; priority: string } | null {
    const REFLEXES = ESP32AgentRuntime.HARDWARE_REFLEXES;
    const { distance, bumper } = sensors;
    const velocity = (sensors as any).velocity;

    // ═══════════════════════════════════════════════════════════════════
    // PRIORITY 1: BUMPER COLLISION (Already happened - stop immediately)
    // ═══════════════════════════════════════════════════════════════════
    if (bumper.front) {
      return {
        action: 'bumper_halt_reverse',
        reason: `FRONT BUMPER TRIGGERED - Collision detected! Reversing.`,
        priority: 'critical',
      };
    }
    if (bumper.back) {
      return {
        action: 'bumper_halt_forward',
        reason: `BACK BUMPER TRIGGERED - Collision detected! Moving forward.`,
        priority: 'critical',
      };
    }

    // ═══════════════════════════════════════════════════════════════════
    // PRIORITY 2: EMERGENCY STOP - Obstacle dangerously close
    // ═══════════════════════════════════════════════════════════════════
    const isMovingForward = velocity && velocity.linear > 0.01;
    const isMovingBackward = velocity && velocity.linear < -0.01;
    const isRotating = velocity && Math.abs(velocity.angular) > 0.3;

    // Check if there's a clear escape route to either side
    const hasLeftEscape = distance.left > 80 || distance.frontLeft > 60;
    const hasRightEscape = distance.right > 80 || distance.frontRight > 60;
    const hasEscapeRoute = hasLeftEscape || hasRightEscape;

    // Front obstacle emergency - but allow escape pivots when there's a clear route
    if (distance.front < REFLEXES.EMERGENCY_STOP_DISTANCE && isMovingForward) {
      // Exception: Allow escape turns when robot is pivoting toward clear space
      // This prevents blocking legitimate escape maneuvers
      if (isRotating && hasEscapeRoute) {
        const turningTowardClear =
          (velocity.angular < 0 && hasLeftEscape) ||   // Turning left toward open left
          (velocity.angular > 0 && hasRightEscape);    // Turning right toward open right
        if (turningTowardClear) {
          // Allow the escape turn, but log it for visibility
          this.log(`Allowing escape turn: front=${distance.front}cm, turning toward clear side`, 'info');
          return null;  // Don't block the escape
        }
      }
      return {
        action: 'emergency_stop_reverse',
        reason: `EMERGENCY: Front obstacle at ${distance.front}cm while moving forward!`,
        priority: 'critical',
      };
    }

    // Back obstacle emergency
    if (distance.back < REFLEXES.EMERGENCY_STOP_DISTANCE && isMovingBackward) {
      return {
        action: 'emergency_stop_forward',
        reason: `EMERGENCY: Back obstacle at ${distance.back}cm while reversing!`,
        priority: 'critical',
      };
    }

    // ═══════════════════════════════════════════════════════════════════
    // PRIORITY 3: COLLISION WARNING - Need to evade
    // ═══════════════════════════════════════════════════════════════════
    if (distance.front < REFLEXES.COLLISION_WARNING_DISTANCE && isMovingForward) {
      // Determine best evasion direction
      const leftClearance = Math.min(distance.frontLeft, distance.left);
      const rightClearance = Math.min(distance.frontRight, distance.right);

      if (leftClearance > rightClearance + 10) {
        return {
          action: 'evade_left',
          reason: `WARNING: Front obstacle at ${distance.front}cm - Evading LEFT (clearance: ${leftClearance}cm)`,
          priority: 'high',
        };
      } else if (rightClearance > leftClearance + 10) {
        return {
          action: 'evade_right',
          reason: `WARNING: Front obstacle at ${distance.front}cm - Evading RIGHT (clearance: ${rightClearance}cm)`,
          priority: 'high',
        };
      } else {
        // Both sides equally blocked - stop and reverse
        return {
          action: 'stop_and_reverse',
          reason: `WARNING: Front blocked at ${distance.front}cm, sides also blocked - Stopping and reversing`,
          priority: 'high',
        };
      }
    }

    // ═══════════════════════════════════════════════════════════════════
    // PRIORITY 4: SIDE COLLISION WARNING - Prevent side scrapes during turns
    // ═══════════════════════════════════════════════════════════════════
    const isTurningLeft = velocity && velocity.angular < -0.1;
    const isTurningRight = velocity && velocity.angular > 0.1;

    if (distance.left < REFLEXES.EMERGENCY_STOP_DISTANCE && isTurningLeft) {
      return {
        action: 'correct_right',
        reason: `WARNING: Left side at ${distance.left}cm while turning left - Correcting right`,
        priority: 'medium',
      };
    }

    if (distance.right < REFLEXES.EMERGENCY_STOP_DISTANCE && isTurningRight) {
      return {
        action: 'correct_left',
        reason: `WARNING: Right side at ${distance.right}cm while turning right - Correcting left`,
        priority: 'medium',
      };
    }

    // ═══════════════════════════════════════════════════════════════════
    // PRIORITY 5: CORNERED DETECTION - Surrounded by obstacles
    // ═══════════════════════════════════════════════════════════════════
    const allSidesClose =
      distance.front < REFLEXES.COLLISION_WARNING_DISTANCE &&
      distance.frontLeft < REFLEXES.COLLISION_WARNING_DISTANCE &&
      distance.frontRight < REFLEXES.COLLISION_WARNING_DISTANCE;

    if (allSidesClose && isMovingForward) {
      return {
        action: 'cornered_escape',
        reason: `CORNERED: Front(${distance.front}), FL(${distance.frontLeft}), FR(${distance.frontRight})cm - Escaping`,
        priority: 'high',
      };
    }

    // No reflex needed - LLM can control
    return null;
  }

  /**
   * Execute a hardware reflex action
   * These are fast, pre-programmed responses that don't wait for LLM
   */
  private async executeReflexAction(reflex: { action: string; reason: string; priority: string }): Promise<void> {
    if (!this.deviceContext) return;

    const { setLeftWheel, setRightWheel } = this.deviceContext;
    const REFLEXES = ESP32AgentRuntime.HARDWARE_REFLEXES;
    const SPEED = REFLEXES.REFLEX_SPEED;
    const DURATION = REFLEXES.REFLEX_DURATION;

    // Log the reflex action
    this.log(`🛡️ EXECUTING REFLEX: ${reflex.action}`, 'warn');

    switch (reflex.action) {
      // ═══ CRITICAL PRIORITY ═══
      case 'bumper_halt_reverse':
        // Bumper hit - stop then reverse
        setLeftWheel(0);
        setRightWheel(0);
        await this.sleep(50);
        setLeftWheel(-SPEED);
        setRightWheel(-SPEED);
        await this.sleep(DURATION * 2);
        setLeftWheel(0);
        setRightWheel(0);
        break;

      case 'bumper_halt_forward':
        // Back bumper hit - stop then move forward
        setLeftWheel(0);
        setRightWheel(0);
        await this.sleep(50);
        setLeftWheel(SPEED);
        setRightWheel(SPEED);
        await this.sleep(DURATION * 2);
        setLeftWheel(0);
        setRightWheel(0);
        break;

      case 'emergency_stop_reverse':
        // Emergency stop then gentle reverse
        setLeftWheel(0);
        setRightWheel(0);
        await this.sleep(50);
        setLeftWheel(-SPEED * 0.7);
        setRightWheel(-SPEED * 0.7);
        await this.sleep(DURATION);
        setLeftWheel(0);
        setRightWheel(0);
        break;

      case 'emergency_stop_forward':
        // Emergency stop then gentle forward
        setLeftWheel(0);
        setRightWheel(0);
        await this.sleep(50);
        setLeftWheel(SPEED * 0.7);
        setRightWheel(SPEED * 0.7);
        await this.sleep(DURATION);
        setLeftWheel(0);
        setRightWheel(0);
        break;

      // ═══ HIGH PRIORITY ═══
      case 'evade_left':
        // Quick left turn while moving
        setLeftWheel(SPEED * 0.3);
        setRightWheel(SPEED);
        await this.sleep(DURATION);
        break;

      case 'evade_right':
        // Quick right turn while moving
        setLeftWheel(SPEED);
        setRightWheel(SPEED * 0.3);
        await this.sleep(DURATION);
        break;

      case 'stop_and_reverse':
        // Stop, reverse, then slight turn
        setLeftWheel(0);
        setRightWheel(0);
        await this.sleep(50);
        setLeftWheel(-SPEED);
        setRightWheel(-SPEED * 0.7); // Slight turn while reversing
        await this.sleep(DURATION * 1.5);
        setLeftWheel(0);
        setRightWheel(0);
        break;

      case 'cornered_escape':
        // Cornered - reverse and rotate
        setLeftWheel(-SPEED);
        setRightWheel(-SPEED);
        await this.sleep(DURATION);
        // Then rotate to find opening
        setLeftWheel(-SPEED * 0.5);
        setRightWheel(SPEED * 0.5);
        await this.sleep(DURATION * 2);
        setLeftWheel(0);
        setRightWheel(0);
        break;

      // ═══ MEDIUM PRIORITY ═══
      case 'correct_right':
        // Gentle right correction
        setLeftWheel(SPEED * 0.8);
        setRightWheel(SPEED * 0.4);
        await this.sleep(DURATION * 0.5);
        break;

      case 'correct_left':
        // Gentle left correction
        setLeftWheel(SPEED * 0.4);
        setRightWheel(SPEED * 0.8);
        await this.sleep(DURATION * 0.5);
        break;

      default:
        this.log(`Unknown reflex action: ${reflex.action}`, 'error');
        setLeftWheel(0);
        setRightWheel(0);
    }

    // Record reflex in tool calls for visibility
    this.state.lastToolCalls = [{
      tool: 'hardware_reflex',
      args: { action: reflex.action, reason: reflex.reason },
      result: { success: true, data: { action: reflex.action, priority: reflex.priority } },
    }];
  }

  /**
   * Apply motor safety filter to LLM tool calls
   * Prevents the LLM from commanding movements that would cause collisions
   * Returns modified args if unsafe, original args if safe
   */
  private applyMotorSafetyFilter(
    tool: string,
    args: Record<string, unknown>,
    sensors: SensorReadings
  ): Record<string, unknown> {
    // Only filter motor-related commands
    const motorTools = ['drive', 'hal_drive', 'set_left_wheel', 'set_right_wheel'];
    if (!motorTools.includes(tool)) {
      return args;
    }

    const REFLEXES = ESP32AgentRuntime.HARDWARE_REFLEXES;
    const { distance } = sensors;

    // Get motor values from args
    let left = (args.left ?? args.leftPWM ?? args.power ?? 0) as number;
    let right = (args.right ?? args.rightPWM ?? args.power ?? 0) as number;
    let modified = false;

    // ═══════════════════════════════════════════════════════════════════
    // RULE 0: ALWAYS allow pivot turns for escape maneuvers
    // A pivot turn (one wheel forward, one backward/zero) can rotate in place
    // This is critical for escaping when blocked
    // ═══════════════════════════════════════════════════════════════════
    const isPivotRight = left > 0 && right <= 0; // Turn right in place
    const isPivotLeft = left <= 0 && right > 0;  // Turn left in place

    if (isPivotRight || isPivotLeft) {
      // Allow pivot turns but limit speed for safety
      const maxPivotSpeed = REFLEXES.MAX_SPEED_NEAR_OBSTACLE;
      const needsLimit = Math.abs(left) > maxPivotSpeed || Math.abs(right) > maxPivotSpeed;
      if (needsLimit) {
        const scale = maxPivotSpeed / Math.max(Math.abs(left), Math.abs(right));
        left = Math.round(left * scale);
        right = Math.round(right * scale);
        modified = true;
      }
      this.log(`🛡️ ALLOWING pivot turn ${isPivotRight ? 'right' : 'left'} for escape`, 'info');
      // Return early - pivot turns bypass other rules
      if (modified) {
        return { ...args, left, right, leftPWM: left, rightPWM: right, _safety_modified: true };
      }
      return args;
    }

    // ═══════════════════════════════════════════════════════════════════
    // RULE 1: Block forward motion if front obstacle is too close
    // BUT allow differential turns that escape toward clear space
    // ═══════════════════════════════════════════════════════════════════
    const movingForward = left > 0 && right > 0;
    const initialTurnDiff = Math.abs(left - right);
    const isTurning = initialTurnDiff >= 10; // Significant differential = turning, not straight forward
    const turningRightEscape = right > left && distance.frontRight >= REFLEXES.EMERGENCY_STOP_DISTANCE;
    const turningLeftEscape = left > right && distance.frontLeft >= REFLEXES.EMERGENCY_STOP_DISTANCE;

    if (movingForward && distance.front < REFLEXES.EMERGENCY_STOP_DISTANCE) {
      if (isTurning && (turningRightEscape || turningLeftEscape)) {
        // Allow escape turn toward clear side - reduce speed but don't block
        const maxSpeed = REFLEXES.MAX_SPEED_NEAR_OBSTACLE;
        if (left > maxSpeed || right > maxSpeed) {
          const scale = maxSpeed / Math.max(left, right);
          left = Math.round(left * scale);
          right = Math.round(right * scale);
          modified = true;
        }
        this.log(`🛡️ ALLOWING escape turn toward ${turningRightEscape ? 'right' : 'left'} (front blocked at ${distance.front}cm)`, 'info');
      } else {
        this.log(`🛡️ BLOCKED: LLM tried to move forward but front obstacle at ${distance.front}cm`, 'warn');
        left = 0;
        right = 0;
        modified = true;
      }
    }

    // ═══════════════════════════════════════════════════════════════════
    // RULE 2: Limit speed when near obstacles
    // ═══════════════════════════════════════════════════════════════════
    if (movingForward && distance.front < REFLEXES.COLLISION_WARNING_DISTANCE) {
      const maxSpeed = REFLEXES.MAX_SPEED_NEAR_OBSTACLE;
      if (left > maxSpeed || right > maxSpeed) {
        const scale = maxSpeed / Math.max(left, right);
        left = Math.round(left * scale);
        right = Math.round(right * scale);
        this.log(`🛡️ LIMITED: Reduced speed near obstacle (front: ${distance.front}cm)`, 'info');
        modified = true;
      }
    }

    // ═══════════════════════════════════════════════════════════════════
    // RULE 3: Block reverse if back obstacle is too close
    // ═══════════════════════════════════════════════════════════════════
    const movingBackward = left < 0 && right < 0;
    if (movingBackward && distance.back < REFLEXES.EMERGENCY_STOP_DISTANCE) {
      this.log(`🛡️ BLOCKED: LLM tried to reverse but back obstacle at ${distance.back}cm`, 'warn');
      left = 0;
      right = 0;
      modified = true;
    }

    // ═══════════════════════════════════════════════════════════════════
    // RULE 4: Prevent turning into obstacles
    // Differential drive kinematics:
    // - left > right → angular velocity = (right - left) / wheelbase < 0 → turns LEFT
    // - right > left → angular velocity = (right - left) / wheelbase > 0 → turns RIGHT
    // ═══════════════════════════════════════════════════════════════════
    const turningLeft = left > right; // Left wheel faster = turning left (correct)
    const turningRight = right > left; // Right wheel faster = turning right (correct)

    if (turningLeft && distance.frontLeft < REFLEXES.EMERGENCY_STOP_DISTANCE) {
      this.log(`🛡️ BLOCKED: LLM tried to turn left but frontLeft obstacle at ${distance.frontLeft}cm`, 'warn');
      // Reverse the turn direction - turn right instead
      const temp = left;
      left = right;
      right = temp;
      modified = true;
    }

    if (turningRight && distance.frontRight < REFLEXES.EMERGENCY_STOP_DISTANCE) {
      this.log(`🛡️ BLOCKED: LLM tried to turn right but frontRight obstacle at ${distance.frontRight}cm`, 'warn');
      // Reverse the turn direction - turn left instead
      const temp = left;
      left = right;
      right = temp;
      modified = true;
    }

    // ═══════════════════════════════════════════════════════════════════
    // RULE 5: Limit turn differential to prevent over-rotation
    // Excessive turn differentials cause rapid, uncontrolled rotation
    // EXCEPTION: Allow higher differential (up to 50) during escape maneuvers
    // ═══════════════════════════════════════════════════════════════════
    const turnDifferential = Math.abs(left - right);
    // In critical escape situations (front blocked, side open), allow tighter turns
    const isEscapeSituation = distance.front < 15 &&
      (distance.left > 60 || distance.right > 60);
    const effectiveMaxDiff = isEscapeSituation ? 50 : REFLEXES.MAX_TURN_DIFFERENTIAL;

    if (turnDifferential > effectiveMaxDiff) {
      // Reduce the differential while preserving direction
      const avgSpeed = (left + right) / 2;
      const direction = left > right ? 1 : -1; // 1 = turning left, -1 = turning right
      const maxDiff = effectiveMaxDiff / 2;

      left = Math.round(avgSpeed + direction * maxDiff);
      right = Math.round(avgSpeed - direction * maxDiff);

      this.log(`🛡️ LIMITED: Reduced turn differential from ${turnDifferential} to ${effectiveMaxDiff}${isEscapeSituation ? ' (escape mode)' : ''}`, 'info');
      modified = true;
    }

    if (modified) {
      // Return new args with safe values
      return {
        ...args,
        left,
        right,
        leftPWM: left,
        rightPWM: right,
        _safety_modified: true,
      };
    }

    return args;
  }

  /**
   * Call the LLMOS host to get an LLM response
   * On physical ESP32, this would be an HTTP request to the host
   */
  private async callHostForLLMResponse(sensors: SensorReadings): Promise<string> {
    // Build the context message with sensor data
    const sensorContext = this.formatSensorContext(sensors);

    // Debug: Log what the LLM will see
    this.navDebugger.logLLMContext(sensorContext);

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
    // Select tool set based on HAL mode
    const tools = getAllDeviceTools(this.config.useHAL);
    const toolDocs = tools.map(
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

    // Build skill context if a physical skill is loaded
    let skillContext = '';
    if (this.activeSkill) {
      const skill = this.activeSkill;
      skillContext = `\n\n## Active Skill: ${skill.frontmatter.name}
Version: ${skill.frontmatter.version}
${skill.objective ? `Objective: ${skill.objective}` : ''}

### Visual Cortex Instructions
${skill.visualCortex.primaryTargets.map(t => `- Look for: ${t.name} - ${t.description}`).join('\n')}

### Safety Protocols
${skill.safetyProtocols.join('\n')}`;
    }

    return `${this.config.systemPrompt}${goalSection}${skillContext}

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
      // Explorer uses ray-based navigation for better obstacle avoidance
      return createRayExplorerFormatter();
    } else {
      // Default to ray-based explorer formatter for all behaviors
      // Ray-based navigation provides trajectory prediction and better obstacle avoidance
      return createRayExplorerFormatter();
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
      velocity: (sensors as any).velocity, // Include velocity for trajectory prediction
    };

    // Build world model context for spatial memory
    const worldModelContext = this.buildWorldModelContext(sensors);

    // Format with context
    const context = {
      iteration: this.state.iteration,
      goal: this.config.goal,
      worldModelContext,
    };

    const formatted = formatter.format(formatterSensors, context);

    // Add world model context section for LLM
    let worldModelSection = '';
    if (worldModelContext) {
      worldModelSection = this.formatWorldModelContext(worldModelContext, sensors);
    }

    // Add vision context if available
    let visionContext = '';
    if (this.config.visionEnabled && this.state.lastVisionObservation) {
      visionContext = this.formatVisionContext(this.state.lastVisionObservation);
    }

    // Add trajectory planning context if enabled
    let trajectoryContext = '';
    if (this.config.enableTrajectoryPlanning && this.trajectoryPlanner) {
      trajectoryContext = this.trajectoryPlanner.generatePlanningContext(sensors.pose, sensors);
    }

    // Add action instruction suffix
    const behaviorType = this.detectBehaviorType();
    const instruction = getActionInstruction(behaviorType);

    return `${formatted}${worldModelSection}${visionContext}${trajectoryContext}\n\n${instruction}`;
  }

  /**
   * Build world model context data for LLM
   * This provides spatial memory, trajectory history, and obstacle tracking
   */
  private buildWorldModelContext(sensors: SensorReadings): FormatContext['worldModelContext'] {
    if (!this.worldModel) return undefined;

    const pose = sensors.pose;
    const snapshot = this.worldModel.getSnapshot();
    const unexploredDirs = this.worldModel.getUnexploredDirections(pose);

    // Get recent trajectory points (last 10)
    const trajectoryHistory = snapshot.robotPath.slice(-10).map(p => ({
      x: p.x,
      y: p.y,
      yaw: p.rotation,
      time: p.timestamp,
    }));

    // Build recent obstacles from sensor history
    const recentObstacles: Array<{ direction: string; distance: number; lastSeen: number }> = [];
    const d = sensors.distance;
    if (d.front < 100) recentObstacles.push({ direction: 'front', distance: d.front, lastSeen: Date.now() });
    if (d.frontLeft < 100) recentObstacles.push({ direction: 'front-left', distance: d.frontLeft, lastSeen: Date.now() });
    if (d.frontRight < 100) recentObstacles.push({ direction: 'front-right', distance: d.frontRight, lastSeen: Date.now() });
    if (d.left < 100) recentObstacles.push({ direction: 'left', distance: d.left, lastSeen: Date.now() });
    if (d.right < 100) recentObstacles.push({ direction: 'right', distance: d.right, lastSeen: Date.now() });

    return {
      compactSummary: this.worldModel.generateCompactSummary(pose),
      trajectoryHistory,
      recentObstacles,
      explorationProgress: snapshot.explorationProgress,
      unexploredDirections: unexploredDirs.map(u => u.direction),
    };
  }

  /**
   * Format world model context as a section for the LLM prompt
   * This gives the LLM memory of past observations and trajectory
   */
  private formatWorldModelContext(
    worldModelContext: NonNullable<FormatContext['worldModelContext']>,
    sensors: SensorReadings
  ): string {
    let section = '\n\n## SPATIAL MEMORY (World Model)\n';
    section += 'You have built this understanding from your sensors and trajectory:\n\n';

    // Add compact summary
    if (worldModelContext.compactSummary) {
      section += worldModelContext.compactSummary;
    }

    // Add trajectory history
    if (worldModelContext.trajectoryHistory && worldModelContext.trajectoryHistory.length > 1) {
      section += '\n### Recent Trajectory:\n';
      const trajectory = worldModelContext.trajectoryHistory;
      const startPos = trajectory[0];
      const currentPos = trajectory[trajectory.length - 1];

      // Calculate distance traveled
      const dx = currentPos.x - startPos.x;
      const dy = currentPos.y - startPos.y;
      const distanceTraveled = Math.sqrt(dx * dx + dy * dy);

      section += `- Path points: ${trajectory.length}\n`;
      section += `- Distance traveled recently: ${distanceTraveled.toFixed(2)}m\n`;
      section += `- Start: (${startPos.x.toFixed(2)}, ${startPos.y.toFixed(2)})\n`;
      section += `- Current: (${currentPos.x.toFixed(2)}, ${currentPos.y.toFixed(2)})\n`;

      // Check if robot is stuck (not moving despite attempts)
      if (distanceTraveled < 0.1 && trajectory.length > 5) {
        section += `⚠️ **WARNING: Robot appears stuck - minimal movement detected!**\n`;
      }
    }

    // Add remembered obstacles (temporal context)
    if (worldModelContext.recentObstacles && worldModelContext.recentObstacles.length > 0) {
      section += '\n### Detected Obstacles:\n';
      for (const obs of worldModelContext.recentObstacles) {
        const urgency = obs.distance < 30 ? '🔴 CRITICAL' : obs.distance < 60 ? '🟠 CAUTION' : '🟢 NOTED';
        section += `- ${urgency} ${obs.direction}: ${obs.distance}cm\n`;
      }
    }

    // Add unexplored directions (exploration guidance)
    if (worldModelContext.unexploredDirections && worldModelContext.unexploredDirections.length > 0) {
      section += '\n### Unexplored Areas:\n';
      section += `Consider exploring: ${worldModelContext.unexploredDirections.join(', ')}\n`;
    }

    // Add exploration progress
    if (worldModelContext.explorationProgress !== undefined) {
      const progressPct = (worldModelContext.explorationProgress * 100).toFixed(1);
      section += `\n### Exploration Progress: ${progressPct}%\n`;
    }

    return section;
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

// ═══════════════════════════════════════════════════════════════════════════
// HAL & PHYSICAL SKILL EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

// Re-export HAL module for convenience
export {
  HAL_TOOL_DEFINITIONS,
  getHALToolExecutor,
  setGlobalHAL,
  createHAL,
} from '../hal';

// Re-export Physical Skill Loader
export {
  getPhysicalSkillLoader,
} from '../skills/physical-skill-loader';

export type {
  PhysicalSkill,
} from '../skills/physical-skill-loader';

// Re-export Dreaming Engine components
export {
  getBlackBoxRecorder,
  runDreamingCycle,
  shouldDream,
  getDreamingStats,
} from '../evolution';

/**
 * Create an ESP32 agent with HAL mode enabled
 * This is the recommended way to create agents that work with Physical Skills
 */
export function createHALAgent(config: Omit<ESP32AgentConfig, 'useHAL'> & { useHAL?: boolean }): ESP32AgentRuntime {
  return createESP32Agent({
    ...config,
    useHAL: config.useHAL ?? true,
  });
}

/**
 * Create an ESP32 agent with full Dreaming Engine integration
 * Enables HAL, recording, and connects to the evolution system
 */
export function createEvolvingAgent(
  config: Omit<ESP32AgentConfig, 'useHAL' | 'enableRecording'> & {
    useHAL?: boolean;
    enableRecording?: boolean;
  }
): ESP32AgentRuntime {
  return createESP32Agent({
    ...config,
    useHAL: config.useHAL ?? true,
    enableRecording: config.enableRecording ?? true,
  });
}
