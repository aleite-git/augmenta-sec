/**
 * Diff-aware security analysis (ASEC-044).
 *
 * Sends changed code hunks to the LLM for security review, skipping
 * non-code files and batching small files to reduce API calls.
 */

import type {Diff, DiffFile} from '../providers/git-platform/types.js';
import type {LLMProvider} from '../providers/llm/types.js';
import type {Finding} from '../findings/types.js';
import {createFinding} from '../findings/types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Extensions considered code files worth analyzing. */
const CODE_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.py',
  '.rb',
  '.go',
  '.rs',
  '.java',
  '.kt',
  '.cs',
  '.c',
  '.cpp',
  '.h',
  '.hpp',
  '.php',
  '.swift',
  '.scala',
  '.sh',
  '.bash',
  '.zsh',
  '.yaml',
  '.yml',
  '.json',
  '.toml',
  '.tf',
  '.hcl',
  '.sql',
  '.graphql',
  '.gql',
  '.proto',
  '.dockerfile',
]);

/**
 * Maximum combined line count for a batch of small files.
 * Files exceeding this individually are analyzed one at a time.
 */
const BATCH_LINE_LIMIT = 300;

/** Filenames (case-insensitive) always treated as code regardless of ext. */
const CODE_FILENAMES = new Set([
  'dockerfile',
  'makefile',
  'jenkinsfile',
  'gemfile',
  'rakefile',
  'vagrantfile',
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extOf(path: string): string {
  const dot = path.lastIndexOf('.');
  return dot === -1 ? '' : path.slice(dot).toLowerCase();
}

function basenameOf(path: string): string {
  const slash = path.lastIndexOf('/');
  return (slash === -1 ? path : path.slice(slash + 1)).toLowerCase();
}

function patchLineCount(patch: string): number {
  return patch.split('\n').length;
}

/** Returns `true` when the file is a code file worth analyzing. */
export function isCodeFile(path: string): boolean {
  return (
    CODE_EXTENSIONS.has(extOf(path)) || CODE_FILENAMES.has(basenameOf(path))
  );
}

function buildPrompt(files: DiffFile[]): string {
  const fileBlocks = files
    .map(
      (f) =>
        `--- ${f.path} (${f.status}) ---\n${f.patch ?? '(no patch content)'}`,
    )
    .join('\n\n');

  return [
    'You are a senior application security engineer reviewing a pull request diff.',
    'Analyze the following code changes for security vulnerabilities.',
    '',
    'For each finding, respond with a JSON array of objects with these fields:',
    '  - file: string (file path)',
    '  - line: number (approximate line in the diff)',
    '  - severity: "critical" | "high" | "medium" | "low" | "informational"',
    '  - category: string (e.g. "injection", "auth", "pii", "crypto", "config")',
    '  - title: string (short title)',
    '  - description: string (detailed explanation)',
    '  - suggestedFix: string (remediation advice)',
    '  - cweId: string | null (e.g. "CWE-79")',
    '  - confidence: number (0-1)',
    '',
    'If there are no security findings, return an empty array: []',
    '',
    'Code changes:',
    fileBlocks,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Raw LLM finding shape
// ---------------------------------------------------------------------------

interface RawLLMFinding {
  file: string;
  line: number;
  severity: string;
  category: string;
  title: string;
  description: string;
  suggestedFix?: string;
  cweId?: string | null;
  confidence: number;
}

function isRawFinding(v: unknown): v is RawLLMFinding {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  return (
    typeof obj['file'] === 'string' &&
    typeof obj['line'] === 'number' &&
    typeof obj['severity'] === 'string' &&
    typeof obj['category'] === 'string' &&
    typeof obj['title'] === 'string' &&
    typeof obj['description'] === 'string' &&
    typeof obj['confidence'] === 'number'
  );
}

const VALID_SEVERITIES = new Set([
  'critical',
  'high',
  'medium',
  'low',
  'informational',
]);

function normalizeSeverity(s: string): Finding['severity'] {
  const lower = s.toLowerCase();
  if (VALID_SEVERITIES.has(lower)) {
    return lower as Finding['severity'];
  }
  return 'medium';
}

function toFinding(raw: RawLLMFinding): Finding {
  const severity = normalizeSeverity(raw.severity);
  return createFinding({
    source: 'llm',
    category: raw.category,
    severity,
    rawSeverity: severity,
    title: raw.title,
    description: raw.description,
    file: raw.file,
    line: raw.line,
    confidence: Math.max(0, Math.min(1, raw.confidence)),
    cweId: raw.cweId ?? undefined,
    suggestedFix: raw.suggestedFix,
  });
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/** Extracts a JSON array from an LLM response that may contain markdown. */
export function parseFindings(responseText: string): RawLLMFinding[] {
  let text = responseText.trim();

  const fenceMatch = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  if (fenceMatch) {
    text = fenceMatch[1].trim();
  }

  try {
    const parsed: unknown = JSON.parse(text);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isRawFinding);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Analyzes a PR diff for security issues using the given LLM provider.
 *
 * - Skips non-code files (images, docs, lockfiles, etc.)
 * - Skips deleted files (no new code to review)
 * - Batches small files together to reduce LLM calls
 * - Sends large files individually
 */
export async function analyzeDiff(
  diff: Diff,
  provider: LLMProvider,
): Promise<Finding[]> {
  const codeFiles = diff.files.filter(
    (f) => f.status !== 'deleted' && f.patch && isCodeFile(f.path),
  );

  if (codeFiles.length === 0) return [];

  const batches: DiffFile[][] = [];
  let currentBatch: DiffFile[] = [];
  let currentLines = 0;

  for (const file of codeFiles) {
    const lines = file.patch ? patchLineCount(file.patch) : 0;

    if (lines > BATCH_LINE_LIMIT) {
      if (currentBatch.length > 0) {
        batches.push(currentBatch);
        currentBatch = [];
        currentLines = 0;
      }
      batches.push([file]);
      continue;
    }

    if (currentLines + lines > BATCH_LINE_LIMIT && currentBatch.length > 0) {
      batches.push(currentBatch);
      currentBatch = [];
      currentLines = 0;
    }

    currentBatch.push(file);
    currentLines += lines;
  }

  if (currentBatch.length > 0) {
    batches.push(currentBatch);
  }

  const allFindings: Finding[] = [];

  for (const batch of batches) {
    const prompt = buildPrompt(batch);
    const response = await provider.analyze([
      {role: 'user', content: prompt},
    ]);

    const rawFindings = parseFindings(response.content);
    for (const raw of rawFindings) {
      allFindings.push(toFinding(raw));
    }
  }

  return allFindings;
}
