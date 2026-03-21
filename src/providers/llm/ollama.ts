/**
 * Ollama LLM provider — implements the LLMProvider interface using
 * Ollama's local HTTP API via native fetch (no external SDK needed).
 *
 * Supports any model available in Ollama (e.g. llama3, codellama,
 * mistral, deepseek-coder) and communicates with the Ollama server
 * at http://localhost:11434 by default.
 */

import type {
  LLMCapabilities,
  LLMMessage,
  LLMProvider,
  LLMResponse,
  LLMRole,
} from './types.js';

/** Error thrown when the Ollama provider encounters a failure. */
export class OllamaProviderError extends Error {
  readonly provider = 'ollama';

  constructor(message: string, cause?: Error) {
    super(message);
    this.name = 'OllamaProviderError';
    if (cause) {
      this.cause = cause;
    }
  }
}

/** Shape of a single message sent to the Ollama chat API. */
interface OllamaChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** Shape of the Ollama /api/chat response body (non-streaming). */
interface OllamaChatResponse {
  message: {role: string; content: string};
  eval_count?: number;
  prompt_eval_count?: number;
}

/** Shape of the Ollama /api/tags response body. */
interface OllamaTagsResponse {
  models: Array<{name: string}>;
}

/** Default base URL for a local Ollama instance. */
const DEFAULT_BASE_URL = 'http://localhost:11434';

/**
 * Returns conservative default capabilities for local models.
 *
 * Most local models have limited context compared to cloud providers.
 * Structured output support varies by model, so we default to true
 * (Ollama supports `format: "json"` for most models).
 */
function getCapabilities(): LLMCapabilities {
  return {
    maxContextTokens: 8192,
    supportsImages: false,
    supportsStructuredOutput: true,
  };
}

/**
 * Converts our LLMMessage[] format into the Ollama chat API format.
 *
 * Ollama natively supports system, user, and assistant roles, so
 * the mapping is straightforward (unlike Gemini which needs
 * separate system instruction handling).
 */
function toOllamaMessages(messages: LLMMessage[]): OllamaChatMessage[] {
  return messages.map(msg => ({
    role: msg.role,
    content: msg.content,
  }));
}

/**
 * Checks whether an Ollama server is reachable at the given base URL.
 *
 * Hits GET /api/tags which lists available models. Returns true if
 * the server responds successfully, false otherwise.
 */
export async function isAvailable(
  baseUrl: string = DEFAULT_BASE_URL,
): Promise<boolean> {
  try {
    const response = await fetch(`${baseUrl}/api/tags`);
    if (!response.ok) {
      return false;
    }
    const data = (await response.json()) as OllamaTagsResponse;
    return Array.isArray(data.models);
  } catch {
    return false;
  }
}

/**
 * Creates an Ollama LLM provider.
 *
 * @param model - The Ollama model name (e.g. "llama3", "codellama", "mistral")
 * @param baseUrl - The Ollama server base URL (defaults to http://localhost:11434)
 */
export function createOllamaProvider(
  model: string,
  baseUrl: string = DEFAULT_BASE_URL,
): LLMProvider {
  const capabilities = getCapabilities();

  return {
    name: 'ollama',
    model,
    capabilities,

    async analyze(messages: LLMMessage[]): Promise<LLMResponse> {
      const ollamaMessages = toOllamaMessages(messages);

      try {
        const response = await fetch(`${baseUrl}/api/chat`, {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({
            model,
            messages: ollamaMessages,
            stream: false,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(
            `HTTP ${response.status}: ${errorText || response.statusText}`,
          );
        }

        const data = (await response.json()) as OllamaChatResponse;

        return {
          content: data.message.content,
          tokensUsed: {
            input: data.prompt_eval_count ?? 0,
            output: data.eval_count ?? 0,
          },
          model,
          // Role is set by the gateway layer; default to 'analysis'.
          role: 'analysis' as LLMRole,
        };
      } catch (error) {
        if (error instanceof OllamaProviderError) {
          throw error;
        }
        throw new OllamaProviderError(
          `Ollama API error: ${error instanceof Error ? error.message : String(error)}`,
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

      const ollamaMessages = toOllamaMessages(augmentedMessages);

      try {
        const response = await fetch(`${baseUrl}/api/chat`, {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({
            model,
            messages: ollamaMessages,
            stream: false,
            format: 'json',
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(
            `HTTP ${response.status}: ${errorText || response.statusText}`,
          );
        }

        const data = (await response.json()) as OllamaChatResponse;
        const text = data.message.content;

        return JSON.parse(text) as T;
      } catch (error) {
        if (error instanceof OllamaProviderError) {
          throw error;
        }
        if (error instanceof SyntaxError) {
          throw new OllamaProviderError(
            `Failed to parse Ollama JSON response: ${error.message}`,
            error,
          );
        }
        throw new OllamaProviderError(
          `Ollama API error: ${error instanceof Error ? error.message : String(error)}`,
          error instanceof Error ? error : undefined,
        );
      }
    },
  };
}
