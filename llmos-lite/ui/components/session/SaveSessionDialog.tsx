'use client';

import { useState, useEffect } from 'react';
import { Session } from '@/contexts/SessionContext';
import { artifactManager, Artifact } from '@/lib/artifacts';

interface SaveSessionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  session: Session | null;
  onSave: (selectedArtifactIds: string[], commitMessage: string) => Promise<void>;
}

export default function SaveSessionDialog({
  isOpen,
  onClose,
  session,
  onSave,
}: SaveSessionDialogProps) {
  const [selectedArtifacts, setSelectedArtifacts] = useState<Set<string>>(new Set());
  const [commitMessage, setCommitMessage] = useState('');
  const [pushToRemote, setPushToRemote] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sessionArtifacts = session
    ? artifactManager.filter({ createdBy: session.id })
    : [];

  // Auto-generate commit message
  useEffect(() => {
    if (session && !commitMessage) {
      const artifactTypes = new Set(sessionArtifacts.map(a => a.type));
      const typesList = Array.from(artifactTypes).join(', ');
      setCommitMessage(
        `Session: ${session.name} - ${sessionArtifacts.length} artifact${sessionArtifacts.length !== 1 ? 's' : ''} (${typesList})`
      );
    }
  }, [session, sessionArtifacts.length]);

  // Select all artifacts by default
  useEffect(() => {
    if (sessionArtifacts.length > 0 && selectedArtifacts.size === 0) {
      setSelectedArtifacts(new Set(sessionArtifacts.map(a => a.id)));
    }
  }, [sessionArtifacts.length]);

  if (!isOpen || !session) return null;

  const toggleArtifact = (artifactId: string) => {
    const newSelected = new Set(selectedArtifacts);
    if (newSelected.has(artifactId)) {
      newSelected.delete(artifactId);
    } else {
      newSelected.add(artifactId);
    }
    setSelectedArtifacts(newSelected);
  };

  const handleSave = async () => {
    if (selectedArtifacts.size === 0) {
      setError('Please select at least one artifact to save');
      return;
    }

    if (!commitMessage.trim()) {
      setError('Please provide a commit message');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      await onSave(Array.from(selectedArtifacts), commitMessage);
      onClose();
      // Reset state
      setSelectedArtifacts(new Set());
      setCommitMessage('');
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save session');
    } finally {
      setIsLoading(false);
    }
  };

  const getArtifactPath = (artifact: Artifact): string => {
    const typeDir = {
      agent: 'agents',
      tool: 'tools',
      skill: 'skills',
      workflow: 'workflows',
      code: 'code-artifacts',
    }[artifact.type];

    const extension = {
      agent: 'json',
      tool: 'py',
      skill: 'md',
      workflow: 'json',
      code: artifact.language || 'py',
    }[artifact.type];

    const safeName = artifact.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    return `${typeDir}/${safeName}.${extension}`;
  };

  const getChangeType = (artifact: Artifact): 'A' | 'M' => {
    return artifact.status === 'temporal' ? 'A' : 'M';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="glass-panel w-full max-w-2xl mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border-primary">
          <h2 className="text-lg font-semibold text-fg-primary">
            Save Session to Volume
          </h2>
          <p className="text-sm text-fg-tertiary mt-1">
            Select artifacts to commit to {session.volume}/ volume
          </p>
        </div>

        {/* Content - Scrollable */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
          {/* Session Info */}
          <div className="glass-panel p-4 bg-bg-tertiary/30">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-fg-secondary">Session:</span>
                <span className="text-fg-primary font-medium ml-2">{session.name}</span>
              </div>
              <div>
                <span className="text-fg-secondary">Type:</span>
                <span className={`ml-2 px-2 py-0.5 rounded text-xs ${
                  session.type === 'user'
                    ? 'bg-blue-500/20 text-blue-400'
                    : 'bg-purple-500/20 text-purple-400'
                }`}>
                  {session.type === 'user' ? '🔒 User' : '👥 Team'}
                </span>
              </div>
              <div>
                <span className="text-fg-secondary">Target:</span>
                <span className="text-fg-primary font-mono ml-2">{session.volume}/</span>
              </div>
              <div>
                <span className="text-fg-secondary">Artifacts:</span>
                <span className="text-fg-primary ml-2">{sessionArtifacts.length}</span>
              </div>
            </div>
          </div>

          {/* Artifacts to Save */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="block text-sm font-medium text-fg-secondary">
                Artifacts to Save ({selectedArtifacts.size} selected)
              </label>
              <button
                onClick={() => {
                  if (selectedArtifacts.size === sessionArtifacts.length) {
                    setSelectedArtifacts(new Set());
                  } else {
                    setSelectedArtifacts(new Set(sessionArtifacts.map(a => a.id)));
                  }
                }}
                className="text-xs text-accent-primary hover:underline"
              >
                {selectedArtifacts.size === sessionArtifacts.length ? 'Deselect All' : 'Select All'}
              </button>
            </div>

            {sessionArtifacts.length === 0 ? (
              <div className="text-center py-8 text-fg-tertiary">
                No artifacts to save in this session
              </div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {sessionArtifacts.map((artifact) => (
                  <label
                    key={artifact.id}
                    className={`
                      flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all
                      ${selectedArtifacts.has(artifact.id)
                        ? 'border-accent-primary bg-accent-primary/10'
                        : 'border-border-primary hover:border-border-secondary bg-bg-secondary'
                      }
                    `}
                  >
                    <input
                      type="checkbox"
                      checked={selectedArtifacts.has(artifact.id)}
                      onChange={() => toggleArtifact(artifact.id)}
                      className="mt-1"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`
                          text-xs px-1.5 py-0.5 rounded font-mono
                          ${getChangeType(artifact) === 'A'
                            ? 'bg-green-500/20 text-green-400'
                            : 'bg-yellow-500/20 text-yellow-400'
                          }
                        `}>
                          {getChangeType(artifact)}
                        </span>
                        <span className="text-sm font-medium text-fg-primary truncate">
                          {artifact.name}
                        </span>
                        <span className="text-xs px-2 py-0.5 rounded bg-bg-tertiary text-fg-tertiary">
                          {artifact.type}
                        </span>
                      </div>
                      <div className="text-xs text-fg-tertiary font-mono">
                        → {getArtifactPath(artifact)}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Commit Message */}
          <div>
            <label className="block text-sm font-medium text-fg-secondary mb-2">
              Commit Message
            </label>
            <textarea
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              placeholder="Describe the changes in this session..."
              className="input-primary w-full resize-none"
              rows={3}
            />
          </div>

          {/* Git Status Preview */}
          <div>
            <label className="block text-sm font-medium text-fg-secondary mb-2">
              Git Status Preview
            </label>
            <div className="bg-bg-tertiary rounded-lg p-4 font-mono text-xs max-h-40 overflow-y-auto">
              {sessionArtifacts
                .filter(a => selectedArtifacts.has(a.id))
                .map((artifact) => (
                  <div key={artifact.id} className="flex items-center gap-2 mb-1">
                    <span className={
                      getChangeType(artifact) === 'A'
                        ? 'text-green-400'
                        : 'text-yellow-400'
                    }>
                      {getChangeType(artifact)}
                    </span>
                    <span className="text-fg-secondary">{getArtifactPath(artifact)}</span>
                  </div>
                ))}
              {session.goal && (
                <div className="flex items-center gap-2 mb-1 mt-2 text-fg-tertiary">
                  <span>M</span>
                  <span>sessions/{session.id}.json</span>
                </div>
              )}
            </div>
          </div>

          {/* Push to Remote */}
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={pushToRemote}
              onChange={(e) => setPushToRemote(e.target.checked)}
              className="w-4 h-4"
            />
            <div className="flex-1">
              <div className="text-sm font-medium text-fg-primary">
                Push to GitHub remote
              </div>
              <div className="text-xs text-fg-tertiary">
                Sync changes to remote repository after commit
              </div>
            </div>
          </label>

          {/* Error Message */}
          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border-primary flex items-center justify-between">
          <div className="text-xs text-fg-tertiary">
            {selectedArtifacts.size} artifact{selectedArtifacts.size !== 1 ? 's' : ''} will be committed
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              disabled={isLoading}
              className="btn-secondary px-4 py-2"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isLoading || selectedArtifacts.size === 0 || !commitMessage.trim()}
              className="btn-primary px-4 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Saving...
                </span>
              ) : (
                `💾 Save & ${pushToRemote ? 'Push' : 'Commit'}`
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
