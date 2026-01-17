'use client';

import { useState } from 'react';
import { Artifact } from '@/lib/artifacts/types';
import RenderView from './RenderView';
import CodeView from './CodeView';

interface ArtifactDualViewProps {
  artifact: Artifact;
  onUpdate?: (updates: Partial<Artifact>) => void;
  onSave?: () => void;
  onFork?: () => void;
  onReference?: () => void;
  onClose?: () => void;
  defaultView?: 'render' | 'code';
}

export default function ArtifactDualView({
  artifact,
  onUpdate,
  onSave,
  onFork,
  onReference,
  onClose,
  defaultView = 'render',
}: ArtifactDualViewProps) {
  const [activeView, setActiveView] = useState<'render' | 'code'>(defaultView);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const handleCodeChange = (newCode: string) => {
    setHasUnsavedChanges(true);
    onUpdate?.({ codeView: newCode });
  };

  const handleSave = () => {
    setHasUnsavedChanges(false);
    onSave?.();
  };

  const canShowRender = artifact.renderView !== undefined;
  const canShowCode = artifact.codeView !== undefined;

  return (
    <div className="h-full flex flex-col bg-bg-secondary">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border-primary bg-bg-primary">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold text-fg-primary truncate">
              {artifact.name}
            </h2>
            <div className="flex items-center gap-3 mt-2 text-sm text-fg-tertiary flex-wrap">
              <span className="inline-flex items-center gap-1">
                <span className="text-fg-secondary">Type:</span>
                <span className="px-2 py-0.5 rounded bg-bg-tertiary text-fg-primary">
                  {artifact.type}
                </span>
              </span>
              <span>·</span>
              <span className="inline-flex items-center gap-1">
                <span className="text-fg-secondary">Volume:</span>
                <span className={`px-2 py-0.5 rounded ${
                  artifact.volume === 'system' ? 'bg-gray-500/20 text-gray-300' :
                  artifact.volume === 'team' ? 'bg-purple-500/20 text-purple-400' :
                  'bg-blue-500/20 text-blue-400'
                }`}>
                  {artifact.volume}
                </span>
              </span>
              <span>·</span>
              <span className="inline-flex items-center gap-1">
                <span className="text-fg-secondary">Status:</span>
                <span className={`px-2 py-0.5 rounded ${
                  artifact.status === 'temporal'
                    ? 'bg-yellow-500/20 text-yellow-400'
                    : 'bg-green-500/20 text-green-400'
                }`}>
                  {artifact.status === 'temporal' ? '⚠️ Temporal' : '✓ Committed'}
                </span>
              </span>
              {hasUnsavedChanges && (
                <>
                  <span>·</span>
                  <span className="text-yellow-400">⚠️ Modified</span>
                </>
              )}
            </div>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="btn-icon w-8 h-8 flex-shrink-0"
              title="Close"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* View Tabs */}
      <div className="px-6 py-3 border-b border-border-primary bg-bg-primary">
        <div className="flex items-center gap-2">
          {canShowRender && (
            <button
              onClick={() => setActiveView('render')}
              className={`
                px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200
                ${activeView === 'render'
                  ? 'bg-accent-primary text-white shadow-glow'
                  : 'text-fg-secondary hover:text-fg-primary hover:bg-bg-tertiary'
                }
              `}
            >
              <span className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                Render View
              </span>
            </button>
          )}
          {canShowCode && (
            <button
              onClick={() => setActiveView('code')}
              className={`
                px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200
                ${activeView === 'code'
                  ? 'bg-accent-primary text-white shadow-glow'
                  : 'text-fg-secondary hover:text-fg-primary hover:bg-bg-tertiary'
                }
              `}
            >
              <span className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                </svg>
                Code View
              </span>
            </button>
          )}
        </div>
      </div>

      {/* View Content */}
      <div className="flex-1 overflow-hidden">
        {activeView === 'render' && canShowRender && (
          <RenderView artifact={artifact} />
        )}
        {activeView === 'code' && canShowCode && (
          <CodeView
            artifact={artifact}
            onChange={handleCodeChange}
            readOnly={artifact.volume === 'system'}
          />
        )}
      </div>

      {/* Actions Footer */}
      <div className="px-6 py-4 border-t border-border-primary bg-bg-primary">
        <div className="flex items-center justify-between gap-4">
          {/* Left side - warnings */}
          <div className="text-sm text-fg-tertiary">
            {hasUnsavedChanges && (
              <span className="text-yellow-400">⚠️ You have unsaved changes</span>
            )}
          </div>

          {/* Right side - actions */}
          <div className="flex items-center gap-2">
            {activeView === 'code' && hasUnsavedChanges && (
              <button
                onClick={() => {
                  setHasUnsavedChanges(false);
                  // Reset to original code
                  onUpdate?.(artifact);
                }}
                className="btn-secondary px-4 py-2 text-sm"
              >
                ↩️ Revert
              </button>
            )}

            {onReference && (
              <button
                onClick={onReference}
                className="btn-secondary px-4 py-2 text-sm"
                title="Reference in chat"
              >
                🔗 Reference
              </button>
            )}

            {onFork && artifact.volume !== 'user' && (
              <button
                onClick={onFork}
                className="btn-secondary px-4 py-2 text-sm"
                title="Fork to your volume"
              >
                🍴 Fork
              </button>
            )}

            {onSave && (
              <button
                onClick={handleSave}
                disabled={!hasUnsavedChanges && artifact.status === 'committed'}
                className="btn-primary px-4 py-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                💾 {hasUnsavedChanges ? 'Save Changes' : 'Save to Volume'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
