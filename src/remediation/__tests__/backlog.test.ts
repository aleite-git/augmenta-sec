import {describe, it, expect, vi} from 'vitest';

import type {Finding} from '../../findings/types.js';
import type {GitPlatform, PullRequest} from '../../providers/git-platform/types.js';
import {checkForDuplicateIssue, titleSimilarity} from '../backlog.js';

/** Creates a minimal Finding. */
function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: 'aaaa-bbbb-cccc-dddd',
    source: 'scanner',
    category: 'injection',
    severity: 'high',
    rawSeverity: 'high',
    title: 'SQL injection in query builder',
    description: 'User input flows into raw SQL query.',
    confidence: 0.9,
    status: 'open',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

/** Creates a stub PullRequest. */
function makePR(overrides: Partial<PullRequest> = {}): PullRequest {
  return {
    id: '1',
    number: 1,
    title: 'Some PR',
    state: 'open',
    author: 'bot',
    baseBranch: 'main',
    headBranch: 'fix/something',
    url: 'https://github.com/x/y/pull/1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

/** Creates a stub GitPlatform. */
function makePlatform(openPRs: PullRequest[] = []): GitPlatform {
  return {
    name: 'github',
    getPullRequests: vi.fn().mockResolvedValue(openPRs),
    getDiff: vi.fn(),
    getBranches: vi.fn(),
    createIssue: vi.fn(),
    createPullRequest: vi.fn(),
    commentOnPR: vi.fn(),
    onPullRequestOpened: vi.fn(),
    onPush: vi.fn(),
  };
}

describe('titleSimilarity', () => {
  it('returns 1 for identical strings', () => {
    expect(titleSimilarity('hello world', 'hello world')).toBe(1);
  });

  it('returns 1 for two empty strings', () => {
    expect(titleSimilarity('', '')).toBe(1);
  });

  it('returns 0 when one string is empty', () => {
    expect(titleSimilarity('hello', '')).toBe(0);
  });

  it('is case-insensitive', () => {
    expect(titleSimilarity('Hello World', 'hello world')).toBe(1);
  });

  it('returns a high score for similar strings', () => {
    const a = '[HIGH] SQL injection in query builder';
    const b = '[HIGH] SQL injection in query builder v2';
    expect(titleSimilarity(a, b)).toBeGreaterThan(0.7);
  });

  it('returns a low score for dissimilar strings', () => {
    expect(titleSimilarity('CSRF token missing', 'Memory leak in parser')).toBeLessThan(0.3);
  });

  it('returns between 0 and 1 for partially overlapping strings', () => {
    const score = titleSimilarity('SQL injection attack', 'injection vulnerability');
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(1);
  });
});

describe('checkForDuplicateIssue', () => {
  it('returns null when no open issues exist', async () => {
    const platform = makePlatform([]);
    const finding = makeFinding();

    const result = await checkForDuplicateIssue(finding, platform);

    expect(result).toBeNull();
  });

  it('detects a duplicate by exact finding ID in the title', async () => {
    const finding = makeFinding({id: 'exact-uuid-match'});
    const platform = makePlatform([
      makePR({
        title: '[HIGH] SQL injection — Finding exact-uuid-match',
        url: 'https://github.com/x/y/pull/42',
      }),
    ]);

    const result = await checkForDuplicateIssue(finding, platform);

    expect(result).toBe('https://github.com/x/y/pull/42');
  });

  it('detects a duplicate by title similarity', async () => {
    const finding = makeFinding({title: 'SQL injection in query builder'});
    const platform = makePlatform([
      makePR({
        title: '[HIGH] SQL injection in query builder',
        url: 'https://github.com/x/y/pull/10',
      }),
    ]);

    const result = await checkForDuplicateIssue(finding, platform);

    expect(result).toBe('https://github.com/x/y/pull/10');
  });

  it('returns null when similarity is below threshold', async () => {
    const finding = makeFinding({title: 'CSRF token missing'});
    const platform = makePlatform([
      makePR({title: 'Memory leak in parser'}),
    ]);

    const result = await checkForDuplicateIssue(finding, platform);

    expect(result).toBeNull();
  });

  it('respects a custom similarity threshold', async () => {
    const finding = makeFinding({title: 'XSS in templates'});
    const platform = makePlatform([
      makePR({
        title: '[HIGH] XSS in template engine',
        url: 'https://github.com/x/y/pull/5',
      }),
    ]);

    // With a very high threshold, no match
    const strict = await checkForDuplicateIssue(finding, platform, 0.99);
    expect(strict).toBeNull();

    // With a lower threshold, match
    const loose = await checkForDuplicateIssue(finding, platform, 0.3);
    expect(loose).toBe('https://github.com/x/y/pull/5');
  });

  it('prefers ID match over title similarity', async () => {
    const finding = makeFinding({
      id: 'unique-id-123',
      title: 'SQL injection',
    });
    const platform = makePlatform([
      makePR({
        title: 'Contains unique-id-123 reference',
        url: 'https://github.com/x/y/pull/1',
      }),
      makePR({
        title: '[HIGH] SQL injection',
        url: 'https://github.com/x/y/pull/2',
      }),
    ]);

    const result = await checkForDuplicateIssue(finding, platform);

    // Should match the ID-based one first
    expect(result).toBe('https://github.com/x/y/pull/1');
  });
});
