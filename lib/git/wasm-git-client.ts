/**
 * WebAssembly Git Client
 *
 * Browser-native Git implementation using isomorphic-git and LightningFS.
 * Provides full Git functionality without server-side dependencies.
 */

import type {
  GitClientConfig,
  GitAuth,
  GitProgressEvent,
  CloneOptions,
  CommitOptions,
  StatusResult,
  StatusEntry,
  FileStatus,
  CommitLog,
  FileDiff,
  BranchInfo,
  MergeResult,
  GitEvent,
  GitEventListener,
  GitEventType
} from './types';

// Type for LightningFS instance
export interface LightningFSInstance {
  promises: {
    readFile(path: string, options?: { encoding?: string }): Promise<string | Uint8Array>;
    writeFile(path: string, data: string | Uint8Array, options?: { encoding?: string }): Promise<void>;
    unlink(path: string): Promise<void>;
    readdir(path: string): Promise<string[]>;
    mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;
    rmdir(path: string): Promise<void>;
    stat(path: string): Promise<{ isFile(): boolean; isDirectory(): boolean }>;
    lstat(path: string): Promise<{ isFile(): boolean; isDirectory(): boolean }>;
  };
}

// Type for LightningFS constructor
type LightningFSConstructor = new (name: string, options?: { wipe?: boolean }) => LightningFSInstance;

// Lazy-loaded isomorphic-git to reduce initial bundle size
// Using 'any' for dynamic imports to avoid complex module type resolution issues
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let git: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let http: any = null;
let LightningFS: LightningFSConstructor | null = null;

/**
 * Load isomorphic-git dependencies lazily
 */
async function loadGitDependencies(): Promise<void> {
  if (git && http && LightningFS) return;

  const [gitModule, httpModule, fsModule] = await Promise.all([
    import('isomorphic-git'),
    import('isomorphic-git/http/web'),
    import('@isomorphic-git/lightning-fs')
  ]);

  // Handle both ESM and CJS module formats
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  git = (gitModule as any).default ?? gitModule;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  http = (httpModule as any).default ?? httpModule;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  LightningFS = (fsModule as any).default;
}

/**
 * Default CORS proxy for GitHub access
 * In production, use your own proxy at /api/git-proxy
 */
const DEFAULT_CORS_PROXY = '/api/git-proxy';
const FALLBACK_CORS_PROXY = 'https://cors.isomorphic-git.org';

/**
 * WasmGitClient - Main Git client class
 *
 * Provides a high-level API for Git operations in the browser.
 */
export class WasmGitClient {
  private fs: LightningFSInstance | null = null;
  private config: GitClientConfig;
  private volumeName: string;
  private initialized = false;
  private eventListeners: Map<GitEventType, Set<GitEventListener>> = new Map();

  constructor(volumeName: string, config: GitClientConfig = {}) {
    this.volumeName = volumeName;
    this.config = {
      corsProxy: config.corsProxy || DEFAULT_CORS_PROXY,
      ...config
    };
  }

  /**
   * Initialize the Git client and filesystem
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    await loadGitDependencies();

    if (!LightningFS) {
      throw new Error('Failed to load LightningFS');
    }

    this.fs = new LightningFS(this.volumeName, {
      wipe: false  // Preserve existing data
    });

    this.initialized = true;
  }

  /**
   * Ensure the client is initialized before operations
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  /**
   * Get the filesystem instance for external use
   */
  getFs(): LightningFSInstance {
    if (!this.fs) {
      throw new Error('Git client not initialized. Call initialize() first.');
    }
    return this.fs;
  }

  /**
   * Emit an event to all registered listeners
   */
  private emit(type: GitEventType, data?: unknown, error?: Error): void {
    const event: GitEvent = {
      type,
      data,
      error,
      timestamp: new Date()
    };

    const listeners = this.eventListeners.get(type);
    if (listeners) {
      listeners.forEach(listener => {
        try {
          listener(event);
        } catch (e) {
          console.error('Git event listener error:', e);
        }
      });
    }
  }

  /**
   * Subscribe to Git events
   */
  on(type: GitEventType, listener: GitEventListener): () => void {
    if (!this.eventListeners.has(type)) {
      this.eventListeners.set(type, new Set());
    }
    this.eventListeners.get(type)!.add(listener);

    // Return unsubscribe function
    return () => {
      this.eventListeners.get(type)?.delete(listener);
    };
  }

  /**
   * Get authentication credentials
   */
  private async getAuth(): Promise<GitAuth | undefined> {
    // Try config callback first
    if (this.config.onAuth) {
      return this.config.onAuth();
    }

    // Fall back to localStorage
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('github_token');
      if (token) {
        return {
          username: 'oauth2',
          password: token
        };
      }
    }

    return undefined;
  }

  /**
   * Create progress handler
   */
  private createProgressHandler(): ((event: { phase: string; loaded: number; total: number }) => void) | undefined {
    if (!this.config.onProgress) return undefined;

    return (event) => {
      const progressEvent: GitProgressEvent = {
        phase: event.phase,
        loaded: event.loaded,
        total: event.total,
        percent: event.total > 0 ? Math.round((event.loaded / event.total) * 100) : 0
      };
      this.config.onProgress!(progressEvent);
    };
  }

  /**
   * Clone a repository
   */
  async clone(options: CloneOptions): Promise<void> {
    await this.ensureInitialized();
    if (!git || !http || !this.fs) {
      throw new Error('Git dependencies not loaded');
    }

    this.emit('clone:start', { url: options.url, dir: options.dir });

    try {
      // Ensure directory exists
      await this.fs.promises.mkdir(options.dir, { recursive: true }).catch(() => {});

      const auth = await this.getAuth();

      await git.clone({
        fs: this.fs,
        http,
        dir: options.dir,
        url: options.url,
        ref: options.ref,
        singleBranch: options.singleBranch ?? true,
        depth: options.depth ?? 1,
        noTags: options.noTags ?? true,
        corsProxy: this.config.corsProxy,
        onProgress: this.createProgressHandler(),
        onMessage: this.config.onMessage,
        onAuth: auth ? () => auth : undefined,
        onAuthFailure: () => {
          console.warn('Git authentication failed');
          return { cancel: true };
        }
      });

      this.emit('clone:complete', { url: options.url, dir: options.dir });
    } catch (error) {
      this.emit('clone:error', { url: options.url, dir: options.dir }, error as Error);
      throw error;
    }
  }

  /**
   * Pull latest changes from remote
   */
  async pull(dir: string, ref?: string): Promise<void> {
    await this.ensureInitialized();
    if (!git || !http || !this.fs) {
      throw new Error('Git dependencies not loaded');
    }

    this.emit('pull:start', { dir });

    try {
      const auth = await this.getAuth();
      const author = await this.getAuthor();

      await git.pull({
        fs: this.fs,
        http,
        dir,
        ref,
        corsProxy: this.config.corsProxy,
        onProgress: this.createProgressHandler(),
        onMessage: this.config.onMessage,
        onAuth: auth ? () => auth : undefined,
        author
      });

      this.emit('pull:complete', { dir });
    } catch (error) {
      this.emit('pull:error', { dir }, error as Error);
      throw error;
    }
  }

  /**
   * Fetch changes from remote without merging
   */
  async fetch(dir: string, ref?: string): Promise<void> {
    await this.ensureInitialized();
    if (!git || !http || !this.fs) {
      throw new Error('Git dependencies not loaded');
    }

    const auth = await this.getAuth();

    await git.fetch({
      fs: this.fs,
      http,
      dir,
      ref,
      corsProxy: this.config.corsProxy,
      onProgress: this.createProgressHandler(),
      onMessage: this.config.onMessage,
      onAuth: auth ? () => auth : undefined
    });
  }

  /**
   * Get default author information
   */
  private async getAuthor(): Promise<{ name: string; email: string }> {
    // Try to get from localStorage
    if (typeof window !== 'undefined') {
      const userName = localStorage.getItem('llmos_user_name');
      const userEmail = localStorage.getItem('llmos_user_email');
      if (userName && userEmail) {
        return { name: userName, email: userEmail };
      }
    }

    // Default author
    return {
      name: 'LLMos User',
      email: 'user@llmos.dev'
    };
  }

  /**
   * Stage files for commit
   */
  async add(dir: string, filepath: string | string[]): Promise<void> {
    await this.ensureInitialized();
    if (!git || !this.fs) {
      throw new Error('Git dependencies not loaded');
    }

    const paths = Array.isArray(filepath) ? filepath : [filepath];

    for (const path of paths) {
      await git.add({
        fs: this.fs,
        dir,
        filepath: path
      });
    }
  }

  /**
   * Unstage files
   */
  async reset(dir: string, filepath: string | string[]): Promise<void> {
    await this.ensureInitialized();
    if (!git || !this.fs) {
      throw new Error('Git dependencies not loaded');
    }

    const paths = Array.isArray(filepath) ? filepath : [filepath];

    for (const path of paths) {
      await git.resetIndex({
        fs: this.fs,
        dir,
        filepath: path
      });
    }
  }

  /**
   * Create a commit
   */
  async commit(dir: string, options: CommitOptions): Promise<string> {
    await this.ensureInitialized();
    if (!git || !this.fs) {
      throw new Error('Git dependencies not loaded');
    }

    const author = {
      name: options.authorName || (await this.getAuthor()).name,
      email: options.authorEmail || (await this.getAuthor()).email
    };

    const sha = await git.commit({
      fs: this.fs,
      dir,
      message: options.message,
      author
    });

    this.emit('commit:complete', { dir, sha, message: options.message });

    return sha;
  }

  /**
   * Stage all changes and commit
   */
  async commitAll(dir: string, options: CommitOptions): Promise<string> {
    // Get status to find all changed files
    const status = await this.status(dir);

    // Stage all non-untracked files
    const filesToStage = status.files
      .filter(f => f.status !== 'untracked' && f.status !== 'unmodified')
      .map(f => f.path);

    if (filesToStage.length > 0) {
      await this.add(dir, filesToStage);
    }

    // Also stage untracked files
    const untrackedFiles = status.files
      .filter(f => f.status === 'untracked')
      .map(f => f.path);

    if (untrackedFiles.length > 0) {
      await this.add(dir, untrackedFiles);
    }

    return this.commit(dir, options);
  }

  /**
   * Push commits to remote
   */
  async push(dir: string, ref?: string, force = false): Promise<void> {
    await this.ensureInitialized();
    if (!git || !http || !this.fs) {
      throw new Error('Git dependencies not loaded');
    }

    this.emit('push:start', { dir });

    try {
      const auth = await this.getAuth();

      await git.push({
        fs: this.fs,
        http,
        dir,
        ref,
        force,
        corsProxy: this.config.corsProxy,
        onProgress: this.createProgressHandler(),
        onMessage: this.config.onMessage,
        onAuth: auth ? () => auth : undefined
      });

      this.emit('push:complete', { dir });
    } catch (error) {
      this.emit('push:error', { dir }, error as Error);
      throw error;
    }
  }

  /**
   * Get working directory status
   */
  async status(dir: string): Promise<StatusResult> {
    await this.ensureInitialized();
    if (!git || !this.fs) {
      throw new Error('Git dependencies not loaded');
    }

    // Get current branch
    const branch = await git.currentBranch({
      fs: this.fs,
      dir,
      fullname: false
    }) || 'HEAD';

    // Get status matrix
    const matrix = await git.statusMatrix({
      fs: this.fs,
      dir
    });

    // Convert matrix to StatusEntry array
    // Matrix format: [filepath, HEAD, WORKDIR, STAGE]
    const files: StatusEntry[] = matrix.map(([filepath, headStatus, workdirStatus, stageStatus]: [string, number, number, number]) => {
      let status: FileStatus = 'unmodified';
      let staged = false;

      // Interpret the status matrix
      // [HEAD, WORKDIR, STAGE]
      // 0 = absent, 1 = present

      if (headStatus === 0 && workdirStatus === 2 && stageStatus === 0) {
        status = 'untracked';
      } else if (headStatus === 0 && workdirStatus === 2 && stageStatus === 2) {
        status = 'added';
        staged = true;
      } else if (headStatus === 1 && workdirStatus === 0 && stageStatus === 0) {
        status = 'deleted';
        staged = true;
      } else if (headStatus === 1 && workdirStatus === 0 && stageStatus === 1) {
        status = 'deleted';
      } else if (headStatus === 1 && workdirStatus === 2 && stageStatus === 1) {
        status = 'unmodified';
      } else if (headStatus === 1 && workdirStatus === 2 && stageStatus === 2) {
        status = 'modified';
        staged = true;
      } else if (headStatus === 1 && workdirStatus === 2 && stageStatus === 3) {
        status = 'modified';
      }

      return {
        path: filepath,
        status,
        staged
      };
    });

    // Filter out unmodified files for cleaner output
    const changedFiles = files.filter(f => f.status !== 'unmodified');

    // TODO: Calculate ahead/behind from remote
    return {
      files: changedFiles,
      branch,
      ahead: 0,
      behind: 0
    };
  }

  /**
   * Get commit log
   */
  async log(dir: string, depth = 10, ref?: string): Promise<CommitLog[]> {
    await this.ensureInitialized();
    if (!git || !this.fs) {
      throw new Error('Git dependencies not loaded');
    }

    const commits = await git.log({
      fs: this.fs,
      dir,
      depth,
      ref
    });

    // Type for isomorphic-git log entry
    interface GitLogEntry {
      oid: string;
      commit: {
        message: string;
        author: { name: string; email: string; timestamp: number };
        committer: { name: string; email: string; timestamp: number };
        parent: string[];
      };
    }

    return (commits as GitLogEntry[]).map((commit: GitLogEntry) => ({
      oid: commit.oid,
      message: commit.commit.message,
      author: {
        name: commit.commit.author.name,
        email: commit.commit.author.email,
        timestamp: commit.commit.author.timestamp
      },
      committer: {
        name: commit.commit.committer.name,
        email: commit.commit.committer.email,
        timestamp: commit.commit.committer.timestamp
      },
      parent: commit.commit.parent
    }));
  }

  /**
   * List branches
   */
  async listBranches(dir: string, remote = false): Promise<BranchInfo[]> {
    await this.ensureInitialized();
    if (!git || !this.fs) {
      throw new Error('Git dependencies not loaded');
    }

    const currentBranch = await git.currentBranch({
      fs: this.fs,
      dir,
      fullname: false
    });

    const branches = await git.listBranches({
      fs: this.fs,
      dir,
      remote: remote ? 'origin' : undefined
    });

    return (branches as string[]).map((name: string) => ({
      name,
      current: name === currentBranch,
      commit: '',  // Would need additional call to get
      remote: remote ? 'origin' : undefined
    }));
  }

  /**
   * Create a new branch
   */
  async createBranch(dir: string, name: string, checkout = false): Promise<void> {
    await this.ensureInitialized();
    if (!git || !this.fs) {
      throw new Error('Git dependencies not loaded');
    }

    await git.branch({
      fs: this.fs,
      dir,
      ref: name,
      checkout
    });
  }

  /**
   * Delete a branch
   */
  async deleteBranch(dir: string, name: string): Promise<void> {
    await this.ensureInitialized();
    if (!git || !this.fs) {
      throw new Error('Git dependencies not loaded');
    }

    await git.deleteBranch({
      fs: this.fs,
      dir,
      ref: name
    });
  }

  /**
   * Checkout a branch or commit
   */
  async checkout(dir: string, ref: string): Promise<void> {
    await this.ensureInitialized();
    if (!git || !this.fs) {
      throw new Error('Git dependencies not loaded');
    }

    await git.checkout({
      fs: this.fs,
      dir,
      ref,
      force: false
    });
  }

  /**
   * Merge a branch into current branch
   */
  async merge(dir: string, theirBranch: string): Promise<MergeResult> {
    await this.ensureInitialized();
    if (!git || !this.fs) {
      throw new Error('Git dependencies not loaded');
    }

    try {
      const author = await this.getAuthor();

      const result = await git.merge({
        fs: this.fs,
        dir,
        theirs: theirBranch,
        author
      });

      return {
        success: true,
        mergeCommit: result.oid,
        message: 'Merge successful'
      };
    } catch (error) {
      // Check if it's a merge conflict
      if ((error as Error).message?.includes('conflict')) {
        return {
          success: false,
          conflicts: [],  // TODO: Parse conflicts
          message: 'Merge conflict detected'
        };
      }
      throw error;
    }
  }

  /**
   * Read a file from the repository
   */
  async readFile(dir: string, filepath: string): Promise<string> {
    await this.ensureInitialized();
    if (!this.fs) {
      throw new Error('Git dependencies not loaded');
    }

    const fullPath = `${dir}/${filepath}`;
    const content = await this.fs.promises.readFile(fullPath, { encoding: 'utf8' });
    return content as string;
  }

  /**
   * Write a file to the repository
   */
  async writeFile(dir: string, filepath: string, content: string): Promise<void> {
    await this.ensureInitialized();
    if (!this.fs) {
      throw new Error('Git dependencies not loaded');
    }

    const fullPath = `${dir}/${filepath}`;

    // Ensure parent directory exists
    const parentDir = fullPath.split('/').slice(0, -1).join('/');
    if (parentDir) {
      await this.fs.promises.mkdir(parentDir, { recursive: true }).catch(() => {});
    }

    await this.fs.promises.writeFile(fullPath, content, { encoding: 'utf8' });
  }

  /**
   * Delete a file from the repository
   */
  async deleteFile(dir: string, filepath: string): Promise<void> {
    await this.ensureInitialized();
    if (!git || !this.fs) {
      throw new Error('Git dependencies not loaded');
    }

    const fullPath = `${dir}/${filepath}`;

    // Remove from filesystem
    await this.fs.promises.unlink(fullPath);

    // Stage the deletion
    await git.remove({
      fs: this.fs,
      dir,
      filepath
    });
  }

  /**
   * List files in a directory
   */
  async listFiles(dir: string, subdir = ''): Promise<string[]> {
    await this.ensureInitialized();
    if (!this.fs) {
      throw new Error('Git dependencies not loaded');
    }

    const targetDir = subdir ? `${dir}/${subdir}` : dir;

    try {
      const entries = await this.fs.promises.readdir(targetDir);

      const results: string[] = [];

      for (const entry of entries) {
        // Skip .git directory
        if (entry === '.git') continue;

        const fullPath = `${targetDir}/${entry}`;
        const stats = await this.fs.promises.stat(fullPath);

        if (stats.isDirectory()) {
          // Recursively list subdirectories
          const subFiles = await this.listFiles(dir, subdir ? `${subdir}/${entry}` : entry);
          results.push(...subFiles);
        } else {
          results.push(subdir ? `${subdir}/${entry}` : entry);
        }
      }

      return results;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  /**
   * Check if a repository exists in the directory
   */
  async isRepository(dir: string): Promise<boolean> {
    await this.ensureInitialized();
    if (!this.fs) {
      throw new Error('Git dependencies not loaded');
    }

    try {
      await this.fs.promises.stat(`${dir}/.git`);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get the remote URL for a repository
   */
  async getRemoteUrl(dir: string, remote = 'origin'): Promise<string | null> {
    await this.ensureInitialized();
    if (!git || !this.fs) {
      throw new Error('Git dependencies not loaded');
    }

    try {
      const remotes = await git.listRemotes({
        fs: this.fs,
        dir
      });

      const targetRemote = (remotes as Array<{ remote: string; url: string }>).find((r: { remote: string; url: string }) => r.remote === remote);
      return targetRemote?.url || null;
    } catch {
      return null;
    }
  }

  /**
   * Set the remote URL for a repository
   */
  async setRemoteUrl(dir: string, url: string, remote = 'origin'): Promise<void> {
    await this.ensureInitialized();
    if (!git || !this.fs) {
      throw new Error('Git dependencies not loaded');
    }

    // Remove existing remote if it exists
    try {
      await git.deleteRemote({
        fs: this.fs,
        dir,
        remote
      });
    } catch {
      // Remote might not exist
    }

    // Add new remote
    await git.addRemote({
      fs: this.fs,
      dir,
      remote,
      url
    });
  }

  /**
   * Wipe the filesystem (for testing or reset)
   */
  async wipe(): Promise<void> {
    if (typeof window !== 'undefined' && LightningFS) {
      this.fs = new LightningFS(this.volumeName, { wipe: true });
    }
  }
}

// Export singleton factory
const clients: Map<string, WasmGitClient> = new Map();

export function getWasmGitClient(volumeName: string, config?: GitClientConfig): WasmGitClient {
  const key = volumeName;

  if (!clients.has(key)) {
    clients.set(key, new WasmGitClient(volumeName, config));
  }

  return clients.get(key)!;
}
