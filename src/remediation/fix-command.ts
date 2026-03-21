/**
 * ASEC-071: Fix command orchestration.
 *
 * Coordinates the end-to-end fix workflow: load finding, read file,
 * generate fix via LLM, apply to disk, create branch, commit.
 * The CLI command delegates to this module.
 */

import {readFile, writeFile} from 'node:fs/promises';

import type {LLMProvider} from '../providers/llm/types.js';
import type {Finding} from '../findings/types.js';
import {generateFix, type FixSuggestion} from './auto-fix.js';

/** Result of running the fix command. */
export interface FixResult {
  /** The generated fix suggestion. */
  fix: FixSuggestion;
  /** Path to the file that was patched. */
  filePath: string;
  /** Whether the fix was applied to disk. */
  applied: boolean;
}

/**
 * Applies a fix to a file on disk by replacing the original snippet
 * with the fixed snippet.
 *
 * @param filePath - Absolute path to the file.
 * @param fix - The fix suggestion containing original/fixed snippets.
 * @returns True if the replacement was applied, false if the original
 *   snippet was not found in the file.
 */
export async function applyFixToFile(
  filePath: string,
  fix: FixSuggestion,
): Promise<boolean> {
  const content = await readFile(filePath, 'utf-8');

  if (!content.includes(fix.original)) {
    return false;
  }

  const patched = content.replace(fix.original, fix.fixed);
  await writeFile(filePath, patched, 'utf-8');
  return true;
}

/**
 * Runs the full fix workflow for a single finding.
 *
 * Steps:
 * 1. Read the affected file from disk.
 * 2. Generate a fix via the LLM provider.
 * 3. Apply the fix to disk (replace original with fixed code).
 *
 * @param finding - The finding to fix (must have a `file` path).
 * @param provider - The LLM provider for fix generation.
 * @param dryRun - If true, generate but do not apply the fix.
 * @returns The fix result.
 * @throws {Error} if the finding has no file path.
 */
export async function runFixWorkflow(
  finding: Finding,
  provider: LLMProvider,
  dryRun = false,
): Promise<FixResult> {
  if (!finding.file) {
    throw new Error(
      `Finding "${finding.id}" has no file path — cannot generate a fix`,
    );
  }

  const filePath = finding.file;
  const fileContent = await readFile(filePath, 'utf-8');

  const fix = await generateFix(finding, fileContent, provider);

  let applied = false;
  if (!dryRun) {
    applied = await applyFixToFile(filePath, fix);
  }

  return {fix, filePath, applied};
}
