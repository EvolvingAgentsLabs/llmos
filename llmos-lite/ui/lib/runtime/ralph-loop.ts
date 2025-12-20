/**
 * Ralph Wiggum Pattern - Error-Driven Self-Refinement Loop
 *
 * Inspired by Claude Code's "Ralph" plugin architecture.
 *
 * This pattern intercepts execution failures and automatically triggers
 * a refinement loop where the LLM fixes its own code based on error feedback.
 *
 * Named after Ralph Wiggum's famous quote: "I'm helping!" - because the system
 * helps itself by learning from its mistakes.
 */

export interface ExecutionResult {
  success: boolean;
  output?: string;
  error?: string;
  stderr?: string;
  exitCode?: number;
  executionTime?: number;
}

export interface RefinementContext {
  originalCode: string;
  error: string;
  language: 'python' | 'javascript' | 'typescript';
  attempt: number;
  maxAttempts: number;
  previousAttempts?: Array<{
    code: string;
    error: string;
    timestamp: Date;
  }>;
}

export interface RalphLoopConfig {
  maxAttempts: number;
  enableAutoFix: boolean;
  onRefinementStart?: (context: RefinementContext) => void;
  onRefinementComplete?: (context: RefinementContext, result: ExecutionResult) => void;
  onRefinementFailed?: (context: RefinementContext) => void;
}

const DEFAULT_CONFIG: RalphLoopConfig = {
  maxAttempts: 3,
  enableAutoFix: true,
};

/**
 * Ralph Loop - The core refinement engine
 *
 * When code execution fails:
 * 1. Capture the error and execution context
 * 2. Format a refinement prompt for the LLM
 * 3. Get refined code from LLM
 * 4. Execute the refined code
 * 5. If it still fails, repeat (up to maxAttempts)
 * 6. If it succeeds, return the fixed code
 */
export class RalphLoop {
  private config: RalphLoopConfig;
  private refinementHistory: Map<string, RefinementContext[]> = new Map();

  constructor(config: Partial<RalphLoopConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Execute code with automatic error refinement
   *
   * @param code - The code to execute
   * @param executor - Function that executes code and returns result
   * @param refiner - Function that refines code based on error (LLM call)
   * @param language - Programming language
   * @returns Final execution result after refinement attempts
   */
  async executeWithRefinement(
    code: string,
    executor: (code: string) => Promise<ExecutionResult>,
    refiner: (context: RefinementContext) => Promise<string>,
    language: 'python' | 'javascript' | 'typescript' = 'python'
  ): Promise<ExecutionResult & { refinedCode?: string; attempts: number }> {
    let currentCode = code;
    let attempt = 0;
    const previousAttempts: Array<{ code: string; error: string; timestamp: Date }> = [];

    while (attempt < this.config.maxAttempts) {
      attempt++;
      console.log(`[RalphLoop] Attempt ${attempt}/${this.config.maxAttempts}`);

      // Execute the code
      const result = await executor(currentCode);

      // Success! Return immediately
      if (result.success) {
        console.log(`[RalphLoop] Success on attempt ${attempt}`);
        return {
          ...result,
          refinedCode: attempt > 1 ? currentCode : undefined,
          attempts: attempt,
        };
      }

      // Failed - check if we should refine
      if (!this.config.enableAutoFix || attempt >= this.config.maxAttempts) {
        console.log(`[RalphLoop] Failed after ${attempt} attempts, no more refinement`);
        return {
          ...result,
          attempts: attempt,
        };
      }

      // Prepare refinement context
      const context: RefinementContext = {
        originalCode: code,
        error: result.error || result.stderr || 'Unknown error',
        language,
        attempt,
        maxAttempts: this.config.maxAttempts,
        previousAttempts: [...previousAttempts],
      };

      // Record this attempt
      previousAttempts.push({
        code: currentCode,
        error: context.error,
        timestamp: new Date(),
      });

      // Notify listeners
      this.config.onRefinementStart?.(context);

      try {
        // Get refined code from LLM
        console.log(`[RalphLoop] Requesting refinement from LLM...`);
        const refinedCode = await refiner(context);

        if (!refinedCode || refinedCode === currentCode) {
          console.log(`[RalphLoop] Refiner returned no changes, stopping`);
          return {
            ...result,
            attempts: attempt,
          };
        }

        currentCode = refinedCode;
        console.log(`[RalphLoop] Code refined, retrying execution...`);

      } catch (error) {
        console.error(`[RalphLoop] Refinement failed:`, error);
        this.config.onRefinementFailed?.(context);
        return {
          ...result,
          error: `Refinement failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          attempts: attempt,
        };
      }
    }

    // Should never reach here, but TypeScript needs it
    return {
      success: false,
      error: 'Max attempts reached',
      attempts: attempt,
    };
  }

  /**
   * Create a refinement prompt for the LLM
   *
   * This prompt instructs the LLM to fix the code based on the error
   */
  static createRefinementPrompt(context: RefinementContext): string {
    const attemptInfo = context.attempt > 1
      ? `\n\nPrevious attempts (${context.previousAttempts?.length || 0}):\n${context.previousAttempts?.map((a, i) =>
          `Attempt ${i + 1} error: ${a.error}`
        ).join('\n')}`
      : '';

    return `You are in a Ralph Loop - a self-refinement mode where you must fix your own code based on execution errors.

**Execution Error (Attempt ${context.attempt}/${context.maxAttempts}):**
\`\`\`
${context.error}
\`\`\`

**Original Code (${context.language}):**
\`\`\`${context.language}
${context.originalCode}
\`\`\`
${attemptInfo}

**Task:**
1. Analyze the error carefully
2. Fix the code to address the specific error
3. Return ONLY the corrected code, no explanations
4. Do not change the code's purpose, only fix the error
5. Keep the same output format as the original code

**IMPORTANT:**
- Return ONLY executable code, no markdown, no explanations
- Fix the specific error shown above
- If the error mentions missing imports, add them
- If the error mentions syntax issues, fix the syntax
- If the error mentions runtime issues, adjust the logic

Return the fixed code now:`;
  }

  /**
   * Get refinement history for a code artifact
   */
  getHistory(codeHash: string): RefinementContext[] {
    return this.refinementHistory.get(codeHash) || [];
  }

  /**
   * Clear refinement history
   */
  clearHistory(): void {
    this.refinementHistory.clear();
  }
}

/**
 * Hook Manager - PostToolUse Hook Pattern
 *
 * This implements the Claude Code "PostToolUse" hook pattern
 * where we intercept code execution results and trigger refinement
 */
export interface HookContext {
  tool: string;
  input: any;
  output: ExecutionResult;
  timestamp: Date;
}

export type Hook = (context: HookContext) => Promise<void | 'stop' | 'retry'>;

export class HookManager {
  private preHooks: Map<string, Hook[]> = new Map();
  private postHooks: Map<string, Hook[]> = new Map();

  /**
   * Register a hook to run BEFORE a tool executes
   */
  registerPreHook(toolName: string, hook: Hook): void {
    const hooks = this.preHooks.get(toolName) || [];
    hooks.push(hook);
    this.preHooks.set(toolName, hooks);
  }

  /**
   * Register a hook to run AFTER a tool executes
   */
  registerPostHook(toolName: string, hook: Hook): void {
    const hooks = this.postHooks.get(toolName) || [];
    hooks.push(hook);
    this.postHooks.set(toolName, hooks);
  }

  /**
   * Execute pre-hooks
   */
  async runPreHooks(context: HookContext): Promise<'continue' | 'stop'> {
    const hooks = this.preHooks.get(context.tool) || [];

    for (const hook of hooks) {
      const result = await hook(context);
      if (result === 'stop') {
        return 'stop';
      }
    }

    return 'continue';
  }

  /**
   * Execute post-hooks
   */
  async runPostHooks(context: HookContext): Promise<'continue' | 'retry'> {
    const hooks = this.postHooks.get(context.tool) || [];

    for (const hook of hooks) {
      const result = await hook(context);
      if (result === 'retry') {
        return 'retry';
      }
    }

    return 'continue';
  }
}

/**
 * Global instances
 */
let ralphLoopInstance: RalphLoop | null = null;
let hookManagerInstance: HookManager | null = null;

export function getRalphLoop(config?: Partial<RalphLoopConfig>): RalphLoop {
  if (!ralphLoopInstance || config) {
    ralphLoopInstance = new RalphLoop(config);
  }
  return ralphLoopInstance;
}

export function getHookManager(): HookManager {
  if (!hookManagerInstance) {
    hookManagerInstance = new HookManager();
  }
  return hookManagerInstance;
}

/**
 * Example usage:
 *
 * ```typescript
 * const ralphLoop = getRalphLoop({ maxAttempts: 3 });
 *
 * const result = await ralphLoop.executeWithRefinement(
 *   pythonCode,
 *   async (code) => {
 *     // Execute in Pyodide
 *     return pyodideRuntime.execute(code);
 *   },
 *   async (context) => {
 *     // Get refined code from LLM
 *     const prompt = RalphLoop.createRefinementPrompt(context);
 *     const response = await llmClient.chatDirect([
 *       { role: 'user', content: prompt }
 *     ]);
 *     return extractCodeFromResponse(response);
 *   },
 *   'python'
 * );
 *
 * if (result.success) {
 *   console.log('Code executed successfully after', result.attempts, 'attempts');
 *   if (result.refinedCode) {
 *     console.log('Code was refined to:', result.refinedCode);
 *   }
 * }
 * ```
 */
