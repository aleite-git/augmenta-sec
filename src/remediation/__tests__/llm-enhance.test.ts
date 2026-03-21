import {describe, it, expect, vi} from 'vitest';

import type {Finding} from '../../findings/types.js';
import type {LLMProvider, LLMRole} from '../../providers/llm/types.js';
import type {RemediationSuggestion} from '../engine.js';
import {enhanceWithLLM} from '../llm-enhance.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: 'finding-001',
    source: 'scanner',
    scanner: 'semgrep',
    category: 'injection',
    severity: 'high',
    rawSeverity: 'high',
    title: 'SQL injection in query builder',
    description: 'User input flows into raw SQL.',
    file: 'src/db/query.ts',
    line: 42,
    confidence: 0.9,
    cweId: 'CWE-89',
    status: 'open',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeSuggestion(overrides: Partial<RemediationSuggestion> = {}): RemediationSuggestion {
  return {
    findingId: 'finding-001',
    title: 'Use parameterized queries',
    description: 'Replace string concatenation with parameterized queries.',
    effort: 'medium',
    priority: 85,
    ...overrides,
  };
}

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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('enhanceWithLLM', () => {
  it('merges LLM suggestions with rule-based ones', async () => {
    const findings = [makeFinding()];
    const existing = [makeSuggestion()];
    const llmResponse = JSON.stringify([
      {
        findingId: 'finding-001',
        title: 'LLM: Use ORM for all queries',
        description: 'Context-aware suggestion from LLM.',
        effort: 'low',
        priority: 95,
        codeExample: 'db.user.findUnique({ where: { id } })',
      },
    ]);

    const result = await enhanceWithLLM(
      existing,
      findings,
      makeProvider(llmResponse),
    );

    // LLM overrides the existing suggestion for the same findingId
    const f1Suggestion = result.find((s) => s.findingId === 'finding-001');
    expect(f1Suggestion).toBeDefined();
    expect(f1Suggestion!.title).toBe('LLM: Use ORM for all queries');
    expect(f1Suggestion!.priority).toBe(95);
    expect(f1Suggestion!.codeExample).toBe('db.user.findUnique({ where: { id } })');
  });

  it('keeps rule-based suggestions when LLM returns no match', async () => {
    const findings = [makeFinding()];
    const existing = [makeSuggestion()];
    const llmResponse = JSON.stringify([
      {
        findingId: 'unknown-finding',
        title: 'Unrelated suggestion',
        description: 'Does not match.',
        effort: 'high',
        priority: 10,
      },
    ]);

    const result = await enhanceWithLLM(
      existing,
      findings,
      makeProvider(llmResponse),
    );

    expect(result.some((s) => s.findingId === 'finding-001')).toBe(true);
    expect(result.some((s) => s.findingId === 'unknown-finding')).toBe(true);
  });

  it('handles empty findings gracefully', async () => {
    const result = await enhanceWithLLM([], [], makeProvider('[]'));
    expect(result).toEqual([]);
  });

  it('handles empty existing suggestions', async () => {
    const findings = [makeFinding()];
    const llmResponse = JSON.stringify([
      {
        findingId: 'finding-001',
        title: 'Fresh LLM suggestion',
        description: 'Brand new.',
        effort: 'low',
        priority: 80,
      },
    ]);

    const result = await enhanceWithLLM(
      [],
      findings,
      makeProvider(llmResponse),
    );

    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Fresh LLM suggestion');
  });

  it('gracefully handles LLM returning invalid JSON', async () => {
    const findings = [makeFinding()];
    const existing = [makeSuggestion()];

    const result = await enhanceWithLLM(
      existing,
      findings,
      makeProvider('not valid json at all'),
    );

    // Should fall through and keep existing suggestions
    expect(result).toHaveLength(1);
    expect(result[0].findingId).toBe('finding-001');
  });

  it('gracefully handles LLM returning non-array JSON', async () => {
    const findings = [makeFinding()];
    const existing = [makeSuggestion()];

    const result = await enhanceWithLLM(
      existing,
      findings,
      makeProvider('{"not": "an array"}'),
    );

    expect(result).toHaveLength(1);
    expect(result[0].findingId).toBe('finding-001');
  });

  it('gracefully handles LLM throwing an error', async () => {
    const findings = [makeFinding()];
    const existing = [makeSuggestion()];
    const provider = makeProvider('');
    vi.mocked(provider.analyze).mockRejectedValue(new Error('API down'));

    const result = await enhanceWithLLM(existing, findings, provider);

    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Use parameterized queries');
  });

  it('batches findings when more than 10', async () => {
    const findings = Array.from({length: 15}, (_, i) =>
      makeFinding({id: `f-${i}`, title: `SQL injection variant ${i}`}),
    );
    const existing = findings.map((f) =>
      makeSuggestion({findingId: f.id, title: `Rule for ${f.id}`}),
    );

    const provider = makeProvider('[]');
    await enhanceWithLLM(existing, findings, provider);

    // Should have been called twice: batch of 10 + batch of 5
    expect(provider.analyze).toHaveBeenCalledTimes(2);
  });

  it('handles markdown fences in LLM response', async () => {
    const findings = [makeFinding()];
    const existing = [makeSuggestion()];
    const fenced = [
      '```json',
      JSON.stringify([
        {
          findingId: 'finding-001',
          title: 'Fenced suggestion',
          description: 'Wrapped in markdown fences.',
          effort: 'medium',
          priority: 70,
        },
      ]),
      '```',
    ].join('\n');

    const result = await enhanceWithLLM(
      existing,
      findings,
      makeProvider(fenced),
    );

    expect(result.find((s) => s.title === 'Fenced suggestion')).toBeDefined();
  });

  it('clamps priority to 0-100 range', async () => {
    const findings = [makeFinding()];
    const llmResponse = JSON.stringify([
      {
        findingId: 'finding-001',
        title: 'Over-prioritized',
        description: 'Too high.',
        effort: 'low',
        priority: 150,
      },
    ]);

    const result = await enhanceWithLLM(
      [],
      findings,
      makeProvider(llmResponse),
    );

    expect(result[0].priority).toBe(100);
  });

  it('defaults effort to medium for invalid values', async () => {
    const findings = [makeFinding()];
    const llmResponse = JSON.stringify([
      {
        findingId: 'finding-001',
        title: 'Bad effort',
        description: 'Invalid effort level.',
        effort: 'super-easy',
        priority: 50,
      },
    ]);

    const result = await enhanceWithLLM(
      [],
      findings,
      makeProvider(llmResponse),
    );

    expect(result[0].effort).toBe('medium');
  });
});
