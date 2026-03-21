/**
 * Mistral AI LLM provider — implements the LLMProvider interface
 * using the @mistralai/mistralai SDK.
 *
 * Supports mistral-large-latest, mistral-medium-latest, and codestral-latest
 * with automatic capability detection based on model name.
 */

import {Mistral} from '@mistralai/mistralai';
import type {
  LLMCapabilities,
  LLMMessage,
  LLMProvider,
  LLMResponse,
  LLMRole,
} from './types.js';

/** Error thrown when the Mistral provider encounters a failure. */
export class MistralProviderError extends Error {
  readonly provider = 'mistral';

  constructor(message: string, cause?: Error) {
    super(message);
    this.name = 'MistralProviderError';
    if (cause) {
      this.cause = cause;
    }
  }
}

/** Returns capabilities for a given Mistral model. */
function getCapabilities(model: string): LLMCapabilities {
  switch (model) {
    case 'mistral-large-latest':
      return {
        maxContextTokens: 128_000,
        supportsImages: true,
        supportsStructuredOutput: true,
      };
    case 'mistral-medium-latest':
      return {
        maxContextTokens: 128_000,
        supportsImages: false,
        supportsStructuredOutput: true,
      };
    case 'codestral-latest':
      return {
        maxContextTokens: 32_000,
        supportsImages: false,
        supportsStructuredOutput: true,
      };
    default:
      // Sensible defaults for unknown models — callers can still use them.
      return {
        maxContextTokens: 128_000,
        supportsImages: false,
        supportsStructuredOutput: true,
      };
  }
}

/**
 * Converts our LLMMessage[] format into the Mistral SDK's expected shape.
 *
 * Mistral supports system, user, and assistant roles directly — no
 * role remapping is needed.
 */
function toMistralMessages(
  messages: LLMMessage[],
): Array<{role: 'system' | 'user' | 'assistant'; content: string}> {
  return messages.map(msg => ({
    role: msg.role,
    content: msg.content,
  }));
}

/**
 * Creates a Mistral LLM provider.
 *
 * @param model - The Mistral model name (e.g. "mistral-large-latest")
 * @param apiKey - The Mistral API key (typically from MISTRAL_API_KEY env var)
 */
export function createMistralProvider(
  model: string,
  apiKey: string,
): LLMProvider {
  const client = new Mistral({apiKey});
  const capabilities = getCapabilities(model);

  return {
    name: 'mistral',
    model,
    capabilities,

    async analyze(messages: LLMMessage[]): Promise<LLMResponse> {
      const mistralMessages = toMistralMessages(messages);

      try {
        const result = await client.chat.complete({
          model,
          messages: mistralMessages,
        });

        const content = result.choices?.[0]?.message?.content;
        const text = typeof content === 'string' ? content : '';
        const usage = result.usage;

        return {
          content: text,
          tokensUsed: {
            input: usage?.promptTokens ?? 0,
            output: usage?.completionTokens ?? 0,
          },
          model,
          // Role is set by the gateway layer; default to 'analysis'.
          role: 'analysis' as LLMRole,
        };
      } catch (error) {
        throw new MistralProviderError(
          `Mistral API error: ${error instanceof Error ? error.message : String(error)}`,
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

      const mistralMessages = toMistralMessages(augmentedMessages);

      try {
        const result = await client.chat.complete({
          model,
          messages: mistralMessages,
          responseFormat: {type: 'json_object'},
        });

        const content = result.choices?.[0]?.message?.content;
        const text = typeof content === 'string' ? content : '';

        return JSON.parse(text) as T;
      } catch (error) {
        if (error instanceof SyntaxError) {
          throw new MistralProviderError(
            `Failed to parse Mistral JSON response: ${error.message}`,
            error,
          );
        }
        throw new MistralProviderError(
          `Mistral API error: ${error instanceof Error ? error.message : String(error)}`,
          error instanceof Error ? error : undefined,
        );
      }
    },
  };
}
