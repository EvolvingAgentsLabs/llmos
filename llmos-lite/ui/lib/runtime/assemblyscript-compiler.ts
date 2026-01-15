/**
 * Browser-Based AssemblyScript Compiler
 *
 * Compiles AssemblyScript to WebAssembly entirely in the browser using
 * the AssemblyScript compiler loaded dynamically. No backend required.
 *
 * This enables web users to write TypeScript-like code and compile it
 * to WASM without needing the Electron desktop app.
 */

// Robot4 Standard Library for AssemblyScript
export const ROBOT4_STDLIB_SOURCE = `
// Robot4 AssemblyScript Standard Library
// Hardware abstraction layer for ESP32 WASMachine firmware

// ============ External Imports (provided by WASMachine runtime) ============

@external("env", "drive")
declare function _drive(left: i32, right: i32): void;

@external("env", "distance")
declare function _distance(sensor: i32): i32;

@external("env", "led")
declare function _led(r: i32, g: i32, b: i32): void;

@external("env", "print_str")
declare function _print(ptr: usize, len: i32): void;

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

@external("env", "get_imu")
declare function _get_imu(axis: i32): f32;

@external("env", "get_line_sensor")
declare function _get_line_sensor(sensor: i32): i32;

// ============ High-Level API (TypeScript-friendly) ============

/**
 * Control the robot motors
 * @param left Left motor speed (-100 to 100)
 * @param right Right motor speed (-100 to 100)
 */
export function drive(left: i32, right: i32): void {
  _drive(left, right);
}

/**
 * Stop all motors immediately
 */
export function stop(): void {
  _drive(0, 0);
}

/**
 * Read distance sensor
 * @param sensor Sensor index (0=front, 1=left, 2=right, 3=back)
 * @returns Distance in centimeters (0-400, 400 = no obstacle)
 */
export function distance(sensor: i32 = 0): i32 {
  return _distance(sensor);
}

/**
 * Set LED color (RGB)
 * @param r Red component (0-255)
 * @param g Green component (0-255)
 * @param b Blue component (0-255)
 */
export function led(r: i32, g: i32, b: i32): void {
  _led(r, g, b);
}

/**
 * Set LED to a named color
 */
export function ledColor(color: string): void {
  if (color == "red") led(255, 0, 0);
  else if (color == "green") led(0, 255, 0);
  else if (color == "blue") led(0, 0, 255);
  else if (color == "yellow") led(255, 255, 0);
  else if (color == "cyan") led(0, 255, 255);
  else if (color == "magenta") led(255, 0, 255);
  else if (color == "white") led(255, 255, 255);
  else if (color == "orange") led(255, 165, 0);
  else led(0, 0, 0); // off
}

/**
 * Get current time in milliseconds since boot
 */
export function millis(): i32 {
  return _millis();
}

/**
 * Delay execution (blocking)
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
 * Check if button was just pressed (edge detection)
 */
let _lastButton: i32 = 0;
export function buttonPressed(): bool {
  const current = _get_button();
  const pressed = current == 1 && _lastButton == 0;
  _lastButton = current;
  return pressed;
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
 * @param frequency Frequency in Hz (100-10000)
 * @param duration Duration in milliseconds
 */
export function beep(frequency: i32, duration: i32): void {
  _beep(frequency, duration);
}

/**
 * Get IMU (accelerometer/gyroscope) reading
 * @param axis 0=accel_x, 1=accel_y, 2=accel_z, 3=gyro_x, 4=gyro_y, 5=gyro_z
 * @returns Sensor value (acceleration in g, rotation in deg/s)
 */
export function getIMU(axis: i32): f32 {
  return _get_imu(axis);
}

/**
 * Get line sensor reading
 * @param sensor Sensor index (0-4, left to right)
 * @returns 0 = white/light, 1 = black/dark
 */
export function getLineSensor(sensor: i32): i32 {
  return _get_line_sensor(sensor);
}

// ============ State Management ============

/** Internal state storage */
const _stateI32: Map<string, i32> = new Map();
const _stateF32: Map<string, f32> = new Map();

/**
 * Store an integer state value
 */
export function setState(key: string, value: i32): void {
  _stateI32.set(key, value);
}

/**
 * Get an integer state value
 */
export function getState(key: string, defaultValue: i32 = 0): i32 {
  return _stateI32.has(key) ? _stateI32.get(key) : defaultValue;
}

/**
 * Store a float state value
 */
export function setStateF(key: string, value: f32): void {
  _stateF32.set(key, value);
}

/**
 * Get a float state value
 */
export function getStateF(key: string, defaultValue: f32 = 0.0): f32 {
  return _stateF32.has(key) ? _stateF32.get(key) : defaultValue;
}

// ============ Math Helpers ============

/**
 * Clamp a value to a range
 */
export function clamp(value: i32, min: i32, max: i32): i32 {
  return value < min ? min : (value > max ? max : value);
}

/**
 * Clamp a float to a range
 */
export function clampF(value: f32, min: f32, max: f32): f32 {
  return value < min ? min : (value > max ? max : value);
}

/**
 * Map a value from one range to another
 */
export function map(value: i32, inMin: i32, inMax: i32, outMin: i32, outMax: i32): i32 {
  return outMin + (value - inMin) * (outMax - outMin) / (inMax - inMin);
}

/**
 * Map a float from one range to another
 */
export function mapF(value: f32, inMin: f32, inMax: f32, outMin: f32, outMax: f32): f32 {
  return outMin + (value - inMin) * (outMax - outMin) / (inMax - inMin);
}

/**
 * Absolute value
 */
export function abs(value: i32): i32 {
  return value < 0 ? -value : value;
}

/**
 * Sign of a number (-1, 0, or 1)
 */
export function sign(value: i32): i32 {
  return value < 0 ? -1 : (value > 0 ? 1 : 0);
}

/**
 * Linear interpolation
 */
export function lerp(a: f32, b: f32, t: f32): f32 {
  return a + (b - a) * t;
}

// ============ Timer Helpers ============

/**
 * Check if a timer has elapsed
 */
export function timerElapsed(startTime: i32, duration: i32): bool {
  return millis() - startTime >= duration;
}

/**
 * Get elapsed time since a start time
 */
export function elapsed(startTime: i32): i32 {
  return millis() - startTime;
}

// ============ Debug Helpers ============

/**
 * Print a debug message (visible in serial monitor)
 */
export function print(message: string): void {
  const encoded = String.UTF8.encode(message);
  _print(changetype<usize>(encoded), encoded.byteLength);
}

/**
 * Print a number
 */
export function printNum(label: string, value: i32): void {
  print(label + ": " + value.toString());
}
`;

// Type definitions for Robot4 API (used for IntelliSense)
export const ROBOT4_TYPE_DEFINITIONS = `
// Robot4 API Type Definitions

/** Control robot motors (-100 to 100 for each) */
declare function drive(left: i32, right: i32): void;

/** Stop all motors */
declare function stop(): void;

/** Read distance sensor (0=front, 1=left, 2=right, 3=back). Returns cm. */
declare function distance(sensor?: i32): i32;

/** Set LED color (0-255 for each component) */
declare function led(r: i32, g: i32, b: i32): void;

/** Set LED to named color: "red", "green", "blue", "yellow", "cyan", "magenta", "white", "orange" */
declare function ledColor(color: string): void;

/** Get current time in milliseconds since boot */
declare function millis(): i32;

/** Delay execution (blocking) */
declare function delay(ms: i32): void;

/** Check button state (1=pressed, 0=released) */
declare function getButton(): i32;

/** Check if button was just pressed (edge detection) */
declare function buttonPressed(): bool;

/** Get battery percentage (0-100) */
declare function getBattery(): i32;

/** Play a beep (frequency: 100-10000 Hz) */
declare function beep(frequency: i32, duration: i32): void;

/** Get IMU reading (0-2=accel xyz, 3-5=gyro xyz) */
declare function getIMU(axis: i32): f32;

/** Get line sensor (0-4, returns 0=white, 1=black) */
declare function getLineSensor(sensor: i32): i32;

/** Store integer state */
declare function setState(key: string, value: i32): void;

/** Get integer state */
declare function getState(key: string, defaultValue?: i32): i32;

/** Store float state */
declare function setStateF(key: string, value: f32): void;

/** Get float state */
declare function getStateF(key: string, defaultValue?: f32): f32;

/** Clamp integer to range */
declare function clamp(value: i32, min: i32, max: i32): i32;

/** Clamp float to range */
declare function clampF(value: f32, min: f32, max: f32): f32;

/** Map integer from one range to another */
declare function map(value: i32, inMin: i32, inMax: i32, outMin: i32, outMax: i32): i32;

/** Map float from one range to another */
declare function mapF(value: f32, inMin: f32, inMax: f32, outMin: f32, outMax: f32): f32;

/** Absolute value */
declare function abs(value: i32): i32;

/** Sign of number (-1, 0, 1) */
declare function sign(value: i32): i32;

/** Linear interpolation */
declare function lerp(a: f32, b: f32, t: f32): f32;

/** Check if timer has elapsed */
declare function timerElapsed(startTime: i32, duration: i32): bool;

/** Get elapsed time since start */
declare function elapsed(startTime: i32): i32;

/** Print debug message */
declare function print(message: string): void;

/** Print labeled number */
declare function printNum(label: string, value: i32): void;

// Main entry point - called at 60Hz
declare function update(): void;
`;

export interface BrowserASCCompileOptions {
  name?: string;
  optimize?: boolean;
  debug?: boolean;
  robot4Mode?: boolean;
  runtime?: 'stub' | 'minimal' | 'incremental';
}

export interface BrowserASCCompileResult {
  success: boolean;
  wasmBinary?: Uint8Array;
  wasmBase64?: string;
  textOutput?: string;
  size?: number;
  error?: string;
  stderr?: string;
  compilationTime?: number;
  exports?: string[];
}

/**
 * Browser-based AssemblyScript Compiler
 * Uses the official AssemblyScript compiler loaded via dynamic import
 */
export class BrowserAssemblyScriptCompiler {
  private static instance: BrowserAssemblyScriptCompiler;
  private asc: any = null;
  private isInitialized = false;
  private initPromise: Promise<void> | null = null;
  private version = 'loading...';

  private constructor() {}

  static getInstance(): BrowserAssemblyScriptCompiler {
    if (!BrowserAssemblyScriptCompiler.instance) {
      BrowserAssemblyScriptCompiler.instance = new BrowserAssemblyScriptCompiler();
    }
    return BrowserAssemblyScriptCompiler.instance;
  }

  /**
   * Initialize the compiler
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = this.doInitialize();
    return this.initPromise;
  }

  private async doInitialize(): Promise<void> {
    try {
      console.log('[Browser-ASC] Loading AssemblyScript compiler...');

      // Load AssemblyScript from CDN
      // We use the asc.js bundle which includes the compiler
      const cdnUrl = 'https://cdn.jsdelivr.net/npm/assemblyscript@0.27.29/dist/asc.js';

      // Create a script element to load the UMD bundle
      await new Promise<void>((resolve, reject) => {
        // Check if already loaded
        if ((window as any).assemblyscript) {
          this.asc = (window as any).assemblyscript;
          resolve();
          return;
        }

        const script = document.createElement('script');
        script.src = cdnUrl;
        script.onload = () => {
          this.asc = (window as any).assemblyscript;
          if (this.asc) {
            resolve();
          } else {
            reject(new Error('AssemblyScript not found after script load'));
          }
        };
        script.onerror = () => reject(new Error('Failed to load AssemblyScript from CDN'));
        document.head.appendChild(script);
      });

      // Get version
      if (this.asc?.version) {
        this.version = this.asc.version;
      } else {
        this.version = '0.27.x';
      }

      this.isInitialized = true;
      console.log(`[Browser-ASC] Compiler loaded (v${this.version})`);

    } catch (error: any) {
      console.error('[Browser-ASC] Failed to initialize:', error);
      throw new Error(`Failed to load AssemblyScript compiler: ${error.message}`);
    }
  }

  /**
   * Get compiler status
   */
  getStatus(): { ready: boolean; version: string; installed: boolean } {
    return {
      ready: this.isInitialized,
      version: this.version,
      installed: this.isInitialized,
    };
  }

  /**
   * Get compiler version
   */
  getVersion(): string {
    return this.version;
  }

  /**
   * Check if compiler is ready
   */
  isReady(): boolean {
    return this.isInitialized && this.asc !== null;
  }

  /**
   * Compile AssemblyScript source to WebAssembly
   */
  async compile(source: string, options: BrowserASCCompileOptions = {}): Promise<BrowserASCCompileResult> {
    const startTime = Date.now();

    try {
      // Ensure initialized
      if (!this.isInitialized) {
        await this.initialize();
      }

      if (!this.asc) {
        throw new Error('Compiler not available');
      }

      const {
        name = 'assembly',
        optimize = true,
        debug = false,
        robot4Mode = false,
        runtime = 'stub',
      } = options;

      console.log(`[Browser-ASC] Compiling ${name} (robot4Mode: ${robot4Mode})...`);

      // Prepare source files
      const sources: Record<string, string> = {};

      // Add Robot4 standard library if needed
      if (robot4Mode) {
        sources['robot4.ts'] = ROBOT4_STDLIB_SOURCE;
        // Add import to user source if not present
        if (!source.includes('from "./robot4"') && !source.includes("from './robot4'")) {
          source = `import { drive, stop, distance, led, ledColor, millis, delay, getButton, buttonPressed, getBattery, beep, getIMU, getLineSensor, setState, getState, setStateF, getStateF, clamp, clampF, map, mapF, abs, sign, lerp, timerElapsed, elapsed, print, printNum } from "./robot4";\n\n${source}`;
        }
      }

      sources[`${name}.ts`] = source;

      // Output storage
      let wasmBinary: Uint8Array | null = null;
      let textOutput: string = '';
      const stderr: string[] = [];

      // Compile using asc API
      const result = await this.asc.main(
        [
          `${name}.ts`,
          '--outFile', `${name}.wasm`,
          '--textFile', `${name}.wat`,
          '--runtime', runtime,
          optimize ? '-O3' : '-O0',
          optimize ? '--shrinkLevel=2' : '',
          debug ? '--debug' : '',
          '--exportMemory',
          '--noAssert',
        ].filter(Boolean),
        {
          // Virtual file system
          readFile: (filename: string, baseDir: string) => {
            const key = filename.replace(/^\.\//, '');
            if (sources[key]) {
              return sources[key];
            }
            return null;
          },
          writeFile: (filename: string, contents: Uint8Array | string, baseDir: string) => {
            if (filename.endsWith('.wasm')) {
              wasmBinary = contents instanceof Uint8Array ? contents : new TextEncoder().encode(contents);
            } else if (filename.endsWith('.wat')) {
              textOutput = typeof contents === 'string' ? contents : new TextDecoder().decode(contents);
            }
          },
          listFiles: (dirname: string, baseDir: string) => {
            return Object.keys(sources);
          },
          stderr: {
            write: (message: string) => {
              stderr.push(message);
              return true;
            },
          },
          stdout: {
            write: (message: string) => {
              console.log('[ASC]', message);
              return true;
            },
          },
        }
      );

      const compilationTime = Date.now() - startTime;

      // Check for errors
      if (result !== 0 || !wasmBinary) {
        const errorMessage = stderr.join('').trim() || 'Compilation failed';
        console.error('[Browser-ASC] Compilation failed:', errorMessage);

        return {
          success: false,
          error: 'Compilation failed',
          stderr: errorMessage,
          compilationTime,
        };
      }

      // Extract exports from WAT
      const exports = this.extractExports(textOutput);

      console.log(`[Browser-ASC] Compilation successful: ${wasmBinary.length} bytes in ${compilationTime}ms`);

      return {
        success: true,
        wasmBinary,
        wasmBase64: this.uint8ArrayToBase64(wasmBinary),
        textOutput,
        size: wasmBinary.length,
        compilationTime,
        exports,
      };

    } catch (error: any) {
      console.error('[Browser-ASC] Compilation error:', error);

      return {
        success: false,
        error: error.message || 'Unknown error',
        stderr: error.stack || error.toString(),
        compilationTime: Date.now() - startTime,
      };
    }
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
   * Compile a Robot4 behavior (convenience method)
   */
  async compileRobot4(source: string, name: string = 'robot'): Promise<BrowserASCCompileResult> {
    return this.compile(source, {
      name,
      robot4Mode: true,
      optimize: true,
      runtime: 'stub',
    });
  }
}

/**
 * Get the browser AssemblyScript compiler instance
 */
export function getBrowserASCCompiler(): BrowserAssemblyScriptCompiler {
  return BrowserAssemblyScriptCompiler.getInstance();
}

/**
 * Compile AssemblyScript in the browser (convenience function)
 */
export async function compileAssemblyScript(
  source: string,
  options?: BrowserASCCompileOptions
): Promise<BrowserASCCompileResult> {
  const compiler = getBrowserASCCompiler();
  return compiler.compile(source, options);
}
