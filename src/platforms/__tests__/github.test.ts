/**
 * Tests for the GitHub PlatformAdapter (ASEC-040).
 *
 * Mocks global fetch — no real API calls are made.
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {createGitHubPlatformAdapter} from '../github.js';
import type {PlatformAdapter, ReviewPayload} from '../types.js';

// ---------------------------------------------------------------------------
// Mock fetch
// ---------------------------------------------------------------------------

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function jsonResponse(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  const body = JSON.stringify(data);
  return new Response(body, {
    status,
    headers: {
      'Content-Type': 'application/json',
      'x-ratelimit-remaining': '4999',
      'x-ratelimit-limit': '5000',
      ...headers,
    },
  });
}

function textResponse(text: string, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(text, {
    status,
    headers: {
      'Content-Type': 'text/plain',
      'x-ratelimit-remaining': '4999',
      'x-ratelimit-limit': '5000',
      ...headers,
    },
  });
}

function errorResponse(status: number, body = ''): Response {
  return new Response(body, {
    status,
    headers: {'Content-Type': 'text/plain'},
  });
}

function makeAdapter(overrides: Record<string, string> = {}): PlatformAdapter {
  return createGitHubPlatformAdapter({
    token: 'ghp_test_token',
    owner: 'test-owner',
    repo: 'test-repo',
    ...overrides,
  });
}

function makeGitHubPR(overrides: Record<string, unknown> = {}) {
  return {
    number: 42,
    title: 'Add security checks',
    state: 'open',
    merged_at: null,
    user: {login: 'octocat'},
    base: {ref: 'main'},
    head: {ref: 'feat/security'},
    html_url: 'https://github.com/test-owner/test-repo/pull/42',
    ...overrides,
  };
}

function makeGitHubFile(overrides: Record<string, unknown> = {}) {
  return {
    filename: 'src/auth.ts',
    status: 'added',
    additions: 50,
    deletions: 0,
    patch: '@@ +1,50 @@\n+export function authenticate() {}',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GitHubPlatformAdapter', () => {
  let adapter: PlatformAdapter;

  beforeEach(() => {
    adapter = makeAdapter();
  });

  // -----------------------------------------------------------------------
  // name
  // -----------------------------------------------------------------------

  it('has name "github"', () => {
    expect(adapter.name).toBe('github');
  });

  // -----------------------------------------------------------------------
  // getPRInfo
  // -----------------------------------------------------------------------

  describe('getPRInfo', () => {
    it('returns PR metadata for an open PR', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(makeGitHubPR()));

      const info = await adapter.getPRInfo(42);

      expect(info).toEqual({
        number: 42,
        title: 'Add security checks',
        state: 'open',
        author: 'octocat',
        baseBranch: 'main',
        headBranch: 'feat/security',
        url: 'https://github.com/test-owner/test-repo/pull/42',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.github.com/repos/test-owner/test-repo/pulls/42',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer ghp_test_token',
          }),
        }),
      );
    });

    it('detects merged state from merged_at', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse(makeGitHubPR({state: 'closed', merged_at: '2026-03-20T15:00:00Z'})),
      );

      const info = await adapter.getPRInfo(42);
      expect(info.state).toBe('merged');
    });

    it('detects closed state', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse(makeGitHubPR({state: 'closed', merged_at: null})),
      );

      const info = await adapter.getPRInfo(42);
      expect(info.state).toBe('closed');
    });

    it('handles missing user gracefully', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(makeGitHubPR({user: null})));

      const info = await adapter.getPRInfo(42);
      expect(info.author).toBe('unknown');
    });
  });

  // -----------------------------------------------------------------------
  // getPRDiff
  // -----------------------------------------------------------------------

  describe('getPRDiff', () => {
    it('returns the diff as a string', async () => {
      const diffText = 'diff --git a/src/auth.ts b/src/auth.ts\n+new line';
      mockFetch.mockResolvedValueOnce(textResponse(diffText));

      const diff = await adapter.getPRDiff(42);

      expect(diff).toBe(diffText);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.github.com/repos/test-owner/test-repo/pulls/42',
        expect.objectContaining({
          headers: expect.objectContaining({
            Accept: 'application/vnd.github.diff',
          }),
        }),
      );
    });
  });

  // -----------------------------------------------------------------------
  // getPRFiles
  // -----------------------------------------------------------------------

  describe('getPRFiles', () => {
    it('returns mapped file objects', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse([
          makeGitHubFile(),
          makeGitHubFile({
            filename: 'src/legacy.ts',
            status: 'removed',
            additions: 0,
            deletions: 30,
            patch: undefined,
          }),
          makeGitHubFile({
            filename: 'src/renamed.ts',
            status: 'renamed',
            additions: 2,
            deletions: 1,
          }),
          makeGitHubFile({
            filename: 'src/modified.ts',
            status: 'modified',
            additions: 5,
            deletions: 3,
          }),
        ]),
      );

      const files = await adapter.getPRFiles(42);

      expect(files).toHaveLength(4);
      expect(files[0]).toEqual({
        filename: 'src/auth.ts',
        status: 'added',
        additions: 50,
        deletions: 0,
        patch: '@@ +1,50 @@\n+export function authenticate() {}',
      });
      expect(files[1].status).toBe('deleted');
      expect(files[2].status).toBe('renamed');
      expect(files[3].status).toBe('modified');
    });

    it('handles pagination across multiple pages', async () => {
      // First page: 100 items
      const page1 = Array.from({length: 100}, (_, i) => makeGitHubFile({filename: `file${i}.ts`}));
      // Second page: 50 items (signals last page)
      const page2 = Array.from({length: 50}, (_, i) =>
        makeGitHubFile({filename: `file${100 + i}.ts`}),
      );

      mockFetch
        .mockResolvedValueOnce(jsonResponse(page1))
        .mockResolvedValueOnce(jsonResponse(page2));

      const files = await adapter.getPRFiles(42);

      expect(files).toHaveLength(150);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('returns empty array for PR with no files', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse([]));

      const files = await adapter.getPRFiles(42);
      expect(files).toHaveLength(0);
    });

    it('maps unknown file statuses to "modified"', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse([makeGitHubFile({status: 'changed'})]));

      const files = await adapter.getPRFiles(42);
      expect(files[0].status).toBe('modified');
    });
  });

  // -----------------------------------------------------------------------
  // postReviewComment
  // -----------------------------------------------------------------------

  describe('postReviewComment', () => {
    it('posts a comment with correct payload', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({id: 1}));

      await adapter.postReviewComment(42, {
        path: 'src/auth.ts',
        line: 15,
        body: 'Hardcoded credentials detected',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.github.com/repos/test-owner/test-repo/pulls/42/comments',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            body: 'Hardcoded credentials detected',
            path: 'src/auth.ts',
            line: 15,
            side: 'RIGHT',
          }),
        }),
      );
    });
  });

  // -----------------------------------------------------------------------
  // createReview
  // -----------------------------------------------------------------------

  describe('createReview', () => {
    it('submits a review with findings', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({id: 1}));

      const payload: ReviewPayload = {
        body: 'Found 1 issue.',
        event: 'REQUEST_CHANGES',
        comments: [
          {
            path: 'src/auth.ts',
            line: 10,
            body: 'SQL injection risk',
          },
        ],
      };

      await adapter.createReview(42, payload);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.github.com/repos/test-owner/test-repo/pulls/42/reviews',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            body: 'Found 1 issue.',
            event: 'REQUEST_CHANGES',
            comments: [{path: 'src/auth.ts', line: 10, body: 'SQL injection risk'}],
          }),
        }),
      );
    });

    it('submits an approval with no findings', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({id: 2}));

      const payload: ReviewPayload = {
        body: 'No issues found.',
        event: 'APPROVE',
        comments: [],
      };

      await adapter.createReview(42, payload);

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body as string);
      expect(callBody.event).toBe('APPROVE');
      expect(callBody.comments).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // Error handling
  // -----------------------------------------------------------------------

  describe('error handling', () => {
    it('throws descriptive error for 401', async () => {
      mockFetch.mockResolvedValueOnce(errorResponse(401));

      await expect(adapter.getPRInfo(42)).rejects.toThrow(/authentication failed \(401\)/);
    });

    it('throws descriptive error for 403', async () => {
      mockFetch.mockResolvedValueOnce(errorResponse(403));

      await expect(adapter.getPRInfo(42)).rejects.toThrow(/forbidden \(403\)/);
    });

    it('throws descriptive error for 404', async () => {
      mockFetch.mockResolvedValueOnce(errorResponse(404));

      await expect(adapter.getPRInfo(42)).rejects.toThrow(/not found \(404\)/);
    });

    it('throws descriptive error for 422', async () => {
      mockFetch.mockResolvedValueOnce(errorResponse(422, 'Validation Failed'));

      await expect(adapter.getPRInfo(42)).rejects.toThrow(/unprocessable entity \(422\)/);
    });

    it('throws generic error for other status codes', async () => {
      mockFetch.mockResolvedValueOnce(errorResponse(500, 'Internal Server Error'));

      await expect(adapter.getPRInfo(42)).rejects.toThrow(/failed \(500\)/);
    });
  });

  // -----------------------------------------------------------------------
  // Rate limit warnings
  // -----------------------------------------------------------------------

  describe('rate limit warnings', () => {
    it('logs a warning when rate limit is low', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      mockFetch.mockResolvedValueOnce(
        jsonResponse(makeGitHubPR(), 200, {
          'x-ratelimit-remaining': '50',
          'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 3600),
        }),
      );

      await adapter.getPRInfo(42);

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Rate limit low: 50 remaining'));

      warnSpy.mockRestore();
    });

    it('does not warn when rate limit is healthy', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      mockFetch.mockResolvedValueOnce(jsonResponse(makeGitHubPR()));

      await adapter.getPRInfo(42);

      expect(warnSpy).not.toHaveBeenCalled();

      warnSpy.mockRestore();
    });
  });

  // -----------------------------------------------------------------------
  // GitHub Enterprise
  // -----------------------------------------------------------------------

  describe('GitHub Enterprise', () => {
    it('uses custom apiBaseUrl', async () => {
      const gheAdapter = createGitHubPlatformAdapter({
        token: 'ghe_token',
        owner: 'corp',
        repo: 'internal',
        apiBaseUrl: 'https://github.corp.com/api/v3',
      });

      mockFetch.mockResolvedValueOnce(jsonResponse(makeGitHubPR()));

      await gheAdapter.getPRInfo(42);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://github.corp.com/api/v3/repos/corp/internal/pulls/42',
        expect.anything(),
      );
    });

    it('strips trailing slash from apiBaseUrl', async () => {
      const gheAdapter = createGitHubPlatformAdapter({
        token: 'ghe_token',
        owner: 'corp',
        repo: 'internal',
        apiBaseUrl: 'https://github.corp.com/api/v3/',
      });

      mockFetch.mockResolvedValueOnce(jsonResponse(makeGitHubPR()));

      await gheAdapter.getPRInfo(42);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://github.corp.com/api/v3/repos/corp/internal/pulls/42',
        expect.anything(),
      );
    });
  });
});
