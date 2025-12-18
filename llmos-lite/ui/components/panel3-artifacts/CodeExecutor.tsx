/**
 * CodeExecutor - Execute Python/JavaScript code in artifacts
 *
 * Adds "Run" button to execute generated code safely in browser
 */

'use client';

import { useState } from 'react';
import { executePython, executeJavaScript, ExecutionResult } from '@/lib/pyodide-runtime';

interface CodeExecutorProps {
  code: string;
  language: 'python' | 'javascript';
  onResult?: (result: ExecutionResult) => void;
}

export default function CodeExecutor({ code, language, onResult }: CodeExecutorProps) {
  const [isExecuting, setIsExecuting] = useState(false);
  const [result, setResult] = useState<ExecutionResult | null>(null);
  const [showOutput, setShowOutput] = useState(false);

  const handleExecute = async () => {
    setIsExecuting(true);
    setShowOutput(true);

    try {
      let execResult: ExecutionResult;

      if (language === 'python') {
        execResult = await executePython(code);
      } else {
        execResult = await executeJavaScript(code);
      }

      setResult(execResult);
      onResult?.(execResult);
    } catch (error: any) {
      setResult({
        success: false,
        error: error.message || String(error),
        executionTime: 0,
      });
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
              Running...
            </>
          ) : (
            <>
              ▶️ Run Code
            </>
          )}
        </button>

        {result && (
          <div className="flex items-center gap-2 text-xs">
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
                {result.error}
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
