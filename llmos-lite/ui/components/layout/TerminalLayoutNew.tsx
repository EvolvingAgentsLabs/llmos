'use client';

import { useState, useEffect } from 'react';
import { useSessionContext } from '@/contexts/SessionContext';
import dynamic from 'next/dynamic';
import Header from './Header';
import SidebarPanel from '../sidebar/SidebarPanel';
import ChatPanel from '../chat/ChatPanel';
import ContextPanel from '../context/ContextPanel';

const FirstTimeGuide = dynamic(() => import('../onboarding/FirstTimeGuide'), { ssr: false });

type MobileTab = 'sidebar' | 'chat' | 'context';

export default function TerminalLayoutNew() {
  const { activeSession, setActiveSession } = useSessionContext();
  const [activeVolume, setActiveVolume] = useState<'system' | 'team' | 'user'>('user');
  const [mobileTab, setMobileTab] = useState<MobileTab>('chat');
  const [showGuide, setShowGuide] = useState(false);

  useEffect(() => {
    // Check if this is the first time the user is seeing the app
    const hasSeenGuide = localStorage.getItem('llmos_has_seen_guide');
    if (!hasSeenGuide) {
      setShowGuide(true);
    }
  }, []);

  const handleDismissGuide = () => {
    localStorage.setItem('llmos_has_seen_guide', 'true');
    setShowGuide(false);
  };

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden">
      {/* Header */}
      <Header />

      {/* Desktop: 2 main panels + optional context sidebar (lg+) */}
      <div className="hidden lg:flex flex-1 overflow-hidden">
        {/* Left Sidebar: Navigation & Sessions */}
        <div className="w-80 flex-shrink-0 border-r border-terminal-border overflow-hidden">
          <SidebarPanel
            activeVolume={activeVolume}
            onVolumeChange={setActiveVolume}
            activeSession={activeSession}
            onSessionChange={setActiveSession}
          />
        </div>

        {/* Center: Chat/Main Content */}
        <div className="flex-1 border-r border-terminal-border overflow-hidden">
          <ChatPanel
            activeSession={activeSession}
            activeVolume={activeVolume}
            onSessionCreated={(sessionId) => setActiveSession(sessionId)}
          />
        </div>

        {/* Right: Context Panel (Artifacts, Evolution) */}
        <div className="w-80 flex-shrink-0 overflow-hidden">
          <ContextPanel
            activeSession={activeSession}
            activeVolume={activeVolume}
          />
        </div>
      </div>

      {/* Tablet: 2 panels (md-lg) */}
      <div className="hidden md:flex lg:hidden flex-1 overflow-hidden">
        {/* Sidebar */}
        <div className="w-64 flex-shrink-0 border-r border-terminal-border overflow-hidden">
          <SidebarPanel
            activeVolume={activeVolume}
            onVolumeChange={setActiveVolume}
            activeSession={activeSession}
            onSessionChange={(sessionId) => {
              setActiveSession(sessionId);
              setMobileTab('chat');
            }}
          />
        </div>

        {/* Chat or Context */}
        <div className="flex-1 overflow-hidden">
          {mobileTab === 'chat' ? (
            <ChatPanel
              activeSession={activeSession}
              activeVolume={activeVolume}
              onSessionCreated={(sessionId) => setActiveSession(sessionId)}
            />
          ) : (
            <ContextPanel
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
            Chat
          </button>
          <button
            onClick={() => setMobileTab('context')}
            className={`px-3 py-2 rounded text-xs font-medium transition-colors ${
              mobileTab === 'context'
                ? 'bg-terminal-accent-green text-terminal-bg-primary'
                : 'bg-terminal-bg-secondary text-terminal-fg-secondary border border-terminal-border hover:border-terminal-accent-green'
            }`}
          >
            Info
          </button>
        </div>
      </div>

      {/* Mobile: Single panel with tabs (< md) */}
      <div className="flex md:hidden flex-1 overflow-hidden">
        {mobileTab === 'sidebar' && (
          <SidebarPanel
            activeVolume={activeVolume}
            onVolumeChange={setActiveVolume}
            activeSession={activeSession}
            onSessionChange={(sessionId) => {
              setActiveSession(sessionId);
              setMobileTab('chat');
            }}
          />
        )}
        {mobileTab === 'chat' && (
          <ChatPanel
            activeSession={activeSession}
            activeVolume={activeVolume}
            onSessionCreated={(sessionId) => setActiveSession(sessionId)}
          />
        )}
        {mobileTab === 'context' && (
          <ContextPanel
            activeSession={activeSession}
            activeVolume={activeVolume}
          />
        )}
      </div>

      {/* Mobile Bottom Navigation (< md) */}
      <nav className="md:hidden border-t border-terminal-border bg-terminal-bg-secondary">
        <div className="flex justify-around">
          <button
            onClick={() => setMobileTab('sidebar')}
            className={`flex-1 py-3 text-xs font-medium transition-colors touch-manipulation ${
              mobileTab === 'sidebar'
                ? 'text-terminal-accent-green bg-terminal-bg-tertiary'
                : 'text-terminal-fg-secondary hover:text-terminal-fg-primary'
            }`}
          >
            <div className="flex flex-col items-center gap-1">
              <span className="text-base">≡</span>
              <span>Menu</span>
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
            onClick={() => setMobileTab('context')}
            className={`flex-1 py-3 text-xs font-medium transition-colors touch-manipulation ${
              mobileTab === 'context'
                ? 'text-terminal-accent-green bg-terminal-bg-tertiary'
                : 'text-terminal-fg-secondary hover:text-terminal-fg-primary'
            }`}
          >
            <div className="flex flex-col items-center gap-1">
              <span className="text-base">ℹ</span>
              <span>Info</span>
            </div>
          </button>
        </div>
      </nav>

      {/* First-time user guide */}
      {showGuide && <FirstTimeGuide onDismiss={handleDismissGuide} />}
    </div>
  );
}
