'use client';

import { useState } from 'react';
import { useSessionContext } from '@/contexts/SessionContext';
import { GitService } from '@/lib/git-service';
import { GitHubAuth } from '@/lib/github-auth';
import GitHubConnect from '@/components/settings/GitHubConnect';

interface ContextPanelProps {
  activeSession: string | null;
  activeVolume: 'system' | 'team' | 'user';
}

export default function ContextPanel({
  activeSession,
  activeVolume,
}: ContextPanelProps) {
  const { sessions, updateSession } = useSessionContext();
  const currentSession = sessions.find((s) => s.id === activeSession);
  const [isCommitting, setIsCommitting] = useState(false);

  const handleCommitSession = async () => {
    if (!currentSession) return;

    setIsCommitting(true);

    try {
      // Check if GitHub is connected
      const isGitHubConnected = GitHubAuth.isAuthenticated();

      let commitHash: string;

      if (isGitHubConnected) {
        // Real Git commit via GitHub API
        commitHash = await GitService.commitSession(activeVolume, {
          id: currentSession.id,
          name: currentSession.name,
          messages: currentSession.messages,
          artifacts: currentSession.artifacts,
          traces: currentSession.traces ? [currentSession.traces] : undefined,
        });
      } else {
        // Fallback to local-only commit
        commitHash = `local-${Math.random().toString(36).substring(2, 9)}`;
      }

      // Update session status to saved
      updateSession(currentSession.id, {
        status: 'saved',
        commitHash,
      });
    } catch (error) {
      console.error('Failed to commit session:', error);
      alert(`Failed to commit: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsCommitting(false);
    }
  };

  if (!currentSession) {
    return (
      <div className="h-full flex flex-col bg-terminal-bg-secondary p-6 text-center">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-terminal-fg-tertiary text-sm space-y-2">
            <div className="text-4xl mb-4">ℹ</div>
            <p>Select or start a session to view context</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-terminal-bg-secondary overflow-y-auto">
      {/* Session Info */}
      <div className="p-4 border-b border-terminal-border">
        <h2 className="terminal-heading text-xs mb-3">SESSION INFO</h2>
        <div className="space-y-2 text-xs text-terminal-fg-secondary">
          <div className="flex justify-between">
            <span>Status:</span>
            <span
              className={
                currentSession.status === 'temporal'
                  ? 'text-terminal-accent-yellow'
                  : 'text-terminal-accent-green'
              }
            >
              {currentSession.status}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Volume:</span>
            <span>{currentSession.volume}</span>
          </div>
          <div className="flex justify-between">
            <span>Messages:</span>
            <span>{currentSession.messages?.length || 0}</span>
          </div>
          {currentSession.traces > 0 && (
            <div className="flex justify-between">
              <span>Traces:</span>
              <span>{currentSession.traces}</span>
            </div>
          )}
        </div>
      </div>

      {/* Artifacts */}
      {currentSession.artifacts && currentSession.artifacts.length > 0 && (
        <div className="p-4 border-b border-terminal-border">
          <h2 className="terminal-heading text-xs mb-3">
            ARTIFACTS ({currentSession.artifacts.length})
          </h2>
          <div className="space-y-2">
            {currentSession.artifacts.map((artifact, index) => (
              <div
                key={index}
                className="p-2 rounded bg-terminal-bg-primary border border-terminal-border hover:border-terminal-accent-blue transition-colors cursor-pointer group"
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-terminal-fg-secondary">
                    {artifact.type === 'skill' && '📄'}
                    {artifact.type === 'code' && '💻'}
                    {artifact.type === 'workflow' && '🔗'}
                    {!['skill', 'code', 'workflow'].includes(artifact.type) && '⚛️'}
                  </span>
                  <span className="text-xs text-terminal-accent-blue flex-1 truncate">
                    {artifact.name}
                  </span>
                  <button className="text-[10px] text-terminal-fg-tertiary hover:text-terminal-accent-green opacity-0 group-hover:opacity-100 transition-opacity">
                    View →
                  </button>
                </div>
                {/* Mini preview for visual artifacts */}
                {!['skill', 'code', 'workflow'].includes(artifact.type) && (
                  <div className="h-16 bg-terminal-bg-secondary rounded border border-terminal-border flex items-center justify-center text-[10px] text-terminal-fg-tertiary">
                    Preview available in Artifacts tab
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Evolution Status */}
      {currentSession.evolution && currentSession.evolution.patternsDetected > 0 && (
        <div className="p-4 border-b border-terminal-border bg-terminal-bg-tertiary">
          <h2 className="terminal-heading text-xs mb-3">🧬 EVOLUTION</h2>
          <div className="space-y-2">
            <div className="text-sm text-terminal-accent-green">
              {currentSession.evolution.patternName}
            </div>
            <div className="text-xs text-terminal-fg-secondary space-y-1">
              <div className="flex justify-between">
                <span>Occurrence:</span>
                <span>
                  {currentSession.evolution.occurrence}
                  {currentSession.evolution.occurrence === 1
                    ? 'st'
                    : currentSession.evolution.occurrence === 2
                    ? 'nd'
                    : currentSession.evolution.occurrence === 3
                    ? 'rd'
                    : 'th'}{' '}
                  time
                </span>
              </div>
              <div className="flex justify-between">
                <span>Confidence:</span>
                <span>
                  {(currentSession.evolution.confidence * 100).toFixed(0)}%
                </span>
              </div>
            </div>
            <div className="mt-3 space-y-2">
              <button className="btn-touch md:btn-terminal text-xs w-full">
                Promote to Team
              </button>
              <button className="btn-touch-secondary md:btn-terminal-secondary text-xs w-full">
                View Pattern Details
              </button>
            </div>
          </div>
        </div>
      )}

      {/* GitHub Connection */}
      <div className="p-4 border-b border-terminal-border">
        <h2 className="terminal-heading text-xs mb-3">GITHUB</h2>
        <GitHubConnect />
      </div>

      {/* Actions */}
      <div className="p-4">
        <h2 className="terminal-heading text-xs mb-3">ACTIONS</h2>
        <div className="space-y-2">
          {currentSession.status === 'temporal' && (
            <>
              <button
                onClick={handleCommitSession}
                disabled={isCommitting}
                className="btn-touch md:btn-terminal text-xs w-full"
              >
                {isCommitting ? 'Saving...' : 'Save Session'}
              </button>
              <button className="btn-touch-secondary md:btn-terminal-secondary text-xs w-full">
                Share Session
              </button>
            </>
          )}
          {currentSession.status === 'saved' && currentSession.commitHash && (
            <div className="p-2 bg-terminal-bg-tertiary rounded border border-terminal-border">
              <div className="text-xs text-terminal-fg-secondary mb-1">
                Saved
              </div>
              <div className="font-mono text-xs text-terminal-accent-green">
                {currentSession.commitHash}
              </div>
            </div>
          )}
          <button className="btn-touch-secondary md:btn-terminal-secondary text-xs w-full">
            Export Chat
          </button>
          <button className="btn-touch-secondary md:btn-terminal-secondary text-xs w-full text-terminal-accent-red">
            Delete Session
          </button>
        </div>
      </div>
    </div>
  );
}
