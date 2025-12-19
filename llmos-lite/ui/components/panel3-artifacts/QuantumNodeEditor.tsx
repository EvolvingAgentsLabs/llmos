'use client';

import { useState, useEffect } from 'react';
import Editor from '@monaco-editor/react';
import { Play, Code, Cpu, Eye, EyeOff, Terminal, AlertCircle, CheckCircle } from 'lucide-react';
import { getPyodideRuntime, ExecutionResult } from '@/lib/pyodide-runtime';

export interface QuantumNodeEditorProps {
  nodeId: string;
  nodeData: {
    label: string;
    type: string;
    code: string;
    description: string;
    inputs: Array<{ name: string; type: string; value?: any }>;
    outputs: Array<{ name: string; type: string; value?: any }>;
  };
  onCodeChange?: (code: string) => void;
  onExecute?: (result: ExecutionResult) => void;
}

/**
 * Quantum Node Editor
 *
 * Features:
 * - Monaco code editor with Python syntax highlighting
 * - WebAssembly bytecode viewer
 * - Live execution and debugging
 * - Error detection and inline fixes
 * - Input/output visualization
 */
export default function QuantumNodeEditor({
  nodeId,
  nodeData,
  onCodeChange,
  onExecute,
}: QuantumNodeEditorProps) {
  const [code, setCode] = useState(nodeData.code);
  const [showWasm, setShowWasm] = useState(false);
  const [wasmCode, setWasmCode] = useState<string>('');
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionResult, setExecutionResult] = useState<ExecutionResult | null>(null);
  const [inputValues, setInputValues] = useState<Record<string, any>>({});

  // Initialize input values
  useEffect(() => {
    const initialInputs: Record<string, any> = {};
    nodeData.inputs.forEach(input => {
      initialInputs[input.name] = input.value !== undefined ? input.value : getDefaultValue(input.type);
    });
    setInputValues(initialInputs);
  }, [nodeData.inputs]);

  // Generate WebAssembly view (simulated)
  const generateWasmView = () => {
    // In a real implementation, this would compile Python to WASM
    // For now, we'll show a simulated WASM representation
    const wasmRepresentation = `
;; WebAssembly Text Format (WAT) - Simulated
;; Generated from: ${nodeData.label}

(module
  ;; Import Python runtime functions
  (import "pyodide" "call_python" (func $call_python (param i32) (result i32)))

  ;; Memory for data passing
  (memory (export "memory") 1)

  ;; Execute function - entry point
  (func $execute (param $inputs i32) (result i32)
    ;; Load input parameters
    local.get $inputs

    ;; Call Python execute function
    call $call_python

    ;; Return result pointer
  )

  ;; Export execute function
  (export "execute" (func $execute))
)

;; Disassembly preview:
;; 0x00: call_python(inputs) → result
;; 0x04: return result
;;
;; Size: ~${code.length} bytes (estimated)
;; Stack depth: 2
;; Memory usage: ${Math.ceil(code.length / 1024)}KB
    `.trim();

    setWasmCode(wasmRepresentation);
  };

  useEffect(() => {
    if (showWasm) {
      generateWasmView();
    }
  }, [showWasm, code]);

  const handleCodeChange = (value: string | undefined) => {
    if (value !== undefined) {
      setCode(value);
      onCodeChange?.(value);
    }
  };

  const handleExecute = async () => {
    setIsExecuting(true);
    setExecutionResult(null);

    try {
      const runtime = getPyodideRuntime();

      // Prepare execution code
      const executionCode = `
${code}

# Execute with inputs
result = execute(${JSON.stringify(inputValues)})
result
      `;

      const result = await runtime.executePython(executionCode);
      setExecutionResult(result);
      onExecute?.(result);
    } catch (error) {
      setExecutionResult({
        success: false,
        error: error instanceof Error ? error.message : String(error),
        executionTime: 0,
      });
    } finally {
      setIsExecuting(false);
    }
  };

  const handleInputChange = (inputName: string, value: any) => {
    setInputValues(prev => ({
      ...prev,
      [inputName]: value,
    }));
  };

  return (
    <div className="h-full flex flex-col space-y-4">
      {/* Header */}
      <div>
        <h3 className="text-sm font-medium text-terminal-accent-green mb-1">
          {nodeData.label}
        </h3>
        <p className="text-xs text-terminal-fg-secondary">
          {nodeData.description}
        </p>
        <div className="text-xs text-terminal-fg-tertiary mt-1">
          Node ID: {nodeId} | Type: {nodeData.type}
        </div>
      </div>

      {/* Inputs Section */}
      {nodeData.inputs.length > 0 && (
        <div>
          <h4 className="terminal-heading text-xs mb-2">INPUTS</h4>
          <div className="space-y-2">
            {nodeData.inputs.map((input, index) => (
              <div key={index} className="flex items-center gap-2">
                <span className="text-xs text-terminal-fg-secondary w-24">
                  {input.name}:
                </span>
                <input
                  type="text"
                  value={inputValues[input.name] || ''}
                  onChange={(e) => handleInputChange(input.name, e.target.value)}
                  className="terminal-input text-xs flex-1 py-1 px-2"
                  placeholder={input.type}
                />
                <span className="text-xs text-terminal-fg-tertiary font-mono">
                  {input.type}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Code Editor Tabs */}
      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex items-center justify-between mb-2">
          <div className="flex gap-2">
            <button
              onClick={() => setShowWasm(false)}
              className={`flex items-center gap-1 text-xs py-1 px-3 rounded ${
                !showWasm
                  ? 'bg-terminal-accent-green text-terminal-bg-primary'
                  : 'bg-terminal-bg-secondary text-terminal-fg-secondary hover:bg-terminal-bg-tertiary'
              }`}
            >
              <Code className="w-3 h-3" />
              Python Code
            </button>
            <button
              onClick={() => setShowWasm(true)}
              className={`flex items-center gap-1 text-xs py-1 px-3 rounded ${
                showWasm
                  ? 'bg-terminal-accent-blue text-terminal-bg-primary'
                  : 'bg-terminal-bg-secondary text-terminal-fg-secondary hover:bg-terminal-bg-tertiary'
              }`}
            >
              <Cpu className="w-3 h-3" />
              WebAssembly View
            </button>
          </div>

          <button
            onClick={handleExecute}
            disabled={isExecuting}
            className="btn-terminal text-xs py-1 px-3 flex items-center gap-1"
          >
            <Play className="w-3 h-3" />
            {isExecuting ? 'Running...' : 'Test Run'}
          </button>
        </div>

        {/* Editor */}
        <div className="flex-1 border border-terminal-border rounded overflow-hidden">
          {!showWasm ? (
            <Editor
              height="100%"
              defaultLanguage="python"
              value={code}
              onChange={handleCodeChange}
              theme="vs-dark"
              options={{
                minimap: { enabled: false },
                fontSize: 12,
                lineNumbers: 'on',
                scrollBeyondLastLine: false,
                automaticLayout: true,
                tabSize: 4,
                insertSpaces: true,
              }}
            />
          ) : (
            <div className="h-full bg-terminal-bg-primary p-4 overflow-auto">
              <pre className="text-xs font-mono text-terminal-accent-blue">
                {wasmCode}
              </pre>
            </div>
          )}
        </div>
      </div>

      {/* Execution Results */}
      {executionResult && (
        <div className="space-y-2">
          <h4 className="terminal-heading text-xs">EXECUTION RESULT</h4>

          {/* Status */}
          <div className="flex items-center gap-2">
            {executionResult.success ? (
              <CheckCircle className="w-4 h-4 text-terminal-accent-green" />
            ) : (
              <AlertCircle className="w-4 h-4 text-terminal-accent-pink" />
            )}
            <span className={`text-xs ${
              executionResult.success
                ? 'text-terminal-accent-green'
                : 'text-terminal-accent-pink'
            }`}>
              {executionResult.success ? 'Success' : 'Error'}
            </span>
            <span className="text-xs text-terminal-fg-tertiary">
              {executionResult.executionTime.toFixed(0)}ms
            </span>
          </div>

          {/* Output */}
          {executionResult.success && executionResult.output && (
            <div>
              <div className="text-xs text-terminal-fg-secondary mb-1">Output:</div>
              <div className="code-block text-xs p-2 overflow-auto max-h-40">
                <pre className="text-terminal-accent-blue">
                  {typeof executionResult.output === 'object'
                    ? JSON.stringify(executionResult.output, null, 2)
                    : String(executionResult.output)}
                </pre>
              </div>
            </div>
          )}

          {/* Stdout */}
          {executionResult.stdout && (
            <div>
              <div className="text-xs text-terminal-fg-secondary mb-1">Console Output:</div>
              <div className="code-block text-xs p-2 overflow-auto max-h-32">
                <pre className="text-terminal-fg-secondary">
                  {executionResult.stdout}
                </pre>
              </div>
            </div>
          )}

          {/* Error */}
          {executionResult.error && (
            <div>
              <div className="text-xs text-terminal-accent-pink mb-1">Error:</div>
              <div className="code-block text-xs p-2 overflow-auto max-h-32 border-terminal-accent-pink">
                <pre className="text-terminal-accent-pink">
                  {executionResult.error}
                </pre>
              </div>
              <button className="btn-terminal-secondary text-xs py-1 px-2 mt-2">
                Auto-Fix Error
              </button>
            </div>
          )}

          {/* Images */}
          {executionResult.images && executionResult.images.length > 0 && (
            <div>
              <div className="text-xs text-terminal-fg-secondary mb-1">
                Generated Images:
              </div>
              <div className="space-y-2">
                {executionResult.images.map((img, idx) => (
                  <img
                    key={idx}
                    src={`data:image/png;base64,${img}`}
                    alt={`Output ${idx + 1}`}
                    className="border border-terminal-border rounded"
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Output Values */}
      {nodeData.outputs.length > 0 && (
        <div>
          <h4 className="terminal-heading text-xs mb-2">EXPECTED OUTPUTS</h4>
          <div className="space-y-2">
            {nodeData.outputs.map((output, index) => (
              <div key={index} className="flex items-center gap-2">
                <span className="text-xs text-terminal-fg-secondary w-24">
                  {output.name}:
                </span>
                <div className="terminal-input text-xs flex-1 py-1 px-2 bg-terminal-bg-primary">
                  {output.value !== undefined
                    ? String(output.value)
                    : `<${output.type}>`}
                </div>
                <span className="text-xs text-terminal-fg-tertiary font-mono">
                  {output.type}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function getDefaultValue(type: string): any {
  switch (type) {
    case 'number':
      return 0;
    case 'string':
      return '';
    case 'boolean':
      return false;
    case 'ndarray':
      return '[]';
    default:
      return null;
  }
}
