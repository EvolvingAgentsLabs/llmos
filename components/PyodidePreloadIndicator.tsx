'use client';

import { useState, useEffect } from 'react';
import { getPyodidePreloader, PreloadProgress } from '@/lib/pyodide-preloader';

interface PyodidePreloadIndicatorProps {
  autoStart?: boolean;
  showWhenComplete?: boolean;
}

/**
 * PyodidePreloadIndicator - Shows Pyodide loading progress
 *
 * Features:
 * - Progress bar with stage information
 * - Package loading status
 * - Auto-dismisses when complete
 * - Can be triggered manually or on mount
 *
 * Usage:
 * ```tsx
 * <PyodidePreloadIndicator autoStart={true} />
 * ```
 */
export default function PyodidePreloadIndicator({
  autoStart = false,
  showWhenComplete = false,
}: PyodidePreloadIndicatorProps) {
  const [progress, setProgress] = useState<PreloadProgress>({
    stage: 'idle',
    progress: 0,
    message: 'Initializing...',
  });
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const preloader = getPyodidePreloader();

    // Subscribe to progress updates
    const unsubscribe = preloader.onProgress((p) => {
      setProgress(p);

      // Auto-hide after completion if configured
      if (p.stage === 'complete' && !showWhenComplete) {
        setTimeout(() => setIsVisible(false), 2000);
      }
    });

    // Auto-start preloading if configured
    if (autoStart) {
      preloader.preload().catch((error) => {
        console.error('Preload failed:', error);
      });
    }

    return unsubscribe;
  }, [autoStart, showWhenComplete]);

  if (!isVisible) {
    return null;
  }

  if (progress.stage === 'idle') {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 bg-terminal-bg-primary border border-terminal-border rounded-lg shadow-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-3 bg-terminal-bg-secondary border-b border-terminal-border">
        <div className="flex items-center gap-2">
          {progress.stage === 'complete' ? (
            <span className="text-terminal-accent-green">✓</span>
          ) : progress.stage === 'error' ? (
            <span className="text-terminal-accent-red">✗</span>
          ) : (
            <div className="animate-spin h-4 w-4 border-2 border-terminal-accent-green border-t-transparent rounded-full" />
          )}
          <span className="text-terminal-fg-primary text-sm font-mono">
            {progress.stage === 'complete'
              ? 'Runtime Ready'
              : progress.stage === 'error'
              ? 'Load Failed'
              : 'Loading Runtime'}
          </span>
        </div>
        <button
          onClick={() => setIsVisible(false)}
          className="text-terminal-fg-tertiary hover:text-terminal-fg-primary transition-colors"
        >
          ×
        </button>
      </div>

      {/* Progress bar */}
      <div className="p-3">
        <div className="mb-2">
          <div className="h-2 bg-terminal-bg-tertiary rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-300 rounded-full ${
                progress.stage === 'error'
                  ? 'bg-terminal-accent-red'
                  : progress.stage === 'complete'
                  ? 'bg-terminal-accent-green'
                  : 'bg-terminal-accent-blue'
              }`}
              style={{ width: `${progress.progress}%` }}
            />
          </div>
        </div>

        {/* Status message */}
        <div className="text-terminal-fg-secondary text-xs font-mono">
          {progress.message}
          {progress.currentPackage && (
            <span className="text-terminal-accent-blue ml-1">
              ({progress.currentPackage})
            </span>
          )}
        </div>

        {/* Error message */}
        {progress.error && (
          <div className="mt-2 p-2 bg-terminal-bg-tertiary border border-terminal-accent-red rounded text-terminal-accent-red text-xs font-mono">
            {progress.error}
          </div>
        )}

        {/* Progress percentage */}
        <div className="mt-2 text-right text-terminal-fg-tertiary text-xs font-mono">
          {progress.progress.toFixed(0)}%
        </div>
      </div>
    </div>
  );
}

/**
 * Compact version for header/navbar
 */
export function PyodidePreloadBadge() {
  const [progress, setProgress] = useState<PreloadProgress>({
    stage: 'idle',
    progress: 0,
    message: '',
  });

  useEffect(() => {
    const preloader = getPyodidePreloader();
    const unsubscribe = preloader.onProgress(setProgress);
    return unsubscribe;
  }, []);

  if (progress.stage === 'idle' || progress.stage === 'complete') {
    return null;
  }

  return (
    <div className="flex items-center gap-2 px-3 py-1 bg-terminal-bg-secondary border border-terminal-border rounded-full">
      {progress.stage === 'error' ? (
        <span className="text-terminal-accent-red text-xs">✗</span>
      ) : (
        <div className="animate-spin h-3 w-3 border-2 border-terminal-accent-green border-t-transparent rounded-full" />
      )}
      <span className="text-terminal-fg-secondary text-xs font-mono">
        {progress.progress.toFixed(0)}%
      </span>
    </div>
  );
}
