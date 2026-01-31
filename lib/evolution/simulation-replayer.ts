/**
 * Simulation Replayer
 *
 * Replays recorded sessions in headless Three.js simulation.
 * Part of the Dreaming Engine - allows the robot to "dream" about
 * past failures and try different approaches.
 *
 * Usage:
 * ```typescript
 * const replayer = getSimulationReplayer();
 *
 * // Load a failed session
 * const session = await recorder.loadSession('session_xxx');
 *
 * // Replay in simulation
 * const result = await replayer.replaySession(session, {
 *   onFrame: (frame, index) => console.log(`Frame ${index}`),
 *   skillVariant: modifiedSkill, // Try a different skill variant
 * });
 *
 * // Check if the variant performed better
 * if (result.failureCount < session.failures.length) {
 *   console.log('Variant is better!');
 * }
 * ```
 */

import { logger } from '@/lib/debug/logger';
import { RecordingSession, RecordedFrame, FailureMarker } from './black-box-recorder';
import { PhysicalSkill } from '../skills/physical-skill-loader';
import { HALToolCall, DeviceTelemetry } from '../hal/types';

/**
 * Replay options
 */
export interface ReplayOptions {
  /** Speed multiplier (1 = realtime, 10 = 10x faster) */
  speed?: number;
  /** Start from specific frame index */
  startFrame?: number;
  /** End at specific frame index */
  endFrame?: number;
  /** Alternative skill to try */
  skillVariant?: PhysicalSkill;
  /** Callback for each frame */
  onFrame?: (frame: RecordedFrame, index: number) => void;
  /** Callback when failure would occur */
  onFailure?: (failure: FailureMarker, index: number) => void;
  /** Run headless (no visualization) */
  headless?: boolean;
}

/**
 * Replay result
 */
export interface ReplayResult {
  sessionId: string;
  originalFailureCount: number;
  replayFailureCount: number;
  framesProcessed: number;
  duration: number;
  improvement: number; // Percentage improvement
  newFailures: FailureMarker[];
  avoidedFailures: FailureMarker[];
  metrics: {
    averageConfidence: number;
    toolCallCount: number;
    emergencyStops: number;
  };
  skillVariantUsed?: string;
}

/**
 * Physics configuration for simulation accuracy
 */
export interface PhysicsConfig {
  /** Time step for physics simulation in ms */
  timeStep: number;
  /** Robot wheel base width in cm */
  wheelBase: number;
  /** Maximum motor speed (PWM 255 = this many cm/s) */
  maxSpeed: number;
  /** Motor deadband threshold - PWM values below this produce no movement */
  motorDeadband: number;
  /** Acceleration limit (cm/s²) */
  maxAcceleration: number;
  /** Deceleration limit (cm/s²) */
  maxDeceleration: number;
  /** Rotational inertia factor (0-1, higher = more sluggish turns) */
  rotationalInertia: number;
  /** Linear inertia factor (0-1, higher = more momentum) */
  linearInertia: number;
  /** Sensor noise standard deviation (cm) */
  sensorNoise: number;
  /** Enable trajectory prediction for collision detection */
  trajectoryPrediction: boolean;
  /** Trajectory prediction horizon (frames) */
  predictionHorizon: number;
}

/**
 * Default physics configuration matching ESP32 robot
 */
export const DEFAULT_PHYSICS_CONFIG: PhysicsConfig = {
  timeStep: 200, // 200ms = 5Hz control loop
  wheelBase: 12, // 12cm between wheels
  maxSpeed: 50, // 50 cm/s at PWM 255
  motorDeadband: 40, // PWM < 40 produces no movement
  maxAcceleration: 100, // cm/s² acceleration
  maxDeceleration: 200, // cm/s² deceleration (braking is faster)
  rotationalInertia: 0.3, // Medium rotational inertia
  linearInertia: 0.4, // Medium linear inertia
  sensorNoise: 2, // ±2cm sensor noise
  trajectoryPrediction: true,
  predictionHorizon: 5, // Look ahead 5 frames (~1 second)
};

/**
 * Simulated world state
 */
interface SimulatedState {
  position: { x: number; y: number; z: number };
  rotation: { yaw: number; pitch: number; roll: number };
  velocity: { linear: number; angular: number };
  /** Target velocity from motor commands (before inertia) */
  targetVelocity: { linear: number; angular: number };
  /** Motor PWM values */
  motorPWM: { left: number; right: number };
  sensors: {
    distance: { front: number; left: number; right: number };
    line: number[];
    battery: number;
  };
  led: { r: number; g: number; b: number };
  /** Timestamp of last physics update */
  lastUpdateTime: number;
  /** Trajectory prediction - predicted positions for next N frames */
  predictedTrajectory: Array<{ x: number; y: number; yaw: number }>;
}

/**
 * Simulation Replayer
 *
 * Replays recorded sessions to test skill variants.
 * Uses physics simulation with inertia, motor deadband, and trajectory prediction.
 */
export class SimulationReplayer {
  private isReplaying = false;
  private currentReplayId: string | null = null;
  private abortController: AbortController | null = null;
  private physics: PhysicsConfig;

  constructor(physicsConfig?: Partial<PhysicsConfig>) {
    this.physics = { ...DEFAULT_PHYSICS_CONFIG, ...physicsConfig };
  }

  /**
   * Update physics configuration
   */
  setPhysicsConfig(config: Partial<PhysicsConfig>): void {
    this.physics = { ...this.physics, ...config };
    logger.info('replayer', 'Physics config updated', this.physics);
  }

  /**
   * Get current physics configuration
   */
  getPhysicsConfig(): PhysicsConfig {
    return { ...this.physics };
  }

  /**
   * Replay a recorded session in simulation
   */
  async replaySession(
    session: RecordingSession,
    options: ReplayOptions = {}
  ): Promise<ReplayResult> {
    if (this.isReplaying) {
      throw new Error('Replay already in progress');
    }

    this.isReplaying = true;
    this.currentReplayId = session.id;
    this.abortController = new AbortController();

    const speed = options.speed || 10; // Default 10x speed for dreaming
    const startFrame = options.startFrame || 0;
    const endFrame = options.endFrame || session.frames.length;

    logger.info('replayer', 'Starting session replay', {
      sessionId: session.id,
      frames: session.frames.length,
      speed,
      skillVariant: options.skillVariant?.frontmatter.name,
    });

    const startTime = Date.now();
    const result: ReplayResult = {
      sessionId: session.id,
      originalFailureCount: session.failures.length,
      replayFailureCount: 0,
      framesProcessed: 0,
      duration: 0,
      improvement: 0,
      newFailures: [],
      avoidedFailures: [],
      metrics: {
        averageConfidence: 0,
        toolCallCount: 0,
        emergencyStops: 0,
      },
      skillVariantUsed: options.skillVariant?.frontmatter.name,
    };

    // Initialize simulated state from first frame
    let state = this.initializeState(session.frames[startFrame]);
    let confidenceSum = 0;

    try {
      for (let i = startFrame; i < endFrame && i < session.frames.length; i++) {
        // Check for abort
        if (this.abortController.signal.aborted) {
          break;
        }

        const frame = session.frames[i];
        result.framesProcessed++;

        // Simulate frame processing
        const { newState, failures } = await this.simulateFrame(
          frame,
          state,
          options.skillVariant,
          session.failures
        );
        state = newState;

        // Track new failures
        for (const failure of failures) {
          // Check if this failure existed in original session
          const wasOriginalFailure = session.failures.some(
            (f) => Math.abs(f.frameIndex - i) < 5 && f.type === failure.type
          );

          if (!wasOriginalFailure) {
            result.newFailures.push(failure);
          }
          result.replayFailureCount++;
        }

        // Track metrics
        if (frame.confidence !== undefined) {
          confidenceSum += frame.confidence;
        }
        result.metrics.toolCallCount += frame.toolCalls.length;

        // Check for emergency stops
        if (frame.toolCalls.some((tc) => tc.name === 'hal_emergency_stop')) {
          result.metrics.emergencyStops++;
        }

        // Callback
        if (options.onFrame) {
          options.onFrame(frame, i);
        }

        // Simulate time delay (at speed multiplier)
        if (!options.headless && i < endFrame - 1) {
          const nextFrame = session.frames[i + 1];
          const delay = (nextFrame.relativeTime - frame.relativeTime) / speed;
          if (delay > 0) {
            await this.sleep(Math.min(delay, 100)); // Cap at 100ms
          }
        }
      }

      // Check for avoided failures
      for (const originalFailure of session.failures) {
        const wasReplicated = result.newFailures.some(
          (f) =>
            Math.abs(f.frameIndex - originalFailure.frameIndex) < 5 &&
            f.type === originalFailure.type
        );

        if (!wasReplicated) {
          result.avoidedFailures.push(originalFailure);
        }
      }

      // Calculate final metrics
      result.duration = Date.now() - startTime;
      result.metrics.averageConfidence =
        result.framesProcessed > 0 ? confidenceSum / result.framesProcessed : 0;
      result.improvement =
        session.failures.length > 0
          ? ((session.failures.length - result.replayFailureCount) / session.failures.length) * 100
          : 0;

      logger.info('replayer', 'Replay completed', {
        sessionId: session.id,
        framesProcessed: result.framesProcessed,
        originalFailures: result.originalFailureCount,
        replayFailures: result.replayFailureCount,
        improvement: `${result.improvement.toFixed(1)}%`,
      });

      return result;
    } finally {
      this.isReplaying = false;
      this.currentReplayId = null;
      this.abortController = null;
    }
  }

  /**
   * Replay multiple sessions in batch (for evolutionary testing)
   */
  async replayBatch(
    sessions: RecordingSession[],
    skillVariant: PhysicalSkill,
    options: Omit<ReplayOptions, 'skillVariant'> = {}
  ): Promise<ReplayResult[]> {
    const results: ReplayResult[] = [];

    for (const session of sessions) {
      try {
        const result = await this.replaySession(session, {
          ...options,
          skillVariant,
          headless: true, // Always headless for batch
        });
        results.push(result);
      } catch (error) {
        logger.error('replayer', 'Batch replay failed for session', {
          sessionId: session.id,
          error,
        });
      }
    }

    return results;
  }

  /**
   * Stop current replay
   */
  stopReplay(): void {
    if (this.abortController) {
      this.abortController.abort();
    }
  }

  /**
   * Check if replay is in progress
   */
  isReplayInProgress(): boolean {
    return this.isReplaying;
  }

  /**
   * Get current replay session ID
   */
  getCurrentReplayId(): string | null {
    return this.currentReplayId;
  }

  /**
   * Initialize simulated state from first frame
   */
  private initializeState(frame: RecordedFrame): SimulatedState {
    const telemetry = frame.telemetry;

    return {
      position: telemetry.pose
        ? { x: telemetry.pose.x, y: telemetry.pose.y, z: telemetry.pose.z || 0 }
        : { x: 0, y: 0, z: 0 },
      rotation: telemetry.pose
        ? { yaw: telemetry.pose.yaw, pitch: 0, roll: 0 }
        : { yaw: 0, pitch: 0, roll: 0 },
      velocity: { linear: 0, angular: 0 },
      targetVelocity: { linear: 0, angular: 0 },
      motorPWM: { left: 0, right: 0 },
      sensors: telemetry.sensors
        ? {
            distance: {
              front: telemetry.sensors.distance?.[0] || 100,
              left: telemetry.sensors.distance?.[1] || 100,
              right: telemetry.sensors.distance?.[2] || 100,
            },
            line: telemetry.sensors.line || [],
            battery: telemetry.sensors.battery || 100,
          }
        : {
            distance: { front: 100, left: 100, right: 100 },
            line: [],
            battery: 100,
          },
      led: { r: 0, g: 0, b: 0 },
      lastUpdateTime: Date.now(),
      predictedTrajectory: [],
    };
  }

  /**
   * Apply motor deadband compensation - PWM values below threshold produce no movement
   */
  private applyMotorDeadband(pwm: number): number {
    const absPWM = Math.abs(pwm);
    if (absPWM < this.physics.motorDeadband) {
      return 0;
    }
    // Scale the remaining range
    const sign = Math.sign(pwm);
    const effectivePWM = absPWM - this.physics.motorDeadband;
    const scaleFactor = 255 / (255 - this.physics.motorDeadband);
    return sign * effectivePWM * scaleFactor;
  }

  /**
   * Convert motor PWM to wheel velocities (cm/s)
   */
  private pwmToVelocity(pwm: number): number {
    const compensatedPWM = this.applyMotorDeadband(pwm);
    return (compensatedPWM / 255) * this.physics.maxSpeed;
  }

  /**
   * Apply inertia to velocity change
   */
  private applyInertia(
    current: number,
    target: number,
    inertia: number,
    dt: number
  ): number {
    const diff = target - current;
    const isAccelerating = Math.abs(target) > Math.abs(current);
    const maxChange = isAccelerating
      ? this.physics.maxAcceleration * dt
      : this.physics.maxDeceleration * dt;

    // Apply inertia factor
    const change = diff * (1 - inertia);

    // Clamp to max acceleration/deceleration
    return current + Math.sign(change) * Math.min(Math.abs(change), maxChange);
  }

  /**
   * Update physics state based on motor commands and time delta
   */
  private updatePhysics(state: SimulatedState, dt: number): void {
    // Calculate wheel velocities from motor PWM
    const leftVelocity = this.pwmToVelocity(state.motorPWM.left);
    const rightVelocity = this.pwmToVelocity(state.motorPWM.right);

    // Calculate target linear and angular velocities (differential drive kinematics)
    state.targetVelocity.linear = (leftVelocity + rightVelocity) / 2;
    state.targetVelocity.angular =
      (rightVelocity - leftVelocity) / this.physics.wheelBase; // rad/s

    // Apply inertia to get actual velocities
    state.velocity.linear = this.applyInertia(
      state.velocity.linear,
      state.targetVelocity.linear,
      this.physics.linearInertia,
      dt
    );
    state.velocity.angular = this.applyInertia(
      state.velocity.angular,
      state.targetVelocity.angular,
      this.physics.rotationalInertia,
      dt
    );

    // Update position and rotation
    const avgYaw = state.rotation.yaw + (state.velocity.angular * dt) / 2;
    state.position.x += state.velocity.linear * dt * Math.cos(avgYaw);
    state.position.y += state.velocity.linear * dt * Math.sin(avgYaw);
    state.rotation.yaw += state.velocity.angular * dt;

    // Normalize yaw to [-PI, PI]
    while (state.rotation.yaw > Math.PI) state.rotation.yaw -= 2 * Math.PI;
    while (state.rotation.yaw < -Math.PI) state.rotation.yaw += 2 * Math.PI;

    state.lastUpdateTime = Date.now();
  }

  /**
   * Predict trajectory for collision avoidance
   */
  private predictTrajectory(state: SimulatedState): Array<{ x: number; y: number; yaw: number }> {
    if (!this.physics.trajectoryPrediction) {
      return [];
    }

    const trajectory: Array<{ x: number; y: number; yaw: number }> = [];
    let x = state.position.x;
    let y = state.position.y;
    let yaw = state.rotation.yaw;
    let linearVel = state.velocity.linear;
    let angularVel = state.velocity.angular;

    const dt = this.physics.timeStep / 1000; // Convert to seconds

    for (let i = 0; i < this.physics.predictionHorizon; i++) {
      // Simple prediction assuming constant velocity
      x += linearVel * dt * Math.cos(yaw);
      y += linearVel * dt * Math.sin(yaw);
      yaw += angularVel * dt;

      trajectory.push({ x, y, yaw });
    }

    return trajectory;
  }

  /**
   * Add sensor noise to readings
   */
  private addSensorNoise(value: number): number {
    if (this.physics.sensorNoise === 0) {
      return value;
    }
    // Gaussian noise approximation using Box-Muller
    const u1 = Math.random();
    const u2 = Math.random();
    const noise =
      this.physics.sensorNoise * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return Math.max(0, value + noise);
  }

  /**
   * Check for imminent collision based on trajectory prediction
   */
  private checkTrajectoryCollision(
    state: SimulatedState,
    obstacleDistance: number
  ): { imminent: boolean; framesUntilCollision: number } {
    if (!this.physics.trajectoryPrediction || state.predictedTrajectory.length === 0) {
      return { imminent: false, framesUntilCollision: -1 };
    }

    // Simple check: if moving forward and obstacle is within prediction range
    const distancePerFrame =
      Math.abs(state.velocity.linear) * (this.physics.timeStep / 1000);
    const framesToCollision = obstacleDistance / Math.max(distancePerFrame, 0.1);

    if (
      state.velocity.linear > 0 &&
      framesToCollision <= this.physics.predictionHorizon
    ) {
      return {
        imminent: true,
        framesUntilCollision: Math.ceil(framesToCollision),
      };
    }

    return { imminent: false, framesUntilCollision: -1 };
  }

  /**
   * Simulate a single frame with enhanced physics
   */
  private async simulateFrame(
    frame: RecordedFrame,
    state: SimulatedState,
    skillVariant?: PhysicalSkill,
    originalFailures?: FailureMarker[]
  ): Promise<{ newState: SimulatedState; failures: FailureMarker[] }> {
    const failures: FailureMarker[] = [];
    const newState: SimulatedState = {
      ...state,
      sensors: { ...state.sensors },
      position: { ...state.position },
      rotation: { ...state.rotation },
      velocity: { ...state.velocity },
      targetVelocity: { ...state.targetVelocity },
      motorPWM: { ...state.motorPWM },
      predictedTrajectory: [],
    };

    // Process tool calls - update motor PWM values
    for (const toolCall of frame.toolCalls) {
      this.applyToolCall(newState, toolCall);
    }

    // Calculate time delta in seconds
    const dt = this.physics.timeStep / 1000;

    // Run physics simulation
    this.updatePhysics(newState, dt);

    // Predict trajectory
    newState.predictedTrajectory = this.predictTrajectory(newState);

    // Update sensors from telemetry (with noise if configured)
    if (frame.telemetry.sensors) {
      if (frame.telemetry.sensors.distance) {
        newState.sensors.distance = {
          front: this.addSensorNoise(
            frame.telemetry.sensors.distance[0] || newState.sensors.distance.front
          ),
          left: this.addSensorNoise(
            frame.telemetry.sensors.distance[1] || newState.sensors.distance.left
          ),
          right: this.addSensorNoise(
            frame.telemetry.sensors.distance[2] || newState.sensors.distance.right
          ),
        };
      }
      if (frame.telemetry.sensors.line) {
        newState.sensors.line = frame.telemetry.sensors.line;
      }
      if (frame.telemetry.sensors.battery !== undefined) {
        newState.sensors.battery = frame.telemetry.sensors.battery;
      }
    }

    // === FAILURE DETECTION ===

    // 1. Check for collision (distance too low)
    if (newState.sensors.distance.front < 5) {
      failures.push({
        timestamp: frame.timestamp,
        frameIndex: 0, // Will be set by caller
        type: 'collision',
        description: `Front collision detected (${newState.sensors.distance.front.toFixed(1)}cm)`,
        severity: 'critical',
      });
    }

    // 2. Check for imminent collision via trajectory prediction
    const collisionCheck = this.checkTrajectoryCollision(
      newState,
      newState.sensors.distance.front
    );
    if (collisionCheck.imminent && newState.velocity.linear > 5) {
      failures.push({
        timestamp: frame.timestamp,
        frameIndex: 0,
        type: 'imminent_collision',
        description: `Collision predicted in ${collisionCheck.framesUntilCollision} frames at current velocity`,
        severity: 'moderate',
      });
    }

    // 3. Check for dangerous lateral obstacles while turning
    const isTurning = Math.abs(newState.velocity.angular) > 0.1;
    if (isTurning) {
      const turningRight = newState.velocity.angular > 0;
      const relevantDistance = turningRight
        ? newState.sensors.distance.right
        : newState.sensors.distance.left;

      if (relevantDistance < 10) {
        failures.push({
          timestamp: frame.timestamp,
          frameIndex: 0,
          type: 'lateral_collision_risk',
          description: `Turning ${turningRight ? 'right' : 'left'} with obstacle at ${relevantDistance.toFixed(1)}cm`,
          severity: 'moderate',
        });
      }
    }

    // 4. Check for motor command with no movement (motor stall or deadband issue)
    const motorActive =
      Math.abs(newState.motorPWM.left) > 0 || Math.abs(newState.motorPWM.right) > 0;
    const isMoving = Math.abs(newState.velocity.linear) > 0.5;

    if (motorActive && !isMoving) {
      const belowDeadband =
        Math.abs(newState.motorPWM.left) < this.physics.motorDeadband &&
        Math.abs(newState.motorPWM.right) < this.physics.motorDeadband;

      if (belowDeadband) {
        failures.push({
          timestamp: frame.timestamp,
          frameIndex: 0,
          type: 'motor_deadband',
          description: `Motor PWM (${newState.motorPWM.left}, ${newState.motorPWM.right}) below deadband threshold (${this.physics.motorDeadband})`,
          severity: 'warning',
        });
      }
    }

    // 5. Check for low confidence
    if (frame.confidence !== undefined && frame.confidence < 0.3) {
      failures.push({
        timestamp: frame.timestamp,
        frameIndex: 0,
        type: 'low_confidence',
        description: `Confidence below threshold: ${(frame.confidence * 100).toFixed(1)}%`,
        severity: 'moderate',
      });
    }

    // 6. Check for safety stop
    if (frame.toolCalls.some((tc) => tc.name === 'hal_emergency_stop')) {
      failures.push({
        timestamp: frame.timestamp,
        frameIndex: 0,
        type: 'safety_stop',
        description: 'Emergency stop triggered',
        severity: 'critical',
      });
    }

    // 7. Check for excessive speed near obstacles
    const nearObstacle =
      newState.sensors.distance.front < 20 ||
      newState.sensors.distance.left < 15 ||
      newState.sensors.distance.right < 15;

    if (nearObstacle && Math.abs(newState.velocity.linear) > 25) {
      failures.push({
        timestamp: frame.timestamp,
        frameIndex: 0,
        type: 'excessive_speed',
        description: `High speed (${Math.abs(newState.velocity.linear).toFixed(1)}cm/s) near obstacle`,
        severity: 'warning',
      });
    }

    // Update position from telemetry if available (override simulation for replay accuracy)
    if (frame.telemetry.pose) {
      newState.position = {
        x: frame.telemetry.pose.x,
        y: frame.telemetry.pose.y,
        z: frame.telemetry.pose.z || 0,
      };
      newState.rotation.yaw = frame.telemetry.pose.yaw;
    }

    return { newState, failures };
  }

  /**
   * Apply a tool call to simulated state
   * Motor commands update the motorPWM values; physics simulation handles actual movement
   */
  private applyToolCall(state: SimulatedState, toolCall: HALToolCall): void {
    switch (toolCall.name) {
      case 'hal_drive': {
        // Store motor PWM values - physics simulation will calculate actual velocity
        state.motorPWM.left = (toolCall.args.left as number) || 0;
        state.motorPWM.right = (toolCall.args.right as number) || 0;
        break;
      }

      case 'hal_stop':
      case 'hal_emergency_stop':
        // Immediate stop - set motors to 0
        state.motorPWM.left = 0;
        state.motorPWM.right = 0;
        // For emergency stop, also zero velocity immediately
        if (toolCall.name === 'hal_emergency_stop') {
          state.velocity.linear = 0;
          state.velocity.angular = 0;
          state.targetVelocity.linear = 0;
          state.targetVelocity.angular = 0;
        }
        break;

      case 'hal_set_led': {
        state.led = {
          r: (toolCall.args.r as number) || 0,
          g: (toolCall.args.g as number) || 0,
          b: (toolCall.args.b as number) || 0,
        };
        break;
      }

      case 'hal_rotate': {
        // Rotation commands - set differential motor speeds
        const direction = toolCall.args.direction as string;
        const speed = (toolCall.args.speed as number) || 50;
        if (direction === 'left' || direction === 'counterclockwise') {
          state.motorPWM.left = -speed;
          state.motorPWM.right = speed;
        } else {
          state.motorPWM.left = speed;
          state.motorPWM.right = -speed;
        }
        break;
      }

      case 'hal_move': {
        // Simple forward/backward movement
        const speed = (toolCall.args.speed as number) || 50;
        const direction = toolCall.args.direction as string;
        const pwm = direction === 'backward' ? -speed : speed;
        state.motorPWM.left = pwm;
        state.motorPWM.right = pwm;
        break;
      }
    }
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Singleton instance
let replayerInstance: SimulationReplayer | null = null;

/**
 * Get the simulation replayer instance
 */
export function getSimulationReplayer(): SimulationReplayer {
  if (!replayerInstance) {
    replayerInstance = new SimulationReplayer();
  }
  return replayerInstance;
}
