/**
 * File Operations Layer - Claude Code Style
 *
 * Provides file system operations on Git-backed volumes
 * Each volume is a GitHub repository
 */

export type VolumeType = 'system' | 'team' | 'user';
export type GitStatus = 'unmodified' | 'modified' | 'new' | 'deleted';

export interface VolumeFile {
  path: string;  // Relative path within volume: "circuits/vqe.py"
  volume: VolumeType;
  content: string;
  gitStatus: GitStatus;
  lastModified: string;
}

export interface VolumeConfig {
  name: string;
  type: VolumeType;
  githubRepo: string;  // e.g., "llmos/system-volume"
  branch: string;      // default: "main"
  localPath?: string;  // Optional local cache path
}

export interface FileOperation {
  type: 'write' | 'edit' | 'delete' | 'read';
  path: string;
  volume: VolumeType;
  oldContent?: string;
  newContent?: string;
  timestamp: string;
}

/**
 * VolumeFileSystem - Main file operations class
 *
 * Manages files across System, Team, and User volumes
 * Each volume is backed by a GitHub repository
 */
export class VolumeFileSystem {
  private volumes: Map<VolumeType, VolumeConfig> = new Map();
  private fileCache: Map<string, VolumeFile> = new Map();
  private operations: FileOperation[] = [];

  constructor() {
    this.initializeVolumes();
  }

  /**
   * Initialize volume configurations
   */
  private initializeVolumes() {
    // System volume (read-only, maintained by LLMos)
    this.volumes.set('system', {
      name: 'System Volume',
      type: 'system',
      githubRepo: process.env.NEXT_PUBLIC_SYSTEM_VOLUME_REPO || 'llmos/system-volume',
      branch: 'main'
    });

    // Team volume (shared, read-write)
    this.volumes.set('team', {
      name: 'Team Volume',
      type: 'team',
      githubRepo: process.env.NEXT_PUBLIC_TEAM_VOLUME_REPO || '',
      branch: 'main'
    });

    // User volume (personal, read-write)
    this.volumes.set('user', {
      name: 'User Volume',
      type: 'user',
      githubRepo: process.env.NEXT_PUBLIC_USER_VOLUME_REPO || '',
      branch: 'main'
    });
  }

  /**
   * Get full file path (volume + path)
   */
  private getFullPath(volume: VolumeType, path: string): string {
    return `${volume}-volume/${path}`;
  }

  /**
   * Read file from volume
   * Like Claude Code's Read tool
   */
  async readFile(volume: VolumeType, path: string): Promise<string> {
    const fullPath = this.getFullPath(volume, path);

    // Check cache first
    const cached = this.fileCache.get(fullPath);
    if (cached) {
      return cached.content;
    }

    // Fetch from GitHub
    const config = this.volumes.get(volume);
    if (!config?.githubRepo) {
      throw new Error(`Volume ${volume} not configured`);
    }

    const content = await this.fetchFileFromGitHub(config.githubRepo, path, config.branch);

    // Cache the file
    this.fileCache.set(fullPath, {
      path,
      volume,
      content,
      gitStatus: 'unmodified',
      lastModified: new Date().toISOString()
    });

    // Record operation
    this.operations.push({
      type: 'read',
      path,
      volume,
      timestamp: new Date().toISOString()
    });

    return content;
  }

  /**
   * Write new file to volume
   * Like Claude Code's Write tool
   */
  async writeFile(volume: VolumeType, path: string, content: string): Promise<void> {
    // System volume is read-only
    if (volume === 'system') {
      throw new Error('Cannot write to system volume (read-only)');
    }

    const fullPath = this.getFullPath(volume, path);

    // Update cache
    this.fileCache.set(fullPath, {
      path,
      volume,
      content,
      gitStatus: 'new',
      lastModified: new Date().toISOString()
    });

    // Record operation
    this.operations.push({
      type: 'write',
      path,
      volume,
      newContent: content,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Edit existing file in volume
   * Like Claude Code's Edit tool
   */
  async editFile(
    volume: VolumeType,
    path: string,
    oldContent: string,
    newContent: string
  ): Promise<void> {
    // System volume is read-only
    if (volume === 'system') {
      throw new Error('Cannot edit system volume files (read-only)');
    }

    const fullPath = this.getFullPath(volume, path);
    const existing = this.fileCache.get(fullPath);

    if (!existing) {
      throw new Error(`File ${path} not found in ${volume} volume`);
    }

    // Verify old content matches (prevent conflicts)
    if (existing.content !== oldContent) {
      throw new Error(`File ${path} has been modified. Refresh and try again.`);
    }

    // Update cache
    this.fileCache.set(fullPath, {
      ...existing,
      content: newContent,
      gitStatus: existing.gitStatus === 'new' ? 'new' : 'modified',
      lastModified: new Date().toISOString()
    });

    // Record operation
    this.operations.push({
      type: 'edit',
      path,
      volume,
      oldContent,
      newContent,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Delete file from volume
   */
  async deleteFile(volume: VolumeType, path: string): Promise<void> {
    if (volume === 'system') {
      throw new Error('Cannot delete from system volume (read-only)');
    }

    const fullPath = this.getFullPath(volume, path);
    const existing = this.fileCache.get(fullPath);

    if (existing) {
      this.fileCache.set(fullPath, {
        ...existing,
        gitStatus: 'deleted',
        lastModified: new Date().toISOString()
      });
    }

    // Record operation
    this.operations.push({
      type: 'delete',
      path,
      volume,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * List files in volume directory
   */
  async listFiles(volume: VolumeType, directory: string = ''): Promise<VolumeFile[]> {
    const config = this.volumes.get(volume);
    if (!config?.githubRepo) {
      return [];
    }

    const files = await this.listGitHubDirectory(config.githubRepo, directory, config.branch);
    return files.map(file => ({
      path: file.path,
      volume,
      content: '', // Content loaded on demand
      gitStatus: 'unmodified',
      lastModified: file.lastModified
    }));
  }

  /**
   * Get modified files (for Git status)
   */
  getModifiedFiles(volume?: VolumeType): VolumeFile[] {
    const files: VolumeFile[] = [];

    this.fileCache.forEach((file) => {
      if (volume && file.volume !== volume) return;
      if (file.gitStatus !== 'unmodified') {
        files.push(file);
      }
    });

    return files;
  }

  /**
   * Get recent file operations (for chat history)
   */
  getRecentOperations(limit: number = 10): FileOperation[] {
    return this.operations.slice(-limit);
  }

  /**
   * Clear operation history
   */
  clearOperations(): void {
    this.operations = [];
  }

  /**
   * Fetch file from GitHub API
   */
  private async fetchFileFromGitHub(
    repo: string,
    path: string,
    branch: string
  ): Promise<string> {
    const url = `https://api.github.com/repos/${repo}/contents/${path}?ref=${branch}`;

    const response = await fetch(url, {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        ...(process.env.GITHUB_TOKEN && {
          'Authorization': `token ${process.env.GITHUB_TOKEN}`
        })
      }
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`File ${path} not found in ${repo}`);
      }
      throw new Error(`GitHub API error: ${response.statusText}`);
    }

    const data = await response.json();

    // Decode base64 content
    if (data.encoding === 'base64') {
      return atob(data.content);
    }

    return data.content;
  }

  /**
   * List directory contents from GitHub
   */
  private async listGitHubDirectory(
    repo: string,
    path: string,
    branch: string
  ): Promise<Array<{ path: string; type: string; lastModified: string }>> {
    const url = `https://api.github.com/repos/${repo}/contents/${path}?ref=${branch}`;

    const response = await fetch(url, {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        ...(process.env.GITHUB_TOKEN && {
          'Authorization': `token ${process.env.GITHUB_TOKEN}`
        })
      }
    });

    if (!response.ok) {
      return [];
    }

    const data = await response.json();

    if (!Array.isArray(data)) {
      return [];
    }

    return data.map(item => ({
      path: item.path,
      type: item.type,
      lastModified: new Date().toISOString() // GitHub API doesn't provide this directly
    }));
  }
}

// Singleton instance
let volumeFileSystem: VolumeFileSystem | null = null;

export function getVolumeFileSystem(): VolumeFileSystem {
  if (!volumeFileSystem) {
    volumeFileSystem = new VolumeFileSystem();
  }
  return volumeFileSystem;
}
