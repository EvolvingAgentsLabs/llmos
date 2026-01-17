/**
 * WebAssembly Git Client - Type Definitions
 *
 * Types for the browser-native Git implementation using isomorphic-git
 */

/**
 * Git authentication credentials
 */
export interface GitAuth {
  username: string;
  password: string;  // Personal access token for GitHub
}

/**
 * Progress event for Git operations
 */
export interface GitProgressEvent {
  phase: string;
  loaded: number;
  total: number;
  percent?: number;
}

/**
 * Git client configuration
 */
export interface GitClientConfig {
  /** CORS proxy URL for GitHub requests */
  corsProxy?: string;
  /** Progress callback for long operations */
  onProgress?: (event: GitProgressEvent) => void;
  /** Authentication provider */
  onAuth?: () => Promise<GitAuth>;
  /** Message handler for Git operations */
  onMessage?: (message: string) => void;
}

/**
 * Clone options
 */
export interface CloneOptions {
  /** Repository URL */
  url: string;
  /** Target directory in the virtual filesystem */
  dir: string;
  /** Branch to clone (default: default branch) */
  ref?: string;
  /** Clone depth for shallow clone (default: 1 for speed) */
  depth?: number;
  /** Only clone single branch */
  singleBranch?: boolean;
  /** Skip tags */
  noTags?: boolean;
}

/**
 * Commit options
 */
export interface CommitOptions {
  /** Commit message */
  message: string;
  /** Author name */
  authorName?: string;
  /** Author email */
  authorEmail?: string;
}

/**
 * File status in working directory
 * Based on isomorphic-git statusMatrix format
 */
export type FileStatus =
  | 'unmodified'
  | 'modified'
  | 'added'
  | 'deleted'
  | 'untracked'
  | 'ignored'
  | 'absent';

/**
 * Status entry for a single file
 */
export interface StatusEntry {
  path: string;
  status: FileStatus;
  staged: boolean;
}

/**
 * Result of git status operation
 */
export interface StatusResult {
  files: StatusEntry[];
  branch: string;
  ahead: number;
  behind: number;
}

/**
 * Commit log entry
 */
export interface CommitLog {
  oid: string;
  message: string;
  author: {
    name: string;
    email: string;
    timestamp: number;
  };
  committer: {
    name: string;
    email: string;
    timestamp: number;
  };
  parent: string[];
}

/**
 * Diff hunk for file changes
 */
export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: string[];
}

/**
 * Diff result for a single file
 */
export interface FileDiff {
  path: string;
  type: 'add' | 'modify' | 'delete' | 'rename';
  oldPath?: string;  // For renames
  hunks: DiffHunk[];
  binary: boolean;
}

/**
 * Branch information
 */
export interface BranchInfo {
  name: string;
  current: boolean;
  commit: string;
  remote?: string;
  upstream?: string;
}

/**
 * Remote repository information
 */
export interface RemoteInfo {
  name: string;
  url: string;
  refs: {
    fetch: string;
    push: string;
  };
}

/**
 * Merge conflict information
 */
export interface MergeConflict {
  path: string;
  ourContent: string;
  theirContent: string;
  baseContent: string;
}

/**
 * Result of merge operation
 */
export interface MergeResult {
  success: boolean;
  mergeCommit?: string;
  conflicts?: MergeConflict[];
  message?: string;
}

/**
 * Volume type (matches existing VolumeType)
 */
export type VolumeType = 'system' | 'team' | 'user';

/**
 * Volume Git configuration
 */
export interface VolumeGitConfig {
  type: VolumeType;
  repoUrl: string;
  branch: string;
  dir: string;  // Directory in virtual filesystem
  readOnly: boolean;
}

/**
 * Sync status for a volume
 */
export interface SyncStatus {
  volume: VolumeType;
  synced: boolean;
  lastSync?: Date;
  ahead: number;
  behind: number;
  hasConflicts: boolean;
  error?: string;
}

/**
 * Event types for Git operations
 */
export type GitEventType =
  | 'clone:start'
  | 'clone:progress'
  | 'clone:complete'
  | 'clone:error'
  | 'pull:start'
  | 'pull:complete'
  | 'pull:error'
  | 'push:start'
  | 'push:complete'
  | 'push:error'
  | 'commit:complete'
  | 'sync:status';

/**
 * Git event payload
 */
export interface GitEvent {
  type: GitEventType;
  volume?: VolumeType;
  data?: unknown;
  error?: Error;
  timestamp: Date;
}

/**
 * Git event listener
 */
export type GitEventListener = (event: GitEvent) => void;
