/**
 * Lens Evolution Service
 *
 * Evolutionary system for domain lens selection and generation.
 * Based on cross-domain scientific modeling and phenomena transfer.
 *
 * Core Scientific Principles:
 * - Mathematical Isomorphism: Same equations govern different physical domains
 * - Phenomena Transfer: Validated phenomena in one domain apply to isomorphic systems
 * - System Dynamics: Classify code by dynamical behavior (equilibrium, flow, population, signal)
 * - Validated Laws: Apply proven scientific laws rather than metaphorical mappings
 *
 * Example Isomorphisms:
 * - Electrical (V=IR) ≡ Hydraulic (P=QZ) ≡ Thermal (ΔT=ΦR_th)
 * - Glacial stochastic resonance ≡ Neural detection ≡ Optimization noise
 * - Population genetics ≡ Genetic algorithms ≡ Strategy evolution
 */

import { getVFS } from './virtual-fs';
import { createLLMClient, Message } from './llm-client';
import { DomainLens } from './mutation-engine';

// ============================================================================
// Types
// ============================================================================

/**
 * System Dynamics Type - classifies code by its mathematical behavior
 */
export interface SystemDynamicsType {
  id: string;
  name: string;
  indicators: string[];  // Code patterns that identify this type
  description: string;
  governingEquations: string[];  // Mathematical laws that apply
  applicablePhenomena: string[];  // Cross-domain phenomena that transfer
}

/**
 * Mathematical Mapping - tracks how code variables map to physical analogs
 */
export interface MathematicalMapping {
  codeVariable: string;
  physicalAnalog: string;
  governingLaw: string;
  domain: string;
}

/**
 * Phenomena Transfer Record - tracks successful cross-domain applications
 */
export interface PhenomenaTransfer {
  phenomenonId: string;
  sourceDomain: string;
  targetApplication: string;
  validationScore: number;  // How well the transfer worked
  appliedCount: number;
}

// Legacy alias for backwards compatibility
export interface CodePattern {
  id: string;
  name: string;
  indicators: string[];
  description: string;
}

export interface LensFitnessRecord {
  lensId: string;
  codePatternId: string;
  successCount: number;
  failureCount: number;
  totalSpeedImprovement: number;
  avgSpeedImprovement: number;
  lastUsed: string;
  fitness: number;  // Calculated fitness score 0-1
}

export interface LensGenome {
  lensId: string;
  parentIds: string[];  // For tracking lineage
  generation: number;
  mutations: string[];  // Modifications made
  fitness: number;
  birthDate: string;
}

export interface EvolutionConfig {
  selectionPressure: number;      // 0-1, higher = more exploitation
  mutationRate: number;           // 0-1, chance of lens modification
  crossoverRate: number;          // 0-1, chance of lens combination
  elitismCount: number;           // Top N lenses always survive
  populationSize: number;         // Max lenses to maintain
  minFitnessThreshold: number;    // Below this, lens may be culled
  learningRate: number;           // How fast fitness updates
}

export interface LensSelectionResult {
  selectedLens: DomainLens;
  confidence: number;
  reasoning: string;
  alternatives: Array<{ lens: DomainLens; score: number }>;
  // Scientific additions
  systemDynamicsType?: string;
  mathematicalMapping?: MathematicalMapping;
  transferablePhenomena?: string[];
}

// ============================================================================
// Constants
// ============================================================================

const STORAGE_KEY = 'lens_evolution_state';
const GENERATED_LENSES_DIR = 'system/domains/generated';

const DEFAULT_CONFIG: EvolutionConfig = {
  selectionPressure: 0.7,
  mutationRate: 0.1,
  crossoverRate: 0.2,
  elitismCount: 3,
  populationSize: 10,
  minFitnessThreshold: 0.3,
  learningRate: 0.1,
};

/**
 * System Dynamics Classification
 *
 * Classifies code by its mathematical structure, not just its algorithmic pattern.
 * This enables applying validated physical laws and phenomena transfer.
 */
const SYSTEM_DYNAMICS: SystemDynamicsType[] = [
  {
    id: 'equilibrium_seeking',
    name: 'Equilibrium-Seeking Systems',
    indicators: ['min', 'max', 'optim', 'gradient', 'converge', 'loss', 'cost', 'energy', 'objective', 'fitness', 'descent', 'ascent'],
    description: 'Systems that minimize/maximize an objective function',
    governingEquations: [
      'F = -∇U (gradient descent)',
      'P(state) ∝ exp(-E/kT) (Boltzmann)',
      'ΔF = ΔU - TΔS (free energy)'
    ],
    applicablePhenomena: [
      'Simulated annealing',
      'Phase transitions at critical points',
      'Quenching vs slow cooling tradeoff'
    ]
  },
  {
    id: 'flow_network',
    name: 'Flow Network Systems',
    indicators: ['queue', 'buffer', 'pipe', 'flow', 'stream', 'throughput', 'capacity', 'load', 'balance', 'route', 'distribute'],
    description: 'Systems where quantities flow through a network structure',
    governingEquations: [
      'Σ(inputs) = Σ(outputs) (Kirchhoff current)',
      'V = IR (Ohm\'s law)',
      'P = QZ (hydraulic analog)'
    ],
    applicablePhenomena: [
      'Impedance matching for throughput',
      'RC time constants for buffering',
      'Current divider for load balancing'
    ]
  },
  {
    id: 'population_dynamics',
    name: 'Population Dynamics Systems',
    indicators: ['population', 'fitness', 'select', 'mutate', 'crossover', 'generation', 'evolve', 'compete', 'survive', 'reproduce'],
    description: 'Systems with competing/cooperating entities under selection',
    governingEquations: [
      'Δz̄ = Cov(w,z)/w̄ (Price equation)',
      'dw̄/dt = Var(w) (Fisher theorem)',
      'dx_i/dt = x_i(f_i - φ) (Replicator)'
    ],
    applicablePhenomena: [
      'Diversity drives adaptation rate',
      'Punctuated equilibrium',
      'Evolutionarily stable strategies'
    ]
  },
  {
    id: 'signal_detection',
    name: 'Signal Detection Systems',
    indicators: ['threshold', 'detect', 'noise', 'signal', 'filter', 'classify', 'anomaly', 'pattern', 'match', 'trigger'],
    description: 'Systems that detect patterns in noisy data',
    governingEquations: [
      'SNR = P_signal / P_noise',
      'Output_SNR peaks at σ_opt (stochastic resonance)',
      'H(ω) = |Y(ω)| / |X(ω)| (transfer function)'
    ],
    applicablePhenomena: [
      'Optimal noise enhances detection',
      'Ensemble of noisy detectors beats one clean',
      'Matched filtering for known patterns'
    ]
  },
  {
    id: 'market_equilibrium',
    name: 'Market Equilibrium Systems',
    indicators: ['price', 'trade', 'bid', 'ask', 'auction', 'allocat', 'scarce', 'resource', 'budget', 'utility', 'payoff'],
    description: 'Systems with resource allocation and trade-offs',
    governingEquations: [
      'MU_x/P_x = MU_y/P_y (utility maximization)',
      'S(p) = D(p) (market clearing)',
      'E[u(A)] = Σ p_i × u(A_i) (expected utility)'
    ],
    applicablePhenomena: [
      'Nash equilibrium in competition',
      'Pareto efficiency boundary',
      'Arbitrage elimination'
    ]
  },
  {
    id: 'wave_propagation',
    name: 'Wave/Propagation Systems',
    indicators: ['propagate', 'spread', 'diffuse', 'wave', 'cascade', 'infect', 'viral', 'neighbor', 'contagion', 'epidemic'],
    description: 'Systems with spreading/diffusing behavior',
    governingEquations: [
      '∂u/∂t = D∇²u (diffusion)',
      'dI/dt = βSI - γI (SIR model)',
      'R0 = β/γ (reproduction number)'
    ],
    applicablePhenomena: [
      'Critical threshold for spread',
      'Diffusion limited aggregation',
      'Wave interference patterns'
    ]
  },
  {
    id: 'recursive_structure',
    name: 'Recursive/Fractal Systems',
    indicators: ['recursive', 'divide', 'conquer', 'tree', 'hierarchy', 'self-similar', 'branch', 'merge', 'split'],
    description: 'Systems with self-similar recursive structure',
    governingEquations: [
      'T(n) = aT(n/b) + f(n) (master theorem)',
      'D = log(N)/log(1/r) (fractal dimension)'
    ],
    applicablePhenomena: [
      'Divide-and-conquer optimality',
      'Tree balancing for efficiency',
      'Memoization as path caching'
    ]
  },
  {
    id: 'state_machine',
    name: 'State Machine Systems',
    indicators: ['state', 'transition', 'event', 'machine', 'automaton', 'phase', 'mode', 'switch', 'trigger'],
    description: 'Systems with discrete states and transitions',
    governingEquations: [
      'P(X_n+1|X_n) (Markov property)',
      'πP = π (stationary distribution)'
    ],
    applicablePhenomena: [
      'Ergodicity and mixing time',
      'Absorbing states as attractors',
      'Hidden state inference'
    ]
  }
];

// Legacy: Map system dynamics to old pattern IDs for backwards compatibility
const CODE_PATTERNS: CodePattern[] = SYSTEM_DYNAMICS.map(sd => ({
  id: sd.id,
  name: sd.name,
  indicators: sd.indicators,
  description: sd.description
}));

/**
 * Scientific Affinity Matrix
 *
 * Maps domain lenses to system dynamics types based on mathematical isomorphism.
 * Higher scores indicate stronger isomorphism (same governing equations).
 */
const LENS_PATTERN_AFFINITY: Record<string, Record<string, number>> = {
  thermodynamics: {
    equilibrium_seeking: 0.98,  // Energy minimization IS gradient descent
    flow_network: 0.75,         // Heat flow through thermal resistance
    population_dynamics: 0.60,  // Statistical mechanics of populations
    signal_detection: 0.55,     // Thermal noise in detection
    market_equilibrium: 0.70,   // Free energy ≡ utility maximization
    wave_propagation: 0.80,     // Heat diffusion equation
    recursive_structure: 0.40,
    state_machine: 0.65,        // Phase transitions
  },
  circuit_systems: {
    equilibrium_seeking: 0.70,  // Circuits minimize energy dissipation
    flow_network: 0.98,         // Direct isomorphism: V=IR ≡ P=QZ
    population_dynamics: 0.40,
    signal_detection: 0.85,     // Signal processing fundamentals
    market_equilibrium: 0.75,   // Economic flow networks
    wave_propagation: 0.80,     // Transmission lines, wave equations
    recursive_structure: 0.50,  // Ladder networks
    state_machine: 0.60,        // Switching circuits
  },
  evolutionary_biology: {
    equilibrium_seeking: 0.75,  // Fitness optimization
    flow_network: 0.45,         // Gene flow
    population_dynamics: 0.98,  // Direct application
    signal_detection: 0.50,     // Sensory evolution
    market_equilibrium: 0.80,   // Game theory, competition
    wave_propagation: 0.70,     // Epidemic dynamics, species spread
    recursive_structure: 0.65,  // Phylogenetic trees
    state_machine: 0.55,        // Life cycle stages
  },
  signal_stochastic: {
    equilibrium_seeking: 0.65,  // Noise-enhanced optimization
    flow_network: 0.70,         // Signal flow, filtering
    population_dynamics: 0.55,  // Neural population coding
    signal_detection: 0.98,     // Core domain
    market_equilibrium: 0.50,
    wave_propagation: 0.85,     // Wave processing, FFT
    recursive_structure: 0.45,
    state_machine: 0.75,        // Threshold crossings as state changes
  },
  economics: {
    equilibrium_seeking: 0.85,  // Utility maximization
    flow_network: 0.75,         // Trade networks, money flow
    population_dynamics: 0.80,  // Evolutionary game theory
    signal_detection: 0.50,     // Market signals
    market_equilibrium: 0.98,   // Core domain
    wave_propagation: 0.60,     // Information cascades
    recursive_structure: 0.55,  // Option pricing trees
    state_machine: 0.65,        // Market regimes
  },
};

/**
 * Phenomena Transfer Registry
 *
 * Tracks which phenomena successfully transfer between domains.
 * Used to weight lens selection when similar phenomena are needed.
 */
const PHENOMENA_TRANSFER_REGISTRY: Record<string, {
  sourceDomain: string;
  targetDomains: string[];
  phenomenon: string;
  mathematicalBasis: string;
}> = {
  'simulated_annealing': {
    sourceDomain: 'thermodynamics',
    targetDomains: ['equilibrium_seeking', 'population_dynamics'],
    phenomenon: 'Controlled cooling escapes local minima',
    mathematicalBasis: 'Metropolis criterion: P(accept) = exp(-ΔE/kT)'
  },
  'stochastic_resonance': {
    sourceDomain: 'signal_stochastic',
    targetDomains: ['signal_detection', 'equilibrium_seeking'],
    phenomenon: 'Optimal noise enhances detection',
    mathematicalBasis: 'SNR peaks at non-zero noise level'
  },
  'impedance_matching': {
    sourceDomain: 'circuit_systems',
    targetDomains: ['flow_network', 'market_equilibrium'],
    phenomenon: 'Maximum power transfer at matched impedance',
    mathematicalBasis: 'Z_load = Z_source*'
  },
  'fisher_theorem': {
    sourceDomain: 'evolutionary_biology',
    targetDomains: ['population_dynamics', 'equilibrium_seeking'],
    phenomenon: 'Fitness variance drives adaptation rate',
    mathematicalBasis: 'dw̄/dt = Var(w)'
  },
  'nash_equilibrium': {
    sourceDomain: 'economics',
    targetDomains: ['population_dynamics', 'market_equilibrium'],
    phenomenon: 'No player benefits from unilateral deviation',
    mathematicalBasis: 'Best response functions intersect'
  },
  'kirchhoff_conservation': {
    sourceDomain: 'circuit_systems',
    targetDomains: ['flow_network', 'wave_propagation'],
    phenomenon: 'Flow conservation at nodes',
    mathematicalBasis: 'Σ I_in = Σ I_out'
  }
};

// ============================================================================
// Lens Evolution Service
// ============================================================================

export class LensEvolutionService {
  private static instance: LensEvolutionService | null = null;
  private config: EvolutionConfig;
  private fitnessRecords: Map<string, LensFitnessRecord[]> = new Map();
  private lensGenomes: Map<string, LensGenome> = new Map();
  private availableLenses: DomainLens[] = [];

  private constructor(config: Partial<EvolutionConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.loadState();
  }

  static getInstance(config?: Partial<EvolutionConfig>): LensEvolutionService {
    if (!LensEvolutionService.instance) {
      LensEvolutionService.instance = new LensEvolutionService(config);
    }
    return LensEvolutionService.instance;
  }

  // --------------------------------------------------------------------------
  // Lens Registration
  // --------------------------------------------------------------------------

  /**
   * Register available lenses for evolution tracking
   */
  registerLenses(lenses: DomainLens[]): void {
    this.availableLenses = lenses;

    // Initialize genomes for new lenses
    for (const lens of lenses) {
      if (!this.lensGenomes.has(lens.id)) {
        this.lensGenomes.set(lens.id, {
          lensId: lens.id,
          parentIds: [],
          generation: 0,
          mutations: [],
          fitness: 0.5,  // Start neutral
          birthDate: new Date().toISOString(),
        });
      }
    }

    this.saveState();
  }

  // --------------------------------------------------------------------------
  // System Dynamics Analysis
  // --------------------------------------------------------------------------

  /**
   * Analyze code to identify its system dynamics type
   *
   * This goes beyond simple pattern matching to identify the mathematical
   * structure of the code, enabling cross-domain law application.
   */
  analyzeSystemDynamics(code: string): Array<{
    dynamics: SystemDynamicsType;
    confidence: number;
    governingEquations: string[];
    applicablePhenomena: string[];
  }> {
    const codeLower = code.toLowerCase();
    const results: Array<{
      dynamics: SystemDynamicsType;
      confidence: number;
      governingEquations: string[];
      applicablePhenomena: string[];
    }> = [];

    for (const dynamics of SYSTEM_DYNAMICS) {
      let matchCount = 0;
      const totalIndicators = dynamics.indicators.length;

      for (const indicator of dynamics.indicators) {
        // Use word boundary matching for more accuracy
        const regex = new RegExp(`\\b${indicator}`, 'i');
        if (regex.test(codeLower)) {
          matchCount++;
        }
      }

      if (matchCount > 0) {
        const confidence = Math.min(1, matchCount / Math.sqrt(totalIndicators));
        results.push({
          dynamics,
          confidence,
          governingEquations: dynamics.governingEquations,
          applicablePhenomena: dynamics.applicablePhenomena
        });
      }
    }

    // Sort by confidence
    results.sort((a, b) => b.confidence - a.confidence);
    return results;
  }

  /**
   * Find phenomena that can transfer to this code's dynamics
   */
  findTransferablePhenomena(systemDynamicsId: string): Array<{
    phenomenonId: string;
    sourceDomain: string;
    phenomenon: string;
    mathematicalBasis: string;
  }> {
    const applicable: Array<{
      phenomenonId: string;
      sourceDomain: string;
      phenomenon: string;
      mathematicalBasis: string;
    }> = [];

    for (const [phenomenonId, transfer] of Object.entries(PHENOMENA_TRANSFER_REGISTRY)) {
      if (transfer.targetDomains.includes(systemDynamicsId)) {
        applicable.push({
          phenomenonId,
          sourceDomain: transfer.sourceDomain,
          phenomenon: transfer.phenomenon,
          mathematicalBasis: transfer.mathematicalBasis
        });
      }
    }

    return applicable;
  }

  /**
   * Analyze code to identify its primary patterns (legacy compatibility)
   */
  analyzeCodePatterns(code: string): Array<{ pattern: CodePattern; confidence: number }> {
    const dynamics = this.analyzeSystemDynamics(code);
    return dynamics.map(d => ({
      pattern: {
        id: d.dynamics.id,
        name: d.dynamics.name,
        indicators: d.dynamics.indicators,
        description: d.dynamics.description
      },
      confidence: d.confidence
    }));
  }

  /**
   * Get the primary code pattern (legacy compatibility)
   */
  getPrimaryPattern(code: string): CodePattern | null {
    const patterns = this.analyzeCodePatterns(code);
    return patterns.length > 0 ? patterns[0].pattern : null;
  }

  /**
   * Get the primary system dynamics with full scientific context
   */
  getPrimarySystemDynamics(code: string): {
    dynamics: SystemDynamicsType;
    confidence: number;
    transferablePhenomena: Array<{
      phenomenonId: string;
      sourceDomain: string;
      phenomenon: string;
      mathematicalBasis: string;
    }>;
  } | null {
    const dynamics = this.analyzeSystemDynamics(code);
    if (dynamics.length === 0) return null;

    const primary = dynamics[0];
    return {
      dynamics: primary.dynamics,
      confidence: primary.confidence,
      transferablePhenomena: this.findTransferablePhenomena(primary.dynamics.id)
    };
  }

  // --------------------------------------------------------------------------
  // Evolutionary Selection
  // --------------------------------------------------------------------------

  /**
   * Select the best lens for given code using evolutionary fitness
   * and scientific isomorphism analysis
   */
  async selectLens(
    code: string,
    availableLenses: DomainLens[],
    useAgent: boolean = true
  ): Promise<LensSelectionResult> {
    this.availableLenses = availableLenses;

    // 1. Analyze system dynamics (not just patterns)
    const systemDynamics = this.analyzeSystemDynamics(code);
    const primaryDynamics = systemDynamics[0] || null;
    const codePatterns = this.analyzeCodePatterns(code);
    const primaryPattern = codePatterns[0]?.pattern || null;

    // Find transferable phenomena for this code's dynamics
    const transferablePhenomena = primaryDynamics
      ? this.findTransferablePhenomena(primaryDynamics.dynamics.id)
      : [];

    // 2. Calculate lens scores based on:
    //    - Mathematical isomorphism strength (primary factor)
    //    - Historical fitness for this system dynamics type
    //    - Phenomena transfer applicability
    //    - Exploration bonus for less-used lenses
    const lensScores: Array<{ lens: DomainLens; score: number; reasoning: string }> = [];

    for (const lens of availableLenses) {
      let score = 0;
      const reasoningParts: string[] = [];

      // Mathematical isomorphism (primary factor)
      if (primaryDynamics) {
        const isomorphism = LENS_PATTERN_AFFINITY[lens.id]?.[primaryDynamics.dynamics.id] || 0.3;
        score += isomorphism * 0.45;
        if (isomorphism > 0.9) {
          reasoningParts.push(`strong isomorphism: ${(isomorphism * 100).toFixed(0)}%`);
        } else if (isomorphism > 0.7) {
          reasoningParts.push(`good isomorphism: ${(isomorphism * 100).toFixed(0)}%`);
        }
      }

      // Phenomena transfer bonus
      const applicablePhenomena = transferablePhenomena.filter(p => p.sourceDomain === lens.id);
      if (applicablePhenomena.length > 0) {
        const phenomenaBonus = Math.min(0.2, applicablePhenomena.length * 0.08);
        score += phenomenaBonus;
        reasoningParts.push(`${applicablePhenomena.length} transferable phenomena`);
      }

      // Historical fitness
      const historicalFitness = this.getHistoricalFitness(lens.id, primaryPattern?.id);
      if (historicalFitness !== null) {
        score += historicalFitness * 0.25;
        reasoningParts.push(`historical: ${(historicalFitness * 100).toFixed(0)}%`);
      }

      // Exploration bonus (less used = higher bonus)
      const usageCount = this.getLensUsageCount(lens.id);
      const explorationBonus = Math.max(0, 0.1 - (usageCount * 0.005));
      score += explorationBonus;
      if (explorationBonus > 0.03) {
        reasoningParts.push(`exploration: +${(explorationBonus * 100).toFixed(0)}%`);
      }

      // Genome fitness from evolution
      const genome = this.lensGenomes.get(lens.id);
      if (genome) {
        score += genome.fitness * 0.1;
      }

      lensScores.push({
        lens,
        score,
        reasoning: reasoningParts.join(', '),
      });
    }

    // Sort by score
    lensScores.sort((a, b) => b.score - a.score);

    // 3. Optionally use LLM agent for final decision
    if (useAgent && lensScores.length > 1) {
      const agentResult = await this.consultLensSelectorAgent(code, codePatterns, lensScores);
      if (agentResult) {
        return agentResult;
      }
    }

    // 4. Apply selection pressure (probabilistic selection)
    const selectedLens = this.rouletteWheelSelect(lensScores);

    // Build mathematical mapping if we have system dynamics
    let mathematicalMapping: MathematicalMapping | undefined;
    if (primaryDynamics && primaryDynamics.dynamics.governingEquations.length > 0) {
      mathematicalMapping = {
        codeVariable: 'system state',
        physicalAnalog: primaryDynamics.dynamics.name,
        governingLaw: primaryDynamics.dynamics.governingEquations[0],
        domain: selectedLens.lens.domain || selectedLens.lens.id
      };
    }

    return {
      selectedLens: selectedLens.lens,
      confidence: selectedLens.score,
      reasoning: `Selected ${selectedLens.lens.name}: ${selectedLens.reasoning}`,
      alternatives: lensScores.slice(1, 4).map(s => ({ lens: s.lens, score: s.score })),
      // Scientific context
      systemDynamicsType: primaryDynamics?.dynamics.id,
      mathematicalMapping,
      transferablePhenomena: transferablePhenomena.map(p => p.phenomenon)
    };
  }

  /**
   * Roulette wheel selection based on fitness
   */
  private rouletteWheelSelect(
    candidates: Array<{ lens: DomainLens; score: number; reasoning: string }>
  ): { lens: DomainLens; score: number; reasoning: string } {
    // Apply selection pressure
    const pressure = this.config.selectionPressure;
    const adjustedScores = candidates.map(c => ({
      ...c,
      adjustedScore: Math.pow(c.score, 1 + pressure),
    }));

    const totalScore = adjustedScores.reduce((sum, c) => sum + c.adjustedScore, 0);
    let random = Math.random() * totalScore;

    for (const candidate of adjustedScores) {
      random -= candidate.adjustedScore;
      if (random <= 0) {
        return candidate;
      }
    }

    return adjustedScores[0];
  }

  /**
   * Consult LLM agent for intelligent lens selection
   */
  private async consultLensSelectorAgent(
    code: string,
    patterns: Array<{ pattern: CodePattern; confidence: number }>,
    lensScores: Array<{ lens: DomainLens; score: number; reasoning: string }>
  ): Promise<LensSelectionResult | null> {
    const client = createLLMClient();
    if (!client) return null;

    try {
      // Load the selector agent prompt
      const response = await fetch('/system/agents/LensSelectorAgent.md');
      if (!response.ok) return null;
      const agentPrompt = await response.text();

      const messages: Message[] = [
        { role: 'system', content: agentPrompt },
        {
          role: 'user',
          content: `## Code to Analyze

\`\`\`python
${code}
\`\`\`

## Detected Patterns
${patterns.map(p => `- ${p.pattern.name}: ${(p.confidence * 100).toFixed(0)}% confidence`).join('\n')}

## Available Lenses (with current scores)
${lensScores.map(s => `- ${s.lens.name} (${s.lens.id}): score=${s.score.toFixed(2)} - ${s.lens.description}`).join('\n')}

## Task
Analyze this code and select the BEST domain lens for rewriting it.
Consider:
1. The code's core algorithm and mental model
2. Which domain's metaphors would create the most insightful transformation
3. Which lens would produce the most interesting "genetic diversity"

Respond with JSON:
{
  "selectedLensId": "lens_id",
  "confidence": 0.0-1.0,
  "reasoning": "explanation of why this lens is best"
}`,
        },
      ];

      const result = await client.chatDirect(messages);

      // Parse JSON response
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        const selectedLens = lensScores.find(s => s.lens.id === parsed.selectedLensId);
        if (selectedLens) {
          return {
            selectedLens: selectedLens.lens,
            confidence: parsed.confidence,
            reasoning: parsed.reasoning,
            alternatives: lensScores
              .filter(s => s.lens.id !== parsed.selectedLensId)
              .slice(0, 3)
              .map(s => ({ lens: s.lens, score: s.score })),
          };
        }
      }
    } catch (error) {
      console.warn('[LensEvolution] Agent selection failed:', error);
    }

    return null;
  }

  // --------------------------------------------------------------------------
  // Fitness Tracking
  // --------------------------------------------------------------------------

  /**
   * Record the result of a mutation attempt
   */
  recordMutationResult(
    lensId: string,
    code: string,
    success: boolean,
    speedImprovement: number = 0
  ): void {
    const pattern = this.getPrimaryPattern(code);
    const patternId = pattern?.id || 'unknown';

    // Get or create fitness record
    let records = this.fitnessRecords.get(lensId) || [];
    let record = records.find(r => r.codePatternId === patternId);

    if (!record) {
      record = {
        lensId,
        codePatternId: patternId,
        successCount: 0,
        failureCount: 0,
        totalSpeedImprovement: 0,
        avgSpeedImprovement: 0,
        lastUsed: new Date().toISOString(),
        fitness: 0.5,
      };
      records.push(record);
    }

    // Update counts
    if (success) {
      record.successCount++;
      record.totalSpeedImprovement += speedImprovement;
    } else {
      record.failureCount++;
    }

    // Recalculate fitness
    const total = record.successCount + record.failureCount;
    const successRate = record.successCount / total;
    record.avgSpeedImprovement = record.successCount > 0
      ? record.totalSpeedImprovement / record.successCount
      : 0;

    // Fitness = success rate * (1 + speed bonus)
    const speedBonus = Math.min(0.2, record.avgSpeedImprovement / 100);
    record.fitness = successRate * (1 + speedBonus);
    record.lastUsed = new Date().toISOString();

    this.fitnessRecords.set(lensId, records);

    // Update genome fitness
    this.updateGenomeFitness(lensId);

    this.saveState();
  }

  /**
   * Update overall genome fitness
   */
  private updateGenomeFitness(lensId: string): void {
    const records = this.fitnessRecords.get(lensId) || [];
    if (records.length === 0) return;

    const genome = this.lensGenomes.get(lensId);
    if (!genome) return;

    // Weighted average of all pattern fitnesses
    let totalWeight = 0;
    let weightedFitness = 0;

    for (const record of records) {
      const weight = record.successCount + record.failureCount;
      weightedFitness += record.fitness * weight;
      totalWeight += weight;
    }

    if (totalWeight > 0) {
      const newFitness = weightedFitness / totalWeight;
      // Apply learning rate
      genome.fitness = genome.fitness * (1 - this.config.learningRate) +
                       newFitness * this.config.learningRate;
    }
  }

  /**
   * Get historical fitness for a lens-pattern pair
   */
  getHistoricalFitness(lensId: string, patternId?: string): number | null {
    const records = this.fitnessRecords.get(lensId);
    if (!records || records.length === 0) return null;

    if (patternId) {
      const record = records.find(r => r.codePatternId === patternId);
      return record?.fitness || null;
    }

    // Return average fitness across all patterns
    const avgFitness = records.reduce((sum, r) => sum + r.fitness, 0) / records.length;
    return avgFitness;
  }

  /**
   * Get total usage count for a lens
   */
  private getLensUsageCount(lensId: string): number {
    const records = this.fitnessRecords.get(lensId) || [];
    return records.reduce((sum, r) => sum + r.successCount + r.failureCount, 0);
  }

  // --------------------------------------------------------------------------
  // Lens Generation (Crossover & Mutation)
  // --------------------------------------------------------------------------

  /**
   * Generate a new lens by combining successful lenses
   */
  async generateHybridLens(
    parentLenses: DomainLens[],
    targetPattern?: CodePattern
  ): Promise<DomainLens | null> {
    if (parentLenses.length < 2) return null;

    const client = createLLMClient();
    if (!client) return null;

    console.log('[LensEvolution] Generating hybrid lens from:', parentLenses.map(l => l.name));

    try {
      const messages: Message[] = [
        {
          role: 'system',
          content: `You are a creative scientist who generates new mental models by combining existing ones.
Your task is to create a HYBRID domain lens that combines the best aspects of multiple parent lenses.
The new lens should offer a unique perspective that neither parent has alone.

Output ONLY valid markdown with YAML frontmatter in this format:
---
name: [New Lens Name]
id: [lowercase_with_underscores]
domain: [primary domain]
description: [one line description]
parents: [parent1_id, parent2_id]
---

# [Name] Domain Lens

[Content following the same structure as domain lenses]`,
        },
        {
          role: 'user',
          content: `## Parent Lenses to Combine

${parentLenses.map(l => `### ${l.name}\n${l.content}`).join('\n\n---\n\n')}

${targetPattern ? `## Target Pattern\nOptimize the hybrid for: ${targetPattern.name} - ${targetPattern.description}` : ''}

Create a new hybrid lens that combines the strengths of these lenses.
The hybrid should offer unique metaphors and perspectives.`,
        },
      ];

      const result = await client.chatDirect(messages);

      // Parse the generated lens
      const newLens = this.parseLensFromMarkdown(result, parentLenses.map(l => l.id));
      if (newLens) {
        // Save to VFS
        const vfs = getVFS();
        vfs.createDirectory(GENERATED_LENSES_DIR);
        vfs.writeFile(`${GENERATED_LENSES_DIR}/${newLens.id}.md`, result);

        // Register genome
        this.lensGenomes.set(newLens.id, {
          lensId: newLens.id,
          parentIds: parentLenses.map(l => l.id),
          generation: Math.max(...parentLenses.map(l =>
            this.lensGenomes.get(l.id)?.generation || 0
          )) + 1,
          mutations: ['crossover'],
          fitness: 0.5,
          birthDate: new Date().toISOString(),
        });

        this.saveState();
        console.log('[LensEvolution] Generated hybrid lens:', newLens.name);
        return newLens;
      }
    } catch (error) {
      console.error('[LensEvolution] Hybrid generation failed:', error);
    }

    return null;
  }

  /**
   * Mutate an existing lens to create a variant
   */
  async mutateLens(
    parentLens: DomainLens,
    mutationType: 'specialize' | 'generalize' | 'intensify'
  ): Promise<DomainLens | null> {
    const client = createLLMClient();
    if (!client) return null;

    console.log('[LensEvolution] Mutating lens:', parentLens.name, 'type:', mutationType);

    const mutationPrompts = {
      specialize: 'Make the lens MORE SPECIFIC and detailed. Add more concrete metaphors and examples.',
      generalize: 'Make the lens MORE GENERAL and abstract. Broaden its applicability.',
      intensify: 'Make the lens MORE EXTREME in its metaphors. Push the analogies further.',
    };

    try {
      const messages: Message[] = [
        {
          role: 'system',
          content: `You are evolving a domain lens through mutation.
${mutationPrompts[mutationType]}

Output ONLY valid markdown with YAML frontmatter.`,
        },
        {
          role: 'user',
          content: `## Original Lens

${parentLens.content}

## Mutation: ${mutationType.toUpperCase()}

Create a mutated version of this lens. Keep the core domain but evolve it based on the mutation type.`,
        },
      ];

      const result = await client.chatDirect(messages);
      const newLens = this.parseLensFromMarkdown(result, [parentLens.id]);

      if (newLens) {
        // Ensure unique ID
        newLens.id = `${parentLens.id}_${mutationType}_${Date.now()}`;

        // Save to VFS
        const vfs = getVFS();
        vfs.createDirectory(GENERATED_LENSES_DIR);
        vfs.writeFile(`${GENERATED_LENSES_DIR}/${newLens.id}.md`, result);

        // Register genome
        this.lensGenomes.set(newLens.id, {
          lensId: newLens.id,
          parentIds: [parentLens.id],
          generation: (this.lensGenomes.get(parentLens.id)?.generation || 0) + 1,
          mutations: [mutationType],
          fitness: 0.5,
          birthDate: new Date().toISOString(),
        });

        this.saveState();
        return newLens;
      }
    } catch (error) {
      console.error('[LensEvolution] Mutation failed:', error);
    }

    return null;
  }

  /**
   * Parse a lens from markdown content
   */
  private parseLensFromMarkdown(content: string, parentIds: string[]): DomainLens | null {
    try {
      const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
      if (!frontmatterMatch) return null;

      const frontmatter = frontmatterMatch[1];
      const lines = frontmatter.split('\n');

      const lens: Partial<DomainLens> = { content };

      for (const line of lines) {
        const colonIndex = line.indexOf(':');
        if (colonIndex === -1) continue;

        const key = line.substring(0, colonIndex).trim();
        const value = line.substring(colonIndex + 1).trim();

        switch (key) {
          case 'name':
            lens.name = value;
            break;
          case 'id':
            lens.id = value;
            break;
          case 'domain':
            lens.domain = value;
            break;
          case 'description':
            lens.description = value;
            break;
        }
      }

      if (lens.id && lens.name) {
        return lens as DomainLens;
      }
    } catch (error) {
      console.warn('[LensEvolution] Failed to parse lens:', error);
    }
    return null;
  }

  // --------------------------------------------------------------------------
  // Population Management
  // --------------------------------------------------------------------------

  /**
   * Evolve the lens population (call periodically)
   */
  async evolvePopulation(): Promise<{
    generated: DomainLens[];
    culled: string[];
  }> {
    const generated: DomainLens[] = [];
    const culled: string[] = [];

    // 1. Identify elite lenses (always survive)
    const sortedGenomes = Array.from(this.lensGenomes.values())
      .sort((a, b) => b.fitness - a.fitness);

    const elites = sortedGenomes.slice(0, this.config.elitismCount);

    // 2. Cull low-fitness lenses (except base lenses)
    const baseLensIds = ['thermodynamics', 'evolutionary_biology', 'economics', 'circuit_systems', 'signal_stochastic'];
    for (const genome of sortedGenomes) {
      if (genome.fitness < this.config.minFitnessThreshold &&
          !baseLensIds.includes(genome.lensId) &&
          !elites.includes(genome)) {
        this.lensGenomes.delete(genome.lensId);
        this.fitnessRecords.delete(genome.lensId);
        culled.push(genome.lensId);
      }
    }

    // 3. Maybe perform crossover
    if (Math.random() < this.config.crossoverRate && elites.length >= 2) {
      const parent1 = this.availableLenses.find(l => l.id === elites[0].lensId);
      const parent2 = this.availableLenses.find(l => l.id === elites[1].lensId);

      if (parent1 && parent2) {
        const hybrid = await this.generateHybridLens([parent1, parent2]);
        if (hybrid) {
          generated.push(hybrid);
        }
      }
    }

    // 4. Maybe perform mutation
    if (Math.random() < this.config.mutationRate && elites.length > 0) {
      const parentGenome = elites[Math.floor(Math.random() * elites.length)];
      const parentLens = this.availableLenses.find(l => l.id === parentGenome.lensId);

      if (parentLens) {
        const mutationTypes: Array<'specialize' | 'generalize' | 'intensify'> =
          ['specialize', 'generalize', 'intensify'];
        const mutationType = mutationTypes[Math.floor(Math.random() * mutationTypes.length)];

        const mutant = await this.mutateLens(parentLens, mutationType);
        if (mutant) {
          generated.push(mutant);
        }
      }
    }

    // 5. Prune population if too large
    if (this.lensGenomes.size > this.config.populationSize) {
      const toRemove = sortedGenomes
        .slice(this.config.populationSize)
        .filter(g => !baseLensIds.includes(g.lensId));

      for (const genome of toRemove) {
        this.lensGenomes.delete(genome.lensId);
        this.fitnessRecords.delete(genome.lensId);
        culled.push(genome.lensId);
      }
    }

    this.saveState();
    return { generated, culled };
  }

  // --------------------------------------------------------------------------
  // Analytics
  // --------------------------------------------------------------------------

  /**
   * Get fitness leaderboard
   */
  getLeaderboard(): Array<{
    lensId: string;
    fitness: number;
    generation: number;
    usageCount: number;
    successRate: number;
  }> {
    const results: Array<{
      lensId: string;
      fitness: number;
      generation: number;
      usageCount: number;
      successRate: number;
    }> = [];

    for (const [lensId, genome] of this.lensGenomes) {
      const records = this.fitnessRecords.get(lensId) || [];
      const totalSuccess = records.reduce((sum, r) => sum + r.successCount, 0);
      const totalFail = records.reduce((sum, r) => sum + r.failureCount, 0);
      const total = totalSuccess + totalFail;

      results.push({
        lensId,
        fitness: genome.fitness,
        generation: genome.generation,
        usageCount: total,
        successRate: total > 0 ? totalSuccess / total : 0,
      });
    }

    return results.sort((a, b) => b.fitness - a.fitness);
  }

  /**
   * Get pattern-lens affinity matrix
   */
  getAffinityMatrix(): Record<string, Record<string, number>> {
    const matrix: Record<string, Record<string, number>> = {};

    for (const [lensId, records] of this.fitnessRecords) {
      matrix[lensId] = {};
      for (const record of records) {
        matrix[lensId][record.codePatternId] = record.fitness;
      }
    }

    return matrix;
  }

  // --------------------------------------------------------------------------
  // Persistence
  // --------------------------------------------------------------------------

  private saveState(): void {
    if (typeof window === 'undefined') return;

    try {
      const state = {
        fitnessRecords: Array.from(this.fitnessRecords.entries()),
        lensGenomes: Array.from(this.lensGenomes.entries()),
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      console.warn('[LensEvolution] Failed to save state:', error);
    }
  }

  private loadState(): void {
    if (typeof window === 'undefined') return;

    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const state = JSON.parse(saved);
        this.fitnessRecords = new Map(state.fitnessRecords || []);
        this.lensGenomes = new Map(state.lensGenomes || []);
      }
    } catch (error) {
      console.warn('[LensEvolution] Failed to load state:', error);
    }
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

export function getLensEvolutionService(
  config?: Partial<EvolutionConfig>
): LensEvolutionService {
  return LensEvolutionService.getInstance(config);
}

export async function selectBestLens(
  code: string,
  availableLenses: DomainLens[]
): Promise<LensSelectionResult> {
  const service = getLensEvolutionService();
  service.registerLenses(availableLenses);
  return service.selectLens(code, availableLenses);
}

export function recordLensFitness(
  lensId: string,
  code: string,
  success: boolean,
  speedImprovement?: number
): void {
  const service = getLensEvolutionService();
  service.recordMutationResult(lensId, code, success, speedImprovement);
}

/**
 * Analyze the system dynamics of code and return scientific context
 */
export function analyzeCodeDynamics(code: string): {
  primaryDynamics: SystemDynamicsType | null;
  confidence: number;
  governingEquations: string[];
  transferablePhenomena: Array<{
    phenomenonId: string;
    sourceDomain: string;
    phenomenon: string;
    mathematicalBasis: string;
  }>;
} {
  const service = getLensEvolutionService();
  const result = service.getPrimarySystemDynamics(code);

  if (!result) {
    return {
      primaryDynamics: null,
      confidence: 0,
      governingEquations: [],
      transferablePhenomena: []
    };
  }

  return {
    primaryDynamics: result.dynamics,
    confidence: result.confidence,
    governingEquations: result.dynamics.governingEquations,
    transferablePhenomena: result.transferablePhenomena
  };
}

/**
 * Get all available system dynamics types
 */
export function getSystemDynamicsTypes(): SystemDynamicsType[] {
  return SYSTEM_DYNAMICS;
}

/**
 * Get all registered phenomena transfers
 */
export function getPhenomenaTransferRegistry(): typeof PHENOMENA_TRANSFER_REGISTRY {
  return PHENOMENA_TRANSFER_REGISTRY;
}
