import {describe, it, expect, vi} from 'vitest';
import {createGateway, parseModelString, TokenBudgetExceededError, AllProvidersFailedError} from '../gateway.js';
import type {LLMProvider, LLMResponse, LLMRole} from '../types.js';

function createStubProvider(name: string, model: string = 'test-model'): LLMProvider {
  return {
    name, model,
    capabilities: {maxContextTokens: 100_000, supportsImages: false, supportsStructuredOutput: false},
    async analyze() {
      return {content: 'stub response', tokensUsed: {input: 10, output: 20}, model, role: 'analysis' as LLMRole};
    },
    async analyzeStructured<T>(): Promise<T> { return {} as T; },
  };
}

function createFailingProvider(name: string, error: Error): LLMProvider {
  return {
    name, model: 'fail-model',
    capabilities: {maxContextTokens: 100_000, supportsImages: false, supportsStructuredOutput: false},
    async analyze() { throw error; },
    async analyzeStructured<T>(): Promise<T> { throw error; },
  };
}

describe('parseModelString', () => {
  it('splits provider/model', () => {
    expect(parseModelString('gemini/gemini-2.5-flash')).toEqual({provider: 'gemini', model: 'gemini-2.5-flash'});
  });
  it('handles multiple slashes', () => {
    expect(parseModelString('openai/gpt-4/turbo')).toEqual({provider: 'openai', model: 'gpt-4/turbo'});
  });
  it('throws on no slash', () => {
    expect(() => parseModelString('gemini-2.5-flash')).toThrow('Invalid model string');
  });
  it('throws on empty', () => {
    expect(() => parseModelString('')).toThrow('Invalid model string');
  });
});

describe('createGateway', () => {
  it('routes triage role correctly', () => {
    const gp = createStubProvider('gemini', 'gemini-2.5-flash');
    const gw = createGateway({triage: 'gemini/flash', analysis: 'gemini/flash', reasoning: 'gemini/flash'}, new Map([['gemini', gp]]));
    expect(gw.getProvider('triage')).toBe(gp);
  });
  it('routes different roles to different providers', () => {
    const gp = createStubProvider('gemini');
    const op = createStubProvider('openai');
    const gw = createGateway({triage: 'gemini/f', analysis: 'openai/g', reasoning: 'gemini/f'}, new Map([['gemini', gp], ['openai', op]]));
    expect(gw.getProvider('triage')).toBe(gp);
    expect(gw.getProvider('analysis')).toBe(op);
  });
  it('throws when provider not found', () => {
    const gp = createStubProvider('gemini');
    expect(() => createGateway({triage: 'gemini/f', analysis: 'openai/g', reasoning: 'gemini/f'}, new Map([['gemini', gp]]))).toThrow('Provider "openai" not found');
  });
  it('listProviders includes registered', () => {
    const gp = createStubProvider('gemini');
    const gw = createGateway({triage: 'gemini/f', analysis: 'gemini/f', reasoning: 'gemini/f'}, new Map([['gemini', gp]]));
    const mp = createStubProvider('mistral');
    gw.registerProvider('mistral', mp);
    expect(gw.listProviders()).toHaveLength(2);
    expect(gw.listProviders()).toContain(mp);
  });
  it('listProviders deduplicates single provider', () => {
    const gp = createStubProvider('gemini');
    const gw = createGateway({triage: 'gemini/a', analysis: 'gemini/b', reasoning: 'gemini/c'}, new Map([['gemini', gp]]));
    expect(gw.listProviders()).toHaveLength(1);
  });
});

describe('registerProvider', () => {
  it('adds new provider', () => {
    const gp = createStubProvider('gemini');
    const gw = createGateway({triage: 'gemini/f', analysis: 'gemini/f', reasoning: 'gemini/f'}, new Map([['gemini', gp]]));
    gw.registerProvider('mistral', createStubProvider('mistral'));
    expect(gw.listProviders()).toHaveLength(2);
  });
  it('overwrites existing', () => {
    const gp = createStubProvider('gemini');
    const gw = createGateway({triage: 'gemini/f', analysis: 'gemini/f', reasoning: 'gemini/f'}, new Map([['gemini', gp]]));
    const gp2 = createStubProvider('gemini', 'v2');
    gw.registerProvider('gemini', gp2);
    expect(gw.listProviders()).toContain(gp2);
  });
});

describe('analyze', () => {
  it('routes based on role', async () => {
    const gp = createStubProvider('gemini');
    const spy = vi.spyOn(gp, 'analyze');
    const gw = createGateway({triage: 'gemini/f', analysis: 'gemini/f', reasoning: 'gemini/f'}, new Map([['gemini', gp]]));
    const r = await gw.analyze([{role: 'user', content: 'test'}], {role: 'triage'});
    expect(spy).toHaveBeenCalled();
    expect(r.role).toBe('triage');
  });
  it('defaults to analysis', async () => {
    const gp = createStubProvider('gemini');
    const gw = createGateway({triage: 'gemini/f', analysis: 'gemini/f', reasoning: 'gemini/f'}, new Map([['gemini', gp]]));
    expect((await gw.analyze([{role: 'user', content: 'test'}])).role).toBe('analysis');
  });
  it('tracks tokens', async () => {
    const gp = createStubProvider('gemini');
    const gw = createGateway({triage: 'gemini/f', analysis: 'gemini/f', reasoning: 'gemini/f'}, new Map([['gemini', gp]]));
    await gw.analyze([{role: 'user', content: 'test'}]);
    expect(gw.getTokenTracker()).toEqual({totalInputTokens: 10, totalOutputTokens: 20, requestCount: 1});
  });
  it('accumulates tokens', async () => {
    const gp = createStubProvider('gemini');
    const gw = createGateway({triage: 'gemini/f', analysis: 'gemini/f', reasoning: 'gemini/f'}, new Map([['gemini', gp]]));
    await gw.analyze([{role: 'user', content: '1'}]);
    await gw.analyze([{role: 'user', content: '2'}]);
    expect(gw.getTokenTracker().requestCount).toBe(2);
  });
  it('resets tracker', async () => {
    const gp = createStubProvider('gemini');
    const gw = createGateway({triage: 'gemini/f', analysis: 'gemini/f', reasoning: 'gemini/f'}, new Map([['gemini', gp]]));
    await gw.analyze([{role: 'user', content: 'test'}]);
    gw.resetTokenTracker();
    expect(gw.getTokenTracker().requestCount).toBe(0);
  });
  it('throws TokenBudgetExceededError', async () => {
    const gp = createStubProvider('gemini');
    const gw = createGateway({triage: 'gemini/f', analysis: 'gemini/f', reasoning: 'gemini/f'}, new Map([['gemini', gp]]));
    await expect(gw.analyze([{role: 'user', content: 'test'}], {tokenBudget: 5})).rejects.toThrow(TokenBudgetExceededError);
  });
  it('succeeds within budget', async () => {
    const gp = createStubProvider('gemini');
    const gw = createGateway({triage: 'gemini/f', analysis: 'gemini/f', reasoning: 'gemini/f'}, new Map([['gemini', gp]]));
    expect((await gw.analyze([{role: 'user', content: 'test'}], {tokenBudget: 100})).content).toBe('stub response');
  });
});

describe('fallback chain', () => {
  it('falls back on failure', async () => {
    const fp = createFailingProvider('primary', new Error('down'));
    const bp = createStubProvider('backup');
    const gw = createGateway({triage: 'primary/m', analysis: 'primary/m', reasoning: 'primary/m'}, new Map([['primary', fp], ['backup', bp]]), {fallbacks: {analysis: ['backup']}});
    expect((await gw.analyze([{role: 'user', content: 'test'}])).content).toBe('stub response');
  });
  it('throws AllProvidersFailedError when all fail', async () => {
    const p1 = createFailingProvider('p1', new Error('e1'));
    const p2 = createFailingProvider('p2', new Error('e2'));
    const gw = createGateway({triage: 'p1/m', analysis: 'p1/m', reasoning: 'p1/m'}, new Map([['p1', p1], ['p2', p2]]), {fallbacks: {analysis: ['p2']}});
    await expect(gw.analyze([{role: 'user', content: 'test'}])).rejects.toThrow(AllProvidersFailedError);
  });
  it('AllProvidersFailedError collects errors', async () => {
    const p1 = createFailingProvider('p1', new Error('e1'));
    const p2 = createFailingProvider('p2', new Error('e2'));
    const gw = createGateway({triage: 'p1/m', analysis: 'p1/m', reasoning: 'p1/m'}, new Map([['p1', p1], ['p2', p2]]), {fallbacks: {analysis: ['p2']}});
    try { await gw.analyze([{role: 'user', content: 'test'}]); expect.fail('should throw'); } catch (e) { expect((e as AllProvidersFailedError).errors).toHaveLength(2); }
  });
  it('skips duplicate in fallback', async () => {
    const fp = createFailingProvider('primary', new Error('down'));
    const bp = createStubProvider('backup');
    const gw = createGateway({triage: 'primary/m', analysis: 'primary/m', reasoning: 'primary/m'}, new Map([['primary', fp], ['backup', bp]]), {fallbacks: {analysis: ['primary', 'backup']}});
    expect((await gw.analyze([{role: 'user', content: 'test'}])).content).toBe('stub response');
  });
  it('no fallback = single try', async () => {
    const fp = createFailingProvider('primary', new Error('down'));
    const gw = createGateway({triage: 'primary/m', analysis: 'primary/m', reasoning: 'primary/m'}, new Map([['primary', fp]]));
    await expect(gw.analyze([{role: 'user', content: 'test'}])).rejects.toThrow(AllProvidersFailedError);
  });
  it('no retry on TokenBudgetExceededError', async () => {
    const ep: LLMProvider = {
      name: 'expensive', model: 'e',
      capabilities: {maxContextTokens: 100_000, supportsImages: false, supportsStructuredOutput: false},
      async analyze(): Promise<LLMResponse> { return {content: 'x', tokensUsed: {input: 5000, output: 5000}, model: 'e', role: 'analysis'}; },
      async analyzeStructured<T>(): Promise<T> { return {} as T; },
    };
    const bp = createStubProvider('backup');
    const gw = createGateway({triage: 'expensive/e', analysis: 'expensive/e', reasoning: 'expensive/e'}, new Map([['expensive', ep], ['backup', bp]]), {fallbacks: {analysis: ['backup']}});
    await expect(gw.analyze([{role: 'user', content: 'test'}], {tokenBudget: 100})).rejects.toThrow(TokenBudgetExceededError);
  });
});

describe('error classes', () => {
  it('TokenBudgetExceededError', () => { const e = new TokenBudgetExceededError(100, 200); expect(e.name).toBe('TokenBudgetExceededError'); });
  it('AllProvidersFailedError', () => { const e = new AllProvidersFailedError('analysis', [new Error('x')]); expect(e.name).toBe('AllProvidersFailedError'); expect(e.errors).toHaveLength(1); });
});
