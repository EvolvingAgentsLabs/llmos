/**
 * Rust/WASM Tool Integration
 *
 * Provides infrastructure for loading and executing Rust-compiled WASM
 * modules as high-performance tools for agents.
 *
 * Philosophy:
 * - Agents remain markdown files (evolvable, human-readable)
 * - Performance-critical tools can be Rust/WASM modules
 * - Hybrid execution: TypeScript orchestration + Rust computation
 *
 * Use cases for Rust/WASM tools:
 * - Heavy data processing (parsing, transformation)
 * - Signal processing (FFT, filters)
 * - Cryptographic operations
 * - Complex mathematical computations
 * - Real-time simulations
 */

// =============================================================================
// Types
// =============================================================================

export interface WASMToolDefinition {
  name: string;
  description: string;
  wasmModule: string;  // Path to .wasm file or base64 encoded
  inputSchema: WASMToolSchema;
  outputSchema: WASMToolSchema;
  functions: WASMFunctionBinding[];
}

export interface WASMToolSchema {
  type: 'json' | 'binary' | 'typed-array';
  schema?: Record<string, any>;  // JSON Schema if type is 'json'
  arrayType?: 'Float32' | 'Float64' | 'Int32' | 'Uint8';  // If typed-array
}

export interface WASMFunctionBinding {
  name: string;
  exportName: string;  // Name in WASM exports
  description: string;
  parameters: WASMParameter[];
  returns: WASMReturnType;
}

export interface WASMParameter {
  name: string;
  type: 'i32' | 'i64' | 'f32' | 'f64' | 'pointer';
  description: string;
}

export interface WASMReturnType {
  type: 'i32' | 'i64' | 'f32' | 'f64' | 'pointer' | 'void';
  description: string;
}

export interface WASMToolResult {
  success: boolean;
  output?: any;
  error?: string;
  executionTime: number;
  memoryUsed?: number;
}

// =============================================================================
// WASM Tool Module Loader
// =============================================================================

export class WASMToolLoader {
  private loadedModules: Map<string, WebAssembly.Instance> = new Map();
  private memoryInstances: Map<string, WebAssembly.Memory> = new Map();

  /**
   * Load a WASM module from URL or base64
   */
  async loadModule(
    name: string,
    source: string | Uint8Array
  ): Promise<WebAssembly.Instance> {
    // Check cache
    const cached = this.loadedModules.get(name);
    if (cached) {
      return cached;
    }

    let wasmBytes: Uint8Array;

    if (typeof source === 'string') {
      if (source.startsWith('data:') || source.startsWith('http')) {
        // Fetch from URL
        const response = await fetch(source);
        wasmBytes = new Uint8Array(await response.arrayBuffer());
      } else {
        // Assume base64
        wasmBytes = this.base64ToUint8Array(source);
      }
    } else {
      wasmBytes = source;
    }

    // Create memory for the module
    const memory = new WebAssembly.Memory({
      initial: 256,  // 16MB initial
      maximum: 1024, // 64MB max
    });

    // Compile and instantiate
    // Use buffer.slice to create a clean ArrayBuffer compatible with all TypeScript versions
    const module = await WebAssembly.compile(
      wasmBytes.buffer.slice(wasmBytes.byteOffset, wasmBytes.byteOffset + wasmBytes.byteLength)
    );
    const instance = await WebAssembly.instantiate(module, {
      env: {
        memory,
        // Standard imports for Rust WASM
        __stack_pointer: new WebAssembly.Global({ value: 'i32', mutable: true }, 0),
      },
      wasi_snapshot_preview1: this.createWASIImports(memory),
    });

    // Cache
    this.loadedModules.set(name, instance);
    this.memoryInstances.set(name, memory);

    return instance;
  }

  /**
   * Execute a function in a loaded WASM module
   */
  async executeFunction(
    moduleName: string,
    functionName: string,
    args: any[]
  ): Promise<WASMToolResult> {
    const startTime = performance.now();

    try {
      const instance = this.loadedModules.get(moduleName);
      if (!instance) {
        return {
          success: false,
          error: `Module not loaded: ${moduleName}`,
          executionTime: 0,
        };
      }

      const fn = instance.exports[functionName];
      if (typeof fn !== 'function') {
        return {
          success: false,
          error: `Function not found: ${functionName}`,
          executionTime: 0,
        };
      }

      // Convert arguments if needed
      const wasmArgs = this.prepareArguments(moduleName, args);

      // Execute
      const result = fn(...wasmArgs);

      // Convert result
      const output = this.convertResult(moduleName, result);

      return {
        success: true,
        output,
        executionTime: performance.now() - startTime,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || String(error),
        executionTime: performance.now() - startTime,
      };
    }
  }

  /**
   * Unload a module to free memory
   */
  unloadModule(name: string): void {
    this.loadedModules.delete(name);
    this.memoryInstances.delete(name);
  }

  // =============================================================================
  // Private Helpers
  // =============================================================================

  private base64ToUint8Array(base64: string): Uint8Array {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  private prepareArguments(moduleName: string, args: any[]): number[] {
    const memory = this.memoryInstances.get(moduleName);
    if (!memory) {
      throw new Error('Memory not found');
    }

    const wasmArgs: number[] = [];

    for (const arg of args) {
      if (typeof arg === 'number') {
        wasmArgs.push(arg);
      } else if (typeof arg === 'string') {
        // Allocate string in WASM memory
        const ptr = this.allocateString(memory, arg);
        wasmArgs.push(ptr);
      } else if (ArrayBuffer.isView(arg)) {
        // Copy typed array to WASM memory
        const ptr = this.allocateTypedArray(memory, arg as Uint8Array);
        wasmArgs.push(ptr);
        wasmArgs.push(arg.byteLength);
      } else if (typeof arg === 'object') {
        // Serialize to JSON and allocate
        const json = JSON.stringify(arg);
        const ptr = this.allocateString(memory, json);
        wasmArgs.push(ptr);
      }
    }

    return wasmArgs;
  }

  private convertResult(moduleName: string, result: any): any {
    // Basic types pass through
    if (typeof result === 'number' || typeof result === 'bigint') {
      return result;
    }

    // Pointer results would need to be read from memory
    // This is simplified - real implementation would handle memory reading
    return result;
  }

  private allocateString(memory: WebAssembly.Memory, str: string): number {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(str + '\0');
    const buffer = new Uint8Array(memory.buffer);

    // Simple bump allocator (production would use proper allocator)
    const ptr = this.findFreeSpace(buffer, bytes.length);
    buffer.set(bytes, ptr);

    return ptr;
  }

  private allocateTypedArray(memory: WebAssembly.Memory, data: Uint8Array): number {
    const buffer = new Uint8Array(memory.buffer);
    const ptr = this.findFreeSpace(buffer, data.length);
    buffer.set(data, ptr);
    return ptr;
  }

  private findFreeSpace(buffer: Uint8Array, size: number): number {
    // Simplified: allocate from end of linear memory
    // Real implementation would track allocations
    return buffer.length - size - 1024;
  }

  private createWASIImports(memory: WebAssembly.Memory): Record<string, Function> {
    // Minimal WASI imports for Rust modules
    return {
      fd_write: (fd: number, iovs: number, iovsLen: number, nwritten: number) => {
        // Console output (simplified)
        return 0;
      },
      fd_read: () => 0,
      fd_close: () => 0,
      fd_seek: () => 0,
      environ_get: () => 0,
      environ_sizes_get: () => 0,
      proc_exit: (code: number) => {
        throw new Error(`WASM exit: ${code}`);
      },
      clock_time_get: () => BigInt(Date.now() * 1000000),
    };
  }
}

// =============================================================================
// Tool Registry Integration
// =============================================================================

export interface RustToolConfig {
  name: string;
  description: string;
  wasmSource: string;  // URL or base64
  functions: Array<{
    name: string;
    description: string;
    parameters: Record<string, { type: string; description: string }>;
  }>;
}

/**
 * Create a tool executor from a Rust/WASM module
 */
export function createRustToolExecutor(config: RustToolConfig) {
  const loader = new WASMToolLoader();
  let isLoaded = false;

  return {
    name: config.name,
    description: config.description,

    async initialize() {
      if (!isLoaded) {
        await loader.loadModule(config.name, config.wasmSource);
        isLoaded = true;
      }
    },

    async execute(functionName: string, args: Record<string, any>) {
      if (!isLoaded) {
        await this.initialize();
      }

      const func = config.functions.find(f => f.name === functionName);
      if (!func) {
        return { success: false, error: `Function not found: ${functionName}` };
      }

      // Convert named args to positional
      const positionalArgs = Object.keys(func.parameters).map(key => args[key]);

      return loader.executeFunction(config.name, functionName, positionalArgs);
    },

    dispose() {
      loader.unloadModule(config.name);
      isLoaded = false;
    },
  };
}

// =============================================================================
// Example: FFT Tool Definition (would be compiled from Rust)
// =============================================================================

export const FFT_TOOL_EXAMPLE: RustToolConfig = {
  name: 'fft_processor',
  description: 'High-performance FFT using Rust/WASM',
  wasmSource: '/wasm/fft_processor.wasm',  // Would be compiled from Rust
  functions: [
    {
      name: 'fft',
      description: 'Compute Fast Fourier Transform',
      parameters: {
        signal: { type: 'Float64Array', description: 'Input signal' },
        sample_rate: { type: 'number', description: 'Sample rate in Hz' },
      },
    },
    {
      name: 'ifft',
      description: 'Compute Inverse FFT',
      parameters: {
        spectrum: { type: 'Float64Array', description: 'Frequency domain data' },
      },
    },
    {
      name: 'magnitude_spectrum',
      description: 'Get magnitude spectrum from FFT result',
      parameters: {
        fft_result: { type: 'Float64Array', description: 'FFT complex output' },
      },
    },
  ],
};

// =============================================================================
// Singleton Instance
// =============================================================================

let wasmToolLoaderInstance: WASMToolLoader | null = null;

export function getWASMToolLoader(): WASMToolLoader {
  if (!wasmToolLoaderInstance) {
    wasmToolLoaderInstance = new WASMToolLoader();
  }
  return wasmToolLoaderInstance;
}
