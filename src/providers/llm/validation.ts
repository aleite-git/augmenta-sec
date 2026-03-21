/**
 * LLM response validation — structured output parsing with retry logic.
 *
 * LLMs sometimes return malformed JSON or wrap JSON in markdown code blocks.
 * This module provides utilities to extract, parse, and validate structured
 * responses, with retry support for transient failures.
 */

/** Indicates an LLM response could not be parsed as valid JSON. */
export class LLMValidationError extends Error {
  override readonly name = 'LLMValidationError';

  constructor(
    message: string,
    public readonly rawResponse?: string,
  ) {
    super(message);
  }
}

/** Indicates all retry attempts for an LLM call were exhausted. */
export class LLMRetryExhaustedError extends Error {
  override readonly name = 'LLMRetryExhaustedError';

  constructor(
    public readonly attempts: number,
    public readonly lastError: Error,
  ) {
    super(
      `All ${attempts} attempts failed. Last error: ${lastError.message}`,
    );
  }
}

/** Result of a JSON validation attempt. */
export type ValidationResult<T> =
  | {success: true; data: T}
  | {success: false; error: string};

/** Options for the retry wrapper. */
export interface RetryOptions {
  maxRetries: number;
  backoffMs: number;
}

/**
 * Extracts a JSON string from markdown code blocks.
 *
 * LLMs frequently wrap JSON responses in triple-backtick blocks like:
 * ```json
 * { "key": "value" }
 * ```
 *
 * This function extracts the content. If no code block is found, the
 * original text is returned as-is (it may already be raw JSON).
 */
export function extractJsonFromMarkdown(text: string): string {
  // Match ```json ... ``` or ``` ... ``` (with or without language tag).
  const codeBlockRegex = /```(?:json)?\s*\n?([\s\S]*?)```/;
  const match = codeBlockRegex.exec(text);
  if (match) {
    return match[1].trim();
  }
  return text.trim();
}

/**
 * Validates that a raw LLM response is parseable JSON.
 *
 * Attempts to extract JSON from markdown code blocks first, then parses.
 * The `schemaHint` parameter is included in error messages to help
 * identify which schema the response was expected to match.
 *
 * @param raw - The raw LLM response string.
 * @param schemaHint - A human-readable description of the expected schema.
 * @returns A discriminated union indicating success or failure.
 */
export function validateJsonResponse<T>(
  raw: string,
  schemaHint: string,
): ValidationResult<T> {
  const extracted = extractJsonFromMarkdown(raw);

  if (!extracted) {
    return {
      success: false,
      error: `Empty response; expected JSON matching: ${schemaHint}`,
    };
  }

  try {
    const data = JSON.parse(extracted) as T;
    return {success: true, data};
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Unknown parse error';
    return {
      success: false,
      error: `Invalid JSON for schema "${schemaHint}": ${message}`,
    };
  }
}

/**
 * Generic retry wrapper with exponential backoff.
 *
 * Calls `fn` up to `1 + maxRetries` times total. On failure, waits
 * `backoffMs * 2^attempt` milliseconds before the next attempt.
 *
 * @throws {LLMRetryExhaustedError} if all attempts fail.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions,
): Promise<T> {
  const {maxRetries, backoffMs} = options;
  let lastError: Error = new Error('No attempts made');

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      if (attempt < maxRetries) {
        const delay = backoffMs * 2 ** attempt;
        await sleep(delay);
      }
    }
  }

  throw new LLMRetryExhaustedError(maxRetries + 1, lastError);
}

/** Promise-based sleep for backoff delays. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
