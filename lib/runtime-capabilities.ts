/**
 * Runtime Capabilities - Stub (original implementation removed during cleanup)
 * Provides code validation placeholder.
 */

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  suggestions: string[];
}

export function validateCode(_code: string): ValidationResult {
  return {
    valid: true,
    errors: [],
    warnings: ['Code execution runtime is not available.'],
    suggestions: [],
  };
}
