'use client';

import SessionView from './SessionView';
import CronView from './CronView';

interface SessionPanelProps {
  viewMode: 'session' | 'cron';
  activeSession: string | null;
  activeVolume: 'system' | 'team' | 'user';
}

export default function SessionPanel({
  viewMode,
  activeSession,
  activeVolume,
}: SessionPanelProps) {
  return (
    <div className="h-full flex flex-col bg-terminal-bg-secondary">
      {viewMode === 'session' ? (
        <SessionView activeSession={activeSession} activeVolume={activeVolume} />
      ) : (
        <CronView />
      )}
    </div>
  );
}
