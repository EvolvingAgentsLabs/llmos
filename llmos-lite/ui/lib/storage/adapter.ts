/**
 * Storage Adapter Interface
 *
 * Abstract storage layer that allows switching between different
 * storage backends (localStorage, IndexedDB, memory, etc.)
 */

import { Result, ok, err, AppError, appError, ErrorCodes } from '../core/result';

// ============================================================================
// STORAGE ADAPTER INTERFACE
// ============================================================================

export interface StorageAdapter {
  /**
   * Get a value by key
   */
  get<T>(key: string): Promise<Result<T | null, AppError>>;

  /**
   * Set a value
   */
  set<T>(key: string, value: T): Promise<Result<void, AppError>>;

  /**
   * Delete a value
   */
  delete(key: string): Promise<Result<void, AppError>>;

  /**
   * Check if a key exists
   */
  has(key: string): Promise<Result<boolean, AppError>>;

  /**
   * Get all keys matching a prefix
   */
  keys(prefix?: string): Promise<Result<string[], AppError>>;

  /**
   * Clear all data (optional prefix filter)
   */
  clear(prefix?: string): Promise<Result<void, AppError>>;

  /**
   * Get multiple values at once
   */
  getMany<T>(keys: string[]): Promise<Result<Map<string, T>, AppError>>;

  /**
   * Set multiple values at once
   */
  setMany<T>(entries: Map<string, T>): Promise<Result<void, AppError>>;
}

// ============================================================================
// MEMORY STORAGE ADAPTER
// ============================================================================

export class MemoryStorageAdapter implements StorageAdapter {
  private store = new Map<string, unknown>();

  async get<T>(key: string): Promise<Result<T | null, AppError>> {
    const value = this.store.get(key);
    return ok(value !== undefined ? (value as T) : null);
  }

  async set<T>(key: string, value: T): Promise<Result<void, AppError>> {
    this.store.set(key, value);
    return ok(undefined);
  }

  async delete(key: string): Promise<Result<void, AppError>> {
    this.store.delete(key);
    return ok(undefined);
  }

  async has(key: string): Promise<Result<boolean, AppError>> {
    return ok(this.store.has(key));
  }

  async keys(prefix?: string): Promise<Result<string[], AppError>> {
    const allKeys = Array.from(this.store.keys());
    if (prefix) {
      return ok(allKeys.filter((k) => k.startsWith(prefix)));
    }
    return ok(allKeys);
  }

  async clear(prefix?: string): Promise<Result<void, AppError>> {
    if (prefix) {
      for (const key of this.store.keys()) {
        if (key.startsWith(prefix)) {
          this.store.delete(key);
        }
      }
    } else {
      this.store.clear();
    }
    return ok(undefined);
  }

  async getMany<T>(keys: string[]): Promise<Result<Map<string, T>, AppError>> {
    const result = new Map<string, T>();
    for (const key of keys) {
      const value = this.store.get(key);
      if (value !== undefined) {
        result.set(key, value as T);
      }
    }
    return ok(result);
  }

  async setMany<T>(entries: Map<string, T>): Promise<Result<void, AppError>> {
    for (const [key, value] of entries) {
      this.store.set(key, value);
    }
    return ok(undefined);
  }
}

// ============================================================================
// LOCAL STORAGE ADAPTER
// ============================================================================

export class LocalStorageAdapter implements StorageAdapter {
  private prefix: string;

  constructor(prefix = 'llmos:') {
    this.prefix = prefix;
  }

  private getKey(key: string): string {
    return `${this.prefix}${key}`;
  }

  async get<T>(key: string): Promise<Result<T | null, AppError>> {
    try {
      const item = localStorage.getItem(this.getKey(key));
      if (item === null) {
        return ok(null);
      }
      return ok(JSON.parse(item) as T);
    } catch (error) {
      return err(
        appError(ErrorCodes.STORAGE_ERROR, `Failed to get ${key}`, error)
      );
    }
  }

  async set<T>(key: string, value: T): Promise<Result<void, AppError>> {
    try {
      localStorage.setItem(this.getKey(key), JSON.stringify(value));
      return ok(undefined);
    } catch (error) {
      return err(
        appError(ErrorCodes.STORAGE_ERROR, `Failed to set ${key}`, error)
      );
    }
  }

  async delete(key: string): Promise<Result<void, AppError>> {
    try {
      localStorage.removeItem(this.getKey(key));
      return ok(undefined);
    } catch (error) {
      return err(
        appError(ErrorCodes.STORAGE_ERROR, `Failed to delete ${key}`, error)
      );
    }
  }

  async has(key: string): Promise<Result<boolean, AppError>> {
    return ok(localStorage.getItem(this.getKey(key)) !== null);
  }

  async keys(prefix?: string): Promise<Result<string[], AppError>> {
    const keys: string[] = [];
    const searchPrefix = prefix ? this.getKey(prefix) : this.prefix;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(searchPrefix)) {
        keys.push(key.slice(this.prefix.length));
      }
    }
    return ok(keys);
  }

  async clear(prefix?: string): Promise<Result<void, AppError>> {
    try {
      const keysResult = await this.keys(prefix);
      if (!keysResult.ok) {
        return keysResult;
      }
      for (const key of keysResult.value) {
        localStorage.removeItem(this.getKey(key));
      }
      return ok(undefined);
    } catch (error) {
      return err(appError(ErrorCodes.STORAGE_ERROR, 'Failed to clear', error));
    }
  }

  async getMany<T>(keys: string[]): Promise<Result<Map<string, T>, AppError>> {
    const result = new Map<string, T>();
    for (const key of keys) {
      const valueResult = await this.get<T>(key);
      if (valueResult.ok && valueResult.value !== null) {
        result.set(key, valueResult.value);
      }
    }
    return ok(result);
  }

  async setMany<T>(entries: Map<string, T>): Promise<Result<void, AppError>> {
    for (const [key, value] of entries) {
      const result = await this.set(key, value);
      if (!result.ok) {
        return result;
      }
    }
    return ok(undefined);
  }
}

// ============================================================================
// INDEXED DB STORAGE ADAPTER
// ============================================================================

export class IndexedDBStorageAdapter implements StorageAdapter {
  private dbName: string;
  private storeName: string;
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;

  constructor(dbName = 'llmos', storeName = 'storage') {
    this.dbName = dbName;
    this.storeName = storeName;
  }

  private async init(): Promise<Result<void, AppError>> {
    if (this.db) {
      return ok(undefined);
    }

    if (this.initPromise) {
      await this.initPromise;
      return ok(undefined);
    }

    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);

      request.onerror = () => {
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName);
        }
      };
    });

    try {
      await this.initPromise;
      return ok(undefined);
    } catch (error) {
      return err(
        appError(ErrorCodes.STORAGE_ERROR, 'Failed to initialize IndexedDB', error)
      );
    }
  }

  private getStore(mode: IDBTransactionMode): IDBObjectStore | null {
    if (!this.db) return null;
    const tx = this.db.transaction(this.storeName, mode);
    return tx.objectStore(this.storeName);
  }

  async get<T>(key: string): Promise<Result<T | null, AppError>> {
    const initResult = await this.init();
    if (!initResult.ok) return initResult as Result<T | null, AppError>;

    return new Promise((resolve) => {
      const store = this.getStore('readonly');
      if (!store) {
        resolve(err(appError(ErrorCodes.STORAGE_ERROR, 'Store not available')));
        return;
      }

      const request = store.get(key);
      request.onerror = () => {
        resolve(err(appError(ErrorCodes.STORAGE_ERROR, `Failed to get ${key}`, request.error)));
      };
      request.onsuccess = () => {
        resolve(ok(request.result !== undefined ? (request.result as T) : null));
      };
    });
  }

  async set<T>(key: string, value: T): Promise<Result<void, AppError>> {
    const initResult = await this.init();
    if (!initResult.ok) return initResult;

    return new Promise((resolve) => {
      const store = this.getStore('readwrite');
      if (!store) {
        resolve(err(appError(ErrorCodes.STORAGE_ERROR, 'Store not available')));
        return;
      }

      const request = store.put(value, key);
      request.onerror = () => {
        resolve(err(appError(ErrorCodes.STORAGE_ERROR, `Failed to set ${key}`, request.error)));
      };
      request.onsuccess = () => {
        resolve(ok(undefined));
      };
    });
  }

  async delete(key: string): Promise<Result<void, AppError>> {
    const initResult = await this.init();
    if (!initResult.ok) return initResult;

    return new Promise((resolve) => {
      const store = this.getStore('readwrite');
      if (!store) {
        resolve(err(appError(ErrorCodes.STORAGE_ERROR, 'Store not available')));
        return;
      }

      const request = store.delete(key);
      request.onerror = () => {
        resolve(err(appError(ErrorCodes.STORAGE_ERROR, `Failed to delete ${key}`, request.error)));
      };
      request.onsuccess = () => {
        resolve(ok(undefined));
      };
    });
  }

  async has(key: string): Promise<Result<boolean, AppError>> {
    const result = await this.get(key);
    if (!result.ok) return result as Result<boolean, AppError>;
    return ok(result.value !== null);
  }

  async keys(prefix?: string): Promise<Result<string[], AppError>> {
    const initResult = await this.init();
    if (!initResult.ok) return initResult as Result<string[], AppError>;

    return new Promise((resolve) => {
      const store = this.getStore('readonly');
      if (!store) {
        resolve(err(appError(ErrorCodes.STORAGE_ERROR, 'Store not available')));
        return;
      }

      const request = store.getAllKeys();
      request.onerror = () => {
        resolve(err(appError(ErrorCodes.STORAGE_ERROR, 'Failed to get keys', request.error)));
      };
      request.onsuccess = () => {
        let keys = request.result as string[];
        if (prefix) {
          keys = keys.filter((k) => k.startsWith(prefix));
        }
        resolve(ok(keys));
      };
    });
  }

  async clear(prefix?: string): Promise<Result<void, AppError>> {
    if (!prefix) {
      const initResult = await this.init();
      if (!initResult.ok) return initResult;

      return new Promise((resolve) => {
        const store = this.getStore('readwrite');
        if (!store) {
          resolve(err(appError(ErrorCodes.STORAGE_ERROR, 'Store not available')));
          return;
        }

        const request = store.clear();
        request.onerror = () => {
          resolve(err(appError(ErrorCodes.STORAGE_ERROR, 'Failed to clear', request.error)));
        };
        request.onsuccess = () => {
          resolve(ok(undefined));
        };
      });
    }

    const keysResult = await this.keys(prefix);
    if (!keysResult.ok) return keysResult as Result<void, AppError>;

    for (const key of keysResult.value) {
      const result = await this.delete(key);
      if (!result.ok) return result;
    }
    return ok(undefined);
  }

  async getMany<T>(keys: string[]): Promise<Result<Map<string, T>, AppError>> {
    const result = new Map<string, T>();
    for (const key of keys) {
      const valueResult = await this.get<T>(key);
      if (valueResult.ok && valueResult.value !== null) {
        result.set(key, valueResult.value);
      }
    }
    return ok(result);
  }

  async setMany<T>(entries: Map<string, T>): Promise<Result<void, AppError>> {
    for (const [key, value] of entries) {
      const result = await this.set(key, value);
      if (!result.ok) return result;
    }
    return ok(undefined);
  }
}

// ============================================================================
// STORAGE FACTORY
// ============================================================================

export type StorageType = 'memory' | 'localStorage' | 'indexedDB';

export function createStorageAdapter(
  type: StorageType,
  options?: { prefix?: string; dbName?: string; storeName?: string }
): StorageAdapter {
  switch (type) {
    case 'memory':
      return new MemoryStorageAdapter();
    case 'localStorage':
      return new LocalStorageAdapter(options?.prefix);
    case 'indexedDB':
      return new IndexedDBStorageAdapter(options?.dbName, options?.storeName);
    default:
      return new MemoryStorageAdapter();
  }
}
