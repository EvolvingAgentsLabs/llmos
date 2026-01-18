/**
 * LLM Storage
 *
 * Local storage helpers for API key and model persistence
 */

const STORAGE_KEYS = {
  API_KEY: 'llmos_api_key',
  MODEL: 'llmos_selected_model',
  PROVIDER: 'llmos_provider',
  CUSTOM_MODEL: 'llmos_custom_model',
  BASE_URL: 'llmos_base_url',
} as const;

// Default base URL for Gemini's OpenAI-compatible API
export const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/';

// Known provider base URLs for easy switching
export const PROVIDER_BASE_URLS: Record<string, string> = {
  gemini: 'https://generativelanguage.googleapis.com/v1beta/openai/',
  openai: 'https://api.openai.com/v1/',
  openrouter: 'https://openrouter.ai/api/v1/',
  together: 'https://api.together.xyz/v1/',
  groq: 'https://api.groq.com/openai/v1/',
};

export const LLMStorage = {
  STORAGE_KEYS,

  saveApiKey(apiKey: string): void {
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEYS.API_KEY, apiKey);
    }
  },

  getApiKey(): string | null {
    if (typeof window !== 'undefined') {
      // Check for new key first
      let apiKey = localStorage.getItem(STORAGE_KEYS.API_KEY);

      // Migration: check for old key name and migrate
      if (!apiKey) {
        const oldKey = localStorage.getItem('llmos_google_api_key');
        if (oldKey) {
          // Migrate to new key
          localStorage.setItem(STORAGE_KEYS.API_KEY, oldKey);
          localStorage.removeItem('llmos_google_api_key');
          apiKey = oldKey;
        }
      }

      return apiKey;
    }
    return null;
  },

  saveModel(modelId: string): void {
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEYS.MODEL, modelId);
      // Dispatch custom event for same-tab synchronization
      window.dispatchEvent(new CustomEvent('llmos:model-changed', { detail: { modelId } }));
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

  saveProvider(provider: string): void {
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEYS.PROVIDER, provider);
      // Also set the corresponding base URL if known
      if (PROVIDER_BASE_URLS[provider]) {
        localStorage.setItem(STORAGE_KEYS.BASE_URL, PROVIDER_BASE_URLS[provider]);
      }
    }
  },

  getProvider(): string | null {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(STORAGE_KEYS.PROVIDER);
    }
    return null;
  },

  saveBaseUrl(baseUrl: string): void {
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEYS.BASE_URL, baseUrl);
    }
  },

  getBaseUrl(): string {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(STORAGE_KEYS.BASE_URL) || DEFAULT_BASE_URL;
    }
    return DEFAULT_BASE_URL;
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
