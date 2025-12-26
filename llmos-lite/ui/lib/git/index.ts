/**
 * WebAssembly Git Client Module
 *
 * Browser-native Git implementation for LLMos volumes.
 * Uses isomorphic-git with LightningFS (IndexedDB backend).
 *
 * @example
 * ```typescript
 * import { getWasmGitClient } from '@/lib/git';
 *
 * const client = getWasmGitClient('my-volume');
 * await client.initialize();
 *
 * // Clone a repository
 * await client.clone({
 *   url: 'https://github.com/user/repo',
 *   dir: '/my-volume'
 * });
 *
 * // Make changes and commit
 * await client.writeFile('/my-volume', 'file.txt', 'content');
 * await client.commitAll('/my-volume', { message: 'Add file' });
 * await client.push('/my-volume');
 * ```
 */

// Core client
export { WasmGitClient, getWasmGitClient } from './wasm-git-client';

// Types
export type {
  GitAuth,
  GitProgressEvent,
  GitClientConfig,
  CloneOptions,
  CommitOptions,
  FileStatus,
  StatusEntry,
  StatusResult,
  CommitLog,
  FileDiff,
  DiffHunk,
  BranchInfo,
  RemoteInfo,
  MergeConflict,
  MergeResult,
  VolumeType,
  VolumeGitConfig,
  SyncStatus,
  GitEventType,
  GitEvent,
  GitEventListener
} from './types';
