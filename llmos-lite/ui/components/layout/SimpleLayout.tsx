'use client';

import { useState } from 'react';
import Header from './Header';
import VSCodeFileTree from '../panel1-volumes/VSCodeFileTree';
import ChatPanel from '../chat/ChatPanel';
import CanvasView from '../canvas/CanvasView';

type ViewMode = 'chat' | 'canvas';

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

export default function SimpleLayout() {
  const [activeVolume, setActiveVolume] = useState<'system' | 'team' | 'user'>('system');
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<TreeNode | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('chat');
  const [activeSession, setActiveSession] = useState<string | null>(null);

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-bg-primary">
      {/* Header */}
      <Header />

      {/* Main 2-Panel Layout */}
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
                setViewMode('canvas');
              }
            }}
            selectedFile={selectedFile}
          />
        </div>

        {/* Right Panel: Chat or Canvas (Flexible) */}
        <div className="flex-1 flex flex-col overflow-hidden">
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
      </div>
    </div>
  );
}
