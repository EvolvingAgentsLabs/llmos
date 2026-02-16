'use client';

import { useState, useEffect, useCallback } from 'react';
import { useArtifactStore } from '@/lib/artifacts/store';
import dynamic from 'next/dynamic';

// Dynamically import Monaco Editor to avoid SSR issues
const MonacoEditor = dynamic(() => import('@monaco-editor/react'), {
  ssr: false,
  loading: () => (
    <div className="h-full flex items-center justify-center bg-bg-primary">
      <div className="text-fg-tertiary">Loading editor...</div>
    </div>
  ),
});

interface CanvasViewProps {
  volume: 'system' | 'team' | 'user';
  selectedArtifact: string | null;
  selectedNode?: {
    id: string;
    name: string;
    type: 'volume' | 'folder' | 'file';
    path: string;
    metadata?: {
      fileType?: string;
      readonly?: boolean;
    };
  } | null;
}

type ViewMode = 'code' | 'design';

export default function CanvasView({ volume, selectedArtifact, selectedNode }: CanvasViewProps) {
  const { artifacts } = useArtifactStore();
  const [viewMode, setViewMode] = useState<ViewMode>('code');

  const artifact = selectedArtifact
    ? artifacts.find((a) => a.id === selectedArtifact)
    : null;

  // If no artifact or node selected, show empty state
  if (!artifact && !selectedNode) {
    return (
      <div className="h-full flex items-center justify-center bg-bg-primary">
        <div className="text-center max-w-md px-8">
          <svg className="w-16 h-16 mx-auto mb-4 text-fg-tertiary opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <h3 className="text-lg font-semibold text-fg-primary mb-2">No File Selected</h3>
          <p className="text-sm text-fg-secondary">
            Select a file from the explorer to view and edit it here
          </p>
        </div>
      </div>
    );
  }

  // If only node selected (from tree), show it
  if (selectedNode && selectedNode.type === 'file') {
    return (
      <div className="h-full flex flex-col bg-bg-primary">
        {/* File header with tabs */}
        <div className="border-b border-border-primary/50 bg-bg-secondary/30">
          <div className="px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FileIcon fileType={selectedNode.metadata?.fileType} fileName={selectedNode.name} />
              <div>
                <h2 className="text-sm font-semibold text-fg-primary">{selectedNode.name}</h2>
                <p className="text-xs text-fg-tertiary">{selectedNode.path}</p>
              </div>
            </div>
            {selectedNode.metadata?.readonly && (
              <span className="text-xs px-2 py-1 rounded bg-bg-elevated text-fg-tertiary">
                Read-only
              </span>
            )}
          </div>

          {/* View mode tabs */}
          <div className="px-4 flex gap-1">
            <button
              onClick={() => setViewMode('code')}
              className={`px-4 py-2 text-xs font-medium border-b-2 transition-colors ${
                viewMode === 'code'
                  ? 'border-accent-primary text-accent-primary'
                  : 'border-transparent text-fg-secondary hover:text-fg-primary hover:border-border-primary'
              }`}
            >
              Code
            </button>
            <button
              onClick={() => setViewMode('design')}
              className={`px-4 py-2 text-xs font-medium border-b-2 transition-colors ${
                viewMode === 'design'
                  ? 'border-accent-primary text-accent-primary'
                  : 'border-transparent text-fg-secondary hover:text-fg-primary hover:border-border-primary'
              }`}
            >
              Design
            </button>
          </div>
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-auto">
          {viewMode === 'code' ? (
            <CodeView node={selectedNode} />
          ) : (
            <DesignView node={selectedNode} />
          )}
        </div>
      </div>
    );
  }

  // If no artifact at this point, return null (shouldn't happen due to earlier checks)
  if (!artifact) {
    return null;
  }

  return (
    <div className="h-full flex flex-col bg-bg-primary">
      {/* Artifact header */}
      <div className="px-6 py-4 border-b border-border-primary/50 bg-bg-secondary/30">
        <div className="flex items-center gap-3">
          <span className="text-2xl">
            {artifact.type === 'agent' && '🤖'}
            {artifact.type === 'tool' && '🔧'}
            {artifact.type === 'skill' && '⚡'}
            {artifact.type === 'code' && '📄'}
            {artifact.type === 'workflow' && '🔄'}
          </span>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-fg-primary">{artifact.name}</h2>
            <p className="text-sm text-fg-secondary">
              {artifact.type.charAt(0).toUpperCase() + artifact.type.slice(1)} • {artifact.volume} volume
            </p>
          </div>
          <span className={`
            px-3 py-1 rounded-full text-xs font-medium
            ${artifact.status === 'committed' ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}
          `}>
            {artifact.status}
          </span>
        </div>
      </div>

      {/* Artifact content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-4xl mx-auto">
          {/* Metadata section */}
          <div className="mb-6 p-4 bg-bg-secondary/50 rounded-lg border border-border-primary/50">
            <h3 className="text-sm font-semibold text-fg-primary mb-3">Metadata</h3>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-fg-tertiary">ID</dt>
                <dd className="text-fg-secondary font-mono text-xs">{artifact.id}</dd>
              </div>
              <div>
                <dt className="text-fg-tertiary">Type</dt>
                <dd className="text-fg-secondary">{artifact.type}</dd>
              </div>
              <div>
                <dt className="text-fg-tertiary">Volume</dt>
                <dd className="text-fg-secondary">{artifact.volume}</dd>
              </div>
              <div>
                <dt className="text-fg-tertiary">Status</dt>
                <dd className="text-fg-secondary">{artifact.status}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-fg-tertiary">Created</dt>
                <dd className="text-fg-secondary">{new Date(artifact.createdAt).toLocaleString()}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-fg-tertiary">Updated</dt>
                <dd className="text-fg-secondary">{new Date(artifact.updatedAt).toLocaleString()}</dd>
              </div>
            </dl>
          </div>

          {/* Code View section */}
          {artifact.codeView && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-fg-primary mb-3">Code</h3>
              <div className="p-4 bg-bg-secondary/50 rounded-lg border border-border-primary/50">
                <pre className="text-sm text-fg-secondary font-mono whitespace-pre-wrap">
                  {artifact.codeView}
                </pre>
              </div>
            </div>
          )}

          {/* Render View section */}
          {artifact.renderView && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-fg-primary mb-3">Render Data</h3>
              <div className="p-4 bg-bg-secondary/50 rounded-lg border border-border-primary/50">
                <pre className="text-sm text-fg-secondary font-mono whitespace-pre-wrap">
                  {JSON.stringify(artifact.renderView, null, 2)}
                </pre>
              </div>
            </div>
          )}

          {/* Dependencies */}
          {artifact.dependencies && artifact.dependencies.length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-fg-primary mb-3">Dependencies</h3>
              <div className="p-4 bg-bg-secondary/50 rounded-lg border border-border-primary/50">
                <ul className="space-y-2">
                  {artifact.dependencies.map((dep, idx) => (
                    <li key={idx} className="text-sm text-fg-secondary flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-accent-primary"></span>
                      {dep}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* Tags */}
          {artifact.tags && artifact.tags.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-fg-primary mb-3">Tags</h3>
              <div className="flex flex-wrap gap-2">
                {artifact.tags.map((tag, idx) => (
                  <span
                    key={idx}
                    className="px-3 py-1 bg-accent-primary/20 text-accent-primary rounded-full text-xs font-medium"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Helper component for file icons
function FileIcon({ fileType, fileName }: { fileType?: string; fileName: string }) {
  const ext = fileName.split('.').pop()?.toLowerCase();

  const getColor = () => {
    if (fileType === 'agent') return '#f97316';
    if (fileType === 'tool') return '#8b5cf6';
    if (fileType === 'skill') return '#eab308';
    if (fileType === 'runtime') return '#10b981';
    if (ext === 'ts') return '#3178c6';
    if (ext === 'js') return '#f1e05a';
    if (ext === 'py') return '#3572A5';
    if (ext === 'md') return '#083fa1';
    return '#858585';
  };

  return (
    <svg className="w-5 h-5" viewBox="0 0 16 16" fill="currentColor" style={{ color: getColor() }}>
      <path d="M13.5 2h-11L2 2.5v11l.5.5h11l.5-.5v-11L13.5 2zM13 13H3V3h10v10z" opacity="0.7"/>
      <text x="8" y="11" fontSize="6" textAnchor="middle" fill="currentColor" fontWeight="bold">
        {(ext || 'file').substring(0, 2).toUpperCase()}
      </text>
    </svg>
  );
}

// Code view component with Monaco Editor, edit/save, and run functionality
function CodeView({ node }: { node: { id: string; name: string; path: string; metadata?: { fileType?: string; readonly?: boolean } } }) {
  const [fileContent, setFileContent] = useState<string>('');
  const [originalContent, setOriginalContent] = useState<string>('');
  const [imageData, setImageData] = useState<{ base64: string; format: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [runOutput, setRunOutput] = useState<{ stdout: string; stderr: string } | null>(null);
  const [showOutput, setShowOutput] = useState(false);

  // Normalize tree path to VFS path format
  // Tree uses: /volumes/user/projects/... or /volumes/system/...
  // VFS expects: projects/... or system/...
  const normalizePathForVFS = useCallback((treePath: string): string => {
    let normalized = treePath;

    // Handle /volumes/user/projects/... -> projects/...
    if (normalized.startsWith('/volumes/user/projects/')) {
      normalized = normalized.replace('/volumes/user/projects/', 'projects/');
    }
    // Handle /volumes/user/... (other user paths) -> ...
    else if (normalized.startsWith('/volumes/user/')) {
      normalized = normalized.replace('/volumes/user/', '');
    }
    // Handle /volumes/team/... -> team/...
    else if (normalized.startsWith('/volumes/team/')) {
      normalized = normalized.replace('/volumes/team/', '');
    }
    // Handle /volumes/system/... -> system/...
    else if (normalized.startsWith('/volumes/system/')) {
      normalized = normalized.replace('/volumes/system/', 'system/');
    }
    // Remove any leading slash
    else if (normalized.startsWith('/')) {
      normalized = normalized.substring(1);
    }

    return normalized;
  }, []);

  const vfsPath = normalizePathForVFS(node.path);
  const isReadOnly = node.metadata?.readonly || vfsPath.startsWith('system/');
  const isPythonFile = node.name.endsWith('.py');
  const isVFSFile = vfsPath.startsWith('projects/') || node.id.startsWith('vfs-');

  // Get language for Monaco Editor
  const getLanguage = useCallback(() => {
    const ext = node.name.split('.').pop()?.toLowerCase();
    const langMap: Record<string, string> = {
      'py': 'python',
      'js': 'javascript',
      'ts': 'typescript',
      'tsx': 'typescript',
      'jsx': 'javascript',
      'json': 'json',
      'md': 'markdown',
      'yaml': 'yaml',
      'yml': 'yaml',
      'html': 'html',
      'css': 'css',
      'sql': 'sql',
    };
    return langMap[ext || ''] || 'plaintext';
  }, [node.name]);

  // Load actual file content from VFS or system
  useEffect(() => {
    async function loadFile() {
      try {
        setLoading(true);
        setLoadError(null);
        setRunOutput(null);
        setShowOutput(false);

        console.log('[CodeView] Loading file:', { original: node.path, vfsPath });

        // Handle system files (from public/system/)
        if (vfsPath.startsWith('system/')) {
          console.log('[CodeView] Fetching system file:', vfsPath);
          const response = await fetch(`/${vfsPath}`);
          if (response.ok) {
            const content = await response.text();
            setFileContent(content);
            setOriginalContent(content);
            setImageData(null);
            setLoadError(null);
          } else {
            const errorMsg = `System file not found: ${vfsPath}`;
            console.error('[CodeView]', errorMsg);
            setLoadError(errorMsg);
            setFileContent('');
            setOriginalContent('');
          }
          setLoading(false);
          return;
        }

        // Handle VFS files (projects/*)
        console.log('[CodeView] Loading from VFS:', vfsPath);
        const { getVFS } = await import('@/lib/virtual-fs');
        const vfs = getVFS();
        const file = vfs.readFile(vfsPath);

        if (!file) {
          console.warn('[CodeView] File not found in VFS:', vfsPath);
          // Show error instead of mock content
          setLoadError(`File not found: ${vfsPath}`);
          setFileContent('');
          setOriginalContent('');
          setImageData(null);
          setLoading(false);
          return;
        }

        console.log('[CodeView] File loaded from VFS:', vfsPath, 'size:', file.size);

        // Check if this is a .png file with JSON image data
        if (node.name.endsWith('.png')) {
          try {
            const imageJson = JSON.parse(file.content);
            if (imageJson.base64 && imageJson.format) {
              setImageData({
                base64: imageJson.base64,
                format: imageJson.format
              });
              setFileContent('');
              setOriginalContent('');
            } else {
              setFileContent(file.content);
              setOriginalContent(file.content);
              setImageData(null);
            }
          } catch {
            setFileContent(file.content);
            setOriginalContent(file.content);
            setImageData(null);
          }
        } else {
          setFileContent(file.content);
          setOriginalContent(file.content);
          setImageData(null);
        }
        setLoadError(null);
      } catch (error) {
        console.error('[CodeView] Failed to load file:', error);
        setLoadError(`Error loading file: ${error instanceof Error ? error.message : 'Unknown error'}`);
        setFileContent('');
        setOriginalContent('');
        setImageData(null);
      } finally {
        setLoading(false);
        setIsDirty(false);
        setIsEditing(false);
      }
    }

    loadFile();
  }, [vfsPath, node.name, node.id]);

  // Handle content change
  const handleContentChange = useCallback((value: string | undefined) => {
    if (value !== undefined && isEditing) {
      setFileContent(value);
      setIsDirty(value !== originalContent);
    }
  }, [isEditing, originalContent]);

  // Save file to VFS
  const handleSave = useCallback(async () => {
    if (!isDirty || !isVFSFile) return;

    try {
      setSaving(true);
      const { getVFS } = await import('@/lib/virtual-fs');
      const vfs = getVFS();
      vfs.writeFile(vfsPath, fileContent);
      setOriginalContent(fileContent);
      setIsDirty(false);
      console.log('[CodeView] File saved:', vfsPath);
    } catch (error) {
      console.error('[CodeView] Failed to save file:', error);
    } finally {
      setSaving(false);
    }
  }, [isDirty, isVFSFile, vfsPath, fileContent]);

  // Cancel editing
  const handleCancel = useCallback(() => {
    setFileContent(originalContent);
    setIsDirty(false);
    setIsEditing(false);
  }, [originalContent]);

  // Copy to clipboard
  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(fileContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [fileContent]);

  // Python execution disabled (pyodide removed)
  const handleRun = useCallback(async () => {
    setShowOutput(true);
    setRunOutput({ stdout: '', stderr: 'Python execution not available (pyodide removed)' });
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's' && isEditing && isDirty) {
        e.preventDefault();
        handleSave();
      }
      if (e.key === 'Escape' && isEditing) {
        handleCancel();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isEditing, isDirty, handleSave, handleCancel]);

  // Mock file content based on file type (fallback)
  const getMockFileContent = () => {
    const fileType = node.metadata?.fileType;

    if (fileType === 'agent') {
      return `---
name: ${node.name.replace('.md', '')}
type: agent
---

# ${node.name.replace('.md', '')}

## Description
An AI agent definition file.

## Capabilities
- Autonomous task execution
- Tool integration
- Memory management
`;
    }

    // Default content
    return `# ${node.name}

This is a placeholder file.
`;
  };

  if (loading) {
    return (
      <div className="h-full bg-bg-primary flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-accent-primary border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-sm text-fg-tertiary">Loading file...</p>
        </div>
      </div>
    );
  }

  // Show error state
  if (loadError) {
    return (
      <div className="h-full bg-bg-primary flex items-center justify-center">
        <div className="text-center max-w-md px-8">
          <svg className="w-16 h-16 mx-auto mb-4 text-red-400 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <h3 className="text-lg font-semibold text-fg-primary mb-2">Unable to Load File</h3>
          <p className="text-sm text-fg-secondary mb-4">{loadError}</p>
          <p className="text-xs text-fg-tertiary">
            Path: {vfsPath}
          </p>
        </div>
      </div>
    );
  }

  // If this is an image, render it
  if (imageData) {
    return (
      <div className="h-full bg-bg-primary overflow-auto">
        <div className="p-6">
          <div className="max-w-4xl mx-auto">
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-fg-primary mb-1">Matplotlib Plot</h3>
              <p className="text-xs text-fg-tertiary">Generated visualization saved to VFS</p>
            </div>
            <div className="rounded-lg border border-border-primary overflow-hidden bg-bg-secondary/30">
              <img
                src={`data:image/${imageData.format};base64,${imageData.base64}`}
                alt={node.name}
                className="w-full h-auto"
                style={{ maxWidth: '100%', height: 'auto', display: 'block' }}
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Render code editor with toolbar
  return (
    <div className="h-full flex flex-col bg-bg-primary">
      {/* Toolbar */}
      <div className="px-4 py-2 border-b border-border-primary/50 bg-bg-secondary/30 flex items-center justify-between">
        <div className="flex items-center gap-3 text-xs text-fg-tertiary">
          <span className="font-mono px-2 py-0.5 bg-bg-tertiary rounded">{getLanguage()}</span>
          {isReadOnly ? (
            <span className="flex items-center gap-1 text-yellow-400">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              Read-only
            </span>
          ) : isEditing ? (
            <span className="flex items-center gap-1 text-accent-primary">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              Editing
            </span>
          ) : (
            <span className="text-fg-tertiary">View mode</span>
          )}
          {isDirty && (
            <span className="flex items-center gap-1 text-yellow-400">
              <svg className="w-2 h-2" fill="currentColor" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10" />
              </svg>
              Unsaved
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Run button (Python files only) */}
          {isPythonFile && (
            <button
              onClick={handleRun}
              disabled={isRunning}
              className={`px-3 py-1 text-xs rounded flex items-center gap-1 transition-colors ${
                isRunning
                  ? 'bg-bg-tertiary text-fg-tertiary cursor-wait'
                  : 'bg-green-500/20 text-green-400 hover:bg-green-500/30 border border-green-500/30'
              }`}
              title="Run Python code"
            >
              {isRunning ? (
                <>
                  <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                  </svg>
                  Running...
                </>
              ) : (
                <>
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                  Run
                </>
              )}
            </button>
          )}

          {/* Copy button */}
          <button
            onClick={handleCopy}
            className="px-3 py-1 text-xs rounded bg-bg-tertiary text-fg-secondary hover:bg-bg-elevated hover:text-fg-primary transition-colors flex items-center gap-1"
            title="Copy code"
          >
            {copied ? (
              <>
                <svg className="w-3 h-3 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Copied
              </>
            ) : (
              <>
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                Copy
              </>
            )}
          </button>

          {/* Edit/Save/Cancel buttons */}
          {!isReadOnly && isVFSFile && (
            <>
              {isEditing ? (
                <>
                  <button
                    onClick={handleCancel}
                    className="px-3 py-1 text-xs rounded bg-bg-tertiary text-fg-secondary hover:bg-bg-elevated hover:text-fg-primary transition-colors"
                    title="Cancel (Esc)"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={!isDirty || saving}
                    className={`px-3 py-1 text-xs rounded flex items-center gap-1 transition-colors ${
                      isDirty && !saving
                        ? 'bg-accent-primary/20 text-accent-primary hover:bg-accent-primary/30 border border-accent-primary/30'
                        : 'bg-bg-tertiary text-fg-tertiary cursor-not-allowed'
                    }`}
                    title="Save (Ctrl+S)"
                  >
                    {saving ? (
                      <>
                        <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                        </svg>
                        Saving...
                      </>
                    ) : (
                      <>
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Save
                      </>
                    )}
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setIsEditing(true)}
                  className="px-3 py-1 text-xs rounded bg-bg-tertiary text-fg-secondary hover:bg-bg-elevated hover:text-fg-primary transition-colors flex items-center gap-1"
                  title="Edit file"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  Edit
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Monaco Editor */}
      <div className={`flex-1 overflow-hidden ${showOutput ? 'h-1/2' : ''}`}>
        <MonacoEditor
          height="100%"
          language={getLanguage()}
          value={fileContent}
          onChange={handleContentChange}
          theme="vs-dark"
          options={{
            readOnly: isReadOnly || !isEditing,
            minimap: { enabled: fileContent.split('\n').length > 50 },
            fontSize: 14,
            lineNumbers: 'on',
            roundedSelection: true,
            scrollBeyondLastLine: false,
            automaticLayout: true,
            tabSize: 2,
            wordWrap: 'on',
            folding: true,
            lineDecorationsWidth: 10,
            lineNumbersMinChars: 3,
            renderLineHighlight: isEditing ? 'all' : 'none',
            scrollbar: {
              verticalScrollbarSize: 10,
              horizontalScrollbarSize: 10,
            },
            cursorStyle: isEditing ? 'line' : 'line-thin',
            cursorBlinking: isEditing ? 'blink' : 'solid',
          }}
        />
      </div>

      {/* Output Panel */}
      {showOutput && runOutput && (
        <div className="h-1/2 border-t border-border-primary flex flex-col">
          <div className="px-4 py-2 bg-bg-secondary/50 flex items-center justify-between">
            <span className="text-xs font-medium text-fg-secondary">Output</span>
            <button
              onClick={() => setShowOutput(false)}
              className="text-fg-tertiary hover:text-fg-primary"
              title="Close output"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="flex-1 overflow-auto p-4 font-mono text-sm">
            {runOutput.stdout && (
              <pre className="text-fg-secondary whitespace-pre-wrap">{runOutput.stdout}</pre>
            )}
            {runOutput.stderr && (
              <pre className="text-red-400 whitespace-pre-wrap mt-2">{runOutput.stderr}</pre>
            )}
          </div>
        </div>
      )}

      {/* Status bar */}
      <div className="px-4 py-1 border-t border-border-primary/50 bg-bg-secondary/30 text-xs text-fg-tertiary flex items-center justify-between">
        <span>{fileContent.split('\n').length} lines, {fileContent.length} characters</span>
        {isEditing && (
          <span>
            Press <kbd className="px-1 py-0.5 rounded bg-bg-elevated text-[10px]">Ctrl+S</kbd> to save, <kbd className="px-1 py-0.5 rounded bg-bg-elevated text-[10px]">Esc</kbd> to cancel
          </span>
        )}
      </div>
    </div>
  );
}

// Design view component
function DesignView({ node }: { node: { name: string; metadata?: { fileType?: string } } }) {
  const fileType = node.metadata?.fileType;

  return (
    <div className="h-full p-6 bg-bg-primary">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-fg-primary mb-2">Visual Preview</h3>
          <p className="text-sm text-fg-secondary">
            Design view for {node.name}
          </p>
        </div>

        {/* Visual representation based on file type */}
        {fileType === 'agent' && (
          <div className="space-y-4">
            <div className="p-6 bg-bg-secondary/50 rounded-lg border border-border-primary/50">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-lg bg-orange-500/20 flex items-center justify-center">
                  <svg className="w-6 h-6 text-orange-500" fill="currentColor" viewBox="0 0 16 16">
                    <path d="M8 2a1 1 0 011 1v1h1a1 1 0 110 2H9v1a1 1 0 11-2 0V6H6a1 1 0 110-2h1V3a1 1 0 011-1z"/>
                    <rect x="3" y="8" width="10" height="5" rx="1" opacity="0.7"/>
                  </svg>
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-fg-primary">Agent Node</h4>
                  <p className="text-xs text-fg-tertiary">Autonomous AI Agent</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-fg-tertiary">Input Channels</span>
                  <div className="mt-1 flex gap-1">
                    <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                    <div className="w-3 h-3 rounded-full bg-green-500"></div>
                  </div>
                </div>
                <div>
                  <span className="text-fg-tertiary">Output Channels</span>
                  <div className="mt-1 flex gap-1">
                    <div className="w-3 h-3 rounded-full bg-purple-500"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {fileType === 'tool' && (
          <div className="p-6 bg-bg-secondary/50 rounded-lg border border-border-primary/50">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-lg bg-purple-500/20 flex items-center justify-center">
                <svg className="w-6 h-6 text-purple-500" fill="currentColor" viewBox="0 0 16 16">
                  <path d="M11.5 2a2.5 2.5 0 00-2.45 3.01L4.5 9.56a2.5 2.5 0 102.95 2.95l4.55-4.55A2.5 2.5 0 1011.5 2z"/>
                </svg>
              </div>
              <div>
                <h4 className="text-sm font-semibold text-fg-primary">Tool Function</h4>
                <p className="text-xs text-fg-tertiary">Utility Tool</p>
              </div>
            </div>
            <div className="text-sm text-fg-secondary">
              <p className="mb-2">Available Functions:</p>
              <ul className="space-y-1 ml-4">
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent-primary"></span>
                  calculate(expression)
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent-primary"></span>
                  convert_units(value, from, to)
                </li>
              </ul>
            </div>
          </div>
        )}

        {fileType === 'skill' && (
          <div className="p-6 bg-bg-secondary/50 rounded-lg border border-border-primary/50">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-lg bg-yellow-500/20 flex items-center justify-center">
                <svg className="w-6 h-6 text-yellow-500" fill="currentColor" viewBox="0 0 16 16">
                  <path d="M8 1l2 5h5l-4 3 1.5 5L8 11l-4.5 3L5 9 1 6h5z"/>
                </svg>
              </div>
              <div>
                <h4 className="text-sm font-semibold text-fg-primary">Computational Skill</h4>
                <p className="text-xs text-fg-tertiary">Executable Node</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3 text-xs">
              <div className="p-3 bg-bg-tertiary rounded">
                <div className="text-fg-tertiary mb-1">Runtime</div>
                <div className="text-fg-primary font-medium">Python</div>
              </div>
              <div className="p-3 bg-bg-tertiary rounded">
                <div className="text-fg-tertiary mb-1">Type</div>
                <div className="text-fg-primary font-medium">Quantum</div>
              </div>
              <div className="p-3 bg-bg-tertiary rounded">
                <div className="text-fg-tertiary mb-1">Version</div>
                <div className="text-fg-primary font-medium">1.0.0</div>
              </div>
            </div>
          </div>
        )}

        {!fileType && (
          <div className="p-12 text-center bg-bg-secondary/30 rounded-lg border border-dashed border-border-primary/50">
            <svg className="w-16 h-16 mx-auto mb-4 text-fg-tertiary opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <p className="text-sm text-fg-secondary">
              No design preview available for this file type
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
