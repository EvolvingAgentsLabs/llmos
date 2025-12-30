/**
 * Repository Base Pattern
 *
 * Abstract repository interface for CRUD operations.
 * Provides a consistent API for data access across different entities.
 */

import { Result, ok, err, AppError, appError, ErrorCodes } from '../core/result';
import { StorageAdapter } from '../storage/adapter';

// ============================================================================
// BASE ENTITY INTERFACE
// ============================================================================

export interface Entity {
  id: string;
  createdAt: number;
  updatedAt: number;
}

// ============================================================================
// QUERY OPTIONS
// ============================================================================

export interface QueryOptions<T> {
  filter?: (item: T) => boolean;
  sort?: {
    field: keyof T;
    order: 'asc' | 'desc';
  };
  limit?: number;
  offset?: number;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  hasMore: boolean;
}

// ============================================================================
// REPOSITORY INTERFACE
// ============================================================================

export interface Repository<T extends Entity> {
  /**
   * Get an entity by ID
   */
  findById(id: string): Promise<Result<T | null, AppError>>;

  /**
   * Get all entities
   */
  findAll(options?: QueryOptions<T>): Promise<Result<T[], AppError>>;

  /**
   * Get paginated entities
   */
  findPaginated(options?: QueryOptions<T>): Promise<Result<PaginatedResult<T>, AppError>>;

  /**
   * Create a new entity
   */
  create(data: Omit<T, 'id' | 'createdAt' | 'updatedAt'>): Promise<Result<T, AppError>>;

  /**
   * Update an existing entity
   */
  update(id: string, data: Partial<Omit<T, 'id' | 'createdAt' | 'updatedAt'>>): Promise<Result<T, AppError>>;

  /**
   * Delete an entity
   */
  delete(id: string): Promise<Result<void, AppError>>;

  /**
   * Check if an entity exists
   */
  exists(id: string): Promise<Result<boolean, AppError>>;

  /**
   * Count entities
   */
  count(filter?: (item: T) => boolean): Promise<Result<number, AppError>>;
}

// ============================================================================
// BASE REPOSITORY IMPLEMENTATION
// ============================================================================

export abstract class BaseRepository<T extends Entity> implements Repository<T> {
  protected storage: StorageAdapter;
  protected readonly prefix: string;

  constructor(storage: StorageAdapter, prefix: string) {
    this.storage = storage;
    this.prefix = prefix;
  }

  protected getKey(id: string): string {
    return `${this.prefix}:${id}`;
  }

  protected getIndexKey(): string {
    return `${this.prefix}:_index`;
  }

  protected generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  protected async getIndex(): Promise<Result<string[], AppError>> {
    const result = await this.storage.get<string[]>(this.getIndexKey());
    if (!result.ok) return result;
    return ok(result.value || []);
  }

  protected async saveIndex(ids: string[]): Promise<Result<void, AppError>> {
    return this.storage.set(this.getIndexKey(), ids);
  }

  async findById(id: string): Promise<Result<T | null, AppError>> {
    return this.storage.get<T>(this.getKey(id));
  }

  async findAll(options?: QueryOptions<T>): Promise<Result<T[], AppError>> {
    const indexResult = await this.getIndex();
    if (!indexResult.ok) return indexResult as Result<T[], AppError>;

    const ids = indexResult.value;
    const items: T[] = [];

    for (const id of ids) {
      const result = await this.storage.get<T>(this.getKey(id));
      if (result.ok && result.value) {
        items.push(result.value);
      }
    }

    let filtered = items;

    // Apply filter
    if (options?.filter) {
      filtered = filtered.filter(options.filter);
    }

    // Apply sort
    if (options?.sort) {
      const { field, order } = options.sort;
      filtered.sort((a, b) => {
        const aVal = a[field];
        const bVal = b[field];
        if (aVal < bVal) return order === 'asc' ? -1 : 1;
        if (aVal > bVal) return order === 'asc' ? 1 : -1;
        return 0;
      });
    }

    // Apply offset and limit
    if (options?.offset !== undefined || options?.limit !== undefined) {
      const offset = options.offset || 0;
      const limit = options.limit || filtered.length;
      filtered = filtered.slice(offset, offset + limit);
    }

    return ok(filtered);
  }

  async findPaginated(options?: QueryOptions<T>): Promise<Result<PaginatedResult<T>, AppError>> {
    const allResult = await this.findAll({ filter: options?.filter, sort: options?.sort });
    if (!allResult.ok) return allResult as Result<PaginatedResult<T>, AppError>;

    const total = allResult.value.length;
    const offset = options?.offset || 0;
    const limit = options?.limit || 20;

    const items = allResult.value.slice(offset, offset + limit);
    const hasMore = offset + limit < total;

    return ok({ items, total, hasMore });
  }

  async create(data: Omit<T, 'id' | 'createdAt' | 'updatedAt'>): Promise<Result<T, AppError>> {
    const id = this.generateId();
    const now = Date.now();

    const entity = {
      ...data,
      id,
      createdAt: now,
      updatedAt: now,
    } as T;

    // Save entity
    const saveResult = await this.storage.set(this.getKey(id), entity);
    if (!saveResult.ok) return saveResult as Result<T, AppError>;

    // Update index
    const indexResult = await this.getIndex();
    if (!indexResult.ok) return indexResult as Result<T, AppError>;

    const ids = [...indexResult.value, id];
    const indexSaveResult = await this.saveIndex(ids);
    if (!indexSaveResult.ok) return indexSaveResult as Result<T, AppError>;

    return ok(entity);
  }

  async update(id: string, data: Partial<Omit<T, 'id' | 'createdAt' | 'updatedAt'>>): Promise<Result<T, AppError>> {
    const existingResult = await this.findById(id);
    if (!existingResult.ok) return existingResult as Result<T, AppError>;
    if (!existingResult.value) {
      return err(appError(ErrorCodes.NOT_FOUND, `Entity with id ${id} not found`));
    }

    const updated = {
      ...existingResult.value,
      ...data,
      updatedAt: Date.now(),
    } as T;

    const saveResult = await this.storage.set(this.getKey(id), updated);
    if (!saveResult.ok) return saveResult as Result<T, AppError>;

    return ok(updated);
  }

  async delete(id: string): Promise<Result<void, AppError>> {
    // Delete entity
    const deleteResult = await this.storage.delete(this.getKey(id));
    if (!deleteResult.ok) return deleteResult;

    // Update index
    const indexResult = await this.getIndex();
    if (!indexResult.ok) return indexResult as Result<void, AppError>;

    const ids = indexResult.value.filter((existingId) => existingId !== id);
    return this.saveIndex(ids);
  }

  async exists(id: string): Promise<Result<boolean, AppError>> {
    const result = await this.findById(id);
    if (!result.ok) return result as Result<boolean, AppError>;
    return ok(result.value !== null);
  }

  async count(filter?: (item: T) => boolean): Promise<Result<number, AppError>> {
    if (!filter) {
      const indexResult = await this.getIndex();
      if (!indexResult.ok) return indexResult as Result<number, AppError>;
      return ok(indexResult.value.length);
    }

    const allResult = await this.findAll({ filter });
    if (!allResult.ok) return allResult as Result<number, AppError>;
    return ok(allResult.value.length);
  }

  /**
   * Bulk delete entities
   */
  async deleteMany(ids: string[]): Promise<Result<void, AppError>> {
    for (const id of ids) {
      const result = await this.delete(id);
      if (!result.ok) return result;
    }
    return ok(undefined);
  }

  /**
   * Clear all entities
   */
  async clear(): Promise<Result<void, AppError>> {
    const indexResult = await this.getIndex();
    if (!indexResult.ok) return indexResult as Result<void, AppError>;

    const ids = indexResult.value;
    for (const id of ids) {
      await this.storage.delete(this.getKey(id));
    }

    return this.saveIndex([]);
  }
}
