/**
 * Enhanced Git Tools for LLM
 *
 * Extended Git operations using the WebAssembly Git client.
 * Provides clone, pull, branch, log, and diff capabilities.
 */

import { ToolDefinition, ToolResult } from './file-tools';
import { getWasmGitClient, WasmGitClient } from '../git/wasm-git-client';
import type { VolumeType, StatusResult, CommitLog, BranchInfo } from '../git/types';

/**
 * Volume directory mappings
 */
const VOLUME_DIRS: Record<VolumeType, string> = {
  system: '/system-volume',
  team: '/team-volume',
  user: '/user-volume'
};

/**
 * Get GitHub repo URL from environment
 */
function getVolumeRepoUrl(volume: VolumeType): string | null {
  const envKey = `NEXT_PUBLIC_${volume.toUpperCase()}_VOLUME_REPO`;
  const repo = process.env[envKey] || (typeof window !== 'undefined' ? (window as unknown as Record<string, string>)[envKey] : null);

  if (!repo) return null;
  return `https://github.com/${repo}`;
}

/**
 * Enhanced Git Tools class
 */
export class GitToolsEnhanced {
  private clients: Map<VolumeType, WasmGitClient> = new Map();

  /**
   * Get or create a Git client for a volume
   */
  private getClient(volume: VolumeType): WasmGitClient {
    if (!this.clients.has(volume)) {
      this.clients.set(volume, getWasmGitClient(`llmos-${volume}-volume`));
    }
    return this.clients.get(volume)!;
  }

  /**
   * Get enhanced Git tool definitions for LLM
   */
  getToolDefinitions(): ToolDefinition[] {
    return [
      {
        name: 'git_clone',
        description: 'Clone a Git repository into a volume. Use this to initialize a volume with a repository or clone a new repo for collaboration.',
        parameters: {
          type: 'object',
          properties: {
            volume: {
              type: 'string',
              enum: ['team', 'user'],
              description: 'Which volume to clone into (system is read-only)'
            },
            url: {
              type: 'string',
              description: 'Repository URL (e.g., "https://github.com/owner/repo")'
            },
            branch: {
              type: 'string',
              description: 'Branch to clone (default: main)',
              default: 'main'
            },
            shallow: {
              type: 'boolean',
              description: 'Use shallow clone for faster download (default: true)',
              default: true
            }
          },
          required: ['volume', 'url']
        }
      },
      {
        name: 'git_pull',
        description: 'Pull latest changes from the remote repository. Use this to sync with team changes or get updates.',
        parameters: {
          type: 'object',
          properties: {
            volume: {
              type: 'string',
              enum: ['system', 'team', 'user'],
              description: 'Which volume to pull updates for'
            },
            branch: {
              type: 'string',
              description: 'Branch to pull (default: current branch)'
            }
          },
          required: ['volume']
        }
      },
      {
        name: 'git_push',
        description: 'Push committed changes to the remote repository. Use this to share your work with others.',
        parameters: {
          type: 'object',
          properties: {
            volume: {
              type: 'string',
              enum: ['team', 'user'],
              description: 'Which volume to push (system is read-only)'
            },
            force: {
              type: 'boolean',
              description: 'Force push (use with caution)',
              default: false
            }
          },
          required: ['volume']
        }
      },
      {
        name: 'git_status',
        description: 'Show the status of the working directory and staging area. Use this to see what files have changed.',
        parameters: {
          type: 'object',
          properties: {
            volume: {
              type: 'string',
              enum: ['system', 'team', 'user'],
              description: 'Which volume to check status for'
            }
          },
          required: ['volume']
        }
      },
      {
        name: 'git_log',
        description: 'Show commit history. Use this to review what changes have been made.',
        parameters: {
          type: 'object',
          properties: {
            volume: {
              type: 'string',
              enum: ['system', 'team', 'user'],
              description: 'Which volume to show history for'
            },
            limit: {
              type: 'number',
              description: 'Maximum number of commits to show (default: 10)',
              default: 10
            }
          },
          required: ['volume']
        }
      },
      {
        name: 'git_branch',
        description: 'List, create, checkout, or delete branches. Use this for branch management.',
        parameters: {
          type: 'object',
          properties: {
            volume: {
              type: 'string',
              enum: ['team', 'user'],
              description: 'Which volume to manage branches in'
            },
            action: {
              type: 'string',
              enum: ['list', 'create', 'checkout', 'delete'],
              description: 'Branch action to perform'
            },
            branch: {
              type: 'string',
              description: 'Branch name (required for create, checkout, delete)'
            }
          },
          required: ['volume', 'action']
        }
      },
      {
        name: 'git_diff',
        description: 'Show changes between working directory and HEAD, or between commits. Use this to review specific changes.',
        parameters: {
          type: 'object',
          properties: {
            volume: {
              type: 'string',
              enum: ['system', 'team', 'user'],
              description: 'Which volume to show diff for'
            },
            path: {
              type: 'string',
              description: 'Specific file path to diff (optional, shows all changes if not specified)'
            }
          },
          required: ['volume']
        }
      },
      {
        name: 'git_stash',
        description: 'Temporarily save changes. Use this to switch branches without committing.',
        parameters: {
          type: 'object',
          properties: {
            volume: {
              type: 'string',
              enum: ['team', 'user'],
              description: 'Which volume to stash changes in'
            },
            action: {
              type: 'string',
              enum: ['push', 'pop', 'list', 'drop'],
              description: 'Stash action to perform',
              default: 'push'
            },
            message: {
              type: 'string',
              description: 'Message for stash (optional, for push action)'
            }
          },
          required: ['volume']
        }
      }
    ];
  }

  /**
   * Execute a Git tool call from the LLM
   */
  async executeTool(toolName: string, parameters: Record<string, unknown>): Promise<ToolResult> {
    try {
      let result: Omit<ToolResult, 'tool'>;

      switch (toolName) {
        case 'git_clone':
          result = await this.gitClone(parameters as {
            volume: VolumeType;
            url: string;
            branch?: string;
            shallow?: boolean;
          });
          break;

        case 'git_pull':
          result = await this.gitPull(parameters as {
            volume: VolumeType;
            branch?: string;
          });
          break;

        case 'git_push':
          result = await this.gitPush(parameters as {
            volume: VolumeType;
            force?: boolean;
          });
          break;

        case 'git_status':
          result = await this.gitStatus(parameters as {
            volume: VolumeType;
          });
          break;

        case 'git_log':
          result = await this.gitLog(parameters as {
            volume: VolumeType;
            limit?: number;
          });
          break;

        case 'git_branch':
          result = await this.gitBranch(parameters as {
            volume: VolumeType;
            action: 'list' | 'create' | 'checkout' | 'delete';
            branch?: string;
          });
          break;

        case 'git_diff':
          result = await this.gitDiff(parameters as {
            volume: VolumeType;
            path?: string;
          });
          break;

        case 'git_stash':
          result = await this.gitStash(parameters as {
            volume: VolumeType;
            action?: 'push' | 'pop' | 'list' | 'drop';
            message?: string;
          });
          break;

        default:
          return {
            tool: toolName,
            success: false,
            error: `Unknown Git tool: ${toolName}`
          };
      }

      return { tool: toolName, ...result };
    } catch (error) {
      return {
        tool: toolName,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Clone repository
   */
  private async gitClone(params: {
    volume: VolumeType;
    url: string;
    branch?: string;
    shallow?: boolean;
  }): Promise<Omit<ToolResult, 'tool'>> {
    if (params.volume === 'system') {
      return {
        success: false,
        error: 'Cannot clone to system volume (read-only)'
      };
    }

    const client = this.getClient(params.volume);
    await client.initialize();

    const dir = VOLUME_DIRS[params.volume];

    // Check if already cloned
    const isRepo = await client.isRepository(dir);
    if (isRepo) {
      return {
        success: false,
        error: `Volume ${params.volume} already contains a Git repository. Use git_pull to update.`
      };
    }

    await client.clone({
      url: params.url,
      dir,
      ref: params.branch || 'main',
      depth: params.shallow !== false ? 1 : undefined,
      singleBranch: true
    });

    return {
      success: true,
      output: `Successfully cloned ${params.url} to ${params.volume} volume` +
        (params.branch ? ` (branch: ${params.branch})` : '')
    };
  }

  /**
   * Pull latest changes
   */
  private async gitPull(params: {
    volume: VolumeType;
    branch?: string;
  }): Promise<Omit<ToolResult, 'tool'>> {
    const client = this.getClient(params.volume);
    await client.initialize();

    const dir = VOLUME_DIRS[params.volume];

    // Check if repository exists
    const isRepo = await client.isRepository(dir);
    if (!isRepo) {
      // Try to clone from configured repo
      const repoUrl = getVolumeRepoUrl(params.volume);
      if (repoUrl) {
        await client.clone({
          url: repoUrl,
          dir,
          ref: params.branch || 'main',
          depth: 1,
          singleBranch: true
        });
        return {
          success: true,
          output: `Initialized ${params.volume} volume from ${repoUrl}`
        };
      }
      return {
        success: false,
        error: `No repository found in ${params.volume} volume. Use git_clone first.`
      };
    }

    await client.pull(dir, params.branch);

    return {
      success: true,
      output: `Successfully pulled latest changes to ${params.volume} volume` +
        (params.branch ? ` (branch: ${params.branch})` : '')
    };
  }

  /**
   * Push changes
   */
  private async gitPush(params: {
    volume: VolumeType;
    force?: boolean;
  }): Promise<Omit<ToolResult, 'tool'>> {
    if (params.volume === 'system') {
      return {
        success: false,
        error: 'Cannot push from system volume (read-only)'
      };
    }

    const client = this.getClient(params.volume);
    await client.initialize();

    const dir = VOLUME_DIRS[params.volume];

    await client.push(dir, undefined, params.force || false);

    return {
      success: true,
      output: `Successfully pushed changes from ${params.volume} volume to remote`
    };
  }

  /**
   * Get status
   */
  private async gitStatus(params: {
    volume: VolumeType;
  }): Promise<Omit<ToolResult, 'tool'>> {
    const client = this.getClient(params.volume);
    await client.initialize();

    const dir = VOLUME_DIRS[params.volume];

    const isRepo = await client.isRepository(dir);
    if (!isRepo) {
      return {
        success: true,
        output: `${params.volume} volume: No Git repository initialized`
      };
    }

    const status: StatusResult = await client.status(dir);

    let output = `${params.volume} volume status:\n`;
    output += `Branch: ${status.branch}\n`;

    if (status.ahead > 0) {
      output += `Ahead of remote by ${status.ahead} commit(s)\n`;
    }
    if (status.behind > 0) {
      output += `Behind remote by ${status.behind} commit(s)\n`;
    }

    if (status.files.length === 0) {
      output += '\nWorking directory clean';
    } else {
      output += '\nChanges:\n';
      for (const file of status.files) {
        const staged = file.staged ? '[staged]' : '';
        output += `  ${file.status}: ${file.path} ${staged}\n`;
      }
    }

    return {
      success: true,
      output
    };
  }

  /**
   * Get commit log
   */
  private async gitLog(params: {
    volume: VolumeType;
    limit?: number;
  }): Promise<Omit<ToolResult, 'tool'>> {
    const client = this.getClient(params.volume);
    await client.initialize();

    const dir = VOLUME_DIRS[params.volume];

    const isRepo = await client.isRepository(dir);
    if (!isRepo) {
      return {
        success: false,
        error: `No repository found in ${params.volume} volume`
      };
    }

    const commits: CommitLog[] = await client.log(dir, params.limit || 10);

    let output = `${params.volume} volume commit history:\n\n`;

    for (const commit of commits) {
      const date = new Date(commit.author.timestamp * 1000);
      const dateStr = date.toLocaleString();

      output += `commit ${commit.oid.substring(0, 7)}\n`;
      output += `Author: ${commit.author.name} <${commit.author.email}>\n`;
      output += `Date:   ${dateStr}\n`;
      output += `\n    ${commit.message.split('\n')[0]}\n\n`;
    }

    return {
      success: true,
      output
    };
  }

  /**
   * Branch operations
   */
  private async gitBranch(params: {
    volume: VolumeType;
    action: 'list' | 'create' | 'checkout' | 'delete';
    branch?: string;
  }): Promise<Omit<ToolResult, 'tool'>> {
    if (params.volume === 'system' && params.action !== 'list') {
      return {
        success: false,
        error: 'Cannot modify branches in system volume (read-only)'
      };
    }

    const client = this.getClient(params.volume);
    await client.initialize();

    const dir = VOLUME_DIRS[params.volume];

    switch (params.action) {
      case 'list': {
        const branches: BranchInfo[] = await client.listBranches(dir);
        let output = `Branches in ${params.volume} volume:\n`;
        for (const branch of branches) {
          const marker = branch.current ? '* ' : '  ';
          output += `${marker}${branch.name}\n`;
        }
        return { success: true, output };
      }

      case 'create': {
        if (!params.branch) {
          return { success: false, error: 'Branch name is required for create action' };
        }
        await client.createBranch(dir, params.branch, false);
        return {
          success: true,
          output: `Created branch '${params.branch}' in ${params.volume} volume`
        };
      }

      case 'checkout': {
        if (!params.branch) {
          return { success: false, error: 'Branch name is required for checkout action' };
        }
        await client.checkout(dir, params.branch);
        return {
          success: true,
          output: `Switched to branch '${params.branch}' in ${params.volume} volume`
        };
      }

      case 'delete': {
        if (!params.branch) {
          return { success: false, error: 'Branch name is required for delete action' };
        }
        await client.deleteBranch(dir, params.branch);
        return {
          success: true,
          output: `Deleted branch '${params.branch}' from ${params.volume} volume`
        };
      }

      default:
        return { success: false, error: `Unknown branch action: ${params.action}` };
    }
  }

  /**
   * Show diff
   */
  private async gitDiff(params: {
    volume: VolumeType;
    path?: string;
  }): Promise<Omit<ToolResult, 'tool'>> {
    const client = this.getClient(params.volume);
    await client.initialize();

    const dir = VOLUME_DIRS[params.volume];

    const status = await client.status(dir);
    const changedFiles = status.files.filter(f =>
      f.status !== 'unmodified' && (!params.path || f.path === params.path)
    );

    if (changedFiles.length === 0) {
      return {
        success: true,
        output: params.path
          ? `No changes in ${params.path}`
          : 'No changes in working directory'
      };
    }

    // For now, show simple status-based diff
    // Full diff implementation would require reading file contents
    let output = `Changes in ${params.volume} volume:\n\n`;

    for (const file of changedFiles) {
      output += `--- ${file.path}\n`;
      output += `Status: ${file.status}${file.staged ? ' (staged)' : ''}\n\n`;
    }

    return {
      success: true,
      output
    };
  }

  /**
   * Stash operations (simplified implementation)
   */
  private async gitStash(params: {
    volume: VolumeType;
    action?: 'push' | 'pop' | 'list' | 'drop';
    message?: string;
  }): Promise<Omit<ToolResult, 'tool'>> {
    // Note: isomorphic-git doesn't have native stash support
    // This is a simplified implementation using branches

    return {
      success: false,
      error: 'Stash operations are not yet implemented in the browser Git client. ' +
        'Consider committing your changes to a temporary branch instead.'
    };
  }
}

// Singleton instance
let gitToolsEnhanced: GitToolsEnhanced | null = null;

export function getGitToolsEnhanced(): GitToolsEnhanced {
  if (!gitToolsEnhanced) {
    gitToolsEnhanced = new GitToolsEnhanced();
  }
  return gitToolsEnhanced;
}
