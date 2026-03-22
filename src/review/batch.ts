/**
 * Batch review — reviews all open PRs in a repository (ASEC-049).
 *
 * Fetches the list of open PRs from the platform adapter, then runs
 * security reviews in parallel with configurable concurrency.
 */

import type {GitPlatform} from '../providers/git-platform/types.js';
import type {LLMProvider} from '../providers/llm/types.js';
import type {AugmentaSecConfig} from '../config/schema.js';
import {runReview, type ReviewResult} from './engine.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Options for a batch review run. */
export interface BatchReviewOptions {
  /** Git platform adapter (must support getPullRequests). */
  platform: GitPlatform;
  /** LLM provider for analysis. */
  provider: LLMProvider;
  /** Resolved project configuration. */
  config: AugmentaSecConfig;
  /** Maximum number of concurrent reviews (default: 3). */
  concurrency?: number;
}

/** Result for a single PR within a batch. */
export interface BatchReviewItem {
  prNumber: number;
  prTitle: string;
  result?: ReviewResult;
  error?: string;
}

/** Aggregated result of a batch review. */
export interface BatchReviewResult {
  /** Total PRs reviewed (attempted). */
  total: number;
  /** Number of successful reviews. */
  succeeded: number;
  /** Number of failed reviews. */
  failed: number;
  /** Individual PR results. */
  items: BatchReviewItem[];
}

// ---------------------------------------------------------------------------
// Concurrency helper
// ---------------------------------------------------------------------------

/**
 * Runs async tasks with bounded concurrency.
 *
 * @param items  - Items to process.
 * @param limit  - Max parallel tasks.
 * @param fn     - Async function to run per item.
 * @returns Array of results in the same order as items.
 */
export async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length) as R[];
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const idx = nextIndex++;
      results[idx] = await fn(items[idx]);
    }
  }

  const workers = Array.from({length: Math.min(limit, items.length)}, () => worker());

  await Promise.all(workers);
  return results;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Default concurrency limit for batch reviews. */
const DEFAULT_CONCURRENCY = 3;

/**
 * Reviews all open PRs in a repository.
 *
 * Fetches open PRs, then reviews each one using the review engine.
 * Errors on individual PRs are captured (not thrown) so the batch
 * can continue.
 */
export async function batchReview(options: BatchReviewOptions): Promise<BatchReviewResult> {
  const {platform, provider, config} = options;
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;

  const openPRs = await platform.getPullRequests('open');

  if (openPRs.length === 0) {
    return {total: 0, succeeded: 0, failed: 0, items: []};
  }

  const items = await runWithConcurrency(
    openPRs,
    concurrency,
    async (pr): Promise<BatchReviewItem> => {
      try {
        const result = await runReview({prNumber: pr.number}, platform, provider, config);
        return {prNumber: pr.number, prTitle: pr.title, result};
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {prNumber: pr.number, prTitle: pr.title, error: message};
      }
    },
  );

  const succeeded = items.filter((i) => i.result !== undefined).length;
  const failed = items.filter((i) => i.error !== undefined).length;

  return {
    total: openPRs.length,
    succeeded,
    failed,
    items,
  };
}
