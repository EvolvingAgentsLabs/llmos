/**
 * Git Service Layer
 * Handles all Git operations via GitHub API (client-side)
 * Uses GitHub's REST API to simulate git commit/push/pull operations
 */

import { GitHubAuth, type GitHubUser } from './github-auth';

export interface GitCommit {
  sha: string;
  message: string;
  author: {
    name: string;
    email: string;
  };
  timestamp: string;
  files: Array<{
    path: string;
    content: string;
  }>;
}

export interface GitRepository {
  owner: string;
  repo: string;
  branch: string;
}

export type VolumeType = 'user' | 'team' | 'system';

export class GitService {
  private static getAccessToken(): string {
    const user = GitHubAuth.getUser();
    if (!user) {
      throw new Error('Not authenticated with GitHub');
    }
    return user.access_token;
  }

  /**
   * Get repository configuration for a volume
   */
  static getRepoForVolume(volume: VolumeType, user: GitHubUser): GitRepository {
    switch (volume) {
      case 'user':
        return {
          owner: user.login,
          repo: `llmunix-user-${user.login}`,
          branch: 'main',
        };
      case 'team':
        // In production, this would be configurable per team
        return {
          owner: user.login,
          repo: 'llmunix-team-volumes',
          branch: 'main',
        };
      case 'system':
        return {
          owner: 'llmunix',
          repo: 'system-volumes',
          branch: 'main',
        };
    }
  }

  /**
   * Create repository if it doesn't exist
   */
  static async ensureRepository(repo: GitRepository): Promise<void> {
    const token = this.getAccessToken();

    // Check if repo exists
    const checkResponse = await fetch(
      `https://api.github.com/repos/${repo.owner}/${repo.repo}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3+json',
        },
      }
    );

    if (checkResponse.ok) {
      return; // Repository exists
    }

    // Create repository
    const createResponse = await fetch('https://api.github.com/user/repos', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: repo.repo,
        description: `LLMunix ${repo.repo.includes('user') ? 'User' : repo.repo.includes('team') ? 'Team' : 'System'} Volume`,
        private: true,
        auto_init: true,
      }),
    });

    if (!createResponse.ok) {
      throw new Error(`Failed to create repository: ${await createResponse.text()}`);
    }

    // Wait a bit for repo initialization
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  /**
   * Commit session data to GitHub
   * Uses GitHub Contents API to create/update files
   */
  static async commitSession(
    volume: VolumeType,
    sessionData: {
      id: string;
      name: string;
      messages: Array<{ role: string; content: string; timestamp: string }>;
      artifacts?: any[];
      traces?: any[];
    }
  ): Promise<string> {
    const user = GitHubAuth.getUser();
    if (!user) throw new Error('Not authenticated');

    const repo = this.getRepoForVolume(volume, user);
    await this.ensureRepository(repo);

    const token = this.getAccessToken();
    const filePath = `sessions/${sessionData.id}.json`;

    // Get current file SHA if it exists (needed for updates)
    let currentSha: string | undefined;
    const getResponse = await fetch(
      `https://api.github.com/repos/${repo.owner}/${repo.repo}/contents/${filePath}?ref=${repo.branch}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3+json',
        },
      }
    );

    if (getResponse.ok) {
      const data = await getResponse.json();
      currentSha = data.sha;
    }

    // Create commit with context memory
    const commitMessage = this.generateCommitMessage(sessionData);
    const content = Buffer.from(JSON.stringify(sessionData, null, 2)).toString('base64');

    const response = await fetch(
      `https://api.github.com/repos/${repo.owner}/${repo.repo}/contents/${filePath}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: commitMessage,
          content,
          sha: currentSha,
          branch: repo.branch,
          committer: {
            name: user.name,
            email: user.email,
          },
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to commit session: ${error}`);
    }

    const result = await response.json();
    return result.commit.sha.substring(0, 7); // Return short hash
  }

  /**
   * Generate commit message with context memory
   * This is crucial for cron analysis - embeds prompts and trace info
   */
  private static generateCommitMessage(sessionData: {
    name: string;
    messages: Array<{ role: string; content: string }>;
    artifacts?: any[];
    traces?: any[];
  }): string {
    const firstUserMessage = sessionData.messages.find(m => m.role === 'user')?.content || '';
    const messageCount = sessionData.messages.length;
    const artifactCount = sessionData.artifacts?.length || 0;
    const traceCount = sessionData.traces?.length || 0;

    // Truncate prompt if too long
    const prompt = firstUserMessage.length > 100
      ? firstUserMessage.substring(0, 100) + '...'
      : firstUserMessage;

    let message = `session: ${sessionData.name}\n\n`;
    message += `Prompt: ${prompt}\n\n`;
    message += `Stats:\n`;
    message += `- ${messageCount} messages\n`;
    if (artifactCount > 0) message += `- ${artifactCount} artifacts generated\n`;
    if (traceCount > 0) message += `- ${traceCount} traces executed\n`;

    if (sessionData.artifacts && sessionData.artifacts.length > 0) {
      message += `\nArtifacts:\n`;
      sessionData.artifacts.forEach(a => {
        message += `- ${a.type}: ${a.name}\n`;
      });
    }

    message += `\n🤖 LLMunix Context Memory`;

    return message;
  }

  /**
   * Fetch commit history for analysis
   * Used by cron jobs to analyze patterns
   */
  static async fetchCommitHistory(
    volume: VolumeType,
    options: {
      since?: Date;
      until?: Date;
      path?: string;
    } = {}
  ): Promise<GitCommit[]> {
    const user = GitHubAuth.getUser();
    if (!user) throw new Error('Not authenticated');

    const repo = this.getRepoForVolume(volume, user);
    const token = this.getAccessToken();

    let url = `https://api.github.com/repos/${repo.owner}/${repo.repo}/commits?sha=${repo.branch}`;

    if (options.since) {
      url += `&since=${options.since.toISOString()}`;
    }
    if (options.until) {
      url += `&until=${options.until.toISOString()}`;
    }
    if (options.path) {
      url += `&path=${options.path}`;
    }

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch commits: ${await response.text()}`);
    }

    const commits = await response.json();

    return commits.map((commit: any) => ({
      sha: commit.sha,
      message: commit.commit.message,
      author: {
        name: commit.commit.author.name,
        email: commit.commit.author.email,
      },
      timestamp: commit.commit.author.date,
      files: [], // Would need additional API call per commit to get file details
    }));
  }

  /**
   * Pull latest changes from repository
   */
  static async pullLatestSessions(volume: VolumeType): Promise<any[]> {
    const user = GitHubAuth.getUser();
    if (!user) throw new Error('Not authenticated');

    const repo = this.getRepoForVolume(volume, user);
    const token = this.getAccessToken();

    // Get all session files
    const response = await fetch(
      `https://api.github.com/repos/${repo.owner}/${repo.repo}/contents/sessions?ref=${repo.branch}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3+json',
        },
      }
    );

    if (!response.ok) {
      if (response.status === 404) return []; // No sessions yet
      throw new Error(`Failed to fetch sessions: ${await response.text()}`);
    }

    const files = await response.json();
    const sessions = [];

    // Fetch each session file
    for (const file of files) {
      if (file.type === 'file' && file.name.endsWith('.json')) {
        const contentResponse = await fetch(file.download_url);
        if (contentResponse.ok) {
          const session = await contentResponse.json();
          sessions.push(session);
        }
      }
    }

    return sessions;
  }
}
