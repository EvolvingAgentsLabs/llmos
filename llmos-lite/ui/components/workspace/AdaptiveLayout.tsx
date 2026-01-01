'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import { useWorkspace, useWorkspaceLayout } from '@/contexts/WorkspaceContext';
import { useSessionContext } from '@/contexts/SessionContext';
import { useApplets } from '@/contexts/AppletContext';
import { setAppletGeneratedCallback } from '@/lib/system-tools';
import Header from '../layout/Header';
import SidebarPanel from '../sidebar/SidebarPanel';
import ChatPanel from '../chat/ChatPanel';
import ResizablePanel from './ResizablePanel';
import ViewManager from './ViewManager';
import CommandPalette from './CommandPalette';
import AgentCortexHeader from './AgentCortexHeader';

// Lazy load heavy 3D components
const CoreEntityBackground = dynamic(
  () => import('@/components/system/CoreEntity').then(mod => ({ default: mod.CoreEntityBackground })),
  { ssr: false }
);
const HolographicBackground = dynamic(
  () => import('@/components/system/HolographicBackground'),
  { ssr: false }
);
const FloatingJarvis = dynamic(
  () => import('@/components/system/FloatingJarvis'),
  { ssr: false }
);

// Lazy load other components
const FirstTimeGuide = dynamic(() => import('../onboarding/FirstTimeGuide'), { ssr: false });

// ============================================================================
// TYPES
// ============================================================================

type MobileTab = 'sidebar' | 'chat' | 'context';

// ============================================================================
// FOCUS INDICATOR COMPONENT
// ============================================================================

function FocusIndicator({ panel }: { panel: 'sidebar' | 'chat' | 'context' }) {
  const { state, setFocusedPanel } = useWorkspace();

  const isFocused = state.focusedPanel === panel;

  return (
    <div
      className={`absolute inset-0 pointer-events-none z-10 transition-all duration-200 ${
        isFocused ? 'ring-2 ring-inset ring-accent-primary/30' : ''
      }`}
    />
  );
}

// ============================================================================
// KEYBOARD SHORTCUT HINT
// ============================================================================

function KeyboardHint() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
        setIsVisible(true);
      }
    };

    const handleKeyUp = () => {
      setIsVisible(false);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-bg-elevated border border-border-primary rounded-lg shadow-xl flex items-center gap-4 text-xs animate-fade-in">
      <span className="flex items-center gap-1.5">
        <kbd className="px-1.5 py-0.5 bg-bg-tertiary rounded font-mono">K</kbd>
        <span className="text-fg-muted">Command Palette</span>
      </span>
      <span className="flex items-center gap-1.5">
        <kbd className="px-1.5 py-0.5 bg-bg-tertiary rounded font-mono">B</kbd>
        <span className="text-fg-muted">Toggle Sidebar</span>
      </span>
      <span className="flex items-center gap-1.5">
        <kbd className="px-1.5 py-0.5 bg-bg-tertiary rounded font-mono">1-3</kbd>
        <span className="text-fg-muted">Focus Panels</span>
      </span>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function AdaptiveLayout() {
  const { activeSession, setActiveSession } = useSessionContext();
  const { state, toggleSidebar, toggleContext, resizePanel, setFocusedPanel, updatePreferences } = useWorkspace();
  const { createApplet } = useApplets();
  const layout = useWorkspaceLayout();

  const [activeVolume, setActiveVolume] = useState<'system' | 'team' | 'user'>('user');
  const [mobileTab, setMobileTab] = useState<MobileTab>('chat');
  const [showGuide, setShowGuide] = useState(false);
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);

  // Track previous agent state for transitions
  const prevAgentState = useRef(state.agentState);

  // ========================================================================
  // APPLET GENERATION CALLBACK
  // ========================================================================
  useEffect(() => {
    console.log('[AdaptiveLayout] Registering applet generation callback');

    const handleAppletGenerated = (applet: { id: string; name: string; description: string; code: string }) => {
      console.log(`[AdaptiveLayout] Applet generated via tool: ${applet.name} (id: ${applet.id})`);

      try {
        createApplet({
          code: applet.code,
          metadata: {
            id: applet.id,
            name: applet.name,
            description: applet.description,
            version: '1.0.0',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        });
        console.log(`[AdaptiveLayout] Applet created in store: ${applet.id}`);
      } catch (err) {
        console.error('[AdaptiveLayout] Failed to create applet:', err);
      }
    };

    setAppletGeneratedCallback(handleAppletGenerated);

    return () => {
      console.log('[AdaptiveLayout] Unregistering applet generation callback');
      setAppletGeneratedCallback(null);
    };
  }, [createApplet]);

  // ========================================================================
  // REACTIVE NERVOUS SYSTEM: Auto-open context panel when agent creates output
  // ========================================================================
  useEffect(() => {
    // Only auto-switch if preference is enabled
    if (!state.preferences.autoSwitchContext) return;

    const wasIdle = prevAgentState.current === 'idle' || prevAgentState.current === 'thinking';
    const isNowExecuting = state.agentState === 'executing';
    const isNowSuccess = state.agentState === 'success';

    // When agent starts executing or succeeds, auto-open the context panel
    if ((wasIdle && isNowExecuting) || isNowSuccess) {
      // Open the right panel if it's closed
      if (layout.isContextCollapsed) {
        updatePreferences({
          collapsedPanels: { ...state.preferences.collapsedPanels, context: false }
        });
      }
    }

    // Update previous state
    prevAgentState.current = state.agentState;
  }, [state.agentState, state.preferences.autoSwitchContext, layout.isContextCollapsed, updatePreferences, state.preferences.collapsedPanels]);

  // ========================================================================
  // FOCUS MODES: Adapt layout based on task type
  // ========================================================================
  useEffect(() => {
    if (!state.preferences.autoSwitchContext) return;

    // When task type changes, adapt the layout
    switch (state.taskType) {
      case 'coding':
      case 'debugging':
        // For coding, ensure context panel is visible for code preview
        if (layout.isContextCollapsed) {
          updatePreferences({
            collapsedPanels: { ...state.preferences.collapsedPanels, context: false }
          });
        }
        break;

      case 'designing':
        // For designing, maximize context panel visibility
        if (layout.isContextCollapsed) {
          updatePreferences({
            collapsedPanels: { ...state.preferences.collapsedPanels, context: false }
          });
        }
        break;

      case 'chatting':
        // For pure chatting, user might prefer panels closed (don't auto-change)
        break;
    }
  }, [state.taskType, state.preferences.autoSwitchContext, layout.isContextCollapsed, updatePreferences, state.preferences.collapsedPanels]);

  // First-time guide
  useEffect(() => {
    const hasSeenGuide = localStorage.getItem('llmos_has_seen_guide');
    if (!hasSeenGuide) {
      setShowGuide(true);
    }
  }, []);

  const handleDismissGuide = useCallback(() => {
    localStorage.setItem('llmos_has_seen_guide', 'true');
    setShowGuide(false);
  }, []);

  const handleSendPromptFromGuide = useCallback((prompt: string) => {
    setPendingPrompt(prompt);
    setMobileTab('chat');
  }, []);

  // Panel focus handlers
  const handleSidebarFocus = useCallback(() => setFocusedPanel('sidebar'), [setFocusedPanel]);
  const handleChatFocus = useCallback(() => setFocusedPanel('chat'), [setFocusedPanel]);
  const handleContextFocus = useCallback(() => setFocusedPanel('context'), [setFocusedPanel]);

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-bg-primary relative">
      {/* ================================================================== */}
      {/* 3D HOLOGRAPHIC BACKGROUND LAYER - The "Holodeck" */}
      {/* ================================================================== */}
      <HolographicBackground />

      {/* CoreEntity floating in background - The AI's presence */}
      <CoreEntityBackground />

      {/* ================================================================== */}
      {/* UI LAYER - Glassmorphism panels floating above 3D */}
      {/* ================================================================== */}

      {/* Header */}
      <Header />

      {/* Command Palette Overlay */}
      <CommandPalette />

      {/* Keyboard shortcuts hint */}
      <KeyboardHint />

      {/* Desktop Layout: 3-panel adaptive design (lg+) */}
      <div className="hidden lg:flex flex-1 overflow-hidden relative z-10">
        {/* Left Sidebar: Resizable - Glassmorphism */}
        <ResizablePanel
          width={layout.sidebarWidth}
          minWidth={200}
          maxWidth={400}
          side="left"
          isCollapsed={layout.isSidebarCollapsed}
          onResize={(width) => resizePanel('sidebar', width)}
          onCollapse={toggleSidebar}
          className="border-r border-white/10 bg-bg-secondary/40 backdrop-blur-xl"
        >
          <div
            className="relative h-full"
            onClick={handleSidebarFocus}
          >
            <FocusIndicator panel="sidebar" />
            <SidebarPanel
              activeVolume={activeVolume}
              onVolumeChange={setActiveVolume}
              activeSession={activeSession}
              onSessionChange={setActiveSession}
            />
          </div>
        </ResizablePanel>

        {/* Center: Chat (Flexible) - Glassmorphism */}
        <div
          className="relative flex-1 flex flex-col overflow-hidden min-w-[400px]
                     bg-bg-primary/30 backdrop-blur-md"
          onClick={handleChatFocus}
        >
          <FocusIndicator panel="chat" />
          <ChatPanel
            activeSession={activeSession}
            activeVolume={activeVolume}
            onSessionCreated={(sessionId) => setActiveSession(sessionId)}
            pendingPrompt={pendingPrompt}
            onPromptProcessed={() => setPendingPrompt(null)}
          />
        </div>

        {/* Right: Context/View Manager - Resizable - Glassmorphism */}
        <ResizablePanel
          width={layout.contextWidth}
          minWidth={280}
          maxWidth={600}
          side="right"
          isCollapsed={layout.isContextCollapsed}
          onResize={(width) => resizePanel('context', width)}
          onCollapse={toggleContext}
          className="border-l border-white/10 bg-bg-secondary/40 backdrop-blur-xl"
        >
          <div
            className="relative h-full"
            onClick={handleContextFocus}
          >
            <FocusIndicator panel="context" />
            <ViewManager
              activeSession={activeSession}
              activeVolume={activeVolume}
            />
          </div>
        </ResizablePanel>
      </div>

      {/* Tablet Layout: 2-panel design (md-lg) */}
      <div className="hidden md:flex lg:hidden flex-1 overflow-hidden">
        {/* Sidebar - Fixed width */}
        <div className="w-64 flex-shrink-0 border-r border-border-primary/50 bg-bg-secondary/30">
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

        {/* Chat or Context - Toggle */}
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
            <ViewManager
              activeSession={activeSession}
              activeVolume={activeVolume}
            />
          )}
        </div>

        {/* Floating Tablet Toggle */}
        <div className="absolute bottom-6 right-6 z-10 flex gap-2 glass-panel p-1 rounded-xl border border-border-primary bg-bg-secondary/80 backdrop-blur-xl">
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
            <ViewManager
              activeSession={activeSession}
              activeVolume={activeVolume}
            />
          )}
        </div>
      </div>

      {/* Mobile Bottom Navigation */}
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
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
            </svg>
            <span className="text-xs font-medium">Views</span>
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

      {/* Floating JARVIS Avatar - Always visible like Siri */}
      <FloatingJarvis position="bottom-right" />
    </div>
  );
}
