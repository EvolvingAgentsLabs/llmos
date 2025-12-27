/**
 * Mutation Engine - Divergent Exploration System
 *
 * Background process that takes existing Python skills and rewrites them
 * using cross-domain analogies (e.g., thermodynamics, evolutionary biology).
 * Creates "Mutant" variants that are functionally equivalent but use
 * different mental models, giving the system genetic diversity.
 *
 * Features:
 * - Evolutionary lens selection based on fitness tracking
 * - Intelligent lens matching via LensSelectorAgent
 * - Lens population evolution (crossover, mutation, culling)
 * - Background execution via requestIdleCallback
 */

import { getVFS, VFSFile } from './virtual-fs';
import { createLLMClient, LLMClient, Message } from './llm-client';
import { executePython, ExecutionResult } from './pyodide-runtime';
import {
  getLensEvolutionService,
  LensEvolutionService,
  LensSelectionResult,
  CodePattern,
} from './lens-evolution';

// ============================================================================
// Types
// ============================================================================

export interface DomainLens {
  id: string;
  name: string;
  domain: string;
  description: string;
  content: string;
}

export interface MutationCandidate {
  path: string;
  name: string;
  code: string;
  lastModified: string;
}

export interface MutationResult {
  success: boolean;
  originalPath: string;
  mutantPath?: string;
  domainLens: string;
  originalTime: number;
  mutantTime: number;
  speedImprovement?: number;
  error?: string;
  timestamp: string;
  // Evolutionary selection info
  selectionConfidence?: number;
  selectionReasoning?: string;
  codePatterns?: string[];
  alternativeLenses?: string[];
}

export interface MutationEngineConfig {
  enabled: boolean;
  intervalMs: number;
  maxMutationsPerRun: number;
  testInputs: any[];
  minStabilityScore: number;
  skillsDirectory: string;
  domainsDirectory: string;
  // Evolutionary selection options
  useEvolutionarySelection: boolean;
  useAgentSelection: boolean;
  evolvePopulationEvery: number;  // Evolve lens population every N cycles
  trackFitness: boolean;
}

export interface MutationEngineStatus {
  isRunning: boolean;
  lastRun: Date | null;
  nextRun: Date | null;
  totalMutationsGenerated: number;
  totalMutationsSuccessful: number;
  lastResult?: MutationResult;
  lastError?: string;
  // Evolutionary stats
  cycleCount: number;
  lensPopulationSize: number;
  topLenses: Array<{ id: string; fitness: number }>;
  lastEvolution?: {
    generated: string[];
    culled: string[];
    timestamp: string;
  };
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_CONFIG: MutationEngineConfig = {
  enabled: true,
  intervalMs: 5 * 60 * 1000, // 5 minutes
  maxMutationsPerRun: 3,
  testInputs: [
    [],
    [1],
    [3, 1, 4, 1, 5, 9, 2, 6],
    [10, 9, 8, 7, 6, 5, 4, 3, 2, 1],
    [-5, 0, 5, -10, 10],
    [1.5, 2.5, 0.5, 3.5],
    ['a', 'c', 'b', 'd'],
  ],
  minStabilityScore: 0.8,
  skillsDirectory: 'system/skills',
  domainsDirectory: '/system/domains',
  // Evolutionary options - enabled by default
  useEvolutionarySelection: true,
  useAgentSelection: true,
  evolvePopulationEvery: 10,  // Evolve population every 10 cycles
  trackFitness: true,
};

const STORAGE_KEY = 'mutation_engine_state';
const MUTATION_AGENT_PATH = '/system/agents/MutationAgent.md';

// ============================================================================
// Mutation Engine Class
// ============================================================================

export class MutationEngine {
  private static instance: MutationEngine | null = null;
  private config: MutationEngineConfig;
  private status: MutationEngineStatus;
  private idleCallbackId: number | null = null;
  private intervalId: ReturnType<typeof setTimeout> | null = null;
  private domainLenses: DomainLens[] = [];
  private mutationAgentPrompt: string = '';
  private lensEvolution: LensEvolutionService;

  private constructor(config: Partial<MutationEngineConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.status = this.loadStatus();
    this.lensEvolution = getLensEvolutionService();
  }

  static getInstance(config?: Partial<MutationEngineConfig>): MutationEngine {
    if (!MutationEngine.instance) {
      MutationEngine.instance = new MutationEngine(config);
    }
    return MutationEngine.instance;
  }

  // --------------------------------------------------------------------------
  // Lifecycle
  // --------------------------------------------------------------------------

  /**
   * Start the mutation engine background process
   */
  async start(): Promise<void> {
    if (this.status.isRunning) {
      console.log('[MutationEngine] Already running');
      return;
    }

    console.log('[MutationEngine] Starting background mutation process...');

    // Load domain lenses and mutation agent prompt
    await this.loadResources();

    // Schedule periodic runs
    this.scheduleNextRun();

    console.log('[MutationEngine] Started successfully');
  }

  /**
   * Stop the mutation engine
   */
  stop(): void {
    if (this.idleCallbackId !== null) {
      if (typeof cancelIdleCallback !== 'undefined') {
        cancelIdleCallback(this.idleCallbackId);
      }
      this.idleCallbackId = null;
    }

    if (this.intervalId !== null) {
      clearTimeout(this.intervalId);
      this.intervalId = null;
    }

    this.status.isRunning = false;
    this.saveStatus();
    console.log('[MutationEngine] Stopped');
  }

  /**
   * Get current status
   */
  getStatus(): MutationEngineStatus {
    return { ...this.status };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<MutationEngineConfig>): void {
    this.config = { ...this.config, ...config };
  }

  // --------------------------------------------------------------------------
  // Resource Loading
  // --------------------------------------------------------------------------

  /**
   * Load domain lenses from public directory
   */
  private async loadResources(): Promise<void> {
    // Load domain lenses
    const domainFiles = [
      'thermodynamics.md',
      'evolutionary_biology.md',
      'economics.md',
      'quantum_computing.md',  // Quantum OS API primitives
    ];
    this.domainLenses = [];

    for (const file of domainFiles) {
      try {
        const response = await fetch(`${this.config.domainsDirectory}/${file}`);
        if (response.ok) {
          const content = await response.text();
          const lens = this.parseDomainLens(content, file);
          if (lens) {
            this.domainLenses.push(lens);
          }
        }
      } catch (error) {
        console.warn(`[MutationEngine] Failed to load domain lens ${file}:`, error);
      }
    }

    console.log(`[MutationEngine] Loaded ${this.domainLenses.length} domain lenses`);

    // Also load generated lenses from VFS
    await this.loadGeneratedLenses();

    // Register lenses with evolution service
    if (this.config.useEvolutionarySelection) {
      this.lensEvolution.registerLenses(this.domainLenses);
      console.log('[MutationEngine] Registered lenses with evolution service');
    }

    // Load mutation agent prompt
    try {
      const response = await fetch(MUTATION_AGENT_PATH);
      if (response.ok) {
        this.mutationAgentPrompt = await response.text();
        console.log('[MutationEngine] Loaded MutationAgent prompt');
      }
    } catch (error) {
      console.warn('[MutationEngine] Failed to load MutationAgent prompt:', error);
    }
  }

  /**
   * Parse a domain lens from markdown content
   */
  private parseDomainLens(content: string, filename: string): DomainLens | null {
    try {
      // Parse YAML frontmatter
      const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
      if (!frontmatterMatch) return null;

      const frontmatter = frontmatterMatch[1];
      const lines = frontmatter.split('\n');

      const lens: Partial<DomainLens> = { content };

      for (const line of lines) {
        const [key, ...valueParts] = line.split(':');
        const value = valueParts.join(':').trim();
        if (key && value) {
          switch (key.trim()) {
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
      }

      if (lens.id && lens.name) {
        return lens as DomainLens;
      }
    } catch (error) {
      console.warn(`[MutationEngine] Failed to parse domain lens ${filename}:`, error);
    }
    return null;
  }

  /**
   * Load generated lenses from VFS (created by evolution)
   */
  private async loadGeneratedLenses(): Promise<void> {
    const vfs = getVFS();
    const generatedDir = 'system/domains/generated';

    try {
      const dir = vfs.listDirectory(generatedDir);
      for (const file of dir.files) {
        if (file.path.endsWith('.md')) {
          const lens = this.parseDomainLens(file.content, file.path);
          if (lens && !this.domainLenses.find(l => l.id === lens.id)) {
            this.domainLenses.push(lens);
            console.log(`[MutationEngine] Loaded generated lens: ${lens.name}`);
          }
        }
      }
    } catch {
      // Directory may not exist yet
    }
  }

  // --------------------------------------------------------------------------
  // Scheduling
  // --------------------------------------------------------------------------

  /**
   * Schedule the next mutation run
   */
  private scheduleNextRun(): void {
    if (!this.config.enabled) return;

    // Use requestIdleCallback for non-blocking execution
    const runWhenIdle = () => {
      if (typeof requestIdleCallback !== 'undefined') {
        this.idleCallbackId = requestIdleCallback(
          async (deadline) => {
            // Only run if we have at least 50ms of idle time
            if (deadline.timeRemaining() > 50 || deadline.didTimeout) {
              await this.runMutationCycle();
            }
            // Schedule next run
            this.intervalId = setTimeout(runWhenIdle, this.config.intervalMs);
          },
          { timeout: this.config.intervalMs }
        );
      } else {
        // Fallback for browsers without requestIdleCallback
        setTimeout(async () => {
          await this.runMutationCycle();
          this.intervalId = setTimeout(runWhenIdle, this.config.intervalMs);
        }, 0);
      }
    };

    // Initial delay before first run (30 seconds)
    this.intervalId = setTimeout(runWhenIdle, 30000);
    this.status.nextRun = new Date(Date.now() + 30000);
    this.saveStatus();
  }

  // --------------------------------------------------------------------------
  // Core Mutation Logic
  // --------------------------------------------------------------------------

  /**
   * Run a single mutation cycle with evolutionary lens selection
   */
  async runMutationCycle(): Promise<MutationResult[]> {
    if (this.status.isRunning) {
      console.log('[MutationEngine] Already running a cycle, skipping');
      return [];
    }

    this.status.isRunning = true;
    this.status.lastRun = new Date();
    this.status.cycleCount = (this.status.cycleCount || 0) + 1;
    this.saveStatus();

    const results: MutationResult[] = [];

    try {
      console.log(`[MutationEngine] Starting mutation cycle #${this.status.cycleCount}...`);

      // 1. Select candidate skills
      const candidates = await this.selectCandidates();
      if (candidates.length === 0) {
        console.log('[MutationEngine] No suitable candidates found');
        return results;
      }

      console.log(`[MutationEngine] Found ${candidates.length} candidates`);

      // 2. Process candidates (up to max per run)
      const toProcess = candidates.slice(0, this.config.maxMutationsPerRun);

      for (const candidate of toProcess) {
        try {
          // Select lens using evolutionary strategy
          const lensSelection = await this.selectLensForCode(candidate.code);
          const lens = lensSelection.selectedLens;

          console.log(`[MutationEngine] Selected lens: ${lens.name} (confidence: ${(lensSelection.confidence * 100).toFixed(0)}%)`);
          console.log(`[MutationEngine] Reasoning: ${lensSelection.reasoning}`);

          // Mutate with selected lens
          const result = await this.mutateSkillWithSelection(candidate, lens, lensSelection);
          results.push(result);

          // Track fitness if enabled
          if (this.config.trackFitness) {
            this.lensEvolution.recordMutationResult(
              lens.id,
              candidate.code,
              result.success,
              result.speedImprovement || 0
            );
          }

          if (result.success) {
            this.status.totalMutationsSuccessful++;
          }
          this.status.totalMutationsGenerated++;
          this.status.lastResult = result;
        } catch (error: any) {
          console.error(`[MutationEngine] Failed to mutate ${candidate.name}:`, error);
          results.push({
            success: false,
            originalPath: candidate.path,
            domainLens: 'unknown',
            originalTime: 0,
            mutantTime: 0,
            error: error.message,
            timestamp: new Date().toISOString(),
          });
        }
      }

      // 3. Maybe evolve the lens population
      if (this.config.useEvolutionarySelection &&
          this.status.cycleCount % this.config.evolvePopulationEvery === 0) {
        await this.evolveLensPopulation();
      }

      // 4. Update status with evolution stats
      this.updateEvolutionStats();

    } catch (error: any) {
      console.error('[MutationEngine] Mutation cycle failed:', error);
      this.status.lastError = error.message;
    } finally {
      this.status.isRunning = false;
      this.status.nextRun = new Date(Date.now() + this.config.intervalMs);
      this.saveStatus();
    }

    return results;
  }

  /**
   * Select the best lens for given code using evolutionary strategy
   */
  private async selectLensForCode(code: string): Promise<LensSelectionResult> {
    if (this.config.useEvolutionarySelection && this.domainLenses.length > 0) {
      return this.lensEvolution.selectLens(
        code,
        this.domainLenses,
        this.config.useAgentSelection
      );
    }

    // Fallback to random selection
    const lens = this.selectRandomLens();
    if (!lens) {
      throw new Error('No domain lenses available');
    }

    return {
      selectedLens: lens,
      confidence: 0.5,
      reasoning: 'Random selection (evolutionary selection disabled)',
      alternatives: [],
    };
  }

  /**
   * Evolve the lens population (crossover, mutation, culling)
   */
  private async evolveLensPopulation(): Promise<void> {
    console.log('[MutationEngine] Evolving lens population...');

    try {
      const result = await this.lensEvolution.evolvePopulation();

      if (result.generated.length > 0 || result.culled.length > 0) {
        console.log(`[MutationEngine] Evolution: +${result.generated.length} generated, -${result.culled.length} culled`);

        this.status.lastEvolution = {
          generated: result.generated.map(l => l.id),
          culled: result.culled,
          timestamp: new Date().toISOString(),
        };

        // Reload lenses to include newly generated ones
        await this.loadGeneratedLenses();
        this.lensEvolution.registerLenses(this.domainLenses);
      }
    } catch (error) {
      console.error('[MutationEngine] Lens evolution failed:', error);
    }
  }

  /**
   * Update status with evolution statistics
   */
  private updateEvolutionStats(): void {
    const leaderboard = this.lensEvolution.getLeaderboard();

    this.status.lensPopulationSize = leaderboard.length;
    this.status.topLenses = leaderboard
      .slice(0, 5)
      .map(l => ({ id: l.lensId, fitness: l.fitness }));
  }

  /**
   * Select candidate skills for mutation
   */
  private async selectCandidates(): Promise<MutationCandidate[]> {
    const vfs = getVFS();
    const candidates: MutationCandidate[] = [];

    // Look for Python files in skills directory
    const skillsDir = vfs.listDirectory(this.config.skillsDirectory);

    for (const file of skillsDir.files) {
      if (file.path.endsWith('.py')) {
        candidates.push({
          path: file.path,
          name: file.path.split('/').pop() || file.path,
          code: file.content,
          lastModified: file.modified,
        });
      }
    }

    // Also check project skills
    const projectsDir = vfs.listDirectory('projects');
    for (const dir of projectsDir.directories) {
      try {
        const projectSkills = vfs.listDirectory(`${dir}/components/skills`);
        for (const file of projectSkills.files) {
          if (file.path.endsWith('.py')) {
            candidates.push({
              path: file.path,
              name: file.path.split('/').pop() || file.path,
              code: file.content,
              lastModified: file.modified,
            });
          }
        }
      } catch {
        // Directory may not exist
      }
    }

    // Filter out already-mutated files (contain _variant in name)
    return candidates.filter((c) => !c.name.includes('_variant'));
  }

  /**
   * Select a random domain lens
   */
  private selectRandomLens(): DomainLens | null {
    if (this.domainLenses.length === 0) return null;
    const index = Math.floor(Math.random() * this.domainLenses.length);
    return this.domainLenses[index];
  }

  /**
   * Mutate a skill using a domain lens (legacy method)
   */
  private async mutateSkill(
    candidate: MutationCandidate,
    lens: DomainLens
  ): Promise<MutationResult> {
    return this.mutateSkillWithSelection(candidate, lens, {
      selectedLens: lens,
      confidence: 0.5,
      reasoning: 'Direct selection',
      alternatives: [],
    });
  }

  /**
   * Mutate a skill using a domain lens with selection info
   */
  private async mutateSkillWithSelection(
    candidate: MutationCandidate,
    lens: DomainLens,
    selection: LensSelectionResult
  ): Promise<MutationResult> {
    const timestamp = new Date().toISOString();

    console.log(`[MutationEngine] Mutating ${candidate.name} with ${lens.name} lens`);

    // Analyze code patterns for the result
    const patterns = this.lensEvolution.analyzeCodePatterns(candidate.code);
    const codePatterns = patterns.map(p => p.pattern.name);

    // 1. Generate mutant code using LLM
    const mutantCode = await this.generateMutant(candidate.code, lens);
    if (!mutantCode) {
      return {
        success: false,
        originalPath: candidate.path,
        domainLens: lens.id,
        originalTime: 0,
        mutantTime: 0,
        error: 'Failed to generate mutant code',
        timestamp,
        selectionConfidence: selection.confidence,
        selectionReasoning: selection.reasoning,
        codePatterns,
        alternativeLenses: selection.alternatives.map(a => a.lens.id),
      };
    }

    // 2. Validate mutant in the arena
    const validation = await this.validateMutant(candidate.code, mutantCode);
    if (!validation.valid) {
      return {
        success: false,
        originalPath: candidate.path,
        domainLens: lens.id,
        originalTime: validation.originalTime,
        mutantTime: validation.mutantTime,
        error: validation.error,
        timestamp,
        selectionConfidence: selection.confidence,
        selectionReasoning: selection.reasoning,
        codePatterns,
        alternativeLenses: selection.alternatives.map(a => a.lens.id),
      };
    }

    // 3. Save the valid mutant
    const mutantPath = this.generateMutantPath(candidate.path, lens.id);
    const vfs = getVFS();
    vfs.writeFile(mutantPath, mutantCode);

    console.log(`[MutationEngine] Saved mutant to ${mutantPath}`);

    // Calculate speed improvement
    const speedImprovement =
      validation.originalTime > 0
        ? ((validation.originalTime - validation.mutantTime) / validation.originalTime) * 100
        : 0;

    return {
      success: true,
      originalPath: candidate.path,
      mutantPath,
      domainLens: lens.id,
      originalTime: validation.originalTime,
      mutantTime: validation.mutantTime,
      speedImprovement,
      timestamp,
      selectionConfidence: selection.confidence,
      selectionReasoning: selection.reasoning,
      codePatterns,
      alternativeLenses: selection.alternatives.map(a => a.lens.id),
    };
  }

  /**
   * Generate mutant code using the MutationAgent via LLM
   */
  private async generateMutant(originalCode: string, lens: DomainLens): Promise<string | null> {
    const client = createLLMClient();
    if (!client) {
      console.error('[MutationEngine] No LLM client available');
      return null;
    }

    const messages: Message[] = [
      {
        role: 'system',
        content: this.mutationAgentPrompt,
      },
      {
        role: 'user',
        content: `## Domain Lens: ${lens.name}

${lens.content}

---

## Original Python Code to Transform

\`\`\`python
${originalCode}
\`\`\`

---

Please rewrite this code using the ${lens.name} domain lens. Remember:
1. Function signatures must be EXACTLY preserved
2. Output must be functionally identical for all inputs
3. Use the domain's vocabulary and mental model
4. Include a docstring explaining the domain perspective
5. Output ONLY the Python code block, no other text`,
      },
    ];

    try {
      const response = await client.chatDirect(messages);

      // Extract Python code from response
      const codeMatch = response.match(/```python\n([\s\S]*?)```/);
      if (codeMatch) {
        return codeMatch[1].trim();
      }

      // If no code block, try to use the whole response if it looks like Python
      if (response.includes('def ') && !response.includes('```')) {
        return response.trim();
      }

      console.warn('[MutationEngine] Could not extract Python code from response');
      return null;
    } catch (error) {
      console.error('[MutationEngine] LLM call failed:', error);
      return null;
    }
  }

  /**
   * Validate that mutant produces identical output to original
   */
  private async validateMutant(
    originalCode: string,
    mutantCode: string
  ): Promise<{
    valid: boolean;
    originalTime: number;
    mutantTime: number;
    error?: string;
  }> {
    // Extract function name from the original code
    const funcMatch = originalCode.match(/def\s+(\w+)\s*\(/);
    if (!funcMatch) {
      return {
        valid: false,
        originalTime: 0,
        mutantTime: 0,
        error: 'Could not find function definition in original code',
      };
    }
    const funcName = funcMatch[1];

    // Verify mutant has the same function name
    if (!mutantCode.includes(`def ${funcName}(`)) {
      return {
        valid: false,
        originalTime: 0,
        mutantTime: 0,
        error: `Mutant does not contain function ${funcName}`,
      };
    }

    let totalOriginalTime = 0;
    let totalMutantTime = 0;

    // Test with multiple inputs
    for (const testInput of this.config.testInputs) {
      const testCode = `
import json
import copy

# Test input
test_input = ${JSON.stringify(testInput)}

# Make copies for each test
input_for_original = copy.deepcopy(test_input)
input_for_mutant = copy.deepcopy(test_input)
`;

      // Run original
      const originalTestCode = `
${testCode}
${originalCode}

result = ${funcName}(input_for_original)
json.dumps(result if result is not None else "None")
`;

      const originalResult = await executePython(originalTestCode, { timeout: 10000 });
      if (!originalResult.success) {
        return {
          valid: false,
          originalTime: originalResult.executionTime,
          mutantTime: 0,
          error: `Original code failed: ${originalResult.error}`,
        };
      }
      totalOriginalTime += originalResult.executionTime;

      // Run mutant
      const mutantTestCode = `
${testCode}
${mutantCode}

result = ${funcName}(input_for_mutant)
json.dumps(result if result is not None else "None")
`;

      const mutantResult = await executePython(mutantTestCode, { timeout: 10000 });
      if (!mutantResult.success) {
        return {
          valid: false,
          originalTime: totalOriginalTime,
          mutantTime: mutantResult.executionTime,
          error: `Mutant code failed: ${mutantResult.error}`,
        };
      }
      totalMutantTime += mutantResult.executionTime;

      // Compare outputs
      const originalOutput = JSON.stringify(originalResult.output);
      const mutantOutput = JSON.stringify(mutantResult.output);

      if (originalOutput !== mutantOutput) {
        return {
          valid: false,
          originalTime: totalOriginalTime,
          mutantTime: totalMutantTime,
          error: `Output mismatch for input ${JSON.stringify(testInput)}: original=${originalOutput}, mutant=${mutantOutput}`,
        };
      }
    }

    return {
      valid: true,
      originalTime: totalOriginalTime,
      mutantTime: totalMutantTime,
    };
  }

  /**
   * Generate the path for a mutant file
   */
  private generateMutantPath(originalPath: string, domainId: string): string {
    const parts = originalPath.split('/');
    const filename = parts.pop() || '';
    const nameWithoutExt = filename.replace('.py', '');
    const newFilename = `${nameWithoutExt}_${domainId}_variant.py`;
    return [...parts, newFilename].join('/');
  }

  // --------------------------------------------------------------------------
  // Persistence
  // --------------------------------------------------------------------------

  /**
   * Save status to localStorage
   */
  private saveStatus(): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.status));
    } catch (error) {
      console.warn('[MutationEngine] Failed to save status:', error);
    }
  }

  /**
   * Load status from localStorage
   */
  private loadStatus(): MutationEngineStatus {
    if (typeof window === 'undefined') {
      return this.getDefaultStatus();
    }
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          ...this.getDefaultStatus(),
          ...parsed,
          lastRun: parsed.lastRun ? new Date(parsed.lastRun) : null,
          nextRun: parsed.nextRun ? new Date(parsed.nextRun) : null,
        };
      }
    } catch (error) {
      console.warn('[MutationEngine] Failed to load status:', error);
    }
    return this.getDefaultStatus();
  }

  /**
   * Get default status object
   */
  private getDefaultStatus(): MutationEngineStatus {
    return {
      isRunning: false,
      lastRun: null,
      nextRun: null,
      totalMutationsGenerated: 0,
      totalMutationsSuccessful: 0,
      cycleCount: 0,
      lensPopulationSize: 3,  // Start with 3 base lenses
      topLenses: [],
    };
  }

  // --------------------------------------------------------------------------
  // Manual Triggers
  // --------------------------------------------------------------------------

  /**
   * Manually trigger a mutation for a specific skill and lens
   */
  async mutateNow(
    skillPath: string,
    domainLensId?: string
  ): Promise<MutationResult> {
    const vfs = getVFS();
    const file = vfs.readFile(skillPath);

    if (!file) {
      throw new Error(`Skill not found: ${skillPath}`);
    }

    // Load resources if not already loaded
    if (this.domainLenses.length === 0) {
      await this.loadResources();
    }

    const candidate: MutationCandidate = {
      path: skillPath,
      name: skillPath.split('/').pop() || skillPath,
      code: file.content,
      lastModified: file.modified,
    };

    // Select lens - either specified or evolutionary selection
    let selection: LensSelectionResult;

    if (domainLensId) {
      const lens = this.domainLenses.find((l) => l.id === domainLensId);
      if (!lens) {
        throw new Error(`Domain lens not found: ${domainLensId}`);
      }
      selection = {
        selectedLens: lens,
        confidence: 1.0,
        reasoning: 'Manually specified lens',
        alternatives: [],
      };
    } else {
      // Use evolutionary selection
      selection = await this.selectLensForCode(candidate.code);
    }

    const result = await this.mutateSkillWithSelection(candidate, selection.selectedLens, selection);

    // Track fitness if enabled
    if (this.config.trackFitness) {
      this.lensEvolution.recordMutationResult(
        selection.selectedLens.id,
        candidate.code,
        result.success,
        result.speedImprovement || 0
      );
    }

    return result;
  }

  /**
   * Get available domain lenses
   */
  async getAvailableLenses(): Promise<DomainLens[]> {
    if (this.domainLenses.length === 0) {
      await this.loadResources();
    }
    return [...this.domainLenses];
  }

  /**
   * Get the lens evolution service
   */
  getLensEvolution(): LensEvolutionService {
    return this.lensEvolution;
  }

  /**
   * Get lens fitness leaderboard
   */
  getLensLeaderboard(): Array<{
    lensId: string;
    fitness: number;
    generation: number;
    usageCount: number;
    successRate: number;
  }> {
    return this.lensEvolution.getLeaderboard();
  }

  /**
   * Get the affinity matrix (lens vs code pattern fitness)
   */
  getAffinityMatrix(): Record<string, Record<string, number>> {
    return this.lensEvolution.getAffinityMatrix();
  }

  /**
   * Manually trigger lens population evolution
   */
  async evolveLensesNow(): Promise<{
    generated: DomainLens[];
    culled: string[];
  }> {
    await this.evolveLensPopulation();
    const result = await this.lensEvolution.evolvePopulation();
    return result;
  }

  /**
   * Analyze code patterns without mutating
   */
  analyzeCode(code: string): Array<{ pattern: string; confidence: number }> {
    const patterns = this.lensEvolution.analyzeCodePatterns(code);
    return patterns.map(p => ({
      pattern: p.pattern.name,
      confidence: p.confidence,
    }));
  }

  /**
   * Get lens recommendation for code without mutating
   */
  async recommendLens(code: string): Promise<{
    recommendedLens: string;
    confidence: number;
    reasoning: string;
    patterns: string[];
    alternatives: Array<{ lens: string; score: number }>;
  }> {
    if (this.domainLenses.length === 0) {
      await this.loadResources();
    }

    const selection = await this.selectLensForCode(code);
    const patterns = this.lensEvolution.analyzeCodePatterns(code);

    return {
      recommendedLens: selection.selectedLens.id,
      confidence: selection.confidence,
      reasoning: selection.reasoning,
      patterns: patterns.map(p => p.pattern.name),
      alternatives: selection.alternatives.map(a => ({
        lens: a.lens.id,
        score: a.score,
      })),
    };
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Get the singleton mutation engine instance
 */
export function getMutationEngine(
  config?: Partial<MutationEngineConfig>
): MutationEngine {
  return MutationEngine.getInstance(config);
}

/**
 * Start the mutation engine
 */
export async function startMutationEngine(): Promise<void> {
  const engine = getMutationEngine();
  await engine.start();
}

/**
 * Stop the mutation engine
 */
export function stopMutationEngine(): void {
  const engine = getMutationEngine();
  engine.stop();
}

/**
 * Manually trigger a mutation
 */
export async function triggerMutation(
  skillPath: string,
  domainLensId?: string
): Promise<MutationResult> {
  const engine = getMutationEngine();
  return engine.mutateNow(skillPath, domainLensId);
}
