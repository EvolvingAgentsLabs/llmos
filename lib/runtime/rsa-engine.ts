/**
 * Recursive Self-Aggregation (RSA) Engine
 *
 * Implements the RSA algorithm from:
 * "Recursive Self-Aggregation Unlocks Deep Thinking in Large Language Models"
 * Venkatraman, Jain, Mittal et al. (2025)
 * https://arxiv.org/html/2509.26626v1
 *
 * RSA is a hybrid test-time scaling method inspired by evolutionary algorithms
 * that combines parallel (breadth) and sequential (depth) reasoning:
 *
 * 1. POPULATION: Maintain N candidate reasoning chains
 * 2. SUBSAMPLE:  Draw K candidates from the population
 * 3. AGGREGATE:  LLM produces an improved solution from the K candidates
 * 4. RECURSE:    Repeat for T steps, refining the population each time
 *
 * In the LLMos Dual-Brain architecture, RSA serves as the PLANNER brain:
 * - Called on escalation from the INSTINCT layer (Qwen3-VL-8B single-pass)
 * - Runs at 0.1-1Hz for deep planning, goal decomposition, skill generation
 * - Uses VisionFrame JSON from Qwen3-VL-8B multimodal analysis as input context
 *
 * Key insight from the paper: Even K=2 gives massive improvement over
 * K=1 (self-refinement). You don't need large K to benefit.
 */

// ═══════════════════════════════════════════════════════════════════════════
// TYPES & CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Configuration for an RSA run.
 * The paper recommends N=16, K=4, T=10 for maximum quality,
 * but for robotics we use lighter configs to keep latency acceptable.
 */
export interface RSAConfig {
  /** Population size: number of candidate solutions maintained. Controls asymptotic quality. */
  populationSize: number;
  /** Aggregation set size: how many candidates are combined per aggregation step. K=2 already helps. */
  aggregationSize: number;
  /** Number of recursive steps. More steps = deeper thinking but more latency. */
  maxSteps: number;
  /** Early termination: stop if population consensus reaches this threshold (0-1). */
  consensusThreshold: number;
  /** Maximum tokens per candidate response. Controls compute budget per inference. */
  maxTokensPerCandidate: number;
  /** Temperature for initial population generation (higher = more diverse). */
  initialTemperature: number;
  /** Temperature for aggregation steps (lower = more focused refinement). */
  aggregationTemperature: number;
  /** Whether to use majority voting for final answer (vs random sample from final population). */
  useMajorityVoting: boolean;
}

/**
 * Preset configurations for different robotics use cases.
 * Latency estimates assume ~200-500ms per Qwen3-VL-8B inference on RTX 3060+.
 */
export const RSA_PRESETS: Record<string, RSAConfig> = {
  /** Quick replan when robot gets stuck. ~2.5s latency. */
  quick: {
    populationSize: 4,
    aggregationSize: 2,
    maxSteps: 2,
    consensusThreshold: 0.9,
    maxTokensPerCandidate: 512,
    initialTemperature: 0.8,
    aggregationTemperature: 0.4,
    useMajorityVoting: false,
  },
  /** Standard planning for new areas or goals. ~8s latency. */
  standard: {
    populationSize: 8,
    aggregationSize: 3,
    maxSteps: 4,
    consensusThreshold: 0.85,
    maxTokensPerCandidate: 1024,
    initialTemperature: 0.9,
    aggregationTemperature: 0.5,
    useMajorityVoting: false,
  },
  /** Deep planning for complex goals or skill generation. ~22s latency. */
  deep: {
    populationSize: 16,
    aggregationSize: 4,
    maxSteps: 6,
    consensusThreshold: 0.8,
    maxTokensPerCandidate: 2048,
    initialTemperature: 1.0,
    aggregationTemperature: 0.5,
    useMajorityVoting: true,
  },
  /**
   * Swarm consensus: aggregate reasoning from multiple robots.
   * N = number of robots, K = all robots, T = 3 merge rounds.
   */
  swarm: {
    populationSize: 4, // Override with actual fleet size
    aggregationSize: 4, // Override with fleet size
    maxSteps: 3,
    consensusThreshold: 0.8,
    maxTokensPerCandidate: 1024,
    initialTemperature: 0.7,
    aggregationTemperature: 0.3,
    useMajorityVoting: true,
  },
};

/** A single candidate in the RSA population. */
export interface RSACandidate {
  /** Unique ID for tracking lineage across generations. */
  id: string;
  /** The full reasoning chain text. */
  reasoning: string;
  /** Extracted final answer or action plan (parsed from reasoning). */
  answer: string;
  /** Generation step when this candidate was created (0 = initial). */
  generation: number;
  /** IDs of parent candidates that were aggregated to produce this one. */
  parentIds: string[];
  /** Optional metadata for domain-specific use (e.g., world model updates). */
  metadata?: Record<string, unknown>;
}

/** Snapshot of population state at a given step (for debugging/black-box recording). */
export interface RSAStepSnapshot {
  step: number;
  population: RSACandidate[];
  consensusScore: number;
  diversityScore: number;
  timestamp: number;
}

/** Complete result of an RSA run. */
export interface RSAResult {
  /** The selected best answer. */
  bestAnswer: string;
  /** The full reasoning chain of the best candidate. */
  bestReasoning: string;
  /** The winning candidate. */
  bestCandidate: RSACandidate;
  /** All step snapshots (for analysis and black-box recording). */
  history: RSAStepSnapshot[];
  /** Total number of LLM inferences used. */
  totalInferences: number;
  /** Total wall-clock time in ms. */
  totalTimeMs: number;
  /** Final consensus score across the population. */
  finalConsensus: number;
  /** Configuration used. */
  config: RSAConfig;
}

/**
 * Interface for the LLM inference backend.
 * This allows RSA to work with any model provider (local Qwen3-VL-8B, cloud API, etc.)
 */
export interface RSAInferenceProvider {
  /** Generate a single completion given a prompt. */
  generate(prompt: string, options: {
    temperature: number;
    maxTokens: number;
  }): Promise<string>;

  /** Generate multiple completions in a batch (for parallel population init). */
  generateBatch(prompts: string[], options: {
    temperature: number;
    maxTokens: number;
  }): Promise<string[]>;
}

// ═══════════════════════════════════════════════════════════════════════════
// AGGREGATION PROMPT TEMPLATE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Aggregation prompt following the paper's format (Appendix F).
 * The model receives K candidate solutions and must produce an improved one.
 */
export const AGGREGATION_PROMPT = `You are given a problem and a set of candidate solutions. Your task is to produce an improved solution by:

1. Identifying correct reasoning steps across ALL candidates
2. Recognizing and discarding errors or flawed logic
3. Combining the strongest elements into a single, coherent solution
4. Adding any missing reasoning steps needed for correctness

IMPORTANT: Even candidates with wrong final answers may contain correct intermediate steps. Extract and reuse those valuable fragments.

## Problem
{PROBLEM}

## Candidate Solutions
{CANDIDATES}

## Your Task
Produce a single improved solution. Think step by step:
1. What did each candidate get RIGHT?
2. What did each candidate get WRONG?
3. What is the correct approach, combining the best elements?

Provide your complete reasoning, then give a final answer.`;

/**
 * Robot-specific aggregation prompt for navigation/planning tasks.
 */
export const ROBOT_AGGREGATION_PROMPT = `You are a robot planning intelligence. You have received multiple candidate navigation plans and must produce an optimal plan.

## Current Situation
{PROBLEM}

## Candidate Plans
{CANDIDATES}

## Aggregation Rules
1. SAFETY FIRST: If any candidate identifies a collision risk, respect it
2. REUSE CORRECT OBSERVATIONS: Sensor readings and obstacle detections are facts - preserve them
3. COMBINE EXPLORATION STRATEGIES: Merge partial maps and exploration ideas
4. RESOLVE CONFLICTS: When candidates disagree about actions, reason about which is more likely correct based on the sensor data
5. PRODUCE A SINGLE PLAN: Output one coherent action sequence

Think step by step, then output your improved plan.`;

// ═══════════════════════════════════════════════════════════════════════════
// RSA ENGINE
// ═══════════════════════════════════════════════════════════════════════════

export class RSAEngine {
  private config: RSAConfig;
  private provider: RSAInferenceProvider;

  constructor(provider: RSAInferenceProvider, config?: Partial<RSAConfig>) {
    this.provider = provider;
    this.config = {
      ...RSA_PRESETS.standard,
      ...config,
    };
  }

  /**
   * Run the full RSA algorithm.
   *
   * @param problem - The problem/query to solve
   * @param systemPrompt - Optional system context (e.g., robot state, world model)
   * @param promptTemplate - Aggregation prompt to use (default: general)
   * @returns RSAResult with best answer and full history
   */
  async run(
    problem: string,
    systemPrompt?: string,
    promptTemplate: string = AGGREGATION_PROMPT
  ): Promise<RSAResult> {
    const startTime = Date.now();
    let totalInferences = 0;
    const history: RSAStepSnapshot[] = [];

    // ─── Step 1: Generate initial population ───────────────────────────
    const initialPrompt = systemPrompt
      ? `${systemPrompt}\n\n${problem}`
      : problem;

    const initialPrompts = Array(this.config.populationSize).fill(initialPrompt);
    const initialResponses = await this.provider.generateBatch(
      initialPrompts,
      {
        temperature: this.config.initialTemperature,
        maxTokens: this.config.maxTokensPerCandidate,
      }
    );
    totalInferences += this.config.populationSize;

    let population: RSACandidate[] = initialResponses.map((response, i) => ({
      id: `gen0-${i}`,
      reasoning: response,
      answer: this.extractAnswer(response),
      generation: 0,
      parentIds: [],
    }));

    // Record initial population
    history.push(this.takeSnapshot(0, population));

    // ─── Steps 2-3: Recursive aggregation loop ────────────────────────
    for (let step = 1; step <= this.config.maxSteps; step++) {
      // Check early termination
      const consensus = this.measureConsensus(population);
      if (consensus >= this.config.consensusThreshold) {
        break;
      }

      // Generate N aggregation sets, each with K candidates
      const aggregationSets = this.subsample(population);

      // Build aggregation prompts
      const aggregationPrompts = aggregationSets.map((subset) => {
        const candidatesText = subset
          .map((candidate, i) => `### Candidate ${i + 1}\n${candidate.reasoning}`)
          .join('\n\n');

        return promptTemplate
          .replace('{PROBLEM}', problem)
          .replace('{CANDIDATES}', candidatesText);
      });

      // Run aggregation in parallel (all N prompts at once)
      const aggregatedResponses = await this.provider.generateBatch(
        aggregationPrompts,
        {
          temperature: this.config.aggregationTemperature,
          maxTokens: this.config.maxTokensPerCandidate,
        }
      );
      totalInferences += this.config.populationSize;

      // Build new population
      population = aggregatedResponses.map((response, i) => ({
        id: `gen${step}-${i}`,
        reasoning: response,
        answer: this.extractAnswer(response),
        generation: step,
        parentIds: aggregationSets[i].map((c) => c.id),
      }));

      // Record step
      history.push(this.takeSnapshot(step, population));
    }

    // ─── Step 4: Select final answer ──────────────────────────────────
    const bestCandidate = this.config.useMajorityVoting
      ? this.majorityVote(population)
      : population[Math.floor(Math.random() * population.length)];

    return {
      bestAnswer: bestCandidate.answer,
      bestReasoning: bestCandidate.reasoning,
      bestCandidate,
      history,
      totalInferences,
      totalTimeMs: Date.now() - startTime,
      finalConsensus: this.measureConsensus(population),
      config: { ...this.config },
    };
  }

  /**
   * Run RSA for robot planning specifically.
   * Wraps `run()` with robot-specific context formatting.
   */
  async planRobotAction(
    situation: string,
    worldModelSummary: string,
    visionContext?: string
  ): Promise<RSAResult> {
    const systemPrompt = [
      '## World Model State',
      worldModelSummary,
      visionContext ? `\n## Vision Detection\n${visionContext}` : '',
    ].join('\n');

    return this.run(situation, systemPrompt, ROBOT_AGGREGATION_PROMPT);
  }

  /**
   * Run RSA for swarm consensus — merge world models from multiple robots.
   * Each robot's observation becomes a candidate in the population.
   */
  async swarmConsensus(
    query: string,
    robotObservations: Array<{ robotId: string; observation: string }>
  ): Promise<RSAResult> {
    const startTime = Date.now();
    let totalInferences = 0;
    const history: RSAStepSnapshot[] = [];

    // Initial population = one candidate per robot (no generation needed)
    let population: RSACandidate[] = robotObservations.map((obs, i) => ({
      id: `robot-${obs.robotId}`,
      reasoning: obs.observation,
      answer: obs.observation,
      generation: 0,
      parentIds: [],
      metadata: { robotId: obs.robotId },
    }));

    history.push(this.takeSnapshot(0, population));

    // Run aggregation rounds to build consensus
    const swarmConfig = { ...RSA_PRESETS.swarm };
    swarmConfig.populationSize = robotObservations.length;
    swarmConfig.aggregationSize = Math.min(robotObservations.length, 4);

    for (let step = 1; step <= swarmConfig.maxSteps; step++) {
      const aggregationSets = this.subsampleWithConfig(population, swarmConfig);

      const prompts = aggregationSets.map((subset) => {
        const candidatesText = subset
          .map((c) => {
            const robotId = c.metadata?.robotId ?? 'unknown';
            return `### Robot ${robotId} Observation\n${c.reasoning}`;
          })
          .join('\n\n');

        return `You are a swarm intelligence coordinator. Multiple robots have observed different parts of the environment. Merge their observations into a unified understanding.

## Query
${query}

## Robot Observations
${candidatesText}

## Task
Produce a single, unified observation that:
1. Preserves all unique spatial information from each robot
2. Resolves any conflicts using confidence levels
3. Notes areas of agreement (higher confidence) and disagreement (lower confidence)
4. Produces a coherent map/plan that no single robot could create alone`;
      });

      const responses = await this.provider.generateBatch(prompts, {
        temperature: swarmConfig.aggregationTemperature,
        maxTokens: swarmConfig.maxTokensPerCandidate,
      });
      totalInferences += population.length;

      population = responses.map((response, i) => ({
        id: `swarm-step${step}-${i}`,
        reasoning: response,
        answer: this.extractAnswer(response),
        generation: step,
        parentIds: aggregationSets[i].map((c) => c.id),
      }));

      history.push(this.takeSnapshot(step, population));
    }

    const bestCandidate = this.majorityVote(population);

    return {
      bestAnswer: bestCandidate.answer,
      bestReasoning: bestCandidate.reasoning,
      bestCandidate,
      history,
      totalInferences,
      totalTimeMs: Date.now() - startTime,
      finalConsensus: this.measureConsensus(population),
      config: swarmConfig,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INTERNAL METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Subsample K candidates from the population N times (Eq. 2 from paper).
   * Each aggregation set is sampled uniformly without replacement.
   */
  private subsample(population: RSACandidate[]): RSACandidate[][] {
    return this.subsampleWithConfig(population, this.config);
  }

  private subsampleWithConfig(
    population: RSACandidate[],
    config: RSAConfig
  ): RSACandidate[][] {
    const sets: RSACandidate[][] = [];
    const K = Math.min(config.aggregationSize, population.length);

    for (let i = 0; i < population.length; i++) {
      // Fisher-Yates partial shuffle to select K without replacement
      const indices = Array.from({ length: population.length }, (_, j) => j);
      const selected: RSACandidate[] = [];

      for (let k = 0; k < K; k++) {
        const remaining = indices.length - k;
        const randomIndex = k + Math.floor(Math.random() * remaining);
        // Swap
        [indices[k], indices[randomIndex]] = [indices[randomIndex], indices[k]];
        selected.push(population[indices[k]]);
      }

      sets.push(selected);
    }

    return sets;
  }

  /**
   * Measure consensus in the population.
   * Returns 0-1 where 1 means all candidates agree on the same answer.
   */
  private measureConsensus(population: RSACandidate[]): number {
    if (population.length === 0) return 0;

    const answerCounts = new Map<string, number>();
    for (const candidate of population) {
      const normalized = candidate.answer.trim().toLowerCase();
      answerCounts.set(normalized, (answerCounts.get(normalized) ?? 0) + 1);
    }

    const maxCount = Math.max(...answerCounts.values());
    return maxCount / population.length;
  }

  /**
   * Measure diversity in the population (for analysis).
   * Returns 0-1 where 0 means all answers are identical.
   */
  private measureDiversity(population: RSACandidate[]): number {
    if (population.length <= 1) return 0;

    const uniqueAnswers = new Set(
      population.map((c) => c.answer.trim().toLowerCase())
    );
    return (uniqueAnswers.size - 1) / (population.length - 1);
  }

  /**
   * Select the best candidate via majority voting.
   * If tied, prefer the candidate with longer reasoning (more thorough).
   */
  private majorityVote(population: RSACandidate[]): RSACandidate {
    const answerGroups = new Map<string, RSACandidate[]>();

    for (const candidate of population) {
      const key = candidate.answer.trim().toLowerCase();
      if (!answerGroups.has(key)) {
        answerGroups.set(key, []);
      }
      answerGroups.get(key)!.push(candidate);
    }

    let bestGroup: RSACandidate[] = [];
    let bestCount = 0;

    for (const [, group] of answerGroups) {
      if (group.length > bestCount) {
        bestCount = group.length;
        bestGroup = group;
      }
    }

    // Among the majority group, pick the one with most thorough reasoning
    return bestGroup.reduce((best, current) =>
      current.reasoning.length > best.reasoning.length ? current : best
    );
  }

  /**
   * Extract the final answer from a reasoning chain.
   * Looks for common answer delimiters.
   */
  private extractAnswer(reasoning: string): string {
    // Try structured formats first
    const patterns = [
      /(?:final answer|answer|conclusion|result|selected action|chosen plan):\s*(.+?)(?:\n|$)/i,
      /```(?:json)?\s*\n([\s\S]*?)\n```/,
      /\*\*(?:Answer|Plan|Action)\*\*:\s*(.+?)(?:\n|$)/i,
    ];

    for (const pattern of patterns) {
      const match = reasoning.match(pattern);
      if (match) {
        return match[1].trim();
      }
    }

    // Fallback: use last non-empty line
    const lines = reasoning.trim().split('\n').filter((l) => l.trim());
    return lines[lines.length - 1]?.trim() ?? reasoning.trim();
  }

  /** Take a snapshot of the current population state. */
  private takeSnapshot(step: number, population: RSACandidate[]): RSAStepSnapshot {
    return {
      step,
      population: population.map((c) => ({ ...c })),
      consensusScore: this.measureConsensus(population),
      diversityScore: this.measureDiversity(population),
      timestamp: Date.now(),
    };
  }

  /** Update the engine configuration. */
  setConfig(config: Partial<RSAConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /** Get current configuration. */
  getConfig(): RSAConfig {
    return { ...this.config };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// CONVENIENCE FACTORY
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create an RSA engine with a preset configuration.
 *
 * @example
 * ```ts
 * const rsa = createRSAEngine(provider, 'quick');
 * const result = await rsa.planRobotAction(situation, worldModel);
 * ```
 */
export function createRSAEngine(
  provider: RSAInferenceProvider,
  preset: keyof typeof RSA_PRESETS = 'standard'
): RSAEngine {
  return new RSAEngine(provider, RSA_PRESETS[preset]);
}

export default RSAEngine;
