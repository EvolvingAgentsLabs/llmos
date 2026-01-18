'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import { useWorkspace, useWorkspaceLayout } from '@/contexts/WorkspaceContext';
import { useProjectContext } from '@/contexts/ProjectContext';
import { useApplets } from '@/contexts/AppletContext';
import { setAppletGeneratedCallback } from '@/lib/system-tools';
import { DesktopAppletManager } from '@/lib/applets/desktop-applet-manager';
import Header from '../layout/Header';
import SidebarPanel from '../sidebar/SidebarPanel';
import ChatPanel from '../chat/ChatPanel';
import ResizablePanel from './ResizablePanel';
import ViewManager from './ViewManager';
import CommandPalette from './CommandPalette';
import AgentCortexHeader from './AgentCortexHeader';
import RobotWorkspace from './RobotWorkspace';

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

// ============================================================================
// TYPES
// ============================================================================

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
  const { activeVolume: workspaceVolume } = useProjectContext();
  const { state, toggleSidebar, toggleContext, resizePanel, setFocusedPanel, updatePreferences } = useWorkspace();
  const { createApplet } = useApplets();
  const layout = useWorkspaceLayout();

  const [activeVolume, setActiveVolume] = useState<'system' | 'team' | 'user'>('user');

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
        const now = new Date().toISOString();

        // Create the applet in the store (for runtime)
        // IMPORTANT: Use same filePath as DesktopAppletManager for matching
        const generatedFilePath = `generated/${applet.id}`;
        createApplet({
          code: applet.code,
          metadata: {
            id: applet.id,
            name: applet.name,
            description: applet.description,
            version: '1.0.0',
            createdAt: now,
            updatedAt: now,
          },
          volume: 'user',
          filePath: generatedFilePath,
        });
        console.log(`[AdaptiveLayout] Applet created in store: ${applet.id}`);

        // Also add to DesktopAppletManager (for UI regions display)
        DesktopAppletManager.addApplet({
          id: applet.id,
          name: applet.name,
          description: applet.description,
          filePath: generatedFilePath,
          volume: 'user',
          createdAt: now,
          isActive: true,
        });
        console.log(`[AdaptiveLayout] Applet added to desktop: ${applet.id}`);
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

      {/* Robot Mode: Full 3D Robot World Workspace (Only Mode) */}
      <div className="flex-1 overflow-hidden relative z-10">
        <RobotWorkspace
          activeVolume={activeVolume}
          onVolumeChange={setActiveVolume}
        />
      </div>

      {/* Floating AI Avatar - Always visible like Siri */}
      <FloatingJarvis position="bottom-right" />
    </div>
  );
}
