'use client';

/**
 * FullAppletView - Expanded applet with flip card
 * Now with Monaco editor for code viewing and editing
 */

import React, { useState, useCallback, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { ActiveApplet } from '@/lib/applets/applet-store';
import { AppletViewer } from './AppletViewer';
import { Code2, Play, X, Grid3X3, Save, Copy, Check, RotateCcw } from 'lucide-react';

// Dynamically import Monaco Editor to avoid SSR issues
const MonacoEditor = dynamic(() => import('@monaco-editor/react'), {
  ssr: false,
  loading: () => (
    <div className="h-full flex items-center justify-center bg-bg-primary">
      <div className="text-fg-tertiary text-sm">Loading editor...</div>
    </div>
  ),
});

interface FullAppletViewProps {
  applet: ActiveApplet;
  onClose: () => void;
  onMinimize: () => void;
  onSubmit: (data: unknown) => void;
  onSave: (state: Record<string, unknown>) => void;
  onCodeUpdate?: (code: string) => void;
}

export function FullAppletView({
  applet,
  onClose,
  onMinimize,
  onSubmit,
  onSave,
  onCodeUpdate,
}: FullAppletViewProps) {
  const [showCode, setShowCode] = useState(false);
  const [editedCode, setEditedCode] = useState(applet.code);
  const [originalCode, setOriginalCode] = useState(applet.code);
  const [isDirty, setIsDirty] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [runKey, setRunKey] = useState(0); // Force re-render of AppletViewer

  // Sync with applet changes
  useEffect(() => {
    setEditedCode(applet.code);
    setOriginalCode(applet.code);
    setIsDirty(false);
  }, [applet.code, applet.id]);

  const handleCodeChange = useCallback((value: string | undefined) => {
    if (value !== undefined) {
      setEditedCode(value);
      setIsDirty(value !== originalCode);
    }
  }, [originalCode]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(editedCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [editedCode]);

  const handleRevert = useCallback(() => {
    setEditedCode(originalCode);
    setIsDirty(false);
  }, [originalCode]);

  const handleSaveCode = useCallback(() => {
    if (isDirty && onCodeUpdate) {
      onCodeUpdate(editedCode);
      setOriginalCode(editedCode);
      setIsDirty(false);
    }
  }, [editedCode, isDirty, onCodeUpdate]);

  const handleRunCode = useCallback(() => {
    // Update the running code and switch to UI view
    if (isDirty) {
      setOriginalCode(editedCode);
      setIsDirty(false);
    }
    setIsRunning(true);
    setRunKey(prev => prev + 1); // Force re-compile
    setShowCode(false);
  }, [editedCode, isDirty]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's' && showCode && isDirty) {
        e.preventDefault();
        handleSaveCode();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && showCode) {
        e.preventDefault();
        handleRunCode();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [showCode, isDirty, handleSaveCode, handleRunCode]);

  const lineCount = editedCode.split('\n').length;

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3
                     border-b border-white/10 bg-bg-secondary/50">
        <div className="flex items-center gap-3">
          <div className={`w-2 h-2 rounded-full ${isRunning ? 'bg-green-500' : 'bg-accent-primary'} animate-pulse`} />
          <span className="font-medium text-fg-primary">
            {applet.metadata.name}
          </span>
          {applet.metadata.version && (
            <span className="text-[10px] text-fg-muted px-1.5 py-0.5 rounded bg-white/5">
              v{applet.metadata.version}
            </span>
          )}
          {isDirty && (
            <span className="text-[10px] text-yellow-400 px-1.5 py-0.5 rounded bg-yellow-500/10">
              Modified
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {/* Code-specific buttons */}
          {showCode && (
            <>
              {/* Copy button */}
              <button
                onClick={handleCopy}
                className="p-1.5 rounded-lg text-fg-muted hover:text-fg-primary
                          hover:bg-white/10 transition-colors"
                title="Copy code"
              >
                {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
              </button>

              {/* Revert button */}
              {isDirty && (
                <button
                  onClick={handleRevert}
                  className="p-1.5 rounded-lg text-fg-muted hover:text-fg-primary
                            hover:bg-white/10 transition-colors"
                  title="Revert changes"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              )}

              {/* Save button */}
              {onCodeUpdate && (
                <button
                  onClick={handleSaveCode}
                  disabled={!isDirty}
                  className={`p-1.5 rounded-lg transition-colors ${
                    isDirty
                      ? 'text-accent-primary hover:bg-accent-primary/20'
                      : 'text-fg-muted/50 cursor-not-allowed'
                  }`}
                  title="Save code (Ctrl+S)"
                >
                  <Save className="w-4 h-4" />
                </button>
              )}

              {/* Run button */}
              <button
                onClick={handleRunCode}
                className="flex items-center gap-1.5 px-2 py-1 rounded-lg
                          bg-green-600/20 text-green-400 hover:bg-green-600/30
                          transition-colors text-xs font-medium"
                title="Run code (Ctrl+Enter)"
              >
                <Play className="w-3.5 h-3.5" />
                Run
              </button>
            </>
          )}

          {/* Toggle Code/UI view */}
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
          <div className="h-full flex flex-col">
            {/* Monaco Editor */}
            <div className="flex-1 overflow-hidden">
              <MonacoEditor
                height="100%"
                language="typescript"
                value={editedCode}
                onChange={handleCodeChange}
                theme="vs-dark"
                options={{
                  readOnly: false,
                  minimap: { enabled: lineCount > 50 },
                  fontSize: 13,
                  lineNumbers: 'on',
                  roundedSelection: true,
                  scrollBeyondLastLine: false,
                  automaticLayout: true,
                  tabSize: 2,
                  wordWrap: 'on',
                  folding: true,
                  lineDecorationsWidth: 10,
                  lineNumbersMinChars: 3,
                  renderLineHighlight: 'all',
                  scrollbar: {
                    verticalScrollbarSize: 10,
                    horizontalScrollbarSize: 10,
                  },
                  cursorStyle: 'line',
                  cursorBlinking: 'blink',
                }}
              />
            </div>

            {/* Status bar */}
            <div className="px-4 py-1.5 border-t border-white/10 bg-bg-secondary/50
                           text-xs text-fg-tertiary flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="font-mono text-accent-primary/70">TSX</span>
                <span>{lineCount} lines</span>
                <span>{editedCode.length} chars</span>
              </div>
              <div className="flex items-center gap-2 text-fg-muted">
                <kbd className="px-1 py-0.5 rounded bg-white/5 text-[10px]">Ctrl+S</kbd>
                <span>save</span>
                <span className="mx-1">·</span>
                <kbd className="px-1 py-0.5 rounded bg-white/5 text-[10px]">Ctrl+Enter</kbd>
                <span>run</span>
              </div>
            </div>
          </div>
        ) : (
          <AppletViewer
            key={runKey}
            code={isDirty ? editedCode : originalCode}
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
