/**
 * Navigation HAL Bridge
 *
 * Connects the NavigationLoop to the Hardware Abstraction Layer
 * for real robot execution. Translates navigation decisions into
 * HAL commands and feeds sensor data back to the world model.
 *
 * Pipeline:
 *   NavigationLoop.runCycle()
 *     → CycleResult (decision + path)
 *     → NavigationHALBridge.execute()
 *       → HAL locomotion commands
 *       → HAL vision capture → VisionWorldModelBridge
 *       → Report result back to NavigationLoop
 *
 * This bridge works with both simulation and physical HAL adapters.
 */

import type { HardwareAbstractionLayer } from '../hal/types';
import { NavigationLoop, type CycleResult, type InferenceFunction } from './navigation-loop';
import type { IWorldModelBridge } from './world-model-bridge';

// =============================================================================
// Types
// =============================================================================

export interface NavigationHALConfig {
  /** Movement speed in m/s (default: 0.15) */
  moveSpeedMs: number;
  /** Rotation speed in deg/s (default: 45) */
  rotateSpeedDegS: number;
  /** Distance threshold for waypoint arrival (meters) (default: 0.05) */
  waypointThresholdM: number;
  /** Whether to capture camera frames for the LLM (default: true) */
  captureFrames: boolean;
  /** Frame capture interval in cycles (default: 1 = every cycle) */
  frameCaptureInterval: number;
  /** Max execution time per action (ms) (default: 3000) */
  actionTimeoutMs: number;
}

const DEFAULT_CONFIG: NavigationHALConfig = {
  moveSpeedMs: 0.15,
  rotateSpeedDegS: 45,
  waypointThresholdM: 0.05,
  captureFrames: true,
  frameCaptureInterval: 1,
  actionTimeoutMs: 3000,
};

export interface ExecutionResult {
  /** Whether the action was executed successfully */
  success: boolean;
  /** What action was attempted */
  action: string;
  /** Error message if failed */
  error?: string;
  /** Execution time in ms */
  executionMs: number;
  /** Camera frame captured (if any) */
  cameraFrame?: string;
}

// =============================================================================
// Navigation HAL Bridge
// =============================================================================

export class NavigationHALBridge {
  private config: NavigationHALConfig;
  private hal: HardwareAbstractionLayer;
  private loop: NavigationLoop;
  private cycleCount: number = 0;
  private running: boolean = false;

  constructor(
    hal: HardwareAbstractionLayer,
    bridge: IWorldModelBridge,
    infer: InferenceFunction,
    config: Partial<NavigationHALConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.hal = hal;
    this.loop = new NavigationLoop(bridge, infer, {
      generateMapImages: true,
    });
  }

  /**
   * Get the underlying NavigationLoop for configuration.
   */
  getLoop(): NavigationLoop {
    return this.loop;
  }

  /**
   * Execute a single navigation cycle:
   *   1. Capture camera frame (if enabled)
   *   2. Run navigation loop to get decision
   *   3. Execute decision on HAL
   *   4. Report result back to loop
   */
  async executeCycle(): Promise<{ cycle: CycleResult; execution: ExecutionResult }> {
    const start = performance.now();
    this.cycleCount++;

    // 1. Capture camera frame
    let cameraFrame: string | undefined;
    if (this.config.captureFrames && this.cycleCount % this.config.frameCaptureInterval === 0) {
      try {
        const frame = await this.hal.vision.captureFrame();
        if (frame) {
          cameraFrame = typeof frame === 'string' ? frame : String(frame);
        }
      } catch {
        // Vision capture is optional
      }
    }

    // 2. Run navigation cycle
    const cycle = await this.loop.runCycle(cameraFrame);

    // 3. Execute the decision on HAL
    const execution = await this.executeDecision(cycle);

    // 4. Report result back to loop
    this.loop.reportActionResult(
      execution.success ? 'success' : 'blocked',
      execution.error ?? 'ok'
    );

    return { cycle, execution };
  }

  /**
   * Run continuous navigation until goal reached or stopped.
   */
  async run(
    onCycle?: (cycle: CycleResult, execution: ExecutionResult) => void
  ): Promise<{ cycles: number; goalReached: boolean }> {
    this.running = true;
    let goalReached = false;
    let cycles = 0;

    while (this.running) {
      const { cycle, execution } = await this.executeCycle();
      cycles++;

      if (onCycle) onCycle(cycle, execution);

      if (cycle.goalReached) {
        goalReached = true;
        break;
      }

      if (cycle.decision.action.type === 'STOP' && cycle.mode !== 'exploring') {
        break;
      }
    }

    return { cycles, goalReached };
  }

  /**
   * Stop the continuous run loop.
   */
  stop(): void {
    this.running = false;
  }

  // ---------------------------------------------------------------------------
  // Decision Execution
  // ---------------------------------------------------------------------------

  private async executeDecision(cycle: CycleResult): Promise<ExecutionResult> {
    const start = performance.now();
    const { decision, path } = cycle;

    try {
      switch (decision.action.type) {
        case 'MOVE_TO':
        case 'EXPLORE': {
          if (path?.success && path.waypoints.length > 0) {
            // Follow the next waypoint
            const nextWaypoint = path.waypoints[Math.min(1, path.waypoints.length - 1)];
            await this.hal.locomotion.moveTo(nextWaypoint.x, nextWaypoint.y, 0);
            return {
              success: true,
              action: `${decision.action.type} → (${nextWaypoint.x.toFixed(2)}, ${nextWaypoint.y.toFixed(2)})`,
              executionMs: performance.now() - start,
            };
          }
          // No path — nudge forward 10cm
          await this.hal.locomotion.moveForward(10);
          return {
            success: true,
            action: `${decision.action.type} (no path, nudge forward)`,
            executionMs: performance.now() - start,
          };
        }

        case 'ROTATE_TO': {
          const yaw = decision.action.yaw_deg ?? 90;
          const direction = yaw >= 0 ? 'right' as const : 'left' as const;
          await this.hal.locomotion.rotate(direction, Math.abs(yaw));
          return {
            success: true,
            action: `ROTATE_TO ${yaw}°`,
            executionMs: performance.now() - start,
          };
        }

        case 'STOP':
        default: {
          await this.hal.locomotion.stop();
          return {
            success: true,
            action: 'STOP',
            executionMs: performance.now() - start,
          };
        }
      }
    } catch (error) {
      return {
        success: false,
        action: decision.action.type,
        error: error instanceof Error ? error.message : 'Unknown error',
        executionMs: performance.now() - start,
      };
    }
  }
}

// =============================================================================
// Factory
// =============================================================================

export function createNavigationHALBridge(
  hal: HardwareAbstractionLayer,
  bridge: IWorldModelBridge,
  infer: InferenceFunction,
  config: Partial<NavigationHALConfig> = {}
): NavigationHALBridge {
  return new NavigationHALBridge(hal, bridge, infer, config);
}
