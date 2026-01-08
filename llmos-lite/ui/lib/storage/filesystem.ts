/**
 * File System Storage Adapter
 *
 * Provides file-system-like operations (read, write, glob) on top of
 * IndexedDB storage. This replaces the need for a Python backend.
 */

import { StorageAdapter, IndexedDBStorageAdapter } from './adapter';
import { Result, ok, err, AppError, appError, ErrorCodes } from '../core/result';

// ============================================================================
// TYPES
// ============================================================================

export interface FileMetadata {
  path: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  size: number;
}

export interface GlobOptions {
  recursive?: boolean;
}

// ============================================================================
// FILESYSTEM STORAGE
// ============================================================================

export class FileSystemStorage {
  private adapter: StorageAdapter;
  private filePrefix = 'fs:';
  private metaPrefix = 'meta:';

  constructor(adapter?: StorageAdapter) {
    this.adapter = adapter || new IndexedDBStorageAdapter('llmos-fs', 'files');
  }

  /**
   * Read a file by path
   */
  async read(path: string): Promise<Result<string | null, AppError>> {
    const normalizedPath = this.normalizePath(path);
    return this.adapter.get<string>(`${this.filePrefix}${normalizedPath}`);
  }

  /**
   * Write a file
   */
  async write(path: string, content: string): Promise<Result<void, AppError>> {
    const normalizedPath = this.normalizePath(path);
    const now = new Date().toISOString();

    // Get existing metadata or create new
    const existingMeta = await this.adapter.get<FileMetadata>(`${this.metaPrefix}${normalizedPath}`);
    const createdAt = existingMeta.ok && existingMeta.value ? existingMeta.value.createdAt : now;

    const metadata: FileMetadata = {
      path: normalizedPath,
      content: content.substring(0, 100), // Store excerpt for search
      createdAt,
      updatedAt: now,
      size: content.length,
    };

    // Write content and metadata
    const contentResult = await this.adapter.set(`${this.filePrefix}${normalizedPath}`, content);
    if (!contentResult.ok) return contentResult;

    return this.adapter.set(`${this.metaPrefix}${normalizedPath}`, metadata);
  }

  /**
   * Delete a file
   */
  async delete(path: string): Promise<Result<void, AppError>> {
    const normalizedPath = this.normalizePath(path);
    await this.adapter.delete(`${this.filePrefix}${normalizedPath}`);
    return this.adapter.delete(`${this.metaPrefix}${normalizedPath}`);
  }

  /**
   * Check if a file exists
   */
  async exists(path: string): Promise<Result<boolean, AppError>> {
    const normalizedPath = this.normalizePath(path);
    return this.adapter.has(`${this.filePrefix}${normalizedPath}`);
  }

  /**
   * Glob pattern matching for files
   * Supports: *, **, ?
   */
  async glob(pattern: string, options?: GlobOptions): Promise<Result<string[], AppError>> {
    const keysResult = await this.adapter.keys(this.filePrefix);
    if (!keysResult.ok) return keysResult;

    const allPaths = keysResult.value.map(k => k.slice(this.filePrefix.length));
    const regex = this.patternToRegex(pattern, options?.recursive ?? true);
    const matches = allPaths.filter(path => regex.test(path));

    return ok(matches.sort());
  }

  /**
   * Search file contents using keyword matching
   */
  async grep(
    pattern: string,
    searchPath?: string,
    options?: { caseSensitive?: boolean; limit?: number }
  ): Promise<Result<Array<{ path: string; matches: string[] }>, AppError>> {
    // First, get all files matching the search path
    const globPattern = searchPath ? `${searchPath}/**/*` : '**/*';
    const filesResult = await this.glob(globPattern);
    if (!filesResult.ok) return filesResult;

    const results: Array<{ path: string; matches: string[] }> = [];
    const regex = new RegExp(pattern, options?.caseSensitive ? 'g' : 'gi');
    const limit = options?.limit ?? 100;

    for (const filePath of filesResult.value) {
      if (results.length >= limit) break;

      const contentResult = await this.read(filePath);
      if (!contentResult.ok || !contentResult.value) continue;

      const content = contentResult.value;
      const matches = content.match(regex);

      if (matches && matches.length > 0) {
        // Extract context around matches
        const contextMatches: string[] = [];
        let match;
        const searchRegex = new RegExp(pattern, options?.caseSensitive ? 'g' : 'gi');

        while ((match = searchRegex.exec(content)) !== null && contextMatches.length < 3) {
          const start = Math.max(0, match.index - 50);
          const end = Math.min(content.length, match.index + match[0].length + 50);
          contextMatches.push(`...${content.slice(start, end)}...`);
        }

        results.push({ path: filePath, matches: contextMatches });
      }
    }

    return ok(results);
  }

  /**
   * List directory contents
   */
  async listDir(path: string): Promise<Result<string[], AppError>> {
    const normalizedPath = this.normalizePath(path);
    const keysResult = await this.adapter.keys(`${this.filePrefix}${normalizedPath}`);
    if (!keysResult.ok) return keysResult;

    const paths = keysResult.value.map(k => k.slice(this.filePrefix.length));

    // Get immediate children only (not recursive)
    const children = new Set<string>();
    for (const p of paths) {
      const relativePath = p.slice(normalizedPath.length);
      const parts = relativePath.split('/').filter(Boolean);
      if (parts.length > 0) {
        children.add(parts[0]);
      }
    }

    return ok(Array.from(children).sort());
  }

  /**
   * Get file metadata
   */
  async getMetadata(path: string): Promise<Result<FileMetadata | null, AppError>> {
    const normalizedPath = this.normalizePath(path);
    return this.adapter.get<FileMetadata>(`${this.metaPrefix}${normalizedPath}`);
  }

  /**
   * Copy a file
   */
  async copy(source: string, destination: string): Promise<Result<void, AppError>> {
    const contentResult = await this.read(source);
    if (!contentResult.ok) return contentResult as Result<void, AppError>;
    if (!contentResult.value) {
      return err(appError(ErrorCodes.NOT_FOUND, `Source file not found: ${source}`));
    }
    return this.write(destination, contentResult.value);
  }

  /**
   * Move a file
   */
  async move(source: string, destination: string): Promise<Result<void, AppError>> {
    const copyResult = await this.copy(source, destination);
    if (!copyResult.ok) return copyResult;
    return this.delete(source);
  }

  /**
   * Create a directory (creates a .gitkeep file)
   */
  async mkdir(path: string): Promise<Result<void, AppError>> {
    const normalizedPath = this.normalizePath(path);
    return this.write(`${normalizedPath}/.gitkeep`, '');
  }

  /**
   * Clear all files (dangerous!)
   */
  async clear(): Promise<Result<void, AppError>> {
    return this.adapter.clear();
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  private normalizePath(path: string): string {
    // Remove leading/trailing slashes and normalize
    return path.replace(/^\/+|\/+$/g, '').replace(/\/+/g, '/');
  }

  private patternToRegex(pattern: string, recursive: boolean): RegExp {
    // Escape special regex characters except glob wildcards
    let regexStr = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*\*/g, '{{GLOBSTAR}}')
      .replace(/\*/g, '[^/]*')
      .replace(/\?/g, '[^/]')
      .replace(/\{\{GLOBSTAR\}\}/g, recursive ? '.*' : '[^/]*');

    return new RegExp(`^${regexStr}$`);
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let fsInstance: FileSystemStorage | null = null;

export function getFileSystem(): FileSystemStorage {
  if (!fsInstance) {
    fsInstance = new FileSystemStorage();
  }
  return fsInstance;
}

export function createFileSystem(adapter?: StorageAdapter): FileSystemStorage {
  return new FileSystemStorage(adapter);
}
