'use client';

import { useState, useCallback, useEffect } from 'react';
import Header from './Header';
import VSCodeFileTree from '../panel1-volumes/VSCodeFileTree';
import ChatPanel from '../chat/ChatPanel';
import CanvasView from '../canvas/CanvasView';
import { AppletPanel, AppletDock } from '../applets/AppletPanel';
import { AppletProvider, useApplets } from '@/contexts/AppletContext';
import { setAppletGeneratedCallback } from '@/lib/system-tools';
import { Sparkles } from 'lucide-react';

type ViewMode = 'chat' | 'canvas' | 'applets';
type AppletPanelMode = 'split' | 'full' | 'dock' | 'hidden';

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
  const [activeVolume, setActiveVolume] = useState<'system' | 'team' | 'user'>('system');
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<TreeNode | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('chat');
  const [activeSession, setActiveSession] = useState<string | null>(null);
  const [appletPanelMode, setAppletPanelMode] = useState<AppletPanelMode>('hidden');

  const { activeApplets, createApplet } = useApplets();
  const hasActiveApplets = activeApplets.length > 0;

  // Set up the applet generation callback when component mounts
  useEffect(() => {
    setAppletGeneratedCallback((applet) => {
      console.log('[SimpleLayout] Applet generated via tool:', applet.name);

      // Create the applet in the store
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

      // Auto-open the applet panel
      setAppletPanelMode('split');
    });

    // Cleanup on unmount
    return () => {
      setAppletGeneratedCallback(null);
    };
  }, [createApplet]);

  // Handle applet submission - send data back to chat
  const handleAppletSubmit = useCallback((appletId: string, data: unknown) => {
    console.log('[SimpleLayout] Applet submitted:', appletId, data);
    // TODO: Feed this back into the chat as a message
  }, []);

  // Toggle applet panel
  const toggleAppletPanel = useCallback(() => {
    setAppletPanelMode((prev) => {
      if (prev === 'hidden' || prev === 'dock') return 'split';
      return 'hidden';
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
              console.log('[SimpleLayout] File selected:', node);
              setSelectedFile(node.id);
              setSelectedNode(node as TreeNode);
              // Switch to canvas view when file is selected
              if (node.type === 'file') {
                // Check if it's an applet file
                if (node.path.endsWith('.app')) {
                  setAppletPanelMode('split');
                  setViewMode('chat');
                } else {
                  setViewMode('canvas');
                }
              }
            }}
            selectedFile={selectedFile}
          />
        </div>

        {/* Center Panel: Chat or Canvas */}
        <div className={`flex-1 flex flex-col overflow-hidden ${appletPanelMode === 'split' ? 'max-w-[50%]' : ''}`}>
          {/* View mode toggle */}
          <div className="flex items-center justify-between px-4 py-2 border-b border-border-primary/50 bg-bg-secondary/30">
            <div className="flex gap-2">
              <button
                onClick={() => setViewMode('chat')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                  viewMode === 'chat'
                    ? 'bg-accent-primary text-white shadow-glow'
                    : 'text-fg-secondary hover:text-fg-primary hover:bg-bg-tertiary'
                }`}
              >
                Chat
              </button>
              <button
                onClick={() => setViewMode('canvas')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                  viewMode === 'canvas'
                    ? 'bg-accent-primary text-white shadow-glow'
                    : 'text-fg-secondary hover:text-fg-primary hover:bg-bg-tertiary'
                }`}
              >
                Canvas
              </button>

              {/* Applets toggle button */}
              <button
                onClick={toggleAppletPanel}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 flex items-center gap-1.5 ${
                  appletPanelMode === 'split' || appletPanelMode === 'full'
                    ? 'bg-purple-600 text-white shadow-glow'
                    : 'text-fg-secondary hover:text-fg-primary hover:bg-bg-tertiary'
                }`}
              >
                <Sparkles className="w-4 h-4" />
                Applets
                {hasActiveApplets && (
                  <span className="ml-1 px-1.5 py-0.5 text-xs bg-purple-500/30 rounded-full">
                    {activeApplets.length}
                  </span>
                )}
              </button>
            </div>

            {selectedFile && (
              <span className="text-sm text-fg-secondary">
                Selected: <span className="text-fg-primary font-medium">{selectedFile}</span>
              </span>
            )}
          </div>

          {/* Main content area */}
          <div className="flex-1 overflow-hidden">
            {viewMode === 'chat' ? (
              <ChatPanel
                activeSession={activeSession}
                activeVolume={activeVolume}
                onSessionCreated={(sessionId) => setActiveSession(sessionId)}
                pendingPrompt={null}
                onPromptProcessed={() => {}}
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

        {/* Right Panel: Applets (Conditional) */}
        {appletPanelMode === 'split' && (
          <div className="w-1/2 flex-shrink-0 border-l border-border-primary/50 overflow-hidden">
            <AppletPanel
              mode="split"
              onModeChange={(mode) => {
                if (mode === 'dock') setAppletPanelMode('dock');
                else if (mode === 'full') setAppletPanelMode('full');
                else setAppletPanelMode('split');
              }}
            />
          </div>
        )}

        {/* Full screen applet panel */}
        {appletPanelMode === 'full' && (
          <div className="fixed inset-0 z-50 bg-bg-primary">
            <AppletPanel
              mode="full"
              onModeChange={(mode) => {
                if (mode === 'dock') setAppletPanelMode('dock');
                else if (mode === 'split') setAppletPanelMode('split');
                else setAppletPanelMode('full');
              }}
            />
          </div>
        )}
      </div>

      {/* Applet dock at bottom when minimized */}
      {appletPanelMode === 'dock' && hasActiveApplets && (
        <AppletDock onExpand={() => setAppletPanelMode('split')} />
      )}
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
