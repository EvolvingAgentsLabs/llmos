'use client';

import { useState } from 'react';
import { LLMStorage, AVAILABLE_MODELS, MODEL_PROVIDER_CONFIG, PROVIDER_BASE_URLS, type ModelId } from '@/lib/llm-client';
import { UserStorage, User, Team } from '@/lib/user-storage';

interface APIKeySetupProps {
  onComplete: () => void;
}

type SetupStep = 'welcome' | 'model' | 'api-key';

// Setup Orb - Simple CSS animated orb for setup screens
function SetupOrb({ step }: { step: SetupStep }) {
  const stepProgress = {
    'welcome': 0,
    'model': 50,
    'api-key': 100,
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
          {step === 'welcome' ? '\u{1F44B}' : step === 'api-key' ? '\u2713' : `${Math.round(progress)}%`}
        </span>
      </div>
    </div>
  );
}

export default function APIKeySetup({ onComplete }: APIKeySetupProps) {
  // LLM config state
  const [apiKey, setApiKey] = useState('');
  const [modelName, setModelName] = useState('qwen/qwen3-vl-8b-instruct');

  // UI state
  const [currentStep, setCurrentStep] = useState<SetupStep>('welcome');
  const [error, setError] = useState('');
  const [isValid, setIsValid] = useState(false);

  const selectedConfig = MODEL_PROVIDER_CONFIG[modelName];
  const isOllama = selectedConfig?.provider === 'ollama';

  const handleApiKeyChange = (value: string) => {
    setApiKey(value);
    setError('');
    // OpenRouter API key validation (basic check)
    setIsValid(value.length > 20);
  };

  const handleModelNext = () => {
    if (isOllama) {
      // Ollama doesn't need API key, go straight to completion
      handleComplete();
    } else {
      setCurrentStep('api-key');
    }
  };

  const handleApiKeyNext = () => {
    if (!isValid) {
      setError('Please enter a valid OpenRouter API key');
      return;
    }
    setError('');
    handleComplete();
  };

  const handleComplete = () => {
    const config = MODEL_PROVIDER_CONFIG[modelName];
    if (!config) {
      setError('Please select a valid model');
      return;
    }

    console.log('[APIKeySetup] Saving configuration:');
    console.log('  - Model:', modelName);
    console.log('  - Provider:', config.provider);
    console.log('  - Base URL:', config.baseUrl);

    // Save LLM config to localStorage
    LLMStorage.saveProvider(config.provider);
    LLMStorage.saveBaseUrl(config.baseUrl);
    LLMStorage.saveModel(modelName);

    if (!isOllama && apiKey) {
      LLMStorage.saveApiKey(apiKey);
      console.log('  - API Key (first 20 chars):', apiKey.substring(0, 20) + '...');
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
        Let's get you set up in a few quick steps
      </p>
      <button onClick={() => setCurrentStep('model')} className="btn-primary w-full py-3">
        Get Started
      </button>
      <div className="mt-6 p-3 bg-bg-tertiary border border-border-primary rounded">
        <p className="text-xs text-fg-secondary">
          All data is stored locally. Your API keys never leave your device.
        </p>
      </div>
    </div>
  );

  const renderModel = () => (
    <>
      <SetupOrb step="model" />
      <div className="mb-6">
        <h1 className="text-lg font-medium mb-2 text-fg-primary">Choose Model</h1>
        <p className="text-fg-secondary text-sm">
          {isOllama ? 'Step 1 of 1' : 'Step 1 of 2'} - Select your Qwen3 VL provider
        </p>
      </div>

      <div className="mb-6">
        <label className="block text-xs text-fg-secondary mb-1">
          Model
        </label>
        <div className="space-y-2">
          <button
            onClick={() => setModelName('qwen/qwen3-vl-8b-instruct')}
            className={`w-full text-left p-3 rounded border transition-colors ${
              modelName === 'qwen/qwen3-vl-8b-instruct'
                ? 'border-accent-primary bg-accent-primary/10'
                : 'border-border-primary bg-bg-tertiary hover:border-border-secondary'
            }`}
          >
            <code className="text-sm text-accent-info">qwen/qwen3-vl-8b-instruct</code>
            <p className="text-xs text-fg-tertiary mt-1">OpenRouter • 131k context • Requires API key</p>
          </button>

          <button
            onClick={() => setModelName('qwen3-vl:8b-instruct')}
            className={`w-full text-left p-3 rounded border transition-colors ${
              modelName === 'qwen3-vl:8b-instruct'
                ? 'border-accent-primary bg-accent-primary/10'
                : 'border-border-primary bg-bg-tertiary hover:border-border-secondary'
            }`}
          >
            <code className="text-sm text-accent-info">qwen3-vl:8b-instruct</code>
            <p className="text-xs text-fg-tertiary mt-1">Ollama (Local) • 131k context • Free, no API key needed</p>
          </button>
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
        <button onClick={handleModelNext} className="btn-primary flex-1 py-2">
          {isOllama ? 'Start' : 'Continue'}
        </button>
      </div>

      {isOllama && (
        <div className="mt-4 p-3 bg-bg-tertiary border border-border-primary rounded">
          <p className="text-xs text-fg-secondary">
            Make sure Ollama is running locally and you have pulled the model:{' '}
            <code className="text-accent-info">ollama pull qwen3-vl:8b-instruct</code>
          </p>
        </div>
      )}
    </>
  );

  const renderApiKey = () => (
    <>
      <SetupOrb step="api-key" />
      <div className="mb-6">
        <h1 className="text-lg font-medium mb-2 text-fg-primary">API Key</h1>
        <p className="text-fg-secondary text-sm">
          Step 2 of 2
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
        <button onClick={() => setCurrentStep('model')} className="btn-secondary flex-1 py-2">
          Back
        </button>
        <button onClick={handleApiKeyNext} className="btn-primary flex-1 py-2">
          Start
        </button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-primary p-4">
      <div className="card max-w-md w-full p-8">
        {currentStep === 'welcome' && renderWelcome()}
        {currentStep === 'model' && renderModel()}
        {currentStep === 'api-key' && renderApiKey()}
      </div>
    </div>
  );
}
