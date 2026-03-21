import {describe, it, expect} from 'vitest';
import {createGateway, parseModelString} from '../gateway.js';
import type {LLMConfig, LLMProvider, LLMRole} from '../types.js';

/** Creates a stub LLMProvider with the given name and model. */
function createStubProvider(
  name: string,
  model: string = 'test-model',
): LLMProvider {
  return {
    name,
    model,
    capabilities: {
      maxContextTokens: 100_000,
      supportsImages: false,
      supportsStructuredOutput: false,
    },
    async analyze() {
      return {
        content: 'stub response',
        tokensUsed: {input: 10, output: 20},
        model,
        role: 'analysis' as LLMRole,
      };
    },
    async analyzeStructured<T>(): Promise<T> {
      return {} as T;
    },
  };
}

describe('parseModelString', () => {
  it('correctly splits "gemini/gemini-2.5-flash"', () => {
    const result = parseModelString('gemini/gemini-2.5-flash');

    expect(result).toEqual({
      provider: 'gemini',
      model: 'gemini-2.5-flash',
    });
  });

  it('handles provider/model with multiple slashes', () => {
    const result = parseModelString('openai/gpt-4/turbo');

    expect(result).toEqual({
      provider: 'openai',
      model: 'gpt-4/turbo',
    });
  });

  it('throws on invalid format with no slash', () => {
    expect(() => parseModelString('gemini-2.5-flash')).toThrow(
      'Invalid model string "gemini-2.5-flash"',
    );
  });

  it('throws on empty string', () => {
    expect(() => parseModelString('')).toThrow('Invalid model string ""');
  });
});

describe('createGateway', () => {
  it('routes triage role to the correct provider', () => {
    const geminiProvider = createStubProvider('gemini', 'gemini-2.5-flash');
    const providers = new Map([['gemini', geminiProvider]]);
    const config: LLMConfig = {
      triage: 'gemini/gemini-2.5-flash',
      analysis: 'gemini/gemini-2.5-flash',
      reasoning: 'gemini/gemini-2.5-flash',
    };

    const gateway = createGateway(config, providers);
    const provider = gateway.getProvider('triage');

    expect(provider).toBe(geminiProvider);
    expect(provider.name).toBe('gemini');
  });

  it('routes different roles to different providers', () => {
    const geminiProvider = createStubProvider('gemini', 'gemini-2.5-flash');
    const openaiProvider = createStubProvider('openai', 'gpt-4o');
    const providers = new Map([
      ['gemini', geminiProvider],
      ['openai', openaiProvider],
    ]);
    const config: LLMConfig = {
      triage: 'gemini/gemini-2.5-flash',
      analysis: 'openai/gpt-4o',
      reasoning: 'gemini/gemini-2.5-flash',
    };

    const gateway = createGateway(config, providers);

    expect(gateway.getProvider('triage')).toBe(geminiProvider);
    expect(gateway.getProvider('analysis')).toBe(openaiProvider);
    expect(gateway.getProvider('reasoning')).toBe(geminiProvider);
  });

  it('throws when provider not found in providers map', () => {
    const geminiProvider = createStubProvider('gemini', 'gemini-2.5-flash');
    const providers = new Map([['gemini', geminiProvider]]);
    const config: LLMConfig = {
      triage: 'gemini/gemini-2.5-flash',
      analysis: 'openai/gpt-4o',
      reasoning: 'gemini/gemini-2.5-flash',
    };

    expect(() => createGateway(config, providers)).toThrow(
      'Provider "openai" not found for role "analysis"',
    );
  });

  it('listProviders returns all unique providers', () => {
    const geminiProvider = createStubProvider('gemini', 'gemini-2.5-flash');
    const openaiProvider = createStubProvider('openai', 'gpt-4o');
    const providers = new Map([
      ['gemini', geminiProvider],
      ['openai', openaiProvider],
    ]);
    const config: LLMConfig = {
      triage: 'gemini/gemini-2.5-flash',
      analysis: 'openai/gpt-4o',
      reasoning: 'gemini/gemini-2.5-flash', // same as triage
    };

    const gateway = createGateway(config, providers);
    const listed = gateway.listProviders();

    // gemini used for triage+reasoning, openai for analysis = 2 unique
    expect(listed).toHaveLength(2);
    expect(listed).toContain(geminiProvider);
    expect(listed).toContain(openaiProvider);
  });

  it('listProviders returns single provider when all roles use the same one', () => {
    const geminiProvider = createStubProvider('gemini');
    const providers = new Map([['gemini', geminiProvider]]);
    const config: LLMConfig = {
      triage: 'gemini/gemini-2.5-flash-lite',
      analysis: 'gemini/gemini-2.5-flash',
      reasoning: 'gemini/gemini-2.5-pro',
    };

    const gateway = createGateway(config, providers);
    const listed = gateway.listProviders();

    // All roles use the same provider instance (keyed by provider name)
    expect(listed).toHaveLength(1);
    expect(listed[0]).toBe(geminiProvider);
  });
});
