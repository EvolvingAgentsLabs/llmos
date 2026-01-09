/**
 * Virtual File System for Browser
 *
 * Stores files in localStorage with a hierarchical structure.
 *
 * Volume-based structure:
 * - user/     - User workspace (default)
 * - team/     - Shared team workspace
 * - system/   - System files (read-only for agents)
 *
 * Each volume can contain:
 * - applets/           - UI components
 * - output/            - Generated files (code, visualizations)
 * - memory/            - Agent memory (short_term, long_term)
 * - components/agents/ - Sub-agent definitions
 */

export interface VFSFile {
  path: string;
  content: string;
  type: 'file' | 'directory';
  created: string;
  modified: string;
  size: number;
}

export interface VFSDirectory {
  path: string;
  files: string[]; // Array of file paths in this directory
  subdirectories: string[]; // Array of subdirectory paths
}

const VFS_PREFIX = 'vfs:';
const VFS_INDEX_KEY = 'vfs:index';

// Event types for VFS
export type VFSEventType = 'file:created' | 'file:updated' | 'file:deleted' | 'directory:created' | 'directory:deleted';
export type VFSEventCallback = (path: string, file?: VFSFile) => void;

/**
 * Virtual File System
 */
export class VirtualFileSystem {
  private static instance: VirtualFileSystem;
  private listeners: Map<VFSEventType, Set<VFSEventCallback>> = new Map();

  private constructor() {
    this.ensureIndex();
  }

  /**
   * Add an event listener
   */
  on(event: VFSEventType, callback: VFSEventCallback): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);

    return () => {
      this.listeners.get(event)?.delete(callback);
    };
  }

  /**
   * Emit an event
   */
  private emit(event: VFSEventType, path: string, file?: VFSFile): void {
    this.listeners.get(event)?.forEach((callback) => {
      try {
        callback(path, file);
      } catch (error) {
        console.error(`Error in VFS event handler for ${event}:`, error);
      }
    });
  }

  static getInstance(): VirtualFileSystem {
    if (!VirtualFileSystem.instance) {
      VirtualFileSystem.instance = new VirtualFileSystem();
    }
    return VirtualFileSystem.instance;
  }

  /**
   * Ensure index exists in localStorage
   */
  private ensureIndex(): void {
    if (typeof window === 'undefined') return;

    const index = localStorage.getItem(VFS_INDEX_KEY);
    if (!index) {
      localStorage.setItem(VFS_INDEX_KEY, JSON.stringify({
        files: [],
        directories: ['/', '/user', '/team', '/system']
      }));
    }
  }

  /**
   * Get the file index
   */
  private getIndex(): { files: string[]; directories: string[] } {
    if (typeof window === 'undefined') {
      return { files: [], directories: [] };
    }

    const index = localStorage.getItem(VFS_INDEX_KEY);
    return index ? JSON.parse(index) : { files: [], directories: [] };
  }

  /**
   * Update the file index
   */
  private updateIndex(index: { files: string[]; directories: string[] }): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(VFS_INDEX_KEY, JSON.stringify(index));
  }

  /**
   * Normalize path (remove trailing slashes, handle relative paths)
   */
  private normalizePath(path: string): string {
    // Remove leading/trailing slashes
    let normalized = path.replace(/^\/+|\/+$/g, '');

    // Check if path already starts with a valid volume
    const validVolumes = ['user', 'team', 'system'];
    const hasValidVolume = validVolumes.some(volume =>
      normalized === volume || normalized.startsWith(volume + '/')
    );

    // If not, default to user/ volume
    if (!hasValidVolume && normalized) {
      normalized = 'user/' + normalized;
    }

    return normalized;
  }

  /**
   * Get parent directory path
   */
  private getParentPath(path: string): string {
    const parts = path.split('/');
    parts.pop();
    return parts.join('/') || '/';
  }

  /**
   * Ensure all parent directories exist
   */
  private ensureDirectories(path: string): void {
    const parts = path.split('/');
    let currentPath = '';

    for (let i = 0; i < parts.length - 1; i++) {
      currentPath += (i > 0 ? '/' : '') + parts[i];

      const index = this.getIndex();
      if (!index.directories.includes(currentPath)) {
        index.directories.push(currentPath);
        this.updateIndex(index);
      }
    }
  }

  /**
   * Write a file
   */
  writeFile(path: string, content: string): void {
    if (typeof window === 'undefined') {
      console.warn('VFS: Cannot write file in SSR context');
      return;
    }

    const normalizedPath = this.normalizePath(path);
    this.ensureDirectories(normalizedPath);

    const now = new Date().toISOString();
    const existingFile = this.readFile(normalizedPath);
    const isNewFile = !existingFile;

    const file: VFSFile = {
      path: normalizedPath,
      content,
      type: 'file',
      created: existingFile?.created || now,
      modified: now,
      size: content.length,
    };

    // Store file
    localStorage.setItem(VFS_PREFIX + normalizedPath, JSON.stringify(file));

    // Update index
    const index = this.getIndex();
    if (!index.files.includes(normalizedPath)) {
      index.files.push(normalizedPath);
      this.updateIndex(index);
    }

    // Emit event
    this.emit(isNewFile ? 'file:created' : 'file:updated', normalizedPath, file);
  }

  /**
   * Read a file
   */
  readFile(path: string): VFSFile | null {
    if (typeof window === 'undefined') {
      return null;
    }

    const normalizedPath = this.normalizePath(path);
    const data = localStorage.getItem(VFS_PREFIX + normalizedPath);

    if (!data) return null;

    try {
      return JSON.parse(data);
    } catch (error) {
      console.error('VFS: Failed to parse file:', error);
      return null;
    }
  }

  /**
   * Read file content only
   */
  readFileContent(path: string): string | null {
    const file = this.readFile(path);
    return file?.content || null;
  }

  /**
   * Check if file exists
   */
  exists(path: string): boolean {
    const normalizedPath = this.normalizePath(path);
    const index = this.getIndex();
    return index.files.includes(normalizedPath) || index.directories.includes(normalizedPath);
  }

  /**
   * List files in a directory
   */
  listDirectory(path: string): { files: VFSFile[]; directories: string[] } {
    if (typeof window === 'undefined') {
      return { files: [], directories: [] };
    }

    const normalizedPath = path === '/' ? '' : this.normalizePath(path);
    const index = this.getIndex();

    // Get immediate children only
    const files: VFSFile[] = [];
    const directories: string[] = [];

    for (const filePath of index.files) {
      if (this.isDirectChild(normalizedPath, filePath)) {
        const file = this.readFile(filePath);
        if (file) files.push(file);
      }
    }

    for (const dirPath of index.directories) {
      if (this.isDirectChild(normalizedPath, dirPath)) {
        directories.push(dirPath);
      }
    }

    return { files, directories };
  }

  /**
   * Check if path2 is a direct child of path1
   */
  private isDirectChild(parentPath: string, childPath: string): boolean {
    if (!childPath.startsWith(parentPath)) return false;
    if (parentPath && !childPath.startsWith(parentPath + '/')) return false;

    const remainingPath = parentPath ? childPath.slice(parentPath.length + 1) : childPath;
    return !remainingPath.includes('/');
  }

  /**
   * Delete a file
   */
  deleteFile(path: string): boolean {
    if (typeof window === 'undefined') return false;

    const normalizedPath = this.normalizePath(path);

    // Get file before deleting for event
    const file = this.readFile(normalizedPath);

    // Remove from storage
    localStorage.removeItem(VFS_PREFIX + normalizedPath);

    // Update index
    const index = this.getIndex();
    index.files = index.files.filter(f => f !== normalizedPath);
    this.updateIndex(index);

    // Emit event
    this.emit('file:deleted', normalizedPath, file || undefined);

    return true;
  }

  /**
   * Delete a directory and all its contents recursively
   */
  deleteDirectory(path: string): boolean {
    if (typeof window === 'undefined') return false;

    const normalizedPath = this.normalizePath(path);
    const index = this.getIndex();

    // Find all files under this directory
    const filesToDelete = index.files.filter(f =>
      f === normalizedPath || f.startsWith(normalizedPath + '/')
    );

    // Find all subdirectories under this directory
    const dirsToDelete = index.directories.filter(d =>
      d === normalizedPath || d.startsWith(normalizedPath + '/')
    );

    // Delete all files and emit events
    for (const filePath of filesToDelete) {
      const file = this.readFile(filePath);
      localStorage.removeItem(VFS_PREFIX + filePath);
      this.emit('file:deleted', filePath, file || undefined);
    }

    // Update index - remove files and directories
    index.files = index.files.filter(f => !filesToDelete.includes(f));
    index.directories = index.directories.filter(d => !dirsToDelete.includes(d));
    this.updateIndex(index);

    // Emit directory deleted event
    this.emit('directory:deleted', normalizedPath);

    return true;
  }

  /**
   * Rename a file or directory
   */
  rename(oldPath: string, newPath: string): boolean {
    if (typeof window === 'undefined') return false;

    const normalizedOld = this.normalizePath(oldPath);
    const normalizedNew = this.normalizePath(newPath);
    const index = this.getIndex();

    // Check if it's a file
    if (index.files.includes(normalizedOld)) {
      const file = this.readFile(normalizedOld);
      if (file) {
        // Create new file with updated path
        file.path = normalizedNew;
        file.modified = new Date().toISOString();
        localStorage.setItem(VFS_PREFIX + normalizedNew, JSON.stringify(file));
        localStorage.removeItem(VFS_PREFIX + normalizedOld);

        // Update index
        index.files = index.files.filter(f => f !== normalizedOld);
        index.files.push(normalizedNew);
        this.ensureDirectories(normalizedNew);
        this.updateIndex(index);
        return true;
      }
    }

    // Check if it's a directory
    if (index.directories.includes(normalizedOld)) {
      // Rename all files under this directory
      const filesToRename = index.files.filter(f =>
        f === normalizedOld || f.startsWith(normalizedOld + '/')
      );
      const dirsToRename = index.directories.filter(d =>
        d === normalizedOld || d.startsWith(normalizedOld + '/')
      );

      // Rename files
      for (const filePath of filesToRename) {
        const newFilePath = filePath.replace(normalizedOld, normalizedNew);
        const file = this.readFile(filePath);
        if (file) {
          file.path = newFilePath;
          file.modified = new Date().toISOString();
          localStorage.setItem(VFS_PREFIX + newFilePath, JSON.stringify(file));
          localStorage.removeItem(VFS_PREFIX + filePath);
        }
      }

      // Update index
      index.files = index.files.filter(f => !filesToRename.includes(f));
      filesToRename.forEach(f => {
        index.files.push(f.replace(normalizedOld, normalizedNew));
      });

      index.directories = index.directories.filter(d => !dirsToRename.includes(d));
      dirsToRename.forEach(d => {
        index.directories.push(d.replace(normalizedOld, normalizedNew));
      });

      this.updateIndex(index);
      return true;
    }

    return false;
  }

  /**
   * Create a directory
   */
  createDirectory(path: string): void {
    if (typeof window === 'undefined') return;

    const normalizedPath = this.normalizePath(path);
    const index = this.getIndex();

    if (!index.directories.includes(normalizedPath)) {
      this.ensureDirectories(normalizedPath + '/dummy');
      index.directories.push(normalizedPath);
      this.updateIndex(index);
    }
  }

  /**
   * Get all files (for debugging)
   */
  getAllFiles(): VFSFile[] {
    const index = this.getIndex();
    return index.files.map(path => this.readFile(path)).filter(Boolean) as VFSFile[];
  }

  /**
   * Clear all files (for debugging)
   */
  clear(): void {
    if (typeof window === 'undefined') return;

    const index = this.getIndex();

    // Remove all files
    for (const filePath of index.files) {
      localStorage.removeItem(VFS_PREFIX + filePath);
    }

    // Reset index
    localStorage.setItem(VFS_INDEX_KEY, JSON.stringify({
      files: [],
      directories: ['/', '/user', '/team', '/system']
    }));
  }
}

/**
 * Get the singleton VFS instance
 */
export function getVFS(): VirtualFileSystem {
  return VirtualFileSystem.getInstance();
}
