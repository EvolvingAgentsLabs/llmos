/**
 * LLM Storage
 *
 * Local storage helpers for API key and model persistence
 */

const STORAGE_KEYS = {
  API_KEY: 'llmos_openrouter_api_key',
  MODEL: 'llmos_selected_model',
  PROVIDER: 'llmos_provider',
  CUSTOM_MODEL: 'llmos_custom_model',
} as const;

export const LLMStorage = {
  STORAGE_KEYS,

  saveApiKey(apiKey: string): void {
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEYS.API_KEY, apiKey);
    }
  },

  getApiKey(): string | null {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(STORAGE_KEYS.API_KEY);
    }
    return null;
  },

  saveModel(modelId: string): void {
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEYS.MODEL, modelId);
    }
  },

  getModel(): string | null {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(STORAGE_KEYS.MODEL);
    }
    return null;
  },

  saveCustomModel(modelId: string): void {
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEYS.CUSTOM_MODEL, modelId);
    }
  },

  getCustomModel(): string | null {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(STORAGE_KEYS.CUSTOM_MODEL);
    }
    return null;
  },

  saveProvider(provider: 'openrouter' | 'anthropic' | 'openai'): void {
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEYS.PROVIDER, provider);
    }
  },

  getProvider(): string | null {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(STORAGE_KEYS.PROVIDER);
    }
    return null;
  },

  clearAll(): void {
    if (typeof window !== 'undefined') {
      Object.values(STORAGE_KEYS).forEach(key => {
        localStorage.removeItem(key);
      });
    }
  },

  isConfigured(): boolean {
    return !!this.getApiKey() && !!this.getModel();
  },
};
