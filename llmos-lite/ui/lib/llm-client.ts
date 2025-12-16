/**
 * LLM Client for OpenRouter
 *
 * Supports multiple models through OpenRouter API
 */

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
  // Anthropic Claude
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
  'claude-sonnet-4': {
    id: 'anthropic/claude-sonnet-4',
    name: 'Claude Sonnet 4',
    provider: 'Anthropic',
    inputCost: '$3/M tokens',
    outputCost: '$15/M tokens',
    contextWindow: '200K tokens',
  },
  // OpenAI GPT
  'gpt-5.2-pro': {
    id: 'openai/gpt-5.2-pro',
    name: 'GPT-5.2 Pro',
    provider: 'OpenAI',
    inputCost: '$20/M tokens',
    outputCost: '$100/M tokens',
    contextWindow: '128K tokens',
  },
  'gpt-4-turbo': {
    id: 'openai/gpt-4-turbo',
    name: 'GPT-4 Turbo',
    provider: 'OpenAI',
    inputCost: '$10/M tokens',
    outputCost: '$30/M tokens',
    contextWindow: '128K tokens',
  },
  // Free Models
  'kimi-k2-free': {
    id: 'moonshotai/kimi-k2:free',
    name: 'Kimi K2 (Free)',
    provider: 'MoonshotAI',
    inputCost: '$0/M tokens',
    outputCost: '$0/M tokens',
    contextWindow: '128K tokens',
  },
  'deepseek-r1t2-chimera-free': {
    id: 'tng/deepseek-r1t2-chimera:free',
    name: 'DeepSeek R1T2 Chimera (Free)',
    provider: 'TNG',
    inputCost: '$0/M tokens',
    outputCost: '$0/M tokens',
    contextWindow: '128K tokens',
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
   * @returns The assistant's response text
   */
  async chatDirect(messages: Message[]): Promise<string> {
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
        messages: messages,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenRouter API error: ${error}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
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
    return null;
  }

  // Check if model exists in AVAILABLE_MODELS
  const model = AVAILABLE_MODELS[modelId];

  // Use the model ID from AVAILABLE_MODELS if it exists,
  // otherwise use the custom model ID directly
  const actualModelId = model ? model.id : modelId;

  return new LLMClient({
    apiKey,
    model: actualModelId,
  });
}
