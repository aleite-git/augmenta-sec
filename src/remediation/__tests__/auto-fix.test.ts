import {describe, it, expect, vi} from 'vitest';

import type {Finding} from '../../findings/types.js';
import type {LLMProvider, LLMRole} from '../../providers/llm/types.js';
import {
  buildFixPrompt,
  generateFix,
  parseFixResponse,
} from '../auto-fix.js';

/** Creates a minimal Finding for testing. */
function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: 'aaaa-bbbb-cccc-dddd',
    source: 'scanner',
    scanner: 'semgrep',
    category: 'injection',
    severity: 'high',
    rawSeverity: 'high',
    title: 'SQL injection in query builder',
    description: 'User input flows into raw SQL query without sanitization.',
    file: 'src/db/query.ts',
    line: 42,
    confidence: 0.9,
    cweId: 'CWE-89',
    status: 'open',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

/** Creates a stub LLMProvider. */
function makeProvider(responseContent: string): LLMProvider {
  return {
    name: 'test',
    model: 'test-model',
    capabilities: {
      maxContextTokens: 100_000,
      supportsImages: false,
      supportsStructuredOutput: false,
    },
    analyze: vi.fn().mockResolvedValue({
      content: responseContent,
      tokensUsed: {input: 100, output: 200},
      model: 'test-model',
      role: 'analysis' as LLMRole,
    }),
    analyzeStructured: vi.fn(),
  };
}

describe('buildFixPrompt', () => {
  it('includes the finding title and description', () => {
    const finding = makeFinding();
    const prompt = buildFixPrompt(finding, 'const x = 1;');

    expect(prompt).toContain('SQL injection in query builder');
    expect(prompt).toContain('User input flows into raw SQL query');
  });

  it('includes CWE, file, and line when present', () => {
    const finding = makeFinding({cweId: 'CWE-89', file: 'src/db.ts', line: 10});
    const prompt = buildFixPrompt(finding, 'code');

    expect(prompt).toContain('CWE-89');
    expect(prompt).toContain('src/db.ts');
    expect(prompt).toContain('Line: 10');
  });

  it('omits CWE, file, and line when absent', () => {
    const finding = makeFinding({
      cweId: undefined,
      file: undefined,
      line: undefined,
    });
    const prompt = buildFixPrompt(finding, 'code');

    expect(prompt).not.toContain('CWE:');
    expect(prompt).not.toContain('File:');
    expect(prompt).not.toContain('Line:');
  });

  it('includes the file content in the prompt', () => {
    const content = 'function vulnerable() { return db.raw(input); }';
    const prompt = buildFixPrompt(makeFinding(), content);

    expect(prompt).toContain(content);
  });
});

describe('parseFixResponse', () => {
  it('parses a valid JSON response', () => {
    const json = JSON.stringify({
      original: 'db.raw(input)',
      fixed: 'db.query($1, [input])',
      explanation: 'Use parameterized queries.',
      confidence: 0.85,
    });

    const result = parseFixResponse(json);

    expect(result.original).toBe('db.raw(input)');
    expect(result.fixed).toBe('db.query($1, [input])');
    expect(result.explanation).toBe('Use parameterized queries.');
    expect(result.confidence).toBe(0.85);
  });

  it('strips markdown code fences', () => {
    const json = [
      '```json',
      JSON.stringify({
        original: 'a',
        fixed: 'b',
        explanation: 'c',
        confidence: 0.7,
      }),
      '```',
    ].join('\n');

    const result = parseFixResponse(json);

    expect(result.original).toBe('a');
    expect(result.fixed).toBe('b');
  });

  it('defaults confidence to 0.5 when missing', () => {
    const json = JSON.stringify({
      original: 'x',
      fixed: 'y',
      explanation: 'z',
    });

    const result = parseFixResponse(json);

    expect(result.confidence).toBe(0.5);
  });

  it('clamps confidence to [0, 1]', () => {
    const high = JSON.stringify({
      original: 'x',
      fixed: 'y',
      explanation: 'z',
      confidence: 1.5,
    });
    expect(parseFixResponse(high).confidence).toBe(1);

    const low = JSON.stringify({
      original: 'x',
      fixed: 'y',
      explanation: 'z',
      confidence: -0.3,
    });
    expect(parseFixResponse(low).confidence).toBe(0);
  });

  it('throws on invalid JSON', () => {
    expect(() => parseFixResponse('not json')).toThrow(
      'Failed to parse LLM fix response as JSON',
    );
  });

  it('throws when required fields are missing', () => {
    expect(() =>
      parseFixResponse(JSON.stringify({fixed: 'y', explanation: 'z'})),
    ).toThrow('missing "original"');

    expect(() =>
      parseFixResponse(JSON.stringify({original: 'x', explanation: 'z'})),
    ).toThrow('missing "fixed"');

    expect(() =>
      parseFixResponse(JSON.stringify({original: 'x', fixed: 'y'})),
    ).toThrow('missing "explanation"');
  });

  it('throws when response is not an object', () => {
    expect(() => parseFixResponse('"a string"')).toThrow(
      'not a JSON object',
    );
  });
});

describe('generateFix', () => {
  it('calls the provider and returns a parsed FixSuggestion', async () => {
    const responseJson = JSON.stringify({
      original: 'db.raw(input)',
      fixed: 'db.parameterized(input)',
      explanation: 'Use parameterized queries.',
      confidence: 0.9,
    });
    const provider = makeProvider(responseJson);
    const finding = makeFinding();

    const result = await generateFix(finding, 'file content', provider);

    expect(result.original).toBe('db.raw(input)');
    expect(result.fixed).toBe('db.parameterized(input)');
    expect(result.confidence).toBe(0.9);
    expect(provider.analyze).toHaveBeenCalledOnce();
  });

  it('propagates provider errors', async () => {
    const provider = makeProvider('');
    vi.mocked(provider.analyze).mockRejectedValue(new Error('LLM down'));

    await expect(
      generateFix(makeFinding(), 'content', provider),
    ).rejects.toThrow('LLM down');
  });
});
