'use client';

import SessionView from './SessionView';
import CronView from './CronView';
import { PanelErrorBoundary } from '@/components/shared/ErrorBoundary';

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
    <PanelErrorBoundary panelName="Session Panel">
      <div className="h-full flex flex-col bg-terminal-bg-secondary">
        {viewMode === 'session' ? (
          <PanelErrorBoundary panelName="Session View">
            <SessionView activeSession={activeSession} activeVolume={activeVolume} />
          </PanelErrorBoundary>
        ) : (
          <PanelErrorBoundary panelName="Cron View">
            <CronView />
          </PanelErrorBoundary>
        )}
      </div>
    </PanelErrorBoundary>
  );
}
