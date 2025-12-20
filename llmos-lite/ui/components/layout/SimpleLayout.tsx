'use client';

import { useState } from 'react';
import Header from './Header';
import VolumeFileTree from '../volumes/VolumeFileTree';
import ChatPanel from '../chat/ChatPanel';
import CanvasView from '../canvas/CanvasView';

type ViewMode = 'chat' | 'canvas';

export default function SimpleLayout() {
  const [activeVolume, setActiveVolume] = useState<'system' | 'team' | 'user'>('user');
  const [selectedArtifact, setSelectedArtifact] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('chat');
  const [activeSession, setActiveSession] = useState<string | null>(null);

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-bg-primary">
      {/* Header */}
      <Header />

      {/* Main 2-Panel Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel: File Tree (Fixed width ~280px) */}
        <div className="w-72 flex-shrink-0 border-r border-border-primary/50 bg-bg-secondary/30 flex flex-col overflow-hidden">
          {/* Volume selector tabs */}
          <div className="flex border-b border-border-primary/50">
            {(['system', 'team', 'user'] as const).map((volume) => (
              <button
                key={volume}
                onClick={() => setActiveVolume(volume)}
                className={`flex-1 py-3 px-4 text-sm font-medium transition-all duration-200 ${
                  activeVolume === volume
                    ? 'text-accent-primary border-b-2 border-accent-primary bg-bg-tertiary/50'
                    : 'text-fg-secondary hover:text-fg-primary hover:bg-bg-tertiary/30'
                }`}
              >
                {volume.charAt(0).toUpperCase() + volume.slice(1)}
              </button>
            ))}
          </div>

          {/* File tree */}
          <div className="flex-1 overflow-y-auto scrollbar-thin">
            <VolumeFileTree
              volume={activeVolume}
              selectedArtifact={selectedArtifact}
              onSelectArtifact={setSelectedArtifact}
            />
          </div>
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

            {selectedArtifact && (
              <span className="text-sm text-fg-secondary">
                Selected: <span className="text-fg-primary font-medium">{selectedArtifact}</span>
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
                selectedArtifact={selectedArtifact}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
