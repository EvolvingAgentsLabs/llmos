/**
 * Three.js Canvas - Interactive 3D visualization component
 *
 * Features:
 * - Code editor + live 3D preview
 * - Three.js code execution
 * - OrbitControls for camera interaction
 * - Automatic cleanup and error handling
 */

'use client';

import { useState, useEffect, useRef } from 'react';
import { ThreeJSRuntime, validateThreeJSCode, getThreeJSTemplate } from '@/lib/threejs-runtime';

interface ThreeJSCanvasProps {
  initialCode?: string;
  onCodeChange?: (code: string) => void;
}

export default function ThreeJSCanvas({ initialCode, onCodeChange }: ThreeJSCanvasProps) {
  const [code, setCode] = useState(initialCode || getThreeJSTemplate());
  const [isExecuting, setIsExecuting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCode, setShowCode] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const runtimeRef = useRef<ThreeJSRuntime | null>(null);

  // Execute code
  const execute = async () => {
    if (!canvasRef.current) {
      setError('Canvas not available');
      return;
    }

    setIsExecuting(true);
    setError(null);

    try {
      // Validate code
      const validation = validateThreeJSCode(code);
      if (!validation.valid) {
        setError(`Validation errors:\n${validation.errors.join('\n')}`);
        setIsExecuting(false);
        return;
      }

      // Show warnings
      if (validation.warnings.length > 0) {
        console.warn('[ThreeJSCanvas] Warnings:', validation.warnings);
      }

      // Clean up previous runtime
      if (runtimeRef.current) {
        runtimeRef.current.dispose();
      }

      // Create new runtime and execute
      runtimeRef.current = new ThreeJSRuntime(canvasRef.current);
      const result = await runtimeRef.current.execute(code);

      if (!result.success) {
        setError(result.error || 'Execution failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsExecuting(false);
    }
  };

  // Execute on mount and code changes
  useEffect(() => {
    const timer = setTimeout(() => {
      execute();
    }, 500);

    return () => clearTimeout(timer);
  }, [code]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (runtimeRef.current) {
        runtimeRef.current.dispose();
      }
    };
  }, []);

  const handleCodeChange = (newCode: string) => {
    setCode(newCode);
    onCodeChange?.(newCode);
  };

  return (
    <div className="h-full flex flex-col bg-bg-primary">
      {/* Header */}
      <div className="px-4 py-2 border-b border-border-primary/50 bg-bg-secondary/30 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-fg-primary">Three.js Canvas</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent-info/20 text-accent-info">
            JavaScript
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCode(!showCode)}
            className="px-2 py-1 text-xs rounded bg-bg-tertiary hover:bg-bg-elevated text-fg-secondary hover:text-fg-primary transition-colors"
          >
            {showCode ? 'Hide Code' : 'Show Code'}
          </button>

          <button
            onClick={execute}
            disabled={isExecuting}
            className="px-3 py-1 text-xs rounded bg-accent-primary hover:bg-accent-primary/90 text-white transition-colors disabled:opacity-50"
          >
            {isExecuting ? 'Running...' : '▶ Run'}
          </button>

          <button
            onClick={() => handleCodeChange(getThreeJSTemplate())}
            className="px-2 py-1 text-xs rounded bg-bg-tertiary hover:bg-bg-elevated text-fg-secondary hover:text-fg-primary transition-colors"
          >
            Reset
          </button>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Code Editor (collapsible) */}
        {showCode && (
          <div className="w-1/2 border-r border-border-primary/50 flex flex-col">
            <div className="px-3 py-1.5 border-b border-border-primary/30 bg-bg-secondary/20">
              <span className="text-[10px] font-semibold text-fg-tertiary uppercase tracking-wide">
                Code
              </span>
            </div>
            <textarea
              value={code}
              onChange={(e) => handleCodeChange(e.target.value)}
              className="flex-1 w-full p-4 bg-bg-primary text-fg-primary font-mono text-sm resize-none focus:outline-none"
              placeholder="// Write Three.js code here..."
              spellCheck={false}
            />
          </div>
        )}

        {/* 3D Preview */}
        <div className="flex-1 flex flex-col">
          <div className="px-3 py-1.5 border-b border-border-primary/30 bg-bg-secondary/20">
            <span className="text-[10px] font-semibold text-fg-tertiary uppercase tracking-wide">
              3D Preview
            </span>
          </div>

          <div className="flex-1 relative bg-bg-primary">
            {error ? (
              <div className="absolute inset-0 flex items-center justify-center p-4">
                <div className="max-w-md p-4 bg-accent-error/10 border border-accent-error/30 rounded-lg">
                  <div className="text-sm font-semibold text-accent-error mb-2">Execution Error</div>
                  <pre className="text-xs text-accent-error whitespace-pre-wrap font-mono">
                    {error}
                  </pre>
                </div>
              </div>
            ) : isExecuting ? (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="flex items-center gap-3">
                  <div className="w-5 h-5 border-2 border-accent-primary border-t-transparent rounded-full animate-spin" />
                  <span className="text-sm text-fg-secondary">Rendering...</span>
                </div>
              </div>
            ) : null}

            <canvas
              ref={canvasRef}
              className="w-full h-full"
              style={{ display: 'block' }}
            />
          </div>

          {/* Instructions */}
          <div className="px-3 py-2 border-t border-border-primary/30 bg-bg-secondary/20">
            <p className="text-[10px] text-fg-tertiary">
              💡 Use mouse to rotate (left click), pan (right click), and zoom (scroll wheel)
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
