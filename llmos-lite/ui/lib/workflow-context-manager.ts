/**
 * WorkflowContextManager
 *
 * Manages workflow context with iterative summarization to handle
 * conversations that exceed LLM context limits.
 *
 * Features:
 * - Configurable token limits and page sizes
 * - Multiple summarization strategies (aggressive, balanced, conservative)
 * - Persistence to VFS for cross-session continuity
 * - Goal-aware summarization that keeps relevant context
 * - Caching to avoid re-processing unchanged content
 */

import { Message } from './llm-client';
import { getVFS } from './virtual-fs';

// ============================================================================
// Configuration Types
// ============================================================================

export type SummarizationStrategy = 'aggressive' | 'balanced' | 'conservative';

export interface ContextManagerConfig {
  /** Maximum tokens before summarization triggers (default: 180000) */
  maxContextTokens: number;
  /** Size of each page for summarization (default: 40000) */
  pageSizeTokens: number;
  /** Tokens per character estimate (default: 0.25) */
  tokensPerChar: number;
  /** Number of recent message pairs to keep in full (default: 4) */
  recentWindowSize: number;
  /** Target size for summaries in words (default: 2000) */
  summaryTargetWords: number;
  /** Summarization strategy (default: 'balanced') */
  strategy: SummarizationStrategy;
  /** Whether to persist history to VFS (default: true) */
  persistToVFS: boolean;
  /** VFS path for persistence (default: 'system/workflow_history') */
  persistencePath: string;
  /** Auto-save interval in ms (0 = disabled, default: 30000) */
  autoSaveIntervalMs: number;
}

export const DEFAULT_CONFIG: ContextManagerConfig = {
  maxContextTokens: 180000,
  pageSizeTokens: 40000,
  tokensPerChar: 0.25,
  recentWindowSize: 4,
  summaryTargetWords: 2000,
  strategy: 'balanced',
  persistToVFS: true,
  persistencePath: 'system/workflow_history',
  autoSaveIntervalMs: 30000,
};

// Strategy-specific configurations
const STRATEGY_CONFIGS: Record<SummarizationStrategy, Partial<ContextManagerConfig>> = {
  aggressive: {
    maxContextTokens: 120000,
    pageSizeTokens: 30000,
    recentWindowSize: 2,
    summaryTargetWords: 1000,
  },
  balanced: {
    maxContextTokens: 180000,
    pageSizeTokens: 40000,
    recentWindowSize: 4,
    summaryTargetWords: 2000,
  },
  conservative: {
    maxContextTokens: 190000,
    pageSizeTokens: 50000,
    recentWindowSize: 6,
    summaryTargetWords: 3000,
  },
};

// ============================================================================
// Workflow Entry Types
// ============================================================================

export interface WorkflowEntry {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  type: 'system-prompt' | 'user-goal' | 'llm-response' | 'tool-result' | 'context-note' | 'evolution-note';
  metadata?: {
    toolName?: string;
    toolId?: string;
    iterationNumber?: number;
    summarized?: boolean;
    filesCreated?: string[];
    learnings?: string[];
  };
}

export interface SummarizationResult {
  summary: string;
  tokenCount: number;
  entriesProcessed: number;
  timestamp: number;
  strategy: SummarizationStrategy;
}

export interface ContextBuildResult {
  messages: Message[];
  tokenEstimate: number;
  wasSummarized: boolean;
  summarizationSteps?: number;
  strategy?: SummarizationStrategy;
}

export interface WorkflowSnapshot {
  id: string;
  userGoal: string;
  systemPrompt: string;
  entries: WorkflowEntry[];
  cachedSummary: SummarizationResult | null;
  config: ContextManagerConfig;
  createdAt: number;
  updatedAt: number;
  stats: {
    totalEntries: number;
    totalTokens: number;
    filesCreated: string[];
    toolsUsed: string[];
  };
}

type LLMSummarizer = (prompt: string) => Promise<string>;
type ProgressCallback = (step: string, details: string) => void;

// ============================================================================
// Utility Functions
// ============================================================================

function estimateTokens(text: string, tokensPerChar: number): number {
  return Math.ceil(text.length * tokensPerChar);
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// ============================================================================
// WorkflowContextManager Class
// ============================================================================

export class WorkflowContextManager {
  private fullHistory: WorkflowEntry[] = [];
  private cachedSummary: SummarizationResult | null = null;
  private lastSummarizedIndex: number = -1;
  private userGoal: string = '';
  private systemPrompt: string = '';
  private config: ContextManagerConfig;
  private workflowId: string = '';
  private autoSaveTimer: NodeJS.Timeout | null = null;
  private isDirty: boolean = false;

  constructor(config: Partial<ContextManagerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Apply strategy-specific overrides
    if (config.strategy && STRATEGY_CONFIGS[config.strategy]) {
      this.config = {
        ...this.config,
        ...STRATEGY_CONFIGS[config.strategy],
        ...config // User overrides take precedence
      };
    }
  }

  // ==========================================================================
  // Configuration
  // ==========================================================================

  /**
   * Update configuration
   */
  updateConfig(config: Partial<ContextManagerConfig>): void {
    this.config = { ...this.config, ...config };

    // Restart auto-save if interval changed
    if (config.autoSaveIntervalMs !== undefined) {
      this.stopAutoSave();
      if (config.autoSaveIntervalMs > 0) {
        this.startAutoSave();
      }
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): ContextManagerConfig {
    return { ...this.config };
  }

  /**
   * Set summarization strategy
   */
  setStrategy(strategy: SummarizationStrategy): void {
    this.config = {
      ...this.config,
      ...STRATEGY_CONFIGS[strategy],
      strategy,
    };
  }

  // ==========================================================================
  // Initialization
  // ==========================================================================

  /**
   * Initialize with system prompt and user goal
   */
  initialize(systemPrompt: string, userGoal: string): void {
    this.systemPrompt = systemPrompt;
    this.userGoal = userGoal;
    this.fullHistory = [];
    this.cachedSummary = null;
    this.lastSummarizedIndex = -1;
    this.workflowId = generateId();
    this.isDirty = true;

    // Add system prompt entry
    this.addEntry({
      role: 'system',
      content: systemPrompt,
      type: 'system-prompt',
    });

    // Add user goal entry
    this.addEntry({
      role: 'user',
      content: userGoal,
      type: 'user-goal',
    });

    // Start auto-save if enabled
    if (this.config.autoSaveIntervalMs > 0 && this.config.persistToVFS) {
      this.startAutoSave();
    }
  }

  // ==========================================================================
  // Entry Management
  // ==========================================================================

  /**
   * Add an entry to the workflow history
   */
  addEntry(entry: Omit<WorkflowEntry, 'id' | 'timestamp'>): void {
    this.fullHistory.push({
      ...entry,
      id: `entry-${generateId()}`,
      timestamp: Date.now(),
    });
    this.isDirty = true;
  }

  /**
   * Add LLM response to history
   */
  addLLMResponse(content: string, iterationNumber: number): void {
    this.addEntry({
      role: 'assistant',
      content,
      type: 'llm-response',
      metadata: { iterationNumber },
    });
  }

  /**
   * Add tool result to history
   */
  addToolResult(toolName: string, toolId: string, result: string): void {
    this.addEntry({
      role: 'user',
      content: `Tool execution result for ${toolName}:\n${result}`,
      type: 'tool-result',
      metadata: { toolName, toolId },
    });
  }

  /**
   * Add evolution note (for tracking learnings)
   */
  addEvolutionNote(learnings: string[], filesCreated?: string[]): void {
    this.addEntry({
      role: 'system',
      content: `Evolution checkpoint:\nLearnings: ${learnings.join(', ')}\nFiles: ${filesCreated?.join(', ') || 'none'}`,
      type: 'evolution-note',
      metadata: { learnings, filesCreated },
    });
  }

  // ==========================================================================
  // Token Estimation
  // ==========================================================================

  /**
   * Get the current total token estimate
   */
  getTotalTokenEstimate(): number {
    return this.fullHistory.reduce((total, entry) => {
      return total + estimateTokens(entry.content, this.config.tokensPerChar);
    }, 0);
  }

  /**
   * Check if summarization is needed
   */
  needsSummarization(): boolean {
    return this.getTotalTokenEstimate() > this.config.maxContextTokens;
  }

  // ==========================================================================
  // Context Building
  // ==========================================================================

  /**
   * Build context for LLM, with iterative summarization if needed
   */
  async buildContext(
    currentStep: string,
    llmSummarizer: LLMSummarizer,
    onProgress?: ProgressCallback
  ): Promise<ContextBuildResult> {
    const totalTokens = this.getTotalTokenEstimate();

    // If within limits, return full history as messages
    if (totalTokens <= this.config.maxContextTokens) {
      return {
        messages: this.historyToMessages(),
        tokenEstimate: totalTokens,
        wasSummarized: false,
      };
    }

    onProgress?.('context-analysis', `Context exceeds limit (${Math.round(totalTokens / 1000)}K tokens), initiating ${this.config.strategy} summarization...`);

    // Perform iterative summarization
    const summarized = await this.iterativeSummarize(
      currentStep,
      llmSummarizer,
      onProgress
    );

    return summarized;
  }

  /**
   * Iterative summarization: paginate and summarize in sequence
   */
  private async iterativeSummarize(
    currentStep: string,
    llmSummarizer: LLMSummarizer,
    onProgress?: ProgressCallback
  ): Promise<ContextBuildResult> {
    const systemPromptEntry = this.fullHistory.find(e => e.type === 'system-prompt');
    const userGoalEntry = this.fullHistory.find(e => e.type === 'user-goal');
    const workflowEntries = this.fullHistory.filter(
      e => e.type !== 'system-prompt' && e.type !== 'user-goal'
    );

    // Keep recent entries in full
    const windowSize = this.config.recentWindowSize * 2;
    const recentEntries = workflowEntries.slice(-windowSize);
    const entriesToSummarize = workflowEntries.slice(0, -windowSize);

    // If nothing to summarize, return with recent window
    if (entriesToSummarize.length === 0) {
      const messages = this.buildMessagesFromEntries([
        systemPromptEntry!,
        userGoalEntry!,
        ...recentEntries,
      ]);
      return {
        messages,
        tokenEstimate: this.estimateMessagesTokens(messages),
        wasSummarized: false,
      };
    }

    // Check cached summary
    if (this.cachedSummary && this.lastSummarizedIndex >= entriesToSummarize.length - 1) {
      onProgress?.('cache-hit', 'Using cached summary for earlier context');

      const messages = this.buildContextWithSummary(
        systemPromptEntry!,
        userGoalEntry!,
        this.cachedSummary.summary,
        recentEntries
      );

      return {
        messages,
        tokenEstimate: this.estimateMessagesTokens(messages),
        wasSummarized: true,
        summarizationSteps: 0,
        strategy: this.config.strategy,
      };
    }

    // Paginate and summarize
    const pages = this.paginateEntries(entriesToSummarize);
    onProgress?.('pagination', `Split into ${pages.length} pages (${this.config.strategy} strategy)`);

    let currentSummary = '';
    let summarizationSteps = 0;

    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      const pageContent = this.entriesToText(page);

      onProgress?.('summarizing', `Processing page ${i + 1}/${pages.length}...`);

      if (i === 0) {
        currentSummary = await this.summarizePage(pageContent, currentStep, llmSummarizer);
      } else {
        currentSummary = await this.summarizeWithContext(
          currentSummary,
          pageContent,
          currentStep,
          llmSummarizer
        );
      }

      summarizationSteps++;
    }

    // Cache the summary
    this.cachedSummary = {
      summary: currentSummary,
      tokenCount: estimateTokens(currentSummary, this.config.tokensPerChar),
      entriesProcessed: entriesToSummarize.length,
      timestamp: Date.now(),
      strategy: this.config.strategy,
    };
    this.lastSummarizedIndex = entriesToSummarize.length - 1;
    this.isDirty = true;

    onProgress?.('complete', `Summarization complete (${summarizationSteps} steps, ${this.config.strategy})`);

    const messages = this.buildContextWithSummary(
      systemPromptEntry!,
      userGoalEntry!,
      currentSummary,
      recentEntries
    );

    return {
      messages,
      tokenEstimate: this.estimateMessagesTokens(messages),
      wasSummarized: true,
      summarizationSteps,
      strategy: this.config.strategy,
    };
  }

  // ==========================================================================
  // Summarization Helpers
  // ==========================================================================

  private paginateEntries(entries: WorkflowEntry[]): WorkflowEntry[][] {
    const pages: WorkflowEntry[][] = [];
    let currentPage: WorkflowEntry[] = [];
    let currentPageTokens = 0;

    for (const entry of entries) {
      const entryTokens = estimateTokens(entry.content, this.config.tokensPerChar);

      if (currentPageTokens + entryTokens > this.config.pageSizeTokens && currentPage.length > 0) {
        pages.push(currentPage);
        currentPage = [];
        currentPageTokens = 0;
      }

      currentPage.push(entry);
      currentPageTokens += entryTokens;
    }

    if (currentPage.length > 0) {
      pages.push(currentPage);
    }

    return pages;
  }

  private entriesToText(entries: WorkflowEntry[]): string {
    return entries.map(entry => {
      const roleLabel = entry.role === 'assistant' ? 'Agent' : 'System/Tool';
      const typeLabel = entry.type === 'tool-result'
        ? `[Tool: ${entry.metadata?.toolName || 'unknown'}]`
        : `[${entry.type}]`;

      return `--- ${roleLabel} ${typeLabel} ---\n${entry.content}`;
    }).join('\n\n');
  }

  private async summarizePage(
    pageContent: string,
    currentStep: string,
    llmSummarizer: LLMSummarizer
  ): Promise<string> {
    const prompt = this.buildSummarizationPrompt(pageContent, currentStep, null);
    return await llmSummarizer(prompt);
  }

  private async summarizeWithContext(
    previousSummary: string,
    pageContent: string,
    currentStep: string,
    llmSummarizer: LLMSummarizer
  ): Promise<string> {
    const prompt = this.buildSummarizationPrompt(pageContent, currentStep, previousSummary);
    return await llmSummarizer(prompt);
  }

  private buildSummarizationPrompt(
    content: string,
    currentStep: string,
    previousSummary: string | null
  ): string {
    const goalContext = `Original Goal: ${this.userGoal}\nCurrent Step: ${currentStep}`;
    const targetWords = this.config.summaryTargetWords;

    // Strategy-specific instructions
    const strategyInstructions = {
      aggressive: 'Be VERY concise. Only keep critical information. Omit all details that are not essential.',
      balanced: 'Balance detail with brevity. Keep important context while removing redundancy.',
      conservative: 'Preserve more context. Keep detailed information about decisions and learnings.',
    }[this.config.strategy];

    if (previousSummary) {
      return `You are summarizing workflow context for an AI agent.

${goalContext}

STRATEGY: ${this.config.strategy.toUpperCase()}
${strategyInstructions}

PREVIOUS CONTEXT SUMMARY:
${previousSummary}

NEW CONTENT TO INCORPORATE:
${content}

TASK: Create an updated summary that:
1. Preserves key information from the previous summary
2. Incorporates relevant new information
3. Prioritizes details relevant to the current step and goal
4. Keeps track of: files created, key decisions made, errors encountered, progress status
5. Removes redundant or superseded information

Target length: ~${targetWords} words.
Focus on WHAT was done, WHAT was learned, and WHAT is relevant for next steps.

UPDATED SUMMARY:`;
    } else {
      return `You are summarizing workflow context for an AI agent.

${goalContext}

STRATEGY: ${this.config.strategy.toUpperCase()}
${strategyInstructions}

CONTENT TO SUMMARIZE:
${content}

TASK: Create a summary that:
1. Captures the key actions taken and their results
2. Preserves important context relevant to the goal
3. Notes any files created, errors encountered, or important decisions
4. Prioritizes information relevant to the current step

Target length: ~${targetWords} words.
Focus on WHAT was done, WHAT was learned, and WHAT is relevant for next steps.

SUMMARY:`;
    }
  }

  // ==========================================================================
  // Message Building
  // ==========================================================================

  private buildContextWithSummary(
    systemPromptEntry: WorkflowEntry,
    userGoalEntry: WorkflowEntry,
    summary: string,
    recentEntries: WorkflowEntry[]
  ): Message[] {
    const messages: Message[] = [];

    messages.push({ role: 'system', content: systemPromptEntry.content });
    messages.push({ role: 'user', content: userGoalEntry.content });
    messages.push({
      role: 'user',
      content: `[WORKFLOW CONTEXT SUMMARY - ${this.config.strategy.toUpperCase()} MODE]\nThe following is a summary of earlier workflow steps:\n\n${summary}\n\n[END SUMMARY]\n\nContinue from where the workflow left off.`,
    });

    for (const entry of recentEntries) {
      messages.push({ role: entry.role, content: entry.content });
    }

    return messages;
  }

  private buildMessagesFromEntries(entries: WorkflowEntry[]): Message[] {
    return entries.map(entry => ({ role: entry.role, content: entry.content }));
  }

  private historyToMessages(): Message[] {
    return this.fullHistory.map(entry => ({ role: entry.role, content: entry.content }));
  }

  private estimateMessagesTokens(messages: Message[]): number {
    return messages.reduce((total, msg) => {
      const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
      return total + estimateTokens(content, this.config.tokensPerChar);
    }, 0);
  }

  // ==========================================================================
  // Persistence
  // ==========================================================================

  /**
   * Save workflow history to VFS
   */
  async save(): Promise<boolean> {
    if (!this.config.persistToVFS) return false;

    try {
      const vfs = getVFS();
      const snapshot = this.createSnapshot();
      const path = `${this.config.persistencePath}/${this.workflowId}.json`;

      vfs.writeFile(path, JSON.stringify(snapshot, null, 2));
      this.isDirty = false;

      console.log(`[WorkflowContextManager] Saved to ${path}`);
      return true;
    } catch (error) {
      console.error('[WorkflowContextManager] Save failed:', error);
      return false;
    }
  }

  /**
   * Load workflow history from VFS
   */
  async load(workflowId: string): Promise<boolean> {
    try {
      const vfs = getVFS();
      const path = `${this.config.persistencePath}/${workflowId}.json`;
      const content = vfs.readFileContent(path);

      if (!content) return false;

      const snapshot: WorkflowSnapshot = JSON.parse(content);
      this.restoreFromSnapshot(snapshot);

      console.log(`[WorkflowContextManager] Loaded from ${path}`);
      return true;
    } catch (error) {
      console.error('[WorkflowContextManager] Load failed:', error);
      return false;
    }
  }

  /**
   * List all saved workflows
   */
  listSavedWorkflows(): string[] {
    try {
      const vfs = getVFS();
      const result = vfs.listDirectory(this.config.persistencePath);

      if (!result) return [];

      return result.files
        .filter((f: string) => f.endsWith('.json'))
        .map((f: string) => f.replace('.json', ''));
    } catch {
      return [];
    }
  }

  /**
   * Create a snapshot of current state
   */
  createSnapshot(): WorkflowSnapshot {
    const filesCreated: string[] = [];
    const toolsUsed = new Set<string>();

    for (const entry of this.fullHistory) {
      if (entry.metadata?.filesCreated) {
        filesCreated.push(...entry.metadata.filesCreated);
      }
      if (entry.metadata?.toolName) {
        toolsUsed.add(entry.metadata.toolName);
      }
    }

    return {
      id: this.workflowId,
      userGoal: this.userGoal,
      systemPrompt: this.systemPrompt,
      entries: this.fullHistory,
      cachedSummary: this.cachedSummary,
      config: this.config,
      createdAt: this.fullHistory[0]?.timestamp || Date.now(),
      updatedAt: Date.now(),
      stats: {
        totalEntries: this.fullHistory.length,
        totalTokens: this.getTotalTokenEstimate(),
        filesCreated,
        toolsUsed: Array.from(toolsUsed),
      },
    };
  }

  /**
   * Restore from a snapshot
   */
  restoreFromSnapshot(snapshot: WorkflowSnapshot): void {
    this.workflowId = snapshot.id;
    this.userGoal = snapshot.userGoal;
    this.systemPrompt = snapshot.systemPrompt;
    this.fullHistory = snapshot.entries;
    this.cachedSummary = snapshot.cachedSummary;
    this.config = { ...DEFAULT_CONFIG, ...snapshot.config };
    this.isDirty = false;
  }

  /**
   * Start auto-save timer
   */
  private startAutoSave(): void {
    if (this.autoSaveTimer) return;

    this.autoSaveTimer = setInterval(() => {
      if (this.isDirty) {
        this.save();
      }
    }, this.config.autoSaveIntervalMs);
  }

  /**
   * Stop auto-save timer
   */
  private stopAutoSave(): void {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
  }

  // ==========================================================================
  // Statistics & Export
  // ==========================================================================

  /**
   * Get statistics about the current context
   */
  getStats(): {
    totalEntries: number;
    totalTokens: number;
    hasCachedSummary: boolean;
    cachedSummaryTokens: number;
    strategy: SummarizationStrategy;
    workflowId: string;
    isDirty: boolean;
  } {
    return {
      totalEntries: this.fullHistory.length,
      totalTokens: this.getTotalTokenEstimate(),
      hasCachedSummary: this.cachedSummary !== null,
      cachedSummaryTokens: this.cachedSummary?.tokenCount || 0,
      strategy: this.config.strategy,
      workflowId: this.workflowId,
      isDirty: this.isDirty,
    };
  }

  /**
   * Get full history (for export/analysis)
   */
  getFullHistory(): WorkflowEntry[] {
    return [...this.fullHistory];
  }

  /**
   * Extract learnings from workflow
   */
  extractLearnings(): {
    filesCreated: string[];
    toolsUsed: string[];
    iterations: number;
    errors: string[];
    successfulPatterns: string[];
  } {
    const filesCreated: string[] = [];
    const toolsUsed = new Set<string>();
    const errors: string[] = [];
    let iterations = 0;

    for (const entry of this.fullHistory) {
      if (entry.metadata?.filesCreated) {
        filesCreated.push(...entry.metadata.filesCreated);
      }
      if (entry.metadata?.toolName) {
        toolsUsed.add(entry.metadata.toolName);
      }
      if (entry.metadata?.iterationNumber) {
        iterations = Math.max(iterations, entry.metadata.iterationNumber);
      }
      if (entry.content.includes('Error:') || entry.content.includes('error:')) {
        const match = entry.content.match(/Error:.*?(?=\n|$)/i);
        if (match) errors.push(match[0]);
      }
    }

    return {
      filesCreated,
      toolsUsed: Array.from(toolsUsed),
      iterations,
      errors,
      successfulPatterns: [], // Would need LLM analysis
    };
  }

  /**
   * Clear all history and cache
   */
  clear(): void {
    this.stopAutoSave();
    this.fullHistory = [];
    this.cachedSummary = null;
    this.lastSummarizedIndex = -1;
    this.userGoal = '';
    this.systemPrompt = '';
    this.workflowId = '';
    this.isDirty = false;
  }

  /**
   * Get workflow ID
   */
  getWorkflowId(): string {
    return this.workflowId;
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a new WorkflowContextManager with default config
 */
export function createWorkflowContextManager(
  config?: Partial<ContextManagerConfig>
): WorkflowContextManager {
  return new WorkflowContextManager(config);
}

/**
 * Create a manager with aggressive summarization (for very long workflows)
 */
export function createAggressiveContextManager(): WorkflowContextManager {
  return new WorkflowContextManager({ strategy: 'aggressive' });
}

/**
 * Create a manager with conservative summarization (preserve more context)
 */
export function createConservativeContextManager(): WorkflowContextManager {
  return new WorkflowContextManager({ strategy: 'conservative' });
}
