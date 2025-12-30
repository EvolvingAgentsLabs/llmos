/**
 * Result Pattern Tests
 */

import {
  ok,
  err,
  isOk,
  isErr,
  map,
  mapErr,
  andThen,
  orElse,
  unwrap,
  unwrapOr,
  unwrapOrElse,
  fromPromise,
  fromTry,
  fromTryAsync,
  all,
  partition,
  appError,
  ErrorCodes,
  Result,
} from '@/lib/core/result';

describe('Result Pattern', () => {
  describe('Constructors', () => {
    it('creates Ok result', () => {
      const result = ok(42);
      expect(result.ok).toBe(true);
      expect(result.value).toBe(42);
    });

    it('creates Err result', () => {
      const error = new Error('test error');
      const result = err(error);
      expect(result.ok).toBe(false);
      expect(result.error).toBe(error);
    });
  });

  describe('Type Guards', () => {
    it('isOk returns true for Ok', () => {
      const result = ok(42);
      expect(isOk(result)).toBe(true);
      expect(isErr(result)).toBe(false);
    });

    it('isErr returns true for Err', () => {
      const result = err(new Error('test'));
      expect(isErr(result)).toBe(true);
      expect(isOk(result)).toBe(false);
    });
  });

  describe('Transformers', () => {
    it('map transforms Ok value', () => {
      const result = ok(5);
      const mapped = map(result, (x) => x * 2);
      expect(isOk(mapped) && mapped.value).toBe(10);
    });

    it('map passes through Err', () => {
      const error = new Error('test');
      const result = err(error);
      const mapped = map(result, (x: number) => x * 2);
      expect(isErr(mapped) && mapped.error).toBe(error);
    });

    it('mapErr transforms Err value', () => {
      const result = err('original');
      const mapped = mapErr(result, (e) => `wrapped: ${e}`);
      expect(isErr(mapped) && mapped.error).toBe('wrapped: original');
    });

    it('mapErr passes through Ok', () => {
      const result = ok(42);
      const mapped = mapErr(result, (e) => `wrapped: ${e}`);
      expect(isOk(mapped) && mapped.value).toBe(42);
    });

    it('andThen chains Ok values', () => {
      const result = ok(5);
      const chained = andThen(result, (x) => ok(x * 2));
      expect(isOk(chained) && chained.value).toBe(10);
    });

    it('andThen short-circuits on Err', () => {
      const error = new Error('test');
      const result = err(error);
      const chained = andThen(result, (x: number) => ok(x * 2));
      expect(isErr(chained) && chained.error).toBe(error);
    });

    it('orElse provides fallback for Err', () => {
      const result = err('original');
      const recovered = orElse(result, () => ok(42));
      expect(isOk(recovered) && recovered.value).toBe(42);
    });

    it('orElse passes through Ok', () => {
      const result = ok(42);
      const recovered = orElse(result, () => ok(0));
      expect(isOk(recovered) && recovered.value).toBe(42);
    });
  });

  describe('Extractors', () => {
    it('unwrap returns value for Ok', () => {
      const result = ok(42);
      expect(unwrap(result)).toBe(42);
    });

    it('unwrap throws for Err', () => {
      const error = new Error('test');
      const result = err(error);
      expect(() => unwrap(result)).toThrow(error);
    });

    it('unwrapOr returns value for Ok', () => {
      const result = ok(42);
      expect(unwrapOr(result, 0)).toBe(42);
    });

    it('unwrapOr returns default for Err', () => {
      const result = err(new Error('test'));
      expect(unwrapOr(result, 0)).toBe(0);
    });

    it('unwrapOrElse computes default for Err', () => {
      const result = err('error message');
      const value = unwrapOrElse(result, (e) => e.length);
      expect(value).toBe(13);
    });
  });

  describe('Async Utilities', () => {
    it('fromPromise wraps resolved promise', async () => {
      const result = await fromPromise(Promise.resolve(42));
      expect(isOk(result) && result.value).toBe(42);
    });

    it('fromPromise wraps rejected promise', async () => {
      const error = new Error('test');
      const result = await fromPromise(Promise.reject(error));
      expect(isErr(result) && result.error).toBe(error);
    });

    it('fromPromise maps error', async () => {
      const result = await fromPromise(
        Promise.reject(new Error('original')),
        (e) => appError(ErrorCodes.UNKNOWN, 'wrapped')
      );
      expect(isErr(result) && result.error.code).toBe(ErrorCodes.UNKNOWN);
    });

    it('fromTry wraps successful function', () => {
      const result = fromTry(() => 42);
      expect(isOk(result) && result.value).toBe(42);
    });

    it('fromTry wraps throwing function', () => {
      const error = new Error('test');
      const result = fromTry(() => {
        throw error;
      });
      expect(isErr(result) && result.error).toBe(error);
    });

    it('fromTryAsync wraps successful async function', async () => {
      const result = await fromTryAsync(async () => 42);
      expect(isOk(result) && result.value).toBe(42);
    });

    it('fromTryAsync wraps throwing async function', async () => {
      const error = new Error('test');
      const result = await fromTryAsync(async () => {
        throw error;
      });
      expect(isErr(result) && result.error).toBe(error);
    });
  });

  describe('Collection Utilities', () => {
    it('all returns Ok array when all succeed', () => {
      const results = [ok(1), ok(2), ok(3)];
      const combined = all(results);
      expect(isOk(combined) && combined.value).toEqual([1, 2, 3]);
    });

    it('all returns first Err when any fail', () => {
      const error = new Error('test');
      const results = [ok(1), err(error), ok(3)];
      const combined = all(results);
      expect(isErr(combined) && combined.error).toBe(error);
    });

    it('partition separates successes and failures', () => {
      const results: Result<number, string>[] = [
        ok(1),
        err('a'),
        ok(2),
        err('b'),
        ok(3),
      ];
      const { successes, failures } = partition(results);
      expect(successes).toEqual([1, 2, 3]);
      expect(failures).toEqual(['a', 'b']);
    });
  });

  describe('AppError', () => {
    it('creates error with code and message', () => {
      const error = appError(ErrorCodes.NOT_FOUND, 'Item not found');
      expect(error.code).toBe('NOT_FOUND');
      expect(error.message).toBe('Item not found');
    });

    it('creates error with cause', () => {
      const cause = new Error('original');
      const error = appError(ErrorCodes.STORAGE_ERROR, 'Failed to save', cause);
      expect(error.cause).toBe(cause);
    });
  });
});
