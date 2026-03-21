/**
 * LLM Gateway — routes tasks to the right provider based on role config.
 *
 * Parses "provider/model" strings from the user's LLM configuration and
 * maps each role (triage/analysis/reasoning) to a concrete LLMProvider
 * instance from the providers map.
 */

import type {
  LLMConfig,
  LLMGateway,
  LLMProvider,
  LLMRole,
  ModelMapping,
} from './types.js';

/**
 * Parses a model identifier string like "gemini/gemini-2.5-flash" into its
 * provider and model components.
 *
 * @throws {Error} if the string doesn't contain a slash separator.
 */
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

/**
 * Creates an LLM gateway that routes each role to the appropriate provider.
 *
 * @param config - Role-to-model mappings (e.g. `{ triage: "gemini/gemini-2.5-flash" }`)
 * @param providers - Map of provider name to LLMProvider instance
 * @throws {Error} if a configured provider name isn't found in the providers map
 */
export function createGateway(
  config: LLMConfig,
  providers: Map<string, LLMProvider>,
): LLMGateway {
  const roleMap = new Map<LLMRole, LLMProvider>();

  const roles: LLMRole[] = ['triage', 'analysis', 'reasoning'];
  for (const role of roles) {
    const mapping = parseModelString(config[role]);
    const provider = providers.get(mapping.provider);
    if (!provider) {
      throw new Error(
        `Provider "${mapping.provider}" not found for role "${role}". ` +
          `Available providers: ${[...providers.keys()].join(', ')}`,
      );
    }
    roleMap.set(role, provider);
  }

  return {
    getProvider(role: LLMRole): LLMProvider {
      const provider = roleMap.get(role);
      if (!provider) {
        // This shouldn't happen since we validate all roles above, but
        // TypeScript can't prove the map is exhaustive.
        throw new Error(`No provider configured for role "${role}"`);
      }
      return provider;
    },

    listProviders(): LLMProvider[] {
      const seen = new Set<LLMProvider>();
      const unique: LLMProvider[] = [];
      for (const provider of roleMap.values()) {
        if (!seen.has(provider)) {
          seen.add(provider);
          unique.push(provider);
        }
      }
      return unique;
    },
  };
}
