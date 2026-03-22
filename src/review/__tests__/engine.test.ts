/**
 * Tests for the review engine (ASEC-043).
 */

import {describe, expect, it, vi} from 'vitest';

import {runReview, parsePRRef} from '../engine.js';
import type {
  Diff,
  DiffFile,
  GitPlatform,
  PullRequest,
} from '../../providers/git-platform/types.js';
import type {LLMProvider} from '../../providers/llm/types.js';
import type {AugmentaSecConfig} from '../../config/schema.js';
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

function makeMockPlatform(prs: PullRequest[], diff: Diff): GitPlatform {
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

function makeConfig(
  overrides: Partial<AugmentaSecConfig> = {},
): AugmentaSecConfig {
  return {
    ...DEFAULT_CONFIG,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// parsePRRef
// ---------------------------------------------------------------------------

describe('parsePRRef', () => {
  it('parses a plain number', () => {
    expect(parsePRRef('42')).toEqual({prNumber: 42});
  });

  it('parses a number with # prefix', () => {
    expect(parsePRRef('#99')).toEqual({prNumber: 99});
  });

  it('parses a GitHub PR URL', () => {
    expect(
      parsePRRef('https://github.com/owner/repo/pull/123'),
    ).toEqual({prNumber: 123});
  });

  it('parses a GitHub Enterprise PR URL', () => {
    expect(
      parsePRRef('https://github.corp.com/org/repo/pull/7'),
    ).toEqual({prNumber: 7});
  });

  it('throws for invalid input', () => {
    expect(() => parsePRRef('not-a-pr')).toThrow('Invalid PR reference');
  });

  it('throws for empty string', () => {
    expect(() => parsePRRef('')).toThrow('Invalid PR reference');
  });
});

// ---------------------------------------------------------------------------
// runReview
// ---------------------------------------------------------------------------

describe('runReview', () => {
  it('runs end-to-end and returns ReviewResult', async () => {
    const pr = makePR();
    const diffFiles = [makeDiffFile()];
    const diff = makeDiff(diffFiles);
    const platform = makeMockPlatform([pr], diff);
    const provider = makeMockProvider('[]');
    const config = makeConfig();

    const result = await runReview(
      {prNumber: 42},
      platform,
      provider,
      config,
    );

    expect(result.findings).toHaveLength(0);
    expect(result.approved).toBe(true);
    expect(result.reviewedFiles).toContain('src/auth.ts');
    expect(result.summary.total).toBe(0);
    expect(platform.getPullRequests).toHaveBeenCalledWith('open');
    expect(platform.getDiff).toHaveBeenCalledWith('main', 'feat/auth');
    expect(platform.commentOnPR).toHaveBeenCalledWith(
      42,
      expect.objectContaining({approved: true}),
    );
  });

  it('reports findings and rejects when critical found', async () => {
    const pr = makePR();
    const diff = makeDiff([makeDiffFile()]);
    const platform = makeMockPlatform([pr], diff);
    const provider = makeMockProvider(
      JSON.stringify([
        {
          file: 'src/auth.ts',
          line: 10,
          severity: 'critical',
          category: 'auth',
          title: 'Auth bypass',
          description: 'Missing authentication check.',
          confidence: 0.95,
        },
      ]),
    );
    const config = makeConfig();

    const result = await runReview(
      {prNumber: 42},
      platform,
      provider,
      config,
    );

    expect(result.findings).toHaveLength(1);
    expect(result.approved).toBe(false);
    expect(result.summary.bySeverity.critical).toBe(1);
  });

  it('throws when PR is not found', async () => {
    const platform = makeMockPlatform([], makeDiff([]));
    const provider = makeMockProvider('[]');
    const config = makeConfig();

    await expect(
      runReview({prNumber: 999}, platform, provider, config),
    ).rejects.toThrow('PR #999 not found');
  });

  it('excludes deleted files from reviewedFiles', async () => {
    const pr = makePR();
    const diff = makeDiff([
      makeDiffFile({path: 'src/new.ts', status: 'added'}),
      makeDiffFile({path: 'src/old.ts', status: 'deleted'}),
    ]);
    const platform = makeMockPlatform([pr], diff);
    const provider = makeMockProvider('[]');
    const config = makeConfig();

    const result = await runReview(
      {prNumber: 42},
      platform,
      provider,
      config,
    );

    expect(result.reviewedFiles).toContain('src/new.ts');
    expect(result.reviewedFiles).not.toContain('src/old.ts');
  });

  it('skips posting when inline_comments and summary_comment are false', async () => {
    const pr = makePR();
    const diff = makeDiff([makeDiffFile()]);
    const platform = makeMockPlatform([pr], diff);
    const provider = makeMockProvider('[]');
    const config = makeConfig({
      review: {
        ...DEFAULT_CONFIG.review,
        inline_comments: false,
        summary_comment: false,
      },
    });

    await runReview({prNumber: 42}, platform, provider, config);

    expect(platform.commentOnPR).not.toHaveBeenCalled();
  });

  it('filters findings by min_severity from config', async () => {
    const pr = makePR();
    const diff = makeDiff([makeDiffFile()]);
    const platform = makeMockPlatform([pr], diff);
    const provider = makeMockProvider(
      JSON.stringify([
        {
          file: 'src/auth.ts',
          line: 1,
          severity: 'low',
          category: 'config',
          title: 'Minor issue',
          description: 'Not important.',
          confidence: 0.3,
        },
        {
          file: 'src/auth.ts',
          line: 5,
          severity: 'high',
          category: 'auth',
          title: 'Auth gap',
          description: 'Serious issue.',
          confidence: 0.9,
        },
      ]),
    );
    const config = makeConfig({
      scan: {
        ...DEFAULT_CONFIG.scan,
        min_severity: 'high',
      },
    });

    const result = await runReview(
      {prNumber: 42},
      platform,
      provider,
      config,
    );

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].severity).toBe('high');
  });

  it('auto-approves when all findings are below threshold', async () => {
    const pr = makePR();
    const diff = makeDiff([makeDiffFile()]);
    const platform = makeMockPlatform([pr], diff);
    const provider = makeMockProvider(
      JSON.stringify([
        {
          file: 'src/auth.ts',
          line: 1,
          severity: 'low',
          category: 'config',
          title: 'Minor',
          description: 'Low severity issue.',
          confidence: 0.5,
        },
      ]),
    );
    const config = makeConfig();

    const result = await runReview(
      {prNumber: 42},
      platform,
      provider,
      config,
    );

    expect(result.approved).toBe(true);
  });
});
