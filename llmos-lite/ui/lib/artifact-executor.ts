/**
 * Artifact Executor
 *
 * Executes code artifacts in sandboxed environments:
 * - JavaScript: QuickJS-WASM (fully isolated)
 * - Python: Pyodide (browser-based)
 */

import { getWASMRuntime, ExecutionResult as WASMResult } from './kernel/wasm-runtime';
import { injectKernelAPI } from './kernel/kernel-api';
import { executePython, ExecutionResult as PyodideResult } from './pyodide-runtime';

export interface ExecutionOptions {
  timeout?: number;
  memoryLimit?: number;
  globals?: Record<string, any>;
}

export interface ExecutionResult {
  success: boolean;
  output?: any;
  stdout?: string;
  stderr?: string;
  error?: string;
  executionTime: number;
  memoryUsed?: number;
}

/**
 * Execute JavaScript code in WASM sandbox
 */
export async function executeJavaScript(
  code: string,
  artifactId: string = 'temp',
  options: ExecutionOptions = {}
): Promise<ExecutionResult> {
  try {
    // Get WASM runtime from kernel
    const runtime = await getWASMRuntime();

    // Inject kernel APIs for this artifact
    await injectKernelAPI(runtime, artifactId);

    // Execute code in sandbox
    const result: WASMResult = await runtime.execute(code, {
      timeout: options.timeout || 5000,
      memoryLimit: options.memoryLimit || 50 * 1024 * 1024, // 50MB default
    });

    if (result.success) {
      return {
        success: true,
        output: result.result,
        stdout: result.logs.join('\n'),
        stderr: result.stderr.join('\n'),
        executionTime: result.executionTime,
        memoryUsed: result.memoryUsed,
      };
    } else {
      return {
        success: false,
        error: result.error?.message || 'Execution failed',
        stdout: result.logs.join('\n'),
        stderr: result.stderr.join('\n'),
        executionTime: result.executionTime,
        memoryUsed: result.memoryUsed,
      };
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      executionTime: 0,
    };
  }
}

/**
 * Execute Python code in Pyodide
 */
export async function executePythonCode(
  code: string,
  options: ExecutionOptions = {}
): Promise<ExecutionResult> {
  try {
    const result: PyodideResult = await executePython(code, options);

    return {
      success: result.success || false,
      output: result.output,
      stdout: result.stdout,
      stderr: result.stderr,
      error: result.error,
      executionTime: result.executionTime,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      executionTime: 0,
    };
  }
}

/**
 * Execute code artifact based on language
 */
export async function executeArtifact(
  code: string,
  language: 'javascript' | 'python',
  artifactId: string = 'temp',
  options: ExecutionOptions = {}
): Promise<ExecutionResult> {
  if (language === 'javascript') {
    return executeJavaScript(code, artifactId, options);
  } else {
    return executePythonCode(code, options);
  }
}

/**
 * Check if kernel is ready for execution
 */
export function isKernelReady(): boolean {
  if (typeof window === 'undefined') return false;

  const kernel = (window as any).__LLMOS_KERNEL__;
  return kernel?.status === 'ready' && kernel?.modules?.wasm?.status === 'ready';
}

/**
 * Get kernel status information
 */
export function getKernelStatus(): any {
  if (typeof window === 'undefined') return null;

  const kernel = (window as any).__LLMOS_KERNEL__;
  if (!kernel) return null;

  return {
    version: kernel.version,
    status: kernel.status,
    modules: {
      wasm: kernel.modules?.wasm?.status || 'not loaded',
      python: kernel.modules?.python?.status || 'not loaded',
      stdlib: kernel.modules?.stdlib?.status || 'not loaded',
    },
    bootDuration: kernel.bootDuration,
  };
}
