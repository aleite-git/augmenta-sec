/**
 * Tests for the Bitbucket GitPlatform adapter.
 *
 * Mocks the global fetch — no real API calls are made.
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {createBitbucketAdapter} from '../bitbucket.js';
import type {BitbucketConfig} from '../bitbucket.js';
import type {GitPlatform, SecurityReview} from '../types.js';

// ---------------------------------------------------------------------------
// Mock fetch
// ---------------------------------------------------------------------------

const mockFetch = vi.fn();

vi.stubGlobal('fetch', mockFetch);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG: BitbucketConfig = {
  username: 'testuser',
  appPassword: 'test-app-password',
  workspace: 'test-workspace',
  repoSlug: 'test-repo',
};

/**
 * Creates a mock Response object with the given body and status.
 */
function mockResponse(
  body: unknown,
  status = 200,
): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
    headers: new Headers(),
  } as unknown as Response;
}

/**
 * Creates a mock Bitbucket PR object.
 */
function makeBitbucketPR(overrides: Record<string, unknown> = {}) {
  return {
    id: 42,
    title: 'Add security checks',
    state: 'OPEN',
    author: {display_name: 'testuser'},
    destination: {branch: {name: 'main'}},
    source: {branch: {name: 'feat/security'}},
    links: {html: {href: 'https://bitbucket.org/test-workspace/test-repo/pull-requests/42'}},
    created_on: '2026-03-20T10:00:00.000000+00:00',
    updated_on: '2026-03-20T12:00:00.000000+00:00',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Bitbucket adapter', () => {
  let adapter: GitPlatform;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = createBitbucketAdapter(DEFAULT_CONFIG);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -----------------------------------------------------------------------
  // Adapter metadata
  // -----------------------------------------------------------------------

  describe('adapter metadata', () => {
    it('has name "bitbucket"', () => {
      expect(adapter.name).toBe('bitbucket');
    });
  });

  // -----------------------------------------------------------------------
  // Authentication
  // -----------------------------------------------------------------------

  describe('authentication', () => {
    it('sends Basic auth header with base64-encoded credentials', async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({values: []}),
      );

      await adapter.getPullRequests('open');

      const expectedAuth = `Basic ${Buffer.from('testuser:test-app-password').toString('base64')}`;
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: expectedAuth,
          }),
        }),
      );
    });
  });

  // -----------------------------------------------------------------------
  // Custom API base URL
  // -----------------------------------------------------------------------

  describe('custom apiBaseUrl', () => {
    it('uses custom base URL when provided', async () => {
      const customAdapter = createBitbucketAdapter({
        ...DEFAULT_CONFIG,
        apiBaseUrl: 'https://custom.bitbucket.example.com/2.0',
      });

      mockFetch.mockResolvedValueOnce(
        mockResponse({values: []}),
      );

      await customAdapter.getPullRequests('open');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('https://custom.bitbucket.example.com/2.0/'),
        expect.any(Object),
      );
    });

    it('uses default Bitbucket API URL when apiBaseUrl not provided', async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({values: []}),
      );

      await adapter.getPullRequests('open');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('https://api.bitbucket.org/2.0/'),
        expect.any(Object),
      );
    });
  });

  // -----------------------------------------------------------------------
  // getPullRequests
  // -----------------------------------------------------------------------

  describe('getPullRequests', () => {
    it('returns mapped PullRequest objects for open PRs', async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({values: [makeBitbucketPR()]}),
      );

      const result = await adapter.getPullRequests('open');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/pullrequests?state=OPEN&pagelen=100'),
        expect.any(Object),
      );

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        id: '42',
        number: 42,
        title: 'Add security checks',
        state: 'open',
        author: 'testuser',
        baseBranch: 'main',
        headBranch: 'feat/security',
        url: 'https://bitbucket.org/test-workspace/test-repo/pull-requests/42',
        createdAt: '2026-03-20T10:00:00.000000+00:00',
        updatedAt: '2026-03-20T12:00:00.000000+00:00',
      });
    });

    it('returns mapped PullRequest objects for merged PRs', async () => {
      const mergedPR = makeBitbucketPR({
        id: 43,
        state: 'MERGED',
      });

      mockFetch.mockResolvedValueOnce(
        mockResponse({values: [mergedPR]}),
      );

      const result = await adapter.getPullRequests('merged');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/pullrequests?state=MERGED&pagelen=100'),
        expect.any(Object),
      );

      expect(result).toHaveLength(1);
      expect(result[0].state).toBe('merged');
      expect(result[0].number).toBe(43);
    });

    it('maps DECLINED state to closed', async () => {
      const declinedPR = makeBitbucketPR({state: 'DECLINED'});
      mockFetch.mockResolvedValueOnce(
        mockResponse({values: [declinedPR]}),
      );

      const result = await adapter.getPullRequests('open');

      expect(result[0].state).toBe('closed');
    });

    it('maps SUPERSEDED state to closed', async () => {
      const supersededPR = makeBitbucketPR({state: 'SUPERSEDED'});
      mockFetch.mockResolvedValueOnce(
        mockResponse({values: [supersededPR]}),
      );

      const result = await adapter.getPullRequests('open');

      expect(result[0].state).toBe('closed');
    });

    it('handles PR with missing author gracefully', async () => {
      const prNoAuthor = makeBitbucketPR({author: null});
      mockFetch.mockResolvedValueOnce(
        mockResponse({values: [prNoAuthor]}),
      );

      const result = await adapter.getPullRequests('open');

      expect(result[0].author).toBe('unknown');
    });

    it('handles empty values array', async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({values: []}),
      );

      const result = await adapter.getPullRequests('open');

      expect(result).toHaveLength(0);
    });

    it('handles missing values field', async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({}),
      );

      const result = await adapter.getPullRequests('open');

      expect(result).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // getDiff
  // -----------------------------------------------------------------------

  describe('getDiff', () => {
    it('returns parsed Diff with file changes', async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({
          values: [
            {
              new: {path: 'src/auth.ts'},
              old: null,
              status: 'added',
              lines_added: 50,
              lines_removed: 0,
            },
            {
              new: {path: 'src/utils.ts'},
              old: {path: 'src/utils.ts'},
              status: 'modified',
              lines_added: 10,
              lines_removed: 5,
            },
            {
              new: null,
              old: {path: 'src/legacy.ts'},
              status: 'removed',
              lines_added: 0,
              lines_removed: 30,
            },
            {
              new: {path: 'src/renamed.ts'},
              old: {path: 'src/old-name.ts'},
              status: 'renamed',
              lines_added: 2,
              lines_removed: 1,
            },
          ],
        }),
      );

      const diff = await adapter.getDiff('main', 'feat/security');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/diffstat/main..feat/security?pagelen=100'),
        expect.any(Object),
      );

      expect(diff.files).toHaveLength(4);
      expect(diff.additions).toBe(62);
      expect(diff.deletions).toBe(36);

      expect(diff.files[0]).toEqual({
        path: 'src/auth.ts',
        status: 'added',
        additions: 50,
        deletions: 0,
      });

      expect(diff.files[2]).toEqual({
        path: 'src/legacy.ts',
        status: 'deleted',
        additions: 0,
        deletions: 30,
      });

      expect(diff.files[3].status).toBe('renamed');
    });

    it('handles diff with no files', async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({values: []}),
      );

      const diff = await adapter.getDiff('main', 'main');

      expect(diff.files).toHaveLength(0);
      expect(diff.additions).toBe(0);
      expect(diff.deletions).toBe(0);
    });

    it('falls back to old path when new path is missing', async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({
          values: [
            {
              new: null,
              old: {path: 'src/deleted.ts'},
              status: 'removed',
              lines_added: 0,
              lines_removed: 10,
            },
          ],
        }),
      );

      const diff = await adapter.getDiff('main', 'feat/delete');

      expect(diff.files[0].path).toBe('src/deleted.ts');
    });

    it('handles missing lines_added and lines_removed', async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({
          values: [
            {
              new: {path: 'src/file.ts'},
              old: null,
              status: 'added',
            },
          ],
        }),
      );

      const diff = await adapter.getDiff('main', 'feat/new');

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
        mockResponse({
          values: [
            {
              name: 'main',
              target: {hash: 'abc123def456'},
            },
            {
              name: 'develop',
              target: {hash: 'def456ghi789'},
            },
            {
              name: 'feat/new-feature',
              target: {hash: 'ghi789jkl012'},
            },
          ],
          mainbranch: {name: 'main'},
        }),
      );

      const branches = await adapter.getBranches();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/refs/branches?pagelen=100'),
        expect.any(Object),
      );

      expect(branches).toHaveLength(3);
      expect(branches[0]).toEqual({
        name: 'main',
        isDefault: true,
        lastCommit: 'abc123def456',
      });
      expect(branches[1]).toEqual({
        name: 'develop',
        isDefault: false,
        lastCommit: 'def456ghi789',
      });
      expect(branches[2]).toEqual({
        name: 'feat/new-feature',
        isDefault: false,
        lastCommit: 'ghi789jkl012',
      });
    });

    it('handles missing mainbranch field', async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({
          values: [
            {name: 'main', target: {hash: 'abc123'}},
          ],
        }),
      );

      const branches = await adapter.getBranches();

      // Without mainbranch info, isDefault should be false.
      expect(branches[0].isDefault).toBe(false);
    });

    it('handles branch with missing target', async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({
          values: [
            {name: 'main', target: null},
          ],
          mainbranch: {name: 'main'},
        }),
      );

      const branches = await adapter.getBranches();

      expect(branches[0].lastCommit).toBe('');
    });
  });

  // -----------------------------------------------------------------------
  // createIssue
  // -----------------------------------------------------------------------

  describe('createIssue', () => {
    it('calls API with correct params and returns URL', async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({
          links: {
            html: {
              href: 'https://bitbucket.org/test-workspace/test-repo/issues/99',
            },
          },
        }),
      );

      const url = await adapter.createIssue({
        title: 'SQL Injection in /api/users',
        body: 'Found a SQL injection vulnerability...',
        severity: 'critical',
        labels: ['security', 'critical'],
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/issues'),
        expect.objectContaining({
          method: 'POST',
          body: expect.any(String),
        }),
      );

      // Verify the request body.
      const callArgs = mockFetch.mock.calls[0];
      const requestBody = JSON.parse(callArgs[1].body as string);
      expect(requestBody).toEqual({
        title: 'SQL Injection in /api/users',
        content: {raw: 'Found a SQL injection vulnerability...'},
        priority: 'critical',
        kind: 'bug',
      });

      expect(url).toBe(
        'https://bitbucket.org/test-workspace/test-repo/issues/99',
      );
    });

    it('maps severity to Bitbucket priority correctly', async () => {
      const severityMap: Array<[string, string]> = [
        ['critical', 'critical'],
        ['high', 'major'],
        ['medium', 'major'],
        ['low', 'minor'],
        ['informational', 'trivial'],
      ];

      for (const [severity, expectedPriority] of severityMap) {
        mockFetch.mockResolvedValueOnce(
          mockResponse({links: {html: {href: 'https://example.com'}}}),
        );

        await adapter.createIssue({
          title: 'Test',
          body: 'Body',
          severity: severity as 'critical' | 'high' | 'medium' | 'low' | 'informational',
          labels: [],
        });

        const callArgs = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
        const requestBody = JSON.parse(callArgs[1].body as string);
        expect(requestBody.priority).toBe(expectedPriority);
      }
    });
  });

  // -----------------------------------------------------------------------
  // createPullRequest
  // -----------------------------------------------------------------------

  describe('createPullRequest', () => {
    it('calls API with correct params and returns URL', async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({
          links: {
            html: {
              href: 'https://bitbucket.org/test-workspace/test-repo/pull-requests/100',
            },
          },
        }),
      );

      const url = await adapter.createPullRequest(
        'fix: patch SQL injection',
        'This PR fixes the injection vulnerability.',
        'fix/sql-injection',
        'main',
      );

      const callArgs = mockFetch.mock.calls[0];
      const requestBody = JSON.parse(callArgs[1].body as string);
      expect(requestBody).toEqual({
        title: 'fix: patch SQL injection',
        description: 'This PR fixes the injection vulnerability.',
        source: {branch: {name: 'fix/sql-injection'}},
        destination: {branch: {name: 'main'}},
        close_source_branch: true,
      });

      expect(url).toBe(
        'https://bitbucket.org/test-workspace/test-repo/pull-requests/100',
      );
    });
  });

  // -----------------------------------------------------------------------
  // commentOnPR
  // -----------------------------------------------------------------------

  describe('commentOnPR', () => {
    it('posts summary comment and inline finding comments', async () => {
      // First call: summary comment. Then one per finding.
      mockFetch
        .mockResolvedValueOnce(mockResponse({id: 1}))
        .mockResolvedValueOnce(mockResponse({id: 2}))
        .mockResolvedValueOnce(mockResponse({id: 3}));

      const review: SecurityReview = {
        summary: 'Found 2 security issues.',
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

      // Should be 3 calls: 1 summary + 2 findings.
      expect(mockFetch).toHaveBeenCalledTimes(3);

      // Verify summary comment.
      const summaryCall = mockFetch.mock.calls[0];
      expect(summaryCall[0]).toContain('/pullrequests/42/comments');
      const summaryBody = JSON.parse(summaryCall[1].body as string);
      expect(summaryBody.content.raw).toBe('Found 2 security issues.');

      // Verify first inline comment.
      const finding1Call = mockFetch.mock.calls[1];
      const finding1Body = JSON.parse(finding1Call[1].body as string);
      expect(finding1Body.content.raw).toContain('**[CRITICAL]**');
      expect(finding1Body.content.raw).toContain('Hardcoded credentials detected');
      expect(finding1Body.content.raw).toContain('**Suggested fix:**');
      expect(finding1Body.inline).toEqual({
        path: 'src/auth.ts',
        to: 15,
      });

      // Verify second inline comment (no suggested fix).
      const finding2Call = mockFetch.mock.calls[2];
      const finding2Body = JSON.parse(finding2Call[1].body as string);
      expect(finding2Body.content.raw).toBe(
        '**[HIGH]** SQL injection via string concatenation',
      );
      expect(finding2Body.inline).toEqual({
        path: 'src/db.ts',
        to: 42,
      });
    });

    it('posts only summary when there are no findings', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({id: 1}));

      const review: SecurityReview = {
        summary: 'No security issues found.',
        findings: [],
        approved: true,
      };

      await adapter.commentOnPR(10, review);

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  // -----------------------------------------------------------------------
  // Error handling
  // -----------------------------------------------------------------------

  describe('error handling', () => {
    it('handles 401 error with authentication message', async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({error: 'Unauthorized'}, 401),
      );

      await expect(adapter.getPullRequests('open')).rejects.toThrow(
        /authentication failed \(401\)/,
      );
    });

    it('handles 403 error with permissions message', async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({error: 'Forbidden'}, 403),
      );

      await expect(adapter.getDiff('main', 'dev')).rejects.toThrow(
        /insufficient permissions \(403\)/,
      );
    });

    it('handles 404 error with not found message', async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({error: 'Not Found'}, 404),
      );

      await expect(adapter.getBranches()).rejects.toThrow(
        /resource not found \(404\)/,
      );
    });

    it('handles other HTTP errors with status and message', async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({error: 'Internal Server Error'}, 500),
      );

      await expect(
        adapter.createIssue({
          title: 'Test',
          body: 'Body',
          severity: 'low',
          labels: [],
        }),
      ).rejects.toThrow(/createIssue failed \(500\)/);
    });

    it('includes context in error messages for createPullRequest', async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({error: 'Conflict'}, 409),
      );

      await expect(
        adapter.createPullRequest('title', 'body', 'head', 'base'),
      ).rejects.toThrow(/createPullRequest failed \(409\)/);
    });

    it('includes context in error messages for commentOnPR', async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({error: 'Not Found'}, 404),
      );

      await expect(
        adapter.commentOnPR(999, {
          summary: 'test',
          findings: [],
          approved: true,
        }),
      ).rejects.toThrow(/resource not found \(404\)/);
    });
  });

  // -----------------------------------------------------------------------
  // Event handlers
  // -----------------------------------------------------------------------

  describe('event handlers', () => {
    it('onPullRequestOpened stores callback without error', () => {
      const handler = vi.fn();
      adapter.onPullRequestOpened(handler);

      // Multiple handlers should also work.
      const handler2 = vi.fn();
      adapter.onPullRequestOpened(handler2);

      expect(true).toBe(true);
    });

    it('onPush stores callback without error', () => {
      const handler = vi.fn();
      adapter.onPush(handler);

      expect(true).toBe(true);
    });
  });
});
