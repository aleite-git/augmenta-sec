/**
 * Anthropic LLM provider -- implements the LLMProvider interface
 * using the @anthropic-ai/sdk.
 *
 * Supports claude-sonnet-4-20250514, claude-haiku-4-20250414, and
 * claude-opus-4-20250514 with automatic capability detection based on
 * model name.
 */

import Anthropic from '@anthropic-ai/sdk';
import type {
  LLMCapabilities,
  LLMMessage,
  LLMProvider,
  LLMResponse,
  LLMRole,
} from './types.js';

/** Error thrown when the Anthropic provider encounters a failure. */
export class AnthropicProviderError extends Error {
  readonly provider = 'anthropic';

  constructor(message: string, cause?: Error) {
    super(message);
    this.name = 'AnthropicProviderError';
    if (cause) {
      this.cause = cause;
    }
  }
}

/** Returns capabilities for a given Anthropic model. */
function getCapabilities(model: string): LLMCapabilities {
  switch (model) {
    case 'claude-sonnet-4-20250514':
    case 'claude-haiku-4-20250414':
    case 'claude-opus-4-20250514':
      return {
        maxContextTokens: 200_000,
        supportsImages: true,
        supportsStructuredOutput: true,
      };
    default:
      // Sensible defaults for unknown models -- callers can still use them.
      return {
        maxContextTokens: 200_000,
        supportsImages: true,
        supportsStructuredOutput: true,
      };
  }
}

/**
 * Converts our LLMMessage[] format into the Anthropic SDK's expected shape.
 *
 * Anthropic treats system instructions as a separate top-level parameter,
 * not as part of the messages array. User/assistant messages map directly.
 */
function toAnthropicMessages(messages: LLMMessage[]): {
  system: string | undefined;
  messages: Array<{role: 'user' | 'assistant'; content: string}>;
} {
  let system: string | undefined;
  const anthropicMessages: Array<{
    role: 'user' | 'assistant';
    content: string;
  }> = [];

  for (const msg of messages) {
    if (msg.role === 'system') {
      // Anthropic supports one system parameter; concatenate if multiple.
      system = system ? `${system}\n\n${msg.content}` : msg.content;
    } else {
      anthropicMessages.push({
        role: msg.role,
        content: msg.content,
      });
    }
  }

  return {system, messages: anthropicMessages};
}

/** Default max_tokens for Anthropic API calls. */
const DEFAULT_MAX_TOKENS = 4096;

/**
 * Creates an Anthropic LLM provider.
 *
 * @param model - The Anthropic model name (e.g. "claude-sonnet-4-20250514")
 * @param apiKey - The Anthropic API key (typically from ANTHROPIC_API_KEY env var)
 */
export function createAnthropicProvider(
  model: string,
  apiKey: string,
): LLMProvider {
  const client = new Anthropic({apiKey});
  const capabilities = getCapabilities(model);

  return {
    name: 'anthropic',
    model,
    capabilities,

    async analyze(messages: LLMMessage[]): Promise<LLMResponse> {
      const {system, messages: anthropicMessages} =
        toAnthropicMessages(messages);

      try {
        const response = await client.messages.create({
          model,
          max_tokens: DEFAULT_MAX_TOKENS,
          ...(system ? {system} : {}),
          messages: anthropicMessages,
        });

        // Extract text from content blocks.
        const text = (response.content as Array<{type: string; text?: string}>)
          .filter((block) => block.type === 'text')
          .map((block) => block.text ?? '')
          .join('');

        return {
          content: text,
          tokensUsed: {
            input: response.usage.input_tokens,
            output: response.usage.output_tokens,
          },
          model,
          // Role is set by the gateway layer; default to 'analysis'.
          role: 'analysis' as LLMRole,
        };
      } catch (error) {
        throw new AnthropicProviderError(
          `Anthropic API error: ${error instanceof Error ? error.message : String(error)}`,
          error instanceof Error ? error : undefined,
        );
      }
    },

    async analyzeStructured<T>(
      messages: LLMMessage[],
      schemaHint: string,
    ): Promise<T> {
      // Inject the schema hint into the system prompt so the model
      // knows what JSON shape to produce.
      const augmentedMessages: LLMMessage[] = [];
      let hasSystem = false;

      for (const msg of messages) {
        if (msg.role === 'system') {
          hasSystem = true;
          augmentedMessages.push({
            ...msg,
            content: `${msg.content}\n\nRespond with valid JSON matching this schema:\n${schemaHint}`,
          });
        } else {
          augmentedMessages.push(msg);
        }
      }

      // If no system message existed, prepend one with the schema hint.
      if (!hasSystem) {
        augmentedMessages.unshift({
          role: 'system',
          content: `Respond with valid JSON matching this schema:\n${schemaHint}`,
        });
      }

      const {system, messages: anthropicMessages} =
        toAnthropicMessages(augmentedMessages);

      try {
        const response = await client.messages.create({
          model,
          max_tokens: DEFAULT_MAX_TOKENS,
          ...(system ? {system} : {}),
          messages: anthropicMessages,
        });

        // Extract text from content blocks.
        const text = (response.content as Array<{type: string; text?: string}>)
          .filter((block) => block.type === 'text')
          .map((block) => block.text ?? '')
          .join('');

        return JSON.parse(text) as T;
      } catch (error) {
        if (error instanceof SyntaxError) {
          throw new AnthropicProviderError(
            `Failed to parse Anthropic JSON response: ${error.message}`,
            error,
          );
        }
        throw new AnthropicProviderError(
          `Anthropic API error: ${error instanceof Error ? error.message : String(error)}`,
          error instanceof Error ? error : undefined,
        );
      }
    },
  };
}
