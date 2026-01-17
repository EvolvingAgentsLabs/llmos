'use client';

import { useState, useCallback, useEffect } from 'react';
import Header from './Header';
import VSCodeFileTree from '../panels/volumes/VSCodeFileTree';
import ChatPanel from '../chat/ChatPanel';
import CanvasView from '../canvas/CanvasView';
import { AppletPanel, AppletDock } from '../applets/AppletPanel';
import { AppletProvider, useApplets } from '@/contexts/AppletContext';
import { setAppletGeneratedCallback } from '@/lib/system-tools';
import { DebugConsole } from '../debug';
import { logger } from '@/lib/debug/logger';
import { MessageSquare, Layers, Sparkles, PanelRightClose, PanelRight } from 'lucide-react';

type ViewMode = 'chat' | 'canvas';
type ContextPanelMode = 'applets' | 'preview' | 'hidden';

interface TreeNode {
  id: string;
  name: string;
  type: 'volume' | 'folder' | 'file';
  path: string;
  metadata?: {
    fileType?: string;
    readonly?: boolean;
  };
}

function LayoutContent() {
  const [activeVolume, setActiveVolume] = useState<'system' | 'team' | 'user'>('user');
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<TreeNode | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('chat');
  const [activeSession, setActiveSession] = useState<string | null>(null);
  const [contextPanelMode, setContextPanelMode] = useState<ContextPanelMode>('hidden');

  const { activeApplets, createApplet } = useApplets();
  const hasActiveApplets = activeApplets.length > 0;
  const showContextPanel = contextPanelMode !== 'hidden';

  // Set up the applet generation callback when component mounts
  useEffect(() => {
    logger.applet('Registering applet generation callback');

    const handleAppletGenerated = (applet: { id: string; name: string; description: string; code: string }) => {
      logger.applet(`Generated via tool: ${applet.name} (id: ${applet.id})`);

      try {
        // Create the applet in the store
        const createdApplet = createApplet({
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

        logger.applet(`Applet created in store: ${createdApplet.id}`);

        // Auto-open the applet panel
        setContextPanelMode('applets');
      } catch (err) {
        logger.error('applet', 'Failed to create applet', { error: err });
        console.error('[SimpleLayout] Failed to create applet:', err);
      }
    };

    setAppletGeneratedCallback(handleAppletGenerated);

    // Cleanup on unmount
    return () => {
      logger.applet('Unregistering applet generation callback');
      setAppletGeneratedCallback(null);
    };
  }, [createApplet]);

  // Handle applet submission - send data back to chat
  const handleAppletSubmit = useCallback((appletId: string, data: unknown) => {
    logger.applet(`Applet submitted: ${appletId}`, { data });
    // TODO: Feed this back into the chat as a message
  }, []);

  // Toggle context panel
  const toggleContextPanel = useCallback((mode?: ContextPanelMode) => {
    setContextPanelMode((prev) => {
      if (mode) {
        return prev === mode ? 'hidden' : mode;
      }
      return prev === 'hidden' ? 'applets' : 'hidden';
    });
  }, []);

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-bg-primary">
      {/* Header */}
      <Header />

      {/* Main Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel: File Tree (Fixed width ~280px) */}
        <div className="w-72 flex-shrink-0 border-r border-border-primary/50 bg-bg-secondary flex flex-col overflow-hidden">
          {/* File tree - VSCode style with volumes as drives */}
          <VSCodeFileTree
            activeVolume={activeVolume}
            onVolumeChange={setActiveVolume}
            onFileSelect={(node) => {
              logger.vfs(`File selected: ${node.path}`);
              setSelectedFile(node.id);
              setSelectedNode(node as TreeNode);
              // Switch to canvas view when file is selected
              if (node.type === 'file') {
                // Check if it's an applet file
                if (node.path.endsWith('.app')) {
                  setContextPanelMode('applets');
                } else {
                  setViewMode('canvas');
                  setContextPanelMode('preview');
                }
              }
            }}
            selectedFile={selectedFile}
          />
        </div>

        {/* Center Panel: Chat (Primary) or Canvas */}
        <div className={`flex-1 flex flex-col overflow-hidden transition-all duration-200 ${showContextPanel ? 'max-w-[55%]' : ''}`}>
          {/* Streamlined View Mode Bar */}
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-border-primary/50 bg-bg-secondary/30">
            {/* Left: View Mode Toggle */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => setViewMode('chat')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all duration-200 ${
                  viewMode === 'chat'
                    ? 'bg-accent-primary/20 text-accent-primary'
                    : 'text-fg-tertiary hover:text-fg-secondary hover:bg-bg-tertiary'
                }`}
                title="Chat"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>Chat</span>
              </button>
              <button
                onClick={() => setViewMode('canvas')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all duration-200 ${
                  viewMode === 'canvas'
                    ? 'bg-accent-primary/20 text-accent-primary'
                    : 'text-fg-tertiary hover:text-fg-secondary hover:bg-bg-tertiary'
                }`}
                title="Canvas"
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Canvas</span>
              </button>
            </div>

            {/* Right: Context Panel Controls */}
            <div className="flex items-center gap-1">
              {/* Applets toggle */}
              <button
                onClick={() => toggleContextPanel('applets')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all duration-200 ${
                  contextPanelMode === 'applets'
                    ? 'bg-purple-500/20 text-purple-400'
                    : 'text-fg-tertiary hover:text-fg-secondary hover:bg-bg-tertiary'
                }`}
                title="Toggle Applets Panel"
              >
                <Sparkles className="w-3.5 h-3.5" />
                {hasActiveApplets && (
                  <span className="px-1 py-0.5 text-[10px] bg-purple-500/30 rounded">
                    {activeApplets.length}
                  </span>
                )}
              </button>

              {/* Panel toggle */}
              <button
                onClick={() => toggleContextPanel()}
                className={`p-1.5 rounded-md transition-all duration-200 ${
                  showContextPanel
                    ? 'text-accent-primary bg-accent-primary/10'
                    : 'text-fg-tertiary hover:text-fg-secondary hover:bg-bg-tertiary'
                }`}
                title={showContextPanel ? 'Hide Context Panel' : 'Show Context Panel'}
              >
                {showContextPanel ? (
                  <PanelRightClose className="w-4 h-4" />
                ) : (
                  <PanelRight className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          {/* Main content area */}
          <div className="flex-1 overflow-hidden">
            {viewMode === 'chat' ? (
              <ChatPanel
                activeVolume={activeVolume}
              />
            ) : (
              <CanvasView
                volume={activeVolume}
                selectedArtifact={selectedFile}
                selectedNode={selectedNode}
              />
            )}
          </div>
        </div>

        {/* Right Panel: Context Panel (Applets or Preview) */}
        {showContextPanel && (
          <div className="w-[45%] flex-shrink-0 border-l border-border-primary/50 overflow-hidden flex flex-col">
            {/* Context Panel Header */}
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-border-primary/50 bg-bg-secondary/30">
              <span className="text-xs font-medium text-fg-secondary">
                {contextPanelMode === 'applets' ? 'Applets' : 'Preview'}
              </span>
              <button
                onClick={() => setContextPanelMode('hidden')}
                className="p-1 rounded hover:bg-bg-tertiary text-fg-tertiary hover:text-fg-secondary transition-colors"
                title="Close Panel"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Context Panel Content */}
            <div className="flex-1 overflow-hidden">
              {contextPanelMode === 'applets' ? (
                <AppletPanel
                  mode="split"
                  onModeChange={(mode) => {
                    if (mode === 'dock') setContextPanelMode('hidden');
                    else if (mode === 'full') {
                      // Handle full mode if needed
                    }
                  }}
                />
              ) : (
                <div className="h-full flex items-center justify-center text-fg-tertiary text-sm">
                  {selectedFile ? (
                    <CanvasView
                      volume={activeVolume}
                      selectedArtifact={selectedFile}
                      selectedNode={selectedNode}
                    />
                  ) : (
                    <div className="text-center p-4">
                      <Layers className="w-8 h-8 mx-auto mb-2 opacity-50" />
                      <p>Select a file to preview</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Applet dock at bottom when there are active applets but panel is hidden */}
      {contextPanelMode === 'hidden' && hasActiveApplets && (
        <AppletDock onExpand={() => setContextPanelMode('applets')} />
      )}

      {/* Debug Console - Bottom Panel */}
      <DebugConsole />
    </div>
  );
}

export default function SimpleLayout() {
  return (
    <AppletProvider>
      <LayoutContent />
    </AppletProvider>
  );
}
