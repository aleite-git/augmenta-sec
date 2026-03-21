import {describe, it, expect, vi} from 'vitest';
import {
  extractJsonFromMarkdown,
  validateJsonResponse,
  withRetry,
  LLMValidationError,
  LLMRetryExhaustedError,
} from '../validation.js';

describe('extractJsonFromMarkdown', () => {
  it('extracts JSON from ```json code block', () => {
    const markdown = '```json\n{"key": "value"}\n```';

    expect(extractJsonFromMarkdown(markdown)).toBe('{"key": "value"}');
  });

  it('extracts JSON from ``` code block without language tag', () => {
    const markdown = '```\n{"key": "value"}\n```';

    expect(extractJsonFromMarkdown(markdown)).toBe('{"key": "value"}');
  });

  it('returns raw text when no code block is present', () => {
    const raw = '{"key": "value"}';

    expect(extractJsonFromMarkdown(raw)).toBe('{"key": "value"}');
  });

  it('trims whitespace from extracted content', () => {
    const markdown = '```json\n  {"key": "value"}  \n```';

    expect(extractJsonFromMarkdown(markdown)).toBe('{"key": "value"}');
  });

  it('trims whitespace from raw text', () => {
    const raw = '  {"key": "value"}  ';

    expect(extractJsonFromMarkdown(raw)).toBe('{"key": "value"}');
  });

  it('handles multiline JSON in code block', () => {
    const markdown = '```json\n{\n  "a": 1,\n  "b": 2\n}\n```';
    const result = extractJsonFromMarkdown(markdown);

    expect(JSON.parse(result)).toEqual({a: 1, b: 2});
  });

  it('extracts from the first code block when multiple exist', () => {
    const markdown =
      '```json\n{"first": true}\n```\n\n```json\n{"second": true}\n```';

    expect(extractJsonFromMarkdown(markdown)).toBe('{"first": true}');
  });

  it('handles surrounding text before code block', () => {
    const markdown =
      'Here is the result:\n```json\n{"key": "value"}\n```\nDone.';

    expect(extractJsonFromMarkdown(markdown)).toBe('{"key": "value"}');
  });
});

describe('validateJsonResponse', () => {
  it('returns success for valid JSON', () => {
    const result = validateJsonResponse<{name: string}>(
      '{"name": "test"}',
      'TestSchema',
    );

    expect(result).toEqual({success: true, data: {name: 'test'}});
  });

  it('returns success for JSON in markdown code block', () => {
    const result = validateJsonResponse<{count: number}>(
      '```json\n{"count": 42}\n```',
      'CountSchema',
    );

    expect(result).toEqual({success: true, data: {count: 42}});
  });

  it('returns failure for invalid JSON', () => {
    const result = validateJsonResponse('{invalid}', 'TestSchema');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('Invalid JSON for schema "TestSchema"');
    }
  });

  it('returns failure for empty string', () => {
    const result = validateJsonResponse('', 'TestSchema');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('Empty response');
      expect(result.error).toContain('TestSchema');
    }
  });

  it('returns failure for whitespace-only string', () => {
    const result = validateJsonResponse('   ', 'TestSchema');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('Empty response');
    }
  });

  it('parses arrays correctly', () => {
    const result = validateJsonResponse<string[]>(
      '["a", "b", "c"]',
      'ArraySchema',
    );

    expect(result).toEqual({success: true, data: ['a', 'b', 'c']});
  });

  it('parses nested objects correctly', () => {
    const result = validateJsonResponse<{outer: {inner: number}}>(
      '{"outer": {"inner": 1}}',
      'NestedSchema',
    );

    expect(result).toEqual({success: true, data: {outer: {inner: 1}}});
  });
});

describe('withRetry', () => {
  it('returns the result on first success', async () => {
    const fn = vi.fn().mockResolvedValue('success');

    const result = await withRetry(fn, {maxRetries: 3, backoffMs: 1});

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on failure and eventually succeeds', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockRejectedValueOnce(new Error('fail 2'))
      .mockResolvedValue('success');

    const result = await withRetry(fn, {maxRetries: 3, backoffMs: 1});

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('throws LLMRetryExhaustedError when all attempts fail', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('always fails'));

    await expect(
      withRetry(fn, {maxRetries: 2, backoffMs: 1}),
    ).rejects.toThrow(LLMRetryExhaustedError);
  });

  it('includes attempt count and last error in LLMRetryExhaustedError', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('persistent failure'));

    try {
      await withRetry(fn, {maxRetries: 2, backoffMs: 1});
      // Should not reach here.
      expect.unreachable('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(LLMRetryExhaustedError);
      const retryErr = err as LLMRetryExhaustedError;
      expect(retryErr.attempts).toBe(3); // 1 initial + 2 retries
      expect(retryErr.lastError.message).toBe('persistent failure');
    }
  });

  it('retries exactly maxRetries times after initial failure', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('fail'));

    await expect(
      withRetry(fn, {maxRetries: 1, backoffMs: 1}),
    ).rejects.toThrow();

    expect(fn).toHaveBeenCalledTimes(2); // 1 initial + 1 retry
  });

  it('succeeds on the last retry attempt', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValue('last-chance');

    const result = await withRetry(fn, {maxRetries: 1, backoffMs: 1});

    expect(result).toBe('last-chance');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('handles non-Error throws gracefully', async () => {
    const fn = vi.fn().mockRejectedValue('string error');

    await expect(
      withRetry(fn, {maxRetries: 0, backoffMs: 1}),
    ).rejects.toThrow(LLMRetryExhaustedError);
  });
});

describe('LLMValidationError', () => {
  it('has the correct name property', () => {
    const error = new LLMValidationError('test error');

    expect(error.name).toBe('LLMValidationError');
    expect(error.message).toBe('test error');
  });

  it('stores the raw response when provided', () => {
    const error = new LLMValidationError('parse failed', '{bad json}');

    expect(error.rawResponse).toBe('{bad json}');
  });

  it('has undefined rawResponse when not provided', () => {
    const error = new LLMValidationError('parse failed');

    expect(error.rawResponse).toBeUndefined();
  });
});

describe('LLMRetryExhaustedError', () => {
  it('has the correct name property', () => {
    const error = new LLMRetryExhaustedError(3, new Error('inner'));

    expect(error.name).toBe('LLMRetryExhaustedError');
  });

  it('includes attempt count in message', () => {
    const error = new LLMRetryExhaustedError(3, new Error('inner'));

    expect(error.message).toContain('3 attempts');
    expect(error.message).toContain('inner');
  });
});
