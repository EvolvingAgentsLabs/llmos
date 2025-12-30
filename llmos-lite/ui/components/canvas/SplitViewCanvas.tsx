/**
 * Split View Canvas - Claude Code Style
 *
 * VSCode-like split view with:
 * - Left: Code editor
 * - Right: Live runtime preview
 */

'use client';

import { useState, useEffect } from 'react';
import { getLivePreview, ExecutionResult } from '@/lib/runtime/live-preview';
import { getVolumeFileSystem, VolumeType } from '@/lib/volumes/file-operations';
import { getVFS } from '@/lib/virtual-fs';
import dynamic from 'next/dynamic';

// Dynamically import Monaco Editor to avoid SSR issues
const MonacoEditor = dynamic(() => import('@monaco-editor/react'), {
  ssr: false,
  loading: () => (
    <div className="h-full flex items-center justify-center bg-bg-primary">
      <div className="text-fg-tertiary text-sm">Loading editor...</div>
    </div>
  ),
});

interface SplitViewCanvasProps {
  volume: VolumeType;
  filePath: string;
  initialContent?: string;
}

export default function SplitViewCanvas({
  volume,
  filePath,
  initialContent = ''
}: SplitViewCanvasProps) {
  const [code, setCode] = useState(initialContent);
  const [executionResult, setExecutionResult] = useState<ExecutionResult | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [autoExecute, setAutoExecute] = useState(true);
  const [splitRatio, setSplitRatio] = useState(50); // Percentage for left panel

  const livePreview = getLivePreview();
  const fileSystem = getVolumeFileSystem();

  // Parse the file path to extract actual volume and relative path
  // filePath might be: "/volumes/system/agents/file.md" or "projects/myproject/file.py"
  const parseFilePath = (path: string): { actualVolume: VolumeType; relativePath: string; displayPath: string } => {
    let actualVolume: VolumeType = volume;
    let relativePath = path;
    let displayPath = path;

    // Handle /volumes/system/... paths
    if (path.startsWith('/volumes/system/')) {
      actualVolume = 'system';
      relativePath = path.replace('/volumes/system/', '');
      displayPath = `system/${relativePath}`;
    }
    // Handle /volumes/team/... paths
    else if (path.startsWith('/volumes/team/')) {
      actualVolume = 'team';
      relativePath = path.replace('/volumes/team/', '');
      displayPath = `team/${relativePath}`;
    }
    // Handle /volumes/user/projects/... paths
    else if (path.startsWith('/volumes/user/projects/')) {
      actualVolume = 'user';
      relativePath = path.replace('/volumes/user/', '');
      displayPath = `user/${relativePath}`;
    }
    // Handle /volumes/user/... paths
    else if (path.startsWith('/volumes/user/')) {
      actualVolume = 'user';
      relativePath = path.replace('/volumes/user/', '');
      displayPath = `user/${relativePath}`;
    }
    // Handle paths starting with projects/ (VFS paths)
    else if (path.startsWith('projects/')) {
      actualVolume = 'user';
      relativePath = path;
      displayPath = `user/${path}`;
    }
    // Handle system/ paths
    else if (path.startsWith('system/')) {
      actualVolume = 'system';
      relativePath = path.replace('system/', '');
      displayPath = path;
    }
    // Handle leading slash
    else if (path.startsWith('/')) {
      relativePath = path.substring(1);
      displayPath = `${volume}/${relativePath}`;
    }
    // Default - use as-is with provided volume
    else {
      displayPath = `${volume}/${path}`;
    }

    return { actualVolume, relativePath, displayPath };
  };

  const { actualVolume, relativePath, displayPath } = parseFilePath(filePath);

  // Get file type label from file extension
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
      'sql': 'SQL',
      'sh': 'Shell',
      'bash': 'Bash',
    };
    return typeMap[ext] || ext.toUpperCase() || 'Text';
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
      'xml': 'xml',
      'go': 'go',
      'rust': 'rust',
      'rs': 'rust',
      'cpp': 'cpp',
      'c': 'c',
      'java': 'java',
    };
    return languageMap[ext] || 'plaintext';
  };

  // Load file content on mount
  useEffect(() => {
    loadFile();
  }, [actualVolume, relativePath]);

  // Watch for auto-execute
  useEffect(() => {
    if (!autoExecute) return;

    const unwatch = livePreview.watchFile(relativePath, (result) => {
      setExecutionResult(result);
      setIsExecuting(false);
    });

    return unwatch;
  }, [relativePath, autoExecute]);

  const loadFile = async () => {
    console.log('[SplitViewCanvas] Loading file:', { actualVolume, relativePath, displayPath, filePath });

    // For user volume files starting with 'projects/', read directly from VFS
    if (actualVolume === 'user' && relativePath.startsWith('projects/')) {
      try {
        const vfs = getVFS();
        const content = vfs.readFileContent(relativePath);
        if (content !== null) {
          console.log('[SplitViewCanvas] Loaded from VFS:', relativePath);
          setCode(content);
          return;
        }
      } catch (vfsError) {
        console.error('[SplitViewCanvas] Failed to load from VFS:', vfsError);
      }
    }

    // For system files, try loading from public folder first
    if (actualVolume === 'system') {
      try {
        const response = await fetch(`/system/${relativePath}`);
        if (response.ok) {
          const content = await response.text();
          console.log('[SplitViewCanvas] Loaded system file from public folder:', relativePath);
          setCode(content);
          return;
        }
      } catch (fetchError) {
        console.error('[SplitViewCanvas] Failed to fetch system file:', fetchError);
      }
    }

    // Fallback to volume file system (GitHub-backed)
    try {
      const content = await fileSystem.readFile(actualVolume, relativePath);
      console.log('[SplitViewCanvas] Loaded from volume file system:', relativePath);
      setCode(content);
    } catch (error) {
      console.error('[SplitViewCanvas] Failed to load file:', error);
      setCode(`// Failed to load file: ${displayPath}\n// Path: ${relativePath}\n// Volume: ${actualVolume}`);
    }
  };

  const executeCode = async () => {
    setIsExecuting(true);

    try {
      const result = await livePreview.executeFile(relativePath, code, {
        autoExecute: false,
        capturePlots: true
      });

      setExecutionResult(result);
    } catch (error) {
      setExecutionResult({
        success: false,
        stdout: '',
        stderr: error instanceof Error ? error.message : String(error),
        error: String(error),
        executionTime: 0
      });
    } finally {
      setIsExecuting(false);
    }
  };

  const saveFile = async () => {
    // For user volume files starting with 'projects/', save directly to VFS
    if (actualVolume === 'user' && relativePath.startsWith('projects/')) {
      try {
        const vfs = getVFS();
        vfs.writeFile(relativePath, code);
        console.log('[SplitViewCanvas] Saved to VFS:', relativePath);

        if (autoExecute) {
          executeCode();
        }
        return;
      } catch (vfsError) {
        console.error('[SplitViewCanvas] Failed to save to VFS:', vfsError);
      }
    }

    // Fallback to volume file system
    try {
      const originalContent = await fileSystem.readFile(actualVolume, relativePath);
      await fileSystem.editFile(actualVolume, relativePath, originalContent, code);

      if (autoExecute) {
        executeCode();
      }
    } catch (error) {
      console.error('[SplitViewCanvas] Failed to save file:', error);
    }
  };

  return (
    <div className="h-full flex flex-col bg-bg-primary">
      {/* Toolbar */}
      <div className="px-4 py-2 border-b border-border-primary/50 bg-bg-secondary/30 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-fg-secondary">
            {displayPath}
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent-primary/20 text-accent-primary">
            {getFileType(relativePath)}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-fg-secondary cursor-pointer">
            <input
              type="checkbox"
              checked={autoExecute}
              onChange={(e) => setAutoExecute(e.target.checked)}
              className="rounded"
            />
            Auto-run
          </label>

          <button
            onClick={saveFile}
            className="px-2 py-1 text-xs rounded bg-bg-tertiary hover:bg-bg-elevated text-fg-secondary hover:text-fg-primary transition-colors"
          >
            Save
          </button>

          <button
            onClick={executeCode}
            disabled={isExecuting}
            className="px-3 py-1 text-xs rounded bg-accent-primary hover:bg-accent-primary/90 text-white transition-colors disabled:opacity-50"
          >
            {isExecuting ? 'Running...' : '▶ Run'}
          </button>
        </div>
      </div>

      {/* Split View */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Code Editor */}
        <div
          className="border-r border-border-primary/50 overflow-hidden flex flex-col"
          style={{ width: `${splitRatio}%` }}
        >
          <div className="px-3 py-1.5 border-b border-border-primary/30 bg-bg-secondary/20">
            <span className="text-[10px] font-semibold text-fg-tertiary uppercase tracking-wide">
              Code
            </span>
          </div>

          <div className="flex-1 min-h-0">
            <MonacoEditor
              height="100%"
              language={getMonacoLanguage(relativePath)}
              value={code}
              onChange={(value) => setCode(value || '')}
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
                // Add keyboard shortcuts
                editor.addCommand(
                  // Ctrl/Cmd + S to save
                  2097 /* KeyMod.CtrlCmd */ | 49 /* KeyCode.KeyS */,
                  () => saveFile()
                );
                editor.addCommand(
                  // Ctrl/Cmd + Enter to run
                  2097 /* KeyMod.CtrlCmd */ | 3 /* KeyCode.Enter */,
                  () => executeCode()
                );
              }}
            />
          </div>
        </div>

        {/* Resize Handle */}
        <div
          className="w-1 bg-border-primary/30 hover:bg-accent-primary cursor-col-resize transition-colors"
          onMouseDown={(e) => {
            e.preventDefault();
            const startX = e.clientX;
            const startRatio = splitRatio;

            const handleMouseMove = (e: MouseEvent) => {
              const containerWidth = e.currentTarget ? (e.currentTarget as any).offsetWidth : window.innerWidth;
              const deltaX = e.clientX - startX;
              const deltaRatio = (deltaX / containerWidth) * 100;
              const newRatio = Math.max(20, Math.min(80, startRatio + deltaRatio));
              setSplitRatio(newRatio);
            };

            const handleMouseUp = () => {
              document.removeEventListener('mousemove', handleMouseMove);
              document.removeEventListener('mouseup', handleMouseUp);
            };

            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
          }}
        />

        {/* Right: Live Preview */}
        <div className="flex-1 overflow-hidden flex flex-col">
          <div className="px-3 py-1.5 border-b border-border-primary/30 bg-bg-secondary/20 flex items-center justify-between">
            <span className="text-[10px] font-semibold text-fg-tertiary uppercase tracking-wide">
              Live Preview
            </span>
            {executionResult && (
              <span className="text-[10px] text-fg-muted">
                Executed in {executionResult.executionTime}ms
              </span>
            )}
          </div>

          <div className="flex-1 overflow-auto p-4 bg-bg-primary">
            {!executionResult ? (
              <div className="h-full flex items-center justify-center">
                <div className="text-center">
                  <div className="text-4xl mb-2">▶</div>
                  <p className="text-sm text-fg-tertiary">
                    {autoExecute ? 'Edit code to see results' : 'Click Run to execute'}
                  </p>
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

                {/* Error Details - Show prominently when there's an error */}
                {!executionResult.success && executionResult.error && (
                  <div className="space-y-2">
                    <div className="text-[10px] font-semibold text-accent-error uppercase tracking-wide flex items-center gap-2">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      Error Details
                    </div>
                    <div className="p-4 bg-accent-error/10 border border-accent-error/30 rounded-lg">
                      <pre className="text-sm font-mono text-accent-error whitespace-pre-wrap break-words">
                        {executionResult.error}
                      </pre>
                    </div>
                  </div>
                )}

                {/* Stderr - Show if different from error */}
                {executionResult.stderr && executionResult.stderr !== executionResult.error && (
                  <div className="space-y-2">
                    <div className="text-[10px] font-semibold text-orange-400 uppercase tracking-wide">
                      Standard Error (stderr)
                    </div>
                    <pre className="p-3 bg-orange-500/10 border border-orange-500/30 rounded text-xs font-mono text-orange-300 whitespace-pre-wrap overflow-x-auto">
                      {executionResult.stderr}
                    </pre>
                  </div>
                )}

                {/* Stdout */}
                {executionResult.stdout && (
                  <div className="space-y-2">
                    <div className="text-[10px] font-semibold text-fg-tertiary uppercase tracking-wide">
                      Output (stdout)
                    </div>
                    <pre className="p-3 bg-bg-secondary rounded text-xs font-mono text-fg-secondary whitespace-pre-wrap overflow-x-auto">
                      {executionResult.stdout}
                    </pre>
                  </div>
                )}

                {/* Images (matplotlib plots) */}
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

                {/* Return Value */}
                {executionResult.returnValue !== undefined && executionResult.returnValue !== null && (
                  <div className="space-y-2">
                    <div className="text-[10px] font-semibold text-fg-tertiary uppercase tracking-wide">
                      Return Value
                    </div>
                    <pre className="p-3 bg-bg-secondary rounded text-xs font-mono text-fg-secondary overflow-x-auto">
                      {typeof executionResult.returnValue === 'object'
                        ? JSON.stringify(executionResult.returnValue, null, 2)
                        : String(executionResult.returnValue)}
                    </pre>
                  </div>
                )}

                {/* Debug Info - Show when no output at all */}
                {!executionResult.stdout && !executionResult.stderr && !executionResult.error && executionResult.success && (
                  <div className="text-center py-4 text-fg-muted text-sm">
                    Code executed successfully with no output
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
