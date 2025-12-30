/**
 * Storage Adapter Tests
 */

import {
  MemoryStorageAdapter,
  LocalStorageAdapter,
  createStorageAdapter,
} from '@/lib/storage/adapter';
import { isOk, unwrap } from '@/lib/core/result';

describe('MemoryStorageAdapter', () => {
  let storage: MemoryStorageAdapter;

  beforeEach(() => {
    storage = new MemoryStorageAdapter();
  });

  describe('basic operations', () => {
    it('sets and gets a value', async () => {
      await storage.set('key1', { name: 'test' });
      const result = await storage.get<{ name: string }>('key1');
      expect(isOk(result)).toBe(true);
      expect(unwrap(result)).toEqual({ name: 'test' });
    });

    it('returns null for missing key', async () => {
      const result = await storage.get('nonexistent');
      expect(isOk(result)).toBe(true);
      expect(unwrap(result)).toBeNull();
    });

    it('deletes a value', async () => {
      await storage.set('key1', 'value');
      await storage.delete('key1');
      const result = await storage.get('key1');
      expect(unwrap(result)).toBeNull();
    });

    it('checks if key exists', async () => {
      await storage.set('key1', 'value');
      expect(unwrap(await storage.has('key1'))).toBe(true);
      expect(unwrap(await storage.has('nonexistent'))).toBe(false);
    });
  });

  describe('keys', () => {
    it('returns all keys', async () => {
      await storage.set('a', 1);
      await storage.set('b', 2);
      await storage.set('c', 3);
      const result = await storage.keys();
      expect(unwrap(result).sort()).toEqual(['a', 'b', 'c']);
    });

    it('returns keys with prefix', async () => {
      await storage.set('user:1', 'alice');
      await storage.set('user:2', 'bob');
      await storage.set('team:1', 'acme');
      const result = await storage.keys('user:');
      expect(unwrap(result).sort()).toEqual(['user:1', 'user:2']);
    });
  });

  describe('clear', () => {
    it('clears all values', async () => {
      await storage.set('a', 1);
      await storage.set('b', 2);
      await storage.clear();
      expect(unwrap(await storage.keys())).toEqual([]);
    });

    it('clears values with prefix', async () => {
      await storage.set('user:1', 'alice');
      await storage.set('user:2', 'bob');
      await storage.set('team:1', 'acme');
      await storage.clear('user:');
      const keys = unwrap(await storage.keys());
      expect(keys).toEqual(['team:1']);
    });
  });

  describe('batch operations', () => {
    it('gets many values', async () => {
      await storage.set('a', 1);
      await storage.set('b', 2);
      await storage.set('c', 3);
      const result = await storage.getMany<number>(['a', 'c']);
      const map = unwrap(result);
      expect(map.get('a')).toBe(1);
      expect(map.get('c')).toBe(3);
      expect(map.has('b')).toBe(false);
    });

    it('sets many values', async () => {
      const entries = new Map<string, number>([
        ['a', 1],
        ['b', 2],
      ]);
      await storage.setMany(entries);
      expect(unwrap(await storage.get('a'))).toBe(1);
      expect(unwrap(await storage.get('b'))).toBe(2);
    });
  });
});

describe('LocalStorageAdapter', () => {
  let storage: LocalStorageAdapter;

  beforeEach(() => {
    localStorage.clear();
    storage = new LocalStorageAdapter('test:');
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('uses prefix for keys', async () => {
    await storage.set('key1', 'value');
    expect(localStorage.getItem('test:key1')).toBe('"value"');
  });

  it('sets and gets values', async () => {
    await storage.set('key1', { name: 'test' });
    const result = await storage.get<{ name: string }>('key1');
    expect(unwrap(result)).toEqual({ name: 'test' });
  });

  it('returns null for missing key', async () => {
    const result = await storage.get('nonexistent');
    expect(unwrap(result)).toBeNull();
  });

  it('handles complex types', async () => {
    const data = {
      array: [1, 2, 3],
      nested: { a: { b: 'c' } },
      date: '2024-01-01',
    };
    await storage.set('complex', data);
    expect(unwrap(await storage.get('complex'))).toEqual(data);
  });
});

describe('createStorageAdapter', () => {
  it('creates memory adapter', () => {
    const adapter = createStorageAdapter('memory');
    expect(adapter).toBeInstanceOf(MemoryStorageAdapter);
  });

  it('creates localStorage adapter', () => {
    const adapter = createStorageAdapter('localStorage');
    expect(adapter).toBeInstanceOf(LocalStorageAdapter);
  });

  it('creates localStorage adapter with prefix', () => {
    const adapter = createStorageAdapter('localStorage', { prefix: 'myapp:' });
    expect(adapter).toBeInstanceOf(LocalStorageAdapter);
  });
});
