/**
 * Robot Navigation Debugger
 *
 * Comprehensive debugging tool for understanding robot navigation decisions.
 * Logs every aspect of the robot's perception, decision-making, and execution.
 *
 * Features:
 * - Raw sensor data logging
 * - Formatted LLM context (what the robot "sees")
 * - Ray navigation analysis
 * - LLM response and reasoning
 * - Motor command execution
 * - World state visualization
 * - Decision timeline
 *
 * Usage:
 * ```typescript
 * const debugger = getRobotDebugger();
 * debugger.setEnabled(true);
 * debugger.setVerbosity('detailed'); // 'minimal' | 'normal' | 'detailed' | 'verbose'
 *
 * // In control loop:
 * debugger.startIteration(iteration);
 * debugger.logSensors(sensors);
 * debugger.logLLMContext(formattedContext);
 * debugger.logRayNavigation(rayResult);
 * debugger.logLLMResponse(response);
 * debugger.logMotorCommand(left, right);
 * debugger.endIteration();
 * ```
 */

import { logger } from './logger';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type DebugVerbosity = 'minimal' | 'normal' | 'detailed' | 'verbose';

export interface SensorSnapshot {
  distance: {
    front: number;
    frontLeft: number;
    frontRight: number;
    left: number;
    right: number;
    back: number;
  };
  pose: {
    x: number;
    y: number;
    rotation: number;
  };
  velocity?: {
    linear: number;
    angular: number;
  };
  bumper: {
    front: boolean;
    back: boolean;
  };
}

export interface NavigationDecisionLog {
  iteration: number;
  timestamp: number;
  sensors: SensorSnapshot;
  llmContext?: string;
  rayAnalysis?: {
    bestPath: { direction: string; clearance: number; angle: number };
    alternativePaths: Array<{ direction: string; clearance: number }>;
    prediction: { collisionPredicted: boolean; timeToCollision: number; urgency: string };
    recommendedSteering: { left: number; right: number; reason: string };
  };
  llmResponse?: string;
  parsedToolCalls?: Array<{ tool: string; args: Record<string, unknown> }>;
  executedCommands?: Array<{ tool: string; args: Record<string, unknown>; result: unknown }>;
  motorCommand?: { left: number; right: number };
  decisionReasoning?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// ROBOT NAVIGATION DEBUGGER
// ═══════════════════════════════════════════════════════════════════════════

export class RobotNavigationDebugger {
  private enabled: boolean = false;
  private verbosity: DebugVerbosity = 'normal';
  private currentIteration: number = 0;
  private currentLog: Partial<NavigationDecisionLog> = {};
  private decisionHistory: NavigationDecisionLog[] = [];
  private maxHistorySize: number = 100;

  // Callbacks for UI integration
  private onDecisionLogged?: (log: NavigationDecisionLog) => void;

  /**
   * Enable or disable debugging
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (enabled) {
      logger.info('robot', '🔍 Robot navigation debugging ENABLED', { verbosity: this.verbosity });
    }
  }

  /**
   * Set verbosity level
   */
  setVerbosity(verbosity: DebugVerbosity): void {
    this.verbosity = verbosity;
    logger.info('robot', `Debug verbosity set to: ${verbosity}`);
  }

  /**
   * Register callback for when decisions are logged
   */
  onDecision(callback: (log: NavigationDecisionLog) => void): void {
    this.onDecisionLogged = callback;
  }

  /**
   * Start logging a new iteration
   */
  startIteration(iteration: number): void {
    if (!this.enabled) return;

    this.currentIteration = iteration;
    this.currentLog = {
      iteration,
      timestamp: Date.now(),
    };

    if (this.verbosity === 'verbose') {
      logger.debug('robot', `═══════════════════════════════════════════════════════════`);
      logger.debug('robot', `ITERATION ${iteration} START`);
      logger.debug('robot', `═══════════════════════════════════════════════════════════`);
    }
  }

  /**
   * Log raw sensor readings
   */
  logSensors(sensors: SensorSnapshot): void {
    if (!this.enabled) return;

    this.currentLog.sensors = sensors;

    const { distance, pose, velocity, bumper } = sensors;

    // Always log critical information
    if (distance.front < 30) {
      logger.warn('robot', `⚠️ CLOSE OBSTACLE: Front distance = ${distance.front}cm`, {
        allDistances: distance,
        pose,
      });
    }

    if (bumper.front || bumper.back) {
      logger.error('robot', `💥 COLLISION DETECTED: ${bumper.front ? 'FRONT' : 'BACK'} bumper triggered`);
    }

    if (this.verbosity === 'detailed' || this.verbosity === 'verbose') {
      // Create visual representation of distances
      const distanceMap = this.createDistanceVisualization(distance);

      logger.info('robot', '📡 SENSOR READINGS', {
        distances: distance,
        pose: {
          x: pose.x.toFixed(3),
          y: pose.y.toFixed(3),
          rotation: `${(pose.rotation * 180 / Math.PI).toFixed(1)}°`,
        },
        velocity: velocity ? {
          linear: `${(velocity.linear * 100).toFixed(1)} cm/s`,
          angular: `${(velocity.angular * 180 / Math.PI).toFixed(1)}°/s`,
        } : 'N/A',
        visualization: distanceMap,
      });
    }

    if (this.verbosity === 'verbose') {
      // Log pose in world coordinates
      const heading = this.getHeadingDescription(pose.rotation);
      logger.debug('robot', `📍 Position: (${pose.x.toFixed(2)}, ${pose.y.toFixed(2)}) facing ${heading}`);
    }
  }

  /**
   * Log the formatted LLM context (what the robot "sees")
   */
  logLLMContext(context: string): void {
    if (!this.enabled) return;

    this.currentLog.llmContext = context;

    if (this.verbosity === 'detailed' || this.verbosity === 'verbose') {
      logger.info('robot', '🧠 LLM CONTEXT (What the robot sees)', {
        contextLength: context.length,
        preview: context.substring(0, 500) + (context.length > 500 ? '...' : ''),
      });
    }

    if (this.verbosity === 'verbose') {
      // Log full context
      console.log('\n[ROBOT DEBUG] ═══ FULL LLM CONTEXT ═══');
      console.log(context);
      console.log('[ROBOT DEBUG] ═══ END LLM CONTEXT ═══\n');
    }
  }

  /**
   * Log ray navigation analysis
   */
  logRayNavigation(result: {
    rayFan: {
      bestPath: { direction: string; clearance: number; centerAngle: number };
      alternativePaths: Array<{ direction: string; clearance: number }>;
    };
    prediction: {
      collisionPredicted: boolean;
      timeToCollision: number;
      urgency: string;
      recommendedAction: string;
    };
    recommendedSteering: { leftMotor: number; rightMotor: number; reason: string };
  }): void {
    if (!this.enabled) return;

    this.currentLog.rayAnalysis = {
      bestPath: {
        direction: result.rayFan.bestPath.direction,
        clearance: result.rayFan.bestPath.clearance,
        angle: result.rayFan.bestPath.centerAngle * 180 / Math.PI,
      },
      alternativePaths: result.rayFan.alternativePaths.map(p => ({
        direction: p.direction,
        clearance: p.clearance,
      })),
      prediction: {
        collisionPredicted: result.prediction.collisionPredicted,
        timeToCollision: result.prediction.timeToCollision,
        urgency: result.prediction.urgency,
      },
      recommendedSteering: {
        left: result.recommendedSteering.leftMotor,
        right: result.recommendedSteering.rightMotor,
        reason: result.recommendedSteering.reason,
      },
    };

    if (result.prediction.collisionPredicted) {
      logger.warn('robot', `⚠️ COLLISION PREDICTED in ${result.prediction.timeToCollision.toFixed(1)}s`, {
        urgency: result.prediction.urgency,
        recommendedAction: result.prediction.recommendedAction,
      });
    }

    if (this.verbosity === 'detailed' || this.verbosity === 'verbose') {
      logger.info('robot', '🎯 RAY NAVIGATION ANALYSIS', {
        bestPath: {
          direction: result.rayFan.bestPath.direction,
          clearance: `${result.rayFan.bestPath.clearance.toFixed(0)}cm`,
          angle: `${(result.rayFan.bestPath.centerAngle * 180 / Math.PI).toFixed(1)}°`,
        },
        alternatives: result.rayFan.alternativePaths.slice(0, 2).map(p =>
          `${p.direction}: ${p.clearance.toFixed(0)}cm`
        ),
        collision: result.prediction.collisionPredicted ?
          `YES in ${result.prediction.timeToCollision.toFixed(1)}s (${result.prediction.urgency})` :
          'NO - Path clear',
        recommendation: `L=${result.recommendedSteering.leftMotor} R=${result.recommendedSteering.rightMotor}`,
        reason: result.recommendedSteering.reason,
      });
    }
  }

  /**
   * Log LLM response
   */
  logLLMResponse(response: string): void {
    if (!this.enabled) return;

    this.currentLog.llmResponse = response;

    // Extract reasoning from response (text before tool calls)
    const reasoningMatch = response.match(/^([\s\S]*?)(?=<tool_call>|$)/);
    const reasoning = reasoningMatch ? reasoningMatch[1].trim() : '';

    if (reasoning) {
      this.currentLog.decisionReasoning = reasoning;
    }

    if (this.verbosity === 'normal' || this.verbosity === 'detailed' || this.verbosity === 'verbose') {
      logger.info('robot', '💭 LLM DECISION', {
        reasoning: reasoning || '(No reasoning provided)',
        responseLength: response.length,
      });
    }

    if (this.verbosity === 'verbose') {
      console.log('\n[ROBOT DEBUG] ═══ FULL LLM RESPONSE ═══');
      console.log(response);
      console.log('[ROBOT DEBUG] ═══ END LLM RESPONSE ═══\n');
    }
  }

  /**
   * Log parsed tool calls
   */
  logParsedToolCalls(toolCalls: Array<{ tool: string; args: Record<string, unknown> }>): void {
    if (!this.enabled) return;

    this.currentLog.parsedToolCalls = toolCalls;

    if (toolCalls.length === 0) {
      logger.warn('robot', '⚠️ NO TOOL CALLS PARSED - Robot will not move!');
      return;
    }

    // Check for drive commands
    const driveCall = toolCalls.find(tc => tc.tool === 'drive' || tc.tool === 'hal_drive');
    if (driveCall) {
      const left = driveCall.args.left ?? driveCall.args.leftPWM ?? 0;
      const right = driveCall.args.right ?? driveCall.args.rightPWM ?? 0;
      this.currentLog.motorCommand = { left: left as number, right: right as number };

      // Analyze the motor command
      const analysis = this.analyzeMotorCommand(left as number, right as number);

      if (this.verbosity === 'minimal' || this.verbosity === 'normal' || this.verbosity === 'detailed' || this.verbosity === 'verbose') {
        logger.info('robot', `🚗 MOTOR COMMAND: ${analysis.description}`, {
          left,
          right,
          action: analysis.action,
          direction: analysis.direction,
        });
      }
    }

    if (this.verbosity === 'detailed' || this.verbosity === 'verbose') {
      logger.info('robot', '🔧 PARSED TOOL CALLS', { toolCalls });
    }
  }

  /**
   * Log executed commands and their results
   */
  logExecutedCommand(tool: string, args: Record<string, unknown>, result: unknown): void {
    if (!this.enabled) return;

    if (!this.currentLog.executedCommands) {
      this.currentLog.executedCommands = [];
    }
    this.currentLog.executedCommands.push({ tool, args, result });

    if (this.verbosity === 'detailed' || this.verbosity === 'verbose') {
      logger.info('robot', `✓ Executed: ${tool}`, { args, result });
    }
  }

  /**
   * End the current iteration and save the log
   */
  endIteration(): NavigationDecisionLog | null {
    if (!this.enabled) return null;

    const log = this.currentLog as NavigationDecisionLog;

    // Add to history
    this.decisionHistory.push(log);
    if (this.decisionHistory.length > this.maxHistorySize) {
      this.decisionHistory.shift();
    }

    // Trigger callback
    if (this.onDecisionLogged) {
      this.onDecisionLogged(log);
    }

    // Summary log
    if (this.verbosity === 'verbose') {
      logger.debug('robot', `═══ ITERATION ${this.currentIteration} COMPLETE ═══`);
    }

    // Check for potential issues
    this.analyzeDecision(log);

    this.currentLog = {};
    return log;
  }

  /**
   * Analyze the decision for potential issues
   */
  private analyzeDecision(log: NavigationDecisionLog): void {
    const issues: string[] = [];

    // Check if robot is moving toward an obstacle
    if (log.sensors && log.motorCommand) {
      const { distance } = log.sensors;
      const { left, right } = log.motorCommand;

      // Moving forward toward close obstacle
      if (left > 0 && right > 0 && distance.front < 30) {
        issues.push(`DANGER: Moving forward (L=${left}, R=${right}) but front obstacle at ${distance.front}cm`);
      }

      // Turning toward the closer side
      if (left > right && distance.frontLeft < distance.frontRight && distance.frontLeft < 50) {
        issues.push(`WARNING: Turning left but left side has closer obstacle (${distance.frontLeft}cm)`);
      }
      if (right > left && distance.frontRight < distance.frontLeft && distance.frontRight < 50) {
        issues.push(`WARNING: Turning right but right side has closer obstacle (${distance.frontRight}cm)`);
      }

      // Not moving when path is clear
      if (left === 0 && right === 0 && distance.front > 100) {
        issues.push(`INEFFICIENT: Stopped but front path is clear (${distance.front}cm)`);
      }
    }

    // Check if ray navigation recommendation was ignored
    if (log.rayAnalysis && log.motorCommand) {
      const recommended = log.rayAnalysis.recommendedSteering;
      const actual = log.motorCommand;

      const leftDiff = Math.abs(recommended.left - actual.left);
      const rightDiff = Math.abs(recommended.right - actual.right);

      if (leftDiff > 30 || rightDiff > 30) {
        issues.push(`NOTE: LLM deviated from ray navigation (recommended L=${recommended.left}/R=${recommended.right}, actual L=${actual.left}/R=${actual.right})`);
      }
    }

    // Log issues
    for (const issue of issues) {
      logger.warn('robot', `🔍 ${issue}`);
    }
  }

  /**
   * Create ASCII visualization of distance readings
   */
  private createDistanceVisualization(distance: SensorSnapshot['distance']): string {
    const normalize = (d: number) => Math.min(Math.floor(d / 20), 5);
    const bar = (d: number) => '█'.repeat(normalize(d)) + '░'.repeat(5 - normalize(d));

    return `
      FL[${bar(distance.frontLeft)}] F[${bar(distance.front)}] FR[${bar(distance.frontRight)}]
      L [${bar(distance.left)}]           R [${bar(distance.right)}]
                     B [${bar(distance.back)}]
    `.trim();
  }

  /**
   * Get human-readable heading description
   */
  private getHeadingDescription(rotation: number): string {
    const deg = rotation * 180 / Math.PI;
    const normalized = ((deg % 360) + 360) % 360;

    if (normalized < 22.5 || normalized >= 337.5) return 'North (+Y)';
    if (normalized < 67.5) return 'Northeast';
    if (normalized < 112.5) return 'East (+X)';
    if (normalized < 157.5) return 'Southeast';
    if (normalized < 202.5) return 'South (-Y)';
    if (normalized < 247.5) return 'Southwest';
    if (normalized < 292.5) return 'West (-X)';
    return 'Northwest';
  }

  /**
   * Analyze motor command
   */
  private analyzeMotorCommand(left: number, right: number): {
    action: string;
    direction: string;
    description: string;
  } {
    if (left === 0 && right === 0) {
      return { action: 'stop', direction: 'none', description: 'STOPPED' };
    }

    if (left > 0 && right > 0) {
      if (Math.abs(left - right) < 10) {
        return { action: 'forward', direction: 'straight', description: `Forward straight (${left})` };
      }
      if (left > right) {
        return { action: 'forward', direction: 'right', description: `Forward curving RIGHT (L=${left}, R=${right})` };
      }
      return { action: 'forward', direction: 'left', description: `Forward curving LEFT (L=${left}, R=${right})` };
    }

    if (left < 0 && right < 0) {
      return { action: 'reverse', direction: 'back', description: `REVERSING (L=${left}, R=${right})` };
    }

    if (left < 0 && right > 0) {
      return { action: 'pivot', direction: 'left', description: `PIVOT LEFT (L=${left}, R=${right})` };
    }

    if (left > 0 && right < 0) {
      return { action: 'pivot', direction: 'right', description: `PIVOT RIGHT (L=${left}, R=${right})` };
    }

    return { action: 'unknown', direction: 'unknown', description: `Unknown (L=${left}, R=${right})` };
  }

  /**
   * Get decision history
   */
  getHistory(): NavigationDecisionLog[] {
    return [...this.decisionHistory];
  }

  /**
   * Get the last N decisions
   */
  getRecentDecisions(count: number = 10): NavigationDecisionLog[] {
    return this.decisionHistory.slice(-count);
  }

  /**
   * Clear history
   */
  clearHistory(): void {
    this.decisionHistory = [];
  }

  /**
   * Export history as JSON for analysis
   */
  exportHistory(): string {
    return JSON.stringify(this.decisionHistory, null, 2);
  }

  /**
   * Check if enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SINGLETON INSTANCE
// ═══════════════════════════════════════════════════════════════════════════

let debuggerInstance: RobotNavigationDebugger | null = null;

export function getRobotDebugger(): RobotNavigationDebugger {
  if (!debuggerInstance) {
    debuggerInstance = new RobotNavigationDebugger();
  }
  return debuggerInstance;
}

export function createRobotDebugger(): RobotNavigationDebugger {
  return new RobotNavigationDebugger();
}
