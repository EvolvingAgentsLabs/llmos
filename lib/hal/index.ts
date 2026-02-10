/**
 * Hardware Abstraction Layer (HAL)
 *
 * Unified interface for robot hardware control that works identically
 * in simulation (Three.js) and physical (ESP32) environments.
 *
 * This is the core of the "Inversion of Control" architecture:
 * - Same skill file works in simulation and on real hardware
 * - LLM emits abstract tool calls (hal_drive, hal_grasp, etc.)
 * - HAL routes to appropriate implementation
 *
 * Usage:
 *
 * ```typescript
 * import { createHAL, getHALToolExecutor } from '@/lib/hal';
 *
 * // For simulation
 * const hal = createHAL({
 *   mode: 'simulation',
 *   deviceId: 'sim-robot-1',
 *   simulator: cubeRobotSimulator,
 * });
 *
 * // For physical hardware
 * const hal = createHAL({
 *   mode: 'physical',
 *   deviceId: 'esp32-robot-1',
 *   connection: { type: 'serial', baudRate: 115200 },
 * });
 *
 * // Set as global HAL
 * setGlobalHAL(hal);
 *
 * // Execute tool calls from LLM
 * const executor = getHALToolExecutor();
 * const results = await executor.executeToolCalls([
 *   { name: 'hal_drive', args: { left: 100, right: 100 } },
 *   { name: 'hal_set_led', args: { r: 0, g: 255, b: 0 } },
 * ]);
 * ```
 */

// Export types
export type {
  HALMode,
  HALToolResult,
  HALToolCall,
  HALConfig,
  HardwareAbstractionLayer,
  LocomotionInterface,
  VisionInterface,
  ManipulationInterface,
  CommunicationInterface,
  SafetyInterface,
  DeviceTelemetry,
} from './types';

// Export tool executor
export {
  HALToolExecutor,
  getHALToolExecutor,
  setGlobalHAL,
} from './hal-tool-executor';

// Export command validator
export {
  HALCommandValidator,
  getCommandValidator,
  createCommandValidator,
  DEFAULT_VALIDATION_CONFIG,
} from './command-validator';
export type {
  ValidationResult,
  ValidationIssue,
  ValidationConfig,
  ValidationSeverity,
} from './command-validator';

// Export HAL tool loader (markdown-based definitions)
export {
  HALToolRegistry,
  getHALToolRegistry,
  createHALToolRegistry,
  parseHALToolMarkdown,
  toFunctionDefinition,
  toOpenAIFormat,
  initializeHALTools,
  BUNDLED_HAL_TOOLS,
} from './hal-tool-loader';
export type { HALToolDefinition } from './hal-tool-loader';

// Export adapters
export { SimulationHAL, createSimulationHAL } from './simulation-adapter';
export type { SimulatorReference } from './simulation-adapter';

export {
  PhysicalHAL,
  createPhysicalHAL,
} from './physical-adapter';

import { logger } from '@/lib/debug/logger';
import { HALConfig, HardwareAbstractionLayer } from './types';
import { SimulationHAL, SimulatorReference } from './simulation-adapter';
import { PhysicalHAL } from './physical-adapter';
import { getHALToolRegistry } from './hal-tool-loader';

/**
 * Create a HAL instance based on configuration
 *
 * @param config - HAL configuration
 * @returns Configured HAL instance
 */
export function createHAL(config: HALConfig): HardwareAbstractionLayer {
  logger.info('hal', `Creating HAL in ${config.mode} mode`, {
    deviceId: config.deviceId,
    capabilities: config.capabilities,
  });

  switch (config.mode) {
    case 'simulation':
      if (!config.simulator) {
        throw new Error('Simulator reference required for simulation mode');
      }
      return new SimulationHAL(config.simulator as SimulatorReference, {
        deviceId: config.deviceId,
      });

    case 'physical':
      if (!config.connection) {
        throw new Error('Connection config required for physical mode');
      }
      return new PhysicalHAL({
        deviceId: config.deviceId,
        connectionType: config.connection.type,
        port: config.connection.port,
        baudRate: config.connection.baudRate,
        host: config.connection.host,
      });

    case 'hybrid':
      // Hybrid mode: simulation with physical feedback
      // For now, default to simulation
      logger.warn('hal', 'Hybrid mode not fully implemented, using simulation');
      if (!config.simulator) {
        throw new Error('Simulator reference required for hybrid mode');
      }
      return new SimulationHAL(config.simulator as SimulatorReference, {
        deviceId: config.deviceId,
      });

    default:
      throw new Error(`Unknown HAL mode: ${config.mode}`);
  }
}

/**
 * HAL tool definitions for LLM function calling
 *
 * These are the standardized tool definitions that can be passed to
 * any LLM that supports function calling (Gemini, Claude, OpenAI).
 */
export const HAL_TOOL_DEFINITIONS = [
  {
    name: 'hal_drive',
    description: 'Control wheel motors for differential drive locomotion',
    parameters: {
      type: 'object',
      properties: {
        left: {
          type: 'number',
          description: 'Left wheel power (-255 to 255)',
        },
        right: {
          type: 'number',
          description: 'Right wheel power (-255 to 255)',
        },
        duration_ms: {
          type: 'number',
          description: 'Optional duration in milliseconds before auto-stop',
        },
      },
      required: ['left', 'right'],
    },
  },
  {
    name: 'hal_rotate',
    description: 'Rotate the robot in place by the specified degrees. The robot spins without moving forward or backward.',
    parameters: {
      type: 'object',
      properties: {
        direction: {
          type: 'string',
          enum: ['left', 'right'],
          description: 'Rotation direction: left (counter-clockwise) or right (clockwise)',
        },
        degrees: {
          type: 'number',
          description: 'Degrees to rotate (1-360)',
        },
      },
      required: ['direction', 'degrees'],
    },
  },
  {
    name: 'hal_move_forward',
    description: 'Move the robot forward by the specified distance in centimeters. Stops automatically if an obstacle is detected.',
    parameters: {
      type: 'object',
      properties: {
        distance_cm: {
          type: 'number',
          description: 'Distance to move forward in centimeters (1-200)',
        },
      },
      required: ['distance_cm'],
    },
  },
  {
    name: 'hal_move_backward',
    description: 'Move the robot backward by the specified distance in centimeters. Stops automatically if an obstacle is detected.',
    parameters: {
      type: 'object',
      properties: {
        distance_cm: {
          type: 'number',
          description: 'Distance to move backward in centimeters (1-200)',
        },
      },
      required: ['distance_cm'],
    },
  },
  {
    name: 'hal_stop',
    description: 'Stop all locomotion immediately',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'hal_move_to',
    description: 'Move to a 3D position (for mobile platforms or arms)',
    parameters: {
      type: 'object',
      properties: {
        x: { type: 'number', description: 'X coordinate in meters' },
        y: { type: 'number', description: 'Y coordinate in meters' },
        z: { type: 'number', description: 'Z coordinate in meters' },
        speed: { type: 'number', description: 'Movement speed (0-100%)' },
      },
      required: ['x', 'y', 'z'],
    },
  },
  {
    name: 'hal_vision_scan',
    description: 'Scan environment and return detected objects',
    parameters: {
      type: 'object',
      properties: {
        mode: {
          type: 'string',
          enum: ['full', 'targeted', 'quick'],
          description: 'Scan mode: full (thorough), targeted (specific area), quick (fast overview)',
        },
      },
    },
  },
  {
    name: 'hal_capture_frame',
    description: 'Capture current camera frame as base64 image',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'hal_get_distance',
    description: 'Get distance sensor readings',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'hal_grasp',
    description: 'Control gripper/end effector (for manipulation-capable robots)',
    parameters: {
      type: 'object',
      properties: {
        force: {
          type: 'number',
          description: 'Grip force percentage (0-100)',
        },
        mode: {
          type: 'string',
          enum: ['open', 'close', 'hold'],
          description: 'Grip mode',
        },
      },
      required: ['force'],
    },
  },
  {
    name: 'hal_arm_move_to',
    description: 'Move robot arm to position (for manipulation-capable robots)',
    parameters: {
      type: 'object',
      properties: {
        x: { type: 'number', description: 'X coordinate in meters' },
        y: { type: 'number', description: 'Y coordinate in meters' },
        z: { type: 'number', description: 'Z coordinate in meters' },
        speed: { type: 'number', description: 'Movement speed (0-100%)' },
      },
      required: ['x', 'y', 'z'],
    },
  },
  {
    name: 'hal_speak',
    description: 'Output audio message through robot speaker',
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Message to speak' },
        urgency: {
          type: 'string',
          enum: ['info', 'warning', 'alert'],
          description: 'Urgency level affects tone/speed',
        },
      },
      required: ['text'],
    },
  },
  {
    name: 'hal_set_led',
    description: 'Control robot LED indicators',
    parameters: {
      type: 'object',
      properties: {
        r: { type: 'number', description: 'Red value (0-255)' },
        g: { type: 'number', description: 'Green value (0-255)' },
        b: { type: 'number', description: 'Blue value (0-255)' },
        pattern: {
          type: 'string',
          enum: ['solid', 'blink', 'pulse'],
          description: 'LED pattern',
        },
      },
      required: ['r', 'g', 'b'],
    },
  },
  {
    name: 'hal_emergency_stop',
    description: 'Immediately stop all robot motion (safety)',
    parameters: {
      type: 'object',
      properties: {
        reason: { type: 'string', description: 'Reason for emergency stop' },
      },
    },
  },
  {
    name: 'hal_reset_emergency',
    description: 'Reset from emergency stop state',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
];

/**
 * Get HAL tool definitions formatted for OpenAI-style function calling
 *
 * If markdown-based tools have been loaded into the registry, uses those.
 * Otherwise falls back to the hardcoded definitions.
 */
export function getOpenAIToolDefinitions() {
  const registry = getHALToolRegistry();
  const registryTools = registry.getAll();

  // Use registry if tools have been loaded
  if (registryTools.length > 0) {
    return registry.getOpenAIDefinitions();
  }

  // Fallback to hardcoded definitions
  return HAL_TOOL_DEFINITIONS.map((tool) => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}

/**
 * Get HAL tool definitions formatted for Gemini function calling
 *
 * If markdown-based tools have been loaded into the registry, uses those.
 * Otherwise falls back to the hardcoded definitions.
 */
export function getGeminiToolDefinitions() {
  const registry = getHALToolRegistry();
  const registryTools = registry.getAll();

  // Use registry if tools have been loaded
  if (registryTools.length > 0) {
    return registry.getGeminiDefinitions();
  }

  // Fallback to hardcoded definitions
  return {
    functionDeclarations: HAL_TOOL_DEFINITIONS.map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    })),
  };
}

/**
 * Get rich HAL tool definitions with full metadata
 *
 * Only available when markdown-based tools have been loaded.
 * Returns full tool definitions including examples, safety info, etc.
 */
export function getHALToolsWithMetadata(): import('./hal-tool-loader').HALToolDefinition[] {
  const registry = getHALToolRegistry();
  return registry.getAll();
}
