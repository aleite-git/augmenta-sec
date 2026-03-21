import {describe, it, expect, vi} from 'vitest';

import type {Finding} from '../../findings/types.js';
import type {GitPlatform} from '../../providers/git-platform/types.js';
import {buildIssueFromFinding, createIssueFromFinding} from '../issue-creator.js';

/** Creates a minimal Finding for testing. */
function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: 'aaaa-bbbb-cccc-dddd',
    source: 'scanner',
    scanner: 'semgrep',
    category: 'injection',
    severity: 'high',
    rawSeverity: 'high',
    title: 'SQL injection in query builder',
    description: 'User input flows into raw SQL query.',
    file: 'src/db/query.ts',
    line: 42,
    confidence: 0.9,
    cweId: 'CWE-89',
    cveId: 'CVE-2026-1234',
    owaspCategory: 'A03:2021-Injection',
    suggestedFix: 'Use parameterized queries.',
    contextualNote: 'This endpoint is publicly accessible.',
    status: 'open',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

/** Creates a stub GitPlatform. */
function makePlatform(
  issueUrl = 'https://github.com/owner/repo/issues/1',
): GitPlatform {
  return {
    name: 'github',
    getPullRequests: vi.fn(),
    getDiff: vi.fn(),
    getBranches: vi.fn(),
    createIssue: vi.fn().mockResolvedValue(issueUrl),
    createPullRequest: vi.fn(),
    commentOnPR: vi.fn(),
    onPullRequestOpened: vi.fn(),
    onPush: vi.fn(),
  };
}

describe('buildIssueFromFinding', () => {
  it('creates an issue with severity badge in the title', () => {
    const issue = buildIssueFromFinding(makeFinding());

    expect(issue.title).toBe('[HIGH] SQL injection in query builder');
  });

  it('includes severity, category, and confidence in the body', () => {
    const issue = buildIssueFromFinding(makeFinding());

    expect(issue.body).toContain('**Severity:** high');
    expect(issue.body).toContain('**Category:** injection');
    expect(issue.body).toContain('**Confidence:** 90%');
  });

  it('includes CWE, CVE, and OWASP in the body', () => {
    const issue = buildIssueFromFinding(makeFinding());

    expect(issue.body).toContain('CWE-89');
    expect(issue.body).toContain('CVE-2026-1234');
    expect(issue.body).toContain('A03:2021-Injection');
  });

  it('includes file location with line number', () => {
    const issue = buildIssueFromFinding(makeFinding());

    expect(issue.body).toContain('`src/db/query.ts:42`');
  });

  it('includes file without line number when line is absent', () => {
    const issue = buildIssueFromFinding(makeFinding({line: undefined}));

    expect(issue.body).toContain('`src/db/query.ts`');
    expect(issue.body).not.toContain(':42');
  });

  it('includes suggested fix and contextual note', () => {
    const issue = buildIssueFromFinding(makeFinding());

    expect(issue.body).toContain('Use parameterized queries.');
    expect(issue.body).toContain('This endpoint is publicly accessible.');
  });

  it('omits optional sections when not present', () => {
    const issue = buildIssueFromFinding(
      makeFinding({
        cweId: undefined,
        cveId: undefined,
        owaspCategory: undefined,
        suggestedFix: undefined,
        contextualNote: undefined,
        file: undefined,
      }),
    );

    expect(issue.body).not.toContain('**CWE:**');
    expect(issue.body).not.toContain('**CVE:**');
    expect(issue.body).not.toContain('**OWASP:**');
    expect(issue.body).not.toContain('### Suggested Fix');
    expect(issue.body).not.toContain('### Context');
    expect(issue.body).not.toContain('### Location');
  });

  it('includes finding ID in the footer', () => {
    const issue = buildIssueFromFinding(makeFinding());

    expect(issue.body).toContain('aaaa-bbbb-cccc-dddd');
  });

  it('sets severity and labels', () => {
    const issue = buildIssueFromFinding(makeFinding());

    expect(issue.severity).toBe('high');
    expect(issue.labels).toContain('security');
    expect(issue.labels).toContain('high');
    expect(issue.labels).toContain('injection');
  });
});

describe('createIssueFromFinding', () => {
  it('calls platform.createIssue and returns the URL', async () => {
    const platform = makePlatform('https://github.com/x/y/issues/42');
    const finding = makeFinding();

    const url = await createIssueFromFinding(finding, platform);

    expect(url).toBe('https://github.com/x/y/issues/42');
    expect(platform.createIssue).toHaveBeenCalledOnce();

    const issueArg = vi.mocked(platform.createIssue).mock.calls[0][0];
    expect(issueArg.title).toContain('SQL injection');
  });

  it('propagates platform errors', async () => {
    const platform = makePlatform();
    vi.mocked(platform.createIssue).mockRejectedValue(
      new Error('API rate limited'),
    );

    await expect(
      createIssueFromFinding(makeFinding(), platform),
    ).rejects.toThrow('API rate limited');
  });
});
