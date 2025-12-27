/**
 * Applet Tools - The Infinite App Store LLM Interface
 *
 * These tools allow the LLM to generate, compile, and manage
 * interactive React applets that users can interact with.
 *
 * Key Concept: Instead of just returning text, the LLM can
 * generate a fully interactive UI that users can use.
 */

import { getVolumeFileSystem, VolumeType } from '../volumes/file-operations';
import {
  AppletRuntime,
  AppletMetadata,
  AppletFile,
  generateAppletId,
} from '../runtime/applet-runtime';
import { ToolDefinition, ToolResult } from './file-tools';

export interface AppletToolResult extends ToolResult {
  applet?: {
    id: string;
    code: string;
    metadata: AppletMetadata;
    filePath?: string;
    volume?: VolumeType;
  };
}

/**
 * Applet Tools for LLM
 *
 * These tools allow the LLM to:
 * - Generate interactive React applets
 * - Save applets to the file system
 * - Load existing applets
 * - Execute applet actions
 */
export class AppletTools {
  private fs = getVolumeFileSystem();

  /**
   * Get applet tool definitions for LLM
   */
  getToolDefinitions(): ToolDefinition[] {
    return [
      {
        name: 'generate_applet',
        description: `Generate an interactive React applet that the user can interact with.

Use this when the user needs:
- A form or wizard to collect information
- A dashboard or visualization tool
- A calculator or converter
- Any interactive interface

The applet will appear in the UI and users can interact with it in real-time.
The applet code should be a React component using hooks (useState, useEffect, etc.).

IMPORTANT:
- The component MUST be named "Component", "Applet", or "App"
- Use Tailwind CSS for styling (dark theme: bg-gray-800, text-gray-200, etc.)
- Use the onSubmit prop to return data to the system
- Available hooks: useState, useEffect, useCallback, useMemo, useRef`,
        parameters: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Name of the applet (e.g., "NDA Generator", "Expense Calculator")',
            },
            description: {
              type: 'string',
              description: 'Brief description of what the applet does',
            },
            code: {
              type: 'string',
              description: `The React component code (TSX). Example:

function Component({ onSubmit }) {
  const [name, setName] = useState('');

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-xl font-bold text-gray-200">Hello Form</h2>
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full p-2 bg-gray-700 border border-gray-600 rounded text-white"
        placeholder="Enter name..."
      />
      <button
        onClick={() => onSubmit({ name })}
        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded"
      >
        Submit
      </button>
    </div>
  );
}`,
            },
            tags: {
              type: 'array',
              items: { type: 'string' },
              description: 'Tags for categorization (e.g., ["finance", "calculator"])',
            },
            save_to_volume: {
              type: 'string',
              enum: ['team', 'user', 'none'],
              description: 'Volume to save the applet to (or "none" for temporary)',
              default: 'none',
            },
            save_path: {
              type: 'string',
              description:
                'Path to save the applet (e.g., "applets/nda-generator.app"). Required if save_to_volume is not "none"',
            },
          },
          required: ['name', 'description', 'code'],
        },
      },
      {
        name: 'load_applet',
        description: 'Load an existing applet from a volume to display to the user.',
        parameters: {
          type: 'object',
          properties: {
            volume: {
              type: 'string',
              enum: ['system', 'team', 'user'],
              description: 'Which volume the applet is in',
            },
            path: {
              type: 'string',
              description: 'Path to the applet file (e.g., "applets/calculator.app")',
            },
          },
          required: ['volume', 'path'],
        },
      },
      {
        name: 'list_applets',
        description: 'List available applets in a volume.',
        parameters: {
          type: 'object',
          properties: {
            volume: {
              type: 'string',
              enum: ['system', 'team', 'user'],
              description: 'Which volume to list applets from',
            },
            directory: {
              type: 'string',
              description: 'Directory to search in (default: "applets")',
              default: 'applets',
            },
          },
          required: ['volume'],
        },
      },
      {
        name: 'update_applet_state',
        description: 'Update the saved state of an applet for persistence.',
        parameters: {
          type: 'object',
          properties: {
            volume: {
              type: 'string',
              enum: ['team', 'user'],
              description: 'Volume where the applet is stored',
            },
            path: {
              type: 'string',
              description: 'Path to the applet file',
            },
            state: {
              type: 'object',
              description: 'The state object to persist',
            },
          },
          required: ['volume', 'path', 'state'],
        },
      },
    ];
  }

  /**
   * Execute an applet tool call from the LLM
   */
  async executeTool(toolName: string, parameters: any): Promise<AppletToolResult> {
    try {
      switch (toolName) {
        case 'generate_applet':
          return await this.generateApplet(parameters);

        case 'load_applet':
          return await this.loadApplet(parameters);

        case 'list_applets':
          return await this.listApplets(parameters);

        case 'update_applet_state':
          return await this.updateAppletState(parameters);

        default:
          return {
            success: false,
            error: `Unknown applet tool: ${toolName}`,
          };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Generate an applet from LLM code
   */
  private async generateApplet(params: {
    name: string;
    description: string;
    code: string;
    tags?: string[];
    save_to_volume?: 'team' | 'user' | 'none';
    save_path?: string;
  }): Promise<AppletToolResult> {
    // Validate the code
    const validation = AppletRuntime.validate(params.code);
    if (!validation.valid) {
      return {
        success: false,
        error: `Invalid applet code: ${validation.errors.join(', ')}`,
      };
    }

    // Create metadata
    const metadata: AppletMetadata = {
      id: generateAppletId(),
      name: params.name,
      description: params.description,
      version: '1.0.0',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      tags: params.tags,
    };

    // Save to volume if requested
    let filePath: string | undefined;
    let volume: VolumeType | undefined;

    if (params.save_to_volume && params.save_to_volume !== 'none' && params.save_path) {
      const appletFile: AppletFile = {
        metadata,
        code: params.code,
        state: {},
      };

      const content = AppletRuntime.serializeFile(appletFile);
      await this.fs.writeFile(params.save_to_volume, params.save_path, content);

      filePath = params.save_path;
      volume = params.save_to_volume;
    }

    return {
      success: true,
      output: `Generated applet: ${params.name}`,
      applet: {
        id: metadata.id,
        code: params.code,
        metadata,
        filePath,
        volume,
      },
    };
  }

  /**
   * Load an existing applet
   */
  private async loadApplet(params: {
    volume: VolumeType;
    path: string;
  }): Promise<AppletToolResult> {
    const content = await this.fs.readFile(params.volume, params.path);
    const appletFile = AppletRuntime.parseFile(content);

    return {
      success: true,
      output: `Loaded applet: ${appletFile.metadata.name}`,
      applet: {
        id: appletFile.metadata.id,
        code: appletFile.code,
        metadata: appletFile.metadata,
        filePath: params.path,
        volume: params.volume,
      },
    };
  }

  /**
   * List applets in a directory
   */
  private async listApplets(params: {
    volume: VolumeType;
    directory?: string;
  }): Promise<AppletToolResult> {
    const directory = params.directory || 'applets';
    const files = await this.fs.listFiles(params.volume, directory);

    const appletFiles = files.filter((f) => f.path.endsWith('.app') || f.path.endsWith('.tsx'));

    const output =
      appletFiles.length > 0
        ? `Applets in ${params.volume}-volume/${directory}:\n\n` +
          appletFiles.map((f) => `- ${f.path}`).join('\n')
        : `No applets found in ${params.volume}-volume/${directory}`;

    return {
      success: true,
      output,
    };
  }

  /**
   * Update applet state
   */
  private async updateAppletState(params: {
    volume: VolumeType;
    path: string;
    state: Record<string, unknown>;
  }): Promise<AppletToolResult> {
    // Read existing applet
    const content = await this.fs.readFile(params.volume, params.path);
    const appletFile = AppletRuntime.parseFile(content);

    // Update state
    appletFile.state = params.state;
    appletFile.metadata.updatedAt = new Date().toISOString();

    // Save back
    const newContent = AppletRuntime.serializeFile(appletFile);
    await this.fs.writeFile(params.volume, params.path, newContent);

    return {
      success: true,
      output: `Updated state for applet: ${appletFile.metadata.name}`,
      applet: {
        id: appletFile.metadata.id,
        code: appletFile.code,
        metadata: appletFile.metadata,
        filePath: params.path,
        volume: params.volume,
      },
    };
  }
}

// Singleton instance
let appletTools: AppletTools | null = null;

export function getAppletTools(): AppletTools {
  if (!appletTools) {
    appletTools = new AppletTools();
  }
  return appletTools;
}

/**
 * System prompt addition for applet-aware conversations
 */
export const APPLET_SYSTEM_PROMPT = `
## Interactive Applet Generation

You have the ability to generate interactive React applets instead of just text responses.

When a user asks for something that would benefit from an interactive interface (forms, dashboards, calculators, wizards, etc.), use the \`generate_applet\` tool to create a React component.

### When to Generate an Applet:
- User needs to fill out a form or wizard
- User needs a calculator or converter
- User needs a data visualization or dashboard
- User needs an interactive configuration tool
- Any task that would be better as a UI than text

### Applet Guidelines:
1. Use Tailwind CSS for styling (dark theme: bg-gray-800, text-gray-200, etc.)
2. The component must be named "Component", "Applet", or "App"
3. Use the \`onSubmit\` prop to return data when the user completes a task
4. Keep the UI clean and focused on the task
5. Use appropriate form inputs, buttons, and feedback

### Example:
If user says "Help me calculate my monthly budget", generate a Budget Calculator applet with inputs for income, expenses, and a results display.
`;
