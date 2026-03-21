/**
 * LLM provider abstraction — keeps AugmentaSec model-agnostic.
 *
 * Users assign models to three task-oriented roles, not cost tiers.
 * Each role defines WHAT the model does, not how much it costs:
 *
 *   triage    → high-volume, low-complexity: "Is this finding relevant?"
 *   analysis  → moderate-volume: "Review this endpoint for auth gaps"
 *   reasoning → low-volume, high-complexity: "Generate a threat model"
 *
 * Configuration lives in .augmenta-sec/config.yaml under the `llm` key.
 * See config.example.yaml for all options and examples.
 */

/** The three task-oriented roles that drive model selection. */
export type LLMRole = 'triage' | 'analysis' | 'reasoning';

export interface LLMCapabilities {
  maxContextTokens: number;
  supportsImages: boolean;
  supportsStructuredOutput: boolean;
}

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMResponse {
  content: string;
  tokensUsed: {input: number; output: number};
  model: string;
  role: LLMRole;
}

export interface LLMProvider {
  name: string;
  model: string;
  capabilities: LLMCapabilities;

  /** Free-form analysis with context. */
  analyze(messages: LLMMessage[]): Promise<LLMResponse>;

  /** Structured output — returns parsed JSON conforming to the schema hint. */
  analyzeStructured<T>(
    messages: LLMMessage[],
    schemaHint: string,
  ): Promise<T>;
}

/**
 * Routes tasks to the model assigned to each role.
 *
 * The gateway reads role→model mappings from config and instantiates
 * the right provider for each role. Users can assign:
 *   - Same model to all roles (simple)
 *   - Different sizes from one provider (e.g., Gemini Flash Lite / Flash / Pro)
 *   - Different providers per role (e.g., Mistral for analysis, Gemini for reasoning)
 *   - Local models for triage + cloud for reasoning (privacy-sensitive)
 */
export interface LLMGateway {
  getProvider(role: LLMRole): LLMProvider;
  listProviders(): LLMProvider[];
}

/** Maps a model identifier string to its provider and model name. */
export interface ModelMapping {
  provider: string;
  model: string;
}

/** User-facing LLM configuration (from config.yaml). */
export interface LLMConfig {
  triage: string;
  analysis: string;
  reasoning: string;
}
