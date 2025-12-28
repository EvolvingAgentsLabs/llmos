'use client';

import { useState } from 'react';
import { useSessionContext, SessionType } from '@/contexts/SessionContext';
import VSCodeFileTree from '../panel1-volumes/VSCodeFileTree';
import ActivitySection from './ActivitySection';
import NewSessionDialog from '../session/NewSessionDialog';
import SessionStatusBadge from '../session/SessionStatusBadge';

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
  const [showNewSessionDialog, setShowNewSessionDialog] = useState(false);

  const currentSessions = activeSessions[activeVolume];

  const handleNewSession = () => {
    setShowNewSessionDialog(true);
  };

  const handleCreateSession = (data: {
    name: string;
    type: SessionType;
    goal?: string;
  }) => {
    const newSession = addSession({
      name: data.name,
      type: data.type,
      status: 'temporal',
      volume: activeVolume,
      goal: data.goal,
    });
    onSessionChange(newSession.id);
  };

  return (
    <div className="h-full flex flex-col overflow-hidden bg-bg-secondary">
      {/* VSCode File Tree - Takes significant space with minimum height */}
      <div className="flex-1 min-h-[250px] border-b border-border-primary/50 overflow-hidden">
        <VSCodeFileTree
          activeVolume={activeVolume}
          onVolumeChange={onVolumeChange}
          onFileSelect={(node) => {
            console.log('[SidebarPanel] File selected:', node);
            // TODO: Handle file selection (open in editor, show preview, etc.)
          }}
          selectedFile={null}
        />
      </div>

      {/* Sessions List - Compact with limited height */}
      <div className="flex flex-col overflow-hidden border-b border-border-primary/50 max-h-48 flex-shrink-0">
        <div className="px-3 py-2 flex items-center justify-between bg-bg-secondary/50">
          <span className="text-[10px] font-semibold text-fg-tertiary uppercase tracking-wider">
            Sessions
            <span className="ml-1.5 px-1.5 py-0.5 rounded bg-bg-elevated text-fg-tertiary text-[9px]">
              {currentSessions.length}
            </span>
          </span>
          <button
            onClick={handleNewSession}
            className="w-5 h-5 flex items-center justify-center rounded hover:bg-bg-tertiary transition-colors"
            title="New Session"
          >
            <svg className="w-3 h-3 text-fg-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-1 scrollbar-thin">
          {currentSessions.length === 0 ? (
            <div className="py-4 px-2 text-center">
              <svg className="w-8 h-8 mx-auto mb-2 text-fg-muted opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
              <p className="text-[10px] text-fg-tertiary">
                No sessions
              </p>
            </div>
          ) : (
            <div className="space-y-0.5">
              {currentSessions.map((session) => (
                <div
                  key={session.id}
                  onClick={() => onSessionChange(session.id)}
                  className={`
                    group px-2 py-1.5 rounded cursor-pointer transition-all duration-100
                    ${
                      activeSession === session.id
                        ? 'bg-accent-primary/20'
                        : 'hover:bg-bg-tertiary'
                    }
                  `}
                >
                  <div className="flex items-center gap-1.5 mb-0.5">
                    {/* Session type icon */}
                    <span className="text-xs flex-shrink-0">
                      {session.type === 'user' ? '💬' : '👥'}
                    </span>

                    {/* Session name */}
                    <span className={`text-xs truncate flex-1 ${
                      activeSession === session.id ? 'text-fg-primary font-medium' : 'text-fg-secondary'
                    }`}>
                      {session.name}
                    </span>

                    {/* Unsaved indicator */}
                    {session.status === 'temporal' && (
                      <span className="w-1.5 h-1.5 rounded-full bg-accent-warning flex-shrink-0" title="Unsaved"></span>
                    )}
                  </div>

                  {/* Session metadata (compact) */}
                  <div className="ml-5 flex items-center gap-1.5 text-[10px] text-fg-tertiary">
                    <span>{session.messages?.length || 0} msg</span>
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

      {/* New Session Dialog */}
      <NewSessionDialog
        isOpen={showNewSessionDialog}
        onClose={() => setShowNewSessionDialog(false)}
        onCreate={handleCreateSession}
        defaultVolume={activeVolume}
      />
    </div>
  );
}
