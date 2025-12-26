/**
 * File Operations Layer - WebAssembly Git Enhanced
 *
 * Drop-in replacement for file-operations.ts that uses the
 * WebAssembly Git client with IndexedDB-backed LightningFS.
 *
 * Features:
 * - Local file operations (no network for reads/writes)
 * - Full Git support (clone, pull, push, branch, merge)
 * - IndexedDB persistence (no localStorage limits)
 * - Offline-first design
 */

import { WasmGitClient, getWasmGitClient } from '../git/wasm-git-client';
import type {
  GitProgressEvent,
  StatusResult,
  CommitLog,
  VolumeType
} from '../git/types';

// Re-export types for compatibility
export type { VolumeType } from '../git/types';
export type GitStatus = 'unmodified' | 'modified' | 'new' | 'deleted';

export interface VolumeFile {
  path: string;
  volume: VolumeType;
  content: string;
  gitStatus: GitStatus;
  lastModified: string;
}

export interface VolumeConfig {
  name: string;
  type: VolumeType;
  githubRepo: string;
  branch: string;
  localPath: string;
  readOnly: boolean;
}

export interface FileOperation {
  type: 'write' | 'edit' | 'delete' | 'read';
  path: string;
  volume: VolumeType;
  oldContent?: string;
  newContent?: string;
  timestamp: string;
}

export interface SyncProgress {
  phase: 'clone' | 'pull' | 'push';
  percent: number;
  message: string;
}

export type SyncProgressCallback = (progress: SyncProgress) => void;

/**
 * Volume directory mappings
 */
const VOLUME_DIRS: Record<VolumeType, string> = {
  system: '/system-volume',
  team: '/team-volume',
  user: '/user-volume'
};

/**
 * VolumeFileSystemWasm - Enhanced file operations with WebAssembly Git
 */
export class VolumeFileSystemWasm {
  private volumes: Map<VolumeType, VolumeConfig> = new Map();
  private clients: Map<VolumeType, WasmGitClient> = new Map();
  private operations: FileOperation[] = [];
  private initialized: Set<VolumeType> = new Set();
  private onSyncProgress?: SyncProgressCallback;

  constructor() {
    this.initializeVolumes();
  }

  /**
   * Set sync progress callback
   */
  setSyncProgressCallback(callback: SyncProgressCallback): void {
    this.onSyncProgress = callback;
  }

  /**
   * Initialize volume configurations
   */
  private initializeVolumes(): void {
    // System volume (read-only)
    this.volumes.set('system', {
      name: 'System Volume',
      type: 'system',
      githubRepo: process.env.NEXT_PUBLIC_SYSTEM_VOLUME_REPO || 'llmos/system-volume',
      branch: 'main',
      localPath: VOLUME_DIRS.system,
      readOnly: true
    });

    // Team volume (shared, read-write)
    this.volumes.set('team', {
      name: 'Team Volume',
      type: 'team',
      githubRepo: process.env.NEXT_PUBLIC_TEAM_VOLUME_REPO || '',
      branch: 'main',
      localPath: VOLUME_DIRS.team,
      readOnly: false
    });

    // User volume (personal, read-write)
    this.volumes.set('user', {
      name: 'User Volume',
      type: 'user',
      githubRepo: process.env.NEXT_PUBLIC_USER_VOLUME_REPO || '',
      branch: 'main',
      localPath: VOLUME_DIRS.user,
      readOnly: false
    });
  }

  /**
   * Get Git client for a volume
   */
  private getClient(volume: VolumeType): WasmGitClient {
    if (!this.clients.has(volume)) {
      const client = getWasmGitClient(`llmos-${volume}-volume`, {
        onProgress: (event: GitProgressEvent) => {
          if (this.onSyncProgress) {
            this.onSyncProgress({
              phase: 'clone',
              percent: event.percent || 0,
              message: `${event.phase}: ${event.loaded}/${event.total}`
            });
          }
        }
      });
      this.clients.set(volume, client);
    }
    return this.clients.get(volume)!;
  }

  /**
   * Get volume configuration
   */
  getVolumeConfig(volume: VolumeType): VolumeConfig | undefined {
    return this.volumes.get(volume);
  }

  /**
   * Initialize a volume (clone if not present, pull if present)
   */
  async initializeVolume(volume: VolumeType): Promise<void> {
    if (this.initialized.has(volume)) return;

    const config = this.volumes.get(volume);
    if (!config?.githubRepo) {
      console.warn(`Volume ${volume} has no configured repository`);
      this.initialized.add(volume);
      return;
    }

    const client = this.getClient(volume);
    await client.initialize();

    const dir = config.localPath;
    const isRepo = await client.isRepository(dir);

    if (!isRepo) {
      // Clone the repository
      const url = `https://github.com/${config.githubRepo}`;
      try {
        await client.clone({
          url,
          dir,
          ref: config.branch,
          depth: 1,
          singleBranch: true
        });
        console.log(`Cloned ${url} to ${volume} volume`);
      } catch (error) {
        console.error(`Failed to clone ${volume} volume:`, error);
        // Create empty directory structure
        const fs = client.getFs();
        await fs.promises.mkdir(dir, { recursive: true }).catch(() => {});
      }
    }

    this.initialized.add(volume);
  }

  /**
   * Ensure volume is initialized
   */
  private async ensureInitialized(volume: VolumeType): Promise<void> {
    if (!this.initialized.has(volume)) {
      await this.initializeVolume(volume);
    }
  }

  /**
   * Read file from volume
   */
  async readFile(volume: VolumeType, path: string): Promise<string> {
    await this.ensureInitialized(volume);

    const client = this.getClient(volume);
    const config = this.volumes.get(volume)!;

    try {
      const content = await client.readFile(config.localPath, path);

      // Record operation
      this.operations.push({
        type: 'read',
        path,
        volume,
        timestamp: new Date().toISOString()
      });

      return content;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`File ${path} not found in ${volume} volume`);
      }
      throw error;
    }
  }

  /**
   * Write new file to volume
   */
  async writeFile(volume: VolumeType, path: string, content: string): Promise<void> {
    const config = this.volumes.get(volume);
    if (config?.readOnly) {
      throw new Error(`Cannot write to ${volume} volume (read-only)`);
    }

    await this.ensureInitialized(volume);

    const client = this.getClient(volume);
    await client.writeFile(config!.localPath, path, content);

    // Stage the file
    await client.add(config!.localPath, path);

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
   */
  async editFile(
    volume: VolumeType,
    path: string,
    oldContent: string,
    newContent: string
  ): Promise<void> {
    const config = this.volumes.get(volume);
    if (config?.readOnly) {
      throw new Error(`Cannot edit files in ${volume} volume (read-only)`);
    }

    await this.ensureInitialized(volume);

    const client = this.getClient(volume);

    // Read current content to verify
    const currentContent = await client.readFile(config!.localPath, path);
    if (currentContent !== oldContent) {
      throw new Error(`File ${path} has been modified. Refresh and try again.`);
    }

    // Write new content
    await client.writeFile(config!.localPath, path, newContent);

    // Stage the file
    await client.add(config!.localPath, path);

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
    const config = this.volumes.get(volume);
    if (config?.readOnly) {
      throw new Error(`Cannot delete from ${volume} volume (read-only)`);
    }

    await this.ensureInitialized(volume);

    const client = this.getClient(volume);
    await client.deleteFile(config!.localPath, path);

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
  async listFiles(volume: VolumeType, directory = ''): Promise<VolumeFile[]> {
    await this.ensureInitialized(volume);

    const client = this.getClient(volume);
    const config = this.volumes.get(volume)!;

    const files = await client.listFiles(config.localPath, directory);

    return files.map(path => ({
      path,
      volume,
      content: '',  // Content loaded on demand
      gitStatus: 'unmodified' as GitStatus,
      lastModified: new Date().toISOString()
    }));
  }

  /**
   * Get modified files (for Git status)
   */
  async getModifiedFiles(volume?: VolumeType): Promise<VolumeFile[]> {
    const volumes = volume ? [volume] : (['system', 'team', 'user'] as VolumeType[]);
    const allFiles: VolumeFile[] = [];

    for (const vol of volumes) {
      await this.ensureInitialized(vol);

      const client = this.getClient(vol);
      const config = this.volumes.get(vol)!;

      const isRepo = await client.isRepository(config.localPath);
      if (!isRepo) continue;

      const status: StatusResult = await client.status(config.localPath);

      for (const file of status.files) {
        let gitStatus: GitStatus = 'unmodified';
        switch (file.status) {
          case 'added':
          case 'untracked':
            gitStatus = 'new';
            break;
          case 'modified':
            gitStatus = 'modified';
            break;
          case 'deleted':
            gitStatus = 'deleted';
            break;
        }

        allFiles.push({
          path: file.path,
          volume: vol,
          content: '',
          gitStatus,
          lastModified: new Date().toISOString()
        });
      }
    }

    return allFiles;
  }

  /**
   * Get recent file operations
   */
  getRecentOperations(limit = 10): FileOperation[] {
    return this.operations.slice(-limit);
  }

  /**
   * Clear operation history
   */
  clearOperations(): void {
    this.operations = [];
  }

  /**
   * Commit changes to volume
   */
  async commit(volume: VolumeType, message: string): Promise<string> {
    const config = this.volumes.get(volume);
    if (config?.readOnly) {
      throw new Error(`Cannot commit to ${volume} volume (read-only)`);
    }

    await this.ensureInitialized(volume);

    const client = this.getClient(volume);
    const sha = await client.commitAll(config!.localPath, { message });

    console.log(`Committed to ${volume} volume: ${sha}`);
    return sha;
  }

  /**
   * Push changes to remote
   */
  async push(volume: VolumeType): Promise<void> {
    const config = this.volumes.get(volume);
    if (config?.readOnly) {
      throw new Error(`Cannot push from ${volume} volume (read-only)`);
    }

    await this.ensureInitialized(volume);

    const client = this.getClient(volume);
    await client.push(config!.localPath);

    console.log(`Pushed ${volume} volume to remote`);
  }

  /**
   * Pull changes from remote
   */
  async pull(volume: VolumeType): Promise<void> {
    await this.ensureInitialized(volume);

    const client = this.getClient(volume);
    const config = this.volumes.get(volume)!;

    await client.pull(config.localPath, config.branch);

    console.log(`Pulled latest changes to ${volume} volume`);
  }

  /**
   * Commit and push in one operation
   */
  async commitAndPush(volume: VolumeType, message: string): Promise<string> {
    const sha = await this.commit(volume, message);
    await this.push(volume);
    return sha;
  }

  /**
   * Get commit log for volume
   */
  async getLog(volume: VolumeType, limit = 10): Promise<CommitLog[]> {
    await this.ensureInitialized(volume);

    const client = this.getClient(volume);
    const config = this.volumes.get(volume)!;

    return client.log(config.localPath, limit);
  }

  /**
   * Get current branch for volume
   */
  async getCurrentBranch(volume: VolumeType): Promise<string> {
    await this.ensureInitialized(volume);

    const client = this.getClient(volume);
    const config = this.volumes.get(volume)!;

    const status = await client.status(config.localPath);
    return status.branch;
  }

  /**
   * Check if volume is synced with remote
   */
  async isSynced(volume: VolumeType): Promise<boolean> {
    await this.ensureInitialized(volume);

    const client = this.getClient(volume);
    const config = this.volumes.get(volume)!;

    const status = await client.status(config.localPath);
    return status.files.length === 0 && status.ahead === 0 && status.behind === 0;
  }

  /**
   * Wipe volume data (for testing or reset)
   */
  async wipe(volume: VolumeType): Promise<void> {
    const client = this.getClient(volume);
    await client.wipe();
    this.initialized.delete(volume);
    console.log(`Wiped ${volume} volume`);
  }
}

// Singleton instance
let volumeFileSystemWasm: VolumeFileSystemWasm | null = null;

export function getVolumeFileSystemWasm(): VolumeFileSystemWasm {
  if (!volumeFileSystemWasm) {
    volumeFileSystemWasm = new VolumeFileSystemWasm();
  }
  return volumeFileSystemWasm;
}

/**
 * Feature flag to use WASM Git client
 * Set NEXT_PUBLIC_USE_WASM_GIT=true to enable
 */
export function useWasmGit(): boolean {
  if (typeof window === 'undefined') return false;
  return process.env.NEXT_PUBLIC_USE_WASM_GIT === 'true';
}
