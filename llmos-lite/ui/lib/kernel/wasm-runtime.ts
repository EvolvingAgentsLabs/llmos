/**
 * WASM Runtime (QuickJS)
 *
 * Provides sandboxed JavaScript execution using QuickJS-WASM.
 * Artifacts run in complete isolation with controlled access to host APIs.
 */

import { getQuickJS, QuickJSContext, QuickJSHandle, QuickJSRuntime } from 'quickjs-emscripten';

export interface ExecutionOptions {
  timeout?: number; // Max execution time in ms
  memoryLimit?: number; // Max memory in bytes
  cpuLimit?: number; // Max CPU instructions
}

export interface ExecutionResult {
  success: boolean;
  result?: any;
  error?: {
    message: string;
    stack?: string;
    line?: number;
    column?: number;
  };
  logs: string[];
  stderr: string[];
  executionTime: number;
  memoryUsed: number;
}

export interface RuntimeState {
  variables: Record<string, any>;
  memoryUsage: number;
  instructionCount?: number;
}

/**
 * WASM Runtime Manager
 */
export class WASMRuntime {
  private runtime: QuickJSRuntime | null = null;
  private context: QuickJSContext | null = null;
  private logs: string[] = [];
  private stderr: string[] = [];
  private isInitialized = false;

  /**
   * Initialize the WASM runtime
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.warn('[WASM] Already initialized');
      return;
    }

    try {
      console.log('[WASM] Initializing QuickJS...');
      const QuickJS = await getQuickJS();

      // Create runtime with memory limit
      this.runtime = QuickJS.newRuntime();

      // Set memory limit (128MB by default)
      this.runtime.setMemoryLimit(128 * 1024 * 1024);

      // Create execution context
      this.context = this.runtime.newContext();

      // Setup console interception
      this.setupConsole();

      this.isInitialized = true;
      console.log('[WASM] QuickJS initialized successfully');

    } catch (error) {
      console.error('[WASM] Initialization failed:', error);
      throw error;
    }
  }

  /**
   * Execute JavaScript code in the sandbox
   */
  async execute(code: string, options: ExecutionOptions = {}): Promise<ExecutionResult> {
    if (!this.isInitialized || !this.context) {
      throw new Error('WASM runtime not initialized');
    }

    // Clear logs
    this.logs = [];
    this.stderr = [];

    const startTime = performance.now();
    const startMemory = this.getMemoryUsage();

    try {
      // Set timeout if specified
      if (options.timeout) {
        this.runtime?.setInterruptHandler(() => {
          const elapsed = performance.now() - startTime;
          return elapsed > options.timeout!;
        });
      }

      // Evaluate the code
      const result = this.context.evalCode(code, 'artifact.js');

      if (result.error) {
        // Handle execution error
        const error = this.context.dump(result.error);
        result.error.dispose();

        return {
          success: false,
          error: {
            message: error.message || String(error),
            stack: error.stack,
            line: error.lineNumber,
            column: error.columnNumber,
          },
          logs: this.logs,
          stderr: this.stderr,
          executionTime: performance.now() - startTime,
          memoryUsed: this.getMemoryUsage() - startMemory,
        };
      }

      // Success - extract result
      const value = this.context.dump(result.value);
      result.value.dispose();

      return {
        success: true,
        result: value,
        logs: this.logs,
        stderr: this.stderr,
        executionTime: performance.now() - startTime,
        memoryUsed: this.getMemoryUsage() - startMemory,
      };

    } catch (error) {
      return {
        success: false,
        error: {
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        },
        logs: this.logs,
        stderr: this.stderr,
        executionTime: performance.now() - startTime,
        memoryUsed: this.getMemoryUsage() - startMemory,
      };
    }
  }

  /**
   * Inject a global variable or function into the context
   */
  injectGlobal(name: string, value: any): void {
    if (!this.context) {
      throw new Error('WASM runtime not initialized');
    }

    const handle = this.context.unwrapResult(
      this.context.evalCode(`(${JSON.stringify(value)})`)
    );

    this.context.setProp(this.context.global, name, handle);
    handle.dispose();
  }

  /**
   * Inject a function that can be called from the sandbox
   */
  injectFunction(name: string, fn: (...args: any[]) => any): void {
    if (!this.context) {
      throw new Error('WASM runtime not initialized');
    }

    const fnHandle = this.context.newFunction(name, (...args) => {
      // Convert QuickJS handles to JavaScript values
      const jsArgs = args.map(arg => this.context!.dump(arg));

      try {
        // Call the host function
        const result = fn(...jsArgs);

        // Convert result back to QuickJS handle
        if (result === undefined) {
          return this.context!.undefined;
        } else if (result === null) {
          return this.context!.null;
        } else if (typeof result === 'number') {
          return this.context!.newNumber(result);
        } else if (typeof result === 'string') {
          return this.context!.newString(result);
        } else if (typeof result === 'boolean') {
          return result ? this.context!.true : this.context!.false;
        } else {
          // Complex objects - serialize as JSON
          const jsonStr = JSON.stringify(result);
          return this.context!.unwrapResult(
            this.context!.evalCode(`(${jsonStr})`)
          );
        }
      } catch (error) {
        // Return error to sandbox
        return this.context!.newError(
          error instanceof Error ? error.message : String(error)
        );
      }
    });

    this.context.setProp(this.context.global, name, fnHandle);
    fnHandle.dispose();
  }

  /**
   * Setup console interception
   */
  private setupConsole(): void {
    if (!this.context) return;

    // Inject console.log
    this.injectFunction('__console_log', (...args: any[]) => {
      const message = args.map(a => String(a)).join(' ');
      this.logs.push(message);
      console.log('[Artifact]', message);
    });

    // Inject console.warn
    this.injectFunction('__console_warn', (...args: any[]) => {
      const message = args.map(a => String(a)).join(' ');
      this.logs.push(`WARN: ${message}`);
      console.warn('[Artifact]', message);
    });

    // Inject console.error
    this.injectFunction('__console_error', (...args: any[]) => {
      const message = args.map(a => String(a)).join(' ');
      this.stderr.push(message);
      console.error('[Artifact]', message);
    });

    // Create console object in sandbox
    this.context.evalCode(`
      const console = {
        log: __console_log,
        warn: __console_warn,
        error: __console_error,
        info: __console_log,
        debug: __console_log
      };
    `);
  }

  /**
   * Get current runtime state
   */
  getState(): RuntimeState {
    if (!this.context) {
      return {
        variables: {},
        memoryUsage: 0,
      };
    }

    // Get all global variables
    const globalsHandle = this.context.global;
    const globals = this.context.dump(globalsHandle);

    return {
      variables: globals,
      memoryUsage: this.getMemoryUsage(),
    };
  }

  /**
   * Get memory usage in bytes
   */
  private getMemoryUsage(): number {
    if (!this.runtime) return 0;

    try {
      const stats = this.runtime.computeMemoryUsage();
      // QuickJS returns an object with various memory stats
      // Access the correct property based on the QuickJS API
      return (stats as any)?.memory_used_size || 0;
    } catch (error) {
      // If computeMemoryUsage fails or stats format is different, return 0
      console.warn('[WASM] Could not get memory usage:', error);
      return 0;
    }
  }

  /**
   * Get logs
   */
  getLogs(): string[] {
    return [...this.logs];
  }

  /**
   * Get stderr
   */
  getStderr(): string[] {
    return [...this.stderr];
  }

  /**
   * Clear logs
   */
  clearLogs(): void {
    this.logs = [];
    this.stderr = [];
  }

  /**
   * Reset the context (clear all variables)
   */
  reset(): void {
    if (!this.runtime || !this.context) return;

    // Dispose current context
    this.context.dispose();

    // Create new context
    this.context = this.runtime.newContext();

    // Re-setup console
    this.setupConsole();

    // Clear logs
    this.clearLogs();

    console.log('[WASM] Context reset');
  }

  /**
   * Dispose the runtime (cleanup)
   */
  dispose(): void {
    if (this.context) {
      this.context.dispose();
      this.context = null;
    }

    if (this.runtime) {
      this.runtime.dispose();
      this.runtime = null;
    }

    this.isInitialized = false;
    console.log('[WASM] Runtime disposed');
  }

  /**
   * Check if runtime is ready
   */
  isReady(): boolean {
    return this.isInitialized && this.context !== null;
  }
}

// Singleton instance
let wasmInstance: WASMRuntime | null = null;

/**
 * Get or create the global WASM runtime instance
 */
export async function getWASMRuntime(): Promise<WASMRuntime> {
  if (!wasmInstance) {
    wasmInstance = new WASMRuntime();
    await wasmInstance.initialize();
  }
  return wasmInstance;
}

/**
 * Execute code in the WASM sandbox (convenience function)
 */
export async function executeInWASM(
  code: string,
  options: ExecutionOptions = {}
): Promise<ExecutionResult> {
  const runtime = await getWASMRuntime();
  return runtime.execute(code, options);
}
