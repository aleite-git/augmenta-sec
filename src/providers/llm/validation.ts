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

/** Minimal Zod-like schema interface. */
interface SchemaLike<T> {
  safeParse(data: unknown):
    | {success: true; data: T}
    | {success: false; error: {issues: Array<{path: Array<string | number>; message: string}>}};
}

/**
 * Parses a JSON response from an LLM, handling markdown code fences and partial JSON.
 */
export function parseJsonResponse<T>(text: string): T {
  const extracted = extractJsonFromMarkdown(text);
  if (!extracted) throw new LLMValidationError('Empty response', text);
  try { return JSON.parse(extracted) as T; } catch { /* fall through */ }
  const firstBrace = extracted.indexOf('{');
  const firstBracket = extracted.indexOf('[');
  let start = -1;
  let endChar = '';
  if (firstBrace >= 0 && (firstBracket < 0 || firstBrace < firstBracket)) { start = firstBrace; endChar = '}'; }
  else if (firstBracket >= 0) { start = firstBracket; endChar = ']'; }
  if (start >= 0) {
    const lastEnd = extracted.lastIndexOf(endChar);
    if (lastEnd > start) {
      const candidate = extracted.slice(start, lastEnd + 1);
      try { return JSON.parse(candidate) as T; } catch { /* no recovery */ }
    }
  }
  throw new LLMValidationError('Failed to parse JSON from LLM response: ' + extracted.slice(0, 100), text);
}

/**
 * Validates an LLM response against a Zod-compatible schema.
 */
export function validateResponse<T>(response: string, schema: SchemaLike<T>): ValidationResult<T> {
  let parsed: unknown;
  try { parsed = parseJsonResponse(response); }
  catch (err) { return {success: false, error: err instanceof LLMValidationError ? err.message : String(err)}; }
  const result = schema.safeParse(parsed);
  if (result.success) return {success: true, data: result.data};
  const issues = result.error.issues.map((i) => i.path.join('.') + ': ' + i.message).join('; ');
  return {success: false, error: 'Schema validation failed: ' + issues};
}

/**
 * Retries an async function that produces a validated result.
 */
export async function retryWithValidation<T>(
  fn: () => Promise<string>,
  schema: SchemaLike<T>,
  maxRetries: number = 2,
): Promise<T> {
  let lastError: Error = new Error('No attempts made');
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const raw = await fn();
      const result = validateResponse(raw, schema);
      if (result.success) return result.data;
      lastError = new LLMValidationError(result.error, raw);
    } catch (err) { lastError = err instanceof Error ? err : new Error(String(err)); }
    if (attempt < maxRetries) { const delay = 100 * 2 ** attempt; await sleep(delay); }
  }
  throw new LLMRetryExhaustedError(maxRetries + 1, lastError);
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
