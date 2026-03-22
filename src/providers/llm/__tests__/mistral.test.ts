import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import type {LLMMessage} from '../types.js';
import {createMistralProvider, MistralProviderError} from '../mistral.js';

function mockFetchResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {status, headers: {'Content-Type': 'application/json'}});
}

describe('MistralProviderError', () => {
  it('has correct name/provider', () => { const e = new MistralProviderError('x'); expect(e.name).toBe('MistralProviderError'); expect(e.provider).toBe('mistral'); });
  it('preserves cause', () => { const c = new Error('orig'); expect(new MistralProviderError('w', c).cause).toBe(c); });
  it('no cause when omitted', () => { expect(new MistralProviderError('x').cause).toBeUndefined(); });
});

describe('createMistralProvider', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let fetchSpy: any;
  beforeEach(() => { fetchSpy = vi.spyOn(globalThis, 'fetch'); fetchSpy.mockResolvedValue(mockFetchResponse({choices: [{index: 0, message: {content: 'Test'}, finish_reason: 'stop'}], usage: {prompt_tokens: 100, completion_tokens: 50}})); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('returns valid provider', () => { const p = createMistralProvider('mistral-large-latest', 'k'); expect(p.name).toBe('mistral'); expect(p.model).toBe('mistral-large-latest'); });
  it('caps for mistral-large-latest', () => { expect(createMistralProvider('mistral-large-latest', 'k').capabilities).toEqual({maxContextTokens: 128_000, supportsImages: true, supportsStructuredOutput: true}); });
  it('caps for mistral-medium-latest', () => { expect(createMistralProvider('mistral-medium-latest', 'k').capabilities.supportsImages).toBe(false); });
  it('caps for codestral-latest', () => { expect(createMistralProvider('codestral-latest', 'k').capabilities.maxContextTokens).toBe(32_000); });
  it('defaults for unknown', () => { expect(createMistralProvider('unknown', 'k').capabilities.maxContextTokens).toBe(128_000); });
});

describe('analyze', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let fetchSpy: any;
  beforeEach(() => { fetchSpy = vi.spyOn(globalThis, 'fetch'); fetchSpy.mockResolvedValue(mockFetchResponse({choices: [{index: 0, message: {content: 'Result'}, finish_reason: 'stop'}], usage: {prompt_tokens: 200, completion_tokens: 100}})); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('returns well-formed response', async () => {
    const r = await createMistralProvider('mistral-large-latest', 'k').analyze([{role: 'user', content: 'test'}]);
    expect(r.content).toBe('Result');
    expect(r.tokensUsed).toEqual({input: 200, output: 100});
    expect(r.model).toBe('mistral-large-latest');
  });
  it('calls correct endpoint', async () => {
    await createMistralProvider('mistral-large-latest', 'key123').analyze([{role: 'user', content: 'test'}]);
    expect(fetchSpy).toHaveBeenCalledWith('https://api.mistral.ai/v1/chat/completions', expect.objectContaining({method: 'POST'}));
  });
  it('sends auth header', async () => {
    await createMistralProvider('mistral-large-latest', 'key123').analyze([{role: 'user', content: 'test'}]);
    const headers = fetchSpy.mock.calls[0][1].headers;
    expect(headers.Authorization).toBe('Bearer key123');
  });
  it('sends correct body', async () => {
    const msgs: LLMMessage[] = [{role: 'system', content: 'sys'}, {role: 'user', content: 'usr'}];
    await createMistralProvider('mistral-large-latest', 'k').analyze(msgs);
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body.messages).toEqual([{role: 'system', content: 'sys'}, {role: 'user', content: 'usr'}]);
  });
  it('handles missing usage', async () => {
    fetchSpy.mockResolvedValue(mockFetchResponse({choices: [{index: 0, message: {content: 'x'}}]}));
    expect((await createMistralProvider('mistral-large-latest', 'k').analyze([{role: 'user', content: 'test'}])).tokensUsed).toEqual({input: 0, output: 0});
  });
  it('handles empty choices', async () => {
    fetchSpy.mockResolvedValue(mockFetchResponse({choices: []}));
    expect((await createMistralProvider('mistral-large-latest', 'k').analyze([{role: 'user', content: 'test'}])).content).toBe('');
  });
  it('wraps HTTP errors', async () => {
    fetchSpy.mockResolvedValue(new Response('err', {status: 429}));
    await expect(createMistralProvider('mistral-large-latest', 'k').analyze([{role: 'user', content: 'test'}])).rejects.toThrow(MistralProviderError);
  });
  it('wraps network errors', async () => {
    fetchSpy.mockRejectedValue(new Error('net'));
    await expect(createMistralProvider('mistral-large-latest', 'k').analyze([{role: 'user', content: 'test'}])).rejects.toThrow('Mistral API error: net');
  });
  it('wraps non-Error', async () => {
    fetchSpy.mockRejectedValue('str');
    await expect(createMistralProvider('mistral-large-latest', 'k').analyze([{role: 'user', content: 'test'}])).rejects.toThrow('Mistral API error: str');
  });
});

describe('analyzeStructured', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let fetchSpy: any;
  beforeEach(() => { fetchSpy = vi.spyOn(globalThis, 'fetch'); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('parses JSON', async () => {
    fetchSpy.mockResolvedValue(mockFetchResponse({choices: [{index: 0, message: {content: '{"a":1}'}}]}));
    expect(await createMistralProvider('mistral-large-latest', 'k').analyzeStructured([{role: 'user', content: 'x'}], '{}')).toEqual({a: 1});
  });
  it('sends response_format', async () => {
    fetchSpy.mockResolvedValue(mockFetchResponse({choices: [{index: 0, message: {content: '{}'}}]}));
    await createMistralProvider('mistral-large-latest', 'k').analyzeStructured([{role: 'user', content: 'x'}], '{}');
    expect(JSON.parse(fetchSpy.mock.calls[0][1].body).response_format).toEqual({type: 'json_object'});
  });
  it('injects schema into system msg', async () => {
    fetchSpy.mockResolvedValue(mockFetchResponse({choices: [{index: 0, message: {content: '{}'}}]}));
    await createMistralProvider('mistral-large-latest', 'k').analyzeStructured([{role: 'system', content: 'sys'}, {role: 'user', content: 'x'}], 'schema');
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body.messages[0].content).toContain('sys');
    expect(body.messages[0].content).toContain('schema');
  });
  it('creates system msg when none', async () => {
    fetchSpy.mockResolvedValue(mockFetchResponse({choices: [{index: 0, message: {content: '{}'}}]}));
    await createMistralProvider('mistral-large-latest', 'k').analyzeStructured([{role: 'user', content: 'x'}], 'schema');
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body.messages[0].role).toBe('system');
  });
  it('throws on invalid JSON', async () => {
    fetchSpy.mockResolvedValue(mockFetchResponse({choices: [{index: 0, message: {content: 'bad{{'}}]}));
    await expect(createMistralProvider('mistral-large-latest', 'k').analyzeStructured([{role: 'user', content: 'x'}], '{}')).rejects.toThrow('Failed to parse Mistral JSON');
  });
  it('wraps API errors', async () => {
    fetchSpy.mockResolvedValue(new Response('err', {status: 503}));
    await expect(createMistralProvider('mistral-large-latest', 'k').analyzeStructured([{role: 'user', content: 'x'}], '{}')).rejects.toThrow(MistralProviderError);
  });
});
