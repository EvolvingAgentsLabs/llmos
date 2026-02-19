/**
 * BytecodeInterpreter — Executes LLMBytecode OutputFrames
 *
 * Takes validated OutputFrames from the Runtime LLM and executes their
 * instructions against a BytecodeExecutionTarget (simulation or hardware).
 *
 * Responsibilities:
 * - Validate frames via safety constraints before execution
 * - Execute instructions sequentially with error tracking
 * - Enforce cumulative motor runtime limits
 * - Track execution mode and variable state across ticks
 * - Support dry-run mode for testing without actuation
 * - Handle composite (atomic and non-atomic) instruction groups
 */

import {
  BytecodeInstruction,
  OutputFrame,
  SafetyConstraints,
  DEFAULT_SAFETY_CONSTRAINTS,
  validateInstruction,
  validateOutputFrame,
  ExecutionMode,
} from './llm-bytecode';
import { BytecodeExecutionTarget } from './bytecode-targets';

// =============================================================================
// Types
// =============================================================================

/**
 * Result of executing a single tick (one OutputFrame).
 */
export interface ExecutionTickResult {
  /** Indices of successfully executed instructions */
  executed: number[];
  /** Indices of blocked instructions (failed validation or runtime error) */
  blocked: number[];
  /** Error messages from blocked or failed instructions */
  errors: string[];
  /** State changes applied during this tick */
  stateChanges: {
    mode?: ExecutionMode;
    goal?: string;
    variables?: Record<string, string | number | boolean>;
  };
  /** Cumulative motor runtime in ms this session */
  motorRuntime: number;
  /** Timestamp when this tick completed */
  timestamp: number;
}

/**
 * Configuration for the BytecodeInterpreter.
 */
export interface BytecodeInterpreterConfig {
  /** Safety constraints applied to all frames */
  safetyConstraints: SafetyConstraints;
  /** Maximum cumulative motor runtime before forced stop (ms) */
  maxMotorRuntimeMs: number;
  /** If true, instructions are validated but not executed against target */
  dryRun: boolean;
}

const DEFAULT_CONFIG: BytecodeInterpreterConfig = {
  safetyConstraints: DEFAULT_SAFETY_CONSTRAINTS,
  maxMotorRuntimeMs: 30000,
  dryRun: false,
};

// =============================================================================
// BytecodeInterpreter
// =============================================================================

export class BytecodeInterpreter {
  private target: BytecodeExecutionTarget;
  private config: BytecodeInterpreterConfig;

  // Internal state
  private motorStartTime: number | null = null;
  private cumulativeMotorMs: number = 0;
  private currentMode: ExecutionMode = 'idle';
  private currentGoal: string | undefined = undefined;
  private variables: Record<string, string | number | boolean> = {};

  constructor(target: BytecodeExecutionTarget, config: Partial<BytecodeInterpreterConfig> = {}) {
    this.target = target;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Execute a single tick: validate and run all instructions in an OutputFrame.
   */
  async executeTick(frame: OutputFrame): Promise<ExecutionTickResult> {
    // Step 1: Validate the full frame via safety constraints
    const validationResult = validateOutputFrame(frame, this.config.safetyConstraints);
    const validatedFrame = validationResult.validated_frame;

    const executed: number[] = [];
    const blocked: number[] = [];
    const errors: string[] = [];
    const stateChanges: ExecutionTickResult['stateChanges'] = {};

    // Record any instructions that were blocked during validation
    for (const blockedIdx of validationResult.blocked_instructions) {
      blocked.push(blockedIdx);
    }
    for (const reason of validationResult.reasons) {
      if (reason.startsWith('Invalid') || reason.startsWith('Unknown')) {
        errors.push(reason);
      }
    }

    // Step 2: Execute each validated instruction
    for (let i = 0; i < validatedFrame.instructions.length; i++) {
      const instruction = validatedFrame.instructions[i];

      try {
        await this.executeInstruction(instruction, i);
        executed.push(i);

        // Collect state changes from state_transition instructions
        if (instruction.type === 'state_transition') {
          if (instruction.mode !== undefined) {
            stateChanges.mode = instruction.mode;
          }
          if (instruction.goal !== undefined) {
            stateChanges.goal = instruction.goal;
          }
          if (instruction.variables !== undefined) {
            stateChanges.variables = {
              ...(stateChanges.variables || {}),
              ...instruction.variables,
            };
          }
        }
      } catch (err) {
        blocked.push(i);
        errors.push(err instanceof Error ? err.message : String(err));
      }
    }

    return {
      executed,
      blocked,
      errors,
      stateChanges,
      motorRuntime: this.cumulativeMotorMs,
      timestamp: Date.now(),
    };
  }

  /**
   * Execute a single instruction against the target.
   */
  private async executeInstruction(
    instruction: BytecodeInstruction,
    _index: number
  ): Promise<void> {
    // Validate individual instruction
    const validation = validateInstruction(instruction);
    if (!validation.valid) {
      throw new Error(validation.error || 'Invalid instruction');
    }

    switch (instruction.type) {
      case 'motor':
        await this.executeMotor(instruction);
        break;

      case 'sensor':
        if (!this.config.dryRun) {
          await this.target.readSensors(instruction.target);
        }
        break;

      case 'led':
        if (!this.config.dryRun) {
          await this.target.setLED(
            instruction.r,
            instruction.g,
            instruction.b,
            instruction.duration_ms
          );
        }
        break;

      case 'timing':
        if (!this.config.dryRun) {
          await this.target.wait(instruction.duration_ms);
        }
        break;

      case 'state_transition':
        this.executeStateTransition(instruction);
        break;

      case 'composite':
        await this.executeComposite(instruction);
        break;

      default:
        throw new Error(`Unknown instruction type: ${(instruction as any).type}`);
    }
  }

  /**
   * Execute a motor instruction with runtime tracking.
   */
  private async executeMotor(instruction: BytecodeInstruction & { type: 'motor' }): Promise<void> {
    const speed = instruction.speed ?? 0;
    const durationMs = instruction.duration_ms;

    if (instruction.action === 'stop') {
      // Stopping: accumulate elapsed motor time
      if (this.motorStartTime !== null) {
        this.cumulativeMotorMs += Date.now() - this.motorStartTime;
        this.motorStartTime = null;
      }

      if (!this.config.dryRun) {
        await this.target.setMotors(instruction.target, 'stop', 0, durationMs);
      }
      return;
    }

    // Check cumulative motor runtime before starting
    if (this.cumulativeMotorMs >= this.config.maxMotorRuntimeMs) {
      throw new Error(
        `Motor runtime limit exceeded: ${this.cumulativeMotorMs}ms >= ${this.config.maxMotorRuntimeMs}ms`
      );
    }

    // If a duration is specified, check if it would exceed the limit
    if (durationMs !== undefined) {
      const projectedTotal = this.cumulativeMotorMs + durationMs;
      if (projectedTotal > this.config.maxMotorRuntimeMs) {
        throw new Error(
          `Motor instruction would exceed runtime limit: ${projectedTotal}ms > ${this.config.maxMotorRuntimeMs}ms`
        );
      }
    }

    // Start tracking motor runtime
    if (this.motorStartTime === null) {
      this.motorStartTime = Date.now();
    }

    // If duration specified, add it to cumulative and reset start time
    if (durationMs !== undefined && durationMs > 0) {
      this.cumulativeMotorMs += durationMs;
      this.motorStartTime = null;
    }

    if (!this.config.dryRun) {
      await this.target.setMotors(instruction.target, instruction.action, speed, durationMs);
    }
  }

  /**
   * Execute a state transition: update mode, goal, and variables.
   */
  private executeStateTransition(
    instruction: BytecodeInstruction & { type: 'state_transition' }
  ): void {
    if (instruction.mode !== undefined) {
      this.currentMode = instruction.mode;
    }
    if (instruction.goal !== undefined) {
      this.currentGoal = instruction.goal;
    }
    if (instruction.variables !== undefined) {
      this.variables = { ...this.variables, ...instruction.variables };
    }
  }

  /**
   * Execute a composite instruction (sequence of sub-instructions).
   * If atomic, all must succeed; otherwise execute in order and collect errors.
   */
  private async executeComposite(
    instruction: BytecodeInstruction & { type: 'composite' }
  ): Promise<void> {
    const subInstructions = instruction.instructions;

    if (instruction.atomic) {
      // Atomic: execute all, but if any fails, stop remaining
      for (let i = 0; i < subInstructions.length; i++) {
        try {
          await this.executeInstruction(subInstructions[i], i);
        } catch (err) {
          throw new Error(
            `Atomic composite failed at sub-instruction ${i}: ${
              err instanceof Error ? err.message : String(err)
            }`
          );
        }
      }
    } else {
      // Non-atomic: execute all in order, collecting errors
      const subErrors: string[] = [];
      for (let i = 0; i < subInstructions.length; i++) {
        try {
          await this.executeInstruction(subInstructions[i], i);
        } catch (err) {
          subErrors.push(
            `Sub-instruction ${i}: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }
      if (subErrors.length > 0) {
        throw new Error(`Composite errors: ${subErrors.join('; ')}`);
      }
    }
  }

  /**
   * Get current interpreter state.
   */
  getState(): {
    mode: ExecutionMode;
    goal: string | undefined;
    variables: Record<string, string | number | boolean>;
    motorRuntime: number;
  } {
    return {
      mode: this.currentMode,
      goal: this.currentGoal,
      variables: { ...this.variables },
      motorRuntime: this.cumulativeMotorMs,
    };
  }

  /**
   * Reset all interpreter state to defaults.
   */
  reset(): void {
    this.motorStartTime = null;
    this.cumulativeMotorMs = 0;
    this.currentMode = 'idle';
    this.currentGoal = undefined;
    this.variables = {};
  }
}
