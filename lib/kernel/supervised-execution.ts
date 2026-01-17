/**
 * Supervised Execution
 *
 * Executes code with automatic error detection and LLM-powered self-correction.
 * If execution fails, captures context, requests LLM refinement, and retries.
 */

import { executeJavaScript, executePythonCode, ExecutionOptions, ExecutionResult } from '../artifact-executor';
import { getErrorSupervisor, SupervisedExecutionResult as SupervisedResult } from './error-supervisor';
import { getRefinementService } from './refinement-service';
import { logger } from '../debug/logger';
import { planLogger } from '../debug/plan-log-store';

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

  logger.info('applet', `Starting supervised execution`, {
    language,
    artifactId,
    enableSelfCorrection,
    maxRetries,
    codeLength: code.length,
  });

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

    logger.info('applet', `Execution attempt ${attempt}/${maxRetries}`, { language, artifactId });
    planLogger.info(`Applet execution attempt ${attempt}/${maxRetries}`);

    // Execute code
    logger.time(`exec-${artifactId}-${attempt}`, 'applet', `Executing ${language} code`);
    let result: ExecutionResult;
    if (language === 'javascript') {
      result = await executeJavaScript(currentCode, artifactId, execOptions);
    } else {
      result = await executePythonCode(currentCode, execOptions);
    }
    logger.timeEnd(`exec-${artifactId}-${attempt}`, result.success, {
      executionTime: result.executionTime,
    });

    lastResult = result;

    // Success! Return result
    if (result.success) {
      logger.success('applet', `Execution succeeded on attempt ${attempt}`, {
        artifactId,
        executionTime: result.executionTime,
        wasRefined: attempt > 1,
      });
      planLogger.success(`Applet executed successfully`);

      return supervisor.createSupervisedResult(
        result,
        attempt > 1, // Was refined if not first attempt
        refinementHistory
      );
    }

    // Execution failed
    logger.error('applet', `Execution attempt ${attempt} failed`, {
      artifactId,
      error: result.error,
    });
    planLogger.warning(`Applet execution failed: ${result.error?.substring(0, 100)}`);

    // If self-correction is disabled or we're on the last attempt, return failure
    if (!enableSelfCorrection || attempt === maxRetries) {
      logger.warn('applet', 'Max retries reached or self-correction disabled', {
        enableSelfCorrection,
        attempt,
        maxRetries,
      });
      planLogger.error(`Applet failed after ${attempt} attempts`);
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

    logger.info('applet', 'Requesting LLM refinement for failed execution');
    planLogger.info('Requesting LLM refinement');

    const prompt = supervisor.buildRefinementPrompt(errorContext);
    logger.time(`refinement-${artifactId}-${attempt}`, 'llm', 'LLM code refinement');
    const refinementResult = await refinementService.refineCode(errorContext, prompt);
    logger.timeEnd(`refinement-${artifactId}-${attempt}`, refinementResult.success);

    if (!refinementResult.success || !refinementResult.refinedCode) {
      logger.error('applet', 'LLM refinement failed', {
        error: refinementResult.error,
      });
      planLogger.error('LLM refinement failed');

      // Can't refine, return last result
      return supervisor.createSupervisedResult(result, attempt > 1, refinementHistory);
    }

    logger.success('applet', 'LLM refinement successful', {
      explanation: refinementResult.explanation?.substring(0, 200),
    });

    // Validate refined code
    const validation = await refinementService.validateRefinedCode(
      code,
      refinementResult.refinedCode,
      language
    );

    if (!validation.valid) {
      logger.error('applet', 'Refined code validation failed');
      return supervisor.createSupervisedResult(result, attempt > 1, refinementHistory);
    }

    if (validation.warnings.length > 0) {
      logger.warn('applet', 'Validation warnings for refined code', {
        warnings: validation.warnings,
      });
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

    logger.info('applet', `Will retry with refined code`, {
      codeLength: currentCode.length,
      attempt: attempt + 1,
    });
    planLogger.info(`Retrying with refined code (${currentCode.length} chars)`);
  }

  // Should never reach here, but return last result if we do
  logger.error('applet', 'Execution loop exited unexpectedly');
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
