/**
 * OpenRouter Inference Adapter
 *
 * Provides an InferenceFunction that calls OpenRouter's API
 * for real LLM-powered navigation decisions.
 *
 * Supports:
 *   - Text-only and multimodal (vision) models
 *   - Configurable model selection
 *   - Timeout and retry logic
 *   - Token usage tracking
 *
 * Usage:
 *   const infer = createOpenRouterInference({
 *     apiKey: process.env.OPENROUTER_API_KEY!,
 *     model: 'anthropic/claude-sonnet-4-5-20250929',
 *   });
 *
 *   const loop = new NavigationLoop(bridge, infer);
 */

import type { InferenceFunction } from './navigation-loop';

// =============================================================================
// Types
// =============================================================================

export interface OpenRouterConfig {
  /** OpenRouter API key */
  apiKey: string;
  /** Model identifier (e.g., 'anthropic/claude-sonnet-4-5-20250929') */
  model: string;
  /** Max tokens for response (default: 512) */
  maxTokens: number;
  /** Temperature (default: 0.3) */
  temperature: number;
  /** Timeout in ms (default: 15000) */
  timeoutMs: number;
  /** Max retries on failure (default: 1) */
  maxRetries: number;
  /** Whether the model supports vision/images (default: true) */
  supportsVision: boolean;
  /** Optional site URL for OpenRouter tracking */
  siteUrl?: string;
  /** Optional site name for OpenRouter tracking */
  siteName?: string;
}

const DEFAULT_CONFIG: OpenRouterConfig = {
  apiKey: '',
  model: 'anthropic/claude-sonnet-4-5-20250929',
  maxTokens: 512,
  temperature: 0.3,
  timeoutMs: 15000,
  maxRetries: 1,
  supportsVision: true,
};

export interface InferenceStats {
  /** Total API calls made */
  totalCalls: number;
  /** Successful calls */
  successfulCalls: number;
  /** Failed calls */
  failedCalls: number;
  /** Total tokens used (prompt + completion) */
  totalTokens: number;
  /** Total prompt tokens */
  promptTokens: number;
  /** Total completion tokens */
  completionTokens: number;
  /** Average latency in ms */
  averageLatencyMs: number;
  /** Total latency in ms */
  totalLatencyMs: number;
}

// =============================================================================
// OpenRouter Inference
// =============================================================================

export class OpenRouterInference {
  private config: OpenRouterConfig;
  private stats: InferenceStats = {
    totalCalls: 0,
    successfulCalls: 0,
    failedCalls: 0,
    totalTokens: 0,
    promptTokens: 0,
    completionTokens: 0,
    averageLatencyMs: 0,
    totalLatencyMs: 0,
  };

  constructor(config: Partial<OpenRouterConfig> & { apiKey: string }) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Create an InferenceFunction compatible with NavigationLoop.
   */
  createInferenceFunction(): InferenceFunction {
    return async (
      systemPrompt: string,
      userMessage: string,
      images?: string[]
    ): Promise<string> => {
      return this.infer(systemPrompt, userMessage, images);
    };
  }

  /**
   * Call the OpenRouter API.
   */
  async infer(
    systemPrompt: string,
    userMessage: string,
    images?: string[]
  ): Promise<string> {
    this.stats.totalCalls++;
    const start = performance.now();

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        const result = await this.callAPI(systemPrompt, userMessage, images);
        const latency = performance.now() - start;

        this.stats.successfulCalls++;
        this.stats.totalLatencyMs += latency;
        this.stats.averageLatencyMs = this.stats.totalLatencyMs / this.stats.successfulCalls;

        if (result.usage) {
          this.stats.promptTokens += result.usage.prompt_tokens || 0;
          this.stats.completionTokens += result.usage.completion_tokens || 0;
          this.stats.totalTokens += result.usage.total_tokens || 0;
        }

        return result.content;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt < this.config.maxRetries) {
          // Wait before retry (exponential backoff)
          await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        }
      }
    }

    this.stats.failedCalls++;
    throw lastError ?? new Error('OpenRouter inference failed');
  }

  /**
   * Get inference statistics.
   */
  getStats(): InferenceStats {
    return { ...this.stats };
  }

  /**
   * Reset statistics.
   */
  resetStats(): void {
    this.stats = {
      totalCalls: 0,
      successfulCalls: 0,
      failedCalls: 0,
      totalTokens: 0,
      promptTokens: 0,
      completionTokens: 0,
      averageLatencyMs: 0,
      totalLatencyMs: 0,
    };
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private async callAPI(
    systemPrompt: string,
    userMessage: string,
    images?: string[]
  ): Promise<{ content: string; usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } }> {
    // Build messages
    const messages: Array<Record<string, unknown>> = [
      { role: 'system', content: systemPrompt },
    ];

    // Build user message with optional images
    if (images && images.length > 0 && this.config.supportsVision) {
      const content: Array<Record<string, unknown>> = [
        { type: 'text', text: userMessage },
      ];

      for (const image of images) {
        // Handle both data URLs and raw base64
        const imageUrl = image.startsWith('data:')
          ? image
          : `data:image/png;base64,${image}`;

        content.push({
          type: 'image_url',
          image_url: { url: imageUrl },
        });
      }

      messages.push({ role: 'user', content });
    } else {
      messages.push({ role: 'user', content: userMessage });
    }

    // Build request
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.config.apiKey}`,
      'Content-Type': 'application/json',
    };

    if (this.config.siteUrl) {
      headers['HTTP-Referer'] = this.config.siteUrl;
    }
    if (this.config.siteName) {
      headers['X-Title'] = this.config.siteName;
    }

    const body = JSON.stringify({
      model: this.config.model,
      messages,
      max_tokens: this.config.maxTokens,
      temperature: this.config.temperature,
    });

    // Make request with timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers,
        body,
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => 'Unknown error');
        throw new Error(`OpenRouter API error ${response.status}: ${errorBody}`);
      }

      const data = await response.json() as {
        choices?: Array<{ message?: { content?: string } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
      };

      const content = data.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error('Empty response from OpenRouter');
      }

      return { content, usage: data.usage };
    } finally {
      clearTimeout(timeout);
    }
  }
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Create an InferenceFunction that calls OpenRouter.
 *
 * Usage:
 *   const infer = createOpenRouterInference({
 *     apiKey: 'sk-or-...',
 *     model: 'anthropic/claude-sonnet-4-5-20250929',
 *   });
 *
 *   const loop = new NavigationLoop(bridge, infer);
 */
export function createOpenRouterInference(
  config: Partial<OpenRouterConfig> & { apiKey: string }
): InferenceFunction {
  const adapter = new OpenRouterInference(config);
  return adapter.createInferenceFunction();
}

/**
 * Create an OpenRouterInference instance for direct use
 * (gives access to stats and configuration).
 */
export function createOpenRouterAdapter(
  config: Partial<OpenRouterConfig> & { apiKey: string }
): OpenRouterInference {
  return new OpenRouterInference(config);
}
