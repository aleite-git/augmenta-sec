/**
 * LLM cost tracking — monitors token usage and estimated cost per scan.
 *
 * Maintains a running total of input/output tokens across LLM calls,
 * estimates cost using built-in pricing tables for known model families,
 * and supports budget alerts to prevent runaway spending.
 */

import type {LLMResponse} from './types.js';

/** A single cost record for one LLM call. */
export interface CostEntry {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  timestamp: Date;
}

/** Aggregated cost summary across all tracked calls. */
export interface CostSummary {
  totalInputTokens: number;
  totalOutputTokens: number;
  estimatedCost: number;
  breakdown: CostEntry[];
}

/** Emitted when accumulated cost exceeds the configured budget. */
export interface BudgetAlert {
  budgetUsd: number;
  currentCostUsd: number;
  overage: number;
}

/** Callback invoked when the budget threshold is exceeded. */
export type BudgetAlertCallback = (alert: BudgetAlert) => void;

/** Tracks token usage and cost across LLM calls. */
export interface CostTracker {
  /** Records token usage from an LLM response. */
  record(response: LLMResponse): void;

  /** Returns the aggregated cost summary. */
  getSummary(): CostSummary;

  /** Resets all tracked data. */
  reset(): void;

  /** Sets a budget cap and optional alert callback. */
  setBudget(maxCostUsd: number, onAlert?: BudgetAlertCallback): void;
}

/**
 * Pricing per 1M tokens: [inputCostUsd, outputCostUsd].
 *
 * Pricing sourced from public model pricing pages as of early 2026.
 * Models not listed here default to zero (conservative: no false charges).
 */
interface ModelPricing {
  input: number;
  output: number;
}

/** Known model pricing per 1M tokens. */
const MODEL_PRICING: Map<string, ModelPricing> = new Map([
  // Gemini
  ['gemini-2.5-pro', {input: 1.25, output: 10.0}],
  ['gemini-2.5-flash', {input: 0.15, output: 0.60}],
  ['gemini-2.5-flash-lite', {input: 0.075, output: 0.30}],
  ['gemini-2.0-flash', {input: 0.10, output: 0.40}],
  ['gemini-1.5-pro', {input: 1.25, output: 5.0}],
  ['gemini-1.5-flash', {input: 0.075, output: 0.30}],

  // Anthropic
  ['claude-sonnet-4-20250514', {input: 3.0, output: 15.0}],
  ['claude-opus-4-20250514', {input: 15.0, output: 75.0}],
  ['claude-3-5-sonnet-20241022', {input: 3.0, output: 15.0}],
  ['claude-3-5-haiku-20241022', {input: 0.80, output: 4.0}],

  // OpenAI
  ['gpt-4o', {input: 2.50, output: 10.0}],
  ['gpt-4o-mini', {input: 0.15, output: 0.60}],
  ['gpt-4-turbo', {input: 10.0, output: 30.0}],
  ['o3-mini', {input: 1.10, output: 4.40}],

  // Mistral
  ['mistral-large-latest', {input: 2.0, output: 6.0}],
  ['mistral-small-latest', {input: 0.10, output: 0.30}],
  ['codestral-latest', {input: 0.30, output: 0.90}],

  // Ollama / local — free
  ['ollama', {input: 0, output: 0}],
]);

/**
 * Looks up pricing for a model string.
 *
 * Tries exact match first, then checks if the model string starts with
 * any known model prefix (handles versioned model names). Ollama models
 * are always free.
 */
function lookupPricing(model: string): ModelPricing {
  // Exact match.
  const exact = MODEL_PRICING.get(model);
  if (exact) return exact;

  // Ollama models are always free.
  if (model.startsWith('ollama')) {
    return {input: 0, output: 0};
  }

  // Prefix match for versioned model names.
  for (const [key, pricing] of MODEL_PRICING) {
    if (model.startsWith(key)) {
      return pricing;
    }
  }

  // Unknown model — return zero to avoid false charges.
  return {input: 0, output: 0};
}

/** Computes the cost for a single call given token counts and pricing. */
function computeCost(
  inputTokens: number,
  outputTokens: number,
  pricing: ModelPricing,
): number {
  const inputCost = (inputTokens / 1_000_000) * pricing.input;
  const outputCost = (outputTokens / 1_000_000) * pricing.output;
  return inputCost + outputCost;
}

/**
 * Creates a new cost tracker instance.
 *
 * @returns A CostTracker that accumulates token usage and cost estimates.
 */
export function createCostTracker(): CostTracker {
  let entries: CostEntry[] = [];
  let budgetUsd: number | null = null;
  let alertCallback: BudgetAlertCallback | null = null;
  let alertFired = false;

  function currentTotal(): number {
    return entries.reduce((sum, e) => sum + e.cost, 0);
  }

  return {
    record(response: LLMResponse): void {
      const pricing = lookupPricing(response.model);
      const cost = computeCost(
        response.tokensUsed.input,
        response.tokensUsed.output,
        pricing,
      );

      entries.push({
        model: response.model,
        inputTokens: response.tokensUsed.input,
        outputTokens: response.tokensUsed.output,
        cost,
        timestamp: new Date(),
      });

      // Check budget after recording.
      const total = currentTotal();
      if (budgetUsd !== null && total > budgetUsd && !alertFired) {
        alertFired = true;
        if (alertCallback) {
          alertCallback({
            budgetUsd,
            currentCostUsd: total,
            overage: total - budgetUsd,
          });
        }
      }
    },

    getSummary(): CostSummary {
      let totalInput = 0;
      let totalOutput = 0;
      let totalCost = 0;

      for (const entry of entries) {
        totalInput += entry.inputTokens;
        totalOutput += entry.outputTokens;
        totalCost += entry.cost;
      }

      return {
        totalInputTokens: totalInput,
        totalOutputTokens: totalOutput,
        estimatedCost: totalCost,
        breakdown: [...entries],
      };
    },

    reset(): void {
      entries = [];
      alertFired = false;
    },

    setBudget(maxCostUsd: number, onAlert?: BudgetAlertCallback): void {
      budgetUsd = maxCostUsd;
      alertCallback = onAlert ?? null;
      alertFired = false;
    },
  };
}
