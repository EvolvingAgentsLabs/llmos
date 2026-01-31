/**
 * HAL Command Validator
 *
 * Validates robot commands before execution to ensure safety and correctness.
 * Acts as a DSL layer between LLM output and hardware execution.
 *
 * Validation Stages:
 * 1. Schema Validation - Check argument types and ranges
 * 2. Context Validation - Check command safety given sensor state
 * 3. Sequence Validation - Detect dangerous command patterns
 *
 * Usage:
 * ```typescript
 * const validator = getCommandValidator();
 *
 * // Validate a command
 * const result = validator.validateCommand(
 *   { name: 'hal_drive', args: { left: 255, right: 255 } },
 *   currentSensors
 * );
 *
 * if (!result.valid) {
 *   console.log('Command rejected:', result.errors);
 *   // Use modified command if available
 *   if (result.modifiedCommand) {
 *     executeCommand(result.modifiedCommand);
 *   }
 * }
 * ```
 */

import { logger } from '@/lib/debug/logger';
import { HALToolCall, DeviceTelemetry } from './types';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES AND INTERFACES
// ═══════════════════════════════════════════════════════════════════════════

export type ValidationSeverity = 'info' | 'warning' | 'error' | 'critical';

export interface ValidationIssue {
  code: string;
  message: string;
  severity: ValidationSeverity;
  field?: string;
  suggestion?: string;
}

export interface ValidationResult {
  valid: boolean;
  command: HALToolCall;
  issues: ValidationIssue[];
  /** Modified command if adjustments were made for safety */
  modifiedCommand?: HALToolCall;
  /** Command was modified */
  wasModified: boolean;
  /** Command was blocked entirely */
  wasBlocked: boolean;
  /** Validation duration in ms */
  validationTime: number;
}

export interface ValidationConfig {
  /** Maximum allowed motor PWM value */
  maxMotorPWM: number;
  /** Minimum safe distance before reducing speed (cm) */
  minSafeDistance: number;
  /** Emergency stop distance threshold (cm) */
  emergencyStopDistance: number;
  /** Maximum allowed speed when near obstacles */
  maxSpeedNearObstacle: number;
  /** Enable automatic speed reduction near obstacles */
  autoReduceSpeed: boolean;
  /** Block commands that would cause collision */
  blockDangerousCommands: boolean;
  /** Maximum duration for timed commands (ms) */
  maxCommandDuration: number;
  /** Require sensor data for movement commands */
  requireSensorContext: boolean;
  /** Enable command sequence analysis */
  enableSequenceValidation: boolean;
  /** Number of commands to track for sequence analysis */
  commandHistorySize: number;
}

/**
 * Default validation configuration
 */
export const DEFAULT_VALIDATION_CONFIG: ValidationConfig = {
  maxMotorPWM: 255,
  minSafeDistance: 20, // cm
  emergencyStopDistance: 8, // cm
  maxSpeedNearObstacle: 80, // PWM
  autoReduceSpeed: true,
  blockDangerousCommands: true,
  maxCommandDuration: 5000, // 5 seconds
  requireSensorContext: false, // Allow commands without sensor data
  enableSequenceValidation: true,
  commandHistorySize: 10,
};

/**
 * Command schema definition
 */
interface CommandSchema {
  name: string;
  args: Record<string, {
    type: 'number' | 'string' | 'boolean';
    required?: boolean;
    min?: number;
    max?: number;
    enum?: (string | number)[];
    default?: unknown;
  }>;
  isMovement?: boolean;
  requiresSensors?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// COMMAND SCHEMAS
// ═══════════════════════════════════════════════════════════════════════════

const COMMAND_SCHEMAS: Record<string, CommandSchema> = {
  hal_drive: {
    name: 'hal_drive',
    args: {
      left: { type: 'number', required: true, min: -255, max: 255 },
      right: { type: 'number', required: true, min: -255, max: 255 },
      duration_ms: { type: 'number', required: false, min: 0, max: 10000 },
    },
    isMovement: true,
    requiresSensors: true,
  },
  hal_stop: {
    name: 'hal_stop',
    args: {},
    isMovement: false,
  },
  hal_emergency_stop: {
    name: 'hal_emergency_stop',
    args: {
      reason: { type: 'string', required: false },
    },
    isMovement: false,
  },
  hal_move_to: {
    name: 'hal_move_to',
    args: {
      x: { type: 'number', required: true },
      y: { type: 'number', required: true },
      z: { type: 'number', required: true },
      speed: { type: 'number', required: false, min: 0, max: 100, default: 50 },
    },
    isMovement: true,
    requiresSensors: true,
  },
  hal_rotate: {
    name: 'hal_rotate',
    args: {
      direction: { type: 'string', required: true, enum: ['left', 'right', 'clockwise', 'counterclockwise'] },
      speed: { type: 'number', required: false, min: 0, max: 255, default: 50 },
      degrees: { type: 'number', required: false, min: 0, max: 360 },
    },
    isMovement: true,
    requiresSensors: true,
  },
  hal_set_led: {
    name: 'hal_set_led',
    args: {
      r: { type: 'number', required: true, min: 0, max: 255 },
      g: { type: 'number', required: true, min: 0, max: 255 },
      b: { type: 'number', required: true, min: 0, max: 255 },
      pattern: { type: 'string', required: false, enum: ['solid', 'blink', 'pulse'], default: 'solid' },
    },
    isMovement: false,
  },
  hal_speak: {
    name: 'hal_speak',
    args: {
      text: { type: 'string', required: true },
      urgency: { type: 'string', required: false, enum: ['info', 'warning', 'alert'], default: 'info' },
    },
    isMovement: false,
  },
  hal_grasp: {
    name: 'hal_grasp',
    args: {
      force: { type: 'number', required: true, min: 0, max: 100 },
      mode: { type: 'string', required: false, enum: ['open', 'close', 'hold'], default: 'close' },
    },
    isMovement: false,
  },
  hal_vision_scan: {
    name: 'hal_vision_scan',
    args: {
      mode: { type: 'string', required: false, enum: ['full', 'targeted', 'quick'], default: 'quick' },
    },
    isMovement: false,
  },
  hal_capture_frame: {
    name: 'hal_capture_frame',
    args: {},
    isMovement: false,
  },
  hal_get_distance: {
    name: 'hal_get_distance',
    args: {},
    isMovement: false,
  },
  hal_reset_emergency: {
    name: 'hal_reset_emergency',
    args: {},
    isMovement: false,
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// COMMAND VALIDATOR CLASS
// ═══════════════════════════════════════════════════════════════════════════

export class HALCommandValidator {
  private config: ValidationConfig;
  private commandHistory: HALToolCall[] = [];

  constructor(config?: Partial<ValidationConfig>) {
    this.config = { ...DEFAULT_VALIDATION_CONFIG, ...config };
  }

  /**
   * Validate a command before execution
   */
  validateCommand(
    command: HALToolCall,
    sensorContext?: Partial<DeviceTelemetry>
  ): ValidationResult {
    const startTime = Date.now();
    const issues: ValidationIssue[] = [];
    let modifiedCommand: HALToolCall | undefined;
    let wasModified = false;
    let wasBlocked = false;

    // 1. Schema validation
    const schemaIssues = this.validateSchema(command);
    issues.push(...schemaIssues);

    // 2. Context validation (if sensors available and command requires it)
    const schema = COMMAND_SCHEMAS[command.name];
    if (schema?.isMovement) {
      if (sensorContext) {
        const { contextIssues, adjusted } = this.validateContext(command, sensorContext);
        issues.push(...contextIssues);
        if (adjusted) {
          modifiedCommand = adjusted;
          wasModified = true;
        }
      } else if (this.config.requireSensorContext) {
        issues.push({
          code: 'CONTEXT_001',
          message: 'Movement command requires sensor context',
          severity: 'error',
        });
      }
    }

    // 3. Sequence validation
    if (this.config.enableSequenceValidation) {
      const sequenceIssues = this.validateSequence(command);
      issues.push(...sequenceIssues);
    }

    // Determine if command should be blocked
    const criticalIssues = issues.filter(i => i.severity === 'critical');
    const errorIssues = issues.filter(i => i.severity === 'error');

    if (criticalIssues.length > 0) {
      wasBlocked = true;
    } else if (errorIssues.length > 0 && this.config.blockDangerousCommands) {
      wasBlocked = true;
    }

    // Add to history
    this.addToHistory(command);

    const result: ValidationResult = {
      valid: !wasBlocked && errorIssues.length === 0,
      command,
      issues,
      modifiedCommand,
      wasModified,
      wasBlocked,
      validationTime: Date.now() - startTime,
    };

    // Log significant issues
    if (wasBlocked) {
      logger.warn('hal', `Command blocked: ${command.name}`, {
        issues: issues.filter(i => i.severity === 'error' || i.severity === 'critical'),
      });
    } else if (wasModified) {
      logger.debug('hal', `Command modified for safety: ${command.name}`, {
        original: command.args,
        modified: modifiedCommand?.args,
      });
    }

    return result;
  }

  /**
   * Validate command schema
   */
  private validateSchema(command: HALToolCall): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const schema = COMMAND_SCHEMAS[command.name];

    if (!schema) {
      // Unknown command - allow but warn
      issues.push({
        code: 'SCHEMA_001',
        message: `Unknown command: ${command.name}`,
        severity: 'warning',
      });
      return issues;
    }

    // Check required arguments
    for (const [argName, argSchema] of Object.entries(schema.args)) {
      const value = command.args[argName];

      // Check required
      if (argSchema.required && value === undefined) {
        issues.push({
          code: 'SCHEMA_002',
          message: `Missing required argument: ${argName}`,
          severity: 'error',
          field: argName,
        });
        continue;
      }

      if (value === undefined) continue;

      // Type check
      if (argSchema.type === 'number' && typeof value !== 'number') {
        issues.push({
          code: 'SCHEMA_003',
          message: `Argument ${argName} must be a number, got ${typeof value}`,
          severity: 'error',
          field: argName,
        });
        continue;
      }

      if (argSchema.type === 'string' && typeof value !== 'string') {
        issues.push({
          code: 'SCHEMA_004',
          message: `Argument ${argName} must be a string, got ${typeof value}`,
          severity: 'error',
          field: argName,
        });
        continue;
      }

      // Range check for numbers
      if (argSchema.type === 'number' && typeof value === 'number') {
        if (argSchema.min !== undefined && value < argSchema.min) {
          issues.push({
            code: 'SCHEMA_005',
            message: `Argument ${argName} (${value}) is below minimum (${argSchema.min})`,
            severity: 'warning',
            field: argName,
            suggestion: `Use ${argSchema.min} instead`,
          });
        }
        if (argSchema.max !== undefined && value > argSchema.max) {
          issues.push({
            code: 'SCHEMA_006',
            message: `Argument ${argName} (${value}) exceeds maximum (${argSchema.max})`,
            severity: 'warning',
            field: argName,
            suggestion: `Use ${argSchema.max} instead`,
          });
        }
      }

      // Enum check
      if (argSchema.enum && !argSchema.enum.includes(value as string | number)) {
        issues.push({
          code: 'SCHEMA_007',
          message: `Argument ${argName} must be one of: ${argSchema.enum.join(', ')}`,
          severity: 'error',
          field: argName,
        });
      }
    }

    return issues;
  }

  /**
   * Validate command in context of sensor data
   */
  private validateContext(
    command: HALToolCall,
    sensors: Partial<DeviceTelemetry>
  ): { contextIssues: ValidationIssue[]; adjusted?: HALToolCall } {
    const issues: ValidationIssue[] = [];
    let adjusted: HALToolCall | undefined;

    // Only validate movement commands
    if (command.name === 'hal_drive') {
      const left = command.args.left as number;
      const right = command.args.right as number;
      const distanceFront = sensors.sensors?.distance?.[0] ?? 100;
      const distanceLeft = sensors.sensors?.distance?.[1] ?? 100;
      const distanceRight = sensors.sensors?.distance?.[2] ?? 100;

      // Check if moving forward toward obstacle
      const isMovingForward = left > 0 && right > 0;
      const isMovingBackward = left < 0 && right < 0;
      const isTurningLeft = left < right;
      const isTurningRight = right < left;

      // Emergency stop distance
      if (isMovingForward && distanceFront < this.config.emergencyStopDistance) {
        issues.push({
          code: 'CONTEXT_010',
          message: `Front obstacle at ${distanceFront}cm - emergency distance reached`,
          severity: 'critical',
          suggestion: 'Stop or reverse',
        });
      }

      // Safe distance - reduce speed
      if (isMovingForward && distanceFront < this.config.minSafeDistance) {
        const speed = Math.max(Math.abs(left), Math.abs(right));

        if (speed > this.config.maxSpeedNearObstacle && this.config.autoReduceSpeed) {
          // Reduce speed proportionally to distance
          const reductionFactor = distanceFront / this.config.minSafeDistance;
          const newSpeed = Math.min(
            this.config.maxSpeedNearObstacle,
            Math.round(speed * reductionFactor)
          );

          adjusted = {
            name: command.name,
            args: {
              ...command.args,
              left: Math.sign(left) * Math.min(Math.abs(left), newSpeed),
              right: Math.sign(right) * Math.min(Math.abs(right), newSpeed),
            },
          };

          issues.push({
            code: 'CONTEXT_011',
            message: `Speed reduced from ${speed} to ${newSpeed} due to obstacle at ${distanceFront}cm`,
            severity: 'warning',
          });
        }
      }

      // Check lateral obstacles when turning
      if (isTurningLeft && distanceLeft < 10) {
        issues.push({
          code: 'CONTEXT_012',
          message: `Turning left with obstacle at ${distanceLeft}cm on left`,
          severity: 'warning',
          suggestion: 'Consider turning right instead',
        });
      }

      if (isTurningRight && distanceRight < 10) {
        issues.push({
          code: 'CONTEXT_013',
          message: `Turning right with obstacle at ${distanceRight}cm on right`,
          severity: 'warning',
          suggestion: 'Consider turning left instead',
        });
      }

      // Check for high speed command
      const maxPWM = Math.max(Math.abs(left), Math.abs(right));
      if (maxPWM > 200) {
        issues.push({
          code: 'CONTEXT_020',
          message: `High speed command (PWM=${maxPWM}) - ensure adequate clearance`,
          severity: 'info',
        });
      }
    }

    // Check duration limits
    if (command.args.duration_ms !== undefined) {
      const duration = command.args.duration_ms as number;
      if (duration > this.config.maxCommandDuration) {
        issues.push({
          code: 'CONTEXT_030',
          message: `Command duration ${duration}ms exceeds maximum ${this.config.maxCommandDuration}ms`,
          severity: 'warning',
          suggestion: `Use ${this.config.maxCommandDuration}ms instead`,
        });
      }
    }

    return { contextIssues: issues, adjusted };
  }

  /**
   * Validate command sequence for dangerous patterns
   */
  private validateSequence(command: HALToolCall): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    if (this.commandHistory.length === 0) return issues;

    const lastCommand = this.commandHistory[this.commandHistory.length - 1];

    // Check for rapid direction changes (oscillation)
    if (command.name === 'hal_drive' && lastCommand.name === 'hal_drive') {
      const prevLeft = lastCommand.args.left as number;
      const prevRight = lastCommand.args.right as number;
      const newLeft = command.args.left as number;
      const newRight = command.args.right as number;

      // Detect oscillation (rapid back-and-forth)
      const leftFlipped = Math.sign(prevLeft) !== Math.sign(newLeft) && Math.abs(prevLeft) > 50;
      const rightFlipped = Math.sign(prevRight) !== Math.sign(newRight) && Math.abs(prevRight) > 50;

      if (leftFlipped && rightFlipped) {
        issues.push({
          code: 'SEQ_001',
          message: 'Rapid direction reversal detected - possible oscillation',
          severity: 'warning',
          suggestion: 'Consider adding a stop command between direction changes',
        });
      }
    }

    // Check for repeated emergency stops
    const recentEmergencyStops = this.commandHistory
      .slice(-5)
      .filter(c => c.name === 'hal_emergency_stop').length;

    if (command.name === 'hal_emergency_stop' && recentEmergencyStops >= 2) {
      issues.push({
        code: 'SEQ_002',
        message: 'Multiple emergency stops in recent history - system may be unstable',
        severity: 'warning',
      });
    }

    return issues;
  }

  /**
   * Add command to history
   */
  private addToHistory(command: HALToolCall): void {
    this.commandHistory.push(command);
    if (this.commandHistory.length > this.config.commandHistorySize) {
      this.commandHistory.shift();
    }
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<ValidationConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): ValidationConfig {
    return { ...this.config };
  }

  /**
   * Clear command history
   */
  clearHistory(): void {
    this.commandHistory = [];
  }

  /**
   * Validate multiple commands in batch
   */
  validateBatch(
    commands: HALToolCall[],
    sensorContext?: Partial<DeviceTelemetry>
  ): ValidationResult[] {
    return commands.map(cmd => this.validateCommand(cmd, sensorContext));
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SINGLETON INSTANCE
// ═══════════════════════════════════════════════════════════════════════════

let validatorInstance: HALCommandValidator | null = null;

export function getCommandValidator(config?: Partial<ValidationConfig>): HALCommandValidator {
  if (!validatorInstance) {
    validatorInstance = new HALCommandValidator(config);
  } else if (config) {
    validatorInstance.updateConfig(config);
  }
  return validatorInstance;
}

export function createCommandValidator(config?: Partial<ValidationConfig>): HALCommandValidator {
  return new HALCommandValidator(config);
}
