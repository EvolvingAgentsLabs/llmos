/**
 * LLM File Tools - Claude Code Style
 *
 * Tools that the LLM can use to manipulate files in volumes
 * Similar to Claude Code's Write, Edit, Read, and Bash tools
 */

import { getVolumeFileSystem, VolumeType } from '../volumes/file-operations';
import { getGitOperations } from '../volumes/git-operations';

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: string;
    properties: Record<string, any>;
    required: string[];
  };
}

export interface ToolResult {
  success: boolean;
  output?: string;
  error?: string;
  fileChanges?: {
    path: string;
    volume: VolumeType;
    operation: 'write' | 'edit' | 'delete';
    diff?: string[];
  }[];
}

/**
 * File Tools for LLM
 *
 * These tools allow the LLM to:
 * - Read files from volumes
 * - Write new files to volumes
 * - Edit existing files
 * - Delete files
 * - Commit changes to Git
 */
export class FileTools {
  private fs = getVolumeFileSystem();
  private git = getGitOperations();

  /**
   * Get tool definitions for LLM
   * These are passed to the LLM API in the tools parameter
   */
  getToolDefinitions(): ToolDefinition[] {
    return [
      {
        name: 'read_file',
        description: 'Read a file from a volume (system, team, or user). Use this to view file contents before editing.',
        parameters: {
          type: 'object',
          properties: {
            volume: {
              type: 'string',
              enum: ['system', 'team', 'user'],
              description: 'Which volume the file is in'
            },
            path: {
              type: 'string',
              description: 'Path to the file within the volume (e.g., "circuits/vqe.py")'
            }
          },
          required: ['volume', 'path']
        }
      },
      {
        name: 'write_file',
        description: 'Create a new file in a volume. Cannot write to system volume (read-only). Use this to create new Python files, notebooks, or other code.',
        parameters: {
          type: 'object',
          properties: {
            volume: {
              type: 'string',
              enum: ['team', 'user'],
              description: 'Which volume to write to (system is read-only)'
            },
            path: {
              type: 'string',
              description: 'Path for the new file (e.g., "circuits/h2_vqe.py")'
            },
            content: {
              type: 'string',
              description: 'Full content of the file to write'
            }
          },
          required: ['volume', 'path', 'content']
        }
      },
      {
        name: 'edit_file',
        description: 'Edit an existing file in a volume. Provide old and new content to make precise changes. Cannot edit system volume files.',
        parameters: {
          type: 'object',
          properties: {
            volume: {
              type: 'string',
              enum: ['team', 'user'],
              description: 'Which volume the file is in'
            },
            path: {
              type: 'string',
              description: 'Path to the file to edit'
            },
            old_content: {
              type: 'string',
              description: 'The exact content to replace (for conflict detection)'
            },
            new_content: {
              type: 'string',
              description: 'The new content to replace it with'
            }
          },
          required: ['volume', 'path', 'old_content', 'new_content']
        }
      },
      {
        name: 'delete_file',
        description: 'Delete a file from a volume. Cannot delete from system volume.',
        parameters: {
          type: 'object',
          properties: {
            volume: {
              type: 'string',
              enum: ['team', 'user'],
              description: 'Which volume the file is in'
            },
            path: {
              type: 'string',
              description: 'Path to the file to delete'
            }
          },
          required: ['volume', 'path']
        }
      },
      {
        name: 'list_files',
        description: 'List files in a volume directory. Use this to explore what files exist.',
        parameters: {
          type: 'object',
          properties: {
            volume: {
              type: 'string',
              enum: ['system', 'team', 'user'],
              description: 'Which volume to list files from'
            },
            directory: {
              type: 'string',
              description: 'Directory path (e.g., "circuits" or "" for root)',
              default: ''
            }
          },
          required: ['volume']
        }
      },
      {
        name: 'git_commit',
        description: 'Commit modified files to the volume repository. Use this to save work to Git.',
        parameters: {
          type: 'object',
          properties: {
            volume: {
              type: 'string',
              enum: ['team', 'user'],
              description: 'Which volume to commit'
            },
            message: {
              type: 'string',
              description: 'Commit message describing the changes'
            },
            files: {
              type: 'array',
              items: { type: 'string' },
              description: 'List of file paths to commit (or empty array for all modified files)'
            }
          },
          required: ['volume', 'message']
        }
      }
    ];
  }

  /**
   * Execute a tool call from the LLM
   */
  async executeTool(toolName: string, parameters: any): Promise<ToolResult> {
    try {
      switch (toolName) {
        case 'read_file':
          return await this.readFile(parameters);

        case 'write_file':
          return await this.writeFile(parameters);

        case 'edit_file':
          return await this.editFile(parameters);

        case 'delete_file':
          return await this.deleteFile(parameters);

        case 'list_files':
          return await this.listFiles(parameters);

        case 'git_commit':
          return await this.gitCommit(parameters);

        default:
          return {
            success: false,
            error: `Unknown tool: ${toolName}`
          };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Read file tool implementation
   */
  private async readFile(params: {
    volume: VolumeType;
    path: string;
  }): Promise<ToolResult> {
    const content = await this.fs.readFile(params.volume, params.path);

    return {
      success: true,
      output: `File: ${params.volume}-volume/${params.path}\n\n${content}`
    };
  }

  /**
   * Write file tool implementation
   */
  private async writeFile(params: {
    volume: VolumeType;
    path: string;
    content: string;
  }): Promise<ToolResult> {
    await this.fs.writeFile(params.volume, params.path, params.content);

    return {
      success: true,
      output: `Created file: ${params.volume}-volume/${params.path}`,
      fileChanges: [
        {
          path: params.path,
          volume: params.volume,
          operation: 'write',
          diff: params.content.split('\n').map(line => `+ ${line}`)
        }
      ]
    };
  }

  /**
   * Edit file tool implementation
   */
  private async editFile(params: {
    volume: VolumeType;
    path: string;
    old_content: string;
    new_content: string;
  }): Promise<ToolResult> {
    await this.fs.editFile(
      params.volume,
      params.path,
      params.old_content,
      params.new_content
    );

    // Generate diff
    const diff = this.git.generateDiff(params.old_content, params.new_content);

    return {
      success: true,
      output: `Modified file: ${params.volume}-volume/${params.path}`,
      fileChanges: [
        {
          path: params.path,
          volume: params.volume,
          operation: 'edit',
          diff
        }
      ]
    };
  }

  /**
   * Delete file tool implementation
   */
  private async deleteFile(params: {
    volume: VolumeType;
    path: string;
  }): Promise<ToolResult> {
    await this.fs.deleteFile(params.volume, params.path);

    return {
      success: true,
      output: `Deleted file: ${params.volume}-volume/${params.path}`,
      fileChanges: [
        {
          path: params.path,
          volume: params.volume,
          operation: 'delete'
        }
      ]
    };
  }

  /**
   * List files tool implementation
   */
  private async listFiles(params: {
    volume: VolumeType;
    directory?: string;
  }): Promise<ToolResult> {
    const files = await this.fs.listFiles(params.volume, params.directory || '');

    const output = files.length > 0
      ? `Files in ${params.volume}-volume/${params.directory || ''}:\n\n` +
        files.map(f => `- ${f.path}`).join('\n')
      : `No files found in ${params.volume}-volume/${params.directory || ''}`;

    return {
      success: true,
      output
    };
  }

  /**
   * Git commit tool implementation
   */
  private async gitCommit(params: {
    volume: VolumeType;
    message: string;
    files?: string[];
  }): Promise<ToolResult> {
    // Get modified files
    const modifiedFiles = this.fs.getModifiedFiles(params.volume);

    if (modifiedFiles.length === 0) {
      return {
        success: false,
        error: 'No modified files to commit'
      };
    }

    // Determine which files to commit
    const filesToCommit = params.files && params.files.length > 0
      ? params.files
      : modifiedFiles.map(f => f.path);

    const output = `Committed ${filesToCommit.length} file(s) to ${params.volume} volume:\n` +
      filesToCommit.map(f => `- ${f}`).join('\n') +
      `\n\nMessage: "${params.message}"`;

    return {
      success: true,
      output
    };
  }
}

// Singleton instance
let fileTools: FileTools | null = null;

export function getFileTools(): FileTools {
  if (!fileTools) {
    fileTools = new FileTools();
  }
  return fileTools;
}
