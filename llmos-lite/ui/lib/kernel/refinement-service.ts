/**
 * Code Refinement Service
 *
 * Sends failed code to LLM for analysis and correction.
 * Uses the existing LLM client to request code fixes.
 */

import { ErrorContext, RefinementResult } from './error-supervisor';
import { createLLMClient } from '../llm-client';

export interface RefinementOptions {
  temperature?: number;
  maxTokens?: number;
  model?: string;
}

/**
 * Code Refinement Service
 */
export class CodeRefinementService {
  private options: RefinementOptions;

  constructor(options: RefinementOptions = {}) {
    this.options = {
      temperature: options.temperature ?? 0.3, // Lower temp for more deterministic fixes
      maxTokens: options.maxTokens ?? 2000,
      model: options.model, // Use default model if not specified
    };
  }

  /**
   * Request code refinement from LLM
   */
  async refineCode(
    context: ErrorContext,
    prompt: string
  ): Promise<RefinementResult> {
    try {
      console.log('[RefinementService] Requesting code refinement...');
      console.log('[RefinementService] Attempt:', context.attemptNumber, '/', context.maxAttempts);

      // Get LLM client
      const llmClient = createLLMClient();
      if (!llmClient) {
        throw new Error('LLM client not configured. Please set your API key.');
      }

      // Send refinement request using chatDirect
      const response = await llmClient.chatDirect([
        {
          role: 'user',
          content: prompt,
        },
      ]);

      console.log('[RefinementService] LLM response received');

      // Parse response
      return this.parseResponse(response);
    } catch (error) {
      console.error('[RefinementService] Refinement request failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Parse LLM response into refinement result
   */
  private parseResponse(response: string): RefinementResult {
    try {
      // Extract JSON from response
      let jsonStr = response.trim();

      // Handle markdown code blocks
      if (jsonStr.includes('```json')) {
        const match = jsonStr.match(/```json\s*\n([\s\S]*?)\n```/);
        if (match) {
          jsonStr = match[1];
        }
      } else if (jsonStr.includes('```')) {
        const match = jsonStr.match(/```\s*\n([\s\S]*?)\n```/);
        if (match) {
          jsonStr = match[1];
        }
      }

      // Try to extract JSON object if embedded in text
      const jsonMatch = jsonStr.match(/\{[\s\S]*"refinedCode"[\s\S]*\}/);
      if (jsonMatch) {
        jsonStr = jsonMatch[0];
      }

      const parsed = JSON.parse(jsonStr);

      // Validate response
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
      console.error('[RefinementService] Failed to parse response:', error);

      // Fallback: try to extract code block from response
      const codeBlockMatch = response.match(/```(?:javascript|python)?\s*\n([\s\S]*?)\n```/);
      if (codeBlockMatch) {
        return {
          success: true,
          refinedCode: codeBlockMatch[1],
          explanation: 'Extracted code block from response',
          reasoning: 'LLM provided code block without JSON wrapper',
        };
      }

      return {
        success: false,
        error: `Failed to parse LLM response: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Validate refined code before execution
   */
  async validateRefinedCode(
    originalCode: string,
    refinedCode: string,
    language: 'javascript' | 'python'
  ): Promise<{ valid: boolean; warnings: string[] }> {
    const warnings: string[] = [];

    // Basic validation
    if (!refinedCode || refinedCode.trim().length === 0) {
      return { valid: false, warnings: ['Refined code is empty'] };
    }

    // Check if code is too different (possible hallucination)
    const originalLines = originalCode.split('\n').length;
    const refinedLines = refinedCode.split('\n').length;

    if (refinedLines > originalLines * 3) {
      warnings.push('Refined code is significantly longer than original - may have added unnecessary complexity');
    }

    // Language-specific validation
    if (language === 'javascript') {
      // Check for dangerous patterns
      if (refinedCode.includes('eval(') || refinedCode.includes('Function(')) {
        warnings.push('Refined code contains eval or Function constructor - potentially unsafe');
      }
    }

    return { valid: true, warnings };
  }
}

/**
 * Singleton instance
 */
let refinementServiceInstance: CodeRefinementService | null = null;

/**
 * Get or create refinement service
 */
export function getRefinementService(options?: RefinementOptions): CodeRefinementService {
  if (!refinementServiceInstance || options) {
    refinementServiceInstance = new CodeRefinementService(options);
  }
  return refinementServiceInstance;
}
