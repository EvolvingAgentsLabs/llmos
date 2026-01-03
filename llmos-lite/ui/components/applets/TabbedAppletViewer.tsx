'use client';

/**
 * TabbedAppletViewer - View applets with tabs for Code/Execution/Design
 *
 * This component provides a tabbed interface for working with applet files:
 * - Execution: Run the applet (default view)
 * - Code: View and edit the source code
 * - Design: Visual design view (if applicable)
 */

import React, { useState, useEffect, useCallback } from 'react';
import { AppletViewer } from './AppletViewer';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useApplets } from '@/contexts/AppletContext';
import { getVFS } from '@/lib/virtual-fs';
import {
  Play,
  Code,
  Palette,
  X,
  Save,
  RefreshCw,
  Maximize2,
  Minimize2,
  ArrowLeft,
} from 'lucide-react';

type ViewTab = 'execution' | 'code' | 'design';

interface TabbedAppletViewerProps {
  filePath: string;
  volume: 'system' | 'team' | 'user';
  onClose?: () => void;
}

export default function TabbedAppletViewer({ filePath, volume, onClose }: TabbedAppletViewerProps) {
  const { setContextViewMode, setActiveFile, logActivity } = useWorkspace();
  const { createApplet, activeApplets } = useApplets();

  const [activeTab, setActiveTab] = useState<ViewTab>('execution');
  const [code, setCode] = useState<string>('');
  const [originalCode, setOriginalCode] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [appletName, setAppletName] = useState<string>('');

  // Extract filename from path
  const fileName = filePath.split('/').pop() || 'applet.tsx';

  // Load the applet code from VFS
  useEffect(() => {
    const loadAppletCode = async () => {
      setIsLoading(true);
      setError(null);
      logActivity('action', 'Loading applet file', filePath);

      try {
        const vfs = getVFS();
        const file = vfs.readFile(filePath);

        if (!file || !file.content) {
          setError(`File not found: ${filePath}`);
          logActivity('error', 'File not found', filePath);
          return;
        }

        setCode(file.content);
        setOriginalCode(file.content);

        // Extract applet name from metadata comment or filename
        const nameMatch = file.content.match(/name:\s*['"]([^'"]+)['"]/);
        setAppletName(nameMatch ? nameMatch[1] : fileName.replace(/\.(tsx|jsx|app\.tsx)$/, ''));

        logActivity('success', 'Applet loaded', `${file.content.length} bytes`);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        setError(errorMsg);
        logActivity('error', 'Failed to load applet', errorMsg);
      } finally {
        setIsLoading(false);
      }
    };

    loadAppletCode();
  }, [filePath, logActivity, fileName]);

  // Handle code changes
  const handleCodeChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newCode = e.target.value;
    setCode(newCode);
    setHasUnsavedChanges(newCode !== originalCode);
  }, [originalCode]);

  // Save code to VFS
  const handleSave = useCallback(() => {
    try {
      const vfs = getVFS();
      vfs.writeFile(filePath, code);
      setOriginalCode(code);
      setHasUnsavedChanges(false);
      logActivity('success', 'Applet saved', filePath);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      logActivity('error', 'Failed to save applet', errorMsg);
    }
  }, [filePath, code, logActivity]);

  // Reload code from file
  const handleReload = useCallback(() => {
    const vfs = getVFS();
    const file = vfs.readFile(filePath);
    if (file?.content) {
      setCode(file.content);
      setOriginalCode(file.content);
      setHasUnsavedChanges(false);
      logActivity('info', 'Applet reloaded', filePath);
    }
  }, [filePath, logActivity]);

  // Close and return to desktop
  const handleClose = useCallback(() => {
    if (hasUnsavedChanges) {
      if (!confirm('You have unsaved changes. Are you sure you want to close?')) {
        return;
      }
    }
    setActiveFile(null);
    setContextViewMode('applets');
    onClose?.();
  }, [hasUnsavedChanges, setActiveFile, setContextViewMode, onClose]);

  // Handle applet submission
  const handleAppletSubmit = useCallback((data: unknown) => {
    console.log('[TabbedAppletViewer] Applet submitted:', data);
    logActivity('info', 'Applet submitted', JSON.stringify(data).slice(0, 100));
  }, [logActivity]);

  // Handle code updates from AI fix
  const handleCodeUpdate = useCallback((newCode: string) => {
    setCode(newCode);
    setHasUnsavedChanges(newCode !== originalCode);
  }, [originalCode]);

  const tabs: { id: ViewTab; label: string; icon: React.ReactNode }[] = [
    { id: 'execution', label: 'Run', icon: <Play className="w-4 h-4" /> },
    { id: 'code', label: 'Code', icon: <Code className="w-4 h-4" /> },
    { id: 'design', label: 'Design', icon: <Palette className="w-4 h-4" /> },
  ];

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center bg-bg-primary">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-accent-primary/20 border-t-accent-primary rounded-full animate-spin" />
          <p className="text-sm text-fg-muted">Loading applet...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-bg-primary p-8">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/20 flex items-center justify-center">
            <X className="w-8 h-8 text-red-400" />
          </div>
          <h3 className="text-lg font-medium text-fg-primary mb-2">Failed to Load Applet</h3>
          <p className="text-sm text-fg-muted mb-4">{error}</p>
          <button
            onClick={handleClose}
            className="px-4 py-2 bg-bg-elevated hover:bg-bg-tertiary border border-border-primary rounded-lg text-sm transition-colors"
          >
            Return to Desktop
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`h-full flex flex-col bg-bg-primary ${isMaximized ? 'fixed inset-0 z-50' : ''}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-bg-secondary border-b border-border-primary">
        {/* Left: Back button and title */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleClose}
            className="p-2 rounded-lg hover:bg-white/10 text-fg-secondary hover:text-fg-primary transition-colors"
            title="Back to Desktop"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h3 className="text-sm font-medium text-fg-primary flex items-center gap-2">
              {appletName}
              {hasUnsavedChanges && (
                <span className="w-2 h-2 rounded-full bg-amber-400" title="Unsaved changes" />
              )}
            </h3>
            <p className="text-[10px] text-fg-tertiary font-mono">{filePath}</p>
          </div>
        </div>

        {/* Center: Tabs */}
        <div className="flex items-center gap-1 bg-bg-elevated rounded-lg p-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                activeTab === tab.id
                  ? 'bg-accent-primary text-white'
                  : 'text-fg-secondary hover:text-fg-primary hover:bg-white/5'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2">
          {activeTab === 'code' && (
            <>
              <button
                onClick={handleReload}
                className="p-2 rounded-lg hover:bg-white/10 text-fg-secondary hover:text-fg-primary transition-colors"
                title="Reload from file"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
              <button
                onClick={handleSave}
                disabled={!hasUnsavedChanges}
                className={`p-2 rounded-lg transition-colors ${
                  hasUnsavedChanges
                    ? 'hover:bg-accent-primary/20 text-accent-primary'
                    : 'text-fg-muted cursor-not-allowed'
                }`}
                title="Save changes"
              >
                <Save className="w-4 h-4" />
              </button>
            </>
          )}
          <button
            onClick={() => setIsMaximized(!isMaximized)}
            className="p-2 rounded-lg hover:bg-white/10 text-fg-secondary hover:text-fg-primary transition-colors"
            title={isMaximized ? 'Exit fullscreen' : 'Fullscreen'}
          >
            {isMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
          <button
            onClick={handleClose}
            className="p-2 rounded-lg hover:bg-red-500/20 text-fg-secondary hover:text-red-400 transition-colors"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'execution' && (
          <div className="h-full p-4 overflow-auto">
            <AppletViewer
              code={code}
              metadata={{
                name: appletName,
                description: `Applet from ${filePath}`,
              }}
              onSubmit={handleAppletSubmit}
              onClose={handleClose}
              onCodeUpdate={handleCodeUpdate}
              autoCompile
            />
          </div>
        )}

        {activeTab === 'code' && (
          <div className="h-full flex flex-col">
            <textarea
              value={code}
              onChange={handleCodeChange}
              className="flex-1 w-full p-4 bg-bg-elevated text-fg-primary font-mono text-sm
                        resize-none focus:outline-none border-none
                        scrollbar-thin scrollbar-thumb-border-primary scrollbar-track-transparent"
              spellCheck={false}
            />
            {/* Status bar */}
            <div className="px-4 py-1.5 bg-bg-secondary border-t border-border-primary flex items-center justify-between text-[10px] text-fg-tertiary">
              <span>TypeScript React (TSX)</span>
              <span>{code.length} characters • {code.split('\n').length} lines</span>
            </div>
          </div>
        )}

        {activeTab === 'design' && (
          <div className="h-full flex items-center justify-center bg-bg-primary p-8">
            <div className="text-center max-w-md">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-purple-500/20 flex items-center justify-center">
                <Palette className="w-8 h-8 text-purple-400" />
              </div>
              <h3 className="text-lg font-medium text-fg-primary mb-2">Design View</h3>
              <p className="text-sm text-fg-muted">
                Visual design tools coming soon. For now, use the Code tab to edit your applet.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
