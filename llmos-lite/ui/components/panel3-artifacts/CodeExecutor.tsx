/**
 * CodeExecutor - Execute Python/JavaScript code in artifacts
 *
 * Adds "Run" button to execute generated code safely in browser
 * Now with supervised execution and self-correction!
 */

'use client';

import { useState } from 'react';
import { executeArtifact, ExecutionResult, isKernelReady } from '@/lib/artifact-executor';
import { executeWithSupervision, SupervisedExecutionResult } from '@/lib/kernel/supervised-execution';
import RefinementProgress from '@/components/kernel/RefinementProgress';

interface CodeExecutorProps {
  code: string;
  language: 'python' | 'javascript';
  enableSelfCorrection?: boolean;
  onResult?: (result: ExecutionResult) => void;
}

export default function CodeExecutor({ code, language, enableSelfCorrection = true, onResult }: CodeExecutorProps) {
  const [isExecuting, setIsExecuting] = useState(false);
  const [result, setResult] = useState<SupervisedExecutionResult | null>(null);
  const [showOutput, setShowOutput] = useState(false);

  // Refinement state
  const [isRefining, setIsRefining] = useState(false);
  const [refinementStatus, setRefinementStatus] = useState('');
  const [currentAttempt, setCurrentAttempt] = useState(0);
  const [maxAttempts, setMaxAttempts] = useState(3);

  const handleExecute = async () => {
    setIsExecuting(true);
    setShowOutput(true);
    setIsRefining(false);
    setCurrentAttempt(0);

    try {
      // Check if kernel is ready for JavaScript execution
      if (language === 'javascript' && !isKernelReady()) {
        setResult({
          success: false,
          error: 'Kernel not ready. Please wait for system to boot.',
          executionTime: 0,
          wasRefined: false,
          refinementAttempts: 0,
        });
        setIsExecuting(false);
        return;
      }

      const artifactId = `artifact-${Date.now()}`;

      // Execute with supervision if enabled
      let execResult: SupervisedExecutionResult;

      if (enableSelfCorrection) {
        execResult = await executeWithSupervision(
          code,
          language,
          artifactId,
          {
            enableSelfCorrection: true,
            maxRetries: maxAttempts,
            onProgress: (status, attempt, total) => {
              setCurrentAttempt(attempt);
              setRefinementStatus(status);
              setIsRefining(attempt > 1 && attempt < total);
            },
          }
        );
      } else {
        // Non-supervised execution
        const basicResult = await executeArtifact(code, language, artifactId);
        execResult = {
          ...basicResult,
          wasRefined: false,
          refinementAttempts: 0,
        };
      }

      setResult(execResult);
      setIsRefining(false);
      onResult?.(execResult);
    } catch (error: any) {
      setResult({
        success: false,
        error: error.message || String(error),
        executionTime: 0,
        wasRefined: false,
        refinementAttempts: 0,
      });
      setIsRefining(false);
    } finally {
      setIsExecuting(false);
    }
  };

  return (
    <div className="border-t border-terminal-border bg-terminal-bg-primary">
      {/* Control bar */}
      <div className="flex items-center justify-between p-2">
        <button
          onClick={handleExecute}
          disabled={isExecuting}
          className={`px-3 py-1 text-xs rounded transition-colors flex items-center gap-2 ${
            isExecuting
              ? 'bg-terminal-bg-tertiary text-terminal-fg-tertiary cursor-not-allowed'
              : 'bg-terminal-accent-green text-terminal-bg-primary hover:bg-terminal-accent-green/80'
          }`}
        >
          {isExecuting ? (
            <>
              <span className="animate-spin">⚙️</span>
              {isRefining ? 'Refining...' : 'Running...'}
            </>
          ) : (
            <>
              ▶️ Run Code {enableSelfCorrection && '(with Self-Correction)'}
            </>
          )}
        </button>

        {result && (
          <div className="flex items-center gap-2 text-xs">
            {result.wasRefined && (
              <span className="text-terminal-accent-purple">
                🔧 Refined
              </span>
            )}
            <span className={result.success ? 'text-terminal-accent-green' : 'text-red-400'}>
              {result.success ? '✓ Success' : '✗ Error'}
            </span>
            <span className="text-terminal-fg-tertiary">
              {result.executionTime.toFixed(0)}ms
            </span>
            <button
              onClick={() => setShowOutput(!showOutput)}
              className="text-terminal-accent-blue hover:underline"
            >
              {showOutput ? 'Hide' : 'Show'} Output
            </button>
          </div>
        )}
      </div>

      {/* Refinement progress */}
      {(isRefining || (result?.wasRefined && result?.refinementHistory)) && (
        <div className="p-3 border-t border-terminal-border">
          <RefinementProgress
            isRefining={isRefining}
            currentAttempt={currentAttempt}
            maxAttempts={maxAttempts}
            status={refinementStatus}
            refinementHistory={result?.refinementHistory}
          />
        </div>
      )}

      {/* Output panel */}
      {showOutput && result && (
        <div className="border-t border-terminal-border p-3 bg-terminal-bg-secondary">
          {result.success ? (
            <div className="space-y-2">
              {result.output !== undefined && (
                <div>
                  <div className="text-xs text-terminal-accent-green mb-1">Result:</div>
                  <pre className="text-xs text-terminal-fg-primary bg-terminal-bg-tertiary p-2 rounded overflow-auto max-h-40">
                    {typeof result.output === 'object'
                      ? JSON.stringify(result.output, null, 2)
                      : String(result.output)}
                  </pre>
                </div>
              )}

              {result.stdout && (
                <div>
                  <div className="text-xs text-terminal-accent-blue mb-1">Console Output:</div>
                  <pre className="text-xs text-terminal-fg-secondary bg-terminal-bg-tertiary p-2 rounded overflow-auto max-h-40">
                    {result.stdout}
                  </pre>
                </div>
              )}

              {result.stderr && (
                <div>
                  <div className="text-xs text-yellow-400 mb-1">Warnings:</div>
                  <pre className="text-xs text-yellow-300 bg-terminal-bg-tertiary p-2 rounded overflow-auto max-h-40">
                    {result.stderr}
                  </pre>
                </div>
              )}
            </div>
          ) : (
            <div>
              <div className="text-xs text-red-400 mb-1">Error:</div>
              <pre className="text-xs text-red-300 bg-terminal-bg-tertiary p-2 rounded overflow-auto max-h-40">
                {result.error || 'Unknown error'}
              </pre>

              {result.stdout && (
                <div className="mt-2">
                  <div className="text-xs text-terminal-accent-blue mb-1">Output before error:</div>
                  <pre className="text-xs text-terminal-fg-secondary bg-terminal-bg-tertiary p-2 rounded overflow-auto max-h-40">
                    {result.stdout}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
