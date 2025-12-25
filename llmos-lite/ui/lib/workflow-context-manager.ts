/**
 * WorkflowContextManager
 *
 * Manages workflow context with iterative summarization to handle
 * conversations that exceed LLM context limits.
 *
 * Strategy:
 * 1. Keep full workflow history in memory (never sent directly to LLM)
 * 2. When context exceeds limit, paginate and iteratively summarize
 * 3. Summarization is goal-aware: keeps what's relevant to current step
 * 4. Cache summaries to avoid re-processing unchanged content
 */

import { Message } from './llm-client';

// Configuration
const MAX_CONTEXT_TOKENS = 180000; // Leave buffer below 200K limit
const PAGE_SIZE_TOKENS = 40000; // Size of each page for summarization
const TOKENS_PER_CHAR = 0.25; // Rough estimate: ~4 chars per token
const RECENT_WINDOW_SIZE = 4; // Always keep last N message pairs in full
const SUMMARY_TARGET_TOKENS = 8000; // Target size for each summary

export interface WorkflowEntry {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  type: 'system-prompt' | 'user-goal' | 'llm-response' | 'tool-result' | 'context-note';
  metadata?: {
    toolName?: string;
    toolId?: string;
    iterationNumber?: number;
    summarized?: boolean;
  };
}

export interface SummarizationResult {
  summary: string;
  tokenCount: number;
  entriesProcessed: number;
  timestamp: number;
}

export interface ContextBuildResult {
  messages: Message[];
  tokenEstimate: number;
  wasSummarized: boolean;
  summarizationSteps?: number;
}

type LLMSummarizer = (prompt: string) => Promise<string>;
type ProgressCallback = (step: string, details: string) => void;

/**
 * Estimate token count for text
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length * TOKENS_PER_CHAR);
}

/**
 * WorkflowContextManager class
 */
export class WorkflowContextManager {
  private fullHistory: WorkflowEntry[] = [];
  private cachedSummary: SummarizationResult | null = null;
  private lastSummarizedIndex: number = -1;
  private userGoal: string = '';
  private systemPrompt: string = '';

  constructor() {}

  /**
   * Initialize with system prompt and user goal
   */
  initialize(systemPrompt: string, userGoal: string): void {
    this.systemPrompt = systemPrompt;
    this.userGoal = userGoal;
    this.fullHistory = [];
    this.cachedSummary = null;
    this.lastSummarizedIndex = -1;

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
  }

  /**
   * Add an entry to the workflow history
   */
  addEntry(entry: Omit<WorkflowEntry, 'id' | 'timestamp'>): void {
    this.fullHistory.push({
      ...entry,
      id: `entry-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
    });
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
   * Get the current total token estimate
   */
  getTotalTokenEstimate(): number {
    return this.fullHistory.reduce((total, entry) => {
      return total + estimateTokens(entry.content);
    }, 0);
  }

  /**
   * Check if summarization is needed
   */
  needsSummarization(): boolean {
    return this.getTotalTokenEstimate() > MAX_CONTEXT_TOKENS;
  }

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
    if (totalTokens <= MAX_CONTEXT_TOKENS) {
      return {
        messages: this.historyToMessages(),
        tokenEstimate: totalTokens,
        wasSummarized: false,
      };
    }

    onProgress?.('context-analysis', `Context exceeds limit (${Math.round(totalTokens / 1000)}K tokens), initiating summarization...`);

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
   * page1 + page2 → summary1
   * summary1 + page3 → summary2
   * ... until all pages processed
   */
  private async iterativeSummarize(
    currentStep: string,
    llmSummarizer: LLMSummarizer,
    onProgress?: ProgressCallback
  ): Promise<ContextBuildResult> {
    // Separate entries into different categories
    const systemPromptEntry = this.fullHistory.find(e => e.type === 'system-prompt');
    const userGoalEntry = this.fullHistory.find(e => e.type === 'user-goal');
    const workflowEntries = this.fullHistory.filter(
      e => e.type !== 'system-prompt' && e.type !== 'user-goal'
    );

    // Keep recent entries in full (last N message pairs)
    const recentEntries = workflowEntries.slice(-RECENT_WINDOW_SIZE * 2);
    const entriesToSummarize = workflowEntries.slice(0, -RECENT_WINDOW_SIZE * 2);

    // If nothing to summarize, just return with recent window
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

    // Check if we can use cached summary
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
      };
    }

    // Paginate entries for summarization
    const pages = this.paginateEntries(entriesToSummarize);
    onProgress?.('pagination', `Split context into ${pages.length} pages for summarization`);

    // Iterative summarization
    let currentSummary = '';
    let summarizationSteps = 0;

    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      const pageContent = this.entriesToText(page);

      if (i === 0) {
        // First page: summarize directly
        onProgress?.('summarizing', `Processing page 1/${pages.length}...`);
        currentSummary = await this.summarizePage(
          pageContent,
          currentStep,
          llmSummarizer
        );
      } else {
        // Subsequent pages: combine previous summary with current page
        onProgress?.('summarizing', `Processing page ${i + 1}/${pages.length}...`);
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
      tokenCount: estimateTokens(currentSummary),
      entriesProcessed: entriesToSummarize.length,
      timestamp: Date.now(),
    };
    this.lastSummarizedIndex = entriesToSummarize.length - 1;

    onProgress?.('complete', `Summarization complete (${summarizationSteps} steps)`);

    // Build final context
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
    };
  }

  /**
   * Paginate entries into chunks based on token size
   */
  private paginateEntries(entries: WorkflowEntry[]): WorkflowEntry[][] {
    const pages: WorkflowEntry[][] = [];
    let currentPage: WorkflowEntry[] = [];
    let currentPageTokens = 0;

    for (const entry of entries) {
      const entryTokens = estimateTokens(entry.content);

      if (currentPageTokens + entryTokens > PAGE_SIZE_TOKENS && currentPage.length > 0) {
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

  /**
   * Convert entries to readable text for summarization
   */
  private entriesToText(entries: WorkflowEntry[]): string {
    return entries.map(entry => {
      const roleLabel = entry.role === 'assistant' ? 'Agent' : 'System/Tool';
      const typeLabel = entry.type === 'tool-result'
        ? `[Tool: ${entry.metadata?.toolName || 'unknown'}]`
        : `[${entry.type}]`;

      return `--- ${roleLabel} ${typeLabel} ---\n${entry.content}`;
    }).join('\n\n');
  }

  /**
   * Summarize a single page of content
   */
  private async summarizePage(
    pageContent: string,
    currentStep: string,
    llmSummarizer: LLMSummarizer
  ): Promise<string> {
    const prompt = this.buildSummarizationPrompt(pageContent, currentStep, null);
    return await llmSummarizer(prompt);
  }

  /**
   * Summarize by combining previous summary with new page
   */
  private async summarizeWithContext(
    previousSummary: string,
    pageContent: string,
    currentStep: string,
    llmSummarizer: LLMSummarizer
  ): Promise<string> {
    const prompt = this.buildSummarizationPrompt(pageContent, currentStep, previousSummary);
    return await llmSummarizer(prompt);
  }

  /**
   * Build the summarization prompt
   */
  private buildSummarizationPrompt(
    content: string,
    currentStep: string,
    previousSummary: string | null
  ): string {
    const goalContext = `Original Goal: ${this.userGoal}\nCurrent Step: ${currentStep}`;

    if (previousSummary) {
      return `You are summarizing workflow context for an AI agent.

${goalContext}

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

Keep the summary concise but comprehensive. Target length: ~2000 words.
Focus on WHAT was done, WHAT was learned, and WHAT is relevant for next steps.

UPDATED SUMMARY:`;
    } else {
      return `You are summarizing workflow context for an AI agent.

${goalContext}

CONTENT TO SUMMARIZE:
${content}

TASK: Create a summary that:
1. Captures the key actions taken and their results
2. Preserves important context relevant to the goal
3. Notes any files created, errors encountered, or important decisions
4. Prioritizes information relevant to the current step

Keep the summary concise but comprehensive. Target length: ~2000 words.
Focus on WHAT was done, WHAT was learned, and WHAT is relevant for next steps.

SUMMARY:`;
    }
  }

  /**
   * Build messages array with summary included
   */
  private buildContextWithSummary(
    systemPromptEntry: WorkflowEntry,
    userGoalEntry: WorkflowEntry,
    summary: string,
    recentEntries: WorkflowEntry[]
  ): Message[] {
    const messages: Message[] = [];

    // System prompt
    messages.push({
      role: 'system',
      content: systemPromptEntry.content,
    });

    // User goal
    messages.push({
      role: 'user',
      content: userGoalEntry.content,
    });

    // Summary of earlier context
    messages.push({
      role: 'user',
      content: `[WORKFLOW CONTEXT SUMMARY]\nThe following is a summary of earlier workflow steps:\n\n${summary}\n\n[END SUMMARY]\n\nContinue from where the workflow left off.`,
    });

    // Recent entries in full
    for (const entry of recentEntries) {
      messages.push({
        role: entry.role,
        content: entry.content,
      });
    }

    return messages;
  }

  /**
   * Convert entries to messages
   */
  private buildMessagesFromEntries(entries: WorkflowEntry[]): Message[] {
    return entries.map(entry => ({
      role: entry.role,
      content: entry.content,
    }));
  }

  /**
   * Convert full history to messages (no summarization)
   */
  private historyToMessages(): Message[] {
    return this.fullHistory.map(entry => ({
      role: entry.role,
      content: entry.content,
    }));
  }

  /**
   * Estimate tokens for a messages array
   */
  private estimateMessagesTokens(messages: Message[]): number {
    return messages.reduce((total, msg) => {
      const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
      return total + estimateTokens(content);
    }, 0);
  }

  /**
   * Get statistics about the current context
   */
  getStats(): {
    totalEntries: number;
    totalTokens: number;
    hasCachedSummary: boolean;
    cachedSummaryTokens: number;
  } {
    return {
      totalEntries: this.fullHistory.length,
      totalTokens: this.getTotalTokenEstimate(),
      hasCachedSummary: this.cachedSummary !== null,
      cachedSummaryTokens: this.cachedSummary?.tokenCount || 0,
    };
  }

  /**
   * Clear all history and cache
   */
  clear(): void {
    this.fullHistory = [];
    this.cachedSummary = null;
    this.lastSummarizedIndex = -1;
    this.userGoal = '';
    this.systemPrompt = '';
  }
}

/**
 * Create a new WorkflowContextManager instance
 */
export function createWorkflowContextManager(): WorkflowContextManager {
  return new WorkflowContextManager();
}
