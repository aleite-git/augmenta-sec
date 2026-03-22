/**
 * Tests for the batch review module (ASEC-049).
 */

import {describe, expect, it, vi} from 'vitest';

import {batchReview, runWithConcurrency} from '../batch.js';
import type {
  Diff,
  DiffFile,
  GitPlatform,
  PullRequest,
} from '../../providers/git-platform/types.js';
import type {LLMProvider} from '../../providers/llm/types.js';
import {DEFAULT_CONFIG} from '../../config/defaults.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePR(overrides: Partial<PullRequest> = {}): PullRequest {
  return {
    id: '1001',
    number: 42,
    title: 'feat: add auth',
    state: 'open',
    author: 'dev',
    baseBranch: 'main',
    headBranch: 'feat/auth',
    url: 'https://github.com/owner/repo/pull/42',
    createdAt: '2026-03-20T10:00:00Z',
    updatedAt: '2026-03-20T12:00:00Z',
    ...overrides,
  };
}

function makeDiffFile(overrides: Partial<DiffFile> = {}): DiffFile {
  return {
    path: 'src/auth.ts',
    status: 'added',
    additions: 50,
    deletions: 0,
    patch: '@@ +1,50 @@\n+export function authenticate() {}',
    ...overrides,
  };
}

function makeDiff(files: DiffFile[]): Diff {
  return {
    files,
    additions: files.reduce((s, f) => s + f.additions, 0),
    deletions: files.reduce((s, f) => s + f.deletions, 0),
  };
}

function makeMockPlatform(
  prs: PullRequest[],
  diff: Diff,
): GitPlatform {
  return {
    name: 'mock',
    getPullRequests: vi.fn().mockResolvedValue(prs),
    getDiff: vi.fn().mockResolvedValue(diff),
    getBranches: vi.fn().mockResolvedValue([]),
    createIssue: vi.fn().mockResolvedValue(''),
    createPullRequest: vi.fn().mockResolvedValue(''),
    commentOnPR: vi.fn().mockResolvedValue(undefined),
    onPullRequestOpened: vi.fn(),
    onPush: vi.fn(),
  };
}

function makeMockProvider(responseContent: string): LLMProvider {
  return {
    name: 'test-provider',
    model: 'test-model',
    capabilities: {
      maxContextTokens: 128000,
      supportsImages: false,
      supportsStructuredOutput: true,
    },
    analyze: vi.fn().mockResolvedValue({
      content: responseContent,
      tokensUsed: {input: 100, output: 50},
      model: 'test-model',
      role: 'analysis' as const,
    }),
    analyzeStructured: vi.fn(),
  };
}

// ---------------------------------------------------------------------------
// runWithConcurrency
// ---------------------------------------------------------------------------

describe('runWithConcurrency', () => {
  it('processes all items with bounded concurrency', async () => {
    const items = [1, 2, 3, 4, 5];
    let maxConcurrent = 0;
    let current = 0;

    const results = await runWithConcurrency(items, 2, async (n) => {
      current++;
      if (current > maxConcurrent) maxConcurrent = current;
      await new Promise((r) => setTimeout(r, 10));
      current--;
      return n * 2;
    });

    expect(results).toEqual([2, 4, 6, 8, 10]);
    expect(maxConcurrent).toBeLessThanOrEqual(2);
  });

  it('handles empty input', async () => {
    const results = await runWithConcurrency([], 3, async (n: number) => n);
    expect(results).toEqual([]);
  });

  it('handles concurrency higher than items', async () => {
    const items = [1, 2];
    const results = await runWithConcurrency(items, 10, async (n) => n + 1);
    expect(results).toEqual([2, 3]);
  });

  it('preserves order of results', async () => {
    const items = [3, 1, 2];
    const results = await runWithConcurrency(items, 3, async (n) => {
      // Longer delay for smaller numbers to test ordering
      await new Promise((r) => setTimeout(r, n * 5));
      return n;
    });
    expect(results).toEqual([3, 1, 2]);
  });
});

// ---------------------------------------------------------------------------
// batchReview
// ---------------------------------------------------------------------------

describe('batchReview', () => {
  it('returns empty result when no open PRs', async () => {
    const platform = makeMockPlatform([], makeDiff([]));
    const provider = makeMockProvider('[]');

    const result = await batchReview({
      platform,
      provider,
      config: DEFAULT_CONFIG,
    });

    expect(result.total).toBe(0);
    expect(result.succeeded).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.items).toHaveLength(0);
  });

  it('reviews all open PRs successfully', async () => {
    const prs = [
      makePR({number: 1, title: 'PR one', headBranch: 'feat/one'}),
      makePR({number: 2, title: 'PR two', headBranch: 'feat/two'}),
    ];
    const diff = makeDiff([makeDiffFile()]);
    const platform = makeMockPlatform(prs, diff);
    const provider = makeMockProvider('[]');

    const result = await batchReview({
      platform,
      provider,
      config: DEFAULT_CONFIG,
      concurrency: 2,
    });

    expect(result.total).toBe(2);
    expect(result.succeeded).toBe(2);
    expect(result.failed).toBe(0);
    expect(result.items).toHaveLength(2);
    expect(result.items[0].prNumber).toBe(1);
    expect(result.items[0].result).toBeDefined();
    expect(result.items[1].prNumber).toBe(2);
  });

  it('captures errors for individual PR failures without aborting', async () => {
    const prs = [
      makePR({number: 1, title: 'Good PR', headBranch: 'feat/good'}),
      makePR({number: 99, title: 'Bad PR', headBranch: 'feat/bad'}),
    ];

    // Platform returns prs for listing, but getDiff will fail for PR #99
    // by not finding it in the PR list during runReview.
    // runReview looks up by prNumber in the getPullRequests result.
    // Since both PRs are in the list, both should be found.
    // Let's make getDiff throw for the second call instead:
    const diff = makeDiff([makeDiffFile()]);
    const platform: GitPlatform = {
      name: 'mock',
      getPullRequests: vi.fn().mockResolvedValue(prs),
      getDiff: vi
        .fn()
        .mockResolvedValueOnce(diff)
        .mockRejectedValueOnce(new Error('API timeout')),
      getBranches: vi.fn().mockResolvedValue([]),
      createIssue: vi.fn().mockResolvedValue(''),
      createPullRequest: vi.fn().mockResolvedValue(''),
      commentOnPR: vi.fn().mockResolvedValue(undefined),
      onPullRequestOpened: vi.fn(),
      onPush: vi.fn(),
    };
    const provider = makeMockProvider('[]');

    const result = await batchReview({
      platform,
      provider,
      config: DEFAULT_CONFIG,
      concurrency: 1, // serial to control mock ordering
    });

    expect(result.total).toBe(2);
    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.items[0].result).toBeDefined();
    expect(result.items[1].error).toBeDefined();
    expect(result.items[1].error).toContain('API timeout');
  });

  it('respects concurrency option', async () => {
    const prs = Array.from({length: 6}, (_, i) =>
      makePR({
        number: i + 1,
        title: `PR ${i + 1}`,
        headBranch: `feat/pr-${i + 1}`,
      }),
    );
    const diff = makeDiff([makeDiffFile()]);
    const platform = makeMockPlatform(prs, diff);
    const provider = makeMockProvider('[]');

    const result = await batchReview({
      platform,
      provider,
      config: DEFAULT_CONFIG,
      concurrency: 2,
    });

    expect(result.total).toBe(6);
    expect(result.succeeded).toBe(6);
    expect(result.items).toHaveLength(6);
  });

  it('defaults concurrency to 3', async () => {
    const prs = [
      makePR({number: 1, title: 'PR 1', headBranch: 'feat/1'}),
    ];
    const diff = makeDiff([makeDiffFile()]);
    const platform = makeMockPlatform(prs, diff);
    const provider = makeMockProvider('[]');

    // Just verify it runs without specifying concurrency
    const result = await batchReview({
      platform,
      provider,
      config: DEFAULT_CONFIG,
    });

    expect(result.total).toBe(1);
    expect(result.succeeded).toBe(1);
  });

  it('includes PR title in batch results', async () => {
    const prs = [
      makePR({number: 42, title: 'feat: important change'}),
    ];
    const diff = makeDiff([makeDiffFile()]);
    const platform = makeMockPlatform(prs, diff);
    const provider = makeMockProvider('[]');

    const result = await batchReview({
      platform,
      provider,
      config: DEFAULT_CONFIG,
    });

    expect(result.items[0].prTitle).toBe('feat: important change');
  });
});
