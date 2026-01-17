'use client';

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { Artifact, CodeArtifact } from '@/lib/artifacts/types';

// Dynamically import Monaco Editor to avoid SSR issues
const MonacoEditor = dynamic(() => import('@monaco-editor/react'), {
  ssr: false,
  loading: () => (
    <div className="h-full flex items-center justify-center">
      <div className="text-fg-tertiary">Loading editor...</div>
    </div>
  ),
});

interface CodeViewProps {
  artifact: Artifact;
  onChange?: (code: string) => void;
  onSave?: (code: string) => void;
  readOnly?: boolean;
  showToolbar?: boolean;
}

export default function CodeView({
  artifact,
  onChange,
  onSave,
  readOnly = false,
}: CodeViewProps) {
  const [code, setCode] = useState(artifact.codeView || '');
  const [originalCode, setOriginalCode] = useState(artifact.codeView || '');
  const [isEditing, setIsEditing] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [copied, setCopied] = useState(false);

  // Sync with artifact changes
  useEffect(() => {
    setCode(artifact.codeView || '');
    setOriginalCode(artifact.codeView || '');
    setIsDirty(false);
  }, [artifact.codeView, artifact.id]);

  const handleChange = useCallback((value: string | undefined) => {
    if (value !== undefined && isEditing) {
      setCode(value);
      setIsDirty(value !== originalCode);
      onChange?.(value);
    }
  }, [isEditing, originalCode, onChange]);

  const handleSave = useCallback(() => {
    if (isDirty && onSave) {
      onSave(code);
      setOriginalCode(code);
      setIsDirty(false);
    }
  }, [code, isDirty, onSave]);

  const handleCancel = useCallback(() => {
    setCode(originalCode);
    setIsDirty(false);
    setIsEditing(false);
  }, [originalCode]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [code]);

  // Keyboard shortcut for save
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

  const getLanguage = () => {
    // Type guard and language detection for code artifacts
    if (artifact.type === 'code') {
      const codeArtifact = artifact as CodeArtifact;
      if (codeArtifact.language) {
        return codeArtifact.language;
      }
    }

    // Infer from artifact type
    switch (artifact.type) {
      case 'agent':
      case 'workflow':
        return 'json';
      case 'tool':
      case 'code':
        return 'python';
      case 'skill':
        return 'markdown';
      default:
        return 'plaintext';
    }
  };

  if (!artifact.codeView && !isEditing) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <div className="text-center">
          <div className="text-6xl mb-4">📝</div>
          <p className="text-fg-secondary">
            No code available for this artifact
          </p>
          {artifact.renderView && (
            <p className="text-sm text-fg-tertiary mt-2">
              Switch to Render View to see the visualization
            </p>
          )}
        </div>
      </div>
    );
  }

  const lineCount = code.split('\n').length;

  return (
    <div className="h-full flex flex-col">
      {/* Editor toolbar */}
      <div className="px-4 py-2 border-b border-border-primary bg-bg-tertiary/50 flex items-center justify-between">
        <div className="flex items-center gap-3 text-sm text-fg-tertiary">
          <span className="font-mono">{getLanguage()}</span>
          {!readOnly && (
            <>
              <span>·</span>
              {isEditing ? (
                <span className="text-accent-primary flex items-center gap-1">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  Editing
                </span>
              ) : (
                <span className="text-fg-tertiary">Read-only</span>
              )}
              {isDirty && (
                <>
                  <span>·</span>
                  <span className="text-yellow-400 flex items-center gap-1">
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                      <circle cx="12" cy="12" r="6" />
                    </svg>
                    Unsaved
                  </span>
                </>
              )}
            </>
          )}
          {readOnly && (
            <>
              <span>·</span>
              <span className="text-yellow-400 flex items-center gap-1">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                Read-only
              </span>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Copy button */}
          <button
            onClick={handleCopy}
            className="btn-icon w-7 h-7 relative"
            title="Copy code"
          >
            {copied ? (
              <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            )}
          </button>

          {/* Edit/Save/Cancel buttons */}
          {!readOnly && (
            <>
              {isEditing ? (
                <>
                  {/* Cancel button */}
                  <button
                    onClick={handleCancel}
                    className="px-3 py-1 text-xs rounded bg-bg-tertiary text-fg-secondary hover:bg-bg-elevated hover:text-fg-primary transition-colors"
                    title="Cancel (Esc)"
                  >
                    Cancel
                  </button>
                  {/* Save button */}
                  <button
                    onClick={handleSave}
                    disabled={!isDirty}
                    className={`px-3 py-1 text-xs rounded transition-colors flex items-center gap-1 ${
                      isDirty
                        ? 'bg-accent-primary/20 text-accent-primary hover:bg-accent-primary/30 border border-accent-primary/30'
                        : 'bg-bg-tertiary text-fg-tertiary cursor-not-allowed'
                    }`}
                    title="Save (Ctrl+S)"
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Save
                  </button>
                </>
              ) : (
                /* Edit button */
                <button
                  onClick={() => setIsEditing(true)}
                  className="px-3 py-1 text-xs rounded bg-bg-tertiary text-fg-secondary hover:bg-bg-elevated hover:text-fg-primary transition-colors flex items-center gap-1"
                  title="Edit"
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
      <div className="flex-1 overflow-hidden">
        <MonacoEditor
          height="100%"
          language={getLanguage()}
          value={code}
          onChange={handleChange}
          theme="vs-dark"
          options={{
            readOnly: readOnly || !isEditing,
            minimap: { enabled: lineCount > 50 },
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
            // Visual feedback for edit mode
            cursorStyle: isEditing ? 'line' : 'line-thin',
            cursorBlinking: isEditing ? 'blink' : 'solid',
          }}
        />
      </div>

      {/* Line count and status */}
      <div className="px-4 py-1 border-t border-border-primary bg-bg-tertiary/50 text-xs text-fg-tertiary flex items-center justify-between">
        <span>{lineCount} lines, {code.length} characters</span>
        {isEditing && (
          <span className="text-fg-tertiary">
            Press <kbd className="px-1 py-0.5 rounded bg-bg-elevated text-[10px]">Ctrl+S</kbd> to save, <kbd className="px-1 py-0.5 rounded bg-bg-elevated text-[10px]">Esc</kbd> to cancel
          </span>
        )}
      </div>
    </div>
  );
}
