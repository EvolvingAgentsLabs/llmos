'use client';

import { useState } from 'react';
import { LLMStorage, AVAILABLE_MODELS, PROVIDER_BASE_URLS, type ModelId } from '@/lib/llm-client';
import { UserStorage, User, Team } from '@/lib/user-storage';

interface APIKeySetupProps {
  onComplete: () => void;
}

type SetupStep = 'welcome' | 'api-key' | 'model';

// Setup Orb - Simple CSS animated orb for setup screens
function SetupOrb({ step }: { step: SetupStep }) {
  const stepProgress = {
    'welcome': 0,
    'api-key': 50,
    'model': 100,
  };
  const progress = stepProgress[step];

  return (
    <div className="relative w-20 h-20 mx-auto mb-6">
      {/* Outer glow */}
      <div className="absolute inset-0 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 opacity-20 blur-lg animate-pulse" />

      {/* Orbital ring */}
      <div
        className="absolute inset-1 rounded-full border border-blue-400/30"
        style={{ animation: 'spin 10s linear infinite' }}
      />

      {/* Core orb */}
      <div className="absolute inset-3 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 shadow-lg shadow-blue-500/40">
        <div className="absolute inset-1 rounded-full bg-white/20" />
      </div>

      {/* Step indicator */}
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-white/90 text-xs font-bold">
          {step === 'welcome' ? '👋' : step === 'model' ? '✓' : `${Math.round(progress)}%`}
        </span>
      </div>
    </div>
  );
}

export default function APIKeySetup({ onComplete }: APIKeySetupProps) {
  // LLM config state
  const [apiKey, setApiKey] = useState('');
  const [modelName, setModelName] = useState('google/gemini-3-flash-preview');
  const [customModelName, setCustomModelName] = useState('');

  // UI state
  const [currentStep, setCurrentStep] = useState<SetupStep>('welcome');
  const [error, setError] = useState('');
  const [isValid, setIsValid] = useState(false);

  const handleApiKeyChange = (value: string) => {
    setApiKey(value);
    setError('');
    // OpenRouter API key validation (basic check for sk- prefix)
    setIsValid(value.length > 20);
  };

  const handleApiKeyNext = () => {
    if (!isValid) {
      setError('Please enter a valid OpenRouter API key');
      return;
    }
    setError('');
    setCurrentStep('model');
  };

  const handleComplete = () => {
    const finalModel = modelName === 'custom' ? customModelName : modelName;

    if (!finalModel.trim()) {
      setError('Please enter a model name');
      return;
    }

    console.log('[APIKeySetup] Saving configuration:');
    console.log('  - API Key (first 20 chars):', apiKey.substring(0, 20) + '...');
    console.log('  - Model:', finalModel);
    console.log('  - Provider: openrouter (OpenAI-compatible API)');
    console.log('  - Base URL:', PROVIDER_BASE_URLS.openrouter);

    // Save LLM config to localStorage (using OpenRouter's OpenAI-compatible endpoint)
    LLMStorage.saveProvider('openrouter');
    LLMStorage.saveApiKey(apiKey);
    LLMStorage.saveBaseUrl(PROVIDER_BASE_URLS.openrouter);
    // Save the model name directly - it will be validated in createLLMClient
    LLMStorage.saveModel(finalModel as any);
    if (modelName === 'custom') {
      LLMStorage.saveCustomModel(customModelName);
    }

    console.log('[APIKeySetup] Configuration saved to localStorage');

    // Save default user/team to localStorage
    const user: User = {
      id: `user_${Date.now()}`,
      email: 'user@llmos.local',
      name: 'User',
      created_at: new Date().toISOString(),
    };

    const team: Team = {
      id: 'default',
      name: 'default',
      created_at: new Date().toISOString(),
    };

    UserStorage.saveUser(user);
    UserStorage.saveTeam(team);

    // Complete setup
    onComplete();
  };

  // Render different steps
  const renderWelcome = () => (
    <div className="text-center max-w-md mx-auto">
      <SetupOrb step="welcome" />
      <h1 className="text-2xl font-medium mb-2 text-fg-primary">Welcome to LLMos</h1>
      <p className="text-lg text-accent-primary mb-1">Autonomous AI Runtime</p>
      <p className="text-fg-secondary text-sm mb-8">
        Let's get you set up in 2 quick steps
      </p>
      <button onClick={() => setCurrentStep('api-key')} className="btn-primary w-full py-3">
        Get Started
      </button>
      <div className="mt-6 p-3 bg-bg-tertiary border border-border-primary rounded">
        <p className="text-xs text-fg-secondary">
          All data is stored locally. Your API keys never leave your device.
        </p>
      </div>
    </div>
  );

  const renderApiKey = () => (
    <>
      <SetupOrb step="api-key" />
      <div className="mb-6">
        <h1 className="text-lg font-medium mb-2 text-fg-primary">API Key</h1>
        <p className="text-fg-secondary text-sm">
          Step 1 of 2
        </p>
      </div>

      <div className="mb-6">
        <label className="block text-xs text-fg-secondary mb-1">
          OpenRouter API Key
        </label>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => handleApiKeyChange(e.target.value)}
          placeholder="sk-or-..."
          className="input w-full"
          autoFocus
        />
        <div className="mt-2 flex items-center justify-between">
          <a
            href="https://openrouter.ai/keys"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-accent-primary hover:underline"
          >
            Get your API key from OpenRouter
          </a>
          {isValid && (
            <span className="text-xs text-accent-success">
              Valid
            </span>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-accent-error/10 border border-accent-error rounded">
          <p className="text-xs text-accent-error">{error}</p>
        </div>
      )}

      <div className="flex gap-3">
        <button onClick={() => setCurrentStep('welcome')} className="btn-secondary flex-1 py-2">
          Back
        </button>
        <button onClick={handleApiKeyNext} className="btn-primary flex-1 py-2">
          Continue
        </button>
      </div>
    </>
  );

  const renderModel = () => (
    <>
      <SetupOrb step="model" />
      <div className="mb-6">
        <h1 className="text-lg font-medium mb-2 text-fg-primary">Choose Model</h1>
        <p className="text-fg-secondary text-sm">
          Step 2 of 2 - Almost ready!
        </p>
      </div>

      <div className="mb-6">
        <label className="block text-xs text-fg-secondary mb-1">
          Model
        </label>
        <div className="space-y-2">
          <button
            onClick={() => setModelName('google/gemini-3-flash-preview')}
            className={`w-full text-left p-3 rounded border transition-colors ${
              modelName === 'google/gemini-3-flash-preview'
                ? 'border-accent-primary bg-accent-primary/10'
                : 'border-border-primary bg-bg-tertiary hover:border-border-secondary'
            }`}
          >
            <code className="text-sm text-accent-info">google/gemini-3-flash-preview</code>
            <p className="text-xs text-fg-tertiary mt-1">Google • 1M context • Recommended</p>
          </button>

          <button
            onClick={() => setModelName('anthropic/claude-haiku-4.5')}
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
                className="input w-full text-sm"
                autoFocus
              />
              <p className="text-xs text-fg-tertiary mt-1">
                Find models at <a href="https://openrouter.ai/models" target="_blank" rel="noopener noreferrer" className="text-accent-primary hover:underline">openrouter.ai/models</a>
              </p>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-accent-error/10 border border-accent-error rounded">
          <p className="text-xs text-accent-error">{error}</p>
        </div>
      )}

      <div className="flex gap-3">
        <button onClick={() => setCurrentStep('api-key')} className="btn-secondary flex-1 py-2">
          Back
        </button>
        <button onClick={handleComplete} className="btn-primary flex-1 py-2">
          Start
        </button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-primary p-4">
      <div className="card max-w-md w-full p-8">
        {currentStep === 'welcome' && renderWelcome()}
        {currentStep === 'api-key' && renderApiKey()}
        {currentStep === 'model' && renderModel()}
      </div>
    </div>
  );
}
