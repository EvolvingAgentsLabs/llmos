/**
 * Git Status Widget
 *
 * Shows Git status for a volume with modified files, commit, and push controls
 */

'use client';

import { useState, useEffect } from 'react';
import { getVolumeFileSystem, VolumeType, VolumeFile } from '@/lib/volumes/file-operations';

interface GitStatusWidgetProps {
  volume: VolumeType;
  onCommit?: () => void;
}

export default function GitStatusWidget({ volume, onCommit }: GitStatusWidgetProps) {
  const [modifiedFiles, setModifiedFiles] = useState<VolumeFile[]>([]);
  const [commitMessage, setCommitMessage] = useState('');
  const [showCommitDialog, setShowCommitDialog] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);

  const fs = getVolumeFileSystem();
  const git = getGitOperations();

  useEffect(() => {
    refreshStatus();

    // Refresh every 2 seconds
    const interval = setInterval(refreshStatus, 2000);
    return () => clearInterval(interval);
  }, [volume]);

  const refreshStatus = () => {
    const files = fs.getModifiedFiles(volume);
    setModifiedFiles(files);
  };

  const handleCommit = async () => {
    if (!commitMessage.trim() || modifiedFiles.length === 0) return;

    setIsCommitting(true);
    try {
      await fs.commit(volume, commitMessage);

      setCommitMessage('');
      setShowCommitDialog(false);
      refreshStatus();
      onCommit?.();
    } catch (error) {
      console.error('Commit failed:', error);
    } finally {
      setIsCommitting(false);
    }
  };

  // System volume is read-only, don't show git controls
  if (volume === 'system') {
    return null;
  }

  if (modifiedFiles.length === 0) {
    return (
      <div className="px-3 py-2 text-xs text-fg-tertiary">
        <div className="flex items-center gap-1.5">
          <svg className="w-3 h-3 text-accent-success" fill="currentColor" viewBox="0 0 16 16">
            <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"/>
          </svg>
          No changes
        </div>
      </div>
    );
  }

  return (
    <div className="border-t border-border-primary/30 bg-bg-secondary/20">
      {/* Header */}
      <div className="px-3 py-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <svg className="w-3 h-3 text-accent-warning" fill="currentColor" viewBox="0 0 16 16">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
          </svg>
          <span className="text-xs font-semibold text-fg-secondary">
            {modifiedFiles.length} change{modifiedFiles.length !== 1 ? 's' : ''}
          </span>
        </div>

        <button
          onClick={() => setShowCommitDialog(!showCommitDialog)}
          className="text-[10px] px-2 py-0.5 rounded bg-accent-primary hover:bg-accent-primary/90 text-white transition-colors"
        >
          Commit
        </button>
      </div>

      {/* Modified Files List */}
      <div className="px-3 pb-2 space-y-1 max-h-32 overflow-y-auto scrollbar-thin">
        {modifiedFiles.map((file) => (
          <div
            key={file.path}
            className="flex items-center gap-1.5 text-[11px] text-fg-secondary hover:text-fg-primary transition-colors"
          >
            <span
              className={`w-1 h-1 rounded-full ${
                file.gitStatus === 'modified'
                  ? 'bg-accent-warning'
                  : file.gitStatus === 'new'
                  ? 'bg-accent-success'
                  : 'bg-accent-error'
              }`}
            />
            <span className="flex-1 truncate font-mono">{file.path}</span>
            <span
              className={`text-[9px] px-1 rounded ${
                file.gitStatus === 'modified'
                  ? 'bg-accent-warning/20 text-accent-warning'
                  : file.gitStatus === 'new'
                  ? 'bg-accent-success/20 text-accent-success'
                  : 'bg-accent-error/20 text-accent-error'
              }`}
            >
              {file.gitStatus === 'modified' ? 'M' : file.gitStatus === 'new' ? 'A' : 'D'}
            </span>
          </div>
        ))}
      </div>

      {/* Commit Dialog */}
      {showCommitDialog && (
        <div className="px-3 pb-3 space-y-2">
          <div className="pt-2 border-t border-border-primary/30">
            <input
              type="text"
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleCommit();
                }
              }}
              placeholder="Commit message..."
              className="w-full px-2 py-1.5 text-xs bg-bg-tertiary border border-border-primary/50 rounded text-fg-primary placeholder:text-fg-muted focus:outline-none focus:border-accent-primary"
              autoFocus
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCommit}
              disabled={!commitMessage.trim() || isCommitting}
              className="flex-1 px-2 py-1 text-xs rounded bg-accent-success hover:bg-accent-success/90 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isCommitting ? 'Committing...' : `Commit ${modifiedFiles.length} file${modifiedFiles.length !== 1 ? 's' : ''}`}
            </button>

            <button
              onClick={() => setShowCommitDialog(false)}
              className="px-2 py-1 text-xs rounded bg-bg-tertiary hover:bg-bg-elevated text-fg-secondary transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
