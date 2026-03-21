/**
 * OpenAI LLM provider — implements the LLMProvider interface
 * using the openai SDK.
 *
 * Supports gpt-4o, gpt-4o-mini, and gpt-4-turbo with automatic
 * capability detection based on model name.
 */

import OpenAI from 'openai';
import type {
  LLMCapabilities,
  LLMMessage,
  LLMProvider,
  LLMResponse,
  LLMRole,
} from './types.js';

/** Error thrown when the OpenAI provider encounters a failure. */
export class OpenAIProviderError extends Error {
  readonly provider = 'openai';

  constructor(message: string, cause?: Error) {
    super(message);
    this.name = 'OpenAIProviderError';
    if (cause) {
      this.cause = cause;
    }
  }
}

/** Returns capabilities for a given OpenAI model. */
function getCapabilities(model: string): LLMCapabilities {
  switch (model) {
    case 'gpt-4o':
    case 'gpt-4o-mini':
    case 'gpt-4-turbo':
      return {
        maxContextTokens: 128_000,
        supportsImages: true,
        supportsStructuredOutput: true,
      };
    default:
      // Sensible defaults for unknown models — callers can still use them.
      return {
        maxContextTokens: 128_000,
        supportsImages: true,
        supportsStructuredOutput: true,
      };
  }
}

/**
 * Converts our LLMMessage[] format into the OpenAI SDK's expected shape.
 *
 * OpenAI messages map directly: system/user/assistant roles work as-is.
 */
function toOpenAIMessages(
  messages: LLMMessage[],
): Array<{role: 'system' | 'user' | 'assistant'; content: string}> {
  return messages.map(msg => ({
    role: msg.role,
    content: msg.content,
  }));
}

/**
 * Creates an OpenAI LLM provider.
 *
 * @param model - The OpenAI model name (e.g. "gpt-4o")
 * @param apiKey - The OpenAI API key (typically from OPENAI_API_KEY env var)
 */
export function createOpenAIProvider(
  model: string,
  apiKey: string,
): LLMProvider {
  const client = new OpenAI({apiKey});
  const capabilities = getCapabilities(model);

  return {
    name: 'openai',
    model,
    capabilities,

    async analyze(messages: LLMMessage[]): Promise<LLMResponse> {
      const openaiMessages = toOpenAIMessages(messages);

      try {
        const response = await client.chat.completions.create({
          model,
          messages: openaiMessages,
        });

        const content = response.choices[0]?.message?.content ?? '';
        const usage = response.usage;

        return {
          content,
          tokensUsed: {
            input: usage?.prompt_tokens ?? 0,
            output: usage?.completion_tokens ?? 0,
          },
          model,
          // Role is set by the gateway layer; default to 'analysis'.
          role: 'analysis' as LLMRole,
        };
      } catch (error) {
        throw new OpenAIProviderError(
          `OpenAI API error: ${error instanceof Error ? error.message : String(error)}`,
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

      const openaiMessages = toOpenAIMessages(augmentedMessages);

      try {
        const response = await client.chat.completions.create({
          model,
          messages: openaiMessages,
          response_format: {type: 'json_object'},
        });

        const text = response.choices[0]?.message?.content ?? '';

        return JSON.parse(text) as T;
      } catch (error) {
        if (error instanceof SyntaxError) {
          throw new OpenAIProviderError(
            `Failed to parse OpenAI JSON response: ${error.message}`,
            error,
          );
        }
        throw new OpenAIProviderError(
          `OpenAI API error: ${error instanceof Error ? error.message : String(error)}`,
          error instanceof Error ? error : undefined,
        );
      }
    },
  };
}
