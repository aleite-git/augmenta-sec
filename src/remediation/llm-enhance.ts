/**
 * ASEC-072: LLM-enhanced remediation suggestions.
 *
 * Sends findings to an LLM provider for context-aware enhancement of
 * rule-based suggestions. Batches requests to manage token usage and
 * falls back gracefully on failure.
 */

import type {Finding} from '../findings/types.js';
import type {LLMProvider, LLMRole} from '../providers/llm/types.js';
import type {RemediationSuggestion, EffortLevel} from './engine.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum findings per LLM request to manage token budget. */
const BATCH_SIZE = 10;

// ---------------------------------------------------------------------------
// Prompt construction
// ---------------------------------------------------------------------------

function buildEnhancementPrompt(
  batch: Finding[],
  existing: RemediationSuggestion[],
): string {
  const findingsBlock = batch
    .map(
      (f) =>
        `- ID: ${f.id}\n  Title: ${f.title}\n  Category: ${f.category}\n  Severity: ${f.severity}\n  Description: ${f.description}${f.file ? `\n  File: ${f.file}` : ''}${f.cweId ? `\n  CWE: ${f.cweId}` : ''}`,
    )
    .join('\n\n');

  const existingBlock = existing
    .map(
      (s) =>
        `- FindingID: ${s.findingId}\n  Title: ${s.title}\n  Description: ${s.description}`,
    )
    .join('\n\n');

  return [
    'You are a security remediation expert. Analyze these findings and enhance the existing suggestions with more context-specific advice.',
    '',
    '## Findings',
    findingsBlock,
    '',
    '## Existing suggestions',
    existingBlock || '(none)',
    '',
    '## Instructions',
    'For each finding, provide an enhanced suggestion. Return valid JSON: an array of objects with these fields:',
    '- findingId (string): the finding ID',
    '- title (string): concise remediation title',
    '- description (string): detailed, context-aware remediation description',
    '- effort (string): "low", "medium", or "high"',
    '- priority (number): 0-100 priority score',
    '- codeExample (string, optional): code snippet showing the fix',
    '',
    'Return ONLY the JSON array, no markdown fences or extra text.',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Response parsing
// ---------------------------------------------------------------------------

const VALID_EFFORTS = new Set<EffortLevel>(['low', 'medium', 'high']);

function parseEnhancedSuggestions(raw: string): RemediationSuggestion[] {
  let cleaned = raw.trim();
  // Strip markdown fences
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
    return [];
  }

  if (!Array.isArray(parsed)) return [];

  const results: RemediationSuggestion[] = [];
  for (const item of parsed) {
    if (typeof item !== 'object' || item === null) continue;
    const obj = item as Record<string, unknown>;

    if (typeof obj['findingId'] !== 'string') continue;
    if (typeof obj['title'] !== 'string') continue;
    if (typeof obj['description'] !== 'string') continue;

    const effort = VALID_EFFORTS.has(obj['effort'] as EffortLevel)
      ? (obj['effort'] as EffortLevel)
      : 'medium';
    const priority =
      typeof obj['priority'] === 'number'
        ? Math.max(0, Math.min(100, obj['priority']))
        : 50;
    const codeExample =
      typeof obj['codeExample'] === 'string' ? obj['codeExample'] : undefined;

    results.push({
      findingId: obj['findingId'],
      title: obj['title'],
      description: obj['description'],
      effort,
      priority,
      codeExample,
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Batching
// ---------------------------------------------------------------------------

function batchArray<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Enhances rule-based suggestions by sending findings to an LLM provider.
 *
 * - Batches findings (max {@link BATCH_SIZE} per request).
 * - Merges LLM suggestions with rule-based ones; LLM overrides when
 *   both exist for the same findingId.
 * - Falls back to rule-based suggestions if the LLM call fails.
 *
 * @param suggestions - Existing rule-based suggestions.
 * @param findings    - The original scan findings.
 * @param provider    - LLM provider to call.
 * @returns Merged suggestion list.
 */
export async function enhanceWithLLM(
  suggestions: RemediationSuggestion[],
  findings: Finding[],
  provider: LLMProvider,
): Promise<RemediationSuggestion[]> {
  const batches = batchArray(findings, BATCH_SIZE);
  const enhanced: RemediationSuggestion[] = [];

  for (const batch of batches) {
    const batchFindingIds = new Set(batch.map((f) => f.id));
    const relevantSuggestions = suggestions.filter((s) =>
      batchFindingIds.has(s.findingId),
    );

    const prompt = buildEnhancementPrompt(batch, relevantSuggestions);

    try {
      const response = await provider.analyze([
        {role: 'user', content: prompt},
      ]);
      const parsed = parseEnhancedSuggestions(response.content);
      enhanced.push(...parsed);
    } catch {
      // Batch failed — keep existing rule-based suggestions for this batch
    }
  }

  // If no LLM suggestions were produced, return originals unchanged
  if (enhanced.length === 0) {
    return [...suggestions];
  }

  // Merge: LLM suggestions override rule-based by findingId
  const llmByFindingId = new Map<string, RemediationSuggestion>();
  for (const s of enhanced) {
    llmByFindingId.set(s.findingId, s);
  }

  const merged: RemediationSuggestion[] = [];
  const seenFindingIds = new Set<string>();

  // First pass: replace rule-based with LLM where available
  for (const s of suggestions) {
    if (llmByFindingId.has(s.findingId) && !seenFindingIds.has(s.findingId)) {
      merged.push(llmByFindingId.get(s.findingId)!);
      seenFindingIds.add(s.findingId);
    } else if (!seenFindingIds.has(s.findingId)) {
      merged.push(s);
      seenFindingIds.add(s.findingId);
    }
  }

  // Second pass: add LLM suggestions for findings with no rule-based match
  for (const s of enhanced) {
    if (!seenFindingIds.has(s.findingId)) {
      merged.push(s);
      seenFindingIds.add(s.findingId);
    }
  }

  return merged;
}
