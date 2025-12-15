'use client';

import { useState } from 'react';
import { LLMStorage, AVAILABLE_MODELS, type ModelId } from '@/lib/llm-client';
import { UserStorage, User, Team } from '@/lib/user-storage';

interface APIKeySetupProps {
  onComplete: () => void;
}

export default function APIKeySetup({ onComplete }: APIKeySetupProps) {
  // LLM config state
  const [apiKey, setApiKey] = useState('');
  const [modelName, setModelName] = useState('tng/deepseek-r1t2-chimera:free');

  // User/team state
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [teamName, setTeamName] = useState('');

  // UI state
  const [error, setError] = useState('');
  const [isValid, setIsValid] = useState(false);

  const handleApiKeyChange = (value: string) => {
    setApiKey(value);
    setError('');
    // OpenRouter key validation
    setIsValid(value.startsWith('sk-or-v1-') && value.length > 20);
  };

  const handleSave = () => {
    // Validate API key
    if (!isValid) {
      setError('Invalid OpenRouter API key format. Key should start with "sk-or-v1-"');
      return;
    }

    // Validate model
    if (!modelName.trim()) {
      setError('Please enter a model name');
      return;
    }

    // Validate user info
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

    // Save LLM config to localStorage
    LLMStorage.saveProvider('openrouter');
    LLMStorage.saveApiKey(apiKey);
    LLMStorage.saveModel(modelName as ModelId);

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

  return (
    <div className="min-h-screen flex items-center justify-center bg-terminal-bg-primary p-4">
      <div className="terminal-panel max-w-2xl w-full">
        <div className="mb-6">
          <h1 className="terminal-heading text-lg mb-2">Welcome to LLMos-Lite</h1>
          <p className="text-terminal-fg-secondary text-sm">
            Set up your profile and API key to get started
          </p>
        </div>

        {/* User Information */}
        <div className="mb-6 p-4 bg-terminal-bg-tertiary border border-terminal-border rounded">
          <h2 className="terminal-heading text-xs mb-3">YOUR INFORMATION</h2>

          <div className="space-y-3">
            <div>
              <label className="block text-xs text-terminal-fg-secondary mb-1">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="terminal-input w-full"
              />
            </div>

            <div>
              <label className="block text-xs text-terminal-fg-secondary mb-1">
                Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
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
                onChange={(e) => setTeamName(e.target.value)}
                placeholder="engineering, research, personal, etc."
                className="terminal-input w-full"
              />
              <p className="mt-1 text-xs text-terminal-fg-tertiary">
                This helps organize your work and sessions
              </p>
            </div>
          </div>
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

        {/* Model Input */}
        <div className="mb-6">
          <h2 className="terminal-heading text-xs mb-3">MODEL NAME</h2>
          <input
            type="text"
            value={modelName}
            onChange={(e) => setModelName(e.target.value)}
            placeholder="e.g., anthropic/claude-opus-4.5, tng/deepseek-r1t2-chimera:free"
            className="terminal-input w-full"
          />
          <div className="mt-2 text-xs text-terminal-fg-secondary">
            <p className="mb-1">Examples:</p>
            <ul className="list-disc list-inside space-y-0.5">
              <li><code className="text-terminal-accent-green">tng/deepseek-r1t2-chimera:free</code> - Free reasoning model</li>
              <li><code className="text-terminal-accent-blue">anthropic/claude-opus-4.5</code> - Premium quality</li>
              <li><code className="text-terminal-accent-blue">openai/gpt-5.2</code> - Latest OpenAI</li>
            </ul>
          </div>
        </div>

        {/* Error display */}
        {error && (
          <div className="mb-6 p-3 bg-terminal-accent-red/10 border border-terminal-accent-red rounded">
            <div className="text-xs text-terminal-accent-red">
              {error}
            </div>
          </div>
        )}

        {/* Privacy Notice */}
        <div className="mb-6 p-3 bg-terminal-bg-tertiary border border-terminal-border rounded">
          <div className="text-xs text-terminal-fg-secondary">
            🔒 <span className="text-terminal-accent-green">Privacy:</span> All data is stored locally in your browser.
            Your API key and personal information never leave your device.
          </div>
        </div>

        {/* Save Button */}
        <div className="flex gap-3">
          <button
            onClick={handleSave}
            disabled={!isValid}
            className="btn-terminal flex-1 py-2"
          >
            Complete Setup
          </button>
        </div>
      </div>
    </div>
  );
}
