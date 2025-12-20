/**
 * Error Supervisor
 *
 * Captures execution errors with full context and manages the self-correction loop.
 * When code fails, captures state, sends to LLM for refinement, and retries.
 */

import { ExecutionResult } from '../artifact-executor';

export interface ErrorContext {
  // Original code and error
  originalCode: string;
  error: {
    message: string;
    stack?: string;
    line?: number;
    column?: number;
  };

  // Runtime state at time of error
  runtimeState: {
    variables?: Record<string, any>;
    lastOutput?: any;
    stdout?: string;
    stderr?: string;
  };

  // Retry tracking
  attemptNumber: number;
  maxAttempts: number;

  // History of previous attempts
  previousAttempts: Array<{
    code: string;
    error: string;
    timestamp: number;
  }>;

  // Metadata
  artifactId: string;
  language: 'javascript' | 'python';
  timestamp: number;
}

export interface RefinementResult {
  success: boolean;
  refinedCode?: string;
  explanation?: string;
  error?: string;
  reasoning?: string;
}

export interface SupervisedExecutionResult extends ExecutionResult {
  // Additional fields for supervision
  wasRefined: boolean;
  refinementAttempts: number;
  refinementHistory?: Array<{
    attempt: number;
    error: string;
    refinedCode: string;
    explanation: string;
  }>;
}

/**
 * Error Supervisor - Manages error capture and self-correction
 */
export class ErrorSupervisor {
  private maxRetries: number;
  private onProgress?: (status: string, attempt: number, total: number) => void;

  constructor(options: {
    maxRetries?: number;
    onProgress?: (status: string, attempt: number, total: number) => void;
  } = {}) {
    this.maxRetries = options.maxRetries ?? 3;
    this.onProgress = options.onProgress;
  }

  /**
   * Capture full error context from execution failure
   */
  captureErrorContext(
    code: string,
    result: ExecutionResult,
    artifactId: string,
    language: 'javascript' | 'python',
    previousAttempts: Array<{ code: string; error: string; timestamp: number }> = []
  ): ErrorContext {
    const errorMessage = result.error || 'Unknown error';
    return {
      originalCode: code,
      error: {
        message: errorMessage,
        stack: undefined,
        line: undefined,
        column: undefined,
      },
      runtimeState: {
        variables: {}, // Would need to extract from runtime state
        lastOutput: result.output,
        stdout: result.stdout,
        stderr: result.stderr,
      },
      attemptNumber: previousAttempts.length + 1,
      maxAttempts: this.maxRetries,
      previousAttempts,
      artifactId,
      language,
      timestamp: Date.now(),
    };
  }

  /**
   * Build refinement prompt for LLM
   */
  buildRefinementPrompt(context: ErrorContext): string {
    const { originalCode, error, runtimeState, previousAttempts, language } = context;

    let prompt = `You are an expert code debugger. The following ${language} code failed to execute:

\`\`\`${language}
${originalCode}
\`\`\`

**Error:**
${error.message}
${error.stack ? `\n**Stack Trace:**\n${error.stack}` : ''}
${error.line ? `\n**Location:** Line ${error.line}, Column ${error.column}` : ''}

**Console Output:**
${runtimeState.stdout || '(none)'}

${runtimeState.stderr ? `**Warnings/Errors:**\n${runtimeState.stderr}` : ''}
`;

    if (previousAttempts.length > 0) {
      prompt += `\n**Previous Attempts:**\n`;
      previousAttempts.forEach((attempt, i) => {
        prompt += `\nAttempt ${i + 1}:\n`;
        prompt += `Code: \`\`\`${language}\n${attempt.code}\n\`\`\`\n`;
        prompt += `Error: ${attempt.error}\n`;
      });
      prompt += `\nThis is attempt ${context.attemptNumber} of ${context.maxAttempts}. `;
    }

    prompt += `\nPlease analyze the error and provide a corrected version of the code.

**Your response must be in the following JSON format:**
{
  "reasoning": "Brief explanation of what caused the error",
  "refinedCode": "The corrected code (complete, not partial)",
  "explanation": "What you changed and why"
}

Important:
1. Return ONLY valid JSON, no other text
2. The refinedCode must be complete and executable
3. For ${language === 'javascript' ? 'JavaScript, you have access to the LLMOS global object with safe APIs' : 'Python, use standard library only'}
4. Keep the original intent of the code
5. Fix the specific error without over-engineering
`;

    return prompt;
  }

  /**
   * Parse LLM refinement response
   */
  parseRefinementResponse(response: string): RefinementResult {
    try {
      // Extract JSON from response (handle markdown code blocks)
      let jsonStr = response.trim();

      // Remove markdown code block if present
      if (jsonStr.startsWith('```json')) {
        jsonStr = jsonStr.replace(/```json\n?/, '').replace(/\n?```$/, '');
      } else if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/```\n?/, '').replace(/\n?```$/, '');
      }

      const parsed = JSON.parse(jsonStr);

      if (!parsed.refinedCode) {
        return {
          success: false,
          error: 'LLM response missing refinedCode field',
        };
      }

      return {
        success: true,
        refinedCode: parsed.refinedCode,
        explanation: parsed.explanation || 'No explanation provided',
        reasoning: parsed.reasoning || 'No reasoning provided',
      };
    } catch (error) {
      console.error('[ErrorSupervisor] Failed to parse LLM response:', error);
      return {
        success: false,
        error: `Failed to parse LLM response: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Report progress to caller
   */
  private reportProgress(status: string, attempt: number, total: number): void {
    if (this.onProgress) {
      this.onProgress(status, attempt, total);
    }
  }

  /**
   * Log error to kernel
   */
  private logError(context: ErrorContext): void {
    if (typeof window !== 'undefined') {
      const kernel = (window as any).__LLMOS_KERNEL__;
      if (kernel?.errors?.capture) {
        kernel.errors.capture(
          {
            message: context.error.message,
            stack: context.error.stack,
          },
          {
            artifactId: context.artifactId,
            language: context.language,
            attemptNumber: context.attemptNumber,
            code: context.originalCode.substring(0, 200), // First 200 chars
          }
        );
      }
    }
  }

  /**
   * Create supervised execution result
   */
  createSupervisedResult(
    finalResult: ExecutionResult,
    wasRefined: boolean,
    refinementHistory: Array<{
      attempt: number;
      error: string;
      refinedCode: string;
      explanation: string;
    }>
  ): SupervisedExecutionResult {
    return {
      ...finalResult,
      wasRefined,
      refinementAttempts: refinementHistory.length,
      refinementHistory: refinementHistory.length > 0 ? refinementHistory : undefined,
    };
  }
}

/**
 * Singleton instance
 */
let supervisorInstance: ErrorSupervisor | null = null;

/**
 * Get or create error supervisor
 */
export function getErrorSupervisor(options?: {
  maxRetries?: number;
  onProgress?: (status: string, attempt: number, total: number) => void;
}): ErrorSupervisor {
  if (!supervisorInstance || options) {
    supervisorInstance = new ErrorSupervisor(options);
  }
  return supervisorInstance;
}
