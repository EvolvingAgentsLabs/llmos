'use client';

/**
 * AppletPanel - The "App Dock" for Active Applets
 *
 * Displays and manages all currently active applets.
 * Can be shown as:
 * - Split view alongside chat
 * - Full panel view
 * - Minimized dock at bottom
 */

import React, { useState } from 'react';
import { useApplets, useHasActiveApplets } from '@/contexts/AppletContext';
import { AppletViewer, AppletCard } from './AppletViewer';
import { ActiveApplet } from '@/lib/applets/applet-store';
import {
  X,
  ChevronDown,
  ChevronUp,
  Layers,
  Plus,
  Sparkles,
  Grid3X3,
  Maximize2,
  Minimize2,
  ExternalLink,
} from 'lucide-react';

interface AppletPanelProps {
  className?: string;
  mode?: 'split' | 'full' | 'dock';
  onModeChange?: (mode: 'split' | 'full' | 'dock') => void;
}

export function AppletPanel({
  className = '',
  mode = 'split',
  onModeChange,
}: AppletPanelProps) {
  const {
    activeApplets,
    recentApplets,
    currentApplet,
    closeApplet,
    focusApplet,
    closeAllApplets,
    handleAppletSubmit,
    updateAppletState,
  } = useApplets();

  const [isCollapsed, setIsCollapsed] = useState(false);
  const [showGallery, setShowGallery] = useState(false);

  // If no active applets and not showing gallery, show empty state
  const showEmptyState = activeApplets.length === 0 && !showGallery;

  const handleSubmit = (appletId: string) => (data: unknown) => {
    handleAppletSubmit(appletId, data);
  };

  const handleSave = (appletId: string) => (state: Record<string, unknown>) => {
    updateAppletState(appletId, state);
  };

  // Render dock mode (minimized at bottom)
  if (mode === 'dock' || isCollapsed) {
    return (
      <div
        className={`
          flex items-center gap-2 px-4 py-2 bg-gray-800 border-t border-gray-700
          ${className}
        `}
      >
        <button
          onClick={() => {
            setIsCollapsed(false);
            onModeChange?.('split');
          }}
          className="flex items-center gap-2 px-3 py-1.5 bg-purple-600/20 hover:bg-purple-600/30
                     border border-purple-500/30 rounded-lg text-purple-300 transition-colors"
        >
          <Sparkles className="w-4 h-4" />
          <span className="text-sm font-medium">
            {activeApplets.length} Active Applet{activeApplets.length !== 1 ? 's' : ''}
          </span>
          <ChevronUp className="w-4 h-4" />
        </button>

        {/* Quick access to active applets */}
        <div className="flex items-center gap-1">
          {activeApplets.slice(0, 5).map((applet) => (
            <button
              key={applet.id}
              onClick={() => {
                focusApplet(applet.id);
                setIsCollapsed(false);
                onModeChange?.('split');
              }}
              className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600
                         text-gray-300 rounded transition-colors truncate max-w-[120px]"
              title={applet.metadata.name}
            >
              {applet.metadata.name}
            </button>
          ))}
          {activeApplets.length > 5 && (
            <span className="text-xs text-gray-500">+{activeApplets.length - 5} more</span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`
        flex flex-col bg-gray-900 border-l border-gray-700 h-full
        ${mode === 'full' ? 'w-full' : 'w-full'}
        ${className}
      `}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-800 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-purple-400" />
          <span className="font-semibold text-gray-200">Applets</span>
          {activeApplets.length > 0 && (
            <span className="px-2 py-0.5 text-xs bg-purple-600/30 text-purple-300 rounded-full">
              {activeApplets.length}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {/* View mode toggles */}
          <button
            onClick={() => setShowGallery(!showGallery)}
            className={`p-1.5 rounded transition-colors ${
              showGallery ? 'bg-purple-600/30 text-purple-300' : 'hover:bg-gray-700 text-gray-400'
            }`}
            title="Applet Gallery"
          >
            <Grid3X3 className="w-4 h-4" />
          </button>

          {mode === 'split' && (
            <button
              onClick={() => onModeChange?.('full')}
              className="p-1.5 hover:bg-gray-700 rounded transition-colors text-gray-400"
              title="Expand"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          )}

          {mode === 'full' && (
            <button
              onClick={() => onModeChange?.('split')}
              className="p-1.5 hover:bg-gray-700 rounded transition-colors text-gray-400"
              title="Shrink"
            >
              <Minimize2 className="w-4 h-4" />
            </button>
          )}

          <button
            onClick={() => {
              setIsCollapsed(true);
              onModeChange?.('dock');
            }}
            className="p-1.5 hover:bg-gray-700 rounded transition-colors text-gray-400"
            title="Minimize"
          >
            <ChevronDown className="w-4 h-4" />
          </button>

          {activeApplets.length > 0 && (
            <button
              onClick={closeAllApplets}
              className="p-1.5 hover:bg-red-500/20 rounded transition-colors text-gray-400 hover:text-red-400"
              title="Close All"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Gallery View */}
      {showGallery && (
        <div className="p-4 border-b border-gray-700 bg-gray-850">
          <h3 className="text-sm font-medium text-gray-400 mb-3">Recent Applets</h3>
          {recentApplets.length > 0 ? (
            <div className="grid grid-cols-2 gap-2">
              {recentApplets.map((metadata) => (
                <AppletCard
                  key={metadata.id}
                  metadata={metadata}
                  onClick={() => {
                    // TODO: Load and display the applet
                    setShowGallery(false);
                  }}
                />
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500">No recent applets. Generate one by asking!</p>
          )}
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 overflow-auto">
        {showEmptyState ? (
          <div className="flex flex-col items-center justify-center h-full p-8 text-center">
            <div className="p-4 bg-purple-600/10 rounded-full mb-4">
              <Sparkles className="w-12 h-12 text-purple-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-200 mb-2">The Infinite App Store</h3>
            <p className="text-sm text-gray-400 max-w-xs mb-6">
              Ask for any tool and it will be built for you instantly. Try:
            </p>
            <div className="space-y-2 text-sm">
              <ExamplePrompt text="Help me create an NDA for a freelancer" />
              <ExamplePrompt text="Build me a budget calculator" />
              <ExamplePrompt text="Create a color palette generator" />
              <ExamplePrompt text="Make a unit converter" />
            </div>
          </div>
        ) : (
          <div className="p-4 space-y-4">
            {/* Applet Tabs */}
            {activeApplets.length > 1 && (
              <div className="flex items-center gap-2 overflow-x-auto pb-2">
                {activeApplets.map((applet) => (
                  <button
                    key={applet.id}
                    onClick={() => focusApplet(applet.id)}
                    className={`
                      flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm whitespace-nowrap
                      transition-colors
                      ${
                        currentApplet?.id === applet.id
                          ? 'bg-purple-600/30 text-purple-200 border border-purple-500/30'
                          : 'bg-gray-800 text-gray-400 hover:bg-gray-700 border border-gray-700'
                      }
                    `}
                  >
                    <span>{applet.metadata.name}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        closeApplet(applet.id);
                      }}
                      className="hover:text-red-400"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </button>
                ))}
              </div>
            )}

            {/* Current Applet Viewer */}
            {currentApplet && (
              <AppletViewer
                code={currentApplet.code}
                metadata={currentApplet.metadata}
                initialState={currentApplet.state}
                onSubmit={handleSubmit(currentApplet.id)}
                onClose={() => closeApplet(currentApplet.id)}
                onSave={handleSave(currentApplet.id)}
                className="min-h-[400px]"
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Helper component for example prompts
function ExamplePrompt({ text }: { text: string }) {
  return (
    <div className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-300 hover:border-purple-500/30 cursor-pointer transition-colors">
      "{text}"
    </div>
  );
}

/**
 * AppletDock - A minimized dock showing active applets
 */
export function AppletDock({ onExpand }: { onExpand?: () => void }) {
  const { activeApplets, focusApplet } = useApplets();

  if (activeApplets.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 flex items-center gap-2 px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg shadow-xl">
      <Sparkles className="w-4 h-4 text-purple-400" />
      <div className="flex items-center gap-1">
        {activeApplets.slice(0, 3).map((applet) => (
          <button
            key={applet.id}
            onClick={() => {
              focusApplet(applet.id);
              onExpand?.();
            }}
            className="w-8 h-8 rounded-lg bg-purple-600/20 hover:bg-purple-600/30 flex items-center justify-center text-purple-300 transition-colors"
            title={applet.metadata.name}
          >
            <Layers className="w-4 h-4" />
          </button>
        ))}
        {activeApplets.length > 3 && (
          <span className="text-xs text-gray-400 px-2">+{activeApplets.length - 3}</span>
        )}
      </div>
      <button
        onClick={onExpand}
        className="p-1.5 hover:bg-gray-700 rounded transition-colors"
      >
        <ExternalLink className="w-4 h-4 text-gray-400" />
      </button>
    </div>
  );
}

export default AppletPanel;
