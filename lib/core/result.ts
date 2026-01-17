/**
 * Result<T, E> Pattern
 *
 * A type-safe way to handle operations that can fail.
 * Inspired by Rust's Result type for explicit error handling.
 */

export type Result<T, E = Error> = Ok<T> | Err<E>;

export interface Ok<T> {
  readonly ok: true;
  readonly value: T;
}

export interface Err<E> {
  readonly ok: false;
  readonly error: E;
}

// ============================================================================
// CONSTRUCTORS
// ============================================================================

/**
 * Create a successful result
 */
export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

/**
 * Create a failed result
 */
export function err<E>(error: E): Err<E> {
  return { ok: false, error };
}

// ============================================================================
// TYPE GUARDS
// ============================================================================

/**
 * Check if result is Ok
 */
export function isOk<T, E>(result: Result<T, E>): result is Ok<T> {
  return result.ok;
}

/**
 * Check if result is Err
 */
export function isErr<T, E>(result: Result<T, E>): result is Err<E> {
  return !result.ok;
}

// ============================================================================
// TRANSFORMERS
// ============================================================================

/**
 * Map the success value
 */
export function map<T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => U
): Result<U, E> {
  if (result.ok) {
    return ok(fn(result.value));
  }
  return result;
}

/**
 * Map the error value
 */
export function mapErr<T, E, F>(
  result: Result<T, E>,
  fn: (error: E) => F
): Result<T, F> {
  if (!result.ok) {
    return err(fn(result.error));
  }
  return result;
}

/**
 * Chain operations that return Results (flatMap)
 */
export function andThen<T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => Result<U, E>
): Result<U, E> {
  if (result.ok) {
    return fn(result.value);
  }
  return result;
}

/**
 * Provide a fallback for errors
 */
export function orElse<T, E, F>(
  result: Result<T, E>,
  fn: (error: E) => Result<T, F>
): Result<T, F> {
  if (!result.ok) {
    return fn(result.error);
  }
  return result;
}

// ============================================================================
// EXTRACTORS
// ============================================================================

/**
 * Get the value or throw
 */
export function unwrap<T, E>(result: Result<T, E>): T {
  if (result.ok) {
    return result.value;
  }
  throw result.error;
}

/**
 * Get the value or a default
 */
export function unwrapOr<T, E>(result: Result<T, E>, defaultValue: T): T {
  if (result.ok) {
    return result.value;
  }
  return defaultValue;
}

/**
 * Get the value or compute a default
 */
export function unwrapOrElse<T, E>(
  result: Result<T, E>,
  fn: (error: E) => T
): T {
  if (result.ok) {
    return result.value;
  }
  return fn(result.error);
}

/**
 * Get the error or throw
 */
export function unwrapErr<T, E>(result: Result<T, E>): E {
  if (!result.ok) {
    return result.error;
  }
  throw new Error('Called unwrapErr on an Ok value');
}

// ============================================================================
// ASYNC UTILITIES
// ============================================================================

/**
 * Wrap a promise that might throw into a Result
 */
export async function fromPromise<T, E = Error>(
  promise: Promise<T>,
  mapError?: (error: unknown) => E
): Promise<Result<T, E>> {
  try {
    const value = await promise;
    return ok(value);
  } catch (error) {
    if (mapError) {
      return err(mapError(error));
    }
    return err(error as E);
  }
}

/**
 * Wrap a function that might throw into a Result
 */
export function fromTry<T, E = Error>(
  fn: () => T,
  mapError?: (error: unknown) => E
): Result<T, E> {
  try {
    return ok(fn());
  } catch (error) {
    if (mapError) {
      return err(mapError(error));
    }
    return err(error as E);
  }
}

/**
 * Wrap an async function that might throw into a Result
 */
export async function fromTryAsync<T, E = Error>(
  fn: () => Promise<T>,
  mapError?: (error: unknown) => E
): Promise<Result<T, E>> {
  try {
    const value = await fn();
    return ok(value);
  } catch (error) {
    if (mapError) {
      return err(mapError(error));
    }
    return err(error as E);
  }
}

// ============================================================================
// COLLECTION UTILITIES
// ============================================================================

/**
 * Combine multiple Results into a single Result
 * Returns Ok with array of values if all succeed, or first Err
 */
export function all<T, E>(results: Result<T, E>[]): Result<T[], E> {
  const values: T[] = [];
  for (const result of results) {
    if (!result.ok) {
      return result;
    }
    values.push(result.value);
  }
  return ok(values);
}

/**
 * Collect Results, keeping all successes and failures
 */
export function partition<T, E>(
  results: Result<T, E>[]
): { successes: T[]; failures: E[] } {
  const successes: T[] = [];
  const failures: E[] = [];
  for (const result of results) {
    if (result.ok) {
      successes.push(result.value);
    } else {
      failures.push(result.error);
    }
  }
  return { successes, failures };
}

// ============================================================================
// COMMON ERROR TYPES
// ============================================================================

export interface AppError {
  code: string;
  message: string;
  cause?: unknown;
}

export function appError(
  code: string,
  message: string,
  cause?: unknown
): AppError {
  return { code, message, cause };
}

// Common error codes
export const ErrorCodes = {
  NOT_FOUND: 'NOT_FOUND',
  INVALID_INPUT: 'INVALID_INPUT',
  STORAGE_ERROR: 'STORAGE_ERROR',
  NETWORK_ERROR: 'NETWORK_ERROR',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  TIMEOUT: 'TIMEOUT',
  UNKNOWN: 'UNKNOWN',
  PROCESSING_ERROR: 'PROCESSING_ERROR',
  CONFIGURATION_ERROR: 'CONFIGURATION_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];
