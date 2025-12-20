/**
 * Supervised Execution
 *
 * Executes code with automatic error detection and LLM-powered self-correction.
 * If execution fails, captures context, requests LLM refinement, and retries.
 */

import { executeJavaScript, executePythonCode, ExecutionOptions, ExecutionResult } from '../artifact-executor';
import { getErrorSupervisor, SupervisedExecutionResult as SupervisedResult } from './error-supervisor';
import { getRefinementService } from './refinement-service';

// Re-export SupervisedExecutionResult
export type { SupervisedResult as SupervisedExecutionResult };

export interface SupervisedExecutionOptions extends ExecutionOptions {
  // Self-correction options
  enableSelfCorrection?: boolean;
  maxRetries?: number;
  onProgress?: (status: string, attempt: number, total: number) => void;

  // LLM options
  llmTemperature?: number;
  llmMaxTokens?: number;
  llmModel?: string;
}

/**
 * Execute code with supervised error handling and self-correction
 */
export async function executeWithSupervision(
  code: string,
  language: 'javascript' | 'python',
  artifactId: string,
  options: SupervisedExecutionOptions = {}
): Promise<SupervisedResult> {
  const {
    enableSelfCorrection = true,
    maxRetries = 3,
    onProgress,
    llmTemperature,
    llmMaxTokens,
    llmModel,
    ...execOptions
  } = options;

  // Get supervisor and refinement service
  const supervisor = getErrorSupervisor({ maxRetries, onProgress });
  const refinementService = getRefinementService({
    temperature: llmTemperature,
    maxTokens: llmMaxTokens,
    model: llmModel,
  });

  // Track refinement history
  const refinementHistory: Array<{
    attempt: number;
    error: string;
    refinedCode: string;
    explanation: string;
  }> = [];

  // Track previous attempts for context
  const previousAttempts: Array<{
    code: string;
    error: string;
    timestamp: number;
  }> = [];

  let currentCode = code;
  let lastResult: ExecutionResult | null = null;

  // Execute with retries
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    // Report progress
    if (onProgress) {
      const status = attempt === 1 ? 'Executing code...' : `Retrying with refined code (attempt ${attempt}/${maxRetries})...`;
      onProgress(status, attempt, maxRetries);
    }

    console.log(`[SupervisedExecution] Attempt ${attempt}/${maxRetries}`);

    // Execute code
    let result: ExecutionResult;
    if (language === 'javascript') {
      result = await executeJavaScript(currentCode, artifactId, execOptions);
    } else {
      result = await executePythonCode(currentCode, execOptions);
    }

    lastResult = result;

    // Success! Return result
    if (result.success) {
      console.log(`[SupervisedExecution] Success on attempt ${attempt}`);

      return supervisor.createSupervisedResult(
        result,
        attempt > 1, // Was refined if not first attempt
        refinementHistory
      );
    }

    // Execution failed
    console.error(`[SupervisedExecution] Attempt ${attempt} failed:`, result.error);

    // If self-correction is disabled or we're on the last attempt, return failure
    if (!enableSelfCorrection || attempt === maxRetries) {
      console.log('[SupervisedExecution] Max retries reached or self-correction disabled');
      return supervisor.createSupervisedResult(result, attempt > 1, refinementHistory);
    }

    // Capture error context
    const errorContext = supervisor.captureErrorContext(
      currentCode,
      result,
      artifactId,
      language,
      previousAttempts
    );

    // Log error to kernel
    supervisor['logError'](errorContext);

    // Record this attempt
    previousAttempts.push({
      code: currentCode,
      error: result.error || 'Unknown error',
      timestamp: Date.now(),
    });

    // Request LLM refinement
    if (onProgress) {
      onProgress(`Analyzing error and requesting refinement...`, attempt, maxRetries);
    }

    console.log('[SupervisedExecution] Requesting LLM refinement...');

    const prompt = supervisor.buildRefinementPrompt(errorContext);
    const refinementResult = await refinementService.refineCode(errorContext, prompt);

    if (!refinementResult.success || !refinementResult.refinedCode) {
      console.error('[SupervisedExecution] Refinement failed:', refinementResult.error);

      // Can't refine, return last result
      return supervisor.createSupervisedResult(result, attempt > 1, refinementHistory);
    }

    console.log('[SupervisedExecution] Refinement successful');
    console.log('[SupervisedExecution] Explanation:', refinementResult.explanation);

    // Validate refined code
    const validation = await refinementService.validateRefinedCode(
      code,
      refinementResult.refinedCode,
      language
    );

    if (!validation.valid) {
      console.error('[SupervisedExecution] Refined code validation failed');
      return supervisor.createSupervisedResult(result, attempt > 1, refinementHistory);
    }

    if (validation.warnings.length > 0) {
      console.warn('[SupervisedExecution] Validation warnings:', validation.warnings);
    }

    // Record refinement
    refinementHistory.push({
      attempt,
      error: result.error || 'Unknown error',
      refinedCode: refinementResult.refinedCode,
      explanation: refinementResult.explanation || 'No explanation',
    });

    // Update code for next attempt
    currentCode = refinementResult.refinedCode;

    // Log refinement
    console.log(`[SupervisedExecution] Will retry with refined code (${currentCode.length} chars)`);
  }

  // Should never reach here, but return last result if we do
  return supervisor.createSupervisedResult(
    lastResult || {
      success: false,
      error: 'Execution failed with no result',
      executionTime: 0,
    },
    refinementHistory.length > 0,
    refinementHistory
  );
}

/**
 * Execute JavaScript with supervision
 */
export async function executeJavaScriptWithSupervision(
  code: string,
  artifactId: string,
  options?: SupervisedExecutionOptions
): Promise<SupervisedResult> {
  return executeWithSupervision(code, 'javascript', artifactId, options);
}

/**
 * Execute Python with supervision
 */
export async function executePythonWithSupervision(
  code: string,
  artifactId: string,
  options?: SupervisedExecutionOptions
): Promise<SupervisedResult> {
  return executeWithSupervision(code, 'python', artifactId, options);
}
