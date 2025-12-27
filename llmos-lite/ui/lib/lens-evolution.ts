/**
 * Lens Evolution Service
 *
 * Evolutionary system for domain lens selection and generation.
 * Tracks fitness of lens-code pairings, learns which lenses work
 * best for different code patterns, and can generate new lenses
 * through combination and mutation.
 *
 * Core concepts:
 * - Fitness: Success rate + speed improvement + code pattern match
 * - Selection: Probabilistic based on fitness (roulette wheel)
 * - Crossover: Combine successful lenses to create hybrids
 * - Mutation: Modify lens parameters based on learnings
 */

import { getVFS } from './virtual-fs';
import { createLLMClient, Message } from './llm-client';
import { DomainLens } from './mutation-engine';

// ============================================================================
// Types
// ============================================================================

export interface CodePattern {
  id: string;
  name: string;
  indicators: string[];  // Code patterns that identify this type
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

// Predefined code patterns for classification
const CODE_PATTERNS: CodePattern[] = [
  {
    id: 'sorting',
    name: 'Sorting & Ordering',
    indicators: ['sort', 'bubble', 'quick', 'merge', 'heap', 'swap', 'compare', 'order'],
    description: 'Algorithms that arrange elements in a specific order',
  },
  {
    id: 'searching',
    name: 'Searching & Finding',
    indicators: ['search', 'find', 'binary', 'linear', 'lookup', 'index', 'contains'],
    description: 'Algorithms that locate specific elements or values',
  },
  {
    id: 'aggregation',
    name: 'Aggregation & Reduction',
    indicators: ['sum', 'total', 'count', 'average', 'mean', 'reduce', 'accumulate', 'aggregate'],
    description: 'Operations that combine multiple values into one',
  },
  {
    id: 'filtering',
    name: 'Filtering & Selection',
    indicators: ['filter', 'select', 'where', 'remove', 'exclude', 'include', 'positive', 'negative'],
    description: 'Operations that select subsets based on criteria',
  },
  {
    id: 'transformation',
    name: 'Transformation & Mapping',
    indicators: ['map', 'transform', 'convert', 'apply', 'process', 'modify'],
    description: 'Operations that transform each element',
  },
  {
    id: 'optimization',
    name: 'Optimization & Extrema',
    indicators: ['max', 'min', 'optimal', 'best', 'worst', 'extreme', 'peak', 'valley'],
    description: 'Finding optimal values or configurations',
  },
  {
    id: 'graph',
    name: 'Graph & Tree Operations',
    indicators: ['graph', 'tree', 'node', 'edge', 'path', 'traverse', 'dfs', 'bfs', 'visit'],
    description: 'Operations on graph or tree structures',
  },
  {
    id: 'recursive',
    name: 'Recursive & Divide-Conquer',
    indicators: ['recursive', 'recurse', 'divide', 'conquer', 'split', 'combine', 'base case'],
    description: 'Self-referential or divide-and-conquer patterns',
  },
];

// Lens affinity matrix: which lenses work well for which patterns
const LENS_PATTERN_AFFINITY: Record<string, Record<string, number>> = {
  thermodynamics: {
    sorting: 0.9,        // Crystallization = sorting
    optimization: 0.95,  // Energy minimization
    searching: 0.6,
    aggregation: 0.5,
    filtering: 0.4,
    transformation: 0.5,
    graph: 0.7,          // Diffusion on graphs
    recursive: 0.6,
  },
  evolutionary_biology: {
    sorting: 0.7,        // Survival of fittest
    optimization: 0.85,  // Natural selection
    searching: 0.6,      // Foraging
    filtering: 0.9,      // Natural selection
    aggregation: 0.5,
    transformation: 0.7, // Mutation
    graph: 0.6,          // Phylogenetic trees
    recursive: 0.7,      // Generations
  },
  economics: {
    sorting: 0.6,        // Price ranking
    optimization: 0.8,   // Cost minimization
    searching: 0.7,      // Arbitrage
    filtering: 0.6,
    aggregation: 0.95,   // Portfolio value
    transformation: 0.6,
    graph: 0.5,
    recursive: 0.5,
  },
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
  // Code Analysis
  // --------------------------------------------------------------------------

  /**
   * Analyze code to identify its primary patterns
   */
  analyzeCodePatterns(code: string): Array<{ pattern: CodePattern; confidence: number }> {
    const codeLower = code.toLowerCase();
    const results: Array<{ pattern: CodePattern; confidence: number }> = [];

    for (const pattern of CODE_PATTERNS) {
      let matchCount = 0;
      let totalIndicators = pattern.indicators.length;

      for (const indicator of pattern.indicators) {
        if (codeLower.includes(indicator)) {
          matchCount++;
        }
      }

      if (matchCount > 0) {
        const confidence = matchCount / totalIndicators;
        results.push({ pattern, confidence });
      }
    }

    // Sort by confidence
    results.sort((a, b) => b.confidence - a.confidence);
    return results;
  }

  /**
   * Get the primary code pattern
   */
  getPrimaryPattern(code: string): CodePattern | null {
    const patterns = this.analyzeCodePatterns(code);
    return patterns.length > 0 ? patterns[0].pattern : null;
  }

  // --------------------------------------------------------------------------
  // Evolutionary Selection
  // --------------------------------------------------------------------------

  /**
   * Select the best lens for given code using evolutionary fitness
   */
  async selectLens(
    code: string,
    availableLenses: DomainLens[],
    useAgent: boolean = true
  ): Promise<LensSelectionResult> {
    this.availableLenses = availableLenses;

    // 1. Analyze code patterns
    const codePatterns = this.analyzeCodePatterns(code);
    const primaryPattern = codePatterns[0]?.pattern || null;

    // 2. Calculate lens scores based on:
    //    - Historical fitness for this code pattern
    //    - Prior affinity (domain knowledge)
    //    - Exploration bonus for less-used lenses
    const lensScores: Array<{ lens: DomainLens; score: number; reasoning: string }> = [];

    for (const lens of availableLenses) {
      let score = 0;
      const reasoningParts: string[] = [];

      // Historical fitness
      const historicalFitness = this.getHistoricalFitness(lens.id, primaryPattern?.id);
      if (historicalFitness !== null) {
        score += historicalFitness * 0.4;
        reasoningParts.push(`historical fitness: ${(historicalFitness * 100).toFixed(0)}%`);
      }

      // Prior affinity
      if (primaryPattern) {
        const affinity = LENS_PATTERN_AFFINITY[lens.id]?.[primaryPattern.id] || 0.5;
        score += affinity * 0.4;
        reasoningParts.push(`pattern affinity: ${(affinity * 100).toFixed(0)}%`);
      }

      // Exploration bonus (less used = higher bonus)
      const usageCount = this.getLensUsageCount(lens.id);
      const explorationBonus = Math.max(0, 0.2 - (usageCount * 0.01));
      score += explorationBonus;
      if (explorationBonus > 0.05) {
        reasoningParts.push(`exploration bonus: ${(explorationBonus * 100).toFixed(0)}%`);
      }

      // Genome fitness from evolution
      const genome = this.lensGenomes.get(lens.id);
      if (genome) {
        score += genome.fitness * 0.2;
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

    return {
      selectedLens: selectedLens.lens,
      confidence: selectedLens.score,
      reasoning: `Selected ${selectedLens.lens.name}: ${selectedLens.reasoning}`,
      alternatives: lensScores.slice(1, 4).map(s => ({ lens: s.lens, score: s.score })),
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
    const baseLensIds = ['thermodynamics', 'evolutionary_biology', 'economics'];
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
