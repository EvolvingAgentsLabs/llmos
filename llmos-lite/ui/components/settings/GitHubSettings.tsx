'use client';

import { useState, useEffect } from 'react';
import { GitHubConfig, initializeGitHubService, getGitHubService } from '@/lib/github/github-service';

const GITHUB_CONFIG_KEY = 'llmos_github_config';

export default function GitHubSettings() {
  const [config, setConfig] = useState<GitHubConfig>({
    token: '',
    repositories: {
      system: '',
      team: '',
      user: '',
    },
  });
  const [isValidating, setIsValidating] = useState(false);
  const [isValid, setIsValid] = useState<boolean | null>(null);
  const [userInfo, setUserInfo] = useState<any>(null);
  const [isSaved, setIsSaved] = useState(false);

  // Load config from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(GITHUB_CONFIG_KEY);
    if (saved) {
      try {
        const savedConfig = JSON.parse(saved);
        setConfig(savedConfig);
        // Initialize service with saved config
        initializeGitHubService(savedConfig);
      } catch (error) {
        console.error('Failed to load GitHub config:', error);
      }
    }
  }, []);

  const validateAndSave = async () => {
    if (!config.token) {
      setIsValid(false);
      return;
    }

    setIsValidating(true);
    setIsValid(null);

    try {
      const service = initializeGitHubService(config);
      const valid = await service.validateToken();

      if (valid) {
        const info = await service.getUserInfo();
        setUserInfo(info);
        setIsValid(true);

        // Save to localStorage
        localStorage.setItem(GITHUB_CONFIG_KEY, JSON.stringify(config));
        setIsSaved(true);
        setTimeout(() => setIsSaved(false), 3000);
      } else {
        setIsValid(false);
        setUserInfo(null);
      }
    } catch (error) {
      console.error('Failed to validate token:', error);
      setIsValid(false);
      setUserInfo(null);
    } finally {
      setIsValidating(false);
    }
  };

  const createRepository = async (volume: 'user' | 'team') => {
    const service = getGitHubService();
    if (!service || !userInfo) return;

    try {
      const repoName = `llmos-${volume}-volume`;
      const fullName = await service.createRepository(
        repoName,
        true,
        `LLMos-Lite ${volume} volume`
      );

      setConfig(prev => ({
        ...prev,
        repositories: {
          ...prev.repositories,
          [volume]: fullName,
        },
      }));
    } catch (error) {
      console.error('Failed to create repository:', error);
      alert(`Failed to create repository: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold text-fg-primary">GitHub Integration</h2>
        <p className="text-sm text-fg-tertiary mt-1">
          Connect your GitHub account to persist artifacts to repositories
        </p>
      </div>

      {/* Personal Access Token */}
      <div>
        <label className="block text-sm font-medium text-fg-secondary mb-2">
          Personal Access Token
        </label>
        <div className="flex gap-2">
          <input
            type="password"
            value={config.token}
            onChange={(e) => setConfig(prev => ({ ...prev, token: e.target.value }))}
            placeholder="ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
            className="input-primary flex-1 font-mono text-sm"
          />
          <button
            onClick={validateAndSave}
            disabled={isValidating || !config.token}
            className="btn-primary px-4 py-2 disabled:opacity-50"
          >
            {isValidating ? 'Validating...' : 'Validate'}
          </button>
        </div>
        <p className="text-xs text-fg-tertiary mt-2">
          Create a token at{' '}
          <a
            href="https://github.com/settings/tokens/new?scopes=repo"
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent-primary hover:underline"
          >
            GitHub Settings
          </a>
          {' '}with <code className="px-1 py-0.5 rounded bg-bg-tertiary">repo</code> scope
        </p>

        {/* Validation Status */}
        {isValid !== null && (
          <div className={`mt-3 p-3 rounded-lg ${
            isValid
              ? 'bg-green-500/10 border border-green-500/20 text-green-400'
              : 'bg-red-500/10 border border-red-500/20 text-red-400'
          }`}>
            {isValid ? (
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>Token is valid! Authenticated as {userInfo?.login}</span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                <span>Invalid token or network error</span>
              </div>
            )}
          </div>
        )}

        {isSaved && (
          <div className="mt-3 p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400">
            ✓ Configuration saved
          </div>
        )}
      </div>

      {/* User Info */}
      {userInfo && (
        <div className="glass-panel p-4 bg-bg-tertiary/30">
          <div className="flex items-center gap-3">
            <img
              src={userInfo.avatarUrl}
              alt={userInfo.name}
              className="w-12 h-12 rounded-full"
            />
            <div>
              <div className="font-medium text-fg-primary">{userInfo.name}</div>
              <div className="text-sm text-fg-tertiary">@{userInfo.login}</div>
              {userInfo.email && (
                <div className="text-xs text-fg-tertiary">{userInfo.email}</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Repository Configuration */}
      {isValid && (
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-medium text-fg-secondary mb-3">
              Volume Repositories
            </h3>
            <p className="text-xs text-fg-tertiary mb-4">
              Configure GitHub repositories for each volume
            </p>
          </div>

          {/* User Volume */}
          <div>
            <label className="block text-sm font-medium text-fg-secondary mb-2">
              User Volume Repository
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={config.repositories.user || ''}
                onChange={(e) => setConfig(prev => ({
                  ...prev,
                  repositories: { ...prev.repositories, user: e.target.value }
                }))}
                placeholder="username/llmos-user-volume"
                className="input-primary flex-1 font-mono text-sm"
              />
              <button
                onClick={() => createRepository('user')}
                className="btn-secondary px-4 py-2 whitespace-nowrap"
              >
                Create New
              </button>
            </div>
          </div>

          {/* Team Volume */}
          <div>
            <label className="block text-sm font-medium text-fg-secondary mb-2">
              Team Volume Repository
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={config.repositories.team || ''}
                onChange={(e) => setConfig(prev => ({
                  ...prev,
                  repositories: { ...prev.repositories, team: e.target.value }
                }))}
                placeholder="org/llmos-team-volume"
                className="input-primary flex-1 font-mono text-sm"
              />
              <button
                onClick={() => createRepository('team')}
                className="btn-secondary px-4 py-2 whitespace-nowrap"
              >
                Create New
              </button>
            </div>
          </div>

          {/* System Volume */}
          <div>
            <label className="block text-sm font-medium text-fg-secondary mb-2">
              System Volume Repository (Read-only)
            </label>
            <input
              type="text"
              value={config.repositories.system || 'llmunix/system-volume'}
              onChange={(e) => setConfig(prev => ({
                ...prev,
                repositories: { ...prev.repositories, system: e.target.value }
              }))}
              placeholder="llmunix/system-volume"
              className="input-primary w-full font-mono text-sm"
              disabled
            />
            <p className="text-xs text-fg-tertiary mt-2">
              System volume is managed centrally and read-only
            </p>
          </div>

          {/* Save Button */}
          <button
            onClick={validateAndSave}
            className="btn-primary px-6 py-2 w-full"
          >
            💾 Save Configuration
          </button>
        </div>
      )}
    </div>
  );
}
