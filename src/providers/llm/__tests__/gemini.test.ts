import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {createGeminiProvider, GeminiProviderError} from '../gemini.js';

function mockFetchResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {status, headers: {'Content-Type': 'application/json'}});
}
function geminiResp(text: string, pt = 100, ct = 50) {
  return {candidates: [{content: {parts: [{text}]}}], usageMetadata: {promptTokenCount: pt, candidatesTokenCount: ct}};
}

describe('GeminiProviderError', () => {
  it('has correct name/provider', () => { const e = new GeminiProviderError('x'); expect(e.name).toBe('GeminiProviderError'); expect(e.provider).toBe('gemini'); });
  it('preserves cause', () => { const c = new Error('orig'); expect(new GeminiProviderError('w', c).cause).toBe(c); });
  it('no cause when omitted', () => { expect(new GeminiProviderError('x').cause).toBeUndefined(); });
});

describe('createGeminiProvider', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let fetchSpy: any;
  beforeEach(() => { fetchSpy = vi.spyOn(globalThis, 'fetch'); fetchSpy.mockResolvedValue(mockFetchResponse(geminiResp('Test'))); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('returns valid provider', () => { const p = createGeminiProvider('gemini-2.0-flash', 'k'); expect(p.name).toBe('gemini'); expect(p.model).toBe('gemini-2.0-flash'); });
  it('caps for gemini-2.0-flash', () => { expect(createGeminiProvider('gemini-2.0-flash', 'k').capabilities).toEqual({maxContextTokens: 1_000_000, supportsImages: true, supportsStructuredOutput: true}); });
  it('caps for gemini-2.0-pro', () => { expect(createGeminiProvider('gemini-2.0-pro', 'k').capabilities.maxContextTokens).toBe(1_000_000); });
  it('caps for gemini-2.5-pro', () => { expect(createGeminiProvider('gemini-2.5-pro', 'k').capabilities.maxContextTokens).toBe(1_000_000); });
  it('caps for gemini-2.5-flash', () => { expect(createGeminiProvider('gemini-2.5-flash', 'k').capabilities.supportsImages).toBe(true); });
  it('caps for gemini-2.5-flash-lite', () => { expect(createGeminiProvider('gemini-2.5-flash-lite', 'k').capabilities.supportsStructuredOutput).toBe(true); });
  it('defaults for unknown', () => { expect(createGeminiProvider('gemini-9', 'k').capabilities.maxContextTokens).toBe(1_000_000); });
});

describe('analyze', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let fetchSpy: any;
  beforeEach(() => { fetchSpy = vi.spyOn(globalThis, 'fetch'); fetchSpy.mockResolvedValue(mockFetchResponse(geminiResp('Result', 200, 100))); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('returns well-formed response', async () => {
    const r = await createGeminiProvider('gemini-2.0-flash', 'k').analyze([{role: 'user', content: 'test'}]);
    expect(r.content).toBe('Result');
    expect(r.tokensUsed).toEqual({input: 200, output: 100});
  });
  it('calls correct URL', async () => {
    await createGeminiProvider('gemini-2.0-flash', 'mykey').analyze([{role: 'user', content: 'test'}]);
    expect(fetchSpy.mock.calls[0][0]).toContain('gemini-2.0-flash:generateContent?key=mykey');
  });
  it('sends system instruction separately', async () => {
    await createGeminiProvider('gemini-2.0-flash', 'k').analyze([{role: 'system', content: 'sys'}, {role: 'user', content: 'usr'}]);
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body.systemInstruction).toEqual({parts: [{text: 'sys'}]});
    expect(body.contents).toEqual([{role: 'user', parts: [{text: 'usr'}]}]);
  });
  it('maps assistant to model', async () => {
    await createGeminiProvider('gemini-2.0-flash', 'k').analyze([{role: 'user', content: 'a'}, {role: 'assistant', content: 'b'}]);
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body.contents[1].role).toBe('model');
  });
  it('concatenates system messages', async () => {
    await createGeminiProvider('gemini-2.0-flash', 'k').analyze([{role: 'system', content: 'a'}, {role: 'system', content: 'b'}, {role: 'user', content: 'x'}]);
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body.systemInstruction.parts[0].text).toBe('a\n\nb');
  });
  it('handles missing usage', async () => {
    fetchSpy.mockResolvedValue(mockFetchResponse({candidates: [{content: {parts: [{text: 'x'}]}}]}));
    expect((await createGeminiProvider('gemini-2.0-flash', 'k').analyze([{role: 'user', content: 'test'}])).tokensUsed).toEqual({input: 0, output: 0});
  });
  it('handles missing candidates', async () => {
    fetchSpy.mockResolvedValue(mockFetchResponse({}));
    expect((await createGeminiProvider('gemini-2.0-flash', 'k').analyze([{role: 'user', content: 'test'}])).content).toBe('');
  });
  it('handles missing parts', async () => {
    fetchSpy.mockResolvedValue(mockFetchResponse({candidates: [{content: {}}]}));
    expect((await createGeminiProvider('gemini-2.0-flash', 'k').analyze([{role: 'user', content: 'test'}])).content).toBe('');
  });
  it('wraps HTTP errors', async () => {
    fetchSpy.mockResolvedValue(new Response('err', {status: 429}));
    await expect(createGeminiProvider('gemini-2.0-flash', 'k').analyze([{role: 'user', content: 'test'}])).rejects.toThrow(GeminiProviderError);
  });
  it('wraps network errors', async () => {
    fetchSpy.mockRejectedValue(new Error('net'));
    await expect(createGeminiProvider('gemini-2.0-flash', 'k').analyze([{role: 'user', content: 'test'}])).rejects.toThrow('Gemini API error: net');
  });
});

describe('analyzeStructured', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let fetchSpy: any;
  beforeEach(() => { fetchSpy = vi.spyOn(globalThis, 'fetch'); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('parses JSON', async () => {
    fetchSpy.mockResolvedValue(mockFetchResponse(geminiResp('{"a":1}')));
    expect(await createGeminiProvider('gemini-2.0-flash', 'k').analyzeStructured([{role: 'user', content: 'x'}], '{}')).toEqual({a: 1});
  });
  it('sends generationConfig', async () => {
    fetchSpy.mockResolvedValue(mockFetchResponse(geminiResp('{}')));
    await createGeminiProvider('gemini-2.0-flash', 'k').analyzeStructured([{role: 'user', content: 'x'}], '{}');
    expect(JSON.parse(fetchSpy.mock.calls[0][1].body).generationConfig).toEqual({responseMimeType: 'application/json'});
  });
  it('injects schema into system msg', async () => {
    fetchSpy.mockResolvedValue(mockFetchResponse(geminiResp('{}')));
    await createGeminiProvider('gemini-2.0-flash', 'k').analyzeStructured([{role: 'system', content: 'sys'}, {role: 'user', content: 'x'}], 'schema');
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body.systemInstruction.parts[0].text).toContain('sys');
    expect(body.systemInstruction.parts[0].text).toContain('schema');
  });
  it('creates system msg when none', async () => {
    fetchSpy.mockResolvedValue(mockFetchResponse(geminiResp('{}')));
    await createGeminiProvider('gemini-2.0-flash', 'k').analyzeStructured([{role: 'user', content: 'x'}], 'schema');
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body.systemInstruction.parts[0].text).toContain('Respond with valid JSON');
  });
  it('throws on invalid JSON', async () => {
    fetchSpy.mockResolvedValue(mockFetchResponse(geminiResp('bad{{')));
    await expect(createGeminiProvider('gemini-2.0-flash', 'k').analyzeStructured([{role: 'user', content: 'x'}], '{}')).rejects.toThrow('Failed to parse Gemini JSON');
  });
  it('wraps API errors', async () => {
    fetchSpy.mockResolvedValue(new Response('err', {status: 503}));
    await expect(createGeminiProvider('gemini-2.0-flash', 'k').analyzeStructured([{role: 'user', content: 'x'}], '{}')).rejects.toThrow(GeminiProviderError);
  });
  it('wraps non-Error', async () => {
    fetchSpy.mockRejectedValue('str');
    await expect(createGeminiProvider('gemini-2.0-flash', 'k').analyzeStructured([{role: 'user', content: 'x'}], '{}')).rejects.toThrow('Gemini API error: str');
  });
});
