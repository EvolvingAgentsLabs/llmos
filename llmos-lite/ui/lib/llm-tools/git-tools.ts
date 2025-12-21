import { getVolumeFileSystem } from '../volumes/file-operations';
import { ToolDefinition, ToolResult } from './tool-definition';

export class GitTools {
  private fs = getVolumeFileSystem();

  getToolDefinitions(): ToolDefinition[] {
    return [
      {
        name: 'git_commit',
        description: 'Commits all staged changes for a specific volume to the remote repository.',
        parameters: {
          type: 'object',
          properties: {
            volume: {
              type: 'string',
              enum: ['team', 'user'],
              description: 'The volume to commit changes to. System volume is read-only.',
            },
            message: {
              type: 'string',
              description: 'The commit message.',
            },
          },
          required: ['volume', 'message'],
        },
      },
    ];
  }

  async executeTool(toolName: string, parameters: any): Promise<ToolResult> {
    if (toolName !== 'git_commit') {
      throw new Error(`Unknown tool: ${toolName}`);
    }

    try {
      await this.fs.commit(parameters.volume, parameters.message);
      return {
        success: true,
        output: `Successfully committed changes to ${parameters.volume} volume.`,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: `Failed to commit changes: ${errorMessage}`,
      };
    }
  }
}

let gitTools: GitTools | null = null;

export function getGitTools(): GitTools {
  if (!gitTools) {
    gitTools = new GitTools();
  }
  return gitTools;
}
