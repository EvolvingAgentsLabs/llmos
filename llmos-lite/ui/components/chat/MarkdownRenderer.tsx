/**
 * MarkdownRenderer - Render markdown with syntax highlighting and code execution
 *
 * Features:
 * - Markdown parsing with react-markdown
 * - Syntax highlighting with rehype-highlight
 * - Executable code blocks for Python
 * - Image display support
 */

'use client';

import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import rehypeRaw from 'rehype-raw';
import type { ExecutionResult } from '@/lib/pyodide-runtime';

interface MarkdownRendererProps {
  content: string;
  enableCodeExecution?: boolean;
  onExecutionStart?: (status: string) => void;
  onExecutionEnd?: () => void;
  onExecutionStatusChange?: (status: string) => void;
}

interface CodeBlockProps {
  node?: any;
  inline?: boolean;
  className?: string;
  children?: React.ReactNode;
  enableExecution?: boolean;
  onExecutionStart?: (status: string) => void;
  onExecutionEnd?: () => void;
  onExecutionStatusChange?: (status: string) => void;
}

function CodeBlock({ inline, className, children, enableExecution, onExecutionStart, onExecutionEnd, onExecutionStatusChange }: CodeBlockProps) {
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionStatus, setExecutionStatus] = useState<string>('');
  const [result, setResult] = useState<ExecutionResult | null>(null);
  const [showOutput, setShowOutput] = useState(false);
  const [showCode, setShowCode] = useState(false); // Default: show visual output, hide code
  const [hasAutoExecuted, setHasAutoExecuted] = useState(false);
  const [validationResult, setValidationResult] = useState<any>(null);

  const match = /language-(\w+)/.exec(className || '');
  const language = match ? match[1] : '';

  // Fix: Properly extract text content from React children
  const extractTextContent = (node: React.ReactNode): string => {
    if (typeof node === 'string') return node;
    if (typeof node === 'number') return String(node);
    if (Array.isArray(node)) return node.map(extractTextContent).join('');
    if (node && typeof node === 'object' && 'props' in node) {
      return extractTextContent((node as any).props.children);
    }
    return '';
  };

  const codeString = extractTextContent(children).replace(/\n$/, '');

  // Check if this is an executable language
  const isExecutable = enableExecution && (language === 'python' || language === 'py');

  const handleExecute = async () => {
    setIsExecuting(true);
    setShowOutput(true);
    setExecutionStatus('Validating code...');
    onExecutionStart?.('Validating code...');

    try {
      // Validate code before execution
      const { validateCode } = await import('@/lib/runtime-capabilities');
      const validation = validateCode(codeString);
      setValidationResult(validation);

      if (!validation.valid) {
        setExecutionStatus('Validation failed');
        onExecutionStatusChange?.('Validation failed');
        // Show validation errors without executing
        setResult({
          success: false,
          error: `Code validation failed:\n\n${validation.errors.join('\n')}\n\n${
            validation.suggestions.length > 0
              ? `Suggestions:\n${validation.suggestions.join('\n')}`
              : ''
          }`,
          executionTime: 0,
        });
        setIsExecuting(false);
        setExecutionStatus('');
        onExecutionEnd?.();
        return;
      }

      // Check if quantum code
      const isQuantumCode = codeString.includes('qiskit') || codeString.includes('QuantumCircuit');
      const hasMatplotlib = codeString.includes('matplotlib') || codeString.includes('plt.');

      if (isQuantumCode) {
        setExecutionStatus('Loading quantum simulator...');
        onExecutionStatusChange?.('Loading quantum simulator...');
      } else if (hasMatplotlib) {
        setExecutionStatus('Loading visualization libraries...');
        onExecutionStatusChange?.('Loading visualization libraries...');
      } else {
        setExecutionStatus('Initializing Python runtime...');
        onExecutionStatusChange?.('Initializing Python runtime...');
      }

      // Dynamic import to avoid SSR/bundling issues
      const { executePython } = await import('@/lib/pyodide-runtime');

      setExecutionStatus('Executing code...');
      onExecutionStatusChange?.('Executing code...');
      const execResult = await executePython(codeString);

      if (execResult.images && execResult.images.length > 0) {
        setExecutionStatus('Rendering visualizations...');
        onExecutionStatusChange?.('Rendering visualizations...');
      } else {
        setExecutionStatus('Processing results...');
        onExecutionStatusChange?.('Processing results...');
      }

      setResult(execResult);

      // Show warnings even on success
      if (validation.warnings.length > 0 && execResult.success) {
        const warningMessage = `Warnings:\n${validation.warnings.join('\n')}`;
        execResult.stderr = execResult.stderr
          ? `${execResult.stderr}\n\n${warningMessage}`
          : warningMessage;
      }

      setExecutionStatus('');
    } catch (error: any) {
      setExecutionStatus('Execution error');
      onExecutionStatusChange?.('Execution error');
      setResult({
        success: false,
        error: error.message || String(error),
        executionTime: 0,
      });
    } finally {
      setIsExecuting(false);
      setTimeout(() => {
        setExecutionStatus('');
        onExecutionEnd?.();
      }, 1000);
    }
  };

  // Auto-execute Python code blocks on mount
  useEffect(() => {
    if (isExecutable && !hasAutoExecuted && !isExecuting) {
      console.log('[MarkdownRenderer] Auto-executing Python code block');
      setHasAutoExecuted(true);
      // Use setTimeout to avoid blocking the render
      setTimeout(() => {
        handleExecute();
      }, 100);
    }
  }, [isExecutable, hasAutoExecuted, isExecuting]);

  if (inline) {
    return <code className={className}>{children}</code>;
  }

  // Determine if we have visual output to show
  const hasVisualOutput = result?.success && (result?.images?.length || 0) > 0;

  return (
    <div className="my-4 rounded-lg overflow-hidden border border-border-primary">
      {/* Header with controls */}
      <div className="flex items-center justify-between px-4 py-2 bg-bg-secondary border-b border-border-primary">
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono text-fg-tertiary uppercase">
            {language || 'code'}
          </span>
          {isExecutable && hasVisualOutput && (
            <div className="flex items-center gap-1 bg-bg-tertiary rounded px-2 py-0.5">
              <button
                onClick={() => setShowCode(false)}
                className={`px-2 py-0.5 text-xs rounded transition-colors ${
                  !showCode
                    ? 'bg-accent-primary text-white'
                    : 'text-fg-tertiary hover:text-fg-primary'
                }`}
              >
                Visual
              </button>
              <button
                onClick={() => setShowCode(true)}
                className={`px-2 py-0.5 text-xs rounded transition-colors ${
                  showCode
                    ? 'bg-accent-primary text-white'
                    : 'text-fg-tertiary hover:text-fg-primary'
                }`}
              >
                Code
              </button>
            </div>
          )}
        </div>
        {isExecutable && (
          <button
            onClick={handleExecute}
            disabled={isExecuting}
            className={`px-3 py-1 text-xs rounded transition-colors flex items-center gap-2 ${
              isExecuting
                ? 'bg-bg-tertiary text-fg-tertiary cursor-not-allowed'
                : 'bg-accent-success/20 text-accent-success hover:bg-accent-success/30 border border-accent-success/50'
            }`}
          >
            {isExecuting ? (
              <>
                <div className="w-3 h-3 border-2 border-accent-success border-t-transparent rounded-full animate-spin" />
                Running...
              </>
            ) : (
              <>
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Re-run
              </>
            )}
          </button>
        )}
      </div>

      {/* Visual output or code based on toggle */}
      {isExecutable && hasVisualOutput && !showCode ? (
        // Show visual output by default
        <div className="p-4 bg-bg-primary space-y-3">
          {result.images && result.images.length > 0 && (
            <div className="space-y-3">
              {result.images.map((img, idx) => (
                <div key={idx} className="bg-bg-secondary p-3 rounded-lg">
                  <img
                    src={`data:image/png;base64,${img}`}
                    alt={`Output ${idx + 1}`}
                    className="max-w-full h-auto rounded border border-border-primary mx-auto"
                  />
                </div>
              ))}
            </div>
          )}
          {isExecuting && (
            <div className="flex flex-col items-center justify-center py-8 space-y-3">
              <div className="flex items-center gap-3 text-fg-tertiary">
                <div className="w-5 h-5 border-2 border-accent-primary border-t-transparent rounded-full animate-spin" />
                <span className="text-sm font-medium">{executionStatus || 'Processing...'}</span>
              </div>
              {/* Progress steps visualization */}
              <div className="flex items-center gap-2 text-xs text-fg-muted">
                <div className={`px-2 py-1 rounded ${executionStatus.includes('Validating') ? 'bg-accent-primary/20 text-accent-primary' : 'bg-bg-tertiary text-fg-tertiary'}`}>
                  Validate
                </div>
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                <div className={`px-2 py-1 rounded ${executionStatus.includes('Loading') ? 'bg-accent-primary/20 text-accent-primary' : 'bg-bg-tertiary text-fg-tertiary'}`}>
                  Load
                </div>
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                <div className={`px-2 py-1 rounded ${executionStatus.includes('Executing') ? 'bg-accent-primary/20 text-accent-primary' : 'bg-bg-tertiary text-fg-tertiary'}`}>
                  Execute
                </div>
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                <div className={`px-2 py-1 rounded ${executionStatus.includes('Rendering') || executionStatus.includes('Processing') ? 'bg-accent-primary/20 text-accent-primary' : 'bg-bg-tertiary text-fg-tertiary'}`}>
                  Render
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        // Show code when toggled or no visual output
        <>
          <pre className="!my-0 !bg-bg-primary overflow-x-auto">
            <code className={className}>{children}</code>
          </pre>
          {/* Show execution progress overlay for code view */}
          {isExecuting && (
            <div className="border-t border-border-primary bg-bg-tertiary p-4">
              <div className="flex items-center gap-3">
                <div className="w-4 h-4 border-2 border-accent-primary border-t-transparent rounded-full animate-spin" />
                <div className="flex-1">
                  <div className="text-sm font-medium text-fg-primary">{executionStatus || 'Processing...'}</div>
                  {/* Progress steps */}
                  <div className="flex items-center gap-2 mt-2 text-xs">
                    <div className={`px-2 py-0.5 rounded ${executionStatus.includes('Validating') ? 'bg-accent-primary/20 text-accent-primary' : executionStatus ? 'bg-accent-success/20 text-accent-success' : 'bg-bg-secondary text-fg-tertiary'}`}>
                      {executionStatus.includes('Validating') ? '⏳' : '✓'} Validate
                    </div>
                    <div className={`px-2 py-0.5 rounded ${executionStatus.includes('Loading') ? 'bg-accent-primary/20 text-accent-primary' : executionStatus.includes('Executing') || executionStatus.includes('Rendering') || executionStatus.includes('Processing') ? 'bg-accent-success/20 text-accent-success' : 'bg-bg-secondary text-fg-tertiary'}`}>
                      {executionStatus.includes('Loading') ? '⏳' : executionStatus.includes('Executing') || executionStatus.includes('Rendering') || executionStatus.includes('Processing') ? '✓' : '⋯'} Load
                    </div>
                    <div className={`px-2 py-0.5 rounded ${executionStatus.includes('Executing') ? 'bg-accent-primary/20 text-accent-primary' : executionStatus.includes('Rendering') || executionStatus.includes('Processing') ? 'bg-accent-success/20 text-accent-success' : 'bg-bg-secondary text-fg-tertiary'}`}>
                      {executionStatus.includes('Executing') ? '⏳' : executionStatus.includes('Rendering') || executionStatus.includes('Processing') ? '✓' : '⋯'} Execute
                    </div>
                    <div className={`px-2 py-0.5 rounded ${executionStatus.includes('Rendering') || executionStatus.includes('Processing') ? 'bg-accent-primary/20 text-accent-primary' : 'bg-bg-secondary text-fg-tertiary'}`}>
                      {executionStatus.includes('Rendering') || executionStatus.includes('Processing') ? '⏳' : '⋯'} Render
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Additional output details (console, return values, errors) - shown when in visual mode or when explicitly showing output */}
      {showOutput && result && !hasVisualOutput && (
        <div className="border-t border-border-primary bg-bg-tertiary">
          <div className="flex items-center justify-between px-4 py-2 bg-bg-secondary border-b border-border-primary">
            <div className="flex items-center gap-2 text-xs">
              <span className={result.success ? 'text-accent-success' : 'text-accent-error'}>
                {result.success ? (
                  <svg className="w-4 h-4 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                )}
              </span>
              <span className="text-fg-secondary">
                {result.success ? 'Execution successful' : 'Execution failed'}
              </span>
              <span className="text-fg-tertiary">
                ({result.executionTime.toFixed(0)}ms)
              </span>
            </div>
            <button
              onClick={() => setShowOutput(false)}
              className="text-xs text-fg-tertiary hover:text-fg-primary"
            >
              Close
            </button>
          </div>

          <div className="p-4 space-y-3 max-h-96 overflow-y-auto">
            {result.success ? (
              <>
                {/* Return value */}
                {result.output !== undefined && result.output !== null && (
                  <div className="space-y-1">
                    <div className="text-xs font-semibold text-accent-success">Return Value:</div>
                    <pre className="text-xs text-fg-primary bg-bg-primary p-3 rounded overflow-auto">
                      {typeof result.output === 'object'
                        ? JSON.stringify(result.output, null, 2)
                        : String(result.output)}
                    </pre>
                  </div>
                )}

                {/* Console output */}
                {result.stdout && (
                  <div className="space-y-1">
                    <div className="text-xs font-semibold text-accent-info">Console Output:</div>
                    <pre className="text-xs text-fg-secondary bg-bg-primary p-3 rounded overflow-auto whitespace-pre-wrap">
                      {result.stdout}
                    </pre>
                  </div>
                )}

                {/* Warnings */}
                {result.stderr && (
                  <div className="space-y-1">
                    <div className="text-xs font-semibold text-accent-warning">Warnings:</div>
                    <pre className="text-xs text-accent-warning bg-bg-primary p-3 rounded overflow-auto whitespace-pre-wrap">
                      {result.stderr}
                    </pre>
                  </div>
                )}
              </>
            ) : (
              <div className="space-y-3">
                {/* Error */}
                <div className="space-y-1">
                  <div className="text-xs font-semibold text-accent-error">Error:</div>
                  <pre className="text-xs text-accent-error bg-bg-primary p-3 rounded overflow-auto whitespace-pre-wrap">
                    {result.error}
                  </pre>
                </div>

                {/* Output before error */}
                {result.stdout && (
                  <div className="space-y-1">
                    <div className="text-xs font-semibold text-fg-tertiary">Output before error:</div>
                    <pre className="text-xs text-fg-secondary bg-bg-primary p-3 rounded overflow-auto whitespace-pre-wrap">
                      {result.stdout}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Show additional metadata in visual mode (console output, return values) */}
      {hasVisualOutput && !showCode && result && (result.stdout || result.stderr || (result.output !== undefined && result.output !== null)) && (
        <div className="border-t border-border-primary bg-bg-tertiary p-4 space-y-2">
          {/* Return value */}
          {result.output !== undefined && result.output !== null && (
            <div className="space-y-1">
              <div className="text-xs font-semibold text-accent-info">Return Value:</div>
              <pre className="text-xs text-fg-primary bg-bg-primary p-2 rounded overflow-auto">
                {typeof result.output === 'object'
                  ? JSON.stringify(result.output, null, 2)
                  : String(result.output)}
              </pre>
            </div>
          )}

          {/* Console output */}
          {result.stdout && (
            <div className="space-y-1">
              <div className="text-xs font-semibold text-accent-info">Console Output:</div>
              <pre className="text-xs text-fg-secondary bg-bg-primary p-2 rounded overflow-auto whitespace-pre-wrap">
                {result.stdout}
              </pre>
            </div>
          )}

          {/* Warnings */}
          {result.stderr && (
            <div className="space-y-1">
              <div className="text-xs font-semibold text-accent-warning">Warnings:</div>
              <pre className="text-xs text-accent-warning bg-bg-primary p-2 rounded overflow-auto whitespace-pre-wrap">
                {result.stderr}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function MarkdownRenderer({ content, enableCodeExecution = true, onExecutionStart, onExecutionEnd, onExecutionStatusChange }: MarkdownRendererProps) {
  console.log('[MarkdownRenderer] Rendering with content length:', content?.length || 0);
  console.log('[MarkdownRenderer] Content preview:', content?.substring(0, 100));

  return (
    <div className="markdown-content">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight, rehypeRaw]}
        components={{
          code: (props) => <CodeBlock {...props} enableExecution={enableCodeExecution} onExecutionStart={onExecutionStart} onExecutionEnd={onExecutionEnd} onExecutionStatusChange={onExecutionStatusChange} />,
          // Custom image renderer to handle base64 images
          img: ({ node, ...props }) => (
            <img
              {...props}
              className="max-w-full h-auto rounded-lg border border-border-primary my-4"
              loading="lazy"
            />
          ),
          // Custom link renderer with security
          a: ({ node, ...props }) => (
            <a
              {...props}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent-primary hover:text-accent-secondary underline transition-colors"
            />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
