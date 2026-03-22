/**
 * Mistral AI LLM provider — implements the LLMProvider interface
 * using the fetch API (no SDK dependency).
 *
 * Supports mistral-large-latest, codestral-latest.
 * Endpoint: https://api.mistral.ai/v1/chat/completions
 */

import type {
  LLMCapabilities,
  LLMMessage,
  LLMProvider,
  LLMResponse,
  LLMRole,
} from './types.js';

const MISTRAL_API_URL = 'https://api.mistral.ai/v1/chat/completions';

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

interface MistralApiResponse {
  choices?: Array<{index: number; message?: {content?: string}; finish_reason?: string}>;
  usage?: {prompt_tokens?: number; completion_tokens?: number};
}

function getCapabilities(model: string): LLMCapabilities {
  switch (model) {
    case 'mistral-large-latest':
      return {maxContextTokens: 128_000, supportsImages: true, supportsStructuredOutput: true};
    case 'mistral-medium-latest':
      return {maxContextTokens: 128_000, supportsImages: false, supportsStructuredOutput: true};
    case 'codestral-latest':
      return {maxContextTokens: 32_000, supportsImages: false, supportsStructuredOutput: true};
    default:
      return {maxContextTokens: 128_000, supportsImages: false, supportsStructuredOutput: true};
  }
}

function toMistralMessages(
  messages: LLMMessage[],
): Array<{role: 'system' | 'user' | 'assistant'; content: string}> {
  return messages.map((msg) => ({role: msg.role, content: msg.content}));
}

async function callMistralApi(
  apiKey: string,
  model: string,
  messages: Array<{role: string; content: string}>,
  responseFormat?: {type: string},
): Promise<MistralApiResponse> {
  const body: Record<string, unknown> = {model, messages};
  if (responseFormat) {
    body.response_format = responseFormat;
  }
  const response = await fetch(MISTRAL_API_URL, {
    method: 'POST',
    headers: {'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}`},
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => 'unknown error');
    throw new Error(`Mistral API returned ${response.status}: ${text}`);
  }
  return (await response.json()) as MistralApiResponse;
}

export function createMistralProvider(model: string, apiKey: string): LLMProvider {
  const capabilities = getCapabilities(model);

  return {
    name: 'mistral',
    model,
    capabilities,

    async analyze(messages: LLMMessage[]): Promise<LLMResponse> {
      try {
        const result = await callMistralApi(apiKey, model, toMistralMessages(messages));
        return {
          content: result.choices?.[0]?.message?.content ?? '',
          tokensUsed: {input: result.usage?.prompt_tokens ?? 0, output: result.usage?.completion_tokens ?? 0},
          model,
          role: 'analysis' as LLMRole,
        };
      } catch (error) {
        throw new MistralProviderError(
          `Mistral API error: ${error instanceof Error ? error.message : String(error)}`,
          error instanceof Error ? error : undefined,
        );
      }
    },

    async analyzeStructured<T>(messages: LLMMessage[], schemaHint: string): Promise<T> {
      const augmented: LLMMessage[] = [];
      let hasSystem = false;
      for (const msg of messages) {
        if (msg.role === 'system') {
          hasSystem = true;
          augmented.push({...msg, content: `${msg.content}\n\nRespond with valid JSON matching this schema:\n${schemaHint}`});
        } else {
          augmented.push(msg);
        }
      }
      if (!hasSystem) {
        augmented.unshift({role: 'system', content: `Respond with valid JSON matching this schema:\n${schemaHint}`});
      }
      try {
        const result = await callMistralApi(apiKey, model, toMistralMessages(augmented), {type: 'json_object'});
        return JSON.parse(result.choices?.[0]?.message?.content ?? '') as T;
      } catch (error) {
        if (error instanceof SyntaxError) {
          throw new MistralProviderError(`Failed to parse Mistral JSON response: ${error.message}`, error);
        }
        throw new MistralProviderError(
          `Mistral API error: ${error instanceof Error ? error.message : String(error)}`,
          error instanceof Error ? error : undefined,
        );
      }
    },
  };
}
