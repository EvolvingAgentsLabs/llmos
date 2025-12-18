/**
 * Pyodide Runtime - WebAssembly Python execution in browser
 *
 * Safe, sandboxed Python execution for tools and agents
 * No file system access, no network access (except explicit fetch)
 */

import { PyodideInterface, loadPyodide } from 'pyodide';

export interface ExecutionResult {
  success: boolean;
  output?: any;
  stdout?: string;
  stderr?: string;
  error?: string;
  executionTime: number;
}

export interface ExecutionOptions {
  timeout?: number; // milliseconds
  packages?: string[]; // Additional packages to load
  globals?: Record<string, any>; // Global variables
}

class PyodideRuntime {
  private pyodide: PyodideInterface | null = null;
  private isLoading = false;
  private loadPromise: Promise<void> | null = null;

  /**
   * Initialize Pyodide (lazy load)
   */
  async initialize(): Promise<void> {
    if (this.pyodide) return;

    if (this.isLoading && this.loadPromise) {
      return this.loadPromise;
    }

    this.isLoading = true;
    this.loadPromise = this._loadPyodide();

    try {
      await this.loadPromise;
    } finally {
      this.isLoading = false;
    }
  }

  private async _loadPyodide(): Promise<void> {
    try {
      console.log('Loading Pyodide...');
      this.pyodide = await loadPyodide({
        indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.25.0/full/',
      });

      // Set up stdout/stderr capture
      await this.pyodide.runPythonAsync(`
import sys
from io import StringIO

class OutputCapture:
    def __init__(self):
        self.stdout = StringIO()
        self.stderr = StringIO()
        self._stdout = sys.stdout
        self._stderr = sys.stderr

    def start(self):
        sys.stdout = self.stdout
        sys.stderr = self.stderr

    def stop(self):
        sys.stdout = self._stdout
        sys.stderr = self._stderr
        stdout_val = self.stdout.getvalue()
        stderr_val = self.stderr.getvalue()
        self.stdout = StringIO()
        self.stderr = StringIO()
        return stdout_val, stderr_val

_output_capture = OutputCapture()
      `);

      console.log('✓ Pyodide loaded successfully');
    } catch (error) {
      console.error('Failed to load Pyodide:', error);
      throw new Error(`Pyodide initialization failed: ${error}`);
    }
  }

  /**
   * Check if Pyodide is ready
   */
  isReady(): boolean {
    return this.pyodide !== null;
  }

  /**
   * Execute Python code safely
   */
  async executePython(
    code: string,
    options: ExecutionOptions = {}
  ): Promise<ExecutionResult> {
    const startTime = performance.now();

    try {
      // Initialize if needed
      if (!this.pyodide) {
        await this.initialize();
      }

      if (!this.pyodide) {
        throw new Error('Pyodide not initialized');
      }

      // Load additional packages
      if (options.packages && options.packages.length > 0) {
        await this.pyodide.loadPackage(options.packages);
      }

      // Set global variables
      if (options.globals) {
        for (const [key, value] of Object.entries(options.globals)) {
          this.pyodide.globals.set(key, value);
        }
      }

      // Start output capture
      await this.pyodide.runPythonAsync('_output_capture.start()');

      // Execute with timeout
      const timeoutMs = options.timeout || 30000; // 30 seconds default
      const result = await this._executeWithTimeout(code, timeoutMs);

      // Stop output capture
      const captureResult = await this.pyodide.runPythonAsync(
        '_output_capture.stop()'
      );
      const [stdout, stderr] = captureResult.toJs();

      const executionTime = performance.now() - startTime;

      return {
        success: true,
        output: result,
        stdout: stdout || undefined,
        stderr: stderr || undefined,
        executionTime,
      };
    } catch (error: any) {
      const executionTime = performance.now() - startTime;

      // Try to capture any output before error
      let stdout = '';
      let stderr = '';
      try {
        if (this.pyodide) {
          const captureResult = await this.pyodide.runPythonAsync(
            '_output_capture.stop()'
          );
          [stdout, stderr] = captureResult.toJs();
        }
      } catch {
        // Ignore capture errors
      }

      return {
        success: false,
        error: error.message || String(error),
        stdout: stdout || undefined,
        stderr: stderr || undefined,
        executionTime,
      };
    }
  }

  private async _executeWithTimeout(
    code: string,
    timeoutMs: number
  ): Promise<any> {
    if (!this.pyodide) throw new Error('Pyodide not initialized');

    return Promise.race([
      this.pyodide.runPythonAsync(code),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Execution timeout')), timeoutMs)
      ),
    ]);
  }

  /**
   * Execute JavaScript code safely
   */
  async executeJavaScript(
    code: string,
    options: ExecutionOptions = {}
  ): Promise<ExecutionResult> {
    const startTime = performance.now();

    try {
      // Create sandboxed context
      const sandbox: any = {
        console: {
          log: (...args: any[]) => console.log('[Sandbox]', ...args),
          error: (...args: any[]) => console.error('[Sandbox]', ...args),
          warn: (...args: any[]) => console.warn('[Sandbox]', ...args),
        },
        Math,
        JSON,
        Date,
        ...(options.globals || {}),
      };

      // Capture console output
      const logs: string[] = [];
      const errors: string[] = [];

      sandbox.console.log = (...args: any[]) => {
        logs.push(args.map(String).join(' '));
      };
      sandbox.console.error = (...args: any[]) => {
        errors.push(args.map(String).join(' '));
      };

      // Create function with sandboxed globals
      const sandboxKeys = Object.keys(sandbox);
      const sandboxValues = sandboxKeys.map(key => sandbox[key]);

      const fn = new Function(...sandboxKeys, `
        "use strict";
        return (async () => {
          ${code}
        })();
      `);

      // Execute with timeout
      const timeoutMs = options.timeout || 30000;
      const result = await Promise.race([
        fn(...sandboxValues),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Execution timeout')), timeoutMs)
        ),
      ]);

      const executionTime = performance.now() - startTime;

      return {
        success: true,
        output: result,
        stdout: logs.length > 0 ? logs.join('\n') : undefined,
        stderr: errors.length > 0 ? errors.join('\n') : undefined,
        executionTime,
      };
    } catch (error: any) {
      const executionTime = performance.now() - startTime;

      return {
        success: false,
        error: error.message || String(error),
        executionTime,
      };
    }
  }

  /**
   * Load packages for future use
   */
  async loadPackages(packages: string[]): Promise<void> {
    if (!this.pyodide) {
      await this.initialize();
    }

    if (!this.pyodide) {
      throw new Error('Pyodide not initialized');
    }

    await this.pyodide.loadPackage(packages);
  }

  /**
   * Check if a package is available
   */
  async isPackageAvailable(packageName: string): Promise<boolean> {
    if (!this.pyodide) return false;

    try {
      await this.pyodide.runPythonAsync(`import ${packageName}`);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    this.pyodide = null;
  }
}

// Singleton instance
let runtimeInstance: PyodideRuntime | null = null;

/**
 * Get the shared Pyodide runtime instance
 */
export function getPyodideRuntime(): PyodideRuntime {
  if (!runtimeInstance) {
    runtimeInstance = new PyodideRuntime();
  }
  return runtimeInstance;
}

/**
 * Convenience function to execute Python code
 */
export async function executePython(
  code: string,
  options?: ExecutionOptions
): Promise<ExecutionResult> {
  const runtime = getPyodideRuntime();
  return runtime.executePython(code, options);
}

/**
 * Convenience function to execute JavaScript code
 */
export async function executeJavaScript(
  code: string,
  options?: ExecutionOptions
): Promise<ExecutionResult> {
  const runtime = getPyodideRuntime();
  return runtime.executeJavaScript(code, options);
}

/**
 * Initialize Pyodide early (optional, for better UX)
 */
export async function warmupRuntime(): Promise<void> {
  const runtime = getPyodideRuntime();
  await runtime.initialize();
}
