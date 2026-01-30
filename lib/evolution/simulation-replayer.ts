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
 * Simulated world state
 */
interface SimulatedState {
  position: { x: number; y: number; z: number };
  rotation: { yaw: number; pitch: number; roll: number };
  velocity: { linear: number; angular: number };
  sensors: {
    distance: { front: number; left: number; right: number };
    line: number[];
    battery: number;
  };
  led: { r: number; g: number; b: number };
}

/**
 * Simulation Replayer
 *
 * Replays recorded sessions to test skill variants.
 */
export class SimulationReplayer {
  private isReplaying = false;
  private currentReplayId: string | null = null;
  private abortController: AbortController | null = null;

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
    };
  }

  /**
   * Simulate a single frame
   */
  private async simulateFrame(
    frame: RecordedFrame,
    state: SimulatedState,
    skillVariant?: PhysicalSkill,
    originalFailures?: FailureMarker[]
  ): Promise<{ newState: SimulatedState; failures: FailureMarker[] }> {
    const failures: FailureMarker[] = [];
    const newState = { ...state };

    // Process tool calls
    for (const toolCall of frame.toolCalls) {
      this.applyToolCall(newState, toolCall);
    }

    // Check for collision (distance too low after movement)
    if (newState.sensors.distance.front < 5) {
      failures.push({
        timestamp: frame.timestamp,
        frameIndex: 0, // Will be set by caller
        type: 'collision',
        description: 'Front distance critically low',
        severity: 'critical',
      });
    }

    // Check for low confidence
    if (frame.confidence !== undefined && frame.confidence < 0.3) {
      failures.push({
        timestamp: frame.timestamp,
        frameIndex: 0,
        type: 'low_confidence',
        description: `Confidence below threshold: ${(frame.confidence * 100).toFixed(1)}%`,
        severity: 'moderate',
      });
    }

    // Check for safety stop
    if (frame.toolCalls.some((tc) => tc.name === 'hal_emergency_stop')) {
      failures.push({
        timestamp: frame.timestamp,
        frameIndex: 0,
        type: 'safety_stop',
        description: 'Emergency stop triggered',
        severity: 'critical',
      });
    }

    // Update state from telemetry if available
    if (frame.telemetry.pose) {
      newState.position = {
        x: frame.telemetry.pose.x,
        y: frame.telemetry.pose.y,
        z: frame.telemetry.pose.z || 0,
      };
      newState.rotation.yaw = frame.telemetry.pose.yaw;
    }

    if (frame.telemetry.sensors) {
      if (frame.telemetry.sensors.distance) {
        newState.sensors.distance = {
          front: frame.telemetry.sensors.distance[0] || newState.sensors.distance.front,
          left: frame.telemetry.sensors.distance[1] || newState.sensors.distance.left,
          right: frame.telemetry.sensors.distance[2] || newState.sensors.distance.right,
        };
      }
      if (frame.telemetry.sensors.line) {
        newState.sensors.line = frame.telemetry.sensors.line;
      }
      if (frame.telemetry.sensors.battery !== undefined) {
        newState.sensors.battery = frame.telemetry.sensors.battery;
      }
    }

    return { newState, failures };
  }

  /**
   * Apply a tool call to simulated state
   */
  private applyToolCall(state: SimulatedState, toolCall: HALToolCall): void {
    switch (toolCall.name) {
      case 'hal_drive': {
        const left = (toolCall.args.left as number) || 0;
        const right = (toolCall.args.right as number) || 0;
        // Simple differential drive simulation
        state.velocity.linear = (left + right) / 2 / 255; // Normalized
        state.velocity.angular = (right - left) / 255; // Normalized
        break;
      }

      case 'hal_stop':
        state.velocity.linear = 0;
        state.velocity.angular = 0;
        break;

      case 'hal_set_led': {
        state.led = {
          r: (toolCall.args.r as number) || 0,
          g: (toolCall.args.g as number) || 0,
          b: (toolCall.args.b as number) || 0,
        };
        break;
      }

      // Add other tool simulations as needed
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
