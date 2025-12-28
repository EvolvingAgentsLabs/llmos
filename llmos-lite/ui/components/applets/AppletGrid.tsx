'use client';

/**
 * AppletGrid - J.A.R.V.I.S. style applet display
 *
 * Shows applets as cards with:
 * - UI view: The running applet interface
 * - Code view: The source code (flippable)
 *
 * Simple, clean, focused on the applet experience.
 */

import React, { useState } from 'react';
import { useApplets } from '@/contexts/AppletContext';
import { AppletViewer } from './AppletViewer';
import { ActiveApplet } from '@/lib/applets/applet-store';
import { Code2, Play, X, Sparkles } from 'lucide-react';
import dynamic from 'next/dynamic';

// Lazy load 3D avatar to avoid SSR issues
const JarvisAvatar = dynamic(
  () => import('@/components/system/JarvisAvatar'),
  { ssr: false }
);

// ============================================================================
// APPLET CARD WITH FLIP
// ============================================================================

interface AppletCardProps {
  applet: ActiveApplet;
  onClose: () => void;
  onSubmit: (data: unknown) => void;
  onSave: (state: Record<string, unknown>) => void;
}

function AppletCard({ applet, onClose, onSubmit, onSave }: AppletCardProps) {
  const [isFlipped, setIsFlipped] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      className="relative w-full h-full perspective-1000"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Card with 3D flip */}
      <div
        className={`relative w-full h-full transition-transform duration-500 transform-style-3d ${
          isFlipped ? 'rotate-y-180' : ''
        }`}
      >
        {/* FRONT: UI View */}
        <div className="absolute inset-0 backface-hidden">
          <div className="relative w-full h-full rounded-xl overflow-hidden
                          bg-bg-elevated/80 backdrop-blur-xl
                          border border-white/10
                          shadow-xl shadow-black/20">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3
                            border-b border-white/10 bg-bg-secondary/50">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-accent-primary animate-pulse" />
                <span className="font-medium text-fg-primary text-sm">
                  {applet.metadata.name}
                </span>
              </div>

              <div className={`flex items-center gap-1 transition-opacity duration-200 ${
                isHovered ? 'opacity-100' : 'opacity-0'
              }`}>
                <button
                  onClick={() => setIsFlipped(true)}
                  className="p-1.5 rounded-lg text-fg-muted hover:text-fg-primary
                             hover:bg-white/10 transition-colors"
                  title="View Code"
                >
                  <Code2 className="w-4 h-4" />
                </button>
                <button
                  onClick={onClose}
                  className="p-1.5 rounded-lg text-fg-muted hover:text-red-400
                             hover:bg-red-500/10 transition-colors"
                  title="Close Applet"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Applet Content */}
            <div className="h-[calc(100%-48px)] overflow-auto">
              <AppletViewer
                code={applet.code}
                metadata={applet.metadata}
                initialState={applet.state}
                onSubmit={onSubmit}
                onClose={onClose}
                onSave={onSave}
                className="h-full"
              />
            </div>
          </div>
        </div>

        {/* BACK: Code View */}
        <div className="absolute inset-0 backface-hidden rotate-y-180">
          <div className="relative w-full h-full rounded-xl overflow-hidden
                          bg-bg-elevated/90 backdrop-blur-xl
                          border border-white/10
                          shadow-xl shadow-black/20">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3
                            border-b border-white/10 bg-bg-secondary/50">
              <div className="flex items-center gap-2">
                <Code2 className="w-4 h-4 text-accent-primary" />
                <span className="font-medium text-fg-primary text-sm">
                  {applet.metadata.name} - Source
                </span>
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => setIsFlipped(false)}
                  className="p-1.5 rounded-lg text-fg-muted hover:text-fg-primary
                             hover:bg-white/10 transition-colors"
                  title="View UI"
                >
                  <Play className="w-4 h-4" />
                </button>
                <button
                  onClick={onClose}
                  className="p-1.5 rounded-lg text-fg-muted hover:text-red-400
                             hover:bg-red-500/10 transition-colors"
                  title="Close Applet"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Code Content */}
            <div className="h-[calc(100%-48px)] overflow-auto p-4">
              <pre className="text-xs font-mono text-fg-secondary whitespace-pre-wrap">
                <code>{applet.code}</code>
              </pre>
            </div>
          </div>
        </div>
      </div>

      {/* 3D Transform Styles */}
      <style jsx>{`
        .perspective-1000 { perspective: 1000px; }
        .transform-style-3d { transform-style: preserve-3d; }
        .backface-hidden { backface-visibility: hidden; }
        .rotate-y-180 { transform: rotateY(180deg); }
      `}</style>
    </div>
  );
}

// ============================================================================
// EMPTY STATE - J.A.R.V.I.S. Avatar as the AI presence
// ============================================================================

function EmptyState() {
  const suggestions = [
    'Create a calculator',
    'Build a todo list',
    'Make a color picker',
    'Design a timer',
  ];

  return (
    <div className="flex flex-col h-full">
      {/* J.A.R.V.I.S. Avatar - the AI's presence (takes most of the space) */}
      <div className="flex-1 min-h-[300px]">
        <JarvisAvatar showLabel={false} />
      </div>

      {/* Status & Suggestions (bottom area) */}
      <div className="p-6 space-y-4 bg-gradient-to-t from-bg-primary to-transparent">
        <div className="text-center space-y-2">
          <h2 className="text-lg font-medium text-fg-primary">
            Ready to Create
          </h2>
          <p className="text-sm text-fg-muted">
            Ask me to build any tool and it will appear here.
          </p>
        </div>

        {/* Suggestions */}
        <div className="flex flex-wrap gap-2 justify-center">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion}
              className="px-3 py-1.5 text-xs rounded-full
                         bg-white/5 border border-white/10
                         text-fg-secondary hover:text-fg-primary
                         hover:bg-white/10 hover:border-accent-primary/30
                         transition-all duration-200"
            >
              {suggestion}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// MAIN APPLET GRID
// ============================================================================

interface AppletGridProps {
  className?: string;
}

export default function AppletGrid({ className = '' }: AppletGridProps) {
  const {
    activeApplets,
    currentApplet,
    closeApplet,
    focusApplet,
    handleAppletSubmit,
    updateAppletState,
    closeAllApplets,
  } = useApplets();

  const handleSubmit = (appletId: string) => (data: unknown) => {
    handleAppletSubmit(appletId, data);
  };

  const handleSave = (appletId: string) => (state: Record<string, unknown>) => {
    updateAppletState(appletId, state);
  };

  // No applets - show empty state
  if (activeApplets.length === 0) {
    return (
      <div className={`h-full ${className}`}>
        <EmptyState />
      </div>
    );
  }

  // Single applet - full view
  if (activeApplets.length === 1) {
    const applet = activeApplets[0];
    return (
      <div className={`h-full p-4 ${className}`}>
        <AppletCard
          applet={applet}
          onClose={() => closeApplet(applet.id)}
          onSubmit={handleSubmit(applet.id)}
          onSave={handleSave(applet.id)}
        />
      </div>
    );
  }

  // Multiple applets - grid with tabs
  return (
    <div className={`h-full flex flex-col ${className}`}>
      {/* Applet Tabs */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-white/10 overflow-x-auto">
        {activeApplets.map((applet) => (
          <button
            key={applet.id}
            onClick={() => focusApplet(applet.id)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm whitespace-nowrap
                       transition-all duration-200 ${
                         currentApplet?.id === applet.id
                           ? 'bg-accent-primary/20 text-accent-primary border border-accent-primary/30'
                           : 'bg-white/5 text-fg-secondary hover:text-fg-primary hover:bg-white/10 border border-transparent'
                       }`}
          >
            <Sparkles className="w-3 h-3" />
            <span>{applet.metadata.name}</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                closeApplet(applet.id);
              }}
              className="hover:text-red-400 ml-1"
            >
              <X className="w-3 h-3" />
            </button>
          </button>
        ))}

        {activeApplets.length > 1 && (
          <button
            onClick={closeAllApplets}
            className="ml-auto px-2 py-1 text-xs text-fg-muted hover:text-red-400
                       hover:bg-red-500/10 rounded transition-colors"
          >
            Close All
          </button>
        )}
      </div>

      {/* Current Applet */}
      {currentApplet && (
        <div className="flex-1 p-4 overflow-hidden">
          <AppletCard
            applet={currentApplet}
            onClose={() => closeApplet(currentApplet.id)}
            onSubmit={handleSubmit(currentApplet.id)}
            onSave={handleSave(currentApplet.id)}
          />
        </div>
      )}
    </div>
  );
}
