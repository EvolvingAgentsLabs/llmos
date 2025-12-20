'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { Artifact } from '@/lib/artifacts/types';

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
  readOnly?: boolean;
}

export default function CodeView({
  artifact,
  onChange,
  readOnly = false,
}: CodeViewProps) {
  const [code, setCode] = useState(artifact.codeView || '');

  useEffect(() => {
    setCode(artifact.codeView || '');
  }, [artifact.codeView]);

  const handleChange = (value: string | undefined) => {
    if (value !== undefined && !readOnly) {
      setCode(value);
      onChange?.(value);
    }
  };

  const getLanguage = () => {
    if (artifact.type === 'code' && artifact.language) {
      return artifact.language;
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

  if (!artifact.codeView) {
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

  return (
    <div className="h-full flex flex-col">
      {/* Editor toolbar */}
      <div className="px-4 py-2 border-b border-border-primary bg-bg-tertiary/50 flex items-center justify-between">
        <div className="flex items-center gap-3 text-sm text-fg-tertiary">
          <span className="font-mono">{getLanguage()}</span>
          {readOnly && (
            <>
              <span>·</span>
              <span className="text-yellow-400">🔒 Read-only</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              navigator.clipboard.writeText(code);
            }}
            className="btn-icon w-7 h-7"
            title="Copy code"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </button>
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
            readOnly,
            minimap: { enabled: code.split('\n').length > 50 },
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
            renderLineHighlight: 'all',
            scrollbar: {
              verticalScrollbarSize: 10,
              horizontalScrollbarSize: 10,
            },
          }}
        />
      </div>

      {/* Line count */}
      <div className="px-4 py-1 border-t border-border-primary bg-bg-tertiary/50 text-xs text-fg-tertiary">
        {code.split('\n').length} lines, {code.length} characters
      </div>
    </div>
  );
}
