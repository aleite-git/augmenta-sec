/**
 * Error handling utilities: formatting, graceful degradation, and
 * recoverability checks.
 */

import {logger} from '../utils/logger.js';
import {
  AugmentaSecError,
  ConfigError,
  DetectorError,
  ProviderError,
  UserInputError,
} from './types.js';

/**
 * Converts any thrown value into a clean, user-friendly message.
 *
 * - Known `AugmentaSecError` subclasses produce a concise one-liner
 *   (no stack trace).
 * - Unknown errors include a stack trace when `ASEC_DEBUG` is set.
 */
export function formatError(error: unknown): string {
  if (error instanceof AugmentaSecError) {
    return `[${error.code}] ${error.message}`;
  }

  if (error instanceof Error) {
    if (process.env.ASEC_DEBUG && error.stack) {
      return error.stack;
    }
    return error.message;
  }

  return String(error);
}

/**
 * Wraps an async operation so that failures are logged as warnings and
 * the provided `fallback` value is returned instead of throwing.
 */
export async function withGracefulDegradation<T>(
  fn: () => Promise<T>,
  fallback: T,
  context: string,
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    logger.warn(`${context}: ${formatError(err)}`);
    return fallback;
  }
}

/**
 * Determines whether an error is recoverable (i.e. the overall
 * operation can continue despite the failure).
 *
 * - `DetectorError` and `ProviderError` are recoverable: individual
 *   detectors or providers may fail without invalidating the run.
 * - `ConfigError` and `UserInputError` are *not* recoverable: the user
 *   needs to fix something before retrying.
 * - Unknown errors are treated as non-recoverable by default.
 */
export function isRecoverable(error: unknown): boolean {
  if (error instanceof DetectorError) return true;
  if (error instanceof ProviderError) return true;
  if (error instanceof ConfigError) return false;
  if (error instanceof UserInputError) return false;

  // Unknown errors are non-recoverable by default
  return false;
}
