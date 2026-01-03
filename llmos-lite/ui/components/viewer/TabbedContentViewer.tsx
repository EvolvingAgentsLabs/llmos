'use client';

/**
 * TabbedContentViewer - Full panel viewer with Preview/Code tabs
 *
 * This component provides a tabbed interface for viewing files:
 * - Preview: Visual preview/execution (first tab, default for applets)
 * - Code: Source code editor
 *
 * Takes full panel height with no split view.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { getVFS } from '@/lib/virtual-fs';
import { getVolumeFileSystem, VolumeType } from '@/lib/volumes/file-operations';
import { getLivePreview, ExecutionResult } from '@/lib/runtime/live-preview';
import dynamic from 'next/dynamic';
import {
  Eye,
  Code,
  X,
  Save,
  RefreshCw,
  Play,
  ArrowLeft,
} from 'lucide-react';

// Dynamically import Monaco Editor
const MonacoEditor = dynamic(() => import('@monaco-editor/react'), {
  ssr: false,
  loading: () => (
    <div className="h-full flex items-center justify-center bg-bg-primary">
      <div className="text-fg-tertiary text-sm">Loading editor...</div>
    </div>
  ),
});

// Dynamically import AppletViewer for applet preview
const AppletViewer = dynamic(
  () => import('../applets/AppletViewer').then(mod => ({ default: mod.AppletViewer })),
  {
    ssr: false,
    loading: () => (
      <div className="h-full flex items-center justify-center bg-bg-primary">
        <div className="text-fg-tertiary text-sm">Loading viewer...</div>
      </div>
    ),
  }
);

type ViewTab = 'preview' | 'code';

interface TabbedContentViewerProps {
  filePath: string;
  volume: VolumeType;
  onClose?: () => void;
}

export default function TabbedContentViewer({ filePath, volume, onClose }: TabbedContentViewerProps) {
  const { setContextViewMode, setActiveFile, logActivity } = useWorkspace();

  const [activeTab, setActiveTab] = useState<ViewTab>('preview');
  const [code, setCode] = useState<string>('');
  const [originalCode, setOriginalCode] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [executionResult, setExecutionResult] = useState<ExecutionResult | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);

  const livePreview = getLivePreview();
  const fileSystem = getVolumeFileSystem();

  // Extract filename from path
  const fileName = filePath.split('/').pop() || 'file';

  // Check if file is an applet
  const isAppletFile = (path: string): boolean => {
    const isInAppletsDir = path.includes('/applets/') || path.includes('/applet/');
    const isAppExtension = path.endsWith('.app.tsx') || path.endsWith('.applet.tsx');
    const ext = path.split('.').pop()?.toLowerCase() || '';
    return isAppExtension || (isInAppletsDir && ['tsx', 'jsx'].includes(ext));
  };

  // Check if file is executable (Python, JS, etc.)
  const isExecutableFile = (path: string): boolean => {
    const ext = path.split('.').pop()?.toLowerCase() || '';
    return ['py', 'js', 'ts'].includes(ext);
  };

  // Get Monaco language from file extension
  const getMonacoLanguage = (path: string): string => {
    const ext = path.split('.').pop()?.toLowerCase() || '';
    const languageMap: Record<string, string> = {
      'py': 'python',
      'js': 'javascript',
      'ts': 'typescript',
      'tsx': 'typescript',
      'jsx': 'javascript',
      'json': 'json',
      'yaml': 'yaml',
      'yml': 'yaml',
      'md': 'markdown',
      'css': 'css',
      'html': 'html',
      'sql': 'sql',
      'sh': 'shell',
      'bash': 'shell',
    };
    return languageMap[ext] || 'plaintext';
  };

  // Get file type label
  const getFileType = (path: string): string => {
    const ext = path.split('.').pop()?.toLowerCase() || '';
    const typeMap: Record<string, string> = {
      'py': 'Python',
      'js': 'JavaScript',
      'ts': 'TypeScript',
      'tsx': 'TypeScript React',
      'jsx': 'JavaScript React',
      'json': 'JSON',
      'yaml': 'YAML',
      'yml': 'YAML',
      'md': 'Markdown',
      'css': 'CSS',
      'html': 'HTML',
    };
    return typeMap[ext] || ext.toUpperCase() || 'Text';
  };

  // Parse file path for volume
  const parseFilePath = (path: string): { actualVolume: VolumeType; relativePath: string } => {
    let actualVolume: VolumeType = volume;
    let relativePath = path;

    if (path.startsWith('/volumes/system/')) {
      actualVolume = 'system';
      relativePath = path.replace('/volumes/system/', '');
    } else if (path.startsWith('/volumes/team/')) {
      actualVolume = 'team';
      relativePath = path.replace('/volumes/team/', '');
    } else if (path.startsWith('/volumes/user/')) {
      actualVolume = 'user';
      relativePath = path.replace('/volumes/user/', '');
    } else if (path.startsWith('projects/')) {
      actualVolume = 'user';
      relativePath = path;
    } else if (path.startsWith('/')) {
      relativePath = path.substring(1);
    }

    return { actualVolume, relativePath };
  };

  const { actualVolume, relativePath } = parseFilePath(filePath);

  // Load file content
  useEffect(() => {
    const loadFile = async () => {
      setIsLoading(true);
      setError(null);
      logActivity?.('action', 'Loading file', filePath);

      try {
        // Try VFS first for user files
        if (actualVolume === 'user' && relativePath.startsWith('projects/')) {
          const vfs = getVFS();
          const content = vfs.readFileContent(relativePath);
          if (content !== null) {
            setCode(content);
            setOriginalCode(content);
            logActivity?.('success', 'File loaded from VFS', relativePath);
            setIsLoading(false);
            return;
          }
        }

        // Try public folder for system files
        if (actualVolume === 'system') {
          const response = await fetch(`/system/${relativePath}`);
          if (response.ok) {
            const content = await response.text();
            setCode(content);
            setOriginalCode(content);
            logActivity?.('success', 'File loaded from public', relativePath);
            setIsLoading(false);
            return;
          }
        }

        // Fallback to volume file system
        const content = await fileSystem.readFile(actualVolume, relativePath);
        setCode(content);
        setOriginalCode(content);
        logActivity?.('success', 'File loaded', relativePath);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        setError(errorMsg);
        logActivity?.('error', 'Failed to load file', errorMsg);
      } finally {
        setIsLoading(false);
      }
    };

    loadFile();
  }, [actualVolume, relativePath, logActivity]);

  // Handle code changes
  const handleCodeChange = useCallback((value: string | undefined) => {
    const newCode = value || '';
    setCode(newCode);
    setHasUnsavedChanges(newCode !== originalCode);
  }, [originalCode]);

  // Save file
  const handleSave = useCallback(async () => {
    try {
      if (actualVolume === 'user' && relativePath.startsWith('projects/')) {
        const vfs = getVFS();
        vfs.writeFile(relativePath, code);
        logActivity?.('success', 'File saved to VFS', relativePath);
      } else {
        const original = await fileSystem.readFile(actualVolume, relativePath);
        await fileSystem.editFile(actualVolume, relativePath, original, code);
        logActivity?.('success', 'File saved', relativePath);
      }
      setOriginalCode(code);
      setHasUnsavedChanges(false);
    } catch (err) {
      logActivity?.('error', 'Failed to save file', err instanceof Error ? err.message : 'Unknown error');
    }
  }, [actualVolume, relativePath, code, fileSystem, logActivity]);

  // Execute code
  const handleExecute = useCallback(async () => {
    setIsExecuting(true);
    try {
      const result = await livePreview.executeFile(relativePath, code, {
        autoExecute: false,
        capturePlots: true
      });
      setExecutionResult(result);
      logActivity?.('success', 'Code executed', `${result.executionTime}ms`);
    } catch (err) {
      setExecutionResult({
        success: false,
        stdout: '',
        stderr: err instanceof Error ? err.message : String(err),
        error: String(err),
        executionTime: 0
      });
      logActivity?.('error', 'Execution failed', err instanceof Error ? err.message : 'Unknown');
    } finally {
      setIsExecuting(false);
    }
  }, [relativePath, code, livePreview, logActivity]);

  // Handle code updates from AI fix in applet viewer
  const handleCodeUpdate = useCallback((newCode: string) => {
    setCode(newCode);
    setHasUnsavedChanges(newCode !== originalCode);
  }, [originalCode]);

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

  // Reload file
  const handleReload = useCallback(async () => {
    setIsLoading(true);
    try {
      if (actualVolume === 'user' && relativePath.startsWith('projects/')) {
        const vfs = getVFS();
        const content = vfs.readFileContent(relativePath);
        if (content !== null) {
          setCode(content);
          setOriginalCode(content);
          setHasUnsavedChanges(false);
        }
      } else {
        const content = await fileSystem.readFile(actualVolume, relativePath);
        setCode(content);
        setOriginalCode(content);
        setHasUnsavedChanges(false);
      }
      logActivity?.('info', 'File reloaded', relativePath);
    } catch (err) {
      logActivity?.('error', 'Failed to reload', err instanceof Error ? err.message : 'Unknown');
    } finally {
      setIsLoading(false);
    }
  }, [actualVolume, relativePath, fileSystem, logActivity]);

  const isApplet = isAppletFile(filePath);
  const isExecutable = isExecutableFile(filePath);

  // Determine default tab based on file type
  useEffect(() => {
    // Applets default to preview, other files to code
    if (!isApplet && !isExecutable) {
      setActiveTab('code');
    }
  }, [isApplet, isExecutable]);

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center bg-bg-primary">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-accent-primary/20 border-t-accent-primary rounded-full animate-spin" />
          <p className="text-sm text-fg-muted">Loading file...</p>
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
          <h3 className="text-lg font-medium text-fg-primary mb-2">Failed to Load File</h3>
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
    <div className="h-full flex flex-col bg-bg-primary">
      {/* Header with tabs */}
      <div className="flex items-center justify-between px-3 py-2 bg-bg-secondary border-b border-border-primary">
        {/* Left: Back button and file info */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleClose}
            className="p-1.5 rounded-lg hover:bg-white/10 text-fg-secondary hover:text-fg-primary transition-colors"
            title="Back to Desktop"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-fg-primary">{fileName}</span>
            {hasUnsavedChanges && (
              <span className="w-2 h-2 rounded-full bg-amber-400" title="Unsaved changes" />
            )}
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent-primary/20 text-accent-primary">
              {getFileType(filePath)}
            </span>
          </div>
        </div>

        {/* Center: Tabs */}
        <div className="flex items-center gap-1 bg-bg-elevated rounded-lg p-1">
          <button
            onClick={() => setActiveTab('preview')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              activeTab === 'preview'
                ? 'bg-accent-primary text-white'
                : 'text-fg-secondary hover:text-fg-primary hover:bg-white/5'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            Preview
          </button>
          <button
            onClick={() => setActiveTab('code')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              activeTab === 'code'
                ? 'bg-accent-primary text-white'
                : 'text-fg-secondary hover:text-fg-primary hover:bg-white/5'
            }`}
          >
            <Code className="w-3.5 h-3.5" />
            Code
          </button>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-1">
          {activeTab === 'code' && (
            <>
              <button
                onClick={handleReload}
                className="p-1.5 rounded-lg hover:bg-white/10 text-fg-secondary hover:text-fg-primary transition-colors"
                title="Reload from file"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
              <button
                onClick={handleSave}
                disabled={!hasUnsavedChanges}
                className={`p-1.5 rounded-lg transition-colors ${
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
          {activeTab === 'preview' && isExecutable && !isApplet && (
            <button
              onClick={handleExecute}
              disabled={isExecuting}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-primary hover:bg-accent-primary/90 text-white text-xs font-medium transition-colors disabled:opacity-50"
            >
              <Play className="w-3.5 h-3.5" />
              {isExecuting ? 'Running...' : 'Run'}
            </button>
          )}
          <button
            onClick={handleClose}
            className="p-1.5 rounded-lg hover:bg-red-500/20 text-fg-secondary hover:text-red-400 transition-colors"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'preview' && (
          <div className="h-full overflow-auto">
            {isApplet ? (
              <div className="h-full p-4">
                <AppletViewer
                  code={code}
                  metadata={{
                    name: fileName.replace(/\.(tsx|jsx|app\.tsx)$/, ''),
                    description: `Applet from ${filePath}`,
                  }}
                  onSubmit={(data) => {
                    console.log('[TabbedContentViewer] Applet submitted:', data);
                    logActivity?.('info', 'Applet submitted', JSON.stringify(data).slice(0, 100));
                  }}
                  onClose={handleClose}
                  onCodeUpdate={handleCodeUpdate}
                  autoCompile
                />
              </div>
            ) : isExecutable ? (
              <div className="h-full p-4 overflow-auto">
                {!executionResult ? (
                  <div className="h-full flex items-center justify-center">
                    <div className="text-center">
                      <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-accent-primary/20 flex items-center justify-center">
                        <Play className="w-8 h-8 text-accent-primary" />
                      </div>
                      <p className="text-sm text-fg-muted">Click Run to execute the code</p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Execution Status */}
                    <div className="flex items-center gap-2">
                      {executionResult.success ? (
                        <span className="text-xs px-2 py-1 rounded bg-accent-success/20 text-accent-success">
                          ✓ Success
                        </span>
                      ) : (
                        <span className="text-xs px-2 py-1 rounded bg-accent-error/20 text-accent-error">
                          ✗ Error
                        </span>
                      )}
                      <span className="text-[10px] text-fg-muted">
                        {executionResult.executionTime}ms
                      </span>
                    </div>

                    {/* Error */}
                    {!executionResult.success && executionResult.error && (
                      <div className="p-4 bg-accent-error/10 border border-accent-error/30 rounded-lg">
                        <pre className="text-sm font-mono text-accent-error whitespace-pre-wrap break-words">
                          {executionResult.error}
                        </pre>
                      </div>
                    )}

                    {/* Output */}
                    {executionResult.stdout && (
                      <div className="space-y-2">
                        <div className="text-[10px] font-semibold text-fg-tertiary uppercase tracking-wide">
                          Output
                        </div>
                        <pre className="p-3 bg-bg-secondary rounded text-xs font-mono text-fg-secondary whitespace-pre-wrap overflow-x-auto">
                          {executionResult.stdout}
                        </pre>
                      </div>
                    )}

                    {/* Images/Plots */}
                    {executionResult.images && executionResult.images.length > 0 && (
                      <div className="space-y-2">
                        <div className="text-[10px] font-semibold text-fg-tertiary uppercase tracking-wide">
                          Plots
                        </div>
                        <div className="space-y-2">
                          {executionResult.images.map((img, idx) => (
                            <img
                              key={idx}
                              src={`data:image/png;base64,${img}`}
                              alt={`Plot ${idx + 1}`}
                              className="max-w-full rounded border border-border-primary/30"
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              // For non-executable files, show a preview message
              <div className="h-full flex items-center justify-center">
                <div className="text-center">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-bg-elevated flex items-center justify-center">
                    <Eye className="w-8 h-8 text-fg-muted" />
                  </div>
                  <p className="text-sm text-fg-muted mb-2">Preview not available for this file type</p>
                  <button
                    onClick={() => setActiveTab('code')}
                    className="text-xs text-accent-primary hover:underline"
                  >
                    View source code
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'code' && (
          <div className="h-full flex flex-col">
            <div className="flex-1 min-h-0">
              <MonacoEditor
                height="100%"
                language={getMonacoLanguage(filePath)}
                value={code}
                onChange={handleCodeChange}
                theme="vs-dark"
                options={{
                  minimap: { enabled: false },
                  fontSize: 13,
                  lineNumbers: 'on',
                  scrollBeyondLastLine: false,
                  wordWrap: 'on',
                  automaticLayout: true,
                  tabSize: 2,
                  padding: { top: 12, bottom: 12 },
                  folding: true,
                  renderLineHighlight: 'line',
                  cursorBlinking: 'smooth',
                  smoothScrolling: true,
                }}
                onMount={(editor) => {
                  // Ctrl/Cmd + S to save
                  editor.addCommand(
                    2097 | 49,
                    () => handleSave()
                  );
                  // Ctrl/Cmd + Enter to run
                  editor.addCommand(
                    2097 | 3,
                    () => {
                      if (isExecutable && !isApplet) {
                        handleExecute();
                      }
                    }
                  );
                }}
              />
            </div>
            {/* Status bar */}
            <div className="px-4 py-1.5 bg-bg-secondary border-t border-border-primary flex items-center justify-between text-[10px] text-fg-tertiary">
              <span>{getFileType(filePath)}</span>
              <span>{code.length} characters • {code.split('\n').length} lines</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
