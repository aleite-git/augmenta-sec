/**
 * Batch review: reviews all open PRs on a repository.
 *
 * Iterates over every open PR on the configured git platform, runs the
 * security review pipeline on each, and collects results into a
 * {@link BatchReviewResult}.
 *
 * @module review/batch
 */

import {isAtLeast} from '../findings/severity.js';
import type {
  GitPlatform,
  PullRequest,
  ReviewFinding,
  SecurityReview,
} from '../providers/git-platform/types.js';
import type {Severity} from '../config/schema.js';
import type {
  BatchReviewConfig,
  BatchReviewResult,
  CIPlatform,
  PRReviewResult,
} from './types.js';

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_BATCH_CONFIG: BatchReviewConfig = {
  severityThreshold: 'high',
  autoApprove: false,
  concurrency: 3,
};

// ---------------------------------------------------------------------------
// Single-PR review helper
// ---------------------------------------------------------------------------

/**
 * Builds a {@link SecurityReview} from findings and config.
 */
function buildReview(
  findings: ReviewFinding[],
  threshold: Severity,
  autoApprove: boolean,
): SecurityReview {
  const blocking = findings.some((f) => isAtLeast(f.severity, threshold));
  const approved = autoApprove && !blocking;

  let summary: string;
  if (findings.length === 0) {
    summary = 'AugmentaSec: No security findings detected. LGTM!';
  } else if (blocking) {
    const count = findings.filter((f) => isAtLeast(f.severity, threshold)).length;
    summary =
      `AugmentaSec: Found ${count} finding(s) at or above ` +
      `${threshold} severity. Please address before merging.`;
  } else {
    summary =
      `AugmentaSec: Found ${findings.length} finding(s), ` +
      `none at or above ${threshold} severity.`;
  }

  return {summary, findings, approved};
}

/**
 * Reviews a single PR and posts the review comment.
 *
 * The `analyzeFunc` parameter is a callback that produces findings for a
 * given PR -- this decouples the batch orchestrator from the LLM analysis
 * pipeline, making the function testable with deterministic stubs.
 */
async function reviewSinglePR(
  platform: GitPlatform,
  pr: PullRequest,
  config: BatchReviewConfig,
  analyzeFunc: (pr: PullRequest) => Promise<ReviewFinding[]>,
): Promise<PRReviewResult> {
  const start = Date.now();
  const findings = await analyzeFunc(pr);
  const review = buildReview(
    findings,
    config.severityThreshold,
    config.autoApprove,
  );

  await platform.commentOnPR(pr.number, review);

  return {
    prNumber: pr.number,
    prTitle: pr.title,
    prUrl: pr.url,
    approved: review.approved,
    findings,
    summary: review.summary,
    durationMs: Date.now() - start,
  };
}

// ---------------------------------------------------------------------------
// Concurrency helper
// ---------------------------------------------------------------------------

/**
 * Runs async tasks with bounded concurrency.
 *
 * @param items - Items to process.
 * @param concurrency - Maximum parallel tasks.
 * @param fn - Async function to apply to each item.
 * @returns Results in the same order as the input items.
 */
async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const idx = nextIndex++;
      results[idx] = await fn(items[idx]);
    }
  }

  const workers = Array.from(
    {length: Math.min(concurrency, items.length)},
    () => worker(),
  );
  await Promise.all(workers);
  return results;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Reviews all open PRs on the given platform.
 *
 * @param platform - The git platform adapter (e.g. GitHub, GitLab).
 * @param platformName - Platform identifier for the result.
 * @param config - Batch review configuration (merged with defaults).
 * @param analyzeFunc - Callback that produces findings for a given PR.
 *   In production this invokes the LLM analysis pipeline; in tests it
 *   returns deterministic stubs.
 * @returns Aggregated results for all open PRs.
 */
export async function reviewAllOpenPRs(
  platform: GitPlatform,
  platformName: CIPlatform,
  config: Partial<BatchReviewConfig> = {},
  analyzeFunc: (pr: PullRequest) => Promise<ReviewFinding[]>,
): Promise<BatchReviewResult> {
  const resolvedConfig: BatchReviewConfig = {
    ...DEFAULT_BATCH_CONFIG,
    ...config,
  };
  const start = Date.now();

  // Fetch all open PRs.
  const openPRs = await platform.getPullRequests('open');

  if (openPRs.length === 0) {
    return {
      platform: platformName,
      totalPRs: 0,
      reviewedPRs: 0,
      skippedPRs: 0,
      results: [],
      durationMs: Date.now() - start,
    };
  }

  // Review each PR with bounded concurrency.
  const settledResults = await mapWithConcurrency(
    openPRs,
    resolvedConfig.concurrency,
    async (pr): Promise<PRReviewResult | null> => {
      try {
        return await reviewSinglePR(platform, pr, resolvedConfig, analyzeFunc);
      } catch {
        // If a single PR review fails, skip it rather than failing the batch.
        return null;
      }
    },
  );

  const results = settledResults.filter(
    (r): r is PRReviewResult => r !== null,
  );
  const skippedPRs = openPRs.length - results.length;

  return {
    platform: platformName,
    totalPRs: openPRs.length,
    reviewedPRs: results.length,
    skippedPRs,
    results,
    durationMs: Date.now() - start,
  };
}
