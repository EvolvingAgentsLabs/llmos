/**
 * Evolutionary Skill Patcher
 *
 * The core of the Dreaming Engine - generates skill variants,
 * tests them against recorded failures, and produces improved skills.
 *
 * Evolutionary process:
 * 1. Load failed sessions from BlackBox
 * 2. Analyze failure patterns
 * 3. Generate skill mutations
 * 4. Test mutations in simulation
 * 5. Select best performing variants
 * 6. Patch skill files
 *
 * Usage:
 * ```typescript
 * const patcher = getEvolutionaryPatcher();
 *
 * // Run evolution on a skill
 * const result = await patcher.evolveSkill('gardener', {
 *   generations: 10,
 *   populationSize: 5,
 *   mutationRate: 0.2,
 * });
 *
 * // Apply best variant
 * if (result.improvement > 10) {
 *   await patcher.applyPatch(result.bestVariant);
 * }
 * ```
 */

import { logger } from '@/lib/debug/logger';
import { FileSystemStorage, getFileSystem } from '../storage/filesystem';
import { getBlackBoxRecorder, RecordingSession, FailureMarker } from './black-box-recorder';
import { getSimulationReplayer, ReplayResult } from './simulation-replayer';
import {
  getPhysicalSkillLoader,
  PhysicalSkill,
  VisualCortex,
  MotorCortex,
  EvolutionEntry,
} from '../skills/physical-skill-loader';

/**
 * Evolution options
 */
export interface EvolutionOptions {
  /** Number of generations to run */
  generations?: number;
  /** Population size per generation */
  populationSize?: number;
  /** Mutation rate (0-1) */
  mutationRate?: number;
  /** Crossover rate (0-1) */
  crossoverRate?: number;
  /** Elite count (best variants to keep unchanged) */
  eliteCount?: number;
  /** Maximum sessions to test against */
  maxSessions?: number;
  /** Minimum improvement threshold to accept (%) */
  minImprovement?: number;
  /** Callback for progress updates */
  onProgress?: (progress: EvolutionProgress) => void;
}

/**
 * Evolution progress update
 */
export interface EvolutionProgress {
  generation: number;
  totalGenerations: number;
  bestFitness: number;
  averageFitness: number;
  improvementSoFar: number;
  evaluationsComplete: number;
  totalEvaluations: number;
}

/**
 * Skill variant with fitness score
 */
export interface SkillVariant {
  skill: PhysicalSkill;
  fitness: number;
  improvements: string[];
  generation: number;
  parentId?: string;
  mutations: string[];
}

/**
 * Evolution result
 */
export interface EvolutionResult {
  skillName: string;
  originalVersion: string;
  generations: number;
  totalVariants: number;
  bestVariant: SkillVariant;
  improvement: number; // Percentage
  failuresFixed: number;
  newFailuresIntroduced: number;
  evolutionHistory: EvolutionEntry[];
  duration: number;
}

/**
 * Mutation types
 */
type MutationType =
  | 'add_investigation_trigger'
  | 'add_alert_condition'
  | 'modify_safety_limit'
  | 'add_visual_target'
  | 'modify_protocol'
  | 'add_ignore_item';

/**
 * Evolutionary Skill Patcher
 *
 * Generates and tests skill variants to improve performance.
 */
export class EvolutionaryPatcher {
  private fs: FileSystemStorage;
  private isEvolving = false;
  private currentSkillName: string | null = null;

  constructor(fs?: FileSystemStorage) {
    this.fs = fs || getFileSystem();
  }

  /**
   * Run evolution on a skill
   */
  async evolveSkill(
    skillPath: string,
    options: EvolutionOptions = {}
  ): Promise<EvolutionResult> {
    if (this.isEvolving) {
      throw new Error('Evolution already in progress');
    }

    this.isEvolving = true;
    const startTime = Date.now();

    const generations = options.generations || 5;
    const populationSize = options.populationSize || 4;
    const mutationRate = options.mutationRate || 0.3;
    const eliteCount = options.eliteCount || 1;
    const maxSessions = options.maxSessions || 10;
    const minImprovement = options.minImprovement || 5;

    logger.info('evolution', 'Starting skill evolution', {
      skillPath,
      generations,
      populationSize,
    });

    try {
      // Load the skill
      const skillLoader = getPhysicalSkillLoader();
      const skillResult = await skillLoader.loadSkill(skillPath);
      if (!skillResult.ok) {
        throw new Error(`Failed to load skill: ${skillPath}`);
      }
      const originalSkill = skillResult.value;
      this.currentSkillName = originalSkill.frontmatter.name;

      // Get failed sessions for this skill
      const recorder = getBlackBoxRecorder();
      const allFailedSessions = await recorder.getFailedSessions(maxSessions);
      const relevantSessions = allFailedSessions.filter(
        (s) => s.skillName === originalSkill.frontmatter.name
      );

      if (relevantSessions.length === 0) {
        logger.warn('evolution', 'No failed sessions found for skill');
        return {
          skillName: originalSkill.frontmatter.name,
          originalVersion: originalSkill.frontmatter.version,
          generations: 0,
          totalVariants: 0,
          bestVariant: {
            skill: originalSkill,
            fitness: 1,
            improvements: [],
            generation: 0,
            mutations: [],
          },
          improvement: 0,
          failuresFixed: 0,
          newFailuresIntroduced: 0,
          evolutionHistory: [],
          duration: Date.now() - startTime,
        };
      }

      // Analyze failure patterns
      const failurePatterns = this.analyzeFailures(relevantSessions);

      // Initialize population
      let population: SkillVariant[] = [
        {
          skill: originalSkill,
          fitness: 0,
          improvements: [],
          generation: 0,
          mutations: [],
        },
      ];

      // Generate initial mutations based on failure patterns
      for (let i = 1; i < populationSize; i++) {
        const variant = this.mutateSkill(originalSkill, mutationRate, failurePatterns);
        population.push({
          skill: variant.skill,
          fitness: 0,
          improvements: [],
          generation: 0,
          mutations: variant.mutations,
        });
      }

      let bestVariant = population[0];
      let totalEvaluations = 0;

      // Run evolution
      for (let gen = 0; gen < generations; gen++) {
        logger.info('evolution', `Generation ${gen + 1}/${generations}`, {
          populationSize: population.length,
        });

        // Evaluate fitness for each variant
        for (const variant of population) {
          const fitness = await this.evaluateFitness(variant.skill, relevantSessions);
          variant.fitness = fitness.score;
          variant.improvements = fitness.improvements;
          totalEvaluations++;

          // Track best
          if (variant.fitness > bestVariant.fitness) {
            bestVariant = variant;
          }
        }

        // Sort by fitness (descending)
        population.sort((a, b) => b.fitness - a.fitness);

        // Progress callback
        if (options.onProgress) {
          const avgFitness =
            population.reduce((sum, v) => sum + v.fitness, 0) / population.length;
          options.onProgress({
            generation: gen + 1,
            totalGenerations: generations,
            bestFitness: bestVariant.fitness,
            averageFitness: avgFitness,
            improvementSoFar: (bestVariant.fitness - population[population.length - 1].fitness) * 100,
            evaluationsComplete: totalEvaluations,
            totalEvaluations: generations * populationSize,
          });
        }

        // Early termination if we've reached good enough improvement
        if (bestVariant.fitness > 0.95) {
          logger.info('evolution', 'Early termination - excellent fitness achieved');
          break;
        }

        // Create next generation
        const nextPopulation: SkillVariant[] = [];

        // Keep elite
        for (let i = 0; i < eliteCount && i < population.length; i++) {
          nextPopulation.push({
            ...population[i],
            generation: gen + 1,
          });
        }

        // Fill rest with mutations of best performers
        while (nextPopulation.length < populationSize) {
          // Select parent (tournament selection - pick best of 2 random)
          const parent1 = population[Math.floor(Math.random() * (populationSize / 2))];
          const parent2 = population[Math.floor(Math.random() * (populationSize / 2))];
          const parent = parent1.fitness > parent2.fitness ? parent1 : parent2;

          // Mutate
          const mutated = this.mutateSkill(parent.skill, mutationRate, failurePatterns);
          nextPopulation.push({
            skill: mutated.skill,
            fitness: 0,
            improvements: [],
            generation: gen + 1,
            parentId: parent.skill.frontmatter.name,
            mutations: [...parent.mutations, ...mutated.mutations],
          });
        }

        population = nextPopulation;
      }

      // Calculate results
      const originalFitness = await this.evaluateFitness(originalSkill, relevantSessions);
      const improvement = (bestVariant.fitness - originalFitness.score) * 100;

      // Build evolution history
      const evolutionHistory: EvolutionEntry[] = [
        {
          version: this.incrementVersion(originalSkill.frontmatter.version),
          date: new Date().toISOString(),
          description: bestVariant.mutations.join('; ') || 'No mutations',
          source: 'dreaming',
        },
      ];

      logger.success('evolution', 'Evolution complete', {
        improvement: `${improvement.toFixed(1)}%`,
        mutations: bestVariant.mutations.length,
        generations,
      });

      return {
        skillName: originalSkill.frontmatter.name,
        originalVersion: originalSkill.frontmatter.version,
        generations,
        totalVariants: totalEvaluations,
        bestVariant,
        improvement,
        failuresFixed: bestVariant.improvements.length,
        newFailuresIntroduced: 0, // Would need to track this
        evolutionHistory,
        duration: Date.now() - startTime,
      };
    } finally {
      this.isEvolving = false;
      this.currentSkillName = null;
    }
  }

  /**
   * Apply a skill patch
   */
  async applyPatch(variant: SkillVariant): Promise<boolean> {
    const skill = variant.skill;
    const newVersion = this.incrementVersion(skill.frontmatter.version);

    // Build new skill content
    const newContent = this.buildSkillMarkdown(skill, newVersion, variant);

    // Write to file
    const result = await this.fs.write(skill.path, newContent);

    if (result.ok) {
      logger.success('evolution', 'Skill patched', {
        path: skill.path,
        newVersion,
        mutations: variant.mutations,
      });
    }

    return result.ok;
  }

  /**
   * Check if evolution is in progress
   */
  isEvolutionInProgress(): boolean {
    return this.isEvolving;
  }

  /**
   * Get current evolving skill name
   */
  getCurrentSkillName(): string | null {
    return this.currentSkillName;
  }

  /**
   * Analyze failure patterns from sessions
   */
  private analyzeFailures(sessions: RecordingSession[]): Map<string, number> {
    const patterns = new Map<string, number>();

    for (const session of sessions) {
      for (const failure of session.failures) {
        const key = `${failure.type}:${failure.severity}`;
        patterns.set(key, (patterns.get(key) || 0) + 1);
      }
    }

    return patterns;
  }

  /**
   * Mutate a skill based on failure patterns
   */
  private mutateSkill(
    skill: PhysicalSkill,
    mutationRate: number,
    failurePatterns: Map<string, number>
  ): { skill: PhysicalSkill; mutations: string[] } {
    const mutations: string[] = [];

    // Deep clone the skill
    const mutated: PhysicalSkill = JSON.parse(JSON.stringify(skill));

    // Determine which mutations to apply based on failure patterns
    const possibleMutations: MutationType[] = [];

    if (failurePatterns.has('collision:critical') || failurePatterns.has('collision:moderate')) {
      possibleMutations.push('add_investigation_trigger', 'modify_safety_limit');
    }

    if (failurePatterns.has('low_confidence:moderate')) {
      possibleMutations.push('add_visual_target', 'add_investigation_trigger');
    }

    if (failurePatterns.has('safety_stop:critical')) {
      possibleMutations.push('add_alert_condition', 'modify_safety_limit');
    }

    // Default mutations if no specific patterns
    if (possibleMutations.length === 0) {
      possibleMutations.push(
        'add_investigation_trigger',
        'add_visual_target',
        'modify_protocol'
      );
    }

    // Apply mutations based on rate
    for (const mutationType of possibleMutations) {
      if (Math.random() < mutationRate) {
        this.applyMutation(mutated, mutationType);
        mutations.push(mutationType);
      }
    }

    return { skill: mutated, mutations };
  }

  /**
   * Apply a specific mutation type
   */
  private applyMutation(skill: PhysicalSkill, type: MutationType): void {
    switch (type) {
      case 'add_investigation_trigger':
        skill.visualCortex.investigationTriggers.push({
          condition: 'Unclear object detected',
          action: 'Zoom to 2x and re-analyze',
        });
        break;

      case 'add_alert_condition':
        skill.visualCortex.alertConditions.push({
          condition: 'Unexpected obstacle',
          action: 'Stop and scan surroundings',
          severity: 'warning',
        });
        break;

      case 'modify_safety_limit':
        if (!skill.motorCortex.safetyLimits) {
          skill.motorCortex.safetyLimits = {};
        }
        // Increase min confidence threshold
        const currentConfidence = skill.motorCortex.safetyLimits.minConfidence || 0.5;
        skill.motorCortex.safetyLimits.minConfidence = Math.min(0.9, currentConfidence + 0.1);
        // Decrease max speed
        const currentSpeed = skill.motorCortex.safetyLimits.maxSpeed || 100;
        skill.motorCortex.safetyLimits.maxSpeed = Math.max(20, currentSpeed - 10);
        break;

      case 'add_visual_target':
        skill.visualCortex.primaryTargets.push({
          name: 'obstacle',
          description: 'Any object that could impede movement',
        });
        break;

      case 'modify_protocol':
        skill.motorCortex.protocols.push({
          name: 'cautious_approach',
          description: 'Reduce speed when obstacles detected within 50cm',
          constraints: ['max_speed: 30%', 'scan_frequency: high'],
        });
        break;

      case 'add_ignore_item':
        skill.visualCortex.ignoreList.push('background_noise');
        break;
    }
  }

  /**
   * Evaluate fitness of a skill variant
   */
  private async evaluateFitness(
    skill: PhysicalSkill,
    sessions: RecordingSession[]
  ): Promise<{ score: number; improvements: string[] }> {
    const replayer = getSimulationReplayer();
    const improvements: string[] = [];

    let totalOriginalFailures = 0;
    let totalReplayFailures = 0;

    // Replay each session with the skill variant
    const results = await replayer.replayBatch(sessions, skill, { headless: true });

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      totalOriginalFailures += result.originalFailureCount;
      totalReplayFailures += result.replayFailureCount;

      // Track improvements
      if (result.avoidedFailures.length > 0) {
        improvements.push(
          `Session ${sessions[i].id}: Avoided ${result.avoidedFailures.length} failures`
        );
      }
    }

    // Calculate fitness (0-1 scale)
    // Higher is better - based on failure reduction
    const fitness =
      totalOriginalFailures > 0
        ? 1 - totalReplayFailures / totalOriginalFailures
        : 1;

    return {
      score: Math.max(0, Math.min(1, fitness)),
      improvements,
    };
  }

  /**
   * Build markdown content for skill
   */
  private buildSkillMarkdown(
    skill: PhysicalSkill,
    newVersion: string,
    variant: SkillVariant
  ): string {
    const frontmatter = {
      ...skill.frontmatter,
      version: newVersion,
      updated_at: new Date().toISOString(),
    };

    let content = '---\n';
    for (const [key, value] of Object.entries(frontmatter)) {
      if (Array.isArray(value)) {
        content += `${key}: [${value.join(', ')}]\n`;
      } else {
        content += `${key}: ${value}\n`;
      }
    }
    content += '---\n\n';

    // Add role
    content += `# Role\n${skill.role}\n\n`;

    // Add objective
    content += `# Objective\n${skill.objective}\n\n`;

    // Add visual cortex
    content += '# Visual Cortex Instructions\n\n';
    content += '## Primary Targets\n';
    for (const target of skill.visualCortex.primaryTargets) {
      content += `- \`${target.name}\`: ${target.description}\n`;
    }
    content += '\n## Investigation Triggers\n';
    for (const trigger of skill.visualCortex.investigationTriggers) {
      content += `- **${trigger.condition}**: ${trigger.action}\n`;
    }
    content += '\n## Ignore List\n';
    for (const item of skill.visualCortex.ignoreList) {
      content += `- ${item}\n`;
    }
    content += '\n## Alert Conditions\n';
    for (const alert of skill.visualCortex.alertConditions) {
      content += `- \`${alert.condition}\` → ${alert.action}\n`;
    }

    // Add motor cortex
    content += '\n# Motor Cortex Protocols\n\n';
    content += '## Available Tools\n';
    for (const tool of skill.motorCortex.availableTools) {
      content += `- \`${tool}\`\n`;
    }
    content += '\n## Protocols\n';
    for (const protocol of skill.motorCortex.protocols) {
      content += `- ${protocol.description}\n`;
    }

    // Add safety protocols
    content += '\n# Safety Protocols\n';
    for (const protocol of skill.safetyProtocols) {
      content += `- ${protocol}\n`;
    }

    // Add evolution history
    content += '\n# Evolution History\n';
    for (const entry of skill.evolutionHistory) {
      content += `- v${entry.version}: ${entry.description}`;
      if (entry.source) {
        content += ` (${entry.source})`;
      }
      content += '\n';
    }
    // Add new entry
    content += `- v${newVersion}: ${variant.mutations.join('; ') || 'Optimized via dreaming'} (dreaming)\n`;

    return content;
  }

  /**
   * Increment version string
   */
  private incrementVersion(version: string): string {
    const parts = version.split('.');
    if (parts.length === 3) {
      const patch = parseInt(parts[2], 10) + 1;
      return `${parts[0]}.${parts[1]}.${patch}`;
    }
    return `${version}.1`;
  }
}

// Singleton instance
let patcherInstance: EvolutionaryPatcher | null = null;

/**
 * Get the evolutionary patcher instance
 */
export function getEvolutionaryPatcher(): EvolutionaryPatcher {
  if (!patcherInstance) {
    patcherInstance = new EvolutionaryPatcher();
  }
  return patcherInstance;
}
