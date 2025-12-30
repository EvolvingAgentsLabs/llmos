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
    try {
      console.log('[SplitViewCanvas] Loading file:', { actualVolume, relativePath, displayPath });
      const content = await fileSystem.readFile(actualVolume, relativePath);
      setCode(content);
    } catch (error) {
      console.error('[SplitViewCanvas] Failed to load file:', error);
      // Try loading as a system file from public folder
      if (actualVolume === 'system') {
        try {
          const response = await fetch(`/system/${relativePath}`);
          if (response.ok) {
            const content = await response.text();
            setCode(content);
            return;
          }
        } catch (fetchError) {
          console.error('[SplitViewCanvas] Failed to fetch system file:', fetchError);
        }
      }
      setCode(`// Failed to load file: ${displayPath}`);
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

          <textarea
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="flex-1 w-full p-4 bg-bg-primary text-fg-primary font-mono text-sm resize-none focus:outline-none"
            placeholder="# Write your Python code here..."
            spellCheck={false}
          />
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
                </div>

                {/* Stdout */}
                {executionResult.stdout && (
                  <div className="space-y-1">
                    <div className="text-[10px] font-semibold text-fg-tertiary uppercase tracking-wide">
                      Output
                    </div>
                    <pre className="p-3 bg-bg-secondary rounded text-xs font-mono text-fg-secondary whitespace-pre-wrap">
                      {executionResult.stdout}
                    </pre>
                  </div>
                )}

                {/* Stderr/Errors */}
                {executionResult.stderr && (
                  <div className="space-y-1">
                    <div className="text-[10px] font-semibold text-accent-error uppercase tracking-wide">
                      Errors
                    </div>
                    <pre className="p-3 bg-accent-error/10 border border-accent-error/30 rounded text-xs font-mono text-accent-error whitespace-pre-wrap">
                      {executionResult.stderr}
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
                  <div className="space-y-1">
                    <div className="text-[10px] font-semibold text-fg-tertiary uppercase tracking-wide">
                      Return Value
                    </div>
                    <pre className="p-3 bg-bg-secondary rounded text-xs font-mono text-fg-secondary">
                      {String(executionResult.returnValue)}
                    </pre>
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
