import {describe, it, expect, vi} from 'vitest';
import {z} from 'zod';
import {
  extractJsonFromMarkdown, validateJsonResponse, parseJsonResponse,
  validateResponse, retryWithValidation, withRetry,
  LLMValidationError, LLMRetryExhaustedError,
} from '../validation.js';

describe('extractJsonFromMarkdown', () => {
  it('extracts from json code block', () => {
    expect(extractJsonFromMarkdown('```json\n{"key": "value"}\n```')).toBe('{"key": "value"}');
  });
  it('extracts from plain code block', () => {
    expect(extractJsonFromMarkdown('```\n{"key": "value"}\n```')).toBe('{"key": "value"}');
  });
  it('returns raw text when no block', () => {
    expect(extractJsonFromMarkdown('{"key": "value"}')).toBe('{"key": "value"}');
  });
  it('trims whitespace', () => {
    expect(extractJsonFromMarkdown('  {"a": 1}  ')).toBe('{"a": 1}');
  });
  it('handles multiline JSON', () => {
    expect(JSON.parse(extractJsonFromMarkdown('```json\n{\n  "a": 1\n}\n```'))).toEqual({a: 1});
  });
});

describe('validateJsonResponse', () => {
  it('returns success for valid JSON', () => {
    expect(validateJsonResponse('{"a": 1}', 'S')).toEqual({success: true, data: {a: 1}});
  });
  it('returns failure for invalid JSON', () => {
    const r = validateJsonResponse('{bad}', 'S');
    expect(r.success).toBe(false);
  });
  it('returns failure for empty', () => {
    const r = validateJsonResponse('', 'S');
    expect(r.success).toBe(false);
  });
});

describe('parseJsonResponse', () => {
  it('parses valid JSON', () => {
    expect(parseJsonResponse('{"a": 1}')).toEqual({a: 1});
  });
  it('parses from code block', () => {
    expect(parseJsonResponse('```json\n{"b": 2}\n```')).toEqual({b: 2});
  });
  it('throws for empty', () => {
    expect(() => parseJsonResponse('')).toThrow(LLMValidationError);
  });
  it('recovers partial JSON', () => {
    expect(parseJsonResponse('text {"x": 42} more')).toEqual({x: 42});
  });
  it('recovers partial arrays', () => {
    expect(parseJsonResponse('list: [1, 2, 3] done')).toEqual([1, 2, 3]);
  });
  it('throws for unparseable', () => {
    expect(() => parseJsonResponse('no json')).toThrow(LLMValidationError);
  });
  it('preserves rawResponse in error', () => {
    try { parseJsonResponse('garbage'); } catch (e) {
      expect((e as LLMValidationError).rawResponse).toBe('garbage');
    }
  });
});

describe('validateResponse', () => {
  const S = z.object({name: z.string(), age: z.number()});
  it('succeeds for valid', () => {
    expect(validateResponse('{"name":"A","age":30}', S)).toEqual({success: true, data: {name: 'A', age: 30}});
  });
  it('fails for schema mismatch', () => {
    const r = validateResponse('{"name":"A","age":"x"}', S);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error).toContain('Schema validation failed');
  });
  it('fails for unparseable', () => {
    expect(validateResponse('not json', S).success).toBe(false);
  });
});

describe('retryWithValidation', () => {
  const S = z.object({value: z.string()});
  it('succeeds on first try', async () => {
    const fn = vi.fn().mockResolvedValue('{"value":"ok"}');
    expect(await retryWithValidation(fn, S, 2)).toEqual({value: 'ok'});
    expect(fn).toHaveBeenCalledTimes(1);
  });
  it('retries on invalid and succeeds', async () => {
    const fn = vi.fn().mockResolvedValueOnce('bad').mockResolvedValue('{"value":"ok"}');
    expect(await retryWithValidation(fn, S, 2)).toEqual({value: 'ok'});
  });
  it('throws after all retries fail', async () => {
    const fn = vi.fn().mockResolvedValue('bad');
    await expect(retryWithValidation(fn, S, 1)).rejects.toThrow(LLMRetryExhaustedError);
  });
});

describe('withRetry', () => {
  it('succeeds on first try', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    expect(await withRetry(fn, {maxRetries: 3, backoffMs: 1})).toBe('ok');
  });
  it('retries and succeeds', async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error('f1')).mockResolvedValue('ok');
    expect(await withRetry(fn, {maxRetries: 2, backoffMs: 1})).toBe('ok');
  });
  it('throws after exhaustion', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('fail'));
    await expect(withRetry(fn, {maxRetries: 1, backoffMs: 1})).rejects.toThrow(LLMRetryExhaustedError);
  });
});

describe('LLMValidationError', () => {
  it('has correct name', () => {
    expect(new LLMValidationError('x').name).toBe('LLMValidationError');
  });
  it('stores rawResponse', () => {
    expect(new LLMValidationError('x', 'raw').rawResponse).toBe('raw');
  });
});

describe('LLMRetryExhaustedError', () => {
  it('includes attempt count', () => {
    const e = new LLMRetryExhaustedError(3, new Error('inner'));
    expect(e.message).toContain('3 attempts');
  });
});
