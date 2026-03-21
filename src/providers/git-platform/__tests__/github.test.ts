/**
 * Tests for the GitHub GitPlatform adapter.
 *
 * Mocks @octokit/rest entirely — no real API calls are made.
 */

import {beforeEach, describe, expect, it, vi} from 'vitest';

import {createGitHubAdapter} from '../github.js';
import type {GitPlatform, SecurityReview} from '../types.js';

// ---------------------------------------------------------------------------
// Mock Octokit
// ---------------------------------------------------------------------------

const mockPullsList = vi.fn();
const mockPullsCreate = vi.fn();
const mockPullsCreateReview = vi.fn();
const mockReposCompareCommits = vi.fn();
const mockReposGet = vi.fn();
const mockReposListBranches = vi.fn();
const mockIssuesCreate = vi.fn();

vi.mock('@octokit/rest', () => ({
  Octokit: vi.fn().mockImplementation(() => ({
    pulls: {
      list: mockPullsList,
      create: mockPullsCreate,
      createReview: mockPullsCreateReview,
    },
    repos: {
      compareCommits: mockReposCompareCommits,
      get: mockReposGet,
      listBranches: mockReposListBranches,
    },
    issues: {
      create: mockIssuesCreate,
    },
  })),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function defaultHeaders(): Record<string, string> {
  return {
    'x-ratelimit-remaining': '4999',
    'x-ratelimit-limit': '5000',
    'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 3600),
  };
}

function makeGitHubPR(overrides: Record<string, unknown> = {}) {
  return {
    id: 1001,
    number: 42,
    title: 'Add security checks',
    state: 'open',
    merged_at: null,
    user: {login: 'octocat'},
    base: {ref: 'main'},
    head: {ref: 'feat/security'},
    html_url: 'https://github.com/owner/repo/pull/42',
    created_at: '2026-03-20T10:00:00Z',
    updated_at: '2026-03-20T12:00:00Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GitHub adapter', () => {
  let adapter: GitPlatform;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = createGitHubAdapter({
      token: 'ghp_test_token',
      owner: 'test-owner',
      repo: 'test-repo',
    });
  });

  // -----------------------------------------------------------------------
  // getPullRequests
  // -----------------------------------------------------------------------

  describe('getPullRequests', () => {
    it('returns mapped PullRequest objects for open PRs', async () => {
      mockPullsList.mockResolvedValueOnce({
        data: [makeGitHubPR()],
        headers: defaultHeaders(),
      });

      const result = await adapter.getPullRequests('open');

      expect(mockPullsList).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        state: 'open',
        per_page: 100,
      });

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        id: '1001',
        number: 42,
        title: 'Add security checks',
        state: 'open',
        author: 'octocat',
        baseBranch: 'main',
        headBranch: 'feat/security',
        url: 'https://github.com/owner/repo/pull/42',
        createdAt: '2026-03-20T10:00:00Z',
        updatedAt: '2026-03-20T12:00:00Z',
      });
    });

    it('filters by merged state (returns only merged PRs)', async () => {
      const mergedPR = makeGitHubPR({
        id: 1002,
        number: 43,
        state: 'closed',
        merged_at: '2026-03-19T15:00:00Z',
      });
      const closedPR = makeGitHubPR({
        id: 1003,
        number: 44,
        state: 'closed',
        merged_at: null,
      });

      mockPullsList.mockResolvedValueOnce({
        data: [mergedPR, closedPR],
        headers: defaultHeaders(),
      });

      const result = await adapter.getPullRequests('merged');

      // Should request "closed" from GitHub API.
      expect(mockPullsList).toHaveBeenCalledWith(
        expect.objectContaining({state: 'closed'}),
      );

      // Should filter to only the PR with merged_at set.
      expect(result).toHaveLength(1);
      expect(result[0].number).toBe(43);
      expect(result[0].state).toBe('merged');
    });

    it('handles PRs with missing user gracefully', async () => {
      const prNoUser = makeGitHubPR({user: null});
      mockPullsList.mockResolvedValueOnce({
        data: [prNoUser],
        headers: defaultHeaders(),
      });

      const result = await adapter.getPullRequests('open');

      expect(result[0].author).toBe('unknown');
    });
  });

  // -----------------------------------------------------------------------
  // getDiff
  // -----------------------------------------------------------------------

  describe('getDiff', () => {
    it('returns parsed Diff with file changes', async () => {
      mockReposCompareCommits.mockResolvedValueOnce({
        data: {
          files: [
            {
              filename: 'src/auth.ts',
              status: 'added',
              additions: 50,
              deletions: 0,
              patch: '@@ +1,50 @@\n+export function authenticate() {}',
            },
            {
              filename: 'src/utils.ts',
              status: 'modified',
              additions: 10,
              deletions: 5,
              patch: '@@ -1,5 +1,10 @@\n-old\n+new',
            },
            {
              filename: 'src/legacy.ts',
              status: 'removed',
              additions: 0,
              deletions: 30,
              patch: undefined,
            },
            {
              filename: 'src/renamed.ts',
              status: 'renamed',
              additions: 2,
              deletions: 1,
              patch: '@@ -1 +1 @@\n-old\n+new',
            },
          ],
        },
        headers: defaultHeaders(),
      });

      const diff = await adapter.getDiff('main', 'feat/security');

      expect(mockReposCompareCommits).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        base: 'main',
        head: 'feat/security',
      });

      expect(diff.files).toHaveLength(4);
      expect(diff.additions).toBe(62);
      expect(diff.deletions).toBe(36);

      expect(diff.files[0]).toEqual({
        path: 'src/auth.ts',
        status: 'added',
        additions: 50,
        deletions: 0,
        patch: '@@ +1,50 @@\n+export function authenticate() {}',
      });

      expect(diff.files[2].status).toBe('deleted');
      expect(diff.files[3].status).toBe('renamed');
    });

    it('handles a comparison with no files', async () => {
      mockReposCompareCommits.mockResolvedValueOnce({
        data: {files: undefined},
        headers: defaultHeaders(),
      });

      const diff = await adapter.getDiff('main', 'main');

      expect(diff.files).toHaveLength(0);
      expect(diff.additions).toBe(0);
      expect(diff.deletions).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // getBranches
  // -----------------------------------------------------------------------

  describe('getBranches', () => {
    it('returns mapped Branch objects with isDefault flag', async () => {
      mockReposGet.mockResolvedValueOnce({
        data: {default_branch: 'main'},
        headers: defaultHeaders(),
      });

      mockReposListBranches.mockResolvedValueOnce({
        data: [
          {name: 'main', commit: {sha: 'abc123'}},
          {name: 'develop', commit: {sha: 'def456'}},
          {name: 'feat/new-feature', commit: {sha: 'ghi789'}},
        ],
        headers: defaultHeaders(),
      });

      const branches = await adapter.getBranches();

      expect(branches).toHaveLength(3);
      expect(branches[0]).toEqual({
        name: 'main',
        isDefault: true,
        lastCommit: 'abc123',
      });
      expect(branches[1]).toEqual({
        name: 'develop',
        isDefault: false,
        lastCommit: 'def456',
      });
      expect(branches[2]).toEqual({
        name: 'feat/new-feature',
        isDefault: false,
        lastCommit: 'ghi789',
      });
    });
  });

  // -----------------------------------------------------------------------
  // createIssue
  // -----------------------------------------------------------------------

  describe('createIssue', () => {
    it('calls API with correct params and returns URL', async () => {
      mockIssuesCreate.mockResolvedValueOnce({
        data: {
          html_url: 'https://github.com/test-owner/test-repo/issues/99',
        },
        headers: defaultHeaders(),
      });

      const url = await adapter.createIssue({
        title: 'SQL Injection in /api/users',
        body: 'Found a SQL injection vulnerability...',
        severity: 'critical',
        labels: ['security', 'critical'],
      });

      expect(mockIssuesCreate).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        title: 'SQL Injection in /api/users',
        body: 'Found a SQL injection vulnerability...',
        labels: ['security', 'critical'],
      });

      expect(url).toBe(
        'https://github.com/test-owner/test-repo/issues/99',
      );
    });
  });

  // -----------------------------------------------------------------------
  // createPullRequest
  // -----------------------------------------------------------------------

  describe('createPullRequest', () => {
    it('calls API with correct params and returns URL', async () => {
      mockPullsCreate.mockResolvedValueOnce({
        data: {
          html_url: 'https://github.com/test-owner/test-repo/pull/100',
        },
        headers: defaultHeaders(),
      });

      const url = await adapter.createPullRequest(
        'fix: patch SQL injection',
        'This PR fixes the injection vulnerability.',
        'fix/sql-injection',
        'main',
      );

      expect(mockPullsCreate).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        title: 'fix: patch SQL injection',
        body: 'This PR fixes the injection vulnerability.',
        head: 'fix/sql-injection',
        base: 'main',
      });

      expect(url).toBe(
        'https://github.com/test-owner/test-repo/pull/100',
      );
    });
  });

  // -----------------------------------------------------------------------
  // commentOnPR
  // -----------------------------------------------------------------------

  describe('commentOnPR', () => {
    it('posts review with inline comments and summary', async () => {
      mockPullsCreateReview.mockResolvedValueOnce({
        data: {},
        headers: defaultHeaders(),
      });

      const review: SecurityReview = {
        summary:
          'Found 2 security issues that need to be addressed before merge.',
        findings: [
          {
            file: 'src/auth.ts',
            line: 15,
            severity: 'critical',
            message: 'Hardcoded credentials detected',
            suggestedFix: 'Use environment variables instead.',
          },
          {
            file: 'src/db.ts',
            line: 42,
            severity: 'high',
            message: 'SQL injection via string concatenation',
          },
        ],
        approved: false,
      };

      await adapter.commentOnPR(42, review);

      expect(mockPullsCreateReview).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        pull_number: 42,
        body: review.summary,
        event: 'REQUEST_CHANGES',
        comments: [
          {
            path: 'src/auth.ts',
            line: 15,
            body:
              '**[CRITICAL]** Hardcoded credentials detected\n\n' +
              '**Suggested fix:**\n```\nUse environment variables instead.\n```',
          },
          {
            path: 'src/db.ts',
            line: 42,
            body: '**[HIGH]** SQL injection via string concatenation',
          },
        ],
      });
    });

    it('sends APPROVE event when review is approved', async () => {
      mockPullsCreateReview.mockResolvedValueOnce({
        data: {},
        headers: defaultHeaders(),
      });

      const review: SecurityReview = {
        summary: 'No security issues found.',
        findings: [],
        approved: true,
      };

      await adapter.commentOnPR(10, review);

      expect(mockPullsCreateReview).toHaveBeenCalledWith(
        expect.objectContaining({event: 'APPROVE'}),
      );
    });
  });

  // -----------------------------------------------------------------------
  // Error handling
  // -----------------------------------------------------------------------

  describe('error handling', () => {
    it('handles 404 error with descriptive message', async () => {
      const notFoundError = Object.assign(
        new Error('Not Found'),
        {status: 404},
      );
      mockPullsList.mockRejectedValueOnce(notFoundError);

      await expect(adapter.getPullRequests('open')).rejects.toThrow(
        /repository or resource not found \(404\)/,
      );
    });

    it('handles 403 error with permissions message', async () => {
      const forbiddenError = Object.assign(
        new Error('Forbidden'),
        {status: 403},
      );
      mockReposCompareCommits.mockRejectedValueOnce(forbiddenError);

      await expect(adapter.getDiff('main', 'dev')).rejects.toThrow(
        /insufficient permissions \(403\)/,
      );
    });

    it('wraps other Octokit errors with status and context', async () => {
      const serverError = Object.assign(
        new Error('Internal Server Error'),
        {status: 500},
      );
      mockIssuesCreate.mockRejectedValueOnce(serverError);

      await expect(
        adapter.createIssue({
          title: 'Test',
          body: 'Body',
          severity: 'low',
          labels: [],
        }),
      ).rejects.toThrow(/createIssue failed \(500\)/);
    });

    it('wraps non-Error thrown values', async () => {
      mockReposListBranches.mockRejectedValueOnce('string error');
      mockReposGet.mockResolvedValueOnce({
        data: {default_branch: 'main'},
        headers: defaultHeaders(),
      });

      await expect(adapter.getBranches()).rejects.toThrow(
        /getBranches failed: string error/,
      );
    });
  });

  // -----------------------------------------------------------------------
  // Rate limit warnings
  // -----------------------------------------------------------------------

  describe('rate limit warnings', () => {
    it('logs warning when rate limit is low', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      mockPullsList.mockResolvedValueOnce({
        data: [],
        headers: {
          'x-ratelimit-remaining': '50',
          'x-ratelimit-limit': '5000',
          'x-ratelimit-reset': String(
            Math.floor(Date.now() / 1000) + 3600,
          ),
        },
      });

      await adapter.getPullRequests('open');

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Rate limit low: 50 requests remaining'),
      );

      warnSpy.mockRestore();
    });

    it('does not log warning when rate limit is healthy', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      mockPullsList.mockResolvedValueOnce({
        data: [],
        headers: defaultHeaders(), // 4999 remaining
      });

      await adapter.getPullRequests('open');

      expect(warnSpy).not.toHaveBeenCalled();

      warnSpy.mockRestore();
    });
  });

  // -----------------------------------------------------------------------
  // Event handlers
  // -----------------------------------------------------------------------

  describe('event handlers', () => {
    it('onPullRequestOpened stores callback', () => {
      const handler = vi.fn();
      // Should not throw; just stores the handler.
      adapter.onPullRequestOpened(handler);

      // Calling again should also work (multiple handlers).
      const handler2 = vi.fn();
      adapter.onPullRequestOpened(handler2);

      // No assertion on internal storage — just verifying no error.
      expect(true).toBe(true);
    });

    it('onPush stores callback', () => {
      const handler = vi.fn();
      adapter.onPush(handler);

      // No assertion on internal storage — just verifying no error.
      expect(true).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Adapter name
  // -----------------------------------------------------------------------

  describe('adapter metadata', () => {
    it('has name "github"', () => {
      expect(adapter.name).toBe('github');
    });
  });

  // -----------------------------------------------------------------------
  // GitHub Enterprise support
  // -----------------------------------------------------------------------

  describe('GitHub Enterprise', () => {
    it('passes custom apiBaseUrl to Octokit', async () => {
      const {Octokit: MockOctokit} = await import('@octokit/rest');

      createGitHubAdapter({
        token: 'ghe_token',
        owner: 'corp',
        repo: 'internal',
        apiBaseUrl: 'https://github.corp.com/api/v3',
      });

      expect(MockOctokit).toHaveBeenCalledWith({
        auth: 'ghe_token',
        baseUrl: 'https://github.corp.com/api/v3',
      });
    });
  });
});
