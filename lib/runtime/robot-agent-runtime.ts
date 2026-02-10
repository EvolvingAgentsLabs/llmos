/**
 * Robot Agent Runtime - High-Level Control
 *
 * Provides intuitive high-level robot control tools:
 * - rotate_left(degrees): Rotate counter-clockwise by specified degrees
 * - rotate_right(degrees): Rotate clockwise by specified degrees
 * - move_forward(distance_cm): Move forward by specified centimeters
 * - move_backward(distance_cm): Move backward by specified centimeters
 * - stop(): Emergency stop all movement
 * - take_picture(): Capture and analyze current view with sensors
 *
 * Agent loop phases:
 * 1. OBSERVE: 360° scan (8 steps of 45°) with picture + analysis at each step
 * 2. PLAN: Build world representation from observation history
 * 3. ACT: Execute goal-directed behavior using high-level tools
 * 4. UPDATE: Refresh world representation from message history
 */

import { createLLMClient } from '../llm/client';
import { Message } from '../llm/types';
import { getDeviceManager } from '../hardware/esp32-device-manager';

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

/** PWM speed for fast rotation */
const ROTATION_PWM_FAST = 80;
/** PWM speed for slow rotation (fine control near target) */
const ROTATION_PWM_SLOW = 45;
/** PWM speed for forward/backward movement */
const MOVEMENT_PWM = 80;
/** Angle tolerance in radians (~5 degrees) */
const ROTATION_TOLERANCE = 0.087;
/** Angle threshold to switch to slow speed (~15 degrees) */
const ROTATION_SLOW_THRESHOLD = 0.26;
/** Distance tolerance in meters (1 cm) */
const DISTANCE_TOLERANCE = 0.01;
/** Polling interval for movement control (ms) */
const POLL_INTERVAL = 10;
/** Maximum time for a single movement command (ms) */
const MOVEMENT_TIMEOUT = 10000;
/** Number of observation steps in 360° scan */
const OBSERVATION_STEPS = 8;
/** Degrees per observation step */
const OBSERVATION_STEP_DEGREES = 45;

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface RobotAgentConfig {
  id: string;
  name: string;
  description: string;
  deviceId: string;
  systemPrompt: string;
  goal?: string;
  loopInterval?: number;
  maxIterations?: number;
  /** Skip observation phase (default: false) */
  skipObservation?: boolean;
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
  pose?: {
    x: number;
    y: number;
    rotation: number;
    orientationDeg: number;
    compass: string;
  };
  distances?: Record<string, number>;
  detectedObjects?: string[];
}

export interface ObservationRecord {
  step: number;
  totalSteps: number;
  orientationDeg: number;
  compass: string;
  position: { x: number; y: number };
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
  obstacles: string[];
  clearPaths: string[];
  scene: string;
}

export interface WorldRepresentation {
  timestamp: number;
  observations: ObservationRecord[];
  summary: string;
  nearbyObjects: Array<{ direction: string; description: string; distance: number }>;
  clearPaths: string[];
  blockedPaths: string[];
  explorationSuggestion: string;
}

export interface RobotAgentState {
  running: boolean;
  iteration: number;
  lastThought: string;
  lastAction: string | null;
  conversationHistory: Message[];
  errors: string[];
  lastPicture?: CameraAnalysis;
  observationPhaseComplete: boolean;
  worldRepresentation?: WorldRepresentation;
}

// ═══════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function normalizeAngle(angle: number): number {
  while (angle > Math.PI) angle -= 2 * Math.PI;
  while (angle < -Math.PI) angle += 2 * Math.PI;
  return angle;
}

function angleDifference(from: number, to: number): number {
  return normalizeAngle(to - from);
}

function radToDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function getCompassDirection(rotation: number): string {
  const normalized = ((rotation % (2 * Math.PI)) + (2 * Math.PI)) % (2 * Math.PI);
  const degrees = radToDeg(normalized);
  if (degrees < 22.5 || degrees >= 337.5) return 'North';
  if (degrees < 67.5) return 'NE';
  if (degrees < 112.5) return 'East';
  if (degrees < 157.5) return 'SE';
  if (degrees < 202.5) return 'South';
  if (degrees < 247.5) return 'SW';
  if (degrees < 292.5) return 'West';
  return 'NW';
}

function getRobotPose(deviceId: string): { x: number; y: number; rotation: number } | null {
  const manager = getDeviceManager();
  const state = manager.getDeviceState(deviceId);
  if (!state) return null;
  return state.robot.pose;
}

function getRobotSensors(deviceId: string): any | null {
  const manager = getDeviceManager();
  const state = manager.getDeviceState(deviceId);
  if (!state) return null;
  return state.robot.sensors;
}

// ═══════════════════════════════════════════════════════════════════════════
// MOVEMENT CONTROL FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Execute a precise rotation to a target angle with polling-based control.
 * Uses fast speed initially, then slows down near the target for precision.
 */
async function executeRotation(
  deviceId: string,
  degrees: number,
  direction: 'left' | 'right'
): Promise<{ success: boolean; message: string; finalPose?: any }> {
  const manager = getDeviceManager();
  const pose = getRobotPose(deviceId);
  if (!pose) return { success: false, message: 'Device not found' };

  const deltaRad = degToRad(Math.abs(degrees));
  const targetRotation = normalizeAngle(
    pose.rotation + (direction === 'right' ? deltaRad : -deltaRad)
  );

  // Set initial rotation motors (differential drive: opposite wheels)
  const leftSign = direction === 'right' ? -1 : 1;
  const rightSign = direction === 'right' ? 1 : -1;

  await manager.sendCommand(deviceId, {
    type: 'drive',
    payload: { left: leftSign * ROTATION_PWM_FAST, right: rightSign * ROTATION_PWM_FAST },
  });

  const startTime = Date.now();

  while (Date.now() - startTime < MOVEMENT_TIMEOUT) {
    await sleep(POLL_INTERVAL);

    const currentPose = getRobotPose(deviceId);
    if (!currentPose) break;

    const remaining = Math.abs(angleDifference(currentPose.rotation, targetRotation));

    if (remaining < ROTATION_TOLERANCE) {
      // Target reached - stop motors
      await manager.sendCommand(deviceId, { type: 'drive', payload: { left: 0, right: 0 } });
      const finalPose = getRobotPose(deviceId);
      const finalDeg = radToDeg(finalPose?.rotation || 0);
      const compass = getCompassDirection(finalPose?.rotation || 0);
      return {
        success: true,
        message: `Rotated ${direction} ${degrees}°. Now facing ${compass} (${finalDeg.toFixed(1)}°)`,
        finalPose,
      };
    }

    // Slow down near target for precision
    if (remaining < ROTATION_SLOW_THRESHOLD) {
      await manager.sendCommand(deviceId, {
        type: 'drive',
        payload: { left: leftSign * ROTATION_PWM_SLOW, right: rightSign * ROTATION_PWM_SLOW },
      });
    }
  }

  // Timeout - stop motors
  await manager.sendCommand(deviceId, { type: 'drive', payload: { left: 0, right: 0 } });
  const finalPose = getRobotPose(deviceId);
  return {
    success: false,
    message: `Rotation timed out. Current orientation: ${radToDeg(finalPose?.rotation || 0).toFixed(1)}°`,
    finalPose,
  };
}

/**
 * Execute a precise linear movement to a target distance with polling-based control.
 */
async function executeMovement(
  deviceId: string,
  distanceCm: number,
  direction: 'forward' | 'backward'
): Promise<{ success: boolean; message: string; finalPose?: any }> {
  const manager = getDeviceManager();
  const startPose = getRobotPose(deviceId);
  if (!startPose) return { success: false, message: 'Device not found' };

  const targetDistanceM = distanceCm / 100;
  const pwm = direction === 'forward' ? MOVEMENT_PWM : -MOVEMENT_PWM;

  await manager.sendCommand(deviceId, {
    type: 'drive',
    payload: { left: pwm, right: pwm },
  });

  const startTime = Date.now();
  let lastDistance = 0;
  let stuckCount = 0;

  while (Date.now() - startTime < MOVEMENT_TIMEOUT) {
    await sleep(POLL_INTERVAL);

    const currentPose = getRobotPose(deviceId);
    if (!currentPose) break;

    const dx = currentPose.x - startPose.x;
    const dy = currentPose.y - startPose.y;
    const distanceTraveled = Math.sqrt(dx * dx + dy * dy);

    if (distanceTraveled >= targetDistanceM - DISTANCE_TOLERANCE) {
      // Target reached - stop motors
      await manager.sendCommand(deviceId, { type: 'drive', payload: { left: 0, right: 0 } });
      const finalPose = getRobotPose(deviceId);
      return {
        success: true,
        message: `Moved ${direction} ${(distanceTraveled * 100).toFixed(1)}cm. Position: (${finalPose?.x.toFixed(2)}, ${finalPose?.y.toFixed(2)})`,
        finalPose,
      };
    }

    // Stuck detection - if position hasn't changed in 500ms, likely blocked
    if (Math.abs(distanceTraveled - lastDistance) < 0.001) {
      stuckCount++;
      if (stuckCount > 50) { // 50 * 10ms = 500ms stuck
        await manager.sendCommand(deviceId, { type: 'drive', payload: { left: 0, right: 0 } });
        const finalPose = getRobotPose(deviceId);
        return {
          success: false,
          message: `Blocked after moving ${(distanceTraveled * 100).toFixed(1)}cm ${direction}. Obstacle detected.`,
          finalPose,
        };
      }
    } else {
      stuckCount = 0;
      lastDistance = distanceTraveled;
    }
  }

  // Timeout - stop motors
  await manager.sendCommand(deviceId, { type: 'drive', payload: { left: 0, right: 0 } });
  const finalPose = getRobotPose(deviceId);
  return {
    success: false,
    message: `Movement timed out after ${MOVEMENT_TIMEOUT}ms`,
    finalPose,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// SCENE ANALYSIS HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function describeScene(sensors: any): string {
  const d = sensors.distance;
  const parts: string[] = [];

  if (d.front > 100) {
    parts.push('Clear path ahead');
  } else if (d.front > 50) {
    parts.push(`Obstacle ahead at ~${Math.round(d.front)}cm`);
  } else {
    parts.push(`Close obstacle ahead at ~${Math.round(d.front)}cm`);
  }

  if (d.left < 40) parts.push('obstacle on left');
  else parts.push('left side clear');

  if (d.right < 40) parts.push('obstacle on right');
  else parts.push('right side clear');

  if (d.back < 40) parts.push('obstacle behind');

  return parts.join(', ');
}

function describeDistances(sensors: any): string {
  const d = sensors.distance;
  return [
    `Front: ${Math.round(d.front)}cm`,
    `Front-Left: ${Math.round(d.frontLeft)}cm`,
    `Front-Right: ${Math.round(d.frontRight)}cm`,
    `Left: ${Math.round(d.left)}cm`,
    `Right: ${Math.round(d.right)}cm`,
    `Back: ${Math.round(d.back)}cm`,
    `Back-Left: ${Math.round(d.backLeft)}cm`,
    `Back-Right: ${Math.round(d.backRight)}cm`,
  ].join(' | ');
}

function suggestDirection(sensors: any): string {
  const d = sensors.distance;
  if (d.front > 80) return 'Path ahead is clear - can go forward';
  if (d.left > d.right && d.left > 50) return 'Turn left - more space on the left side';
  if (d.right > d.left && d.right > 50) return 'Turn right - more space on the right side';
  if (d.front < 30) return 'Too close to obstacle - back up first';
  return 'Limited space - rotate to find open path';
}

function identifyObstacles(sensors: any): string[] {
  const d = sensors.distance;
  const obstacles: string[] = [];
  if (d.front < 50) obstacles.push(`front (${Math.round(d.front)}cm)`);
  if (d.frontLeft < 50) obstacles.push(`front-left (${Math.round(d.frontLeft)}cm)`);
  if (d.frontRight < 50) obstacles.push(`front-right (${Math.round(d.frontRight)}cm)`);
  if (d.left < 40) obstacles.push(`left (${Math.round(d.left)}cm)`);
  if (d.right < 40) obstacles.push(`right (${Math.round(d.right)}cm)`);
  if (d.back < 40) obstacles.push(`back (${Math.round(d.back)}cm)`);
  if (d.backLeft < 40) obstacles.push(`back-left (${Math.round(d.backLeft)}cm)`);
  if (d.backRight < 40) obstacles.push(`back-right (${Math.round(d.backRight)}cm)`);
  return obstacles;
}

function identifyClearPaths(sensors: any): string[] {
  const d = sensors.distance;
  const clear: string[] = [];
  if (d.front > 80) clear.push(`front (${Math.round(d.front)}cm clear)`);
  if (d.frontLeft > 80) clear.push(`front-left (${Math.round(d.frontLeft)}cm clear)`);
  if (d.frontRight > 80) clear.push(`front-right (${Math.round(d.frontRight)}cm clear)`);
  if (d.left > 60) clear.push(`left (${Math.round(d.left)}cm clear)`);
  if (d.right > 60) clear.push(`right (${Math.round(d.right)}cm clear)`);
  if (d.back > 60) clear.push(`back (${Math.round(d.back)}cm clear)`);
  return clear;
}

// ═══════════════════════════════════════════════════════════════════════════
// HIGH-LEVEL ROBOT TOOLS
// ═══════════════════════════════════════════════════════════════════════════

const ROBOT_TOOLS: RobotAgentTool[] = [
  {
    name: 'rotate_left',
    description: 'Rotate the robot left (counter-clockwise) by the specified number of degrees. The robot rotates in place without moving forward or backward.',
    parameters: {
      type: 'object',
      properties: {
        degrees: {
          type: 'number',
          description: 'Degrees to rotate left (1-360)',
          minimum: 1,
          maximum: 360,
        },
      },
      required: ['degrees'],
    },
    execute: async (args, deviceId) => {
      const degrees = Math.max(1, Math.min(360, Number(args.degrees) || 45));
      return executeRotation(deviceId, degrees, 'left');
    },
  },
  {
    name: 'rotate_right',
    description: 'Rotate the robot right (clockwise) by the specified number of degrees. The robot rotates in place without moving forward or backward.',
    parameters: {
      type: 'object',
      properties: {
        degrees: {
          type: 'number',
          description: 'Degrees to rotate right (1-360)',
          minimum: 1,
          maximum: 360,
        },
      },
      required: ['degrees'],
    },
    execute: async (args, deviceId) => {
      const degrees = Math.max(1, Math.min(360, Number(args.degrees) || 45));
      return executeRotation(deviceId, degrees, 'right');
    },
  },
  {
    name: 'move_forward',
    description: 'Move the robot forward by the specified distance in centimeters. The robot moves in a straight line in its current facing direction. Will stop if it hits an obstacle.',
    parameters: {
      type: 'object',
      properties: {
        distance_cm: {
          type: 'number',
          description: 'Distance to move forward in centimeters (1-200)',
          minimum: 1,
          maximum: 200,
        },
      },
      required: ['distance_cm'],
    },
    execute: async (args, deviceId) => {
      const distanceCm = Math.max(1, Math.min(200, Number(args.distance_cm) || 20));
      return executeMovement(deviceId, distanceCm, 'forward');
    },
  },
  {
    name: 'move_backward',
    description: 'Move the robot backward by the specified distance in centimeters. The robot moves in a straight line opposite to its facing direction. Will stop if it hits an obstacle.',
    parameters: {
      type: 'object',
      properties: {
        distance_cm: {
          type: 'number',
          description: 'Distance to move backward in centimeters (1-200)',
          minimum: 1,
          maximum: 200,
        },
      },
      required: ['distance_cm'],
    },
    execute: async (args, deviceId) => {
      const distanceCm = Math.max(1, Math.min(200, Number(args.distance_cm) || 20));
      return executeMovement(deviceId, distanceCm, 'backward');
    },
  },
  {
    name: 'stop',
    description: 'Immediately stop all robot movement. Use this for emergency stops or when you need the robot to be completely still.',
    parameters: {
      type: 'object',
      properties: {},
    },
    execute: async (_args, deviceId) => {
      const manager = getDeviceManager();
      const success = await manager.sendCommand(deviceId, {
        type: 'drive',
        payload: { left: 0, right: 0 },
      });
      return {
        success,
        message: success ? 'Robot stopped' : 'Failed to stop robot',
      };
    },
  },
  {
    name: 'take_picture',
    description: 'Take a picture and analyze the current view. Returns what the robot sees in all directions: distances to obstacles, clear paths, and detected objects. Also returns the robot\'s current position and orientation. Use this to understand your surroundings before deciding what to do.',
    parameters: {
      type: 'object',
      properties: {},
    },
    execute: async (_args, deviceId) => {
      const pose = getRobotPose(deviceId);
      const sensors = getRobotSensors(deviceId);

      if (!pose || !sensors) {
        return { success: false, error: 'Device not found' };
      }

      const d = sensors.distance;
      const orientationDeg = radToDeg(pose.rotation);
      const compass = getCompassDirection(pose.rotation);

      const analysis: CameraAnalysis = {
        timestamp: Date.now(),
        scene: describeScene(sensors),
        obstacles: {
          front: d.front < 50,
          left: d.left < 40,
          right: d.right < 40,
          frontDistance: d.front,
        },
        recommendation: suggestDirection(sensors),
        pose: {
          x: pose.x,
          y: pose.y,
          rotation: pose.rotation,
          orientationDeg: parseFloat(orientationDeg.toFixed(1)),
          compass,
        },
        distances: {
          front: Math.round(d.front),
          frontLeft: Math.round(d.frontLeft),
          frontRight: Math.round(d.frontRight),
          left: Math.round(d.left),
          right: Math.round(d.right),
          back: Math.round(d.back),
          backLeft: Math.round(d.backLeft),
          backRight: Math.round(d.backRight),
        },
        detectedObjects: identifyObstacles(sensors),
      };

      return {
        success: true,
        picture: analysis,
      };
    },
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// SYSTEM PROMPT
// ═══════════════════════════════════════════════════════════════════════════

export const SIMPLE_ROBOT_PROMPT = `You are an autonomous robot with a camera, distance sensors, and differential drive wheels.

## Your Tools
You have 6 high-level tools:

### Movement
1. **rotate_left(degrees)** - Rotate counter-clockwise by specified degrees (1-360)
2. **rotate_right(degrees)** - Rotate clockwise by specified degrees (1-360)
3. **move_forward(distance_cm)** - Move forward by specified centimeters (1-200)
4. **move_backward(distance_cm)** - Move backward by specified centimeters (1-200)
5. **stop()** - Emergency stop all movement

### Perception
6. **take_picture()** - Analyze surroundings: distances in all 8 directions, obstacles, clear paths, position, and orientation

## Your Behavior Cycle
Every turn, follow this cycle:
1. **LOOK**: Take a picture to see your surroundings
2. **THINK**: Analyze what you see, consider your goal and world knowledge
3. **ACT**: Use movement tools (rotate then move, or just rotate, or just move)
4. **OBSERVE**: After moving, take another picture to confirm the result

## Decision Making
- Always take_picture before deciding on movement
- Use rotate_left/rotate_right to face the desired direction FIRST, then move_forward
- If an obstacle is ahead, rotate to face a clear path before moving
- If stuck or blocked, move_backward then rotate to find a new path
- Keep track of where you've been to avoid going in circles

## World Understanding
You will receive a world representation summary that shows what you've observed so far.
Use this to make informed decisions about where to explore next.

## Response Format
First briefly describe what you see and your plan, then output tool calls as JSON:
{"tool": "tool_name", "args": {...}}

Example:
"I see a clear path ahead and obstacles to my left. I'll move forward to explore."
{"tool": "take_picture", "args": {}}
{"tool": "move_forward", "args": {"distance_cm": 30}}`;

// ═══════════════════════════════════════════════════════════════════════════
// WORLD REPRESENTATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build a world representation from the observation records stored in messages.
 * Scans conversation history for observation entries and synthesizes them
 * into a coherent world model summary.
 */
function buildWorldRepresentationFromHistory(
  conversationHistory: Message[],
  observations: ObservationRecord[]
): WorldRepresentation {
  const allObstacles: Map<string, { direction: string; distance: number }> = new Map();
  const allClearPaths: Set<string> = new Set();
  const allBlockedPaths: Set<string> = new Set();

  for (const obs of observations) {
    for (const obstacle of obs.obstacles) {
      allBlockedPaths.add(obstacle);
      // Use the observation compass + obstacle info as key
      const key = `${obs.compass}-${obstacle}`;
      allObstacles.set(key, {
        direction: `${obs.compass} (${obs.orientationDeg.toFixed(0)}°)`,
        distance: obs.distances.front, // approximate
      });
    }
    for (const clear of obs.clearPaths) {
      allClearPaths.add(`${obs.compass}: ${clear}`);
    }
  }

  // Build summary text
  let summary = `=== WORLD REPRESENTATION (${observations.length} observations) ===\n`;
  summary += `Last updated: ${new Date().toISOString()}\n\n`;

  if (observations.length > 0) {
    summary += '--- OBSERVATIONS BY DIRECTION ---\n';
    for (const obs of observations) {
      summary += `\n[${obs.compass} / ${obs.orientationDeg.toFixed(0)}°] `;
      summary += `Position: (${obs.position.x.toFixed(2)}, ${obs.position.y.toFixed(2)})\n`;
      summary += `  Distances: Front=${Math.round(obs.distances.front)}cm`;
      summary += ` Left=${Math.round(obs.distances.left)}cm`;
      summary += ` Right=${Math.round(obs.distances.right)}cm\n`;
      if (obs.obstacles.length > 0) {
        summary += `  Obstacles: ${obs.obstacles.join(', ')}\n`;
      }
      if (obs.clearPaths.length > 0) {
        summary += `  Clear paths: ${obs.clearPaths.join(', ')}\n`;
      }
    }
  }

  summary += '\n--- OVERALL ASSESSMENT ---\n';
  if (allClearPaths.size > 0) {
    summary += `Clear paths: ${Array.from(allClearPaths).join('; ')}\n`;
  }
  if (allBlockedPaths.size > 0) {
    summary += `Blocked/obstacles: ${Array.from(allBlockedPaths).join('; ')}\n`;
  }

  // Exploration suggestion
  const clearest = observations.reduce(
    (best, obs) => {
      const maxDist = Math.max(obs.distances.front, obs.distances.left, obs.distances.right);
      return maxDist > best.dist ? { dir: obs.compass, dist: maxDist, deg: obs.orientationDeg } : best;
    },
    { dir: 'unknown', dist: 0, deg: 0 }
  );
  const explorationSuggestion = clearest.dist > 0
    ? `Most open direction: ${clearest.dir} (${clearest.deg.toFixed(0)}°) with ${Math.round(clearest.dist)}cm clearance`
    : 'No clear exploration direction found';

  summary += `\nExploration suggestion: ${explorationSuggestion}\n`;

  return {
    timestamp: Date.now(),
    observations,
    summary,
    nearbyObjects: Array.from(allObstacles.values()).map(o => ({
      direction: o.direction,
      description: 'obstacle',
      distance: o.distance,
    })),
    clearPaths: Array.from(allClearPaths),
    blockedPaths: Array.from(allBlockedPaths),
    explorationSuggestion,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// ROBOT AGENT RUNTIME CLASS
// ═══════════════════════════════════════════════════════════════════════════

export class RobotAgentRuntime {
  private config: RobotAgentConfig;
  private state: RobotAgentState;
  private llmClient: any;
  private intervalHandle: any = null;
  private onStateChange?: (state: RobotAgentState) => void;
  private observationRecords: ObservationRecord[] = [];

  constructor(config: RobotAgentConfig, onStateChange?: (state: RobotAgentState) => void) {
    this.config = {
      ...config,
      loopInterval: config.loopInterval || 2000,
      maxIterations: config.maxIterations,
    };

    // Build system prompt with goal if provided
    let systemPrompt = config.systemPrompt || SIMPLE_ROBOT_PROMPT;
    if (config.goal) {
      systemPrompt = `${systemPrompt}\n\n## Your Main Goal\n**${config.goal}**\n\nKeep this goal in mind when deciding which direction to go and what to do.`;
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
      observationPhaseComplete: false,
    };

    this.onStateChange = onStateChange;
    this.llmClient = createLLMClient();

    if (!this.llmClient) {
      throw new Error('Failed to create LLM client - check API key configuration');
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // LIFECYCLE
  // ─────────────────────────────────────────────────────────────────────────

  start(): void {
    if (this.state.running) {
      console.warn(`[RobotAgent:${this.config.name}] Already running`);
      return;
    }

    console.log(`[RobotAgent:${this.config.name}] Starting control loop`);
    this.state.running = true;
    this.state.iteration = 0;
    this.state.errors = [];
    this.state.observationPhaseComplete = false;
    this.observationRecords = [];
    this.emitStateChange();

    // Start with observation phase, then control loop
    this.runWithObservation();
  }

  stop(): void {
    if (!this.state.running) return;

    console.log(`[RobotAgent:${this.config.name}] Stopping control loop`);

    if (this.intervalHandle) {
      clearTimeout(this.intervalHandle);
      this.intervalHandle = null;
    }

    this.state.running = false;
    this.emitStateChange();

    // Stop the robot
    const manager = getDeviceManager();
    manager.sendCommand(this.config.deviceId, {
      type: 'drive',
      payload: { left: 0, right: 0 },
    });
  }

  getState(): RobotAgentState {
    return { ...this.state };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // OBSERVATION PHASE: 360° scan with 45° steps
  // ─────────────────────────────────────────────────────────────────────────

  private async runWithObservation(): Promise<void> {
    if (!this.state.running) return;

    if (!this.config.skipObservation) {
      try {
        await this.runObservationPhase();
      } catch (error: any) {
        console.error(`[RobotAgent:${this.config.name}] Observation phase error:`, error);
        this.state.errors.push(`Observation phase failed: ${error.message}`);
      }
    }

    // Start the main control loop
    this.runControlLoop();
  }

  /**
   * Perform a complete 360° observation scan:
   * - 8 steps of 45° each
   * - At each step: stop, take picture, analyze, record in messages
   * - After scan: build world representation from all observations
   */
  private async runObservationPhase(): Promise<void> {
    if (!this.state.running) return;

    console.log(`[RobotAgent:${this.config.name}] Starting 360° observation phase`);

    // Announce the observation phase in conversation
    this.state.conversationHistory.push({
      role: 'user',
      content: '=== OBSERVATION PHASE: Performing 360° environment scan (8 steps × 45°) ===\nThe robot will rotate in place, taking a picture and analyzing the view at each step to build an internal representation of the surrounding world.',
    });
    this.emitStateChange();

    for (let step = 0; step < OBSERVATION_STEPS; step++) {
      if (!this.state.running) break;

      // 1. Take picture and analyze at current orientation
      const pose = getRobotPose(this.config.deviceId);
      const sensors = getRobotSensors(this.config.deviceId);

      if (!pose || !sensors) {
        this.state.errors.push(`Observation step ${step + 1}: Device not available`);
        continue;
      }

      const d = sensors.distance;
      const orientationDeg = radToDeg(pose.rotation);
      const compass = getCompassDirection(pose.rotation);
      const obstacles = identifyObstacles(sensors);
      const clearPaths = identifyClearPaths(sensors);
      const scene = describeScene(sensors);

      // 2. Create observation record
      const observation: ObservationRecord = {
        step: step + 1,
        totalSteps: OBSERVATION_STEPS,
        orientationDeg: parseFloat(orientationDeg.toFixed(1)),
        compass,
        position: { x: parseFloat(pose.x.toFixed(3)), y: parseFloat(pose.y.toFixed(3)) },
        distances: {
          front: Math.round(d.front),
          frontLeft: Math.round(d.frontLeft),
          frontRight: Math.round(d.frontRight),
          left: Math.round(d.left),
          right: Math.round(d.right),
          back: Math.round(d.back),
          backLeft: Math.round(d.backLeft),
          backRight: Math.round(d.backRight),
        },
        obstacles,
        clearPaths,
        scene,
      };

      this.observationRecords.push(observation);

      // 3. Record observation in conversation history (builds the internal world representation)
      const observationMessage = [
        `[Observation ${step + 1}/${OBSERVATION_STEPS}] Facing: ${compass} (${orientationDeg.toFixed(1)}°)`,
        `Position: (${pose.x.toFixed(2)}, ${pose.y.toFixed(2)})`,
        `Distances: ${describeDistances(sensors)}`,
        `Scene: ${scene}`,
        obstacles.length > 0 ? `Obstacles detected: ${obstacles.join(', ')}` : 'No obstacles nearby',
        clearPaths.length > 0 ? `Clear paths: ${clearPaths.join(', ')}` : 'No clear paths',
      ].join('\n');

      this.state.conversationHistory.push({
        role: 'assistant',
        content: observationMessage,
      });

      console.log(`[RobotAgent:${this.config.name}] Observation ${step + 1}/${OBSERVATION_STEPS}: ${compass} - ${scene}`);
      this.emitStateChange();

      // 4. Rotate 45° right for next step (except after last step)
      if (step < OBSERVATION_STEPS - 1) {
        const rotateResult = await executeRotation(
          this.config.deviceId,
          OBSERVATION_STEP_DEGREES,
          'right'
        );

        if (!rotateResult.success) {
          console.warn(`[RobotAgent:${this.config.name}] Rotation step ${step + 1} imprecise: ${rotateResult.message}`);
        }

        // Brief pause to let sensors stabilize after rotation
        await sleep(100);
      }
    }

    // 5. Build world representation from all observations
    this.state.worldRepresentation = buildWorldRepresentationFromHistory(
      this.state.conversationHistory,
      this.observationRecords
    );

    // 6. Add world representation to conversation
    this.state.conversationHistory.push({
      role: 'user',
      content: `=== OBSERVATION PHASE COMPLETE ===\n\n${this.state.worldRepresentation.summary}\nYou now have a 360° understanding of your surroundings. Use this knowledge to plan your actions. The world representation above summarizes what you observed at each direction. Refer to it when making decisions.\n\nNow entering the action phase. What will you do first?`,
    });

    this.state.observationPhaseComplete = true;
    this.emitStateChange();

    console.log(`[RobotAgent:${this.config.name}] Observation phase complete. ${this.observationRecords.length} observations recorded.`);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // MAIN CONTROL LOOP
  // ─────────────────────────────────────────────────────────────────────────

  private async runControlLoop(): Promise<void> {
    if (!this.state.running) return;

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
      this.state.conversationHistory.push({
        role: 'user',
        content: userPrompt,
      });

      // Call LLM with tool descriptions
      const response = await this.callLLMWithTools();

      // Parse and execute any tool calls
      await this.executeToolCalls(response);

      // Periodically refresh world representation (every 5 iterations)
      if (this.state.iteration % 5 === 0) {
        await this.refreshWorldRepresentation();
      }

      // Schedule next iteration
      this.intervalHandle = setTimeout(() => {
        this.runControlLoop();
      }, this.config.loopInterval);
    } catch (error: any) {
      console.error(`[RobotAgent:${this.config.name}] Error in control loop:`, error);
      this.state.errors.push(error.message || String(error));
      this.emitStateChange();

      if (this.state.running) {
        this.intervalHandle = setTimeout(() => {
          this.runControlLoop();
        }, this.config.loopInterval);
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // WORLD REPRESENTATION REFRESH
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Refresh the world representation by analyzing the latest observations
   * and adding a summary to the conversation as an additional analysis step.
   */
  private async refreshWorldRepresentation(): Promise<void> {
    // Take a fresh observation at current position
    const pose = getRobotPose(this.config.deviceId);
    const sensors = getRobotSensors(this.config.deviceId);

    if (pose && sensors) {
      const compass = getCompassDirection(pose.rotation);
      const orientationDeg = radToDeg(pose.rotation);
      const d = sensors.distance;

      // Add latest observation
      const latestObs: ObservationRecord = {
        step: this.observationRecords.length + 1,
        totalSteps: this.observationRecords.length + 1,
        orientationDeg: parseFloat(orientationDeg.toFixed(1)),
        compass,
        position: { x: parseFloat(pose.x.toFixed(3)), y: parseFloat(pose.y.toFixed(3)) },
        distances: {
          front: Math.round(d.front),
          frontLeft: Math.round(d.frontLeft),
          frontRight: Math.round(d.frontRight),
          left: Math.round(d.left),
          right: Math.round(d.right),
          back: Math.round(d.back),
          backLeft: Math.round(d.backLeft),
          backRight: Math.round(d.backRight),
        },
        obstacles: identifyObstacles(sensors),
        clearPaths: identifyClearPaths(sensors),
        scene: describeScene(sensors),
      };

      this.observationRecords.push(latestObs);

      // Keep observation history manageable
      if (this.observationRecords.length > 50) {
        this.observationRecords = this.observationRecords.slice(-30);
      }
    }

    // Rebuild world representation
    this.state.worldRepresentation = buildWorldRepresentationFromHistory(
      this.state.conversationHistory,
      this.observationRecords
    );

    // Add updated world representation to conversation
    this.state.conversationHistory.push({
      role: 'user',
      content: `=== WORLD REPRESENTATION UPDATE (Iteration ${this.state.iteration}) ===\n${this.state.worldRepresentation.summary}`,
    });

    this.emitStateChange();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PROMPT BUILDING
  // ─────────────────────────────────────────────────────────────────────────

  private buildCyclePrompt(): string {
    let prompt = `--- Action Cycle ${this.state.iteration} ---\n\n`;
    prompt += 'Cycle: LOOK (take_picture) → THINK → ACT (rotate/move) → OBSERVE (take_picture)\n\n';

    // Include current pose
    const pose = getRobotPose(this.config.deviceId);
    if (pose) {
      const compass = getCompassDirection(pose.rotation);
      prompt += `Current position: (${pose.x.toFixed(2)}, ${pose.y.toFixed(2)}) facing ${compass} (${radToDeg(pose.rotation).toFixed(1)}°)\n\n`;
    }

    // Include last picture info
    if (this.state.lastPicture) {
      prompt += `Last observation: ${this.state.lastPicture.scene}\n`;
      prompt += `Suggestion: ${this.state.lastPicture.recommendation}\n\n`;
    }

    prompt += 'What will you do? Start by taking a picture to see your current surroundings, then decide on movement.';

    return prompt;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // LLM INTERACTION
  // ─────────────────────────────────────────────────────────────────────────

  private async callLLMWithTools(): Promise<string> {
    const toolsDescription = ROBOT_TOOLS.map(
      (tool) => `
Tool: ${tool.name}
Description: ${tool.description}
Parameters: ${JSON.stringify(tool.parameters, null, 2)}`
    ).join('\n\n');

    const messagesWithTools = [
      ...this.state.conversationHistory,
      {
        role: 'system' as const,
        content: `Available Tools:\n${toolsDescription}\n\nTo use a tool, respond with a JSON object: {"tool": "tool_name", "args": {...}}`,
      },
    ];

    const response = await this.llmClient.chatDirect(messagesWithTools);

    this.state.lastThought = response;
    this.state.conversationHistory.push({
      role: 'assistant',
      content: response,
    });

    this.emitStateChange();
    return response;
  }

  private async executeToolCalls(response: string): Promise<void> {
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

        const toolDef = ROBOT_TOOLS.find((t) => t.name === tool);
        if (!toolDef) {
          throw new Error(`Unknown tool: ${tool}`);
        }

        const result = await toolDef.execute(args || {}, this.config.deviceId);

        // Store camera analysis if this was a picture
        if (tool === 'take_picture' && result.success && result.picture) {
          this.state.lastPicture = result.picture;
        }

        results.push(`${tool}(${JSON.stringify(args || {})}) → ${JSON.stringify(result)}`);
      } catch (error: any) {
        console.error(`[RobotAgent:${this.config.name}] Failed to execute tool:`, error);
        this.state.errors.push(`Tool execution failed: ${error.message}`);
      }
    }

    this.state.lastAction = results.join('\n');

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

// ═══════════════════════════════════════════════════════════════════════════
// GLOBAL REGISTRY
// ═══════════════════════════════════════════════════════════════════════════

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
