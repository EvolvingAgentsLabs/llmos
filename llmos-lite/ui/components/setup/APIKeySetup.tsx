'use client';

import { useState } from 'react';
import { LLMStorage, AVAILABLE_MODELS, type ModelId } from '@/lib/llm-client';
import { UserStorage, User, Team } from '@/lib/user-storage';

interface APIKeySetupProps {
  onComplete: () => void;
}

type SetupStep = 'welcome' | 'profile' | 'api-key' | 'model';

export default function APIKeySetup({ onComplete }: APIKeySetupProps) {
  // LLM config state
  const [apiKey, setApiKey] = useState('');
  const [modelName, setModelName] = useState('anthropic/claude-sonnet-4.5');

  // User/team state
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [teamName, setTeamName] = useState('');

  // UI state
  const [currentStep, setCurrentStep] = useState<SetupStep>('welcome');
  const [error, setError] = useState('');
  const [isValid, setIsValid] = useState(false);

  const handleApiKeyChange = (value: string) => {
    setApiKey(value);
    setError('');
    // OpenRouter key validation
    setIsValid(value.startsWith('sk-or-v1-') && value.length > 20);
  };

  const handleProfileNext = () => {
    if (!email.trim() || !email.includes('@')) {
      setError('Please enter a valid email address');
      return;
    }
    if (!name.trim()) {
      setError('Please enter your name');
      return;
    }
    if (!teamName.trim()) {
      setError('Please enter a team name');
      return;
    }
    setError('');
    setCurrentStep('api-key');
  };

  const handleApiKeyNext = () => {
    if (!isValid) {
      setError('Invalid OpenRouter API key format. Key should start with "sk-or-v1-"');
      return;
    }
    setError('');
    setCurrentStep('model');
  };

  const handleComplete = () => {
    if (!modelName.trim()) {
      setError('Please enter a model name');
      return;
    }

    console.log('[APIKeySetup] Saving configuration:');
    console.log('  - API Key (first 20 chars):', apiKey.substring(0, 20) + '...');
    console.log('  - Model:', modelName);
    console.log('  - Provider: openrouter');

    // Save LLM config to localStorage
    LLMStorage.saveProvider('openrouter');
    LLMStorage.saveApiKey(apiKey);
    // Save the model name directly - it will be validated in createLLMClient
    LLMStorage.saveModel(modelName as any);

    console.log('[APIKeySetup] Configuration saved to localStorage');

    // Save user/team to localStorage
    const user: User = {
      id: `user_${Date.now()}`,
      email: email.trim(),
      name: name.trim(),
      created_at: new Date().toISOString(),
    };

    const team: Team = {
      id: teamName.toLowerCase().replace(/\s+/g, '-'),
      name: teamName.trim(),
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
      <h1 className="text-2xl font-medium mb-3 text-fg-primary">Welcome to LLMos-Lite</h1>
      <p className="text-fg-secondary mb-8">
        Get set up in 3 quick steps
      </p>
      <button onClick={() => setCurrentStep('profile')} className="btn-primary w-full py-3">
        Get Started
      </button>
      <div className="mt-6 p-3 bg-bg-tertiary border border-border-primary rounded">
        <p className="text-xs text-fg-secondary">
          All data is stored locally. Your API keys never leave your device.
        </p>
      </div>
    </div>
  );

  const renderProfile = () => (
    <>
      <div className="mb-6">
        <h1 className="text-lg font-medium mb-2 text-fg-primary">Your Profile</h1>
        <p className="text-fg-secondary text-sm">
          Step 1 of 3
        </p>
      </div>

      <div className="space-y-4 mb-6">
        <div>
          <label className="block text-xs text-fg-secondary mb-1">
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setError(''); }}
            placeholder="you@example.com"
            className="input w-full"
            autoFocus
          />
        </div>

        <div>
          <label className="block text-xs text-fg-secondary mb-1">
            Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => { setName(e.target.value); setError(''); }}
            placeholder="Your Name"
            className="input w-full"
          />
        </div>

        <div>
          <label className="block text-xs text-fg-secondary mb-1">
            Team Name
          </label>
          <input
            type="text"
            value={teamName}
            onChange={(e) => { setTeamName(e.target.value); setError(''); }}
            placeholder="engineering, research, personal, etc."
            className="input w-full"
          />
          <p className="mt-1 text-xs text-fg-tertiary">
            Helps organize your work
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-accent-error/10 border border-accent-error rounded">
          <p className="text-xs text-accent-error">{error}</p>
        </div>
      )}

      <button onClick={handleProfileNext} className="btn-primary w-full py-2">
        Continue
      </button>
    </>
  );

  const renderApiKey = () => (
    <>
      <div className="mb-6">
        <h1 className="text-lg font-medium mb-2 text-fg-primary">API Key</h1>
        <p className="text-fg-secondary text-sm">
          Step 2 of 3
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
          placeholder="sk-or-v1-..."
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
            Get your free API key
          </a>
          {isValid && (
            <span className="text-xs text-accent-success">
              ✓ Valid
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
        <button onClick={() => setCurrentStep('profile')} className="btn-secondary flex-1 py-2">
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
      <div className="mb-6">
        <h1 className="text-lg font-medium mb-2 text-fg-primary">Choose Model</h1>
        <p className="text-fg-secondary text-sm">
          Step 3 of 3
        </p>
      </div>

      <div className="mb-6">
        <label className="block text-xs text-fg-secondary mb-1">
          Model
        </label>
        <div className="space-y-2">
          <button
            onClick={() => setModelName('anthropic/claude-sonnet-4.5')}
            className={`w-full text-left p-3 rounded border transition-colors ${
              modelName === 'anthropic/claude-sonnet-4.5'
                ? 'border-accent-primary bg-accent-primary/10'
                : 'border-border-primary bg-bg-tertiary hover:border-border-secondary'
            }`}
          >
            <code className="text-sm text-accent-info">anthropic/claude-sonnet-4.5</code>
            <p className="text-xs text-fg-tertiary mt-1">Recommended</p>
          </button>
          <button
            onClick={() => setModelName('anthropic/claude-opus-4.5')}
            className={`w-full text-left p-3 rounded border transition-colors ${
              modelName === 'anthropic/claude-opus-4.5'
                ? 'border-accent-primary bg-accent-primary/10'
                : 'border-border-primary bg-bg-tertiary hover:border-border-secondary'
            }`}
          >
            <code className="text-sm text-accent-info">anthropic/claude-opus-4.5</code>
            <p className="text-xs text-fg-tertiary mt-1">Premium quality</p>
          </button>
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
        {currentStep === 'profile' && renderProfile()}
        {currentStep === 'api-key' && renderApiKey()}
        {currentStep === 'model' && renderModel()}
      </div>
    </div>
  );
}
