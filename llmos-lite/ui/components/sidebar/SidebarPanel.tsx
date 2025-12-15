'use client';

import { useState } from 'react';
import { useSessionContext } from '@/contexts/SessionContext';
import VolumeTree from '../panel1-volumes/VolumeTree';
import ActivitySection from './ActivitySection';

interface SidebarPanelProps {
  activeVolume: 'system' | 'team' | 'user';
  onVolumeChange: (volume: 'system' | 'team' | 'user') => void;
  activeSession: string | null;
  onSessionChange: (sessionId: string | null) => void;
}

export default function SidebarPanel({
  activeVolume,
  onVolumeChange,
  activeSession,
  onSessionChange,
}: SidebarPanelProps) {
  const { activeSessions, addSession } = useSessionContext();
  const [activityExpanded, setActivityExpanded] = useState(false);

  const currentSessions = activeSessions[activeVolume];

  const handleNewSession = () => {
    const newSession = addSession({
      name: `New Session ${currentSessions.length + 1}`,
      status: 'uncommitted',
      volume: activeVolume,
    });
    onSessionChange(newSession.id);
  };

  return (
    <div className="h-full flex flex-col bg-terminal-bg-secondary">
      {/* Volume Tree */}
      <div className="p-4 border-b border-terminal-border">
        <h2 className="terminal-heading text-xs mb-3">WORKSPACE</h2>
        <VolumeTree activeVolume={activeVolume} onVolumeChange={onVolumeChange} />
      </div>

      {/* Sessions List - Takes up most space */}
      <div className="flex-1 flex flex-col overflow-hidden border-b border-terminal-border">
        <div className="p-4 pb-2 flex items-center justify-between">
          <h2 className="terminal-heading text-xs">
            SESSIONS ({currentSessions.length})
          </h2>
          <button
            onClick={handleNewSession}
            className="text-terminal-accent-green hover:text-terminal-fg-primary text-lg leading-none"
            title="New Session"
          >
            +
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {currentSessions.length === 0 ? (
            <div className="text-terminal-fg-tertiary text-xs italic py-2">
              No sessions yet. Click + to create one.
            </div>
          ) : (
            <div className="space-y-2">
              {currentSessions.map((session) => (
                <div
                  key={session.id}
                  onClick={() => onSessionChange(session.id)}
                  className={`
                    p-2 rounded cursor-pointer transition-colors
                    ${
                      activeSession === session.id
                        ? 'terminal-active'
                        : 'terminal-hover'
                    }
                  `}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={
                        session.status === 'uncommitted'
                          ? 'status-active'
                          : 'status-success'
                      }
                    >
                      {session.status === 'uncommitted' ? '●' : '✓'}
                    </span>
                    <span className="text-sm font-medium truncate">
                      {session.name}
                    </span>
                  </div>
                  <div className="ml-6 text-xs text-terminal-fg-secondary">
                    <div>
                      {session.messages?.length || 0} messages · {session.timeAgo}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Activity Section - Collapsible, minimal when collapsed */}
      <ActivitySection
        expanded={activityExpanded}
        onToggle={() => setActivityExpanded(!activityExpanded)}
      />
    </div>
  );
}
