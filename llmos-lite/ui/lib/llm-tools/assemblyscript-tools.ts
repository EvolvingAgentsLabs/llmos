/**
 * AssemblyScript Tools for LLM Agents
 *
 * Provides tools that allow LLM agents to compile AssemblyScript (TypeScript-like)
 * code to WebAssembly. Works in both browser (via API) and desktop (via Electron).
 *
 * AssemblyScript is ideal for:
 * - Web developers familiar with TypeScript
 * - Type-safe robot behaviors
 * - Better error messages than C
 * - Smaller learning curve than Rust
 */

import { ToolDefinition, ToolResult } from './file-tools';
import type { ElectronASCAPI, ASCCompileResult, ASCCompileOptions } from '../../electron/types';

/**
 * Check if running in Electron desktop environment
 */
function isElectron(): boolean {
  return typeof window !== 'undefined' && window.electronASC !== undefined;
}

/**
 * Get Electron ASC API
 */
function getElectronASC(): ElectronASCAPI | null {
  if (typeof window !== 'undefined' && window.electronASC) {
    return window.electronASC;
  }
  return null;
}

/**
 * AssemblyScript example for Robot4 behavior
 */
const ROBOT4_EXAMPLE = `
// Example: Collision avoidance robot behavior in AssemblyScript
// This code compiles to WebAssembly and runs on ESP32

import { drive, distance, led, millis, getState, setState, clamp } from "./robot4";

// Constants
const SAFE_DISTANCE: i32 = 30;
const TURN_TIME: i32 = 500;
const BASE_SPEED: i32 = 60;

// Main update loop - called at 60Hz by the firmware
export function update(): void {
  // Read front distance sensor
  const frontDist = distance(0);

  // State machine for behavior
  const state = getState("state", 0);
  const turnStart = getState("turnStart", 0);

  if (state == 0) {
    // State 0: Moving forward
    if (frontDist < SAFE_DISTANCE) {
      // Obstacle detected - start turning
      setState("state", 1);
      setState("turnStart", millis());
      led(255, 100, 0); // Orange: obstacle detected
    } else {
      // Clear path - drive forward
      drive(BASE_SPEED, BASE_SPEED);
      led(0, 255, 0); // Green: moving
    }
  } else {
    // State 1: Turning
    const elapsed = millis() - turnStart;

    if (elapsed > TURN_TIME) {
      // Done turning - return to forward
      setState("state", 0);
    } else {
      // Turn right
      drive(BASE_SPEED, -BASE_SPEED);
      led(0, 100, 255); // Blue: turning
    }
  }
}
`;

/**
 * Browser-based AssemblyScript compiler fallback
 * Uses WebAssembly to run asc in the browser
 */
class BrowserASCCompiler {
  private static instance: BrowserASCCompiler;
  private isReady = false;
  private asc: any = null;

  static getInstance(): BrowserASCCompiler {
    if (!BrowserASCCompiler.instance) {
      BrowserASCCompiler.instance = new BrowserASCCompiler();
    }
    return BrowserASCCompiler.instance;
  }

  async initialize(): Promise<void> {
    if (this.isReady) return;

    try {
      // Try to load AssemblyScript compiler
      // Note: This may not be available in browser without bundling
      console.log('[ASC-Browser] AssemblyScript compiler not available in browser mode');
      console.log('[ASC-Browser] Use LLMos Desktop for native AssemblyScript compilation');
    } catch (error) {
      console.warn('[ASC-Browser] Could not initialize browser compiler:', error);
    }
  }

  async compile(source: string, options: ASCCompileOptions = {}): Promise<ASCCompileResult> {
    // Browser fallback - return helpful error
    return {
      success: false,
      error: 'AssemblyScript compilation requires LLMos Desktop',
      stderr: `
AssemblyScript compilation is not available in browser mode.

To compile AssemblyScript code:
1. Download LLMos Desktop from https://github.com/EvolvingAgentsLabs/llmos
2. Run the desktop app with: npm run electron:dev
3. AssemblyScript will be automatically available

Alternatively, use the C compiler (compile_wasm) which works in browser.
      `.trim(),
    };
  }

  getStatus(): { ready: boolean; version: string; installed: boolean } {
    return {
      ready: false,
      version: 'N/A (browser mode)',
      installed: false,
    };
  }
}

/**
 * AssemblyScript Tools for LLM Agents
 */
export class AssemblyScriptTools {
  private browserCompiler: BrowserASCCompiler;

  constructor() {
    this.browserCompiler = BrowserASCCompiler.getInstance();
  }

  /**
   * Get tool definitions for LLM API
   */
  getToolDefinitions(): ToolDefinition[] {
    return [
      {
        name: 'compile_assemblyscript',
        description: `Compile AssemblyScript (TypeScript-like) code to WebAssembly.
AssemblyScript is ideal for web developers - it uses TypeScript syntax but compiles to efficient WASM.
Use this for robot behaviors, data processing, or any performance-critical code.
For Robot4 firmware, use robot4Mode: true to include the standard library.`,
        parameters: {
          type: 'object',
          properties: {
            source: {
              type: 'string',
              description: 'The AssemblyScript source code to compile',
            },
            name: {
              type: 'string',
              description: 'Name for the output WASM module (default: "assembly")',
            },
            robot4Mode: {
              type: 'boolean',
              description: 'Enable Robot4 mode with drive(), distance(), led() functions (default: false)',
            },
            optimize: {
              type: 'boolean',
              description: 'Enable optimization (default: true)',
            },
            debug: {
              type: 'boolean',
              description: 'Include debug info and source maps (default: false)',
            },
          },
          required: ['source'],
        },
      },
      {
        name: 'assemblyscript_status',
        description: 'Check if AssemblyScript compiler is available and get version info',
        parameters: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
      {
        name: 'assemblyscript_example',
        description: 'Get an example AssemblyScript Robot4 behavior to use as a starting point',
        parameters: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: ['robot4', 'basic', 'dataprocessing'],
              description: 'Type of example to generate',
            },
          },
          required: [],
        },
      },
    ];
  }

  /**
   * Execute a tool call
   */
  async executeTool(toolName: string, parameters: any): Promise<ToolResult> {
    try {
      switch (toolName) {
        case 'compile_assemblyscript':
          return await this.compileAssemblyScript(parameters);

        case 'assemblyscript_status':
          return await this.getStatus();

        case 'assemblyscript_example':
          return this.getExample(parameters);

        default:
          return {
            tool: toolName,
            success: false,
            error: `Unknown tool: ${toolName}`,
          };
      }
    } catch (error) {
      return {
        tool: toolName,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Compile AssemblyScript source code
   */
  private async compileAssemblyScript(params: {
    source: string;
    name?: string;
    robot4Mode?: boolean;
    optimize?: boolean;
    debug?: boolean;
  }): Promise<ToolResult> {
    const { source, name = 'assembly', robot4Mode = false, optimize = true, debug = false } = params;

    console.log(`[ASC] Compiling ${name} (robot4Mode: ${robot4Mode})...`);

    // Try Electron first
    const electronASC = getElectronASC();

    let result: ASCCompileResult;

    if (electronASC) {
      // Desktop mode - use native compiler
      result = await electronASC.compile(source, {
        name,
        robot4Mode,
        optimize,
        debug,
        runtime: 'stub',
        noAssert: !debug,
        exportMemory: true,
      });
    } else {
      // Browser fallback
      result = await this.browserCompiler.compile(source, {
        name,
        robot4Mode,
        optimize,
        debug,
      });
    }

    if (!result.success) {
      return {
        tool: 'compile_assemblyscript',
        success: false,
        error: result.error || 'Compilation failed',
        output: result.stderr,
      };
    }

    // Format success output
    const output = [
      `AssemblyScript compilation successful!`,
      ``,
      `Module: ${name}.wasm`,
      `Size: ${result.size} bytes`,
      `Compilation time: ${result.compilationTime}ms`,
      result.exports ? `Exports: ${result.exports.join(', ')}` : '',
      ``,
      `The WASM binary is ready for deployment to ESP32 or execution in the simulator.`,
    ].filter(Boolean).join('\n');

    return {
      tool: 'compile_assemblyscript',
      success: true,
      output,
      // Include base64 for downstream tools
      fileChanges: [
        {
          path: `output/${name}.wasm`,
          volume: 'user' as any,
          operation: 'write',
          diff: [`Binary WASM: ${result.size} bytes`],
        },
      ],
    };
  }

  /**
   * Get compiler status
   */
  private async getStatus(): Promise<ToolResult> {
    const electronASC = getElectronASC();

    let status: { ready: boolean; version: string; installed: boolean };

    if (electronASC) {
      status = await electronASC.getStatus();
    } else {
      status = this.browserCompiler.getStatus();
    }

    const mode = electronASC ? 'Desktop (native)' : 'Browser (limited)';

    const output = [
      `AssemblyScript Compiler Status`,
      ``,
      `Mode: ${mode}`,
      `Ready: ${status.ready ? 'Yes' : 'No'}`,
      `Version: ${status.version}`,
      `Installed: ${status.installed ? 'Yes' : 'No'}`,
      ``,
      electronASC
        ? 'Full AssemblyScript compilation available.'
        : 'Limited mode - use LLMos Desktop for full AssemblyScript support.',
    ].join('\n');

    return {
      tool: 'assemblyscript_status',
      success: true,
      output,
    };
  }

  /**
   * Get example code
   */
  private getExample(params: { type?: string }): ToolResult {
    const { type = 'robot4' } = params;

    let example: string;
    let description: string;

    switch (type) {
      case 'robot4':
        example = ROBOT4_EXAMPLE;
        description = 'Robot4 collision avoidance behavior using state machine pattern';
        break;

      case 'basic':
        example = `
// Basic AssemblyScript example
// Exports a simple function that can be called from JavaScript

export function add(a: i32, b: i32): i32 {
  return a + b;
}

export function multiply(a: i32, b: i32): i32 {
  return a * b;
}

export function factorial(n: i32): i32 {
  if (n <= 1) return 1;
  return n * factorial(n - 1);
}
`;
        description = 'Basic math functions demonstrating AssemblyScript syntax';
        break;

      case 'dataprocessing':
        example = `
// Data processing example
// Process arrays efficiently in WebAssembly

// Memory layout: input array at 0, output at 1024
const INPUT_OFFSET: i32 = 0;
const OUTPUT_OFFSET: i32 = 1024;

export function processArray(length: i32): void {
  for (let i: i32 = 0; i < length; i++) {
    const value = load<i32>(INPUT_OFFSET + i * 4);
    // Apply transformation (example: square each value)
    const result = value * value;
    store<i32>(OUTPUT_OFFSET + i * 4, result);
  }
}

export function sumArray(length: i32): i32 {
  let sum: i32 = 0;
  for (let i: i32 = 0; i < length; i++) {
    sum += load<i32>(INPUT_OFFSET + i * 4);
  }
  return sum;
}

export function findMax(length: i32): i32 {
  let max: i32 = load<i32>(INPUT_OFFSET);
  for (let i: i32 = 1; i < length; i++) {
    const value = load<i32>(INPUT_OFFSET + i * 4);
    if (value > max) max = value;
  }
  return max;
}
`;
        description = 'Data processing with direct memory access for high performance';
        break;

      default:
        return {
          tool: 'assemblyscript_example',
          success: false,
          error: `Unknown example type: ${type}. Available: robot4, basic, dataprocessing`,
        };
    }

    const output = [
      `AssemblyScript Example: ${type}`,
      ``,
      `Description: ${description}`,
      ``,
      '```typescript',
      example.trim(),
      '```',
      ``,
      `To compile this code, use the compile_assemblyscript tool with robot4Mode: ${type === 'robot4'}.`,
    ].join('\n');

    return {
      tool: 'assemblyscript_example',
      success: true,
      output,
    };
  }
}

// Singleton instance
let assemblyScriptTools: AssemblyScriptTools | null = null;

export function getAssemblyScriptTools(): AssemblyScriptTools {
  if (!assemblyScriptTools) {
    assemblyScriptTools = new AssemblyScriptTools();
  }
  return assemblyScriptTools;
}
