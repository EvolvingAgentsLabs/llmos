/**
 * Error Handler with Ralph Loop Integration
 *
 * This handler intercepts code execution errors and triggers
 * automatic refinement using the Ralph Loop pattern.
 */

import { getRalphLoop, RalphLoop, type RefinementContext, type ExecutionResult } from './ralph-loop';
import type { LLMClient } from '@/lib/llm-client';

export interface ErrorHandlerConfig {
  enableAutoFix: boolean;
  maxAttempts: number;
  onRefinementStart?: (context: RefinementContext) => void;
  onRefinementComplete?: (refinedCode: string, result: ExecutionResult) => void;
  onRefinementFailed?: (context: RefinementContext) => void;
}

const DEFAULT_CONFIG: ErrorHandlerConfig = {
  enableAutoFix: false, // Disabled by default - user must opt-in
  maxAttempts: 3,
};

/**
 * Enhanced execution with automatic error refinement
 *
 * Usage:
 * ```typescript
 * const handler = new ErrorHandler({ enableAutoFix: true });
 * const result = await handler.executeWithAutoFix(
 *   pythonCode,
 *   'python',
 *   llmClient
 * );
 * ```
 */
export class ErrorHandler {
  private config: ErrorHandlerConfig;
  private ralphLoop: typeof RalphLoop;

  constructor(config: Partial<ErrorHandlerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.ralphLoop = RalphLoop;
  }

  /**
   * Execute code with automatic error refinement
   */
  async executeWithAutoFix(
    code: string,
    language: 'python' | 'javascript' | 'typescript',
    llmClient: LLMClient | null,
    executor?: (code: string) => Promise<ExecutionResult>
  ): Promise<ExecutionResult & { refinedCode?: string; attempts: number }> {
    // If auto-fix is disabled or no LLM client, just execute once
    if (!this.config.enableAutoFix || !llmClient) {
      const defaultExecutor = executor || this.getDefaultExecutor(language);
      const result = await defaultExecutor(code);
      return { ...result, attempts: 1 };
    }

    // Create Ralph Loop instance
    const ralphLoop = getRalphLoop({
      maxAttempts: this.config.maxAttempts,
      enableAutoFix: true,
      onRefinementStart: this.config.onRefinementStart,
      onRefinementComplete: (context, result) => {
        if (result.success && context.attempt > 1) {
          this.config.onRefinementComplete?.(context.originalCode, result);
        }
      },
      onRefinementFailed: this.config.onRefinementFailed,
    });

    // Execute with refinement loop
    const result = await ralphLoop.executeWithRefinement(
      code,
      executor || this.getDefaultExecutor(language),
      async (context) => this.refineCode(context, llmClient),
      language
    );

    return result;
  }

  /**
   * Get refined code from LLM
   */
  private async refineCode(context: RefinementContext, llmClient: LLMClient): Promise<string> {
    const prompt = RalphLoop.createRefinementPrompt(context);

    console.log('[ErrorHandler] Requesting code refinement from LLM...');
    console.log('[ErrorHandler] Error:', context.error.substring(0, 200));

    try {
      const response = await llmClient.chatDirect([
        {
          role: 'system',
          content: 'You are a code refinement engine. Your job is to fix code based on execution errors. Return ONLY the fixed code, no explanations, no markdown.'
        },
        {
          role: 'user',
          content: prompt
        }
      ]);

      // Extract code from response (in case LLM adds markdown)
      const refinedCode = this.extractCode(response, context.language);

      console.log('[ErrorHandler] Refined code received');
      return refinedCode;
    } catch (error) {
      console.error('[ErrorHandler] Refinement request failed:', error);
      throw error;
    }
  }

  /**
   * Extract code from LLM response
   */
  private extractCode(response: string, language: string): string {
    // Try to find code block
    const codeBlockRegex = new RegExp(`\`\`\`(?:${language})?\\s*([\\s\\S]*?)\`\`\``, 'i');
    const match = response.match(codeBlockRegex);

    if (match && match[1]) {
      return match[1].trim();
    }

    // If no code block, try to find code after certain markers
    const lines = response.split('\n');
    let inCode = false;
    const codeLines: string[] = [];

    for (const line of lines) {
      // Skip common explanation lines
      if (line.match(/^(Here|The|This|I|Let|Now|To fix)/i)) {
        continue;
      }

      // Check if line looks like code
      if (line.trim().length > 0) {
        if (language === 'python') {
          // Python-specific heuristics
          if (line.match(/^(import|from|def|class|if|for|while|with|try|@)/)) {
            inCode = true;
          }
        } else if (language === 'javascript' || language === 'typescript') {
          // JS/TS-specific heuristics
          if (line.match(/^(import|export|const|let|var|function|class|if|for|while|try)/)) {
            inCode = true;
          }
        }

        if (inCode) {
          codeLines.push(line);
        }
      }
    }

    if (codeLines.length > 0) {
      return codeLines.join('\n');
    }

    // If nothing found, return the whole response (risky but better than nothing)
    return response.trim();
  }

  /**
   * Get default executor for a language
   */
  private getDefaultExecutor(language: 'python' | 'javascript' | 'typescript'): (code: string) => Promise<ExecutionResult> {
    return async (code: string) => {
      if (language === 'python') {
        // Dynamic import to avoid bundling issues
        const { executePython } = await import('@/lib/pyodide-runtime');
        const result = await executePython(code);

        return {
          success: result.success,
          output: result.output,
          error: result.error,
          stderr: result.stderr,
          executionTime: result.executionTime,
        };
      } else {
        // For JS/TS, use eval (in real app, use QuickJS or similar)
        try {
          const output = eval(code);
          return {
            success: true,
            output,
            executionTime: 0,
          };
        } catch (error: any) {
          return {
            success: false,
            error: error.message,
            executionTime: 0,
          };
        }
      }
    };
  }

  /**
   * Format error for display
   */
  static formatError(error: string): { type: string; message: string; suggestion?: string } {
    // Parse common error types
    if (error.includes('ModuleNotFoundError') || error.includes('ImportError')) {
      const moduleMatch = error.match(/No module named '([^']+)'/);
      const moduleName = moduleMatch ? moduleMatch[1] : 'unknown';

      return {
        type: 'Import Error',
        message: `Missing module: ${moduleName}`,
        suggestion: `The Python runtime needs to load the '${moduleName}' package. This will happen automatically.`
      };
    }

    if (error.includes('SyntaxError')) {
      return {
        type: 'Syntax Error',
        message: error,
        suggestion: 'Check for missing parentheses, quotes, or indentation issues.'
      };
    }

    if (error.includes('NameError')) {
      const nameMatch = error.match(/name '([^']+)' is not defined/);
      const varName = nameMatch ? nameMatch[1] : 'unknown';

      return {
        type: 'Name Error',
        message: `Variable '${varName}' is not defined`,
        suggestion: `Make sure to define '${varName}' before using it.`
      };
    }

    if (error.includes('TypeError')) {
      return {
        type: 'Type Error',
        message: error,
        suggestion: 'Check that you are using the correct data types for operations.'
      };
    }

    return {
      type: 'Runtime Error',
      message: error,
    };
  }
}

/**
 * Global error handler instance
 */
let errorHandlerInstance: ErrorHandler | null = null;

export function getErrorHandler(config?: Partial<ErrorHandlerConfig>): ErrorHandler {
  if (!errorHandlerInstance || config) {
    errorHandlerInstance = new ErrorHandler(config);
  }
  return errorHandlerInstance;
}
