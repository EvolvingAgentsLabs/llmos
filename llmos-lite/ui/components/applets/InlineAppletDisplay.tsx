'use client';

/**
 * InlineAppletDisplay - Display applets inline within chat messages
 *
 * This component is used to show applets directly in the chat flow,
 * allowing users to interact with them without opening a separate panel.
 */

import React, { useState, useCallback } from 'react';
import { AppletViewer } from './AppletViewer';
import { useApplets } from '@/contexts/AppletContext';
import { AppletMetadata, generateAppletId } from '@/lib/runtime/applet-runtime';
import { Maximize2, ExternalLink, X, Sparkles } from 'lucide-react';

interface InlineAppletDisplayProps {
  code: string;
  name: string;
  description: string;
  onSubmit?: (data: unknown) => void;
  onOpenInPanel?: () => void;
  showOpenInPanel?: boolean;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
}

export function InlineAppletDisplay({
  code,
  name,
  description,
  onSubmit,
  onOpenInPanel,
  showOpenInPanel = true,
  collapsible = true,
  defaultCollapsed = false,
}: InlineAppletDisplayProps) {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
  const [hasInteracted, setHasInteracted] = useState(false);
  const { createApplet } = useApplets();

  const metadata: AppletMetadata = {
    id: generateAppletId(),
    name,
    description,
    version: '1.0.0',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const handleSubmit = useCallback(
    (data: unknown) => {
      setHasInteracted(true);
      if (onSubmit) {
        onSubmit(data);
      }
    },
    [onSubmit]
  );

  const handleOpenInPanel = useCallback(() => {
    // Create the applet in the store
    createApplet({
      code,
      metadata,
    });

    if (onOpenInPanel) {
      onOpenInPanel();
    }
  }, [code, metadata, createApplet, onOpenInPanel]);

  if (isCollapsed) {
    return (
      <button
        onClick={() => setIsCollapsed(false)}
        className="w-full p-4 bg-purple-600/10 border border-purple-500/30 rounded-lg
                   hover:bg-purple-600/20 transition-colors text-left group"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-500/20 rounded-lg">
              <Sparkles className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <h4 className="font-medium text-gray-200">{name}</h4>
              <p className="text-sm text-gray-400">{description}</p>
            </div>
          </div>
          <span className="text-purple-400 text-sm group-hover:underline">
            Open applet →
          </span>
        </div>
        {hasInteracted && (
          <div className="mt-2 flex items-center gap-2 text-xs text-green-400">
            <span className="w-2 h-2 bg-green-400 rounded-full" />
            Previously used
          </div>
        )}
      </button>
    );
  }

  return (
    <div className="border border-purple-500/30 rounded-lg overflow-hidden bg-gray-900">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-purple-600/10 border-b border-purple-500/30">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-purple-400" />
          <span className="font-medium text-gray-200">{name}</span>
        </div>
        <div className="flex items-center gap-1">
          {showOpenInPanel && (
            <button
              onClick={handleOpenInPanel}
              className="p-1.5 hover:bg-gray-800 rounded transition-colors"
              title="Open in panel"
            >
              <ExternalLink className="w-4 h-4 text-gray-400 hover:text-purple-400" />
            </button>
          )}
          {collapsible && (
            <button
              onClick={() => setIsCollapsed(true)}
              className="p-1.5 hover:bg-gray-800 rounded transition-colors"
              title="Collapse"
            >
              <X className="w-4 h-4 text-gray-400 hover:text-white" />
            </button>
          )}
        </div>
      </div>

      {/* Applet Content */}
      <div className="max-h-[500px] overflow-auto">
        <AppletViewer
          code={code}
          metadata={metadata}
          onSubmit={handleSubmit}
          showControls={false}
          autoCompile={true}
        />
      </div>
    </div>
  );
}

/**
 * AppletPreviewCard - A compact preview card for applets in messages
 */
interface AppletPreviewCardProps {
  name: string;
  description: string;
  onClick?: () => void;
}

export function AppletPreviewCard({ name, description, onClick }: AppletPreviewCardProps) {
  return (
    <button
      onClick={onClick}
      className="w-full p-3 bg-purple-600/10 border border-purple-500/30 rounded-lg
                 hover:bg-purple-600/20 hover:border-purple-500/50 transition-all text-left"
    >
      <div className="flex items-center gap-3">
        <div className="p-2 bg-purple-500/20 rounded-lg flex-shrink-0">
          <Sparkles className="w-4 h-4 text-purple-400" />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-gray-200 truncate">{name}</h4>
          <p className="text-xs text-gray-400 truncate">{description}</p>
        </div>
        <Maximize2 className="w-4 h-4 text-purple-400 flex-shrink-0" />
      </div>
    </button>
  );
}

export default InlineAppletDisplay;
