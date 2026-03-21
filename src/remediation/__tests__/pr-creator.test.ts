import {describe, it, expect, vi} from 'vitest';

import type {Finding} from '../../findings/types.js';
import type {GitPlatform} from '../../providers/git-platform/types.js';
import type {FixSuggestion} from '../auto-fix.js';
import {
  buildPRBody,
  buildPRTitle,
  createFixPR,
  generateBranchName,
} from '../pr-creator.js';

/** Creates a minimal Finding for testing. */
function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: 'aaaa-bbbb-cccc-dddd',
    source: 'scanner',
    category: 'injection',
    severity: 'high',
    rawSeverity: 'high',
    title: 'SQL injection in query builder',
    description: 'User input flows into raw SQL query.',
    file: 'src/db/query.ts',
    line: 42,
    confidence: 0.9,
    cweId: 'CWE-89',
    status: 'open',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

/** Creates a stub FixSuggestion. */
function makeFix(overrides: Partial<FixSuggestion> = {}): FixSuggestion {
  return {
    original: 'db.raw(input)',
    fixed: 'db.parameterized(input)',
    explanation: 'Use parameterized queries to prevent SQL injection.',
    confidence: 0.85,
    ...overrides,
  };
}

/** Creates a stub GitPlatform. */
function makePlatform(prUrl = 'https://github.com/x/y/pull/1'): GitPlatform {
  return {
    name: 'github',
    getPullRequests: vi.fn(),
    getDiff: vi.fn(),
    getBranches: vi.fn(),
    createIssue: vi.fn(),
    createPullRequest: vi.fn().mockResolvedValue(prUrl),
    commentOnPR: vi.fn(),
    onPullRequestOpened: vi.fn(),
    onPush: vi.fn(),
  };
}

describe('generateBranchName', () => {
  it('produces a branch name with the finding ID prefix and sanitized title', () => {
    const finding = makeFinding();
    const branch = generateBranchName(finding);

    expect(branch).toMatch(/^asec\/fix-aaaa-bbb/);
    expect(branch).toContain('sql-injection');
    // Should not contain uppercase or special chars
    expect(branch).toMatch(/^[a-z0-9/-]+$/);
  });

  it('truncates long titles', () => {
    const finding = makeFinding({
      title: 'A very long finding title that exceeds the maximum allowed length for branch names',
    });
    const branch = generateBranchName(finding);

    // 40-char slug limit + prefix
    expect(branch.length).toBeLessThan(60);
  });

  it('handles special characters in titles', () => {
    const finding = makeFinding({title: 'XSS via <script> tag'});
    const branch = generateBranchName(finding);

    expect(branch).not.toContain('<');
    expect(branch).not.toContain('>');
  });
});

describe('buildPRTitle', () => {
  it('includes severity badge and finding title', () => {
    const title = buildPRTitle(makeFinding());

    expect(title).toBe(
      'fix(security): [HIGH] SQL injection in query builder',
    );
  });

  it('uses the correct severity badge for critical findings', () => {
    const title = buildPRTitle(makeFinding({severity: 'critical'}));

    expect(title).toContain('[CRITICAL]');
  });
});

describe('buildPRBody', () => {
  it('includes finding details and fix explanation', () => {
    const body = buildPRBody(makeFinding(), makeFix());

    expect(body).toContain('SQL injection in query builder');
    expect(body).toContain('high');
    expect(body).toContain('85%');
    expect(body).toContain('CWE-89');
    expect(body).toContain('src/db/query.ts');
    expect(body).toContain('Use parameterized queries');
  });

  it('includes original and fixed code blocks', () => {
    const body = buildPRBody(makeFinding(), makeFix());

    expect(body).toContain('db.raw(input)');
    expect(body).toContain('db.parameterized(input)');
  });

  it('includes finding ID in the footer', () => {
    const body = buildPRBody(makeFinding(), makeFix());

    expect(body).toContain('aaaa-bbbb-cccc-dddd');
  });

  it('omits CWE and file when not present', () => {
    const body = buildPRBody(
      makeFinding({cweId: undefined, file: undefined}),
      makeFix(),
    );

    expect(body).not.toContain('**CWE:**');
    expect(body).not.toContain('**File:**');
  });
});

describe('createFixPR', () => {
  it('calls platform.createPullRequest and returns the URL', async () => {
    const platform = makePlatform('https://github.com/x/y/pull/99');

    const url = await createFixPR(makeFinding(), makeFix(), platform);

    expect(url).toBe('https://github.com/x/y/pull/99');
    expect(platform.createPullRequest).toHaveBeenCalledOnce();
  });

  it('uses default baseBranch "main" when not specified', async () => {
    const platform = makePlatform();
    await createFixPR(makeFinding(), makeFix(), platform);

    const call = vi.mocked(platform.createPullRequest).mock.calls[0];
    expect(call[3]).toBe('main'); // base branch
  });

  it('uses custom baseBranch and headBranch when provided', async () => {
    const platform = makePlatform();
    await createFixPR(makeFinding(), makeFix(), platform, {
      baseBranch: 'develop',
      headBranch: 'custom-branch',
    });

    const call = vi.mocked(platform.createPullRequest).mock.calls[0];
    expect(call[2]).toBe('custom-branch'); // head
    expect(call[3]).toBe('develop'); // base
  });

  it('propagates platform errors', async () => {
    const platform = makePlatform();
    vi.mocked(platform.createPullRequest).mockRejectedValue(
      new Error('Forbidden'),
    );

    await expect(
      createFixPR(makeFinding(), makeFix(), platform),
    ).rejects.toThrow('Forbidden');
  });
});
