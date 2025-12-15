'use client';

import { useState } from 'react';
import Header from './Header';
import VolumesPanel from '../panel1-volumes/VolumesPanel';
import SessionPanel from '../panel2-session/SessionPanel';
import ArtifactPanel from '../panel3-artifacts/ArtifactPanel';

type MobileTab = 'volumes' | 'chat' | 'workflow';

export default function TerminalLayout() {
  const [activeVolume, setActiveVolume] = useState<'system' | 'team' | 'user'>('user');
  const [activeSession, setActiveSession] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'session' | 'cron'>('session');
  const [mobileTab, setMobileTab] = useState<MobileTab>('chat');

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden">
      {/* Header */}
      <Header />

      {/* Desktop: 3 panels side-by-side (lg+) */}
      <div className="hidden lg:flex flex-1 overflow-hidden">
        {/* Panel 1: Volumes Navigator */}
        <div className="w-80 flex-shrink-0 border-r border-terminal-border overflow-hidden">
          <VolumesPanel
            activeVolume={activeVolume}
            onVolumeChange={setActiveVolume}
            activeSession={activeSession}
            onSessionChange={(sessionId) => {
              setActiveSession(sessionId);
              setViewMode('session');
            }}
            onCronClick={() => setViewMode('cron')}
          />
        </div>

        {/* Panel 2: Session/Chat Viewer */}
        <div className="flex-1 border-r border-terminal-border overflow-hidden">
          <SessionPanel
            viewMode={viewMode}
            activeSession={activeSession}
            activeVolume={activeVolume}
          />
        </div>

        {/* Panel 3: Artifact Map & Node Editor */}
        <div className="w-96 flex-shrink-0 overflow-hidden">
          <ArtifactPanel
            activeSession={activeSession}
            activeVolume={activeVolume}
          />
        </div>
      </div>

      {/* Tablet: 2 panels side-by-side (md-lg) */}
      <div className="hidden md:flex lg:hidden flex-1 overflow-hidden">
        {/* Panel 1: Volumes Navigator */}
        <div className="w-64 flex-shrink-0 border-r border-terminal-border overflow-hidden">
          <VolumesPanel
            activeVolume={activeVolume}
            onVolumeChange={setActiveVolume}
            activeSession={activeSession}
            onSessionChange={(sessionId) => {
              setActiveSession(sessionId);
              setViewMode('session');
              setMobileTab('chat');
            }}
            onCronClick={() => setViewMode('cron')}
          />
        </div>

        {/* Panel 2 or 3: Switchable */}
        <div className="flex-1 overflow-hidden">
          {mobileTab === 'chat' ? (
            <SessionPanel
              viewMode={viewMode}
              activeSession={activeSession}
              activeVolume={activeVolume}
            />
          ) : (
            <ArtifactPanel
              activeSession={activeSession}
              activeVolume={activeVolume}
            />
          )}
        </div>

        {/* Tablet Toggle */}
        <div className="absolute bottom-4 right-4 z-10 flex gap-2">
          <button
            onClick={() => setMobileTab('chat')}
            className={`px-3 py-2 rounded text-xs font-medium transition-colors ${
              mobileTab === 'chat'
                ? 'bg-terminal-accent-green text-terminal-bg-primary'
                : 'bg-terminal-bg-secondary text-terminal-fg-secondary border border-terminal-border hover:border-terminal-accent-green'
            }`}
          >
            💬 Chat
          </button>
          <button
            onClick={() => setMobileTab('workflow')}
            className={`px-3 py-2 rounded text-xs font-medium transition-colors ${
              mobileTab === 'workflow'
                ? 'bg-terminal-accent-green text-terminal-bg-primary'
                : 'bg-terminal-bg-secondary text-terminal-fg-secondary border border-terminal-border hover:border-terminal-accent-green'
            }`}
          >
            🔗 Workflow
          </button>
        </div>
      </div>

      {/* Mobile: Single panel with tabs (< md) */}
      <div className="flex md:hidden flex-1 overflow-hidden">
        {mobileTab === 'volumes' && (
          <VolumesPanel
            activeVolume={activeVolume}
            onVolumeChange={setActiveVolume}
            activeSession={activeSession}
            onSessionChange={(sessionId) => {
              setActiveSession(sessionId);
              setViewMode('session');
              setMobileTab('chat');
            }}
            onCronClick={() => setViewMode('cron')}
          />
        )}
        {mobileTab === 'chat' && (
          <SessionPanel
            viewMode={viewMode}
            activeSession={activeSession}
            activeVolume={activeVolume}
          />
        )}
        {mobileTab === 'workflow' && (
          <ArtifactPanel
            activeSession={activeSession}
            activeVolume={activeVolume}
          />
        )}
      </div>

      {/* Mobile Bottom Navigation (< md) */}
      <nav className="md:hidden border-t border-terminal-border bg-terminal-bg-secondary">
        <div className="flex justify-around">
          <button
            onClick={() => setMobileTab('volumes')}
            className={`flex-1 py-3 text-xs font-medium transition-colors touch-manipulation ${
              mobileTab === 'volumes'
                ? 'text-terminal-accent-green bg-terminal-bg-tertiary'
                : 'text-terminal-fg-secondary hover:text-terminal-fg-primary'
            }`}
          >
            <div className="flex flex-col items-center gap-1">
              <span className="text-base">📁</span>
              <span>Volumes</span>
            </div>
          </button>
          <button
            onClick={() => setMobileTab('chat')}
            className={`flex-1 py-3 text-xs font-medium transition-colors touch-manipulation ${
              mobileTab === 'chat'
                ? 'text-terminal-accent-green bg-terminal-bg-tertiary'
                : 'text-terminal-fg-secondary hover:text-terminal-fg-primary'
            }`}
          >
            <div className="flex flex-col items-center gap-1">
              <span className="text-base">💬</span>
              <span>Chat</span>
            </div>
          </button>
          <button
            onClick={() => setMobileTab('workflow')}
            className={`flex-1 py-3 text-xs font-medium transition-colors touch-manipulation ${
              mobileTab === 'workflow'
                ? 'text-terminal-accent-green bg-terminal-bg-tertiary'
                : 'text-terminal-fg-secondary hover:text-terminal-fg-primary'
            }`}
          >
            <div className="flex flex-col items-center gap-1">
              <span className="text-base">🔗</span>
              <span>Workflow</span>
            </div>
          </button>
        </div>
      </nav>
    </div>
  );
}
