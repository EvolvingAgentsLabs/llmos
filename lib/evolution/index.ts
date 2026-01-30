/**
 * Dreaming Engine
 *
 * The evolution system that allows robots to learn while "sleeping".
 *
 * The Dreaming Engine works as follows:
 * 1. **Record**: BlackBox recorder captures all interactions during operation
 * 2. **Replay**: When the robot is idle, failed sessions are replayed in simulation
 * 3. **Evolve**: Skill variants are generated and tested against failure scenarios
 * 4. **Patch**: Best performing variants are applied to skill files
 *
 * This creates a continuous improvement loop:
 * - Robot operates with a skill
 * - Failures are recorded
 * - During "sleep" (idle time), the Dreaming Engine runs
 * - Improved skills are automatically applied
 * - Robot wakes up better at its job
 *
 * Usage:
 * ```typescript
 * import {
 *   getBlackBoxRecorder,
 *   getSimulationReplayer,
 *   getEvolutionaryPatcher,
 *   runDreamingCycle,
 * } from '@/lib/evolution';
 *
 * // Manual usage
 * const recorder = getBlackBoxRecorder();
 * const sessionId = recorder.startSession({ skillName: 'gardener', deviceId: 'robot-1' });
 * // ... robot operates ...
 * recorder.markFailure({ type: 'collision', description: 'Hit plant pot' });
 * await recorder.endSession();
 *
 * // Run dreaming cycle
 * const results = await runDreamingCycle({
 *   skillPath: 'skills/gardener.md',
 *   generations: 5,
 *   autoApply: true,
 * });
 *
 * // Results show improvements
 * console.log(`Improvement: ${results.improvement}%`);
 * ```
 */

// Export BlackBox Recorder
export { BlackBoxRecorder, getBlackBoxRecorder } from './black-box-recorder';
export type {
  RecordedFrame,
  RecordingSession,
  FailureMarker,
  SessionOptions,
} from './black-box-recorder';

// Export Simulation Replayer
export { SimulationReplayer, getSimulationReplayer } from './simulation-replayer';
export type { ReplayOptions, ReplayResult } from './simulation-replayer';

// Export Evolutionary Patcher
export { EvolutionaryPatcher, getEvolutionaryPatcher } from './evolutionary-patcher';
export type {
  EvolutionOptions,
  EvolutionProgress,
  EvolutionResult,
  SkillVariant,
} from './evolutionary-patcher';

import { logger } from '@/lib/debug/logger';
import { getBlackBoxRecorder } from './black-box-recorder';
import { getEvolutionaryPatcher, EvolutionOptions, EvolutionResult } from './evolutionary-patcher';

// Re-export existing client evolution module for backward compatibility
export * from './client-evolution';

/**
 * Options for running a dreaming cycle
 */
export interface DreamingCycleOptions extends EvolutionOptions {
  /** Path to skill file to evolve */
  skillPath: string;
  /** Automatically apply improvements if above threshold */
  autoApply?: boolean;
  /** Improvement threshold for auto-apply (default 10%) */
  autoApplyThreshold?: number;
  /** Callback when dreaming starts */
  onStart?: () => void;
  /** Callback when dreaming completes */
  onComplete?: (result: EvolutionResult) => void;
}

/**
 * Run a complete dreaming cycle
 *
 * This is the high-level API for the Dreaming Engine.
 * It handles the full cycle: load failures → evolve → apply patches
 */
export async function runDreamingCycle(
  options: DreamingCycleOptions
): Promise<EvolutionResult> {
  const {
    skillPath,
    autoApply = false,
    autoApplyThreshold = 10,
    onStart,
    onComplete,
    ...evolutionOptions
  } = options;

  logger.info('dreaming', 'Starting dreaming cycle', {
    skillPath,
    autoApply,
    autoApplyThreshold,
  });

  if (onStart) {
    onStart();
  }

  const patcher = getEvolutionaryPatcher();

  try {
    // Run evolution
    const result = await patcher.evolveSkill(skillPath, evolutionOptions);

    // Auto-apply if enabled and improvement meets threshold
    if (autoApply && result.improvement >= autoApplyThreshold) {
      logger.info('dreaming', 'Auto-applying improvement', {
        improvement: `${result.improvement.toFixed(1)}%`,
        threshold: `${autoApplyThreshold}%`,
      });

      await patcher.applyPatch(result.bestVariant);
    }

    if (onComplete) {
      onComplete(result);
    }

    return result;
  } catch (error) {
    logger.error('dreaming', 'Dreaming cycle failed', { error });
    throw error;
  }
}

/**
 * Check if the robot should dream (has enough failures to learn from)
 */
export async function shouldDream(
  skillName: string,
  minFailures: number = 3
): Promise<boolean> {
  const recorder = getBlackBoxRecorder();
  const sessions = await recorder.getFailedSessions(10);

  const relevantSessions = sessions.filter((s) => s.skillName === skillName);
  const totalFailures = relevantSessions.reduce(
    (sum, s) => sum + s.failures.length,
    0
  );

  return totalFailures >= minFailures;
}

/**
 * Schedule dreaming during idle time
 *
 * This can be called periodically (e.g., every hour) to check
 * if the robot should dream and run the cycle if needed.
 */
export async function scheduleDreaming(
  skillPaths: string[],
  options: Omit<DreamingCycleOptions, 'skillPath'> = {}
): Promise<void> {
  const patcher = getEvolutionaryPatcher();

  // Don't start if already evolving
  if (patcher.isEvolutionInProgress()) {
    logger.debug('dreaming', 'Skipping scheduled dreaming - already in progress');
    return;
  }

  for (const skillPath of skillPaths) {
    // Extract skill name from path
    const skillName = skillPath.split('/').pop()?.replace('.md', '') || skillPath;

    // Check if we should dream for this skill
    const shouldDreamNow = await shouldDream(skillName);

    if (shouldDreamNow) {
      logger.info('dreaming', `Scheduling dreaming for skill: ${skillName}`);

      try {
        await runDreamingCycle({
          ...options,
          skillPath,
          autoApply: options.autoApply ?? true,
        });
      } catch (error) {
        logger.error('dreaming', `Dreaming failed for skill: ${skillName}`, { error });
      }
    }
  }
}

/**
 * Get dreaming statistics
 */
export async function getDreamingStats(): Promise<{
  totalSessions: number;
  failedSessions: number;
  totalFailures: number;
  failuresByType: Record<string, number>;
  skillsWithFailures: string[];
}> {
  const recorder = getBlackBoxRecorder();
  const allSessions = await recorder.listSessions();
  const failedSessions = await recorder.getFailedSessions(100);

  const failuresByType: Record<string, number> = {};
  const skillsWithFailures = new Set<string>();

  for (const session of failedSessions) {
    skillsWithFailures.add(session.skillName);
    for (const failure of session.failures) {
      failuresByType[failure.type] = (failuresByType[failure.type] || 0) + 1;
    }
  }

  return {
    totalSessions: allSessions.length,
    failedSessions: failedSessions.length,
    totalFailures: Object.values(failuresByType).reduce((sum, n) => sum + n, 0),
    failuresByType,
    skillsWithFailures: Array.from(skillsWithFailures),
  };
}
