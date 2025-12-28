'use client';

import { useState, useEffect, Suspense, lazy } from 'react';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useSessionContext } from '@/contexts/SessionContext';
import CommandPalette from './CommandPalette';

// Lazy load panels
const ChatPanel = lazy(() => import('../chat/ChatPanel'));
const SidebarPanel = lazy(() => import('../sidebar/SidebarPanel'));
const AppletGrid = lazy(() => import('../applets/AppletGrid'));

// ============================================================================
// LOADING COMPONENT
// ============================================================================

function PanelLoader() {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-3 border-accent-primary/20 border-t-accent-primary rounded-full animate-spin" />
        <span className="text-sm text-fg-muted">Loading...</span>
      </div>
    </div>
  );
}

// ============================================================================
// COLLAPSIBLE TREE PANEL
// ============================================================================

interface TreePanelProps {
  isOpen: boolean;
  onToggle: () => void;
  activeVolume: 'system' | 'team' | 'user';
  onVolumeChange: (volume: 'system' | 'team' | 'user') => void;
  activeSession: string | null;
  onSessionChange: (sessionId: string | null) => void;
}

function TreePanel({
  isOpen,
  onToggle,
  activeVolume,
  onVolumeChange,
  activeSession,
  onSessionChange,
}: TreePanelProps) {
  return (
    <div className={`transition-all duration-300 overflow-hidden ${isOpen ? 'h-48' : 'h-0'}`}>
      <div className="h-full border-b border-white/10 bg-bg-secondary/30">
        <Suspense fallback={<div className="p-4 text-fg-muted">Loading...</div>}>
          <SidebarPanel
            activeVolume={activeVolume}
            onVolumeChange={onVolumeChange}
            activeSession={activeSession}
            onSessionChange={onSessionChange}
          />
        </Suspense>
      </div>
    </div>
  );
}

// ============================================================================
// CORTEX STATUS (Header element)
// ============================================================================

function CortexStatus() {
  const { state } = useWorkspace();

  const statusConfig = {
    idle: { color: 'bg-blue-500', label: 'Ready', pulse: false },
    thinking: { color: 'bg-purple-500', label: 'Thinking...', pulse: true },
    executing: { color: 'bg-amber-500', label: 'Executing...', pulse: true },
    success: { color: 'bg-green-500', label: 'Complete', pulse: false },
    error: { color: 'bg-red-500', label: 'Error', pulse: true },
  };

  const config = statusConfig[state.agentState];

  return (
    <div className="flex items-center gap-2">
      <div className="relative">
        <div className={`w-3 h-3 rounded-full ${config.color}`} />
        {config.pulse && (
          <div className={`absolute inset-0 rounded-full ${config.color} animate-ping`} />
        )}
      </div>
      <span className="text-xs text-fg-secondary">{config.label}</span>
    </div>
  );
}

// ============================================================================
// MAIN FLUID LAYOUT
// ============================================================================

export default function FluidLayout() {
  const { openCommandPalette } = useWorkspace();
  const { activeSession, setActiveSession } = useSessionContext();

  const [activeVolume, setActiveVolume] = useState<'system' | 'team' | 'user'>('user');
  const [isTreeOpen, setIsTreeOpen] = useState(false);
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        openCommandPalette();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
        e.preventDefault();
        setIsTreeOpen(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [openCommandPalette]);

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-bg-primary relative">
      {/* ================================================================== */}
      {/* HEADER - Minimal, glassmorphism */}
      {/* ================================================================== */}
      <header className="h-12 flex items-center justify-between px-4
                         bg-bg-secondary border-b border-border-primary">
        {/* Left: Logo + Tree toggle */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsTreeOpen(!isTreeOpen)}
            className="p-2 rounded-lg hover:bg-white/10 transition-colors"
            title="Toggle files (⌘B)"
          >
            <svg className="w-5 h-5 text-fg-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-accent-primary to-accent-secondary flex items-center justify-center">
              <span className="text-white text-xs font-bold">L</span>
            </div>
            <span className="font-semibold text-fg-primary">LLMos</span>
          </div>
        </div>

        {/* Center: Status */}
        <CortexStatus />

        {/* Right: Command palette trigger */}
        <button
          onClick={openCommandPalette}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg
                     bg-bg-elevated border border-border-primary
                     text-fg-secondary hover:text-fg-primary hover:bg-bg-hover
                     transition-all"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <span className="text-xs">⌘K</span>
        </button>
      </header>

      {/* Command Palette */}
      <CommandPalette />

      {/* ================================================================== */}
      {/* MAIN 2-PANEL LAYOUT */}
      {/* ================================================================== */}
      <div className="flex-1 flex overflow-hidden">
        {/* LEFT PANEL: Chat + Tree */}
        <div className="w-1/2 min-w-[400px] max-w-[600px] flex flex-col
                        bg-bg-secondary border-r border-border-primary">
          {/* Collapsible Tree */}
          <TreePanel
            isOpen={isTreeOpen}
            onToggle={() => setIsTreeOpen(!isTreeOpen)}
            activeVolume={activeVolume}
            onVolumeChange={setActiveVolume}
            activeSession={activeSession}
            onSessionChange={setActiveSession}
          />

          {/* Chat */}
          <div className="flex-1 overflow-hidden">
            <Suspense fallback={<PanelLoader />}>
              <ChatPanel
                activeSession={activeSession}
                activeVolume={activeVolume}
                onSessionCreated={(sessionId) => setActiveSession(sessionId)}
                pendingPrompt={pendingPrompt}
                onPromptProcessed={() => setPendingPrompt(null)}
              />
            </Suspense>
          </div>
        </div>

        {/* RIGHT PANEL: J.A.R.V.I.S. Avatar + Applets */}
        <div className="flex-1 flex flex-col overflow-hidden bg-bg-primary">
          <Suspense fallback={<PanelLoader />}>
            <AppletGrid />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
