'use client';

import { useSessionContext } from '@/contexts/SessionContext';

interface SessionListProps {
  activeVolume: 'system' | 'team' | 'user';
  activeSession: string | null;
  onSessionChange: (sessionId: string) => void;
}

export default function SessionList({
  activeVolume,
  activeSession,
  onSessionChange,
}: SessionListProps) {
  const { activeSessions } = useSessionContext();
  const sessions = activeSessions[activeVolume];

  if (sessions.length === 0) {
    return (
      <div className="text-terminal-fg-tertiary text-xs">
        <p className="mb-2">No active sessions</p>
        <p className="text-terminal-fg-quaternary">
          Start a chat to create your first session
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {sessions.map((session) => (
        <div
          key={session.id}
          onClick={() => onSessionChange(session.id)}
          className={`
            p-2 rounded cursor-pointer transition-colors
            ${activeSession === session.id ? 'terminal-active' : 'terminal-hover'}
          `}
        >
          <div className="flex items-center gap-2 mb-1">
            <span className={session.status === 'temporal' ? 'status-active' : 'status-success'}>
              {session.status === 'temporal' ? '●' : '✓'}
            </span>
            <span className="text-sm font-medium">{session.name}</span>
          </div>
          <div className="ml-6 text-xs text-terminal-fg-secondary space-y-0.5">
            {session.messages.length > 0 && (
              <div>{session.messages.length} message{session.messages.length !== 1 ? 's' : ''}</div>
            )}
            <div>{session.timeAgo}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
