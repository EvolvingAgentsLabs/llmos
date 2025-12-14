'use client';

import { useState } from 'react';
import { LLMStorage, AVAILABLE_MODELS, type ModelId } from '@/lib/llm-client';

interface APIKeySetupProps {
  onComplete: () => void;
}

export default function APIKeySetup({ onComplete }: APIKeySetupProps) {
  const [apiKey, setApiKey] = useState('');
  const [selectedModel, setSelectedModel] = useState<ModelId>('claude-opus-4.5');
  const [error, setError] = useState('');
  const [isValid, setIsValid] = useState(false);

  const handleApiKeyChange = (value: string) => {
    setApiKey(value);
    setError('');
    // OpenRouter key validation
    setIsValid(value.startsWith('sk-or-v1-') && value.length > 20);
  };

  const handleSave = () => {
    if (!isValid) {
      setError('Invalid OpenRouter API key format. Key should start with "sk-or-v1-"');
      return;
    }

    // Save to localStorage (always using OpenRouter)
    LLMStorage.saveProvider('openrouter');
    LLMStorage.saveApiKey(apiKey);
    LLMStorage.saveModel(selectedModel);

    // Complete setup
    onComplete();
  };

  // All models are available with OpenRouter
  const availableModels = Object.entries(AVAILABLE_MODELS);

  return (
    <div className="min-h-screen flex items-center justify-center bg-terminal-bg-primary p-4">
      <div className="terminal-panel max-w-2xl w-full">
        <div className="mb-6">
          <h1 className="terminal-heading text-lg mb-2">Welcome to LLMos-Lite</h1>
          <p className="text-terminal-fg-secondary text-sm">
            Enter your OpenRouter API key to get started
          </p>
        </div>

        {/* API Key Input */}
        <div className="mb-6">
          <h2 className="terminal-heading text-xs mb-3">OPENROUTER API KEY</h2>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => handleApiKeyChange(e.target.value)}
            placeholder="Enter your OpenRouter API key (sk-or-v1-...)"
            className="terminal-input w-full"
          />
          <div className="mt-2 flex items-center justify-between">
            <div className="flex flex-col gap-1">
              <a
                href="https://openrouter.ai/keys"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-terminal-accent-blue hover:underline"
              >
                Get your free OpenRouter API key →
              </a>
              <a
                href="https://openrouter.ai/models/?q=free"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-terminal-accent-green hover:underline"
              >
                Browse free models →
              </a>
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
            and never sent to our servers. All LLM requests go directly to OpenRouter.
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
