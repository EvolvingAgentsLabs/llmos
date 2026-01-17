/**
 * AssemblyScript Tools for LLM Agents
 *
 * Provides tools that allow LLM agents to compile AssemblyScript (TypeScript-like)
 * code to WebAssembly. Works in both browser and desktop (via Electron).
 *
 * AssemblyScript is ideal for:
 * - Web developers familiar with TypeScript
 * - Type-safe robot behaviors
 * - Better error messages than C
 * - Smaller learning curve than Rust
 */

import { ToolDefinition, ToolResult } from './file-tools';
import type { ElectronASCAPI, ASCCompileResult, ASCCompileOptions } from '../../electron/types';
import {
  getBrowserASCCompiler,
  BrowserASCCompileResult,
} from '../runtime/assemblyscript-compiler';
import {
  ROBOT4_EXAMPLES,
  getExampleById,
  getExamplesByCategory,
  searchExamples,
  type Robot4Example,
} from '../runtime/robot4-examples';

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
 * AssemblyScript Tools for LLM Agents
 */
export class AssemblyScriptTools {
  constructor() {
    // Browser compiler is singleton, no need to store reference
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
        description: `Get Robot4 behavior examples in AssemblyScript. Available examples:
- Beginner: blink-led, drive-forward, button-control
- Intermediate: collision-avoidance, line-follower, wall-follower, patrol-behavior
- Advanced: maze-solver, light-seeker, dance-routine`,
        parameters: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'Example ID (e.g., "collision-avoidance", "line-follower", "maze-solver")',
            },
            category: {
              type: 'string',
              enum: ['beginner', 'intermediate', 'advanced'],
              description: 'Filter examples by difficulty category',
            },
            search: {
              type: 'string',
              description: 'Search query to find examples',
            },
            list: {
              type: 'boolean',
              description: 'If true, list all available examples instead of getting a specific one',
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

    // Try Electron first for native compilation
    const electronASC = getElectronASC();

    let result: ASCCompileResult | BrowserASCCompileResult;

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
      // Browser mode - use browser-based compiler
      const browserCompiler = getBrowserASCCompiler();
      result = await browserCompiler.compile(source, {
        name,
        robot4Mode,
        optimize,
        debug,
        runtime: 'stub',
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
    const mode = electronASC ? 'native (Electron)' : 'browser (WASM)';
    const output = [
      `AssemblyScript compilation successful!`,
      ``,
      `Mode: ${mode}`,
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
    const browserCompiler = getBrowserASCCompiler();

    let status: { ready: boolean; version: string; installed: boolean };
    let mode: string;

    if (electronASC) {
      status = await electronASC.getStatus();
      mode = 'Desktop (native asc)';
    } else {
      status = browserCompiler.getStatus();
      mode = 'Browser (WASM-based)';
    }

    const output = [
      `AssemblyScript Compiler Status`,
      ``,
      `Mode: ${mode}`,
      `Ready: ${status.ready ? 'Yes' : 'No'}`,
      `Version: ${status.version}`,
      `Installed: ${status.installed ? 'Yes' : 'No'}`,
      ``,
      `Available Examples: ${ROBOT4_EXAMPLES.length} Robot4 behaviors`,
      `Categories: beginner (${getExamplesByCategory('beginner').length}), intermediate (${getExamplesByCategory('intermediate').length}), advanced (${getExamplesByCategory('advanced').length})`,
      ``,
      status.ready
        ? 'AssemblyScript compilation is available. Use compile_assemblyscript to compile code.'
        : 'Initializing compiler... First compilation may take a few seconds.',
    ].join('\n');

    return {
      tool: 'assemblyscript_status',
      success: true,
      output,
    };
  }

  /**
   * Get example code from the examples library
   */
  private getExample(params: {
    id?: string;
    category?: 'beginner' | 'intermediate' | 'advanced';
    search?: string;
    list?: boolean;
  }): ToolResult {
    const { id, category, search, list } = params;

    // List all examples
    if (list) {
      const output = this.formatExamplesList(ROBOT4_EXAMPLES);
      return {
        tool: 'assemblyscript_example',
        success: true,
        output,
      };
    }

    // Search examples
    if (search) {
      const results = searchExamples(search);
      if (results.length === 0) {
        return {
          tool: 'assemblyscript_example',
          success: false,
          error: `No examples found matching "${search}"`,
        };
      }
      const output = this.formatExamplesList(results);
      return {
        tool: 'assemblyscript_example',
        success: true,
        output,
      };
    }

    // Filter by category
    if (category && !id) {
      const examples = getExamplesByCategory(category);
      const output = this.formatExamplesList(examples);
      return {
        tool: 'assemblyscript_example',
        success: true,
        output,
      };
    }

    // Get specific example by ID
    const exampleId = id || 'collision-avoidance'; // Default to collision avoidance
    const example = getExampleById(exampleId);

    if (!example) {
      const availableIds = ROBOT4_EXAMPLES.map(e => e.id).join(', ');
      return {
        tool: 'assemblyscript_example',
        success: false,
        error: `Example "${exampleId}" not found. Available: ${availableIds}`,
      };
    }

    const output = [
      `# ${example.name}`,
      ``,
      `**Category:** ${example.category}`,
      `**Tags:** ${example.tags.join(', ')}`,
      ``,
      `**Description:**`,
      example.description,
      ``,
      `## Source Code`,
      ``,
      '```typescript',
      example.source.trim(),
      '```',
      ``,
      `## Usage`,
      ``,
      `To compile this example:`,
      '```',
      `compile_assemblyscript(source, { name: "${example.id}", robot4Mode: true })`,
      '```',
      ``,
      `The compiled WASM can be tested in the Robot4 simulator or deployed to ESP32 hardware.`,
    ].join('\n');

    return {
      tool: 'assemblyscript_example',
      success: true,
      output,
    };
  }

  /**
   * Format a list of examples for display
   */
  private formatExamplesList(examples: Robot4Example[]): string {
    const grouped = {
      beginner: examples.filter(e => e.category === 'beginner'),
      intermediate: examples.filter(e => e.category === 'intermediate'),
      advanced: examples.filter(e => e.category === 'advanced'),
    };

    const lines = [
      `# Robot4 AssemblyScript Examples`,
      ``,
      `Total: ${examples.length} examples`,
      ``,
    ];

    if (grouped.beginner.length > 0) {
      lines.push(`## Beginner (${grouped.beginner.length})`);
      for (const ex of grouped.beginner) {
        lines.push(`- **${ex.id}**: ${ex.name} - ${ex.description}`);
      }
      lines.push('');
    }

    if (grouped.intermediate.length > 0) {
      lines.push(`## Intermediate (${grouped.intermediate.length})`);
      for (const ex of grouped.intermediate) {
        lines.push(`- **${ex.id}**: ${ex.name} - ${ex.description}`);
      }
      lines.push('');
    }

    if (grouped.advanced.length > 0) {
      lines.push(`## Advanced (${grouped.advanced.length})`);
      for (const ex of grouped.advanced) {
        lines.push(`- **${ex.id}**: ${ex.name} - ${ex.description}`);
      }
      lines.push('');
    }

    lines.push(`Use \`assemblyscript_example({ id: "example-id" })\` to get the full source code.`);

    return lines.join('\n');
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
