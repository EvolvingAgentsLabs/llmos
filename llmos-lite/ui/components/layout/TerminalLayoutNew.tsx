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
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);

  useEffect(() => {
    const hasSeenGuide = localStorage.getItem('llmos_has_seen_guide');
    if (!hasSeenGuide) {
      setShowGuide(true);
    }
  }, []);

  const handleDismissGuide = () => {
    localStorage.setItem('llmos_has_seen_guide', 'true');
    setShowGuide(false);
  };

  const handleSendPromptFromGuide = (prompt: string) => {
    setPendingPrompt(prompt);
    setMobileTab('chat');
  };

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-bg-primary">
      {/* Modern Header - Fixed height */}
      <Header />

      {/* Desktop Layout: 3-panel design (lg+) */}
      <div className="hidden lg:flex flex-1 overflow-hidden">
        {/* Left Sidebar: Navigation & Sessions - Fixed width */}
        <div className="w-72 flex-shrink-0 border-r border-border-primary/50 flex flex-col overflow-hidden bg-bg-secondary/30">
          <SidebarPanel
            activeVolume={activeVolume}
            onVolumeChange={setActiveVolume}
            activeSession={activeSession}
            onSessionChange={setActiveSession}
          />
        </div>

        {/* Center: Chat/Main Content - Flexible */}
        <div className="flex-1 border-r border-border-primary/50 flex flex-col overflow-hidden">
          <ChatPanel
            activeSession={activeSession}
            activeVolume={activeVolume}
            onSessionCreated={(sessionId) => setActiveSession(sessionId)}
            pendingPrompt={pendingPrompt}
            onPromptProcessed={() => setPendingPrompt(null)}
          />
        </div>

        {/* Right: Context Panel - Fixed width */}
        <div className="w-80 flex-shrink-0 flex flex-col overflow-hidden bg-bg-secondary/30">
          <ContextPanel
            activeSession={activeSession}
            activeVolume={activeVolume}
          />
        </div>
      </div>

      {/* Tablet Layout: 2-panel design (md-lg) */}
      <div className="hidden md:flex lg:hidden flex-1 overflow-hidden">
        {/* Sidebar - Fixed width */}
        <div className="w-64 flex-shrink-0 border-r border-border-primary/50 flex flex-col overflow-hidden bg-bg-secondary/30">
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

        {/* Chat or Context - Flexible */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {mobileTab === 'chat' ? (
            <ChatPanel
              activeSession={activeSession}
              activeVolume={activeVolume}
              onSessionCreated={(sessionId) => setActiveSession(sessionId)}
              pendingPrompt={pendingPrompt}
              onPromptProcessed={() => setPendingPrompt(null)}
            />
          ) : (
            <ContextPanel
              activeSession={activeSession}
              activeVolume={activeVolume}
            />
          )}
        </div>

        {/* Floating Tablet Toggle */}
        <div className="absolute bottom-6 right-6 z-10 flex gap-2 glass-panel p-1">
          <button
            onClick={() => setMobileTab('chat')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
              mobileTab === 'chat'
                ? 'bg-accent-primary text-white shadow-glow'
                : 'text-fg-secondary hover:text-fg-primary hover:bg-bg-tertiary'
            }`}
          >
            Chat
          </button>
          <button
            onClick={() => setMobileTab('context')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
              mobileTab === 'context'
                ? 'bg-accent-primary text-white shadow-glow'
                : 'text-fg-secondary hover:text-fg-primary hover:bg-bg-tertiary'
            }`}
          >
            Context
          </button>
        </div>
      </div>

      {/* Mobile Layout: Single panel with tabs (< md) */}
      <div className="flex md:hidden flex-1 overflow-hidden">
        <div className="flex-1 flex flex-col overflow-hidden">
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
              pendingPrompt={pendingPrompt}
              onPromptProcessed={() => setPendingPrompt(null)}
            />
          )}
          {mobileTab === 'context' && (
            <ContextPanel
              activeSession={activeSession}
              activeVolume={activeVolume}
            />
          )}
        </div>
      </div>

      {/* Modern Mobile Bottom Navigation (< md) */}
      <nav className="md:hidden border-t border-border-primary bg-bg-secondary/80 backdrop-blur-xl">
        <div className="flex justify-around items-center h-16">
          <button
            onClick={() => setMobileTab('sidebar')}
            className={`flex-1 h-full flex flex-col items-center justify-center gap-1 transition-all duration-200 ${
              mobileTab === 'sidebar'
                ? 'text-accent-primary bg-bg-tertiary/50'
                : 'text-fg-secondary active:scale-95'
            }`}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
            <span className="text-xs font-medium">Menu</span>
          </button>

          <button
            onClick={() => setMobileTab('chat')}
            className={`flex-1 h-full flex flex-col items-center justify-center gap-1 transition-all duration-200 ${
              mobileTab === 'chat'
                ? 'text-accent-primary bg-bg-tertiary/50'
                : 'text-fg-secondary active:scale-95'
            }`}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <span className="text-xs font-medium">Chat</span>
          </button>

          <button
            onClick={() => setMobileTab('context')}
            className={`flex-1 h-full flex flex-col items-center justify-center gap-1 transition-all duration-200 ${
              mobileTab === 'context'
                ? 'text-accent-primary bg-bg-tertiary/50'
                : 'text-fg-secondary active:scale-95'
            }`}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-xs font-medium">Info</span>
          </button>
        </div>
      </nav>

      {/* First-time user guide */}
      {showGuide && (
        <FirstTimeGuide
          onDismiss={handleDismissGuide}
          onSendPrompt={handleSendPromptFromGuide}
        />
      )}
    </div>
  );
}
