'use client';

interface GitStatusProps {
  activeVolume: 'system' | 'team' | 'user';
}

export default function GitStatus({ activeVolume }: GitStatusProps) {
  const gitStatus = {
    user: {
      branch: 'main',
      uncommittedChanges: 3,
      changes: [
        { type: 'M', file: 'skills/quantum-optimization.md' },
        { type: 'A', file: 'vqe-optimized.py' },
        { type: 'A', file: 'sessions/quantum-research.json' },
      ],
    },
    team: {
      branch: 'main',
      uncommittedChanges: 0,
      changes: [],
    },
    system: {
      branch: 'main',
      uncommittedChanges: 0,
      changes: [],
    },
  };

  const status = gitStatus[activeVolume];

  return (
    <div className="space-y-2">
      <div className="text-xs text-terminal-fg-secondary">
        Branch: <span className="text-terminal-fg-primary">{status.branch}</span>
      </div>
      <div className="text-xs text-terminal-fg-secondary">
        Volume: <span className="text-terminal-fg-primary">
          {activeVolume}
          {activeVolume === 'team' && '@engineering'}
          {activeVolume === 'user' && '@alice'}
        </span>
      </div>

      {status.uncommittedChanges > 0 ? (
        <>
          <div className="git-badge git-badge-uncommitted mt-2">
            {status.uncommittedChanges} uncommitted change{status.uncommittedChanges > 1 ? 's' : ''}
          </div>

          <div className="mt-3 space-y-1">
            {status.changes.map((change, index) => (
              <div key={index} className="text-xs font-mono flex items-center gap-2">
                <span className={
                  change.type === 'M' ? 'text-terminal-accent-yellow' :
                  change.type === 'A' ? 'text-terminal-accent-green' :
                  'text-terminal-accent-red'
                }>
                  {change.type}
                </span>
                <span className="text-terminal-fg-secondary truncate">
                  {change.file}
                </span>
              </div>
            ))}
          </div>

          <div className="flex gap-2 mt-3">
            <button className="btn-terminal text-xs py-1 px-2 flex-1">
              Commit All
            </button>
            <button className="btn-terminal-secondary text-xs py-1 px-2">
              Diff
            </button>
          </div>
        </>
      ) : (
        <div className="git-badge git-badge-committed mt-2">
          Working tree clean
        </div>
      )}
    </div>
  );
}
