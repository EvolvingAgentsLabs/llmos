/**
 * Browser-Based WASM Compiler
 *
 * Compiles C source code to WebAssembly entirely in the browser using
 * Wasmer SDK and clang.wasm. No backend server required.
 *
 * Philosophy: "OS in the Browser" - all compilation happens client-side.
 *
 * NOTE: Wasmer SDK is loaded dynamically from CDN to avoid bundling issues
 * with import.meta.url in Next.js builds.
 */

// Wasmer SDK will be loaded dynamically from CDN
declare global {
  interface Window {
    Wasmer?: any;
  }
}

// Dynamic import of Wasmer SDK from CDN
async function loadWasmerSDK(): Promise<any> {
  // Check if already loaded
  if (typeof window !== 'undefined' && window.Wasmer) {
    return window.Wasmer;
  }

  // Load from CDN via dynamic import
  // Using unpkg.com for reliable CDN delivery
  // Use string variable to bypass TypeScript static analysis
  const cdnUrl = 'https://unpkg.com/@wasmer/sdk@0.8.0/dist/index.mjs';

  // @ts-expect-error - Dynamic import of external CDN URL
  const WasmerModule = await import(/* webpackIgnore: true */ cdnUrl);

  // Store globally for reuse
  if (typeof window !== 'undefined') {
    window.Wasmer = WasmerModule;
  }

  return WasmerModule;
}

export interface CompileOptions {
  source: string;
  name: string;
  optimizationLevel?: string; // '0', '1', '2', '3', 's', 'z'
  includeDebugInfo?: boolean;
}

export interface CompileResult {
  success: boolean;
  wasmBinary?: Uint8Array;
  wasmBase64?: string;
  size?: number;
  error?: string;
  details?: string;
  hint?: string;
  compilationTime?: number;
}

/**
 * Browser-based WASM Compiler using Wasmer SDK
 */
export class WasmCompiler {
  private static instance: WasmCompiler;
  private isInitialized = false;
  private wasmerReady = false;
  private clangPackage: any = null;

  // SDK Headers content (loaded from public/sdk/wasi-headers/)
  private sdkHeaders: Map<string, string> = new Map();

  private constructor() {}

  /**
   * Get singleton instance
   */
  static getInstance(): WasmCompiler {
    if (!WasmCompiler.instance) {
      WasmCompiler.instance = new WasmCompiler();
    }
    return WasmCompiler.instance;
  }

  /**
   * Initialize Wasmer runtime and load SDK headers
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      console.log('[WasmCompiler] Loading Wasmer SDK from CDN...');
      const WasmerModule = await loadWasmerSDK();

      console.log('[WasmCompiler] Initializing Wasmer runtime...');
      await WasmerModule.init();
      this.wasmerReady = true;

      console.log('[WasmCompiler] Loading ESP32 SDK headers...');
      await this.loadSDKHeaders();

      this.isInitialized = true;
      console.log('[WasmCompiler] Initialization complete');
    } catch (error: any) {
      console.error('[WasmCompiler] Initialization failed:', error);
      throw new Error(`Failed to initialize WASM compiler: ${error.message}`);
    }
  }

  /**
   * Load SDK headers from public/sdk/wasi-headers/
   */
  private async loadSDKHeaders(): Promise<void> {
    const headerFiles = [
      'wm_ext_wasm_native.h',
      'wm_ext_wasm_native_mqtt.h',
      'wm_ext_wasm_native_rainmaker.h',
    ];

    for (const filename of headerFiles) {
      try {
        const response = await fetch(`/sdk/wasi-headers/${filename}`);
        if (response.ok) {
          const content = await response.text();
          this.sdkHeaders.set(filename, content);
          console.log(`[WasmCompiler] Loaded header: ${filename}`);
        } else {
          console.warn(`[WasmCompiler] Failed to load header: ${filename}`);
        }
      } catch (error) {
        console.warn(`[WasmCompiler] Error loading header ${filename}:`, error);
      }
    }
  }

  /**
   * Check if compiler is ready
   */
  isReady(): boolean {
    return this.isInitialized && this.wasmerReady;
  }

  /**
   * Get compiler status for diagnostics
   */
  getStatus(): { ready: boolean; headers: number; wasmer: boolean } {
    return {
      ready: this.isReady(),
      headers: this.sdkHeaders.size,
      wasmer: this.wasmerReady,
    };
  }

  /**
   * Compile C source code to WebAssembly
   */
  async compile(options: CompileOptions): Promise<CompileResult> {
    const startTime = Date.now();

    try {
      // Ensure initialized
      if (!this.isInitialized) {
        await this.initialize();
      }

      const { source, name, optimizationLevel = '3', includeDebugInfo = false } = options;

      console.log(`[WasmCompiler] Compiling ${name}...`);

      // Get Wasmer SDK module
      const WasmerModule = await loadWasmerSDK();

      // Load clang package from Wasmer registry (cached after first load)
      if (!this.clangPackage) {
        console.log('[WasmCompiler] Loading clang from Wasmer registry...');
        console.log('[WasmCompiler] Note: First load may take 30-60 seconds (~30MB download)');
        this.clangPackage = await WasmerModule.Wasmer.fromRegistry('clang/clang');
        console.log('[WasmCompiler] Clang loaded successfully');
      }

      // Create virtual directory for compilation
      const projectDir = new WasmerModule.Directory();

      // Write source file
      const sourceFilename = `${name}.c`;
      await projectDir.writeFile(sourceFilename, source);

      // Write SDK headers to virtual filesystem
      for (const [filename, content] of this.sdkHeaders.entries()) {
        await projectDir.writeFile(filename, content);
      }

      // Build clang arguments
      const outputFilename = `${name}.wasm`;
      const args = [
        `/project/${sourceFilename}`,
        '-o', `/project/${outputFilename}`,
        '--target=wasm32-wasi',
        `-O${optimizationLevel}`,
        '-Wl,--export=main',
        '-Wl,--export=__heap_base',
        '-Wl,--export=__data_end',
        '-Wl,--no-entry',
        '-Wl,--allow-undefined',
      ];

      // Add debug info if requested
      if (!includeDebugInfo) {
        args.push('-Wl,--strip-all');
      }

      // Include current directory for SDK headers
      args.push('-I/project');

      console.log('[WasmCompiler] Clang args:', args.join(' '));

      // Run clang compilation
      const instance = await this.clangPackage.entrypoint.run({
        args,
        mount: { '/project': projectDir },
      });

      // Check exit code
      if (instance.exitCode !== 0) {
        const stderr = instance.stderr || 'Unknown compilation error';
        console.error('[WasmCompiler] Compilation failed:', stderr);

        return {
          success: false,
          error: 'Compilation failed',
          details: stderr,
          hint: 'Check C code syntax. Common issues: missing semicolons, undefined functions, type errors.',
          compilationTime: Date.now() - startTime,
        };
      }

      // Read compiled WASM binary
      const wasmBinary = await projectDir.readFile(outputFilename);

      // Convert to base64 for easy transport
      const wasmBase64 = this.uint8ArrayToBase64(wasmBinary);

      const compilationTime = Date.now() - startTime;
      console.log(`[WasmCompiler] Compilation successful: ${wasmBinary.length} bytes in ${compilationTime}ms`);

      return {
        success: true,
        wasmBinary,
        wasmBase64,
        size: wasmBinary.length,
        compilationTime,
      };

    } catch (error: any) {
      console.error('[WasmCompiler] Compilation error:', error);

      return {
        success: false,
        error: error.message || 'Unknown error',
        details: error.stack || error.toString(),
        compilationTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Convert Uint8Array to Base64 string
   */
  private uint8ArrayToBase64(bytes: Uint8Array): string {
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  /**
   * Preload compiler assets (call this during app initialization)
   */
  async preload(): Promise<void> {
    console.log('[WasmCompiler] Preloading compiler assets...');
    await this.initialize();

    // Get Wasmer SDK module
    const WasmerModule = await loadWasmerSDK();

    // Preload clang package
    if (!this.clangPackage) {
      this.clangPackage = await WasmerModule.Wasmer.fromRegistry('clang/clang');
    }

    console.log('[WasmCompiler] Preload complete');
  }
}

/**
 * Convenience function to get compiler instance
 */
export function getWasmCompiler(): WasmCompiler {
  return WasmCompiler.getInstance();
}

/**
 * Compile C source code (convenience wrapper)
 */
export async function compileWasm(options: CompileOptions): Promise<CompileResult> {
  const compiler = getWasmCompiler();
  return await compiler.compile(options);
}
