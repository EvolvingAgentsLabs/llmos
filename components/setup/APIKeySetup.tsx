'use client';

import { useState } from 'react';
import { LLMStorage } from '@/lib/llm-client';
import { UserStorage } from '@/lib/user-storage';

interface APIKeySetupProps {
  onComplete: () => void;
}

export default function APIKeySetup({ onComplete }: APIKeySetupProps) {
  const [apiKey, setApiKey] = useState('');
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKey.trim()) {
      setError('API key is required');
      return;
    }
    if (!username.trim()) {
      setError('Username is required');
      return;
    }

    try {
      LLMStorage.saveApiKey(apiKey.trim());
      UserStorage.saveUser({
        id: `user-${Date.now()}`,
        email: username.trim(),
        name: username.trim(),
        created_at: new Date().toISOString(),
      });
      onComplete();
    } catch (err) {
      setError('Failed to save configuration');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-black">
      <div className="w-full max-w-md p-8 bg-gray-900 rounded-xl border border-gray-700">
        <h1 className="text-2xl font-bold text-white mb-6">LLMos Setup</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white"
              placeholder="Your name"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">API Key</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white"
              placeholder="OpenRouter or Anthropic API key"
            />
          </div>
          {error && <div className="text-sm text-red-400">{error}</div>}
          <button
            type="submit"
            className="w-full py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg font-medium"
          >
            Start LLMos
          </button>
        </form>
      </div>
    </div>
  );
}
