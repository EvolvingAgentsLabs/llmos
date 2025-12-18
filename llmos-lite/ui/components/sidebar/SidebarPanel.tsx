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
    <div className="h-full flex flex-col overflow-hidden">
      {/* Volume Tree Section */}
      <div className="px-4 py-4 border-b border-border-primary/50">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold text-fg-secondary uppercase tracking-wider">
            Workspace
          </h2>
        </div>
        <VolumeTree activeVolume={activeVolume} onVolumeChange={onVolumeChange} />
      </div>

      {/* Sessions List - Scrollable */}
      <div className="flex-1 flex flex-col overflow-hidden border-b border-border-primary/50">
        <div className="px-4 py-3 flex items-center justify-between">
          <h2 className="text-xs font-semibold text-fg-secondary uppercase tracking-wider">
            Sessions
            <span className="ml-2 px-2 py-0.5 rounded-md bg-bg-tertiary text-fg-tertiary text-xs">
              {currentSessions.length}
            </span>
          </h2>
          <button
            onClick={handleNewSession}
            className="btn-icon w-7 h-7"
            title="New Session"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-4 scrollbar-thin">
          {currentSessions.length === 0 ? (
            <div className="empty-state py-8">
              <svg className="empty-state-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
              <p className="empty-state-description">
                No sessions yet. Click + to create one.
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {currentSessions.map((session) => (
                <div
                  key={session.id}
                  onClick={() => onSessionChange(session.id)}
                  className={`
                    group px-3 py-2.5 rounded-lg cursor-pointer transition-all duration-200
                    ${
                      activeSession === session.id
                        ? 'bg-bg-elevated border border-accent-primary/50 shadow-sm'
                        : 'hover:bg-bg-tertiary border border-transparent'
                    }
                  `}
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    {/* Status indicator */}
                    <div className={
                      session.status === 'uncommitted'
                        ? 'status-pending'
                        : 'status-active'
                    } />

                    {/* Session name */}
                    <span className={`text-sm font-medium truncate ${
                      activeSession === session.id ? 'text-fg-primary' : 'text-fg-secondary group-hover:text-fg-primary'
                    }`}>
                      {session.name}
                    </span>
                  </div>

                  {/* Session metadata */}
                  <div className="ml-4 flex items-center gap-2 text-xs text-fg-tertiary">
                    <span className="flex items-center gap-1">
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                      </svg>
                      {session.messages?.length || 0}
                    </span>
                    <span>·</span>
                    <span>{session.timeAgo}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Activity Section - Collapsible */}
      <ActivitySection
        expanded={activityExpanded}
        onToggle={() => setActivityExpanded(!activityExpanded)}
      />
    </div>
  );
}
