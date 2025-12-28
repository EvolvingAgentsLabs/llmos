/**
 * LLM Client for OpenRouter
 *
 * Supports multiple models through OpenRouter API
 */

import { logger } from '@/lib/debug/logger';

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ChatRequest {
  user_id: string;
  team_id: string;
  message: string;
  session_id?: string;
  include_skills?: boolean;
  max_skills?: number;
  model?: string;
}

export interface ChatResponse {
  response: string;
  skills_used: string[];
  trace_id: string;
  session_id: string;
  model_used?: string;
}

export interface LLMConfig {
  apiKey: string;
  model: string;
  siteUrl?: string;
}

export const AVAILABLE_MODELS = {
  // Anthropic Claude 4.5
  'claude-opus-4.5': {
    id: 'anthropic/claude-opus-4.5',
    name: 'Claude Opus 4.5',
    provider: 'Anthropic',
    inputCost: '$15/M tokens',
    outputCost: '$75/M tokens',
    contextWindow: '200K tokens',
  },
  'claude-sonnet-4.5': {
    id: 'anthropic/claude-sonnet-4.5',
    name: 'Claude Sonnet 4.5',
    provider: 'Anthropic',
    inputCost: '$3/M tokens',
    outputCost: '$15/M tokens',
    contextWindow: '200K tokens',
  },
} as const;

export type ModelId = keyof typeof AVAILABLE_MODELS;

export class LLMClient {
  private config: LLMConfig;

  constructor(config: LLMConfig) {
    this.config = config;
  }

  /**
   * Chat with LLM through Vercel API proxy (NOT RECOMMENDED for multi-user apps)
   *
   * WARNING: This method sends your API key to the Vercel server.
   * For hosted apps where users bring their own keys, use chatDirect() instead.
   *
   * @deprecated Use chatDirect() to keep API keys client-side only
   */
  async chat(request: ChatRequest): Promise<ChatResponse> {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.config.apiKey,
        'X-Model': this.config.model,
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Chat request failed');
    }

    return response.json();
  }

  /**
   * Direct client-side OpenRouter call (RECOMMENDED)
   *
   * This method calls OpenRouter directly from the browser.
   * Your API key never leaves the client - it goes straight to OpenRouter.
   *
   * Perfect for hosted apps where each user brings their own API key.
   *
   * @param messages - Array of conversation messages with role and content
   * @param options - Optional configuration for skills loading
   * @returns The assistant's response text
   */
  async chatDirect(
    messages: Message[],
    options?: {
      includeSkills?: boolean;
      volume?: 'user' | 'team' | 'system';
    }
  ): Promise<string> {
    logger.time('llm-request', 'llm', 'OpenRouter API call', {
      model: this.config.model,
      messageCount: messages.length,
    });

    // Prepare messages with optional skill context
    let finalMessages = [...messages];

    // Load skills if requested
    if (options?.includeSkills) {
      try {
        const skillContext = await this.loadSkillContext(options.volume || 'user');
        if (skillContext) {
          // Inject skills as system message before user messages
          finalMessages = [
            { role: 'system', content: skillContext },
            ...messages
          ];
          logger.debug('llm', `Injected skill context from ${options.volume || 'user'} volume`);
        }
      } catch (error) {
        logger.warn('llm', 'Failed to load skills, continuing without them', { error });
      }
    }

    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'HTTP-Referer': this.config.siteUrl || window.location.origin,
          'X-Title': 'LLMos-Lite',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.config.model,
          messages: finalMessages,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error('llm', `OpenRouter API error (${response.status})`, { errorText });
        logger.timeEnd('llm-request', false);

        // Try to parse error as JSON for better error messages
        try {
          const errorJson = JSON.parse(errorText);
          throw new Error(`OpenRouter API error (${response.status}): ${errorJson.error?.message || errorText}`);
        } catch (parseError) {
          throw new Error(`OpenRouter API error (${response.status}): ${errorText}`);
        }
      }

      const data = await response.json();

      if (!data.choices || !data.choices[0] || !data.choices[0].message) {
        logger.error('llm', 'Unexpected response structure', { data });
        logger.timeEnd('llm-request', false);
        throw new Error('Invalid response structure from OpenRouter API');
      }

      const content = data.choices[0].message.content;
      logger.timeEnd('llm-request', true, {
        tokensUsed: data.usage?.total_tokens,
        model: data.model,
      });
      return content;
    } catch (error) {
      logger.error('llm', 'Request failed', { error: error instanceof Error ? error.message : error });
      throw error;
    }
  }

  /**
   * Load skill context from GitHub volumes
   * Skills are auto-generated by the evolution engine
   */
  private async loadSkillContext(volume: 'user' | 'team' | 'system'): Promise<string | null> {
    try {
      // Dynamically import to avoid circular dependency
      const { GitService } = await import('./git-service');

      const skills = await GitService.fetchSkills(volume);

      if (skills.length === 0) {
        logger.debug('llm', `No skills found in ${volume} volume`);
        return null;
      }

      logger.info('llm', `Loaded ${skills.length} skills from ${volume} volume`);

      // Format skills as context
      const skillContext = `# Available Skills

You have access to the following skills that were learned from previous sessions:

${skills.map((skill, idx) => `## ${idx + 1}. ${skill.name}

${skill.content}

---`).join('\n\n')}

Use these skills to provide better, more context-aware responses.`;

      return skillContext;
    } catch (error) {
      logger.error('llm', 'Failed to load skills', { error });
      return null;
    }
  }

  /**
   * Update API key
   */
  setApiKey(apiKey: string) {
    this.config.apiKey = apiKey;
  }

  /**
   * Update model
   */
  setModel(model: string) {
    this.config.model = model;
  }

  /**
   * Get current config
   */
  getConfig(): LLMConfig {
    return { ...this.config };
  }
}

/**
 * Local storage helpers for API key and model persistence
 */
export const LLMStorage = {
  STORAGE_KEYS: {
    API_KEY: 'llmos_openrouter_api_key',
    MODEL: 'llmos_selected_model',
    PROVIDER: 'llmos_provider',
  },

  saveApiKey(apiKey: string) {
    if (typeof window !== 'undefined') {
      localStorage.setItem(this.STORAGE_KEYS.API_KEY, apiKey);
    }
  },

  getApiKey(): string | null {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(this.STORAGE_KEYS.API_KEY);
    }
    return null;
  },

  saveModel(modelId: ModelId) {
    if (typeof window !== 'undefined') {
      localStorage.setItem(this.STORAGE_KEYS.MODEL, modelId);
    }
  },

  getModel(): ModelId | null {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(this.STORAGE_KEYS.MODEL) as ModelId;
    }
    return null;
  },

  saveProvider(provider: 'openrouter' | 'anthropic' | 'openai') {
    if (typeof window !== 'undefined') {
      localStorage.setItem(this.STORAGE_KEYS.PROVIDER, provider);
    }
  },

  getProvider(): string | null {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(this.STORAGE_KEYS.PROVIDER);
    }
    return null;
  },

  clearAll() {
    if (typeof window !== 'undefined') {
      Object.values(this.STORAGE_KEYS).forEach(key => {
        localStorage.removeItem(key);
      });
    }
  },

  isConfigured(): boolean {
    return !!this.getApiKey() && !!this.getModel();
  },
};

/**
 * Create LLM client from stored config
 */
export function createLLMClient(): LLMClient | null {
  const apiKey = LLMStorage.getApiKey();
  const modelId = LLMStorage.getModel();

  if (!apiKey || !modelId) {
    logger.warn('llm', 'Missing configuration', { hasApiKey: !!apiKey, hasModelId: !!modelId });
    return null;
  }

  // Check if model exists in AVAILABLE_MODELS
  const model = AVAILABLE_MODELS[modelId];

  // Use the model ID from AVAILABLE_MODELS if it exists,
  // otherwise use the custom model ID directly
  const actualModelId = model ? model.id : modelId;

  const client = new LLMClient({
    apiKey,
    model: actualModelId,
  });

  logger.success('llm', 'LLM client initialized', { model: actualModelId });
  return client;
}
