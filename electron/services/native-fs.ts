/**
 * Native File System Service
 *
 * Provides native file system access for the LLMos volumes.
 * Replaces the browser-based VFS (localStorage/IndexedDB) with
 * real filesystem operations.
 *
 * Volume types map to actual directories:
 * - user: ~/Documents/LLMos/user/
 * - team: ~/Documents/LLMos/team/
 * - system: {userData}/system/ (read-only templates)
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { watch, FSWatcher } from 'fs';
import { EventEmitter } from 'events';

export type VolumeType = 'user' | 'team' | 'system';

export interface FileInfo {
  path: string;
  name: string;
  isDirectory: boolean;
  size: number;
  modifiedAt: Date;
  createdAt: Date;
}

export interface NativeFileSystemOptions {
  userVolumePath: string;
  teamVolumePath: string;
  systemVolumePath: string;
  tempPath: string;
}

/**
 * Native File System with volume abstraction
 */
export class NativeFileSystem extends EventEmitter {
  private volumePaths: Map<VolumeType, string>;
  private tempPath: string;
  private watchers: Map<string, FSWatcher> = new Map();
  private isInitialized = false;

  constructor(options: NativeFileSystemOptions) {
    super();
    this.volumePaths = new Map([
      ['user', options.userVolumePath],
      ['team', options.teamVolumePath],
      ['system', options.systemVolumePath],
    ]);
    this.tempPath = options.tempPath;
  }

  /**
   * Initialize the file system
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    console.log('[NativeFS] Initializing native file system...');

    // Create volume directories
    for (const [volumeType, volumePath] of this.volumePaths) {
      try {
        await fs.mkdir(volumePath, { recursive: true });
        console.log(`[NativeFS] Created volume: ${volumeType} at ${volumePath}`);

        // Create default subdirectories for user/team volumes
        if (volumeType !== 'system') {
          const subdirs = ['agents', 'maps', 'logs', 'firmware', 'data'];
          for (const subdir of subdirs) {
            await fs.mkdir(path.join(volumePath, subdir), { recursive: true });
          }
        }
      } catch (error: any) {
        console.error(`[NativeFS] Failed to create volume ${volumeType}:`, error.message);
      }
    }

    // Create temp directory
    await fs.mkdir(this.tempPath, { recursive: true });

    // Initialize system volume with default templates if empty
    await this.initializeSystemVolume();

    this.isInitialized = true;
    console.log('[NativeFS] Initialization complete');
  }

  /**
   * Initialize system volume with default content
   */
  private async initializeSystemVolume(): Promise<void> {
    const systemPath = this.volumePaths.get('system')!;
    const agentsPath = path.join(systemPath, 'agents');

    try {
      await fs.mkdir(agentsPath, { recursive: true });

      // Check if system agent exists
      const systemAgentPath = path.join(agentsPath, 'system-agent.md');
      try {
        await fs.access(systemAgentPath);
      } catch {
        // Create default system agent
        await fs.writeFile(systemAgentPath, `---
name: SystemAgent
type: orchestrator
version: 1.0.0
---

# System Agent

You are the System Agent, the main orchestrator for LLMos Desktop.

## Capabilities
- File management across volumes
- Code compilation (C via Clang, TypeScript via AssemblyScript)
- Hardware deployment to ESP32 devices
- Agent coordination

## Tools Available
- read_file, write_file, edit_file, delete_file, list_files
- compile_wasm (C to WASM)
- compile_assemblyscript (TypeScript to WASM)
- deploy_wasm (to ESP32)
- execute_python, execute_javascript

Always help users accomplish their goals efficiently.
`);
        console.log('[NativeFS] Created default system agent');
      }
    } catch (error) {
      console.warn('[NativeFS] Could not initialize system volume:', error);
    }
  }

  /**
   * Get the full path for a volume/file combination
   */
  private getFullPath(volumeType: VolumeType, filePath: string): string {
    const volumePath = this.volumePaths.get(volumeType);
    if (!volumePath) {
      throw new Error(`Unknown volume type: ${volumeType}`);
    }

    // Normalize and sanitize path
    const normalizedPath = path.normalize(filePath).replace(/^(\.\.[\/\\])+/, '');
    return path.join(volumePath, normalizedPath);
  }

  /**
   * Read a file from a volume
   */
  async readFile(volumeType: string, filePath: string): Promise<string> {
    const fullPath = this.getFullPath(volumeType as VolumeType, filePath);

    try {
      const content = await fs.readFile(fullPath, 'utf-8');
      return content;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        throw new Error(`File not found: ${volumeType}/${filePath}`);
      }
      throw error;
    }
  }

  /**
   * Read a file as binary
   */
  async readFileBinary(volumeType: string, filePath: string): Promise<Buffer> {
    const fullPath = this.getFullPath(volumeType as VolumeType, filePath);
    return fs.readFile(fullPath);
  }

  /**
   * Write a file to a volume
   */
  async writeFile(volumeType: string, filePath: string, content: string): Promise<void> {
    if (volumeType === 'system') {
      throw new Error('Cannot write to system volume (read-only)');
    }

    const fullPath = this.getFullPath(volumeType as VolumeType, filePath);

    // Ensure directory exists
    const dir = path.dirname(fullPath);
    await fs.mkdir(dir, { recursive: true });

    await fs.writeFile(fullPath, content, 'utf-8');

    this.emit('file:changed', { volumeType, path: filePath, operation: 'write' });
  }

  /**
   * Write binary data to a file
   */
  async writeFileBinary(volumeType: string, filePath: string, content: Buffer): Promise<void> {
    if (volumeType === 'system') {
      throw new Error('Cannot write to system volume (read-only)');
    }

    const fullPath = this.getFullPath(volumeType as VolumeType, filePath);

    const dir = path.dirname(fullPath);
    await fs.mkdir(dir, { recursive: true });

    await fs.writeFile(fullPath, content);

    this.emit('file:changed', { volumeType, path: filePath, operation: 'write' });
  }

  /**
   * Delete a file from a volume
   */
  async deleteFile(volumeType: string, filePath: string): Promise<void> {
    if (volumeType === 'system') {
      throw new Error('Cannot delete from system volume (read-only)');
    }

    const fullPath = this.getFullPath(volumeType as VolumeType, filePath);
    await fs.unlink(fullPath);

    this.emit('file:changed', { volumeType, path: filePath, operation: 'delete' });
  }

  /**
   * Check if a file exists
   */
  async exists(volumeType: string, filePath: string): Promise<boolean> {
    const fullPath = this.getFullPath(volumeType as VolumeType, filePath);

    try {
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Create a directory
   */
  async mkdir(volumeType: string, dirPath: string): Promise<void> {
    if (volumeType === 'system') {
      throw new Error('Cannot create directory in system volume (read-only)');
    }

    const fullPath = this.getFullPath(volumeType as VolumeType, dirPath);
    await fs.mkdir(fullPath, { recursive: true });
  }

  /**
   * List files in a directory
   */
  async listFiles(volumeType: string, directory: string = ''): Promise<FileInfo[]> {
    const fullPath = this.getFullPath(volumeType as VolumeType, directory);

    try {
      const entries = await fs.readdir(fullPath, { withFileTypes: true });
      const files: FileInfo[] = [];

      for (const entry of entries) {
        const entryPath = path.join(fullPath, entry.name);
        const stats = await fs.stat(entryPath);

        files.push({
          path: path.join(directory, entry.name),
          name: entry.name,
          isDirectory: entry.isDirectory(),
          size: stats.size,
          modifiedAt: stats.mtime,
          createdAt: stats.birthtime,
        });
      }

      // Sort: directories first, then by name
      files.sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) {
          return a.isDirectory ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });

      return files;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  /**
   * Recursively list all files in a directory
   */
  async listFilesRecursive(volumeType: string, directory: string = ''): Promise<FileInfo[]> {
    const files: FileInfo[] = [];
    const entries = await this.listFiles(volumeType, directory);

    for (const entry of entries) {
      files.push(entry);
      if (entry.isDirectory) {
        const subFiles = await this.listFilesRecursive(volumeType, entry.path);
        files.push(...subFiles);
      }
    }

    return files;
  }

  /**
   * Copy a file
   */
  async copyFile(
    sourceVolume: string,
    sourcePath: string,
    destVolume: string,
    destPath: string
  ): Promise<void> {
    if (destVolume === 'system') {
      throw new Error('Cannot copy to system volume (read-only)');
    }

    const sourceFullPath = this.getFullPath(sourceVolume as VolumeType, sourcePath);
    const destFullPath = this.getFullPath(destVolume as VolumeType, destPath);

    const destDir = path.dirname(destFullPath);
    await fs.mkdir(destDir, { recursive: true });

    await fs.copyFile(sourceFullPath, destFullPath);

    this.emit('file:changed', { volumeType: destVolume, path: destPath, operation: 'write' });
  }

  /**
   * Move a file
   */
  async moveFile(
    sourceVolume: string,
    sourcePath: string,
    destVolume: string,
    destPath: string
  ): Promise<void> {
    if (sourceVolume === 'system') {
      throw new Error('Cannot move from system volume (read-only)');
    }
    if (destVolume === 'system') {
      throw new Error('Cannot move to system volume (read-only)');
    }

    const sourceFullPath = this.getFullPath(sourceVolume as VolumeType, sourcePath);
    const destFullPath = this.getFullPath(destVolume as VolumeType, destPath);

    const destDir = path.dirname(destFullPath);
    await fs.mkdir(destDir, { recursive: true });

    await fs.rename(sourceFullPath, destFullPath);

    this.emit('file:changed', { volumeType: sourceVolume, path: sourcePath, operation: 'delete' });
    this.emit('file:changed', { volumeType: destVolume, path: destPath, operation: 'write' });
  }

  /**
   * Get file stats
   */
  async getStats(volumeType: string, filePath: string): Promise<FileInfo | null> {
    const fullPath = this.getFullPath(volumeType as VolumeType, filePath);

    try {
      const stats = await fs.stat(fullPath);
      return {
        path: filePath,
        name: path.basename(filePath),
        isDirectory: stats.isDirectory(),
        size: stats.size,
        modifiedAt: stats.mtime,
        createdAt: stats.birthtime,
      };
    } catch {
      return null;
    }
  }

  /**
   * Watch a directory for changes
   */
  watchDirectory(volumeType: string, directory: string = ''): void {
    const fullPath = this.getFullPath(volumeType as VolumeType, directory);
    const watchKey = `${volumeType}:${directory}`;

    if (this.watchers.has(watchKey)) {
      return; // Already watching
    }

    try {
      const watcher = watch(fullPath, { recursive: true }, (eventType, filename) => {
        if (filename) {
          this.emit('file:changed', {
            volumeType,
            path: path.join(directory, filename),
            operation: eventType === 'rename' ? 'rename' : 'change',
          });
        }
      });

      this.watchers.set(watchKey, watcher);
      console.log(`[NativeFS] Watching ${volumeType}/${directory}`);
    } catch (error) {
      console.warn(`[NativeFS] Could not watch ${volumeType}/${directory}:`, error);
    }
  }

  /**
   * Stop watching a directory
   */
  unwatchDirectory(volumeType: string, directory: string = ''): void {
    const watchKey = `${volumeType}:${directory}`;
    const watcher = this.watchers.get(watchKey);

    if (watcher) {
      watcher.close();
      this.watchers.delete(watchKey);
    }
  }

  /**
   * Get volume path for external access
   */
  getVolumePath(volumeType: VolumeType): string {
    return this.volumePaths.get(volumeType) || '';
  }

  /**
   * Get temp path
   */
  getTempPath(): string {
    return this.tempPath;
  }

  /**
   * Clean up resources
   */
  async cleanup(): Promise<void> {
    // Close all watchers
    for (const watcher of this.watchers.values()) {
      watcher.close();
    }
    this.watchers.clear();

    // Clean temp directory
    try {
      await fs.rm(this.tempPath, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }
}
