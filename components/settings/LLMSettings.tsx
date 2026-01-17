'use client';

import { useState, useEffect } from 'react';
import { LLMStorage, AVAILABLE_MODELS, PROVIDER_BASE_URLS } from '@/lib/llm-client';

interface LLMSettingsProps {
  onClose: () => void;
}

export default function LLMSettings({ onClose }: LLMSettingsProps) {
  const [apiKey, setApiKey] = useState('');
  const [modelName, setModelName] = useState('');
  const [customModelName, setCustomModelName] = useState('');
  const [provider, setProvider] = useState('openrouter');
  const [baseUrl, setBaseUrl] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [editMode, setEditMode] = useState(false);

  useEffect(() => {
    // Load current settings
    const currentApiKey = LLMStorage.getApiKey() || '';
    const currentModel = LLMStorage.getModel() || '';
    const currentProvider = LLMStorage.getProvider() || 'openrouter';
    const currentBaseUrl = LLMStorage.getBaseUrl();
    const currentCustomModel = LLMStorage.getCustomModel() || '';

    setApiKey(currentApiKey);
    setModelName(currentModel);
    setProvider(currentProvider);
    setBaseUrl(currentBaseUrl);
    setCustomModelName(currentCustomModel);
  }, []);

  const handleSave = () => {
    const finalModel = modelName === 'custom' ? customModelName : modelName;

    if (!apiKey.trim()) {
      alert('Please enter an API key');
      return;
    }

    if (!finalModel.trim()) {
      alert('Please select or enter a model name');
      return;
    }

    // Save configuration
    LLMStorage.saveProvider(provider);
    LLMStorage.saveApiKey(apiKey);
    LLMStorage.saveBaseUrl(baseUrl);
    LLMStorage.saveModel(finalModel as any);

    if (modelName === 'custom') {
      LLMStorage.saveCustomModel(customModelName);
    }

    console.log('[LLMSettings] Configuration updated:');
    console.log('  - API Key (first 20 chars):', apiKey.substring(0, 20) + '...');
    console.log('  - Model:', finalModel);
    console.log('  - Provider:', provider);
    console.log('  - Base URL:', baseUrl);

    setEditMode(false);

    // Show success message
    alert('LLM configuration updated successfully! The new settings will be used for the next request.');
  };

  const handleProviderChange = (newProvider: string) => {
    setProvider(newProvider);
    // Auto-update base URL when provider changes
    if (PROVIDER_BASE_URLS[newProvider]) {
      setBaseUrl(PROVIDER_BASE_URLS[newProvider]);
    }
  };

  const maskApiKey = (key: string) => {
    if (!key) return '';
    if (key.length <= 8) return '•'.repeat(key.length);
    return key.substring(0, 4) + '•'.repeat(key.length - 8) + key.substring(key.length - 4);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
      <div className="card-elevated max-w-lg w-full max-h-[90vh] overflow-y-auto animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="heading-3">LLM Configuration</h1>
            <p className="text-xs text-fg-secondary mt-1">
              Configure your OpenRouter API key and model
            </p>
          </div>
          <button
            onClick={onClose}
            className="btn-icon"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Settings Fields */}
        <div className="space-y-4 mb-6">
          {/* Provider */}
          <div>
            <label className="block text-xs text-fg-secondary mb-1.5 font-medium">
              Provider
            </label>
            {editMode ? (
              <select
                value={provider}
                onChange={(e) => handleProviderChange(e.target.value)}
                className="input w-full"
              >
                <option value="openrouter">OpenRouter</option>
                <option value="gemini">Google Gemini</option>
                <option value="openai">OpenAI</option>
                <option value="groq">Groq</option>
                <option value="together">Together AI</option>
              </select>
            ) : (
              <div className="input bg-bg-tertiary">
                {provider === 'openrouter' ? 'OpenRouter' :
                 provider === 'gemini' ? 'Google Gemini' :
                 provider === 'openai' ? 'OpenAI' :
                 provider === 'groq' ? 'Groq' :
                 provider === 'together' ? 'Together AI' : provider}
              </div>
            )}
          </div>

          {/* API Key */}
          <div>
            <label className="block text-xs text-fg-secondary mb-1.5 font-medium">
              API Key
            </label>
            {editMode ? (
              <div className="relative">
                <input
                  type={showApiKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={provider === 'openrouter' ? 'sk-or-...' : 'Enter your API key'}
                  className="input w-full pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded hover:bg-bg-tertiary"
                >
                  {showApiKey ? (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
            ) : (
              <div className="input bg-bg-tertiary font-mono text-sm">
                {apiKey ? maskApiKey(apiKey) : 'Not set'}
              </div>
            )}
            {editMode && provider === 'openrouter' && (
              <a
                href="https://openrouter.ai/keys"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-accent-primary hover:underline mt-1 inline-block"
              >
                Get your API key from OpenRouter
              </a>
            )}
          </div>

          {/* Base URL */}
          <div>
            <label className="block text-xs text-fg-secondary mb-1.5 font-medium">
              Base URL
            </label>
            {editMode ? (
              <input
                type="text"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://openrouter.ai/api/v1/"
                className="input w-full font-mono text-sm"
              />
            ) : (
              <div className="input bg-bg-tertiary font-mono text-sm break-all">
                {baseUrl}
              </div>
            )}
            <p className="text-xs text-fg-tertiary mt-1">
              OpenAI-compatible API endpoint
            </p>
          </div>

          {/* Model Selection */}
          <div>
            <label className="block text-xs text-fg-secondary mb-1.5 font-medium">
              Model
            </label>
            {editMode ? (
              <div className="space-y-2">
                <button
                  onClick={() => setModelName('xiaomi/mimo-v2-flash:free')}
                  type="button"
                  className={`w-full text-left p-3 rounded border transition-colors ${
                    modelName === 'xiaomi/mimo-v2-flash:free'
                      ? 'border-accent-primary bg-accent-primary/10'
                      : 'border-border-primary bg-bg-tertiary hover:border-border-secondary'
                  }`}
                >
                  <code className="text-sm text-accent-info">xiaomi/mimo-v2-flash:free</code>
                  <p className="text-xs text-fg-tertiary mt-1">Free • Fast • Recommended</p>
                </button>

                <button
                  onClick={() => setModelName('google/gemini-3-flash-preview')}
                  type="button"
                  className={`w-full text-left p-3 rounded border transition-colors ${
                    modelName === 'google/gemini-3-flash-preview'
                      ? 'border-accent-primary bg-accent-primary/10'
                      : 'border-border-primary bg-bg-tertiary hover:border-border-secondary'
                  }`}
                >
                  <code className="text-sm text-accent-info">google/gemini-3-flash-preview</code>
                  <p className="text-xs text-fg-tertiary mt-1">Google • 1M context window</p>
                </button>

                <button
                  onClick={() => setModelName('anthropic/claude-haiku-4.5')}
                  type="button"
                  className={`w-full text-left p-3 rounded border transition-colors ${
                    modelName === 'anthropic/claude-haiku-4.5'
                      ? 'border-accent-primary bg-accent-primary/10'
                      : 'border-border-primary bg-bg-tertiary hover:border-border-secondary'
                  }`}
                >
                  <code className="text-sm text-accent-info">anthropic/claude-haiku-4.5</code>
                  <p className="text-xs text-fg-tertiary mt-1">Anthropic • High quality</p>
                </button>

                <button
                  onClick={() => setModelName('custom')}
                  type="button"
                  className={`w-full text-left p-3 rounded border transition-colors ${
                    modelName === 'custom'
                      ? 'border-accent-primary bg-accent-primary/10'
                      : 'border-border-primary bg-bg-tertiary hover:border-border-secondary'
                  }`}
                >
                  <code className="text-sm text-accent-info">Custom Model</code>
                  <p className="text-xs text-fg-tertiary mt-1">Enter your own model ID</p>
                </button>

                {modelName === 'custom' && (
                  <div className="mt-2 pl-3">
                    <input
                      type="text"
                      value={customModelName}
                      onChange={(e) => setCustomModelName(e.target.value)}
                      placeholder="e.g., meta-llama/llama-3.1-8b-instruct:free"
                      className="input w-full text-sm font-mono"
                    />
                    <p className="text-xs text-fg-tertiary mt-1">
                      Find models at{' '}
                      <a
                        href="https://openrouter.ai/models"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-accent-primary hover:underline"
                      >
                        openrouter.ai/models
                      </a>
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="input bg-bg-tertiary font-mono text-sm">
                {modelName === 'custom' && customModelName ? customModelName : modelName}
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="space-y-3">
          {editMode ? (
            <div className="flex gap-3">
              <button
                onClick={handleSave}
                className="btn-primary flex-1"
              >
                Save Changes
              </button>
              <button
                onClick={() => {
                  // Reload original values
                  const currentApiKey = LLMStorage.getApiKey() || '';
                  const currentModel = LLMStorage.getModel() || '';
                  const currentProvider = LLMStorage.getProvider() || 'openrouter';
                  const currentBaseUrl = LLMStorage.getBaseUrl();
                  const currentCustomModel = LLMStorage.getCustomModel() || '';

                  setApiKey(currentApiKey);
                  setModelName(currentModel);
                  setProvider(currentProvider);
                  setBaseUrl(currentBaseUrl);
                  setCustomModelName(currentCustomModel);
                  setEditMode(false);
                }}
                className="btn-secondary flex-1"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setEditMode(true)}
              className="btn-primary w-full"
            >
              Edit Configuration
            </button>
          )}
        </div>

        {/* Info Note */}
        <div className="mt-6 p-3 bg-bg-tertiary border border-border-primary rounded-lg">
          <p className="text-xs text-fg-secondary leading-relaxed">
            <span className="text-accent-info font-medium">API Endpoint:</span> All requests go to{' '}
            <code className="text-accent-info">{baseUrl}chat/completions</code>
            <br />
            <span className="text-accent-warning font-medium">Note:</span> Your API key is stored locally and never sent to our servers.
          </p>
        </div>
      </div>
    </div>
  );
}
