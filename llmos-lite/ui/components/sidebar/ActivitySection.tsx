'use client';

import { useSessionContext } from '@/contexts/SessionContext';

interface ActivitySectionProps {
  expanded: boolean;
  onToggle: () => void;
}

export default function ActivitySection({ expanded, onToggle }: ActivitySectionProps) {
  const { cronJobs } = useSessionContext();

  const completedCrons = cronJobs.filter((c) => c.status === 'completed').length;
  const runningCrons = cronJobs.filter((c) => c.status === 'running').length;

  return (
    <div className="border-t border-terminal-border">
      <button
        onClick={onToggle}
        className="w-full p-3 flex items-center justify-between hover:bg-terminal-bg-tertiary transition-colors touch-manipulation"
      >
        <div className="flex items-center gap-2">
          <h2 className="terminal-heading text-xs">ACTIVITY</h2>
          {!expanded && (
            <div className="flex items-center gap-2 text-xs text-terminal-fg-tertiary">
              {runningCrons > 0 && (
                <span className="text-terminal-accent-yellow">{runningCrons} running</span>
              )}
              {completedCrons > 0 && (
                <span className="text-terminal-accent-green">{completedCrons} done</span>
              )}
            </div>
          )}
        </div>
        <span className="text-terminal-fg-secondary text-xs">
          {expanded ? '▼' : '▶'}
        </span>
      </button>

      {expanded && (
        <div className="px-3 pb-3 max-h-64 overflow-y-auto">
          <div className="space-y-2">
            {cronJobs.map((cron) => (
              <div
                key={cron.id}
                className="p-2 rounded bg-terminal-bg-primary border border-terminal-border"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className={
                      cron.status === 'completed'
                        ? 'text-terminal-accent-green'
                        : cron.status === 'running'
                        ? 'text-terminal-accent-yellow'
                        : 'text-terminal-fg-tertiary'
                    }
                  >
                    {cron.status === 'completed' && '✓'}
                    {cron.status === 'running' && '⟳'}
                    {cron.status === 'scheduled' && '⏸'}
                  </span>
                  <span className="text-xs font-medium">{cron.name}</span>
                </div>
                <div className="ml-5 text-xs text-terminal-fg-secondary space-y-0.5">
                  <div>Last: {cron.lastRun}</div>
                  {cron.status === 'completed' && (
                    <div className="text-terminal-accent-green">
                      {cron.skillsGenerated} skills from {cron.patterns} patterns
                    </div>
                  )}
                  <div>Next: {cron.nextRun}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Git Status - Minimal */}
          <div className="mt-3 pt-3 border-t border-terminal-border">
            <div className="text-xs text-terminal-fg-tertiary">
              <div className="flex items-center gap-2">
                <span>Git:</span>
                <span className="text-terminal-accent-green">Clean</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
