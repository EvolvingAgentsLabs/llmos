/**
 * HAL Tool Executor
 *
 * Unified tool executor that routes HAL commands to the appropriate
 * implementation (simulation or physical hardware) based on the current mode.
 *
 * This implements the core "Inversion of Control" pattern where:
 * - The LLM emits tool calls (hal_drive, hal_grasp, etc.)
 * - This executor routes them to the correct hardware implementation
 * - Same skill file works in both simulation and real hardware
 */

import { logger } from '@/lib/debug/logger';
import {
  HALMode,
  HALToolResult,
  HALToolCall,
  HardwareAbstractionLayer,
} from './types';

/**
 * Tool execution statistics
 */
interface ToolExecutionStats {
  totalCalls: number;
  successfulCalls: number;
  failedCalls: number;
  averageExecutionTime: number;
  callsByTool: Record<string, number>;
}

/**
 * HAL Tool Executor
 *
 * Routes tool calls from the LLM to the appropriate hardware implementation.
 */
export class HALToolExecutor {
  private hal: HardwareAbstractionLayer | null = null;
  private stats: ToolExecutionStats = {
    totalCalls: 0,
    successfulCalls: 0,
    failedCalls: 0,
    averageExecutionTime: 0,
    callsByTool: {},
  };
  private emergencyStopRequested = false;

  constructor(hal?: HardwareAbstractionLayer) {
    if (hal) {
      this.hal = hal;
    }
  }

  /**
   * Set the HAL implementation to use
   */
  setHAL(hal: HardwareAbstractionLayer): void {
    this.hal = hal;
    logger.info('hal', 'HAL implementation set', {
      mode: hal.mode,
      deviceId: hal.getDeviceInfo().id,
    });
  }

  /**
   * Get current mode
   */
  getMode(): HALMode | null {
    return this.hal?.mode ?? null;
  }

  /**
   * Check if executor is ready
   */
  isReady(): boolean {
    return this.hal !== null && this.hal.isReady();
  }

  /**
   * Execute a single HAL tool call
   */
  async executeToolCall(toolCall: HALToolCall): Promise<HALToolResult> {
    if (!this.hal) {
      return {
        success: false,
        error: 'HAL not initialized',
        timestamp: Date.now(),
        mode: 'simulation',
      };
    }

    if (this.emergencyStopRequested) {
      return {
        success: false,
        error: 'Emergency stop active - cannot execute tools',
        timestamp: Date.now(),
        mode: this.hal.mode,
      };
    }

    const startTime = Date.now();
    this.stats.totalCalls++;
    this.stats.callsByTool[toolCall.name] = (this.stats.callsByTool[toolCall.name] || 0) + 1;

    logger.debug('hal', `Executing tool: ${toolCall.name}`, {
      args: toolCall.args,
      mode: this.hal.mode,
    });

    try {
      const result = await this.routeToolCall(toolCall);

      const executionTime = Date.now() - startTime;
      result.executionTime = executionTime;

      if (result.success) {
        this.stats.successfulCalls++;
      } else {
        this.stats.failedCalls++;
      }

      // Update average execution time
      this.stats.averageExecutionTime =
        (this.stats.averageExecutionTime * (this.stats.totalCalls - 1) + executionTime) /
        this.stats.totalCalls;

      return result;
    } catch (error) {
      this.stats.failedCalls++;
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error('hal', `Tool execution failed: ${toolCall.name}`, {
        error: errorMessage,
        args: toolCall.args,
      });

      return {
        success: false,
        error: errorMessage,
        timestamp: Date.now(),
        mode: this.hal.mode,
        executionTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Execute multiple tool calls in sequence
   */
  async executeToolCalls(toolCalls: HALToolCall[]): Promise<HALToolResult[]> {
    const results: HALToolResult[] = [];

    for (const toolCall of toolCalls) {
      const result = await this.executeToolCall(toolCall);
      results.push(result);

      // Stop execution if emergency stop was triggered
      if (this.emergencyStopRequested) {
        logger.warn('hal', 'Stopping tool execution due to emergency stop');
        break;
      }

      // Stop execution if a critical tool failed
      if (!result.success && this.isCriticalTool(toolCall.name)) {
        logger.warn('hal', 'Stopping tool execution due to critical failure', {
          tool: toolCall.name,
          error: result.error,
        });
        break;
      }
    }

    return results;
  }

  /**
   * Route tool call to appropriate HAL subsystem
   */
  private async routeToolCall(toolCall: HALToolCall): Promise<HALToolResult> {
    const { name, args } = toolCall;

    switch (name) {
      // Locomotion tools
      case 'hal_drive':
        return this.hal!.locomotion.drive(
          args.left as number,
          args.right as number,
          args.duration_ms as number | undefined
        );

      case 'hal_move_to':
        return this.hal!.locomotion.moveTo(
          args.x as number,
          args.y as number,
          args.z as number,
          args.speed as number | undefined
        );

      case 'hal_rotate':
        return this.hal!.locomotion.rotate(
          args.direction as 'left' | 'right',
          args.degrees as number
        );

      case 'hal_move_forward':
        return this.hal!.locomotion.moveForward(
          args.distance_cm as number
        );

      case 'hal_move_backward':
        return this.hal!.locomotion.moveBackward(
          args.distance_cm as number
        );

      case 'hal_stop':
        return this.hal!.locomotion.stop();

      // Vision tools
      case 'hal_vision_scan':
        const scanResult = await this.hal!.vision.scan(
          args.mode as 'full' | 'targeted' | 'quick' | undefined
        );
        return {
          success: true,
          data: scanResult,
          timestamp: Date.now(),
          mode: this.hal!.mode,
        };

      case 'hal_capture_frame':
        const frame = await this.hal!.vision.captureFrame();
        return {
          success: true,
          data: { frame },
          timestamp: Date.now(),
          mode: this.hal!.mode,
        };

      case 'hal_get_distance':
        const distance = await this.hal!.vision.getDistanceSensors();
        return {
          success: true,
          data: distance,
          timestamp: Date.now(),
          mode: this.hal!.mode,
        };

      // Manipulation tools (if available)
      case 'hal_arm_move_to':
        if (!this.hal!.manipulation) {
          return {
            success: false,
            error: 'Manipulation not available on this device',
            timestamp: Date.now(),
            mode: this.hal!.mode,
          };
        }
        return this.hal!.manipulation.moveTo(
          args.x as number,
          args.y as number,
          args.z as number,
          args.speed as number | undefined
        );

      case 'hal_grasp':
        if (!this.hal!.manipulation) {
          return {
            success: false,
            error: 'Manipulation not available on this device',
            timestamp: Date.now(),
            mode: this.hal!.mode,
          };
        }
        return this.hal!.manipulation.grasp(
          args.force as number,
          args.mode as 'open' | 'close' | 'hold' | undefined
        );

      // Communication tools
      case 'hal_speak':
        return this.hal!.communication.speak(
          args.text as string,
          args.urgency as 'info' | 'warning' | 'alert' | undefined
        );

      case 'hal_set_led':
        return this.hal!.communication.setLED(
          args.r as number,
          args.g as number,
          args.b as number,
          args.pattern as 'solid' | 'blink' | 'pulse' | undefined
        );

      // Safety tools
      case 'hal_emergency_stop':
        this.emergencyStopRequested = true;
        return this.hal!.safety.emergencyStop(args.reason as string | undefined);

      case 'hal_reset_emergency':
        this.emergencyStopRequested = false;
        return this.hal!.safety.resetEmergencyStop();

      default:
        return {
          success: false,
          error: `Unknown HAL tool: ${name}`,
          timestamp: Date.now(),
          mode: this.hal!.mode,
        };
    }
  }

  /**
   * Check if a tool is critical (failure should stop execution)
   */
  private isCriticalTool(toolName: string): boolean {
    const criticalTools = ['hal_emergency_stop', 'hal_grasp'];
    return criticalTools.includes(toolName);
  }

  /**
   * Get execution statistics
   */
  getStats(): ToolExecutionStats {
    return { ...this.stats };
  }

  /**
   * Reset execution statistics
   */
  resetStats(): void {
    this.stats = {
      totalCalls: 0,
      successfulCalls: 0,
      failedCalls: 0,
      averageExecutionTime: 0,
      callsByTool: {},
    };
  }

  /**
   * Request emergency stop
   */
  requestEmergencyStop(reason?: string): Promise<HALToolResult> {
    this.emergencyStopRequested = true;
    if (this.hal) {
      return this.hal.safety.emergencyStop(reason);
    }
    return Promise.resolve({
      success: true,
      timestamp: Date.now(),
      mode: 'simulation' as HALMode,
    });
  }

  /**
   * Check if emergency stop is active
   */
  isEmergencyStopped(): boolean {
    return this.emergencyStopRequested || (this.hal?.safety.isEmergencyStopped() ?? false);
  }
}

/**
 * Singleton executor instance for global access
 */
let globalExecutor: HALToolExecutor | null = null;

/**
 * Get or create the global HAL tool executor
 */
export function getHALToolExecutor(): HALToolExecutor {
  if (!globalExecutor) {
    globalExecutor = new HALToolExecutor();
  }
  return globalExecutor;
}

/**
 * Set the global HAL implementation
 */
export function setGlobalHAL(hal: HardwareAbstractionLayer): void {
  getHALToolExecutor().setHAL(hal);
}
