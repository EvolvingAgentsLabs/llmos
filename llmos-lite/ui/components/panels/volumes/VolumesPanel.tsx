'use client';

import { useState } from 'react';
import VolumeTree from './VolumeTree';
import SessionList from './SessionList';
import CronList from './CronList';
import GitStatus from './GitStatus';

interface VolumesPanelProps {
  activeVolume: 'system' | 'team' | 'user';
  onVolumeChange: (volume: 'system' | 'team' | 'user') => void;
  activeSession: string | null;
  onSessionChange: (sessionId: string) => void;
  onCronClick: () => void;
}

export default function VolumesPanel({
  activeVolume,
  onVolumeChange,
  activeSession,
  onSessionChange,
  onCronClick,
}: VolumesPanelProps) {
  const [cronExpanded, setCronExpanded] = useState(false);
  const [gitExpanded, setGitExpanded] = useState(false);

  return (
    <div className="h-full flex flex-col bg-terminal-bg-secondary">
      {/* Volume Tree */}
      <div className="p-4 border-b border-terminal-border">
        <h2 className="terminal-heading text-xs mb-3">VOLUMES</h2>
        <VolumeTree
          activeVolume={activeVolume}
          onVolumeChange={onVolumeChange}
        />
      </div>

      {/* Sessions List */}
      <div className="flex-1 p-4 border-b border-terminal-border overflow-auto">
        <h2 className="terminal-heading text-xs mb-3">
          SESSIONS ({activeVolume})
        </h2>
        <SessionList
          activeVolume={activeVolume}
          activeSession={activeSession}
          onSessionChange={onSessionChange}
        />
      </div>

      {/* Cron Updates - Collapsible */}
      <div className="border-b border-terminal-border">
        <button
          onClick={() => setCronExpanded(!cronExpanded)}
          className="w-full p-4 flex items-center justify-between hover:bg-terminal-bg-tertiary transition-colors touch-manipulation"
        >
          <h2 className="terminal-heading text-xs">CRON UPDATES</h2>
          <span className="text-terminal-fg-secondary text-xs">
            {cronExpanded ? '▼' : '▶'}
          </span>
        </button>
        {cronExpanded && (
          <div className="px-4 pb-4">
            <CronList onCronClick={onCronClick} />
          </div>
        )}
      </div>

      {/* Git Status - Collapsible */}
      <div>
        <button
          onClick={() => setGitExpanded(!gitExpanded)}
          className="w-full p-4 flex items-center justify-between hover:bg-terminal-bg-tertiary transition-colors touch-manipulation"
        >
          <h2 className="terminal-heading text-xs">GIT STATUS</h2>
          <span className="text-terminal-fg-secondary text-xs">
            {gitExpanded ? '▼' : '▶'}
          </span>
        </button>
        {gitExpanded && (
          <div className="px-4 pb-4">
            <GitStatus activeVolume={activeVolume} />
          </div>
        )}
      </div>
    </div>
  );
}
