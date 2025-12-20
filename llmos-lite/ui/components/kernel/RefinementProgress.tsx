/**
 * Refinement Progress Component
 *
 * Displays visual feedback during LLM-powered code refinement.
 * Shows current attempt, status, and refinement history.
 */

'use client';

import { useState, useEffect } from 'react';

interface RefinementAttempt {
  attempt: number;
  error: string;
  refinedCode: string;
  explanation: string;
}

interface RefinementProgressProps {
  isRefining: boolean;
  currentAttempt: number;
  maxAttempts: number;
  status: string;
  refinementHistory?: RefinementAttempt[];
  onCancel?: () => void;
}

export default function RefinementProgress({
  isRefining,
  currentAttempt,
  maxAttempts,
  status,
  refinementHistory = [],
  onCancel,
}: RefinementProgressProps) {
  const [expandedAttempt, setExpandedAttempt] = useState<number | null>(null);

  if (!isRefining && refinementHistory.length === 0) {
    return null;
  }

  const progress = (currentAttempt / maxAttempts) * 100;

  return (
    <div className="border border-terminal-border rounded bg-terminal-bg-secondary p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isRefining && (
            <div className="w-4 h-4 border-2 border-terminal-accent-blue border-t-transparent rounded-full animate-spin" />
          )}
          <span className="text-sm font-semibold text-terminal-fg-primary">
            {isRefining ? 'Self-Correction Active' : 'Refinement Complete'}
          </span>
        </div>
        {onCancel && isRefining && (
          <button
            onClick={onCancel}
            className="text-xs text-terminal-fg-tertiary hover:text-red-400 transition-colors"
          >
            Cancel
          </button>
        )}
      </div>

      {/* Progress bar */}
      {isRefining && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-terminal-fg-secondary">
              Attempt {currentAttempt} of {maxAttempts}
            </span>
            <span className="text-terminal-fg-tertiary">{Math.round(progress)}%</span>
          </div>
          <div className="h-1.5 bg-terminal-bg-tertiary rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-terminal-accent-blue to-terminal-accent-purple transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Current status */}
      {isRefining && (
        <div className="flex items-start gap-2 p-3 bg-terminal-bg-tertiary rounded">
          <div className="text-terminal-accent-blue text-lg">⚙️</div>
          <div className="flex-1">
            <div className="text-sm text-terminal-fg-primary">{status}</div>
            <div className="text-xs text-terminal-fg-tertiary mt-1">
              The system is analyzing the error and requesting a corrected version from the LLM...
            </div>
          </div>
        </div>
      )}

      {/* Refinement history */}
      {refinementHistory.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-semibold text-terminal-fg-secondary uppercase">
            Refinement History
          </div>

          {refinementHistory.map((attempt) => (
            <div
              key={attempt.attempt}
              className="border border-terminal-border rounded overflow-hidden"
            >
              {/* Attempt header */}
              <button
                onClick={() =>
                  setExpandedAttempt(expandedAttempt === attempt.attempt ? null : attempt.attempt)
                }
                className="w-full flex items-center justify-between p-3 bg-terminal-bg-tertiary hover:bg-terminal-bg-primary transition-colors text-left"
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-terminal-accent-blue">
                    #{attempt.attempt}
                  </span>
                  <span className="text-sm text-terminal-fg-primary">
                    {attempt.explanation.substring(0, 60)}
                    {attempt.explanation.length > 60 ? '...' : ''}
                  </span>
                </div>
                <svg
                  className={`w-4 h-4 text-terminal-fg-tertiary transition-transform ${
                    expandedAttempt === attempt.attempt ? 'rotate-180' : ''
                  }`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* Expanded details */}
              {expandedAttempt === attempt.attempt && (
                <div className="p-3 space-y-3 bg-terminal-bg-primary border-t border-terminal-border">
                  {/* Error */}
                  <div>
                    <div className="text-xs font-semibold text-red-400 mb-1">Original Error:</div>
                    <pre className="text-xs text-red-300 bg-terminal-bg-secondary p-2 rounded overflow-auto">
                      {attempt.error}
                    </pre>
                  </div>

                  {/* Explanation */}
                  <div>
                    <div className="text-xs font-semibold text-terminal-accent-green mb-1">
                      What was fixed:
                    </div>
                    <div className="text-xs text-terminal-fg-secondary bg-terminal-bg-secondary p-2 rounded">
                      {attempt.explanation}
                    </div>
                  </div>

                  {/* Refined code */}
                  <div>
                    <div className="text-xs font-semibold text-terminal-accent-blue mb-1">
                      Refined Code:
                    </div>
                    <pre className="text-xs text-terminal-fg-primary bg-terminal-bg-secondary p-2 rounded overflow-auto max-h-40">
                      {attempt.refinedCode}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Summary */}
      {!isRefining && refinementHistory.length > 0 && (
        <div className="flex items-center gap-2 p-2 bg-terminal-accent-green/10 rounded border border-terminal-accent-green/30">
          <span className="text-terminal-accent-green text-lg">✓</span>
          <span className="text-xs text-terminal-accent-green">
            Code successfully refined after {refinementHistory.length} attempt
            {refinementHistory.length > 1 ? 's' : ''}
          </span>
        </div>
      )}
    </div>
  );
}
