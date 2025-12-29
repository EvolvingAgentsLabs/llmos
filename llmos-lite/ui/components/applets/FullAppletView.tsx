'use client';

/**
 * FullAppletView - Expanded applet with flip card
 */

import React, { useState } from 'react';
import { ActiveApplet } from '@/lib/applets/applet-store';
import { AppletViewer } from './AppletViewer';
import { Code2, Play, X, Grid3X3 } from 'lucide-react';

interface FullAppletViewProps {
  applet: ActiveApplet;
  onClose: () => void;
  onMinimize: () => void;
  onSubmit: (data: unknown) => void;
  onSave: (state: Record<string, unknown>) => void;
}

export function FullAppletView({ applet, onClose, onMinimize, onSubmit, onSave }: FullAppletViewProps) {
  const [showCode, setShowCode] = useState(false);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3
                     border-b border-white/10 bg-bg-secondary/50">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-accent-primary animate-pulse" />
          <span className="font-medium text-fg-primary">
            {applet.metadata.name}
          </span>
          {applet.metadata.version && (
            <span className="text-[10px] text-fg-muted px-1.5 py-0.5 rounded bg-white/5">
              v{applet.metadata.version}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowCode(!showCode)}
            className={`p-1.5 rounded-lg transition-colors ${
              showCode
                ? 'bg-accent-primary/20 text-accent-primary'
                : 'text-fg-muted hover:text-fg-primary hover:bg-white/10'
            }`}
            title={showCode ? 'View UI' : 'View Code'}
          >
            {showCode ? <Play className="w-4 h-4" /> : <Code2 className="w-4 h-4" />}
          </button>
          <button
            onClick={onMinimize}
            className="p-1.5 rounded-lg text-fg-muted hover:text-fg-primary
                      hover:bg-white/10 transition-colors"
            title="Back to Grid"
          >
            <Grid3X3 className="w-4 h-4" />
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

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {showCode ? (
          <div className="h-full overflow-auto p-4 bg-bg-primary/50">
            <pre className="text-xs font-mono text-fg-secondary whitespace-pre-wrap">
              <code>{applet.code}</code>
            </pre>
          </div>
        ) : (
          <AppletViewer
            code={applet.code}
            metadata={applet.metadata}
            initialState={applet.state}
            onSubmit={onSubmit}
            onClose={onClose}
            onSave={onSave}
            className="h-full"
          />
        )}
      </div>
    </div>
  );
}
