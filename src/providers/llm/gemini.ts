/**
 * Google Gemini LLM provider — implements the LLMProvider interface
 * using the @google/generative-ai SDK.
 *
 * Supports gemini-2.5-pro, gemini-2.5-flash, and gemini-2.5-flash-lite
 * with automatic capability detection based on model name.
 */

import {GoogleGenerativeAI} from '@google/generative-ai';
import type {
  LLMCapabilities,
  LLMMessage,
  LLMProvider,
  LLMResponse,
  LLMRole,
} from './types.js';

/** Error thrown when the Gemini provider encounters a failure. */
export class GeminiProviderError extends Error {
  readonly provider = 'gemini';

  constructor(message: string, cause?: Error) {
    super(message);
    this.name = 'GeminiProviderError';
    if (cause) {
      this.cause = cause;
    }
  }
}

/** Returns capabilities for a given Gemini model. */
function getCapabilities(model: string): LLMCapabilities {
  // All current Gemini 2.5 models share the same caps.
  // Keep this as a switch for easy extension when new models land.
  switch (model) {
    case 'gemini-2.5-pro':
    case 'gemini-2.5-flash':
    case 'gemini-2.5-flash-lite':
      return {
        maxContextTokens: 1_000_000,
        supportsImages: true,
        supportsStructuredOutput: true,
      };
    default:
      // Sensible defaults for unknown models — callers can still use them.
      return {
        maxContextTokens: 1_000_000,
        supportsImages: true,
        supportsStructuredOutput: true,
      };
  }
}

/**
 * Converts our LLMMessage[] format into the Gemini SDK's expected shape.
 *
 * Gemini treats system instructions separately from the conversation
 * history. User/assistant messages map to "user"/"model" roles.
 */
function toGeminiMessages(messages: LLMMessage[]): {
  systemInstruction: string | undefined;
  contents: Array<{role: string; parts: Array<{text: string}>}>;
} {
  let systemInstruction: string | undefined;
  const contents: Array<{role: string; parts: Array<{text: string}>}> = [];

  for (const msg of messages) {
    if (msg.role === 'system') {
      // Gemini supports one system instruction; concatenate if multiple.
      systemInstruction = systemInstruction
        ? `${systemInstruction}\n\n${msg.content}`
        : msg.content;
    } else {
      contents.push({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{text: msg.content}],
      });
    }
  }

  return {systemInstruction, contents};
}

/**
 * Creates a Gemini LLM provider.
 *
 * @param model - The Gemini model name (e.g. "gemini-2.5-flash")
 * @param apiKey - The Gemini API key (typically from GEMINI_API_KEY env var)
 */
export function createGeminiProvider(
  model: string,
  apiKey: string,
): LLMProvider {
  const client = new GoogleGenerativeAI(apiKey);
  const capabilities = getCapabilities(model);

  return {
    name: 'gemini',
    model,
    capabilities,

    async analyze(messages: LLMMessage[]): Promise<LLMResponse> {
      const {systemInstruction, contents} = toGeminiMessages(messages);

      try {
        const generativeModel = client.getGenerativeModel({
          model,
          ...(systemInstruction ? {systemInstruction} : {}),
        });

        const result = await generativeModel.generateContent({contents});
        const response = result.response;
        const text = response.text();
        const usage = response.usageMetadata;

        return {
          content: text,
          tokensUsed: {
            input: usage?.promptTokenCount ?? 0,
            output: usage?.candidatesTokenCount ?? 0,
          },
          model,
          // Role is set by the gateway layer; default to 'analysis'.
          role: 'analysis' as LLMRole,
        };
      } catch (error) {
        throw new GeminiProviderError(
          `Gemini API error: ${error instanceof Error ? error.message : String(error)}`,
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

      const {systemInstruction, contents} = toGeminiMessages(augmentedMessages);

      try {
        const generativeModel = client.getGenerativeModel({
          model,
          ...(systemInstruction ? {systemInstruction} : {}),
          generationConfig: {
            responseMimeType: 'application/json',
          },
        });

        const result = await generativeModel.generateContent({contents});
        const response = result.response;
        const text = response.text();

        return JSON.parse(text) as T;
      } catch (error) {
        if (error instanceof SyntaxError) {
          throw new GeminiProviderError(
            `Failed to parse Gemini JSON response: ${error.message}`,
            error,
          );
        }
        throw new GeminiProviderError(
          `Gemini API error: ${error instanceof Error ? error.message : String(error)}`,
          error instanceof Error ? error : undefined,
        );
      }
    },
  };
}
