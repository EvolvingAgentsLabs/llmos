/**
 * Artifact Repository
 *
 * Data access layer for Artifact entities using the new storage pattern.
 * Provides type-safe CRUD operations with Result<T> error handling.
 */

import { Result, ok, err, AppError, appError, ErrorCodes } from '../core/result';
import { StorageAdapter, IndexedDBStorageAdapter, MemoryStorageAdapter } from '../storage/adapter';
import {
  Artifact,
  CreateArtifactParams,
  UpdateArtifactParams,
  ArtifactFilterOptions,
  ArtifactVolume,
  ArtifactType,
  ArtifactStatus,
} from '../artifacts/types';

// ============================================================================
// REPOSITORY INTERFACE
// ============================================================================

export interface IArtifactRepository {
  findById(id: string): Promise<Result<Artifact | null, AppError>>;
  findAll(): Promise<Result<Artifact[], AppError>>;
  findByVolume(volume: ArtifactVolume): Promise<Result<Artifact[], AppError>>;
  findByType(type: ArtifactType): Promise<Result<Artifact[], AppError>>;
  findByStatus(status: ArtifactStatus): Promise<Result<Artifact[], AppError>>;
  filter(options: ArtifactFilterOptions): Promise<Result<Artifact[], AppError>>;
  create(params: CreateArtifactParams): Promise<Result<Artifact, AppError>>;
  update(id: string, params: UpdateArtifactParams): Promise<Result<Artifact, AppError>>;
  delete(id: string): Promise<Result<void, AppError>>;
  commit(id: string, commitHash: string, filePath: string): Promise<Result<Artifact, AppError>>;
  fork(id: string, targetVolume?: ArtifactVolume): Promise<Result<Artifact, AppError>>;
  count(filter?: (a: Artifact) => boolean): Promise<Result<number, AppError>>;
  clear(): Promise<Result<void, AppError>>;
}

// ============================================================================
// IMPLEMENTATION
// ============================================================================

export class ArtifactRepository implements IArtifactRepository {
  private storage: StorageAdapter;
  private readonly prefix = 'artifact';

  constructor(storage?: StorageAdapter) {
    // Use IndexedDB by default, fall back to memory for SSR
    if (storage) {
      this.storage = storage;
    } else if (typeof window !== 'undefined') {
      this.storage = new IndexedDBStorageAdapter('llmos', 'artifacts');
    } else {
      this.storage = new MemoryStorageAdapter();
    }
  }

  private getKey(id: string): string {
    return `${this.prefix}:${id}`;
  }

  private getIndexKey(): string {
    return `${this.prefix}:_index`;
  }

  private generateId(): string {
    return `artifact-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private async getIndex(): Promise<Result<string[], AppError>> {
    const result = await this.storage.get<string[]>(this.getIndexKey());
    if (!result.ok) return result;
    return ok(result.value || []);
  }

  private async saveIndex(ids: string[]): Promise<Result<void, AppError>> {
    return this.storage.set(this.getIndexKey(), ids);
  }

  async findById(id: string): Promise<Result<Artifact | null, AppError>> {
    return this.storage.get<Artifact>(this.getKey(id));
  }

  async findAll(): Promise<Result<Artifact[], AppError>> {
    const indexResult = await this.getIndex();
    if (!indexResult.ok) return indexResult as Result<Artifact[], AppError>;

    const artifacts: Artifact[] = [];
    for (const id of indexResult.value) {
      const result = await this.storage.get<Artifact>(this.getKey(id));
      if (result.ok && result.value) {
        artifacts.push(result.value);
      }
    }

    return ok(artifacts);
  }

  async findByVolume(volume: ArtifactVolume): Promise<Result<Artifact[], AppError>> {
    const allResult = await this.findAll();
    if (!allResult.ok) return allResult;
    return ok(allResult.value.filter((a) => a.volume === volume));
  }

  async findByType(type: ArtifactType): Promise<Result<Artifact[], AppError>> {
    const allResult = await this.findAll();
    if (!allResult.ok) return allResult;
    return ok(allResult.value.filter((a) => a.type === type));
  }

  async findByStatus(status: ArtifactStatus): Promise<Result<Artifact[], AppError>> {
    const allResult = await this.findAll();
    if (!allResult.ok) return allResult;
    return ok(allResult.value.filter((a) => a.status === status));
  }

  async filter(options: ArtifactFilterOptions): Promise<Result<Artifact[], AppError>> {
    const allResult = await this.findAll();
    if (!allResult.ok) return allResult;

    let filtered = allResult.value;

    // Filter by type
    if (options.type) {
      const types = Array.isArray(options.type) ? options.type : [options.type];
      filtered = filtered.filter((a) => types.includes(a.type));
    }

    // Filter by volume
    if (options.volume) {
      const volumes = Array.isArray(options.volume) ? options.volume : [options.volume];
      filtered = filtered.filter((a) => volumes.includes(a.volume));
    }

    // Filter by status
    if (options.status) {
      const statuses = Array.isArray(options.status) ? options.status : [options.status];
      filtered = filtered.filter((a) => statuses.includes(a.status));
    }

    // Filter by tags
    if (options.tags && options.tags.length > 0) {
      filtered = filtered.filter(
        (a) => a.tags && options.tags!.some((tag) => a.tags!.includes(tag))
      );
    }

    // Filter by search term
    if (options.search) {
      const searchLower = options.search.toLowerCase();
      filtered = filtered.filter(
        (a) =>
          a.name.toLowerCase().includes(searchLower) ||
          (a.description && a.description.toLowerCase().includes(searchLower))
      );
    }

    // Filter by creator session
    if (options.createdBy) {
      filtered = filtered.filter((a) => a.createdBy === options.createdBy);
    }

    return ok(filtered);
  }

  async create(params: CreateArtifactParams): Promise<Result<Artifact, AppError>> {
    const id = this.generateId();
    const now = new Date().toISOString();

    const artifact: Artifact = {
      ...params,
      id,
      status: params.status || 'temporal',
      createdAt: now,
      updatedAt: now,
    };

    // Save artifact
    const saveResult = await this.storage.set(this.getKey(id), artifact);
    if (!saveResult.ok) return saveResult as Result<Artifact, AppError>;

    // Update index
    const indexResult = await this.getIndex();
    if (!indexResult.ok) return indexResult as Result<Artifact, AppError>;

    const ids = [...indexResult.value, id];
    const indexSaveResult = await this.saveIndex(ids);
    if (!indexSaveResult.ok) return indexSaveResult as Result<Artifact, AppError>;

    return ok(artifact);
  }

  async update(id: string, params: UpdateArtifactParams): Promise<Result<Artifact, AppError>> {
    const existingResult = await this.findById(id);
    if (!existingResult.ok) return existingResult as Result<Artifact, AppError>;
    if (!existingResult.value) {
      return err(appError(ErrorCodes.NOT_FOUND, `Artifact with id ${id} not found`));
    }

    const updated: Artifact = {
      ...existingResult.value,
      ...params,
      updatedAt: new Date().toISOString(),
    };

    const saveResult = await this.storage.set(this.getKey(id), updated);
    if (!saveResult.ok) return saveResult as Result<Artifact, AppError>;

    return ok(updated);
  }

  async delete(id: string): Promise<Result<void, AppError>> {
    // Delete artifact
    const deleteResult = await this.storage.delete(this.getKey(id));
    if (!deleteResult.ok) return deleteResult;

    // Update index
    const indexResult = await this.getIndex();
    if (!indexResult.ok) return indexResult as Result<void, AppError>;

    const ids = indexResult.value.filter((existingId) => existingId !== id);
    return this.saveIndex(ids);
  }

  async commit(
    id: string,
    commitHash: string,
    filePath: string
  ): Promise<Result<Artifact, AppError>> {
    return this.update(id, {
      status: 'committed',
      commitHash,
      filePath,
    });
  }

  async fork(id: string, targetVolume?: ArtifactVolume): Promise<Result<Artifact, AppError>> {
    const existingResult = await this.findById(id);
    if (!existingResult.ok) return existingResult as Result<Artifact, AppError>;
    if (!existingResult.value) {
      return err(appError(ErrorCodes.NOT_FOUND, `Artifact with id ${id} not found`));
    }

    const original = existingResult.value;
    const forkedParams: CreateArtifactParams = {
      name: `${original.name} (fork)`,
      type: original.type,
      volume: targetVolume || original.volume,
      createdBy: original.createdBy,
      codeView: original.codeView,
      renderView: original.renderView,
      description: original.description,
      tags: original.tags,
      dependencies: original.dependencies,
      version: '1.0.0',
      parentId: id,
    };

    return this.create(forkedParams);
  }

  async count(filter?: (a: Artifact) => boolean): Promise<Result<number, AppError>> {
    if (!filter) {
      const indexResult = await this.getIndex();
      if (!indexResult.ok) return indexResult as Result<number, AppError>;
      return ok(indexResult.value.length);
    }

    const allResult = await this.findAll();
    if (!allResult.ok) return allResult as Result<number, AppError>;
    return ok(allResult.value.filter(filter).length);
  }

  async clear(): Promise<Result<void, AppError>> {
    const indexResult = await this.getIndex();
    if (!indexResult.ok) return indexResult as Result<void, AppError>;

    for (const id of indexResult.value) {
      await this.storage.delete(this.getKey(id));
    }

    return this.saveIndex([]);
  }

  // Temporal artifacts (not yet committed)
  async getTemporal(): Promise<Result<Artifact[], AppError>> {
    return this.findByStatus('temporal');
  }

  // Committed artifacts (persisted to volume)
  async getCommitted(): Promise<Result<Artifact[], AppError>> {
    return this.findByStatus('committed');
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let instance: ArtifactRepository | null = null;

export function getArtifactRepository(): ArtifactRepository {
  if (!instance) {
    instance = new ArtifactRepository();
  }
  return instance;
}
