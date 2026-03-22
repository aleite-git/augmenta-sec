/**
 * Review engine (ASEC-043).
 *
 * Orchestrates a full PR security review: fetch diff, analyze via LLM,
 * filter by config, decide approval, and optionally post comments.
 */

import type {GitPlatform} from '../providers/git-platform/types.js';
import type {LLMProvider} from '../providers/llm/types.js';
import type {AugmentaSecConfig} from '../config/schema.js';
import type {Finding} from '../findings/types.js';
import type {SecurityReview} from '../providers/git-platform/types.js';
import {summarizeFindings, type FindingsSummary} from '../findings/types.js';
import {analyzeDiff} from './diff-analyzer.js';
import {filterByConfig, shouldAutoApprove} from './config.js';
import {formatAsReview} from './formatter.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The result of a full PR review. */
export interface ReviewResult {
  /** All security findings discovered in the diff. */
  findings: Finding[];
  /** Summary statistics for the findings. */
  summary: FindingsSummary;
  /** Whether the review auto-approved the PR. */
  approved: boolean;
  /** List of files that were reviewed. */
  reviewedFiles: string[];
}

/** Parsed PR reference. */
export interface PRRef {
  prNumber: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parses a PR reference string into a structured ref.
 *
 * Accepted formats:
 *   - `42` or `#42` (plain number)
 *   - `https://github.com/owner/repo/pull/42` (full URL)
 */
export function parsePRRef(ref: string): PRRef {
  const cleaned = ref.replace(/^#/, '').trim();

  const asNum = parseInt(cleaned, 10);
  if (!isNaN(asNum) && String(asNum) === cleaned) {
    return {prNumber: asNum};
  }

  const urlMatch = /\/pull\/(\d+)/.exec(ref);
  if (urlMatch) {
    return {prNumber: parseInt(urlMatch[1], 10)};
  }

  throw new Error(
    `Invalid PR reference "${ref}". Expected a number, #number, or pull request URL.`,
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Runs a full security review on a pull request.
 *
 * 1. Fetches the PR metadata and diff from the git platform.
 * 2. Sends changed code to the LLM for analysis.
 * 3. Filters findings by project configuration.
 * 4. Determines auto-approval based on severity thresholds.
 * 5. Optionally posts inline comments and a summary to the PR.
 */
export async function runReview(
  prRef: PRRef,
  platform: GitPlatform,
  provider: LLMProvider,
  config: AugmentaSecConfig,
): Promise<ReviewResult> {
  const prs = await platform.getPullRequests('open');
  const pr = prs.find((p) => p.number === prRef.prNumber);

  if (!pr) {
    throw new Error(`PR #${prRef.prNumber} not found or is not open.`);
  }

  const diff = await platform.getDiff(pr.baseBranch, pr.headBranch);
  const rawFindings = await analyzeDiff(diff, provider);
  const findings = filterByConfig(rawFindings, config);
  const approved = shouldAutoApprove(findings, config);
  const review: SecurityReview = formatAsReview(findings, diff, approved);

  if (config.review.inline_comments || config.review.summary_comment) {
    await platform.commentOnPR(pr.number, review);
  }

  const reviewedFiles = diff.files
    .filter((f) => f.status !== 'deleted')
    .map((f) => f.path);

  return {
    findings,
    summary: summarizeFindings(findings),
    approved,
    reviewedFiles,
  };
}
