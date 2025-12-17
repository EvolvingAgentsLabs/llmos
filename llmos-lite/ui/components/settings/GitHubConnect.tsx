'use client';

import { useState, useEffect } from 'react';
import { GitHubAuth, type GitHubUser } from '@/lib/github-auth';

export default function GitHubConnect() {
  const [user, setUser] = useState<GitHubUser | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  useEffect(() => {
    // Load saved user
    setUser(GitHubAuth.getUser());

    // Listen for OAuth callback
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;

      if (event.data.type === 'github_auth_success') {
        const githubUser = event.data.user;
        GitHubAuth.saveUser(githubUser);
        setUser(githubUser);
        setIsConnecting(false);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleConnect = () => {
    setIsConnecting(true);
    GitHubAuth.startOAuthFlow();
  };

  const handleDisconnect = () => {
    GitHubAuth.clearUser();
    setUser(null);
  };

  if (user) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-3 p-3 rounded border border-terminal-border bg-terminal-bg-tertiary">
          <img
            src={user.avatar_url}
            alt={user.name}
            className="w-10 h-10 rounded-full"
          />
          <div className="flex-1">
            <div className="text-sm font-medium">{user.name}</div>
            <div className="text-xs text-terminal-fg-secondary">@{user.login}</div>
          </div>
          <span className="text-xs text-terminal-accent-green">Connected</span>
        </div>

        <div className="text-xs text-terminal-fg-secondary space-y-1">
          <p>✓ Commits will be saved to your GitHub repositories</p>
          <p>✓ Sessions synced across devices</p>
          <p>✓ Team collaboration enabled</p>
        </div>

        <button
          onClick={handleDisconnect}
          className="btn-terminal-secondary text-xs w-full"
        >
          Disconnect GitHub
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="p-4 rounded border border-terminal-border bg-terminal-bg-secondary">
        <h3 className="terminal-heading text-xs mb-2">🔗 GITHUB INTEGRATION</h3>
        <p className="text-xs text-terminal-fg-secondary mb-3">
          Connect your GitHub account to enable:
        </p>
        <ul className="text-xs text-terminal-fg-secondary space-y-1 mb-4 ml-4">
          <li>• Real Git commit history</li>
          <li>• Cross-device session sync</li>
          <li>• Team volume collaboration</li>
          <li>• Context memory analysis</li>
        </ul>
        <button
          onClick={handleConnect}
          disabled={isConnecting}
          className="btn-terminal text-xs w-full"
        >
          {isConnecting ? 'Connecting...' : 'Connect with GitHub'}
        </button>
      </div>

      <div className="text-[10px] text-terminal-fg-tertiary space-y-1">
        <p>⚠️ Without GitHub:</p>
        <p>• Commits are local-only</p>
        <p>• No backup or sync</p>
        <p>• Limited cron analysis</p>
      </div>
    </div>
  );
}
