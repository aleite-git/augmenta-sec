/**
 * LLM Gateway — routes tasks to the right provider based on role config.
 *
 * Manages multiple LLM providers and routes analysis requests to the
 * appropriate provider based on role (triage/analysis/reasoning).
 * Supports fallback chains and token budget tracking per request.
 */

import type {
  LLMConfig,
  LLMGateway,
  LLMMessage,
  LLMProvider,
  LLMResponse,
  LLMRole,
  ModelMapping,
} from './types.js';

/** Options for the `analyze()` method. */
export interface AnalyzeOptions {
  /** The task role that determines which provider to use. */
  role?: LLMRole;
  /** Maximum total tokens (input + output) allowed for this request. */
  tokenBudget?: number;
}

/** Tracks token usage across requests within a gateway instance. */
export interface TokenBudgetTracker {
  /** Total input tokens consumed across all requests. */
  totalInputTokens: number;
  /** Total output tokens consumed across all requests. */
  totalOutputTokens: number;
  /** Number of requests made. */
  requestCount: number;
}

/** Error thrown when a token budget is exceeded. */
export class TokenBudgetExceededError extends Error {
  constructor(budget: number, actual: number) {
    super(`Token budget exceeded: used ${actual} tokens, budget was ${budget}`);
    this.name = 'TokenBudgetExceededError';
  }
}

/** Error thrown when all providers in a fallback chain fail. */
export class AllProvidersFailedError extends Error {
  readonly errors: Error[];

  constructor(role: LLMRole, errors: Error[]) {
    const summary = errors.map((e, i) => `  [${i}] ${e.message}`).join('\n');
    super(`All providers failed for role "${role}":\n${summary}`);
    this.name = 'AllProvidersFailedError';
    this.errors = errors;
  }
}

export function parseModelString(modelString: string): ModelMapping {
  const slashIndex = modelString.indexOf('/');
  if (slashIndex === -1) {
    throw new Error(
      `Invalid model string "${modelString}": expected format "provider/model-name"`,
    );
  }
  return {
    provider: modelString.substring(0, slashIndex),
    model: modelString.substring(slashIndex + 1),
  };
}

export type FallbackConfig = Partial<Record<LLMRole, string[]>>;

export interface GatewayOptions {
  fallbacks?: FallbackConfig;
}

export interface ExtendedLLMGateway extends LLMGateway {
  registerProvider(name: string, provider: LLMProvider): void;
  analyze(messages: LLMMessage[], options?: AnalyzeOptions): Promise<LLMResponse>;
  getTokenTracker(): TokenBudgetTracker;
  resetTokenTracker(): void;
}

export function createGateway(
  config: LLMConfig,
  providers: Map<string, LLMProvider>,
  options?: GatewayOptions,
): ExtendedLLMGateway {
  const providerRegistry = new Map(providers);
  const roleMap = new Map<LLMRole, LLMProvider>();
  const fallbacks = options?.fallbacks ?? {};
  const tracker: TokenBudgetTracker = {totalInputTokens: 0, totalOutputTokens: 0, requestCount: 0};

  const roles: LLMRole[] = ['triage', 'analysis', 'reasoning'];
  for (const role of roles) {
    const mapping = parseModelString(config[role]);
    const provider = providerRegistry.get(mapping.provider);
    if (!provider) {
      throw new Error(
        `Provider "${mapping.provider}" not found for role "${role}". ` +
          `Available providers: ${[...providerRegistry.keys()].join(', ')}`,
      );
    }
    roleMap.set(role, provider);
  }

  function getFallbackChain(role: LLMRole): LLMProvider[] {
    const primary = roleMap.get(role);
    if (!primary) throw new Error(`No provider configured for role "${role}"`);
    const chain: LLMProvider[] = [primary];
    const names = fallbacks[role];
    if (names) {
      for (const n of names) {
        const fb = providerRegistry.get(n);
        if (fb && fb !== primary) chain.push(fb);
      }
    }
    return chain;
  }

  return {
    getProvider(role: LLMRole): LLMProvider {
      const p = roleMap.get(role);
      if (!p) throw new Error(`No provider configured for role "${role}"`);
      return p;
    },
    listProviders(): LLMProvider[] {
      const seen = new Set<LLMProvider>();
      const unique: LLMProvider[] = [];
      for (const p of providerRegistry.values()) {
        if (!seen.has(p)) { seen.add(p); unique.push(p); }
      }
      return unique;
    },
    registerProvider(name: string, provider: LLMProvider): void {
      providerRegistry.set(name, provider);
    },
    async analyze(messages: LLMMessage[], ao?: AnalyzeOptions): Promise<LLMResponse> {
      const role: LLMRole = ao?.role ?? 'analysis';
      const tokenBudget = ao?.tokenBudget;
      const chain = getFallbackChain(role);
      const errors: Error[] = [];
      for (const provider of chain) {
        try {
          const response = await provider.analyze(messages);
          const rr: LLMResponse = {...response, role};
          const total = rr.tokensUsed.input + rr.tokensUsed.output;
          if (tokenBudget !== undefined && total > tokenBudget) {
            throw new TokenBudgetExceededError(tokenBudget, total);
          }
          tracker.totalInputTokens += rr.tokensUsed.input;
          tracker.totalOutputTokens += rr.tokensUsed.output;
          tracker.requestCount += 1;
          return rr;
        } catch (error) {
          if (error instanceof TokenBudgetExceededError) throw error;
          errors.push(error instanceof Error ? error : new Error(String(error)));
        }
      }
      throw new AllProvidersFailedError(role, errors);
    },
    getTokenTracker(): TokenBudgetTracker { return {...tracker}; },
    resetTokenTracker(): void {
      tracker.totalInputTokens = 0;
      tracker.totalOutputTokens = 0;
      tracker.requestCount = 0;
    },
  };
}
