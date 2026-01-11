/**
 * Speculative Executor
 *
 * Executes high-probability options speculatively to reduce wait times
 */

import {
  SpeculativeExecution,
  SpeculativeResult,
  SpeculativeStatus,
  ProposedSolution,
  ChatEvent,
  ChatEventHandler,
} from '@/lib/chat/types';
import { createLLMClient } from '@/lib/llm-client';

export interface SpeculativeExecutorConfig {
  probabilityThreshold: number;
  maxTokens: number;
  maxConcurrent: number;
  checkpointInterval: number;
  timeoutMs: number;
}

export const DEFAULT_SPECULATIVE_CONFIG: SpeculativeExecutorConfig = {
  probabilityThreshold: 0.7,
  maxTokens: 5000,
  maxConcurrent: 2,
  checkpointInterval: 1000,
  timeoutMs: 30000,
};

export class SpeculativeExecutor {
  private config: SpeculativeExecutorConfig;
  private executions: Map<string, SpeculativeExecution> = new Map();
  private abortControllers: Map<string, AbortController> = new Map();
  private eventHandlers: Set<ChatEventHandler> = new Set();
  private llmClient: ReturnType<typeof createLLMClient> | null = null;

  constructor(config: Partial<SpeculativeExecutorConfig> = {}) {
    this.config = { ...DEFAULT_SPECULATIVE_CONFIG, ...config };
    this.llmClient = createLLMClient();
  }

  /**
   * Subscribe to speculative execution events
   */
  onEvent(handler: ChatEventHandler): () => void {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  private emit(event: ChatEvent): void {
    this.eventHandlers.forEach((handler) => handler(event));
  }

  /**
   * Check if a solution should be executed speculatively
   */
  shouldExecute(solution: ProposedSolution, probability: number): boolean {
    // Check probability threshold
    if (probability < this.config.probabilityThreshold) {
      return false;
    }

    // Check concurrent limit
    const activeCount = Array.from(this.executions.values()).filter(
      (e) => e.status === 'computing'
    ).length;
    if (activeCount >= this.config.maxConcurrent) {
      return false;
    }

    // Check if already executing
    if (this.executions.has(solution.id)) {
      return false;
    }

    return true;
  }

  /**
   * Start speculative execution for a solution
   */
  async execute(
    solution: ProposedSolution,
    context: string,
    probability: number
  ): Promise<SpeculativeExecution> {
    const executionId = `spec-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const abortController = new AbortController();

    const execution: SpeculativeExecution = {
      id: executionId,
      optionId: solution.id,
      solutionId: solution.id,
      probability,
      status: 'queued',
      startTime: Date.now(),
      tokensUsed: 0,
      cancelled: false,
    };

    this.executions.set(executionId, execution);
    this.abortControllers.set(executionId, abortController);

    this.emit({
      id: `evt-${Date.now()}`,
      type: 'speculation_started',
      timestamp: Date.now(),
      actor: 'system',
      data: { executionId, solutionId: solution.id, probability },
    });

    // Start async execution
    this.runExecution(execution, solution, context, abortController.signal)
      .then((result) => {
        execution.result = result;
        execution.status = result.success ? 'completed' : 'failed';
        execution.endTime = Date.now();

        this.emit({
          id: `evt-${Date.now()}`,
          type: 'speculation_completed',
          timestamp: Date.now(),
          actor: 'system',
          data: {
            executionId,
            success: result.success,
            tokensUsed: result.metrics.tokensUsed,
            completionPercentage: result.metrics.completionPercentage,
          },
        });
      })
      .catch((error) => {
        if (!abortController.signal.aborted) {
          console.error('[SpeculativeExecutor] Execution failed:', error);
          execution.status = 'failed';
          execution.endTime = Date.now();
        }
      });

    return execution;
  }

  /**
   * Run the speculative execution
   */
  private async runExecution(
    execution: SpeculativeExecution,
    solution: ProposedSolution,
    context: string,
    signal: AbortSignal
  ): Promise<SpeculativeResult> {
    execution.status = 'computing';
    const startTime = Date.now();

    const result: SpeculativeResult = {
      success: false,
      partialOutput: '',
      filesGenerated: [],
      canContinue: false,
      checkpointState: null,
      metrics: {
        tokensUsed: 0,
        timeElapsed: 0,
        completionPercentage: 0,
      },
    };

    try {
      // Check for abort
      if (signal.aborted) {
        execution.cancelled = true;
        execution.status = 'cancelled';
        return result;
      }

      // Execute with LLM if available
      if (this.llmClient) {
        const llmResult = await this.executeLLMSpeculation(
          solution,
          context,
          signal
        );

        result.partialOutput = llmResult.output;
        result.codeGenerated = llmResult.code;
        result.filesGenerated = llmResult.files;
        result.metrics.tokensUsed = llmResult.tokensUsed;
        execution.tokensUsed = llmResult.tokensUsed;
      } else {
        // Simulated execution for testing
        await this.simulateExecution(execution, signal);
        result.partialOutput = `Simulated result for: ${solution.content.slice(0, 50)}...`;
      }

      // Check for abort again
      if (signal.aborted) {
        execution.cancelled = true;
        execution.status = 'cancelled';
        return result;
      }

      result.success = true;
      result.canContinue = true;
      result.checkpointState = {
        solutionId: solution.id,
        completedAt: Date.now(),
        output: result.partialOutput,
      };
      result.metrics.timeElapsed = Date.now() - startTime;
      result.metrics.completionPercentage = 100;

      return result;
    } catch (error) {
      if (signal.aborted) {
        execution.cancelled = true;
        execution.status = 'cancelled';
      } else {
        result.metrics.timeElapsed = Date.now() - startTime;
        console.error('[SpeculativeExecutor] Error during execution:', error);
      }
      return result;
    }
  }

  /**
   * Execute speculation using LLM
   */
  private async executeLLMSpeculation(
    solution: ProposedSolution,
    context: string,
    signal: AbortSignal
  ): Promise<{
    output: string;
    code?: string;
    files: string[];
    tokensUsed: number;
  }> {
    if (!this.llmClient) {
      throw new Error('LLM client not available');
    }

    const prompt = `You are speculatively pre-computing the result of a proposed solution.

Solution: ${solution.content}

Context: ${context}

Reasoning: ${solution.reasoning}

Please generate a partial implementation that can be continued if this solution is selected.
Focus on:
1. Core logic implementation
2. Key code structures
3. Main function/component outline

Keep the response concise and focused. This is speculative - optimize for speed over completeness.

Respond with:
1. A brief summary of what you've pre-computed
2. Any code you've generated
3. Files that would be created`;

    try {
      const response = await this.llmClient.chatDirect([
        { role: 'user', content: prompt },
      ], {
        temperature: 0.3,
        maxTokens: Math.min(this.config.maxTokens, 2000),
      });

      // Parse response
      const codeMatch = response.match(/```[\w]*\n([\s\S]*?)```/);
      const code = codeMatch ? codeMatch[1] : undefined;

      const filesMatch = response.match(/Files?:\s*([\s\S]*?)(?:\n\n|$)/i);
      const files = filesMatch
        ? filesMatch[1].split('\n').filter((f) => f.trim().startsWith('-')).map((f) => f.replace(/^-\s*/, '').trim())
        : [];

      // Estimate tokens (rough: 4 chars per token)
      const tokensUsed = Math.ceil((prompt.length + response.length) / 4);

      return {
        output: response,
        code,
        files,
        tokensUsed,
      };
    } catch (error) {
      console.error('[SpeculativeExecutor] LLM execution failed:', error);
      throw error;
    }
  }

  /**
   * Simulate execution for testing
   */
  private async simulateExecution(
    execution: SpeculativeExecution,
    signal: AbortSignal
  ): Promise<void> {
    const steps = 10;
    const stepTime = this.config.timeoutMs / steps / 2;

    for (let i = 0; i < steps; i++) {
      if (signal.aborted) {
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, stepTime));
      execution.tokensUsed += Math.floor(this.config.maxTokens / steps);
    }
  }

  /**
   * Cancel a speculative execution
   */
  cancel(executionId: string): boolean {
    const controller = this.abortControllers.get(executionId);
    if (controller) {
      controller.abort();
      this.abortControllers.delete(executionId);

      const execution = this.executions.get(executionId);
      if (execution) {
        execution.cancelled = true;
        execution.status = 'cancelled';
        execution.endTime = Date.now();
      }

      return true;
    }
    return false;
  }

  /**
   * Confirm a speculative execution (the option was selected)
   */
  confirm(executionId: string): SpeculativeResult | null {
    const execution = this.executions.get(executionId);
    if (!execution || execution.status !== 'completed') {
      return null;
    }

    console.log('[SpeculativeExecutor] Execution confirmed:', executionId);
    console.log('[SpeculativeExecutor] Time saved:', execution.endTime! - execution.startTime, 'ms');

    return execution.result || null;
  }

  /**
   * Get execution by ID
   */
  getExecution(executionId: string): SpeculativeExecution | undefined {
    return this.executions.get(executionId);
  }

  /**
   * Get execution by solution ID
   */
  getExecutionBySolution(solutionId: string): SpeculativeExecution | undefined {
    return Array.from(this.executions.values()).find(
      (e) => e.solutionId === solutionId
    );
  }

  /**
   * Get all active executions
   */
  getActiveExecutions(): SpeculativeExecution[] {
    return Array.from(this.executions.values()).filter(
      (e) => e.status === 'computing' || e.status === 'queued'
    );
  }

  /**
   * Get statistics
   */
  getStats(): {
    total: number;
    completed: number;
    cancelled: number;
    failed: number;
    active: number;
    totalTokensUsed: number;
    avgTimeMs: number;
  } {
    const executions = Array.from(this.executions.values());

    const completed = executions.filter((e) => e.status === 'completed');
    const totalTime = completed.reduce(
      (sum, e) => sum + (e.endTime || 0) - e.startTime,
      0
    );

    return {
      total: executions.length,
      completed: completed.length,
      cancelled: executions.filter((e) => e.status === 'cancelled').length,
      failed: executions.filter((e) => e.status === 'failed').length,
      active: executions.filter((e) => e.status === 'computing' || e.status === 'queued').length,
      totalTokensUsed: executions.reduce((sum, e) => sum + e.tokensUsed, 0),
      avgTimeMs: completed.length > 0 ? totalTime / completed.length : 0,
    };
  }

  /**
   * Cancel all active executions
   */
  cancelAll(): void {
    this.abortControllers.forEach((controller, id) => {
      controller.abort();
      const execution = this.executions.get(id);
      if (execution) {
        execution.cancelled = true;
        execution.status = 'cancelled';
        execution.endTime = Date.now();
      }
    });
    this.abortControllers.clear();
  }

  /**
   * Clean up old executions
   */
  cleanup(maxAgeMs: number = 60 * 60 * 1000): void {
    const now = Date.now();
    this.executions.forEach((execution, id) => {
      if (now - execution.startTime > maxAgeMs) {
        this.executions.delete(id);
        this.abortControllers.delete(id);
      }
    });
  }
}

// Export singleton factory
let instance: SpeculativeExecutor | null = null;

export function getSpeculativeExecutor(
  config?: Partial<SpeculativeExecutorConfig>
): SpeculativeExecutor {
  if (!instance) {
    instance = new SpeculativeExecutor(config);
  }
  return instance;
}

export function resetSpeculativeExecutor(): void {
  if (instance) {
    instance.cancelAll();
  }
  instance = null;
}
