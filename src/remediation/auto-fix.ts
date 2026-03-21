/**
 * ASEC-070: Auto-fix generation for security findings.
 *
 * Uses an LLM provider to generate concrete code fixes for findings,
 * returning a structured FixSuggestion with original/fixed code,
 * an explanation, and a confidence score.
 */

import type {LLMProvider} from '../providers/llm/types.js';
import type {Finding} from '../findings/types.js';

/** A suggested fix for a security finding. */
export interface FixSuggestion {
  /** The original source code (or relevant snippet). */
  original: string;
  /** The fixed source code after remediation. */
  fixed: string;
  /** Human-readable explanation of what was changed and why. */
  explanation: string;
  /** Confidence score from 0 (lowest) to 1 (highest). */
  confidence: number;
}

/**
 * Builds the LLM prompt for generating a security fix.
 *
 * Exported for testing; callers should use {@link generateFix}.
 */
export function buildFixPrompt(finding: Finding, fileContent: string): string {
  const parts = [
    'You are a security engineer writing patches for vulnerabilities.',
    '',
    `Vulnerability: ${finding.title}`,
    `Description: ${finding.description}`,
  ];

  if (finding.cweId) {
    parts.push(`CWE: ${finding.cweId}`);
  }
  if (finding.file) {
    parts.push(`File: ${finding.file}`);
  }
  if (finding.line) {
    parts.push(`Line: ${finding.line}`);
  }

  parts.push(
    '',
    'Current file content:',
    '```',
    fileContent,
    '```',
    '',
    'Respond with JSON only (no markdown fences), using this schema:',
    '{',
    '  "original": "<the vulnerable code snippet>",',
    '  "fixed": "<the remediated code snippet>",',
    '  "explanation": "<what was changed and why>",',
    '  "confidence": <0.0 to 1.0>',
    '}',
  );

  return parts.join('\n');
}

/**
 * Parses a raw LLM response string into a {@link FixSuggestion}.
 *
 * Handles common LLM quirks: markdown fences, trailing commas, etc.
 *
 * @throws {Error} if the response cannot be parsed into a valid FixSuggestion.
 */
export function parseFixResponse(raw: string): FixSuggestion {
  // Strip markdown code fences if present.
  let cleaned = raw.trim();
  if (cleaned.startsWith('```')) {
    const firstNewline = cleaned.indexOf('\n');
    cleaned = cleaned.substring(firstNewline + 1);
  }
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.substring(0, cleaned.lastIndexOf('```'));
  }
  cleaned = cleaned.trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(
      `Failed to parse LLM fix response as JSON: ${cleaned.substring(0, 200)}`,
    );
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('LLM fix response is not a JSON object');
  }

  const obj = parsed as Record<string, unknown>;

  if (typeof obj['original'] !== 'string') {
    throw new Error('LLM fix response missing "original" string field');
  }
  if (typeof obj['fixed'] !== 'string') {
    throw new Error('LLM fix response missing "fixed" string field');
  }
  if (typeof obj['explanation'] !== 'string') {
    throw new Error('LLM fix response missing "explanation" string field');
  }

  const confidence =
    typeof obj['confidence'] === 'number' ? obj['confidence'] : 0.5;

  return {
    original: obj['original'] as string,
    fixed: obj['fixed'] as string,
    explanation: obj['explanation'] as string,
    confidence: Math.max(0, Math.min(1, confidence)),
  };
}

/**
 * Generates a code fix for a security finding using an LLM provider.
 *
 * @param finding - The security finding to remediate.
 * @param fileContent - The current content of the affected file.
 * @param provider - The LLM provider to use for fix generation.
 * @returns A promise resolving to a {@link FixSuggestion}.
 */
export async function generateFix(
  finding: Finding,
  fileContent: string,
  provider: LLMProvider,
): Promise<FixSuggestion> {
  const prompt = buildFixPrompt(finding, fileContent);

  const response = await provider.analyze([
    {role: 'user', content: prompt},
  ]);

  return parseFixResponse(response.content);
}
