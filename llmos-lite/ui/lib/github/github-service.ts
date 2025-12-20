/**
 * GitHub Service
 *
 * Handles all GitHub API interactions for volume management
 */

import { Artifact, ArtifactVolume } from '@/lib/artifacts/types';
import { ArtifactStorage, StorageConfig } from '@/lib/artifacts/artifact-storage';

export interface GitHubConfig {
  token: string;
  repositories: {
    system?: string;
    team?: string;
    user?: string;
  };
}

export interface CommitResult {
  commitHash: string;
  filesCommitted: number;
  filesChanged: string[];
}

export class GitHubService {
  private storage: ArtifactStorage;
  private config: GitHubConfig;

  constructor(config: GitHubConfig) {
    this.config = config;
    this.storage = new ArtifactStorage({
      githubToken: config.token,
      repositories: config.repositories,
    });
  }

  /**
   * Save multiple artifacts to GitHub in a single commit
   */
  async commitArtifacts(
    artifacts: Artifact[],
    commitMessage: string,
    volume: ArtifactVolume
  ): Promise<CommitResult> {
    const repo = this.config.repositories[volume];
    if (!repo) {
      throw new Error(`No repository configured for volume: ${volume}`);
    }

    const [owner, repoName] = repo.split('/');
    const filesChanged: string[] = [];
    let lastCommitHash = '';

    try {
      // Save each artifact
      for (const artifact of artifacts) {
        const result = await this.storage.saveToGitHub(artifact);
        filesChanged.push(result.filePath);
        lastCommitHash = result.commitHash;
      }

      return {
        commitHash: lastCommitHash,
        filesCommitted: artifacts.length,
        filesChanged,
      };
    } catch (error) {
      console.error('Failed to commit artifacts:', error);
      throw new Error(`Failed to commit artifacts: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Push commits to remote
   */
  async pushToRemote(volume: ArtifactVolume): Promise<void> {
    const repo = this.config.repositories[volume];
    if (!repo) {
      throw new Error(`No repository configured for volume: ${volume}`);
    }

    // Note: GitHub API automatically pushes on commit
    // This method is here for API compatibility
    console.log(`Commits to ${repo} are automatically pushed via GitHub API`);
  }

  /**
   * Pull latest changes from remote
   */
  async pullFromRemote(volume: ArtifactVolume): Promise<Artifact[]> {
    try {
      const artifacts = await this.storage.loadFromGitHub(volume);
      return artifacts as Artifact[];
    } catch (error) {
      console.error(`Failed to pull from ${volume}:`, error);
      throw new Error(`Failed to pull from remote: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Check if volume is synced with remote
   */
  async checkSyncStatus(volume: ArtifactVolume): Promise<{
    synced: boolean;
    behindBy: number;
    aheadBy: number;
    lastSync: Date | null;
  }> {
    const repo = this.config.repositories[volume];
    if (!repo) {
      throw new Error(`No repository configured for volume: ${volume}`);
    }

    try {
      const [owner, repoName] = repo.split('/');
      const url = `https://api.github.com/repos/${owner}/${repoName}/commits/main`;

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${this.config.token}`,
          Accept: 'application/vnd.github.v3+json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch sync status');
      }

      const data = await response.json();
      const lastSync = data.commit?.committer?.date
        ? new Date(data.commit.committer.date)
        : null;

      // For now, assume synced if we can fetch the commit
      return {
        synced: true,
        behindBy: 0,
        aheadBy: 0,
        lastSync,
      };
    } catch (error) {
      console.error(`Failed to check sync status for ${volume}:`, error);
      return {
        synced: false,
        behindBy: 0,
        aheadBy: 0,
        lastSync: null,
      };
    }
  }

  /**
   * Get repository info
   */
  async getRepositoryInfo(volume: ArtifactVolume): Promise<{
    name: string;
    owner: string;
    url: string;
    defaultBranch: string;
    lastUpdated: Date | null;
  } | null> {
    const repo = this.config.repositories[volume];
    if (!repo) return null;

    try {
      const [owner, repoName] = repo.split('/');
      const url = `https://api.github.com/repos/${owner}/${repoName}`;

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${this.config.token}`,
          Accept: 'application/vnd.github.v3+json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch repository info');
      }

      const data = await response.json();

      return {
        name: data.name,
        owner: data.owner.login,
        url: data.html_url,
        defaultBranch: data.default_branch || 'main',
        lastUpdated: data.updated_at ? new Date(data.updated_at) : null,
      };
    } catch (error) {
      console.error(`Failed to get repository info for ${volume}:`, error);
      return null;
    }
  }

  /**
   * Validate GitHub token
   */
  async validateToken(): Promise<boolean> {
    try {
      const response = await fetch('https://api.github.com/user', {
        headers: {
          Authorization: `Bearer ${this.config.token}`,
          Accept: 'application/vnd.github.v3+json',
        },
      });

      return response.ok;
    } catch (error) {
      console.error('Failed to validate GitHub token:', error);
      return false;
    }
  }

  /**
   * Get authenticated user info
   */
  async getUserInfo(): Promise<{
    login: string;
    name: string;
    email: string | null;
    avatarUrl: string;
  } | null> {
    try {
      const response = await fetch('https://api.github.com/user', {
        headers: {
          Authorization: `Bearer ${this.config.token}`,
          Accept: 'application/vnd.github.v3+json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch user info');
      }

      const data = await response.json();

      return {
        login: data.login,
        name: data.name || data.login,
        email: data.email,
        avatarUrl: data.avatar_url,
      };
    } catch (error) {
      console.error('Failed to get user info:', error);
      return null;
    }
  }

  /**
   * Create a new repository for a volume
   */
  async createRepository(
    name: string,
    isPrivate: boolean = true,
    description?: string
  ): Promise<string> {
    try {
      const response = await fetch('https://api.github.com/user/repos', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.token}`,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name,
          private: isPrivate,
          description: description || `LLMos-Lite ${name} volume`,
          auto_init: true,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to create repository');
      }

      const data = await response.json();
      return data.full_name; // Returns "owner/repo"
    } catch (error) {
      console.error('Failed to create repository:', error);
      throw error;
    }
  }
}

// Singleton instance (will be initialized with config from settings)
let githubServiceInstance: GitHubService | null = null;

export function initializeGitHubService(config: GitHubConfig): GitHubService {
  githubServiceInstance = new GitHubService(config);
  return githubServiceInstance;
}

export function getGitHubService(): GitHubService | null {
  return githubServiceInstance;
}
