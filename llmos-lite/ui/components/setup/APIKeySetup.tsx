'use client';

import { useState } from 'react';
import { LLMStorage, AVAILABLE_MODELS, type ModelId } from '@/lib/llm-client';

interface APIKeySetupProps {
  onComplete: () => void;
}

export default function APIKeySetup({ onComplete }: APIKeySetupProps) {
  const [provider, setProvider] = useState<'openrouter' | 'anthropic' | 'openai'>('openrouter');
  const [apiKey, setApiKey] = useState('');
  const [selectedModel, setSelectedModel] = useState<ModelId>('claude-opus-4.5');
  const [error, setError] = useState('');
  const [isValid, setIsValid] = useState(false);

  const handleApiKeyChange = (value: string) => {
    setApiKey(value);
    setError('');

    // Basic validation
    if (provider === 'openrouter') {
      setIsValid(value.startsWith('sk-or-v1-'));
    } else if (provider === 'anthropic') {
      setIsValid(value.startsWith('sk-ant-'));
    } else if (provider === 'openai') {
      setIsValid(value.startsWith('sk-'));
    }
  };

  const handleSave = () => {
    if (!isValid) {
      setError('Invalid API key format');
      return;
    }

    // Save to localStorage
    LLMStorage.saveProvider(provider);
    LLMStorage.saveApiKey(apiKey);
    LLMStorage.saveModel(selectedModel);

    // Complete setup
    onComplete();
  };

  const getProviderInfo = () => {
    switch (provider) {
      case 'openrouter':
        return {
          name: 'OpenRouter',
          url: 'https://openrouter.ai/keys',
          prefix: 'sk-or-v1-',
          description: 'Access Claude, GPT, and free models through one API',
        };
      case 'anthropic':
        return {
          name: 'Anthropic',
          url: 'https://console.anthropic.com/settings/keys',
          prefix: 'sk-ant-',
          description: 'Direct access to Claude models',
        };
      case 'openai':
        return {
          name: 'OpenAI',
          url: 'https://platform.openai.com/api-keys',
          prefix: 'sk-',
          description: 'Direct access to GPT models',
        };
    }
  };

  const providerInfo = getProviderInfo();

  // Filter models by provider
  const availableModels = Object.entries(AVAILABLE_MODELS).filter(([_, model]) => {
    if (provider === 'openrouter') return true; // OpenRouter supports all
    if (provider === 'anthropic') return model.provider === 'Anthropic';
    if (provider === 'openai') return model.provider === 'OpenAI';
    return false;
  });

  return (
    <div className="min-h-screen flex items-center justify-center bg-terminal-bg-primary p-4">
      <div className="terminal-panel max-w-2xl w-full">
        <div className="mb-6">
          <h1 className="terminal-heading text-lg mb-2">Welcome to LLMos-Lite</h1>
          <p className="text-terminal-fg-secondary text-sm">
            Configure your LLM provider to get started
          </p>
        </div>

        {/* Provider Selection */}
        <div className="mb-6">
          <h2 className="terminal-heading text-xs mb-3">API PROVIDER</h2>
          <div className="space-y-2">
            <label className="flex items-center gap-3 p-3 rounded cursor-pointer terminal-hover border border-terminal-border">
              <input
                type="radio"
                name="provider"
                value="openrouter"
                checked={provider === 'openrouter'}
                onChange={() => setProvider('openrouter')}
                className="w-4 h-4"
              />
              <div className="flex-1">
                <div className="text-sm text-terminal-fg-primary font-medium">
                  OpenRouter (Recommended)
                </div>
                <div className="text-xs text-terminal-fg-secondary">
                  Access Claude, GPT, and{' '}
                  <a
                    href="https://openrouter.ai/models/?q=free"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-terminal-accent-blue hover:underline"
                  >
                    free models
                  </a>
                  {' '}through one API
                </div>
              </div>
            </label>

            <label className="flex items-center gap-3 p-3 rounded cursor-pointer terminal-hover border border-terminal-border">
              <input
                type="radio"
                name="provider"
                value="anthropic"
                checked={provider === 'anthropic'}
                onChange={() => setProvider('anthropic')}
                className="w-4 h-4"
              />
              <div className="flex-1">
                <div className="text-sm text-terminal-fg-primary font-medium">
                  Anthropic (Claude only)
                </div>
                <div className="text-xs text-terminal-fg-secondary">
                  Direct access to Claude models
                </div>
              </div>
            </label>

            <label className="flex items-center gap-3 p-3 rounded cursor-pointer terminal-hover border border-terminal-border">
              <input
                type="radio"
                name="provider"
                value="openai"
                checked={provider === 'openai'}
                onChange={() => setProvider('openai')}
                className="w-4 h-4"
              />
              <div className="flex-1">
                <div className="text-sm text-terminal-fg-primary font-medium">
                  OpenAI (GPT only)
                </div>
                <div className="text-xs text-terminal-fg-secondary">
                  Direct access to GPT models
                </div>
              </div>
            </label>
          </div>
        </div>

        {/* API Key Input */}
        <div className="mb-6">
          <h2 className="terminal-heading text-xs mb-3">{providerInfo.name.toUpperCase()} API KEY</h2>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => handleApiKeyChange(e.target.value)}
            placeholder={`Enter your ${providerInfo.name} API key (${providerInfo.prefix}...)`}
            className="terminal-input w-full"
          />
          <div className="mt-2 flex items-center justify-between">
            <div className="flex flex-col gap-1">
              <a
                href={providerInfo.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-terminal-accent-blue hover:underline"
              >
                Get your {providerInfo.name} API key →
              </a>
              {provider === 'openrouter' && (
                <a
                  href="https://openrouter.ai/models/?q=free"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-terminal-accent-green hover:underline"
                >
                  Browse free models →
                </a>
              )}
            </div>
            {isValid && (
              <span className="text-xs text-terminal-accent-green">
                ✓ Valid format
              </span>
            )}
          </div>
          {error && (
            <div className="mt-2 text-xs text-terminal-accent-red">
              {error}
            </div>
          )}
        </div>

        {/* Model Selection */}
        <div className="mb-6">
          <h2 className="terminal-heading text-xs mb-3">MODEL SELECTION</h2>
          <div className="space-y-2">
            {availableModels.map(([modelId, model]) => (
              <label
                key={modelId}
                className="flex items-center gap-3 p-3 rounded cursor-pointer terminal-hover border border-terminal-border"
              >
                <input
                  type="radio"
                  name="model"
                  value={modelId}
                  checked={selectedModel === modelId}
                  onChange={() => setSelectedModel(modelId as ModelId)}
                  className="w-4 h-4"
                />
                <div className="flex-1">
                  <div className="text-sm text-terminal-fg-primary font-medium flex items-center gap-2">
                    {model.name}
                    {model.inputCost === '$0/M tokens' && (
                      <span className="git-badge git-badge-committed">FREE</span>
                    )}
                  </div>
                  <div className="text-xs text-terminal-fg-secondary">
                    {model.inputCost} input, {model.outputCost} output • {model.contextWindow}
                  </div>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Privacy Notice */}
        <div className="mb-6 p-3 bg-terminal-bg-tertiary border border-terminal-border rounded">
          <div className="text-xs text-terminal-fg-secondary">
            🔒 <span className="text-terminal-accent-green">Privacy:</span> Your API key is stored locally in your browser
            and never sent to our servers. All LLM requests go directly to {providerInfo.name}.
          </div>
        </div>

        {/* Save Button */}
        <div className="flex gap-3">
          <button
            onClick={handleSave}
            disabled={!isValid}
            className="btn-terminal flex-1 py-2"
          >
            Save Configuration
          </button>
        </div>
      </div>
    </div>
  );
}
