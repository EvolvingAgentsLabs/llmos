'use client';

import { useState } from 'react';
import { useProjectContext } from '@/contexts/ProjectContext';
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
  const { projects, updateProject } = useProjectContext();
  const currentProject = projects.find((p) => p.id === activeSession);
  const [isCommitting, setIsCommitting] = useState(false);

  const handleCommitProject = async () => {
    if (!currentProject) return;

    setIsCommitting(true);

    try {
      // Check if GitHub is connected
      const isGitHubConnected = GitHubAuth.isAuthenticated();

      let commitHash: string;

      if (isGitHubConnected) {
        // Real Git commit via GitHub API
        commitHash = await GitService.commitSession(activeVolume, {
          id: currentProject.id,
          name: currentProject.name,
          messages: currentProject.messages,
          artifacts: currentProject.artifacts,
          traces: currentProject.traces ? [currentProject.traces] : undefined,
        });
      } else {
        // Fallback to local-only commit
        commitHash = `local-${Math.random().toString(36).substring(2, 9)}`;
      }

      // Update project status to saved
      updateProject(currentProject.id, {
        status: 'saved',
        commitHash,
      });
    } catch (error) {
      console.error('Failed to commit project:', error);
      alert(`Failed to commit: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsCommitting(false);
    }
  };

  if (!currentProject) {
    return (
      <div className="h-full flex flex-col bg-bg-secondary overflow-hidden">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="text-4xl mb-3 opacity-30">ℹ️</div>
            <p className="text-xs text-fg-tertiary">No project selected</p>
            <p className="text-[10px] text-fg-muted mt-1">Select a project to view context</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-bg-secondary overflow-y-auto scrollbar-thin">
      {/* Project Info - VSCode Style */}
      <div className="px-3 py-2 border-b border-border-primary/50">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-semibold text-fg-tertiary uppercase tracking-wider">Project Info</span>
        </div>
        <div className="space-y-1.5 text-[10px]">
          <div className="flex justify-between items-center">
            <span className="text-fg-tertiary">Status</span>
            <span className={`px-1.5 py-0.5 rounded ${
              currentProject.status === 'temporal'
                ? 'bg-accent-warning/20 text-accent-warning'
                : 'bg-accent-success/20 text-accent-success'
            }`}>
              {currentProject.status}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-fg-tertiary">Volume</span>
            <span className="text-fg-secondary">{currentProject.volume}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-fg-tertiary">Messages</span>
            <span className="text-fg-secondary">{currentProject.messages?.length || 0}</span>
          </div>
          {currentProject.traces > 0 && (
            <div className="flex justify-between items-center">
              <span className="text-fg-tertiary">Traces</span>
              <span className="text-fg-secondary">{currentProject.traces}</span>
            </div>
          )}
        </div>
      </div>

      {/* Artifacts - VSCode Style */}
      {currentProject.artifacts && currentProject.artifacts.length > 0 && (
        <div className="px-3 py-2 border-b border-border-primary/50">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-semibold text-fg-tertiary uppercase tracking-wider">
              Artifacts
              <span className="ml-1.5 px-1.5 py-0.5 rounded bg-bg-elevated text-fg-tertiary">
                {currentProject.artifacts.length}
              </span>
            </span>
          </div>
          <div className="space-y-1">
            {currentProject.artifacts.map((artifact, index) => (
              <div
                key={index}
                className="group px-2 py-1.5 rounded bg-bg-tertiary border border-border-primary hover:border-accent-primary/50 transition-all cursor-pointer"
              >
                <div className="flex items-center gap-1.5">
                  <span className="text-xs flex-shrink-0">
                    {artifact.type === 'skill' && '📝'}
                    {artifact.type === 'code' && '💻'}
                    {artifact.type === 'workflow' && '🔄'}
                    {!['skill', 'code', 'workflow'].includes(artifact.type) && '⚛️'}
                  </span>
                  <span className="text-[10px] text-fg-primary flex-1 truncate">
                    {artifact.name}
                  </span>
                  <span className="text-[10px] text-fg-tertiary opacity-0 group-hover:opacity-100 transition-opacity">
                    →
                  </span>
                </div>
                {/* Mini preview indicator for visual artifacts */}
                {!['skill', 'code', 'workflow'].includes(artifact.type) && (
                  <div className="mt-1 h-12 bg-bg-elevated rounded border border-border-primary/30 flex items-center justify-center">
                    <span className="text-[9px] text-fg-muted">Preview available</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Evolution Status - VSCode Style */}
      {currentProject.evolution && currentProject.evolution.patternsDetected > 0 && (
        <div className="px-3 py-2 border-b border-border-primary/50 bg-accent-success/5">
          <div className="flex items-center gap-1.5 mb-2">
            <span className="text-xs">🧬</span>
            <span className="text-[10px] font-semibold text-fg-tertiary uppercase tracking-wider">Evolution</span>
          </div>
          <div className="space-y-2">
            <div className="text-xs text-accent-success font-medium">
              {currentProject.evolution.patternName}
            </div>
            <div className="text-[10px] space-y-1">
              <div className="flex justify-between items-center">
                <span className="text-fg-tertiary">Occurrence</span>
                <span className="text-fg-secondary">
                  {currentProject.evolution.occurrence}
                  {currentProject.evolution.occurrence === 1
                    ? 'st'
                    : currentProject.evolution.occurrence === 2
                    ? 'nd'
                    : currentProject.evolution.occurrence === 3
                    ? 'rd'
                    : 'th'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-fg-tertiary">Confidence</span>
                <span className="text-accent-success">
                  {(currentProject.evolution.confidence * 100).toFixed(0)}%
                </span>
              </div>
            </div>
            <div className="mt-2 space-y-1">
              <button className="w-full px-2 py-1 rounded text-[10px] bg-accent-primary hover:bg-accent-primary/80 text-white transition-colors">
                Promote to Team
              </button>
              <button className="w-full px-2 py-1 rounded text-[10px] bg-bg-tertiary hover:bg-bg-elevated text-fg-secondary border border-border-primary transition-colors">
                View Details
              </button>
            </div>
          </div>
        </div>
      )}

      {/* GitHub Connection - VSCode Style */}
      <div className="px-3 py-2 border-b border-border-primary/50">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-semibold text-fg-tertiary uppercase tracking-wider">GitHub</span>
        </div>
        <GitHubConnect />
      </div>

      {/* Actions - VSCode Style */}
      <div className="px-3 py-2">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-semibold text-fg-tertiary uppercase tracking-wider">Actions</span>
        </div>
        <div className="space-y-1">
          {currentProject.status === 'temporal' && (
            <>
              <button
                onClick={handleCommitProject}
                disabled={isCommitting}
                className="w-full px-2 py-1.5 rounded text-[10px] bg-accent-primary hover:bg-accent-primary/80 text-white transition-colors disabled:opacity-50"
              >
                {isCommitting ? 'Saving...' : 'Save Project'}
              </button>
              <button className="w-full px-2 py-1.5 rounded text-[10px] bg-bg-tertiary hover:bg-bg-elevated text-fg-secondary border border-border-primary transition-colors">
                Share Project
              </button>
            </>
          )}
          {currentProject.status === 'saved' && currentProject.commitHash && (
            <div className="p-2 bg-bg-elevated rounded border border-border-primary">
              <div className="text-[10px] text-fg-tertiary mb-1">
                Saved
              </div>
              <div className="font-mono text-[10px] text-accent-success truncate">
                {currentProject.commitHash}
              </div>
            </div>
          )}
          <button className="w-full px-2 py-1.5 rounded text-[10px] bg-bg-tertiary hover:bg-bg-elevated text-fg-secondary border border-border-primary transition-colors">
            Export Chat
          </button>
          <button className="w-full px-2 py-1.5 rounded text-[10px] bg-bg-tertiary hover:bg-bg-elevated text-accent-error border border-border-primary hover:border-accent-error/50 transition-colors">
            Delete Project
          </button>
        </div>
      </div>
    </div>
  );
}
