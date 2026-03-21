/**
 * Tests for the batch review module (ASEC-049).
 *
 * Validates that reviewAllOpenPRs correctly orchestrates reviews across
 * multiple open PRs with bounded concurrency, error handling, and
 * aggregation.
 */

import {describe, expect, it, vi} from 'vitest';

import {reviewAllOpenPRs} from '../batch.js';
import type {
  GitPlatform,
  PullRequest,
  ReviewFinding,
} from '../../providers/git-platform/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePR(n: number): PullRequest {
  return {
    id: String(1000 + n),
    number: n,
    title: `PR #${n}`,
    state: 'open',
    author: 'dev',
    baseBranch: 'main',
    headBranch: `feat/pr-${n}`,
    url: `https://github.com/o/r/pull/${n}`,
    createdAt: '2026-03-20T10:00:00Z',
    updatedAt: '2026-03-20T12:00:00Z',
  };
}

function makeFinding(
  overrides: Partial<ReviewFinding> = {},
): ReviewFinding {
  return {
    file: 'src/main.ts',
    line: 1,
    severity: 'medium',
    message: 'Test finding',
    ...overrides,
  };
}

function makePlatform(prs: PullRequest[]): GitPlatform {
  return {
    name: 'github',
    getPullRequests: vi.fn().mockResolvedValue(prs),
    getDiff: vi.fn().mockResolvedValue({files: [], additions: 0, deletions: 0}),
    getBranches: vi.fn().mockResolvedValue([]),
    createIssue: vi.fn().mockResolvedValue(''),
    createPullRequest: vi.fn().mockResolvedValue(''),
    commentOnPR: vi.fn().mockResolvedValue(undefined),
    onPullRequestOpened: vi.fn(),
    onPush: vi.fn(),
  };
}

// ---------------------------------------------------------------------------
// reviewAllOpenPRs
// ---------------------------------------------------------------------------

describe('reviewAllOpenPRs', () => {
  it('returns empty result when there are no open PRs', async () => {
    const platform = makePlatform([]);
    const analyze = vi.fn();

    const result = await reviewAllOpenPRs(platform, 'github', {}, analyze);

    expect(result.totalPRs).toBe(0);
    expect(result.reviewedPRs).toBe(0);
    expect(result.skippedPRs).toBe(0);
    expect(result.results).toHaveLength(0);
    expect(result.platform).toBe('github');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(analyze).not.toHaveBeenCalled();
  });

  it('reviews all open PRs and aggregates results', async () => {
    const prs = [makePR(1), makePR(2), makePR(3)];
    const platform = makePlatform(prs);
    const analyze = vi.fn().mockResolvedValue([makeFinding()]);

    const result = await reviewAllOpenPRs(platform, 'github', {}, analyze);

    expect(result.totalPRs).toBe(3);
    expect(result.reviewedPRs).toBe(3);
    expect(result.skippedPRs).toBe(0);
    expect(result.results).toHaveLength(3);

    // Each PR should have been reviewed and commented on.
    expect(platform.commentOnPR).toHaveBeenCalledTimes(3);
    expect(analyze).toHaveBeenCalledTimes(3);
  });

  it('marks PRs as approved when auto-approve is on and no blocking findings', async () => {
    const prs = [makePR(1)];
    const platform = makePlatform(prs);
    const analyze = vi.fn().mockResolvedValue([makeFinding({severity: 'low'})]);

    const result = await reviewAllOpenPRs(
      platform,
      'github',
      {autoApprove: true, severityThreshold: 'high'},
      analyze,
    );

    expect(result.results[0].approved).toBe(true);
  });

  it('does not approve when findings meet threshold', async () => {
    const prs = [makePR(1)];
    const platform = makePlatform(prs);
    const analyze = vi
      .fn()
      .mockResolvedValue([makeFinding({severity: 'critical'})]);

    const result = await reviewAllOpenPRs(
      platform,
      'github',
      {autoApprove: true, severityThreshold: 'high'},
      analyze,
    );

    expect(result.results[0].approved).toBe(false);
  });

  it('skips PRs that fail analysis without crashing the batch', async () => {
    const prs = [makePR(1), makePR(2), makePR(3)];
    const platform = makePlatform(prs);
    const analyze = vi
      .fn()
      .mockResolvedValueOnce([makeFinding()])
      .mockRejectedValueOnce(new Error('LLM timeout'))
      .mockResolvedValueOnce([]);

    const result = await reviewAllOpenPRs(
      platform,
      'github',
      {concurrency: 1},
      analyze,
    );

    expect(result.totalPRs).toBe(3);
    expect(result.reviewedPRs).toBe(2);
    expect(result.skippedPRs).toBe(1);
    expect(result.results).toHaveLength(2);
  });

  it('respects concurrency limit', async () => {
    const prs = [makePR(1), makePR(2), makePR(3), makePR(4), makePR(5)];
    const platform = makePlatform(prs);

    let concurrent = 0;
    let maxConcurrent = 0;

    const analyze = vi.fn().mockImplementation(async () => {
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise((resolve) => setTimeout(resolve, 10));
      concurrent--;
      return [];
    });

    await reviewAllOpenPRs(
      platform,
      'github',
      {concurrency: 2},
      analyze,
    );

    // With concurrency = 2, we should never have more than 2 running.
    expect(maxConcurrent).toBeLessThanOrEqual(2);
    expect(analyze).toHaveBeenCalledTimes(5);
  });

  it('uses default config when none provided', async () => {
    const prs = [makePR(1)];
    const platform = makePlatform(prs);
    const analyze = vi.fn().mockResolvedValue([]);

    const result = await reviewAllOpenPRs(platform, 'gitlab', undefined, analyze);

    expect(result.platform).toBe('gitlab');
    expect(result.reviewedPRs).toBe(1);
  });

  it('includes PR metadata in results', async () => {
    const prs = [makePR(42)];
    const platform = makePlatform(prs);
    const analyze = vi.fn().mockResolvedValue([]);

    const result = await reviewAllOpenPRs(platform, 'github', {}, analyze);

    expect(result.results[0].prNumber).toBe(42);
    expect(result.results[0].prTitle).toBe('PR #42');
    expect(result.results[0].prUrl).toBe('https://github.com/o/r/pull/42');
  });

  it('captures timing for the whole batch', async () => {
    const platform = makePlatform([makePR(1)]);
    const analyze = vi.fn().mockResolvedValue([]);

    const result = await reviewAllOpenPRs(platform, 'github', {}, analyze);

    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('captures timing per PR review', async () => {
    const platform = makePlatform([makePR(1)]);
    const analyze = vi.fn().mockResolvedValue([]);

    const result = await reviewAllOpenPRs(platform, 'github', {}, analyze);

    expect(result.results[0].durationMs).toBeGreaterThanOrEqual(0);
  });

  it('reports summary message for PRs with no findings', async () => {
    const platform = makePlatform([makePR(1)]);
    const analyze = vi.fn().mockResolvedValue([]);

    const result = await reviewAllOpenPRs(platform, 'github', {}, analyze);

    expect(result.results[0].summary).toContain('No security findings detected');
  });

  it('reports blocking summary for PRs with severe findings', async () => {
    const platform = makePlatform([makePR(1)]);
    const analyze = vi
      .fn()
      .mockResolvedValue([makeFinding({severity: 'critical'})]);

    const result = await reviewAllOpenPRs(
      platform,
      'github',
      {severityThreshold: 'high'},
      analyze,
    );

    expect(result.results[0].summary).toContain('Please address before merging');
  });
});
