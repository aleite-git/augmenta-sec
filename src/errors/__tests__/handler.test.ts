import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {formatError, isRecoverable, withGracefulDegradation} from '../handler.js';
import {
  AugmentaSecError,
  ConfigError,
  DetectorError,
  FileSystemError,
  ProviderError,
  UserInputError,
} from '../types.js';

// Mock the logger so tests don't produce console output
vi.mock('../../utils/logger.js', () => ({
  logger: {
    warn: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  },
}));

describe('formatError', () => {
  const originalEnv = process.env.ASEC_DEBUG;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.ASEC_DEBUG;
    } else {
      process.env.ASEC_DEBUG = originalEnv;
    }
  });

  it('returns clean message for known AugmentaSecError', () => {
    const err = new DetectorError('language', 'parse failed');
    expect(formatError(err)).toBe('[DETECTOR_ERROR] parse failed');
  });

  it('returns clean message for ConfigError', () => {
    const err = new ConfigError('missing field');
    expect(formatError(err)).toBe('[CONFIG_ERROR] missing field');
  });

  it('returns message without stack for unknown Error when ASEC_DEBUG is unset', () => {
    delete process.env.ASEC_DEBUG;
    const err = new Error('oops');
    expect(formatError(err)).toBe('oops');
  });

  it('returns stack for unknown Error when ASEC_DEBUG is set', () => {
    process.env.ASEC_DEBUG = '1';
    const err = new Error('oops');
    const result = formatError(err);
    expect(result).toContain('oops');
    // Stack traces contain the filename
    expect(result).toContain('handler.test.ts');
  });

  it('converts non-Error values to string', () => {
    expect(formatError('raw string')).toBe('raw string');
    expect(formatError(42)).toBe('42');
    expect(formatError(null)).toBe('null');
  });
});

describe('withGracefulDegradation', () => {
  it('returns the result on success', async () => {
    const result = await withGracefulDegradation(
      async () => 42,
      0,
      'test-op',
    );
    expect(result).toBe(42);
  });

  it('returns fallback on error and logs warning', async () => {
    const {logger} = await import('../../utils/logger.js');
    const result = await withGracefulDegradation(
      async () => {
        throw new DetectorError('lang', 'boom');
      },
      'default-value',
      'detector-run',
    );

    expect(result).toBe('default-value');
    expect(logger.warn).toHaveBeenCalledWith(
      'detector-run: [DETECTOR_ERROR] boom',
    );
  });

  it('returns fallback for non-Error throws', async () => {
    const result = await withGracefulDegradation(
      async () => {
        throw 'string-error';
      },
      [],
      'ctx',
    );
    expect(result).toEqual([]);
  });
});

describe('isRecoverable', () => {
  it('returns true for DetectorError', () => {
    expect(isRecoverable(new DetectorError('lang', 'fail'))).toBe(true);
  });

  it('returns true for ProviderError', () => {
    expect(isRecoverable(new ProviderError('openai', 'timeout'))).toBe(true);
  });

  it('returns false for ConfigError', () => {
    expect(isRecoverable(new ConfigError('bad config'))).toBe(false);
  });

  it('returns false for UserInputError', () => {
    expect(isRecoverable(new UserInputError('bad flag'))).toBe(false);
  });

  it('returns false for FileSystemError', () => {
    expect(isRecoverable(new FileSystemError('/x', 'gone'))).toBe(false);
  });

  it('returns false for base AugmentaSecError', () => {
    expect(isRecoverable(new AugmentaSecError('hm', 'UNKNOWN'))).toBe(false);
  });

  it('returns false for plain Error', () => {
    expect(isRecoverable(new Error('wat'))).toBe(false);
  });

  it('returns false for non-Error values', () => {
    expect(isRecoverable('string')).toBe(false);
    expect(isRecoverable(null)).toBe(false);
  });
});
