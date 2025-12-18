'use client';

import { useState } from 'react';
import { LLMStorage, AVAILABLE_MODELS, type ModelId } from '@/lib/llm-client';
import { UserStorage, User, Team } from '@/lib/user-storage';
import IndustrySelector from '@/components/onboarding/IndustrySelector';
import { Industry } from '@/lib/terminology-config';

interface APIKeySetupProps {
  onComplete: () => void;
}

type SetupStep = 'welcome' | 'industry' | 'profile' | 'api-key' | 'model';

export default function APIKeySetup({ onComplete }: APIKeySetupProps) {
  // LLM config state
  const [apiKey, setApiKey] = useState('');
  const [modelName, setModelName] = useState('anthropic/claude-sonnet-4.5');

  // User/team state
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [teamName, setTeamName] = useState('');
  const [selectedIndustry, setSelectedIndustry] = useState<Industry | null>(null);

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

    // Save LLM config to localStorage
    LLMStorage.saveProvider('openrouter');
    LLMStorage.saveApiKey(apiKey);
    // Save the model name directly - it will be validated in createLLMClient
    LLMStorage.saveModel(modelName as any);

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
      <h1 className="terminal-heading text-2xl mb-4">Welcome to LLMos-Lite</h1>
      <p className="text-terminal-fg-secondary mb-8">
        A terminal-style interface for working with AI agents and workflows.
        Let's get you set up in just a few steps.
      </p>
      <div className="space-y-3 text-left mb-8">
        <div className="flex items-start gap-3">
          <span className="text-terminal-accent-green mt-1">✓</span>
          <div>
            <p className="text-sm font-medium">Create your profile</p>
            <p className="text-xs text-terminal-fg-tertiary">Set up your identity and team</p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <span className="text-terminal-accent-green mt-1">✓</span>
          <div>
            <p className="text-sm font-medium">Connect your API key</p>
            <p className="text-xs text-terminal-fg-tertiary">Use free or premium AI models</p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <span className="text-terminal-accent-green mt-1">✓</span>
          <div>
            <p className="text-sm font-medium">Start building</p>
            <p className="text-xs text-terminal-fg-tertiary">Chat, create workflows, and manage sessions</p>
          </div>
        </div>
      </div>
      <button onClick={() => setCurrentStep('industry')} className="btn-terminal w-full py-3">
        Get Started
      </button>
      <div className="mt-6 p-3 bg-terminal-bg-tertiary border border-terminal-border rounded">
        <p className="text-xs text-terminal-fg-secondary">
          🔒 All data is stored locally. Your API keys never leave your device.
        </p>
      </div>
    </div>
  );

  const renderProfile = () => (
    <>
      <div className="mb-6">
        <h1 className="terminal-heading text-lg mb-2">Your Profile</h1>
        <p className="text-terminal-fg-secondary text-sm">
          Step 1 of 3 • Tell us about yourself
        </p>
      </div>

      <div className="space-y-4 mb-6">
        <div>
          <label className="block text-xs text-terminal-fg-secondary mb-1">
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setError(''); }}
            placeholder="you@example.com"
            className="terminal-input w-full"
            autoFocus
          />
        </div>

        <div>
          <label className="block text-xs text-terminal-fg-secondary mb-1">
            Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => { setName(e.target.value); setError(''); }}
            placeholder="Your Name"
            className="terminal-input w-full"
          />
        </div>

        <div>
          <label className="block text-xs text-terminal-fg-secondary mb-1">
            Team Name
          </label>
          <input
            type="text"
            value={teamName}
            onChange={(e) => { setTeamName(e.target.value); setError(''); }}
            placeholder="engineering, research, personal, etc."
            className="terminal-input w-full"
          />
          <p className="mt-1 text-xs text-terminal-fg-tertiary">
            This helps organize your work and sessions
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-terminal-accent-red/10 border border-terminal-accent-red rounded">
          <p className="text-xs text-terminal-accent-red">{error}</p>
        </div>
      )}

      <button onClick={handleProfileNext} className="btn-terminal w-full py-2">
        Continue
      </button>
    </>
  );

  const renderApiKey = () => (
    <>
      <div className="mb-6">
        <h1 className="terminal-heading text-lg mb-2">API Key</h1>
        <p className="text-terminal-fg-secondary text-sm">
          Step 2 of 3 • Connect to OpenRouter
        </p>
      </div>

      <div className="mb-6">
        <label className="block text-xs text-terminal-fg-secondary mb-1">
          OpenRouter API Key
        </label>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => handleApiKeyChange(e.target.value)}
          placeholder="sk-or-v1-..."
          className="terminal-input w-full"
          autoFocus
        />
        <div className="mt-2 flex items-center justify-between">
          <div className="flex flex-col gap-1">
            <a
              href="https://openrouter.ai/keys"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-terminal-accent-blue hover:underline"
            >
              Get your free API key →
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
              ✓ Valid
            </span>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-terminal-accent-red/10 border border-terminal-accent-red rounded">
          <p className="text-xs text-terminal-accent-red">{error}</p>
        </div>
      )}

      <div className="flex gap-3">
        <button onClick={() => setCurrentStep('industry')} className="btn-terminal-secondary flex-1 py-2">
          Back
        </button>
        <button onClick={handleApiKeyNext} className="btn-terminal flex-1 py-2">
          Continue
        </button>
      </div>
    </>
  );

  const renderModel = () => (
    <>
      <div className="mb-6">
        <h1 className="terminal-heading text-lg mb-2">Choose Model</h1>
        <p className="text-terminal-fg-secondary text-sm">
          Step 3 of 3 • Select an AI model
        </p>
      </div>

      <div className="mb-6">
        <label className="block text-xs text-terminal-fg-secondary mb-1">
          Model Name
        </label>
        <input
          type="text"
          value={modelName}
          onChange={(e) => { setModelName(e.target.value); setError(''); }}
          placeholder="anthropic/claude-sonnet-4.5"
          className="terminal-input w-full"
          autoFocus
        />
        <div className="mt-3 text-xs text-terminal-fg-secondary">
          <p className="mb-2 font-medium">Popular choices:</p>
          <div className="space-y-2">
            <button
              onClick={() => setModelName('anthropic/claude-sonnet-4.5')}
              className="w-full text-left p-2 rounded terminal-hover"
            >
              <code className="text-terminal-accent-blue">anthropic/claude-sonnet-4.5</code>
              <p className="text-terminal-fg-tertiary mt-1">Claude Sonnet 4.5 (recommended)</p>
            </button>
            <button
              onClick={() => setModelName('anthropic/claude-opus-4.5')}
              className="w-full text-left p-2 rounded terminal-hover"
            >
              <code className="text-terminal-accent-blue">anthropic/claude-opus-4.5</code>
              <p className="text-terminal-fg-tertiary mt-1">Premium quality (paid)</p>
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-terminal-accent-red/10 border border-terminal-accent-red rounded">
          <p className="text-xs text-terminal-accent-red">{error}</p>
        </div>
      )}

      <div className="flex gap-3">
        <button onClick={() => setCurrentStep('api-key')} className="btn-terminal-secondary flex-1 py-2">
          Back
        </button>
        <button onClick={handleComplete} className="btn-terminal flex-1 py-2">
          Complete Setup
        </button>
      </div>
    </>
  );

  const handleIndustrySelect = (industry: Industry) => {
    setSelectedIndustry(industry);
    setCurrentStep('profile');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-terminal-bg-primary p-4">
      {currentStep === 'industry' ? (
        <IndustrySelector onSelect={handleIndustrySelect} />
      ) : (
        <div className="terminal-panel max-w-2xl w-full">
          {currentStep === 'welcome' && renderWelcome()}
          {currentStep === 'profile' && renderProfile()}
          {currentStep === 'api-key' && renderApiKey()}
          {currentStep === 'model' && renderModel()}
        </div>
      )}
    </div>
  );
}
