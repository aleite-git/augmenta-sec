/**
 * Tests for the GitLab GitPlatform adapter.
 *
 * Mocks global `fetch` — no real API calls are made.
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {createGitLabAdapter} from '../gitlab.js';
import type {GitLabConfig} from '../gitlab.js';
import type {GitPlatform, SecurityReview} from '../types.js';

// ---------------------------------------------------------------------------
// Mock fetch
// ---------------------------------------------------------------------------

const mockFetch = vi.fn();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function defaultHeaders(): HeadersInit {
  return {
    'ratelimit-remaining': '4999',
    'ratelimit-limit': '5000',
    'ratelimit-reset': String(Math.floor(Date.now() / 1000) + 3600),
  };
}

function okResponse(
  data: unknown,
  headers?: HeadersInit,
): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    statusText: 'OK',
    headers: headers ?? defaultHeaders(),
  });
}

function errorResponse(
  status: number,
  statusText: string,
  body?: Record<string, unknown>,
): Response {
  return new Response(
    body ? JSON.stringify(body) : statusText,
    {
      status,
      statusText,
      headers: body
        ? {'Content-Type': 'application/json'}
        : {},
    },
  );
}

function makeGitLabMR(overrides: Record<string, unknown> = {}) {
  return {
    id: 2001,
    iid: 10,
    title: 'Add security checks',
    state: 'opened',
    author: {username: 'gitlab-user'},
    target_branch: 'main',
    source_branch: 'feat/security',
    web_url: 'https://gitlab.com/group/project/-/merge_requests/10',
    created_at: '2026-03-20T10:00:00Z',
    updated_at: '2026-03-20T12:00:00Z',
    ...overrides,
  };
}

const defaultConfig: GitLabConfig = {
  token: 'glpat-test-token',
  projectId: 12345,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GitLab adapter', () => {
  let adapter: GitPlatform;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', mockFetch);
    adapter = createGitLabAdapter(defaultConfig);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // -----------------------------------------------------------------------
  // getPullRequests
  // -----------------------------------------------------------------------

  describe('getPullRequests', () => {
    it('returns mapped PullRequest objects for open MRs', async () => {
      mockFetch.mockResolvedValueOnce(okResponse([makeGitLabMR()]));

      const result = await adapter.getPullRequests('open');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://gitlab.com/api/v4/projects/12345/merge_requests?state=opened&per_page=100',
        expect.objectContaining({
          headers: expect.objectContaining({
            'PRIVATE-TOKEN': 'glpat-test-token',
          }),
        }),
      );

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        id: '2001',
        number: 10,
        title: 'Add security checks',
        state: 'open',
        author: 'gitlab-user',
        baseBranch: 'main',
        headBranch: 'feat/security',
        url: 'https://gitlab.com/group/project/-/merge_requests/10',
        createdAt: '2026-03-20T10:00:00Z',
        updatedAt: '2026-03-20T12:00:00Z',
      });
    });

    it('returns merged MRs with state mapped correctly', async () => {
      const mergedMR = makeGitLabMR({
        id: 2002,
        iid: 11,
        state: 'merged',
      });

      mockFetch.mockResolvedValueOnce(okResponse([mergedMR]));

      const result = await adapter.getPullRequests('merged');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('state=merged'),
        expect.anything(),
      );

      expect(result).toHaveLength(1);
      expect(result[0].state).toBe('merged');
    });

    it('handles MRs with missing author gracefully', async () => {
      const mrNoAuthor = makeGitLabMR({author: null});
      mockFetch.mockResolvedValueOnce(okResponse([mrNoAuthor]));

      const result = await adapter.getPullRequests('open');

      expect(result[0].author).toBe('unknown');
    });

    it('maps closed MR state correctly', async () => {
      const closedMR = makeGitLabMR({state: 'closed'});
      mockFetch.mockResolvedValueOnce(okResponse([closedMR]));

      const result = await adapter.getPullRequests('open');

      expect(result[0].state).toBe('closed');
    });
  });

  // -----------------------------------------------------------------------
  // getDiff
  // -----------------------------------------------------------------------

  describe('getDiff', () => {
    it('returns parsed Diff with file changes', async () => {
      mockFetch.mockResolvedValueOnce(
        okResponse({
          diffs: [
            {
              old_path: 'src/auth.ts',
              new_path: 'src/auth.ts',
              new_file: true,
              renamed_file: false,
              deleted_file: false,
              diff:
                '@@ -0,0 +1,3 @@\n+line1\n+line2\n+line3',
            },
            {
              old_path: 'src/utils.ts',
              new_path: 'src/utils.ts',
              new_file: false,
              renamed_file: false,
              deleted_file: false,
              diff:
                '@@ -1,2 +1,3 @@\n-old line\n+new line\n+extra line',
            },
            {
              old_path: 'src/legacy.ts',
              new_path: 'src/legacy.ts',
              new_file: false,
              renamed_file: false,
              deleted_file: true,
              diff:
                '@@ -1,2 +0,0 @@\n-deleted1\n-deleted2',
            },
            {
              old_path: 'src/old-name.ts',
              new_path: 'src/new-name.ts',
              new_file: false,
              renamed_file: true,
              deleted_file: false,
              diff: '',
            },
          ],
        }),
      );

      const diff = await adapter.getDiff('main', 'feat/security');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://gitlab.com/api/v4/projects/12345/repository/compare?from=main&to=feat%2Fsecurity',
        expect.anything(),
      );

      expect(diff.files).toHaveLength(4);
      expect(diff.files[0]).toEqual({
        path: 'src/auth.ts',
        status: 'added',
        additions: 3,
        deletions: 0,
        patch: '@@ -0,0 +1,3 @@\n+line1\n+line2\n+line3',
      });

      expect(diff.files[1].status).toBe('modified');
      expect(diff.files[1].additions).toBe(2);
      expect(diff.files[1].deletions).toBe(1);

      expect(diff.files[2].status).toBe('deleted');
      expect(diff.files[3].status).toBe('renamed');

      expect(diff.additions).toBe(5); // 3 + 2 + 0 + 0
      expect(diff.deletions).toBe(3); // 0 + 1 + 2 + 0
    });

    it('handles comparison with no diffs', async () => {
      mockFetch.mockResolvedValueOnce(okResponse({diffs: []}));

      const diff = await adapter.getDiff('main', 'main');

      expect(diff.files).toHaveLength(0);
      expect(diff.additions).toBe(0);
      expect(diff.deletions).toBe(0);
    });

    it('handles null diffs array', async () => {
      mockFetch.mockResolvedValueOnce(okResponse({diffs: null}));

      const diff = await adapter.getDiff('main', 'main');

      expect(diff.files).toHaveLength(0);
    });

    it('handles empty diff string on a file', async () => {
      mockFetch.mockResolvedValueOnce(
        okResponse({
          diffs: [
            {
              old_path: 'f.ts',
              new_path: 'f.ts',
              new_file: false,
              renamed_file: false,
              deleted_file: false,
              diff: '',
            },
          ],
        }),
      );

      const diff = await adapter.getDiff('a', 'b');

      expect(diff.files[0].patch).toBeUndefined();
      expect(diff.files[0].additions).toBe(0);
      expect(diff.files[0].deletions).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // getBranches
  // -----------------------------------------------------------------------

  describe('getBranches', () => {
    it('returns mapped Branch objects with isDefault flag', async () => {
      mockFetch.mockResolvedValueOnce(
        okResponse([
          {name: 'main', default: true, commit: {id: 'abc123'}},
          {name: 'develop', default: false, commit: {id: 'def456'}},
          {name: 'feat/new-feature', default: false, commit: {id: 'ghi789'}},
        ]),
      );

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
      mockFetch.mockResolvedValueOnce(
        okResponse({
          web_url: 'https://gitlab.com/group/project/-/issues/99',
        }),
      );

      const url = await adapter.createIssue({
        title: 'SQL Injection in /api/users',
        body: 'Found a SQL injection vulnerability...',
        severity: 'critical',
        labels: ['security', 'critical'],
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://gitlab.com/api/v4/projects/12345/issues',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            title: 'SQL Injection in /api/users',
            description: 'Found a SQL injection vulnerability...',
            labels: 'security,critical',
          }),
        }),
      );

      expect(url).toBe('https://gitlab.com/group/project/-/issues/99');
    });
  });

  // -----------------------------------------------------------------------
  // createPullRequest
  // -----------------------------------------------------------------------

  describe('createPullRequest', () => {
    it('calls API with correct params and returns URL', async () => {
      mockFetch.mockResolvedValueOnce(
        okResponse({
          web_url: 'https://gitlab.com/group/project/-/merge_requests/100',
        }),
      );

      const url = await adapter.createPullRequest(
        'fix: patch SQL injection',
        'This MR fixes the injection vulnerability.',
        'fix/sql-injection',
        'main',
      );

      expect(mockFetch).toHaveBeenCalledWith(
        'https://gitlab.com/api/v4/projects/12345/merge_requests',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            title: 'fix: patch SQL injection',
            description: 'This MR fixes the injection vulnerability.',
            source_branch: 'fix/sql-injection',
            target_branch: 'main',
          }),
        }),
      );

      expect(url).toBe(
        'https://gitlab.com/group/project/-/merge_requests/100',
      );
    });
  });

  // -----------------------------------------------------------------------
  // commentOnPR
  // -----------------------------------------------------------------------

  describe('commentOnPR', () => {
    it('posts a note with findings and summary', async () => {
      mockFetch.mockResolvedValueOnce(
        okResponse({id: 1, body: 'note body'}),
      );

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

      await adapter.commentOnPR(10, review);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://gitlab.com/api/v4/projects/12345/merge_requests/10/notes',
        expect.objectContaining({method: 'POST'}),
      );

      // Verify the note body includes the review content.
      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse(callArgs[1].body as string);
      expect(body.body).toContain('Security Review');
      expect(body.body).toContain(review.summary);
      expect(body.body).toContain('src/auth.ts:15');
      expect(body.body).toContain('**[CRITICAL]**');
      expect(body.body).toContain('Use environment variables instead.');
      expect(body.body).toContain('Changes Requested');
    });

    it('shows Approved status when review is approved', async () => {
      mockFetch.mockResolvedValueOnce(
        okResponse({id: 1, body: 'note body'}),
      );

      const review: SecurityReview = {
        summary: 'No security issues found.',
        findings: [],
        approved: true,
      };

      await adapter.commentOnPR(10, review);

      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse(callArgs[1].body as string);
      expect(body.body).toContain('Approved');
      expect(body.body).not.toContain('Findings');
    });
  });

  // -----------------------------------------------------------------------
  // Error handling
  // -----------------------------------------------------------------------

  describe('error handling', () => {
    it('handles 404 error with descriptive message', async () => {
      mockFetch.mockResolvedValueOnce(
        errorResponse(404, 'Not Found'),
      );

      await expect(adapter.getPullRequests('open')).rejects.toThrow(
        /project or resource not found \(404\)/,
      );
    });

    it('handles 401 error with authentication message', async () => {
      mockFetch.mockResolvedValueOnce(
        errorResponse(401, 'Unauthorized'),
      );

      await expect(adapter.getDiff('main', 'dev')).rejects.toThrow(
        /authentication failed \(401\)/,
      );
    });

    it('handles 403 error with permissions message', async () => {
      mockFetch.mockResolvedValueOnce(
        errorResponse(403, 'Forbidden'),
      );

      await expect(adapter.getBranches()).rejects.toThrow(
        /insufficient permissions \(403\)/,
      );
    });

    it('handles 429 rate limit error', async () => {
      mockFetch.mockResolvedValueOnce(
        errorResponse(429, 'Too Many Requests'),
      );

      await expect(adapter.createIssue({
        title: 'Test',
        body: 'Body',
        severity: 'low',
        labels: [],
      })).rejects.toThrow(
        /rate limited \(429\)/,
      );
    });

    it('handles generic server error with JSON body', async () => {
      mockFetch.mockResolvedValueOnce(
        errorResponse(500, 'Internal Server Error', {
          message: 'Something went wrong',
        }),
      );

      await expect(adapter.createPullRequest(
        'Test',
        'Body',
        'head',
        'main',
      )).rejects.toThrow(
        /createPullRequest failed \(500\): Something went wrong/,
      );
    });

    it('handles generic server error with error field in body', async () => {
      mockFetch.mockResolvedValueOnce(
        errorResponse(502, 'Bad Gateway', {
          error: 'upstream timeout',
        }),
      );

      await expect(adapter.commentOnPR(1, {
        summary: 'test',
        findings: [],
        approved: true,
      })).rejects.toThrow(
        /commentOnPR failed \(502\): upstream timeout/,
      );
    });

    it('handles non-JSON error body gracefully', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response('plain text error', {
          status: 503,
          statusText: 'Service Unavailable',
        }),
      );

      await expect(adapter.getPullRequests('open')).rejects.toThrow(
        /getPullRequests failed \(503\): Service Unavailable/,
      );
    });

    it('wraps fetch network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(adapter.getPullRequests('open')).rejects.toThrow(
        /getPullRequests failed: Network error/,
      );
    });

    it('wraps non-Error thrown values', async () => {
      mockFetch.mockRejectedValueOnce('string error');

      await expect(adapter.getBranches()).rejects.toThrow(
        /getBranches failed: string error/,
      );
    });

    it('wraps errors from createIssue', async () => {
      mockFetch.mockRejectedValueOnce(new Error('connection reset'));

      await expect(adapter.createIssue({
        title: 'T',
        body: 'B',
        severity: 'low',
        labels: [],
      })).rejects.toThrow(
        /createIssue failed: connection reset/,
      );
    });

    it('wraps errors from createPullRequest', async () => {
      mockFetch.mockRejectedValueOnce(new Error('timeout'));

      await expect(adapter.createPullRequest(
        'T',
        'B',
        'h',
        'b',
      )).rejects.toThrow(
        /createPullRequest failed: timeout/,
      );
    });

    it('wraps errors from commentOnPR', async () => {
      mockFetch.mockRejectedValueOnce(new Error('dns fail'));

      await expect(adapter.commentOnPR(1, {
        summary: 's',
        findings: [],
        approved: true,
      })).rejects.toThrow(
        /commentOnPR failed: dns fail/,
      );
    });

    it('wraps non-Error from getDiff', async () => {
      mockFetch.mockRejectedValueOnce(42);

      await expect(adapter.getDiff('a', 'b')).rejects.toThrow(
        /getDiff failed: 42/,
      );
    });

    it('wraps non-Error from createPullRequest', async () => {
      mockFetch.mockRejectedValueOnce(false);

      await expect(adapter.createPullRequest(
        'T',
        'B',
        'h',
        'b',
      )).rejects.toThrow(
        /createPullRequest failed: false/,
      );
    });

    it('wraps non-Error from commentOnPR', async () => {
      mockFetch.mockRejectedValueOnce(null);

      await expect(adapter.commentOnPR(1, {
        summary: 's',
        findings: [],
        approved: true,
      })).rejects.toThrow(
        /commentOnPR failed: null/,
      );
    });

    it('wraps non-Error from createIssue', async () => {
      mockFetch.mockRejectedValueOnce(undefined);

      await expect(adapter.createIssue({
        title: 'T',
        body: 'B',
        severity: 'low',
        labels: [],
      })).rejects.toThrow(
        /createIssue failed: undefined/,
      );
    });

    it('wraps non-Error from getPullRequests', async () => {
      mockFetch.mockRejectedValueOnce({custom: 'object'});

      await expect(adapter.getPullRequests('open')).rejects.toThrow(
        /getPullRequests failed:/,
      );
    });

    it('handles error response from commentOnPR', async () => {
      mockFetch.mockResolvedValueOnce(
        errorResponse(403, 'Forbidden'),
      );

      await expect(adapter.commentOnPR(99, {
        summary: 'test',
        findings: [],
        approved: true,
      })).rejects.toThrow(
        /insufficient permissions \(403\)/,
      );
    });

    it('handles error response with array message', async () => {
      mockFetch.mockResolvedValueOnce(
        errorResponse(422, 'Unprocessable Entity', {
          message: {source_branch: ['is invalid']},
        }),
      );

      await expect(adapter.createPullRequest(
        'T',
        'B',
        'h',
        'b',
      )).rejects.toThrow(
        /createPullRequest failed \(422\)/,
      );
    });
  });

  // -----------------------------------------------------------------------
  // Rate limit warnings
  // -----------------------------------------------------------------------

  describe('rate limit warnings', () => {
    it('logs warning when rate limit is low', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      mockFetch.mockResolvedValueOnce(
        okResponse([], {
          'ratelimit-remaining': '50',
          'ratelimit-limit': '5000',
          'ratelimit-reset': String(
            Math.floor(Date.now() / 1000) + 3600,
          ),
        }),
      );

      await adapter.getPullRequests('open');

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Rate limit low: 50 requests remaining'),
      );

      warnSpy.mockRestore();
    });

    it('does not log warning when rate limit is healthy', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      mockFetch.mockResolvedValueOnce(okResponse([])); // defaultHeaders = 4999

      await adapter.getPullRequests('open');

      expect(warnSpy).not.toHaveBeenCalled();

      warnSpy.mockRestore();
    });
  });

  // -----------------------------------------------------------------------
  // Event handlers
  // -----------------------------------------------------------------------

  describe('event handlers', () => {
    it('onPullRequestOpened stores callback without error', () => {
      const handler = vi.fn();
      adapter.onPullRequestOpened(handler);

      const handler2 = vi.fn();
      adapter.onPullRequestOpened(handler2);

      // No assertion on internal storage — just verifying no error.
      expect(true).toBe(true);
    });

    it('onPush stores callback without error', () => {
      const handler = vi.fn();
      adapter.onPush(handler);

      expect(true).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Adapter metadata
  // -----------------------------------------------------------------------

  describe('adapter metadata', () => {
    it('has name "gitlab"', () => {
      expect(adapter.name).toBe('gitlab');
    });
  });

  // -----------------------------------------------------------------------
  // Custom API base URL
  // -----------------------------------------------------------------------

  describe('self-hosted GitLab', () => {
    it('uses custom apiBaseUrl when provided', async () => {
      const customAdapter = createGitLabAdapter({
        token: 'custom-token',
        projectId: 'group/project',
        apiBaseUrl: 'https://gitlab.corp.com/api/v4',
      });

      mockFetch.mockResolvedValueOnce(okResponse([]));

      await customAdapter.getPullRequests('open');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('https://gitlab.corp.com/api/v4/projects/group%2Fproject/'),
        expect.anything(),
      );
    });
  });

  // -----------------------------------------------------------------------
  // URL encoding of project ID
  // -----------------------------------------------------------------------

  describe('project ID encoding', () => {
    it('URL-encodes string project IDs (e.g. group/project)', async () => {
      const groupAdapter = createGitLabAdapter({
        token: 'tok',
        projectId: 'my-group/my-project',
      });

      mockFetch.mockResolvedValueOnce(okResponse([]));

      await groupAdapter.getBranches();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/projects/my-group%2Fmy-project/'),
        expect.anything(),
      );
    });

    it('leaves numeric project IDs as-is', async () => {
      mockFetch.mockResolvedValueOnce(okResponse([]));

      await adapter.getBranches();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/projects/12345/'),
        expect.anything(),
      );
    });
  });
});
