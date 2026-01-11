'use client';

/**
 * FluidLayout - Main workspace layout with Desktop-first experience
 * Simplified: Uses volumes as workspaces (no project concept)
 */

import { useState, useEffect, Suspense, lazy, useCallback, useRef } from 'react';
import { useWorkspace, ContextViewMode } from '@/contexts/WorkspaceContext';
import { useProjectContext } from '@/contexts/ProjectContext';
import { useApplets } from '@/contexts/AppletContext';
import { UserStorage } from '@/lib/user-storage';
import { LLMStorage } from '@/lib/llm-client';
import { setAppletGeneratedCallback } from '@/lib/system-tools';
import { DesktopAppletManager } from '@/lib/applets/desktop-applet-manager';
import { useArtifactStore } from '@/lib/artifacts/store';
import { getVFS } from '@/lib/virtual-fs';
import CommandPalette from './CommandPalette';
import { Maximize2, Minimize2 } from 'lucide-react';

// Lazy load panels
const SidebarPanel = lazy(() => import('../sidebar/SidebarPanel'));
const AppletGrid = lazy(() => import('../applets/AppletGrid'));
const TabbedContentViewer = lazy(() => import('../viewer/TabbedContentViewer'));
const ArtifactPanel = lazy(() => import('../panels/artifacts/ArtifactPanel'));
const MediaViewer = lazy(() => import('../media/MediaViewer'));

// ============================================================================
// LOADING COMPONENT
// ============================================================================

function PanelLoader() {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-3 border-[#C15F3C]/20 border-t-[#C15F3C] rounded-full animate-spin" />
        <span className="text-sm text-[#484f58]">Loading...</span>
      </div>
    </div>
  );
}

// ============================================================================
// SIDEBAR PANEL WRAPPER - Full height accordion
// ============================================================================

interface SidebarWrapperProps {
  activeVolume: 'system' | 'team' | 'user';
  onVolumeChange: (volume: 'system' | 'team' | 'user') => void;
}

function SidebarWrapper({
  activeVolume,
  onVolumeChange,
}: SidebarWrapperProps) {
  return (
    <div className="h-full bg-[#161b22]/30">
      <Suspense fallback={<div className="p-4 text-[#484f58]">Loading...</div>}>
        <SidebarPanel
          activeVolume={activeVolume}
          onVolumeChange={onVolumeChange}
        />
      </Suspense>
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
      <span className="text-xs text-[#8b949e]">{config.label}</span>
    </div>
  );
}

// ============================================================================
// RIGHT PANEL CONTENT - Renders based on contextViewMode
// ============================================================================

interface RightPanelContentProps {
  contextViewMode: ContextViewMode;
  activeFilePath: string | null;
  activeVolume: 'system' | 'team' | 'user';
}

function RightPanelContent({ contextViewMode, activeFilePath, activeVolume }: RightPanelContentProps) {
  switch (contextViewMode) {
    case 'media':
      if (activeFilePath) {
        return (
          <Suspense fallback={<PanelLoader />}>
            <MediaViewer
              filePath={activeFilePath}
              volume={activeVolume}
            />
          </Suspense>
        );
      }
      return (
        <Suspense fallback={<PanelLoader />}>
          <AppletGrid />
        </Suspense>
      );

    case 'split-view':
    case 'code-editor':
      if (activeFilePath) {
        return (
          <Suspense fallback={<PanelLoader />}>
            <TabbedContentViewer
              filePath={activeFilePath}
              volume={activeVolume}
            />
          </Suspense>
        );
      }
      return (
        <Suspense fallback={<PanelLoader />}>
          <AppletGrid showEmptyState emptyMessage="Select a file from the tree to view and edit code" />
        </Suspense>
      );

    case 'artifacts':
      return (
        <Suspense fallback={<PanelLoader />}>
          <ArtifactPanel
            activeVolume={activeVolume}
          />
        </Suspense>
      );

    case 'canvas':
    case 'applets':
    default:
      if (activeFilePath) {
        return (
          <Suspense fallback={<PanelLoader />}>
            <TabbedContentViewer
              filePath={activeFilePath}
              volume={activeVolume}
            />
          </Suspense>
        );
      }
      return (
        <Suspense fallback={<PanelLoader />}>
          <AppletGrid />
        </Suspense>
      );
  }
}

// ============================================================================
// MAIN FLUID LAYOUT
// ============================================================================

export default function FluidLayout() {
  const { openCommandPalette, state, setContextViewMode } = useWorkspace();
  const { activeVolume: workspaceVolume, addArtifact } = useProjectContext();
  const { createApplet } = useApplets();
  const { createArtifact } = useArtifactStore();
  const { contextViewMode, activeFilePath } = state;

  const [activeVolume, setActiveVolume] = useState<'system' | 'team' | 'user'>('user');
  const [leftPanelWidth, setLeftPanelWidth] = useState(420);
  const [isLeftPanelCollapsed, setIsLeftPanelCollapsed] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [maximizedPanel, setMaximizedPanel] = useState<'left' | 'right' | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Handle resize
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const containerRect = containerRef.current.getBoundingClientRect();
      const newWidth = e.clientX - containerRect.left;
      setLeftPanelWidth(Math.min(700, Math.max(320, newWidth)));
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  const toggleMaximize = useCallback((panel: 'left' | 'right') => {
    setMaximizedPanel(prev => prev === panel ? null : panel);
  }, []);

  // Register applet generation callback
  useEffect(() => {
    console.log('[FluidLayout] Registering applet generation callback');

    const handleAppletGenerated = (applet: { id: string; name: string; description: string; code: string }) => {
      console.log(`[FluidLayout] Applet generated via tool: ${applet.name} (id: ${applet.id})`);

      try {
        const now = new Date().toISOString();
        const vfs = getVFS();

        // Save to workspace output folder
        const generatedFilePath = `output/applets/${applet.id}.tsx`;

        // Save applet code to VFS
        vfs.writeFile(generatedFilePath, applet.code);
        console.log(`[FluidLayout] Applet code saved to VFS: ${generatedFilePath}`);

        // Create the applet in the store (for runtime)
        const createdApplet = createApplet({
          code: applet.code,
          metadata: {
            id: applet.id,
            name: applet.name,
            description: applet.description,
            version: '1.0.0',
            createdAt: now,
            updatedAt: now,
          },
          volume: activeVolume,
          filePath: generatedFilePath,
        });

        console.log(`[FluidLayout] Applet created in store: ${createdApplet.id}`);

        // Create an artifact record for tracking
        const artifact = createArtifact({
          name: applet.name,
          type: 'code',
          volume: activeVolume,
          description: applet.description,
          codeView: applet.code,
          filePath: generatedFilePath,
          createdBy: activeVolume,
          tags: ['applet', 'generated'],
        });

        console.log(`[FluidLayout] Artifact created: ${artifact.id}`);

        // Track artifact in workspace
        addArtifact(artifact.id);

        // Add to DesktopAppletManager
        DesktopAppletManager.addApplet({
          id: applet.id,
          name: applet.name,
          description: applet.description,
          filePath: generatedFilePath,
          volume: activeVolume,
          createdAt: now,
          isActive: true,
        });

        console.log(`[FluidLayout] Applet added to desktop: ${applet.id}`);

        // Switch to applets view
        setContextViewMode('applets');
      } catch (err) {
        console.error('[FluidLayout] Failed to create applet:', err);
      }
    };

    setAppletGeneratedCallback(handleAppletGenerated);

    return () => {
      console.log('[FluidLayout] Unregistering applet generation callback');
      setAppletGeneratedCallback(null);
    };
  }, [createApplet, setContextViewMode, activeVolume, addArtifact, createArtifact]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        openCommandPalette();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
        e.preventDefault();
        setIsLeftPanelCollapsed(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [openCommandPalette]);

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-[#0d1117] relative">
      {/* HEADER */}
      <header className="h-12 flex items-center justify-between px-4 bg-[#161b22] border-b border-[#30363d]">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsLeftPanelCollapsed(!isLeftPanelCollapsed)}
            className={`p-1.5 rounded-lg transition-colors ${!isLeftPanelCollapsed ? 'bg-[#C15F3C]/20 text-[#C15F3C]' : 'hover:bg-white/10 text-[#8b949e]'}`}
            title="Toggle sidebar (Ctrl+B)"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          <button
            onClick={() => setContextViewMode('applets')}
            className={`p-1.5 rounded-lg transition-colors ${contextViewMode === 'applets' ? 'bg-[#C15F3C] text-white' : 'hover:bg-white/10 text-[#8b949e]'}`}
            title="Desktop"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
            </svg>
          </button>

          <div className="flex items-center gap-1.5">
            <div className="w-5 h-5 rounded-md bg-gradient-to-br from-[#C15F3C] to-accent-secondary flex items-center justify-center">
              <span className="text-white text-[10px] font-bold">L</span>
            </div>
            <span className="font-medium text-sm text-[#e6edf3]">LLMos</span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <CortexStatus />

          {activeFilePath && (
            <div className="flex items-center gap-2 px-2 py-1 rounded bg-[#21262d] text-xs text-[#8b949e]">
              <span className="truncate max-w-[150px]">{activeFilePath.split('/').pop()}</span>
              <button
                onClick={() => setContextViewMode('applets')}
                className="text-[#6e7681] hover:text-[#e6edf3]"
                title="Close file"
              >
                x
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              if (confirm('Are you sure you want to logout?\n\nThis will clear all local data.')) {
                UserStorage.clearAll();
                LLMStorage.clearAll();
                window.location.reload();
              }
            }}
            className="p-2 rounded-lg text-[#8b949e] hover:text-red-400 hover:bg-red-500/10 transition-all"
            title="Logout & Clear Data"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>

          <button
            onClick={openCommandPalette}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#21262d] border border-[#30363d] text-[#8b949e] hover:text-[#e6edf3] hover:bg-bg-hover transition-all"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <span className="text-xs">Ctrl+K</span>
          </button>
        </div>
      </header>

      <CommandPalette />

      {/* MAIN 2-PANEL LAYOUT */}
      <div ref={containerRef} className={`flex-1 flex overflow-hidden ${isResizing ? 'select-none cursor-col-resize' : ''}`}>
        {/* LEFT PANEL */}
        {!isLeftPanelCollapsed && (
          <div
            className={`flex flex-col bg-[#161b22] border-r border-[#30363d] transition-all duration-200 ${
              maximizedPanel === 'right' ? 'hidden' : maximizedPanel === 'left' ? 'w-full' : ''
            }`}
            style={{ width: maximizedPanel === 'left' ? '100%' : maximizedPanel === 'right' ? 0 : leftPanelWidth }}
          >
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#30363d] bg-[#21262d]/50">
              <span className="text-[10px] font-semibold text-[#6e7681] uppercase tracking-wider">Explorer</span>
              <button
                onClick={() => toggleMaximize('left')}
                className="p-1 rounded hover:bg-white/10 text-[#484f58] hover:text-[#e6edf3] transition-colors"
                title={maximizedPanel === 'left' ? 'Restore' : 'Maximize'}
              >
                {maximizedPanel === 'left' ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
              </button>
            </div>

            <div className="flex-1 overflow-hidden">
              <SidebarWrapper
                activeVolume={activeVolume}
                onVolumeChange={setActiveVolume}
              />
            </div>
          </div>
        )}

        {/* RESIZE HANDLE */}
        {maximizedPanel === null && !isLeftPanelCollapsed && (
          <div
            className="w-1 hover:w-1.5 bg-border-primary hover:bg-[#C15F3C] cursor-col-resize transition-all flex-shrink-0 relative group"
            onMouseDown={handleResizeStart}
          >
            <div className="absolute inset-y-0 -left-1 -right-1 group-hover:bg-[#C15F3C]/20" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="w-1 h-1 rounded-full bg-[#C15F3C]" />
              <div className="w-1 h-1 rounded-full bg-[#C15F3C]" />
              <div className="w-1 h-1 rounded-full bg-[#C15F3C]" />
            </div>
          </div>
        )}

        {/* RIGHT PANEL */}
        <div
          className={`flex-1 flex flex-col overflow-hidden bg-[#0d1117] relative ${
            maximizedPanel === 'left' ? 'hidden' : maximizedPanel === 'right' ? 'w-full' : ''
          }`}
        >
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#30363d] bg-[#21262d]/50">
            <span className="text-[10px] font-semibold text-[#6e7681] uppercase tracking-wider">
              {activeFilePath ? activeFilePath.split('/').pop() : 'Desktop'}
            </span>
            <button
              onClick={() => toggleMaximize('right')}
              className="p-1 rounded hover:bg-white/10 text-[#484f58] hover:text-[#e6edf3] transition-colors"
              title={maximizedPanel === 'right' ? 'Restore' : 'Maximize'}
            >
              {maximizedPanel === 'right' ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
            </button>
          </div>

          <div className="flex-1 overflow-hidden">
            <RightPanelContent
              contextViewMode={contextViewMode}
              activeFilePath={activeFilePath}
              activeVolume={activeVolume}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
