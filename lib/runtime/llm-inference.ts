/**
 * LLM Inference Adapters for Navigation Runtime
 *
 * Provides InferenceFunction implementations for use with NavigationLoop.
 * Two adapters:
 *
 *   1. **OpenRouter**: Calls Qwen3-VL-8B-Instruct via OpenRouter API
 *      for real navigation decisions. Supports multimodal input
 *      (text + map image + camera frame).
 *
 *   2. **Mock**: Deterministic strategy for CI testing.
 *      Parses candidates from prompt, picks highest-scoring one.
 *
 * Both implement the InferenceFunction type:
 *   (systemPrompt, userMessage, images?) => Promise<string>
 */

import type { InferenceFunction } from './navigation-loop';

// =============================================================================
// Types
// =============================================================================

export interface OpenRouterConfig {
  /** OpenRouter API key (default: process.env.OPENROUTER_API_KEY) */
  apiKey?: string;
  /** Model ID (default: 'qwen/qwen3-vl-8b-instruct') */
  model: string;
  /** Temperature (default: 0.2 for deterministic navigation) */
  temperature: number;
  /** Max tokens for response (default: 512) */
  maxTokens: number;
  /** Request timeout in ms (default: 10000) */
  timeoutMs: number;
  /** Base URL (default: 'https://openrouter.ai/api/v1') */
  baseUrl: string;
}

const DEFAULT_OPENROUTER_CONFIG: OpenRouterConfig = {
  model: 'qwen/qwen3-vl-8b-instruct',
  temperature: 0.2,
  maxTokens: 512,
  timeoutMs: 10000,
  baseUrl: 'https://openrouter.ai/api/v1',
};

// =============================================================================
// OpenRouter Inference Adapter
// =============================================================================

/**
 * Create an InferenceFunction that calls OpenRouter.
 *
 * Usage:
 * ```typescript
 * const infer = createOpenRouterInference({ apiKey: 'sk-...' });
 * const loop = new NavigationLoop(bridge, infer);
 * ```
 */
export function createOpenRouterInference(
  config: Partial<OpenRouterConfig> = {}
): InferenceFunction {
  const cfg: OpenRouterConfig = { ...DEFAULT_OPENROUTER_CONFIG, ...config };
  const apiKey = cfg.apiKey ?? process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    throw new Error(
      'OpenRouter API key required. Set OPENROUTER_API_KEY env var or pass apiKey in config.'
    );
  }

  return async (
    systemPrompt: string,
    userMessage: string,
    images?: string[]
  ): Promise<string> => {
    // Build message content
    const userContent: Array<
      | { type: 'text'; text: string }
      | { type: 'image_url'; image_url: { url: string; detail?: string } }
    > = [];

    // Add images first (map + camera)
    if (images) {
      for (const img of images) {
        const url = img.startsWith('data:') ? img : `data:image/png;base64,${img}`;
        userContent.push({
          type: 'image_url',
          image_url: { url, detail: 'low' },
        });
      }
    }

    // Add text prompt
    userContent.push({ type: 'text', text: userMessage });

    const body = {
      model: cfg.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      temperature: cfg.temperature,
      max_tokens: cfg.maxTokens,
      response_format: { type: 'json_object' },
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), cfg.timeoutMs);

    try {
      const response = await fetch(`${cfg.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': 'https://github.com/EvolvingAgentsLabs/llmos',
          'X-Title': 'LLMos Navigation Runtime',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenRouter API error ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;

      if (!content) {
        throw new Error('Empty response from OpenRouter');
      }

      return content;
    } finally {
      clearTimeout(timeout);
    }
  };
}

// =============================================================================
// Mock Inference Adapter (for CI/testing)
// =============================================================================

/**
 * Create a deterministic mock InferenceFunction for testing.
 *
 * Strategy:
 * - Parses candidates from the prompt text
 * - Picks the highest-scoring candidate
 * - Returns a valid LLMNavigationDecision JSON
 * - Prefers recovery candidates when stuck
 */
export function createMockInference(): InferenceFunction {
  return async (
    _systemPrompt: string,
    userMessage: string,
    _images?: string[]
  ): Promise<string> => {
    // Parse candidates from prompt
    const candidates = parseCandidatesFromPrompt(userMessage);
    const isStuck = userMessage.includes('"is_stuck": true') ||
                    userMessage.includes('"is_stuck":true');

    // Pick best candidate
    let target: { id: string; type: string; score: number } | null = null;

    if (isStuck) {
      // Prefer recovery candidates when stuck
      target = candidates.find(c => c.type === 'recovery') ?? candidates[0] ?? null;
    } else {
      // Pick highest score
      target = candidates.sort((a, b) => b.score - a.score)[0] ?? null;
    }

    if (target) {
      const actionType = target.type === 'frontier' ? 'EXPLORE' : 'MOVE_TO';
      return JSON.stringify({
        action: {
          type: actionType,
          target_id: target.id,
        },
        fallback: {
          if_failed: 'EXPLORE',
        },
        explanation: `Mock: selected ${target.id} (${target.type}, score=${target.score.toFixed(2)})`,
      });
    }

    // No candidates — rotate to scan
    return JSON.stringify({
      action: {
        type: 'ROTATE_TO',
        yaw_deg: 90,
      },
      fallback: {
        if_failed: 'STOP',
      },
      explanation: 'Mock: no candidates available, rotating to scan',
    });
  };
}

// =============================================================================
// Helpers
// =============================================================================

interface ParsedCandidate {
  id: string;
  type: string;
  score: number;
}

function parseCandidatesFromPrompt(prompt: string): ParsedCandidate[] {
  const candidates: ParsedCandidate[] = [];

  // Match patterns like: c1 [subgoal] (1.50, 1.50) score=0.85
  // or: "id": "c1", "type": "subgoal", ... "score": 0.85
  const linePattern = /(\w+)\s+\[(\w+)\]\s+\([^)]+\)\s+score=([\d.]+)/g;
  let match;

  while ((match = linePattern.exec(prompt)) !== null) {
    candidates.push({
      id: match[1],
      type: match[2],
      score: parseFloat(match[3]),
    });
  }

  // Also try JSON array pattern
  if (candidates.length === 0) {
    const jsonPattern = /"id"\s*:\s*"(\w+)"[^}]*"type"\s*:\s*"(\w+)"[^}]*"score"\s*:\s*([\d.]+)/g;
    while ((match = jsonPattern.exec(prompt)) !== null) {
      candidates.push({
        id: match[1],
        type: match[2],
        score: parseFloat(match[3]),
      });
    }
  }

  return candidates;
}
