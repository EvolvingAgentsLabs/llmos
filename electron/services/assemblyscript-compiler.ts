/**
 * AssemblyScript Compiler Service
 *
 * Compiles AssemblyScript (TypeScript-like syntax) to WebAssembly
 * in the Electron main process using the native Node.js runtime.
 *
 * Benefits over browser-based compilation:
 * - Full Node.js filesystem access
 * - Faster compilation (native asc)
 * - Better error messages
 * - Import resolution from node_modules
 * - No CDN dependencies
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import { spawn, ChildProcess } from 'child_process';

export interface ASCCompileOptions {
  name?: string;
  optimize?: boolean;
  debug?: boolean;
  runtime?: 'stub' | 'minimal' | 'incremental';
  memoryBase?: number;
  tableBase?: number;
  exportTable?: boolean;
  importMemory?: boolean;
  exportMemory?: boolean;
  noAssert?: boolean;
  importBindings?: 'raw' | 'esm';
  exportBindings?: 'raw' | 'esm';
  // Robot4 specific
  robot4Mode?: boolean;
}

export interface ASCCompileResult {
  success: boolean;
  wasmBinary?: Uint8Array;
  wasmBase64?: string;
  textOutput?: string; // .wat text representation
  size?: number;
  error?: string;
  stderr?: string;
  compilationTime?: number;
  exports?: string[];
}

/**
 * Robot4 AssemblyScript Standard Library
 *
 * Provides type definitions and stubs for the Robot4 firmware API.
 * These map to the same functions as the C Robot4 API.
 */
const ROBOT4_STDLIB = `
// Robot4 AssemblyScript Standard Library
// Hardware abstraction layer for ESP32 WASMachine firmware

// External imports (provided by WASMachine runtime)
@external("env", "drive")
declare function _drive(left: i32, right: i32): void;

@external("env", "distance")
declare function _distance(sensor: i32): i32;

@external("env", "led")
declare function _led(r: i32, g: i32, b: i32): void;

@external("env", "print")
declare function _print(ptr: i32, len: i32): void;

@external("env", "millis")
declare function _millis(): i32;

@external("env", "delay")
declare function _delay(ms: i32): void;

@external("env", "get_button")
declare function _get_button(): i32;

@external("env", "get_battery")
declare function _get_battery(): i32;

@external("env", "beep")
declare function _beep(frequency: i32, duration: i32): void;

// High-level API (TypeScript-friendly)

/**
 * Control the robot motors
 * @param left Left motor speed (-100 to 100)
 * @param right Right motor speed (-100 to 100)
 */
export function drive(left: i32, right: i32): void {
  _drive(left, right);
}

/**
 * Read distance sensor
 * @param sensor Sensor index (0-3)
 * @returns Distance in centimeters
 */
export function distance(sensor: i32 = 0): i32 {
  return _distance(sensor);
}

/**
 * Set LED color
 * @param r Red component (0-255)
 * @param g Green component (0-255)
 * @param b Blue component (0-255)
 */
export function led(r: i32, g: i32, b: i32): void {
  _led(r, g, b);
}

/**
 * Print debug message
 * @param message String to print
 */
export function print(message: string): void {
  const buf = String.UTF8.encode(message);
  _print(changetype<i32>(buf), buf.byteLength);
}

/**
 * Get current time in milliseconds since boot
 */
export function millis(): i32 {
  return _millis();
}

/**
 * Delay execution
 * @param ms Milliseconds to wait
 */
export function delay(ms: i32): void {
  _delay(ms);
}

/**
 * Check button state
 * @returns 1 if pressed, 0 otherwise
 */
export function getButton(): i32 {
  return _get_button();
}

/**
 * Get battery voltage
 * @returns Battery percentage (0-100)
 */
export function getBattery(): i32 {
  return _get_battery();
}

/**
 * Play a beep sound
 * @param frequency Frequency in Hz
 * @param duration Duration in milliseconds
 */
export function beep(frequency: i32, duration: i32): void {
  _beep(frequency, duration);
}

// State management helpers

/** Global state that persists between update() calls */
let _state: Map<string, i32> = new Map();

export function setState(key: string, value: i32): void {
  _state.set(key, value);
}

export function getState(key: string, defaultValue: i32 = 0): i32 {
  return _state.has(key) ? _state.get(key) : defaultValue;
}

// Math helpers
export function clamp(value: i32, min: i32, max: i32): i32 {
  return value < min ? min : (value > max ? max : value);
}

export function map(value: i32, inMin: i32, inMax: i32, outMin: i32, outMax: i32): i32 {
  return outMin + (value - inMin) * (outMax - outMin) / (inMax - inMin);
}
`;

/**
 * AssemblyScript Compiler using native asc
 */
export class AssemblyScriptCompiler {
  private cachePath: string;
  private ascPath: string | null = null;
  private isInitialized = false;
  private version: string = 'unknown';

  constructor(options: { cachePath: string }) {
    this.cachePath = options.cachePath;
  }

  /**
   * Initialize the compiler
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    console.log('[ASC] Initializing AssemblyScript compiler...');

    // Ensure cache directory exists
    await fs.mkdir(this.cachePath, { recursive: true });

    // Try to find asc in different locations
    const ascLocations = [
      // Project-local installation
      path.join(process.cwd(), 'node_modules', '.bin', 'asc'),
      // Global installation
      'asc',
      // npx fallback
      'npx',
    ];

    for (const location of ascLocations) {
      try {
        const version = await this.checkAscVersion(location);
        if (version) {
          this.ascPath = location;
          this.version = version;
          console.log(`[ASC] Found asc at ${location} (version ${version})`);
          break;
        }
      } catch {
        // Continue to next location
      }
    }

    if (!this.ascPath) {
      console.warn('[ASC] asc not found, will use npx fallback');
      this.ascPath = 'npx';
    }

    // Create Robot4 standard library in cache
    await fs.writeFile(
      path.join(this.cachePath, 'robot4.ts'),
      ROBOT4_STDLIB
    );

    this.isInitialized = true;
    console.log('[ASC] Initialization complete');
  }

  /**
   * Check asc version
   */
  private async checkAscVersion(ascPath: string): Promise<string | null> {
    return new Promise((resolve) => {
      const args = ascPath === 'npx' ? ['asc', '--version'] : ['--version'];
      const proc = spawn(ascPath, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 10000,
      });

      let stdout = '';
      proc.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      proc.on('close', (code) => {
        if (code === 0) {
          // Parse version from output like "Version 0.27.23"
          const match = stdout.match(/(\d+\.\d+\.\d+)/);
          resolve(match ? match[1] : 'installed');
        } else {
          resolve(null);
        }
      });

      proc.on('error', () => resolve(null));
    });
  }

  /**
   * Get compiler status
   */
  getStatus(): { ready: boolean; version: string; installed: boolean } {
    return {
      ready: this.isInitialized,
      version: this.version,
      installed: this.ascPath !== null,
    };
  }

  /**
   * Get compiler version
   */
  getVersion(): string {
    return this.version;
  }

  /**
   * Compile AssemblyScript source to WebAssembly
   */
  async compile(source: string, options: ASCCompileOptions = {}): Promise<ASCCompileResult> {
    const startTime = Date.now();

    if (!this.isInitialized) {
      await this.initialize();
    }

    const {
      name = 'assembly',
      optimize = true,
      debug = false,
      runtime = 'stub',
      robot4Mode = false,
      noAssert = true,
      exportMemory = true,
    } = options;

    // Create temp directory for this compilation
    const tempDir = path.join(this.cachePath, `compile-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });

    try {
      // Write source file
      const sourceFile = path.join(tempDir, `${name}.ts`);

      // If robot4Mode, prepend the standard library import
      let finalSource = source;
      if (robot4Mode) {
        // Copy Robot4 stdlib to temp dir
        await fs.copyFile(
          path.join(this.cachePath, 'robot4.ts'),
          path.join(tempDir, 'robot4.ts')
        );
        // Add import if not already present
        if (!source.includes('robot4')) {
          finalSource = `import { drive, distance, led, print, millis, delay, getButton, getBattery, beep, setState, getState, clamp, map } from "./robot4";\n\n${source}`;
        }
      }

      await fs.writeFile(sourceFile, finalSource);

      // Build asc arguments
      const outputWasm = path.join(tempDir, `${name}.wasm`);
      const outputWat = path.join(tempDir, `${name}.wat`);

      const args: string[] = [];

      // Use npx if needed
      if (this.ascPath === 'npx') {
        args.push('asc');
      }

      args.push(
        sourceFile,
        '--outFile', outputWasm,
        '--textFile', outputWat,
        `--runtime`, runtime,
      );

      // Optimization
      if (optimize) {
        args.push('-O3', '--shrinkLevel', '2');
      } else {
        args.push('-O0');
      }

      // Debug info
      if (debug) {
        args.push('--debug', '--sourceMap');
      }

      // Memory options
      if (exportMemory) {
        args.push('--exportMemory');
      }

      if (noAssert) {
        args.push('--noAssert');
      }

      // Robot4 specific exports
      if (robot4Mode) {
        args.push(
          '--exportStart', '_start',
          '--exportTable'
        );
      }

      console.log(`[ASC] Compiling ${name}...`);
      console.log(`[ASC] Args: ${args.join(' ')}`);

      // Run compilation
      const result = await this.runAsc(args);

      if (!result.success) {
        return {
          success: false,
          error: 'Compilation failed',
          stderr: result.stderr,
          compilationTime: Date.now() - startTime,
        };
      }

      // Read compiled output
      const wasmBinary = await fs.readFile(outputWasm);
      let textOutput: string | undefined;
      try {
        textOutput = await fs.readFile(outputWat, 'utf-8');
      } catch {
        // WAT file may not exist in all cases
      }

      // Extract exports from WAT
      const exports = this.extractExports(textOutput || '');

      const compilationTime = Date.now() - startTime;
      console.log(`[ASC] Compilation successful: ${wasmBinary.length} bytes in ${compilationTime}ms`);

      return {
        success: true,
        wasmBinary: new Uint8Array(wasmBinary),
        wasmBase64: wasmBinary.toString('base64'),
        textOutput,
        size: wasmBinary.length,
        compilationTime,
        exports,
      };

    } finally {
      // Clean up temp directory
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  /**
   * Run asc compiler
   */
  private runAsc(args: string[]): Promise<{ success: boolean; stdout: string; stderr: string }> {
    return new Promise((resolve) => {
      const command = this.ascPath === 'npx' ? 'npx' : this.ascPath!;
      const proc = spawn(command, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 60000, // 60 second timeout
        cwd: this.cachePath,
      });

      let stdout = '';
      let stderr = '';

      proc.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        resolve({
          success: code === 0,
          stdout,
          stderr,
        });
      });

      proc.on('error', (err) => {
        resolve({
          success: false,
          stdout: '',
          stderr: err.message,
        });
      });
    });
  }

  /**
   * Extract exported functions from WAT text
   */
  private extractExports(wat: string): string[] {
    const exports: string[] = [];
    const exportRegex = /\(export "([^"]+)"/g;
    let match;
    while ((match = exportRegex.exec(wat)) !== null) {
      exports.push(match[1]);
    }
    return exports;
  }

  /**
   * Compile a Robot4 behavior (convenience method)
   */
  async compileRobot4(source: string, name: string = 'robot'): Promise<ASCCompileResult> {
    return this.compile(source, {
      name,
      robot4Mode: true,
      optimize: true,
      runtime: 'stub',
      noAssert: true,
      exportMemory: true,
    });
  }
}
