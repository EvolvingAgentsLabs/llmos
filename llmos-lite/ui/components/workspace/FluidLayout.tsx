'use client';

import { useState, useEffect, useCallback, useRef, Suspense, lazy } from 'react';
import dynamic from 'next/dynamic';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useSessionContext } from '@/contexts/SessionContext';
import { useApplets } from '@/contexts/AppletContext';
import CommandPalette from './CommandPalette';

// Lazy load heavy 3D components
const CoreEntity = dynamic(
  () => import('@/components/system/CoreEntity'),
  { ssr: false }
);
const HolographicBackground = dynamic(
  () => import('@/components/system/HolographicBackground'),
  { ssr: false }
);

// Lazy load panels
const ChatPanel = lazy(() => import('../chat/ChatPanel'));
const SidebarPanel = lazy(() => import('../sidebar/SidebarPanel'));
const ArtifactPanel = lazy(() => import('../panel3-artifacts/ArtifactPanel'));
const AppletPanel = lazy(() => import('../applets/AppletPanel'));
const ThreeJSCanvas = lazy(() => import('../canvas/ThreeJSCanvas'));
const SplitViewCanvas = lazy(() => import('../canvas/SplitViewCanvas'));

// ============================================================================
// TYPES
// ============================================================================

type ProjectionType = 'empty' | 'artifact' | 'applet' | 'canvas' | 'code';

// ============================================================================
// LOADING COMPONENT
// ============================================================================

function ProjectionLoader() {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-3 border-accent-primary/20 border-t-accent-primary rounded-full animate-spin" />
        <span className="text-sm text-fg-muted">Materializing...</span>
      </div>
    </div>
  );
}

// ============================================================================
// EMPTY STAGE - CoreEntity as the AI's presence
// ============================================================================

function EmptyStage() {
  const { state } = useWorkspace();
  const isActive = state.agentState !== 'idle';

  return (
    <div className="flex flex-col items-center justify-center h-full gap-8 p-8">
      {/* The AI Core - always present */}
      <div className="relative">
        <CoreEntity size="lg" />

        {/* Pulse effect when active */}
        {isActive && (
          <div className="absolute inset-0 -m-12 rounded-full border-2 border-accent-primary/30 animate-ping" />
        )}
      </div>

      {/* Status */}
      <div className="text-center space-y-3">
        <h2 className="text-xl font-medium text-fg-primary">
          {isActive ? 'Processing...' : 'Ready'}
        </h2>
        <p className="text-sm text-fg-muted max-w-sm">
          {isActive
            ? 'Your projection will materialize here.'
            : 'Ask me to create something. It will appear here as a holographic projection.'}
        </p>
      </div>

      {/* Quick actions */}
      {!isActive && (
        <div className="flex flex-wrap gap-2 justify-center">
          {['Create an applet', 'Show my artifacts', 'Open canvas'].map((action) => (
            <button
              key={action}
              className="px-4 py-2 text-sm rounded-full
                         bg-white/5 border border-white/10
                         text-fg-secondary hover:text-fg-primary
                         hover:bg-white/10 hover:border-accent-primary/30
                         transition-all duration-200"
            >
              {action}
            </button>
          ))}
        </div>
      )}
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
  const { state, setActiveFile, setContextViewMode, openCommandPalette } = useWorkspace();
  const { activeSession, setActiveSession } = useSessionContext();
  const { activeApplets } = useApplets();

  const [activeVolume, setActiveVolume] = useState<'system' | 'team' | 'user'>('user');
  const [isTreeOpen, setIsTreeOpen] = useState(false);
  const [projectionType, setProjectionType] = useState<ProjectionType>('empty');
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);

  // Determine current projection based on context
  useEffect(() => {
    if (activeApplets.length > 0) {
      setProjectionType('applet');
    } else if (state.activeFilePath) {
      const ext = state.activeFilePath.split('.').pop()?.toLowerCase();
      if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext || '')) {
        setProjectionType('canvas');
      } else {
        setProjectionType('code');
      }
    } else if (state.contextViewMode === 'canvas') {
      setProjectionType('canvas');
    } else if (state.contextViewMode === 'artifacts' || state.contextViewMode === 'applets') {
      setProjectionType('artifact');
    } else {
      setProjectionType('empty');
    }
  }, [activeApplets, state.activeFilePath, state.contextViewMode]);

  // Render the current projection
  const renderProjection = () => {
    switch (projectionType) {
      case 'applet':
        return (
          <Suspense fallback={<ProjectionLoader />}>
            <AppletPanel mode="split" />
          </Suspense>
        );

      case 'canvas':
        return (
          <Suspense fallback={<ProjectionLoader />}>
            <ThreeJSCanvas />
          </Suspense>
        );

      case 'code':
        return (
          <Suspense fallback={<ProjectionLoader />}>
            <SplitViewCanvas
              volume={activeVolume}
              filePath={state.activeFilePath || ''}
            />
          </Suspense>
        );

      case 'artifact':
        return (
          <Suspense fallback={<ProjectionLoader />}>
            <ArtifactPanel
              activeSession={activeSession}
              activeVolume={activeVolume}
            />
          </Suspense>
        );

      case 'empty':
      default:
        return <EmptyStage />;
    }
  };

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
      {/* 3D BACKGROUND - The Holodeck */}
      {/* ================================================================== */}
      <HolographicBackground />

      {/* ================================================================== */}
      {/* HEADER - Minimal, glassmorphism */}
      {/* ================================================================== */}
      <header className="relative z-20 h-12 flex items-center justify-between px-4
                         bg-bg-secondary/30 backdrop-blur-xl border-b border-white/10">
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
                     bg-white/5 border border-white/10
                     text-fg-secondary hover:text-fg-primary hover:bg-white/10
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
      <div className="flex-1 flex overflow-hidden relative z-10">
        {/* LEFT PANEL: Chat + Tree */}
        <div className="w-1/2 min-w-[400px] max-w-[600px] flex flex-col
                        bg-bg-primary/40 backdrop-blur-xl border-r border-white/10">
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
            <Suspense fallback={<ProjectionLoader />}>
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

        {/* RIGHT PANEL: Projection Stage */}
        <div className="flex-1 flex flex-col overflow-hidden
                        bg-bg-secondary/20 backdrop-blur-md">
          {/* Projection content */}
          <div className="flex-1 overflow-hidden">
            {renderProjection()}
          </div>

          {/* Minimal projection type indicator */}
          {projectionType !== 'empty' && (
            <div className="flex items-center justify-center gap-2 py-2
                            border-t border-white/5 bg-bg-primary/20">
              <div className="w-2 h-2 rounded-full bg-accent-primary" />
              <span className="text-xs text-fg-muted capitalize">{projectionType}</span>
              <button
                onClick={() => {
                  setActiveFile(null);
                  setContextViewMode('artifacts');
                }}
                className="ml-2 p-1 rounded hover:bg-white/10 text-fg-muted hover:text-fg-primary"
                title="Clear projection"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
