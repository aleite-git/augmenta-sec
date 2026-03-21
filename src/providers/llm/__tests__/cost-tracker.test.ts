import {describe, it, expect, vi} from 'vitest';
import {createCostTracker} from '../cost-tracker.js';
import type {LLMResponse} from '../types.js';

/** Creates a stub LLM response for testing. */
function makeResponse(overrides: Partial<LLMResponse> = {}): LLMResponse {
  return {
    content: 'test response',
    tokensUsed: {input: 1000, output: 500},
    model: 'gemini-2.5-flash',
    role: 'analysis',
    ...overrides,
  };
}

describe('createCostTracker', () => {
  it('returns a tracker with zero totals initially', () => {
    const tracker = createCostTracker();
    const summary = tracker.getSummary();

    expect(summary.totalInputTokens).toBe(0);
    expect(summary.totalOutputTokens).toBe(0);
    expect(summary.estimatedCost).toBe(0);
    expect(summary.breakdown).toHaveLength(0);
  });
});

describe('CostTracker.record', () => {
  it('accumulates token counts from a single response', () => {
    const tracker = createCostTracker();
    tracker.record(
      makeResponse({tokensUsed: {input: 1000, output: 500}}),
    );
    const summary = tracker.getSummary();

    expect(summary.totalInputTokens).toBe(1000);
    expect(summary.totalOutputTokens).toBe(500);
    expect(summary.breakdown).toHaveLength(1);
  });

  it('accumulates token counts from multiple responses', () => {
    const tracker = createCostTracker();
    tracker.record(makeResponse({tokensUsed: {input: 1000, output: 500}}));
    tracker.record(makeResponse({tokensUsed: {input: 2000, output: 1000}}));
    const summary = tracker.getSummary();

    expect(summary.totalInputTokens).toBe(3000);
    expect(summary.totalOutputTokens).toBe(1500);
    expect(summary.breakdown).toHaveLength(2);
  });

  it('computes cost for gemini-2.5-flash correctly', () => {
    const tracker = createCostTracker();
    // Pricing: input $0.15/1M, output $0.60/1M
    tracker.record(
      makeResponse({
        model: 'gemini-2.5-flash',
        tokensUsed: {input: 1_000_000, output: 1_000_000},
      }),
    );
    const summary = tracker.getSummary();

    // $0.15 input + $0.60 output = $0.75
    expect(summary.estimatedCost).toBeCloseTo(0.75, 4);
  });

  it('computes cost for gpt-4o correctly', () => {
    const tracker = createCostTracker();
    // Pricing: input $2.50/1M, output $10.00/1M
    tracker.record(
      makeResponse({
        model: 'gpt-4o',
        tokensUsed: {input: 1_000_000, output: 1_000_000},
      }),
    );
    const summary = tracker.getSummary();

    expect(summary.estimatedCost).toBeCloseTo(12.50, 4);
  });

  it('computes cost for claude-sonnet-4-20250514 correctly', () => {
    const tracker = createCostTracker();
    // Pricing: input $3.00/1M, output $15.00/1M
    tracker.record(
      makeResponse({
        model: 'claude-sonnet-4-20250514',
        tokensUsed: {input: 1_000_000, output: 1_000_000},
      }),
    );
    const summary = tracker.getSummary();

    expect(summary.estimatedCost).toBeCloseTo(18.0, 4);
  });

  it('computes cost for mistral-large-latest correctly', () => {
    const tracker = createCostTracker();
    // Pricing: input $2.00/1M, output $6.00/1M
    tracker.record(
      makeResponse({
        model: 'mistral-large-latest',
        tokensUsed: {input: 1_000_000, output: 1_000_000},
      }),
    );
    const summary = tracker.getSummary();

    expect(summary.estimatedCost).toBeCloseTo(8.0, 4);
  });

  it('returns zero cost for ollama models', () => {
    const tracker = createCostTracker();
    tracker.record(
      makeResponse({
        model: 'ollama/llama3',
        tokensUsed: {input: 1_000_000, output: 1_000_000},
      }),
    );
    const summary = tracker.getSummary();

    expect(summary.estimatedCost).toBe(0);
  });

  it('returns zero cost for unknown models', () => {
    const tracker = createCostTracker();
    tracker.record(
      makeResponse({
        model: 'unknown-model-xyz',
        tokensUsed: {input: 1_000_000, output: 1_000_000},
      }),
    );
    const summary = tracker.getSummary();

    expect(summary.estimatedCost).toBe(0);
  });

  it('uses prefix matching for versioned model names', () => {
    const tracker = createCostTracker();
    // "gemini-2.5-flash-preview-0417" should match "gemini-2.5-flash"
    tracker.record(
      makeResponse({
        model: 'gemini-2.5-flash-preview-0417',
        tokensUsed: {input: 1_000_000, output: 1_000_000},
      }),
    );
    const summary = tracker.getSummary();

    expect(summary.estimatedCost).toBeCloseTo(0.75, 4);
  });

  it('records timestamp on each entry', () => {
    const tracker = createCostTracker();
    const before = new Date();
    tracker.record(makeResponse());
    const after = new Date();

    const entry = tracker.getSummary().breakdown[0];
    expect(entry.timestamp.getTime()).toBeGreaterThanOrEqual(
      before.getTime(),
    );
    expect(entry.timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
  });
});

describe('CostTracker.reset', () => {
  it('clears all tracked data', () => {
    const tracker = createCostTracker();
    tracker.record(makeResponse());
    tracker.record(makeResponse());

    tracker.reset();
    const summary = tracker.getSummary();

    expect(summary.totalInputTokens).toBe(0);
    expect(summary.totalOutputTokens).toBe(0);
    expect(summary.estimatedCost).toBe(0);
    expect(summary.breakdown).toHaveLength(0);
  });
});

describe('CostTracker.setBudget', () => {
  it('fires alert callback when cost exceeds budget', () => {
    const tracker = createCostTracker();
    const alertFn = vi.fn();
    // Budget: $0.001 — will be exceeded by a Gemini call.
    tracker.setBudget(0.001, alertFn);

    tracker.record(
      makeResponse({
        model: 'gpt-4o',
        tokensUsed: {input: 100_000, output: 100_000},
      }),
    );

    expect(alertFn).toHaveBeenCalledTimes(1);
    const alert = alertFn.mock.calls[0][0];
    expect(alert.budgetUsd).toBe(0.001);
    expect(alert.currentCostUsd).toBeGreaterThan(0.001);
    expect(alert.overage).toBeGreaterThan(0);
  });

  it('does not fire alert when under budget', () => {
    const tracker = createCostTracker();
    const alertFn = vi.fn();
    tracker.setBudget(100, alertFn);

    tracker.record(
      makeResponse({tokensUsed: {input: 100, output: 50}}),
    );

    expect(alertFn).not.toHaveBeenCalled();
  });

  it('fires alert only once even with multiple over-budget calls', () => {
    const tracker = createCostTracker();
    const alertFn = vi.fn();
    tracker.setBudget(0.0001, alertFn);

    tracker.record(
      makeResponse({
        model: 'gpt-4o',
        tokensUsed: {input: 100_000, output: 100_000},
      }),
    );
    tracker.record(
      makeResponse({
        model: 'gpt-4o',
        tokensUsed: {input: 100_000, output: 100_000},
      }),
    );

    expect(alertFn).toHaveBeenCalledTimes(1);
  });

  it('resets alert state after reset()', () => {
    const tracker = createCostTracker();
    const alertFn = vi.fn();
    tracker.setBudget(0.0001, alertFn);

    tracker.record(
      makeResponse({
        model: 'gpt-4o',
        tokensUsed: {input: 100_000, output: 100_000},
      }),
    );
    expect(alertFn).toHaveBeenCalledTimes(1);

    tracker.reset();
    tracker.record(
      makeResponse({
        model: 'gpt-4o',
        tokensUsed: {input: 100_000, output: 100_000},
      }),
    );
    expect(alertFn).toHaveBeenCalledTimes(2);
  });

  it('works without an alert callback', () => {
    const tracker = createCostTracker();
    tracker.setBudget(0.0001);

    // Should not throw even when over budget with no callback.
    expect(() =>
      tracker.record(
        makeResponse({
          model: 'gpt-4o',
          tokensUsed: {input: 100_000, output: 100_000},
        }),
      ),
    ).not.toThrow();
  });
});

describe('CostTracker.getSummary', () => {
  it('returns a copy of the breakdown array', () => {
    const tracker = createCostTracker();
    tracker.record(makeResponse());

    const summary1 = tracker.getSummary();
    const summary2 = tracker.getSummary();

    expect(summary1.breakdown).not.toBe(summary2.breakdown);
    expect(summary1.breakdown).toEqual(summary2.breakdown);
  });

  it('aggregates costs across different models', () => {
    const tracker = createCostTracker();

    // Gemini Flash: $0.15/1M input, $0.60/1M output
    tracker.record(
      makeResponse({
        model: 'gemini-2.5-flash',
        tokensUsed: {input: 500_000, output: 250_000},
      }),
    );
    // GPT-4o: $2.50/1M input, $10.00/1M output
    tracker.record(
      makeResponse({
        model: 'gpt-4o',
        tokensUsed: {input: 500_000, output: 250_000},
      }),
    );

    const summary = tracker.getSummary();

    expect(summary.totalInputTokens).toBe(1_000_000);
    expect(summary.totalOutputTokens).toBe(500_000);
    // Gemini: 0.5M * 0.15/1M + 0.25M * 0.60/1M = 0.075 + 0.15 = 0.225
    // GPT-4o: 0.5M * 2.50/1M + 0.25M * 10.00/1M = 1.25 + 2.50 = 3.75
    // Total: 3.975
    expect(summary.estimatedCost).toBeCloseTo(3.975, 4);
    expect(summary.breakdown).toHaveLength(2);
  });
});
