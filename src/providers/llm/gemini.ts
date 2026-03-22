/**
 * Google Gemini LLM provider — implements the LLMProvider interface
 * using the fetch API (no SDK dependency).
 *
 * Endpoint: https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent
 */

import type {
  LLMCapabilities,
  LLMMessage,
  LLMProvider,
  LLMResponse,
  LLMRole,
} from './types.js';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

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

interface GeminiApiResponse {
  candidates?: Array<{content?: {parts?: Array<{text?: string}>}}>;
  usageMetadata?: {promptTokenCount?: number; candidatesTokenCount?: number};
}

function getCapabilities(model: string): LLMCapabilities {
  switch (model) {
    case 'gemini-2.0-flash':
    case 'gemini-2.0-pro':
    case 'gemini-2.5-pro':
    case 'gemini-2.5-flash':
    case 'gemini-2.5-flash-lite':
      return {maxContextTokens: 1_000_000, supportsImages: true, supportsStructuredOutput: true};
    default:
      return {maxContextTokens: 1_000_000, supportsImages: true, supportsStructuredOutput: true};
  }
}

function toGeminiFormat(messages: LLMMessage[]): {
  systemInstruction?: {parts: Array<{text: string}>};
  contents: Array<{role: string; parts: Array<{text: string}>}>;
} {
  let systemText: string | undefined;
  const contents: Array<{role: string; parts: Array<{text: string}>}> = [];
  for (const msg of messages) {
    if (msg.role === 'system') {
      systemText = systemText ? `${systemText}\n\n${msg.content}` : msg.content;
    } else {
      contents.push({role: msg.role === 'assistant' ? 'model' : 'user', parts: [{text: msg.content}]});
    }
  }
  return {
    ...(systemText ? {systemInstruction: {parts: [{text: systemText}]}} : {}),
    contents,
  };
}

async function callGeminiApi(
  apiKey: string,
  model: string,
  messages: LLMMessage[],
  generationConfig?: Record<string, unknown>,
): Promise<GeminiApiResponse> {
  const url = `${GEMINI_API_BASE}/${model}:generateContent?key=${apiKey}`;
  const {systemInstruction, contents} = toGeminiFormat(messages);
  const body: Record<string, unknown> = {contents};
  if (systemInstruction) body.systemInstruction = systemInstruction;
  if (generationConfig) body.generationConfig = generationConfig;
  const response = await fetch(url, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => 'unknown error');
    throw new Error(`Gemini API returned ${response.status}: ${text}`);
  }
  return (await response.json()) as GeminiApiResponse;
}

function extractText(result: GeminiApiResponse): string {
  const parts = result.candidates?.[0]?.content?.parts;
  if (!parts) return '';
  return parts.map((p) => p.text ?? '').join('');
}

export function createGeminiProvider(model: string, apiKey: string): LLMProvider {
  const capabilities = getCapabilities(model);

  return {
    name: 'gemini',
    model,
    capabilities,

    async analyze(messages: LLMMessage[]): Promise<LLMResponse> {
      try {
        const result = await callGeminiApi(apiKey, model, messages);
        return {
          content: extractText(result),
          tokensUsed: {
            input: result.usageMetadata?.promptTokenCount ?? 0,
            output: result.usageMetadata?.candidatesTokenCount ?? 0,
          },
          model,
          role: 'analysis' as LLMRole,
        };
      } catch (error) {
        throw new GeminiProviderError(
          `Gemini API error: ${error instanceof Error ? error.message : String(error)}`,
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
        const result = await callGeminiApi(apiKey, model, augmented, {responseMimeType: 'application/json'});
        return JSON.parse(extractText(result)) as T;
      } catch (error) {
        if (error instanceof SyntaxError) {
          throw new GeminiProviderError(`Failed to parse Gemini JSON response: ${error.message}`, error);
        }
        throw new GeminiProviderError(
          `Gemini API error: ${error instanceof Error ? error.message : String(error)}`,
          error instanceof Error ? error : undefined,
        );
      }
    },
  };
}
