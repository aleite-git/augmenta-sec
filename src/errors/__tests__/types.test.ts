import {describe, expect, it} from 'vitest';
import {
  AugmentaSecError,
  ConfigError,
  DetectorError,
  FileSystemError,
  ProviderError,
  UserInputError,
} from '../types.js';

describe('AugmentaSecError', () => {
  it('stores code and context', () => {
    const err = new AugmentaSecError('boom', 'TEST_CODE', {key: 'val'});

    expect(err.message).toBe('boom');
    expect(err.code).toBe('TEST_CODE');
    expect(err.context).toEqual({key: 'val'});
    expect(err.name).toBe('AugmentaSecError');
  });

  it('works without context', () => {
    const err = new AugmentaSecError('no ctx', 'NO_CTX');

    expect(err.context).toBeUndefined();
  });
});

describe('DetectorError', () => {
  it('includes detector name', () => {
    const err = new DetectorError('language', 'failed to detect');

    expect(err.detectorName).toBe('language');
    expect(err.code).toBe('DETECTOR_ERROR');
    expect(err.name).toBe('DetectorError');
    expect(err.context).toEqual({detectorName: 'language'});
  });

  it('preserves cause when provided', () => {
    const cause = new Error('original');
    const err = new DetectorError('framework', 'wrap', cause);

    expect(err.cause).toBe(cause);
  });

  it('has no cause when none provided', () => {
    const err = new DetectorError('ci', 'no cause');

    expect(err.cause).toBeUndefined();
  });
});

describe('ProviderError', () => {
  it('includes provider name', () => {
    const err = new ProviderError('openai', 'rate limited');

    expect(err.providerName).toBe('openai');
    expect(err.code).toBe('PROVIDER_ERROR');
    expect(err.name).toBe('ProviderError');
    expect(err.context).toEqual({providerName: 'openai'});
  });

  it('preserves cause when provided', () => {
    const cause = new Error('timeout');
    const err = new ProviderError('github', 'api call failed', cause);

    expect(err.cause).toBe(cause);
  });
});

describe('ConfigError', () => {
  it('has correct code', () => {
    const err = new ConfigError('missing api key');

    expect(err.code).toBe('CONFIG_ERROR');
    expect(err.name).toBe('ConfigError');
  });

  it('accepts optional context', () => {
    const err = new ConfigError('bad value', {field: 'timeout', got: -1});

    expect(err.context).toEqual({field: 'timeout', got: -1});
  });
});

describe('FileSystemError', () => {
  it('includes path', () => {
    const err = new FileSystemError('/tmp/missing.txt', 'not found');

    expect(err.path).toBe('/tmp/missing.txt');
    expect(err.code).toBe('FS_ERROR');
    expect(err.name).toBe('FileSystemError');
    expect(err.context).toEqual({path: '/tmp/missing.txt'});
  });

  it('preserves cause when provided', () => {
    const cause = new Error('ENOENT');
    const err = new FileSystemError('/x', 'fail', cause);

    expect(err.cause).toBe(cause);
  });
});

describe('UserInputError', () => {
  it('has correct code', () => {
    const err = new UserInputError('invalid flag');

    expect(err.code).toBe('USER_INPUT_ERROR');
    expect(err.name).toBe('UserInputError');
  });
});

describe('Error hierarchy (instanceof checks)', () => {
  it('DetectorError is an AugmentaSecError', () => {
    const err = new DetectorError('lang', 'fail');
    expect(err).toBeInstanceOf(AugmentaSecError);
    expect(err).toBeInstanceOf(Error);
  });

  it('ProviderError is an AugmentaSecError', () => {
    const err = new ProviderError('gh', 'fail');
    expect(err).toBeInstanceOf(AugmentaSecError);
    expect(err).toBeInstanceOf(Error);
  });

  it('ConfigError is an AugmentaSecError', () => {
    const err = new ConfigError('bad');
    expect(err).toBeInstanceOf(AugmentaSecError);
    expect(err).toBeInstanceOf(Error);
  });

  it('FileSystemError is an AugmentaSecError', () => {
    const err = new FileSystemError('/x', 'no');
    expect(err).toBeInstanceOf(AugmentaSecError);
    expect(err).toBeInstanceOf(Error);
  });

  it('UserInputError is an AugmentaSecError', () => {
    const err = new UserInputError('nope');
    expect(err).toBeInstanceOf(AugmentaSecError);
    expect(err).toBeInstanceOf(Error);
  });
});
