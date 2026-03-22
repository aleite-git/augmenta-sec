/**
 * GitHub platform adapter (ASEC-040).
 *
 * Implements the PlatformAdapter interface using the GitHub REST API
 * via native fetch — no octokit dependency.  Handles pagination for
 * large PRs and provides clear error messages for auth / rate issues.
 */

import type {PlatformAdapter, PRInfo, PRFile, ReviewComment, ReviewPayload} from './types.js';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface GitHubAdapterConfig {
  /** GitHub personal access token or app installation token. */
  token: string;
  /** Repository owner (user or organization). */
  owner: string;
  /** Repository name. */
  repo: string;
  /** Base URL for GitHub Enterprise (default: https://api.github.com). */
  apiBaseUrl?: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Default page size for paginated endpoints. */
const PER_PAGE = 100;

/** Maximum number of pages to fetch before bailing out. */
const MAX_PAGES = 10;

/** Rate limit remaining threshold — warn when below this. */
const RATE_LIMIT_WARN = 100;

/**
 * Builds common fetch headers including auth and accept.
 */
function buildHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

/**
 * Checks response headers for low rate-limit and logs a warning.
 */
function checkRateLimit(headers: Headers): void {
  const remaining = headers.get('x-ratelimit-remaining');
  if (remaining === null) return;

  const remainingNum = parseInt(remaining, 10);
  if (remainingNum < RATE_LIMIT_WARN) {
    const reset = headers.get('x-ratelimit-reset');
    const resetDate = reset ? new Date(parseInt(reset, 10) * 1000).toISOString() : 'unknown';
    console.warn(`[GitHubAdapter] Rate limit low: ${remainingNum} remaining (resets ${resetDate})`);
  }
}

/**
 * Throws a descriptive error based on the HTTP status code.
 */
function throwApiError(status: number, context: string, body: string): never {
  if (status === 401) {
    throw new Error(`GitHub ${context}: authentication failed (401). Check your token.`);
  }
  if (status === 403) {
    throw new Error(
      `GitHub ${context}: forbidden (403). ` +
        'Token may lack required scopes or rate limit exceeded.',
    );
  }
  if (status === 404) {
    throw new Error(
      `GitHub ${context}: not found (404). ` + 'Verify owner, repo, and resource exist.',
    );
  }
  if (status === 422) {
    throw new Error(`GitHub ${context}: unprocessable entity (422). ${body}`);
  }
  throw new Error(`GitHub ${context} failed (${status}): ${body}`);
}

/**
 * Performs a GitHub API request with error handling and rate-limit
 * checking.  Returns the parsed JSON body.
 */
async function githubFetch<T>(url: string, token: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...buildHeaders(token),
      ...(options.headers as Record<string, string> | undefined),
    },
  });

  checkRateLimit(response.headers);

  if (!response.ok) {
    const body = await response.text();
    throwApiError(response.status, url, body);
  }

  return (await response.json()) as T;
}

/**
 * Performs a GitHub API request expecting a text response (e.g. diffs).
 */
async function githubFetchText(url: string, token: string, accept: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      ...buildHeaders(token),
      Accept: accept,
    },
  });

  checkRateLimit(response.headers);

  if (!response.ok) {
    const body = await response.text();
    throwApiError(response.status, url, body);
  }

  return response.text();
}

/**
 * Fetches all pages from a paginated GitHub API endpoint.
 */
async function fetchAllPages<T>(baseUrl: string, token: string): Promise<T[]> {
  const results: T[] = [];
  let page = 1;

  while (page <= MAX_PAGES) {
    const separator = baseUrl.includes('?') ? '&' : '?';
    const url = `${baseUrl}${separator}per_page=${PER_PAGE}&page=${page}`;
    const data = await githubFetch<T[]>(url, token);

    results.push(...data);

    if (data.length < PER_PAGE) break;
    page++;
  }

  return results;
}

// ---------------------------------------------------------------------------
// GitHub API response shapes (subset)
// ---------------------------------------------------------------------------

interface GitHubPRResponse {
  number: number;
  title: string;
  state: string;
  merged_at: string | null;
  user: {login: string} | null;
  base: {ref: string};
  head: {ref: string};
  html_url: string;
}

interface GitHubFileResponse {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  patch?: string;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Creates a GitHub PlatformAdapter that uses native fetch.
 */
export function createGitHubPlatformAdapter(config: GitHubAdapterConfig): PlatformAdapter {
  const base = (config.apiBaseUrl ?? 'https://api.github.com').replace(/\/$/, '');
  const {token, owner, repo} = config;
  const repoBase = `${base}/repos/${owner}/${repo}`;

  function mapFileStatus(status: string): 'added' | 'modified' | 'deleted' | 'renamed' {
    switch (status) {
      case 'added':
        return 'added';
      case 'removed':
        return 'deleted';
      case 'renamed':
        return 'renamed';
      default:
        return 'modified';
    }
  }

  return {
    name: 'github',

    async getPRDiff(prNumber: number): Promise<string> {
      const url = `${repoBase}/pulls/${prNumber}`;
      return githubFetchText(url, token, 'application/vnd.github.diff');
    },

    async getPRFiles(prNumber: number): Promise<PRFile[]> {
      const url = `${repoBase}/pulls/${prNumber}/files`;
      const files = await fetchAllPages<GitHubFileResponse>(url, token);

      return files.map((f) => ({
        filename: f.filename,
        status: mapFileStatus(f.status),
        additions: f.additions,
        deletions: f.deletions,
        patch: f.patch,
      }));
    },

    async postReviewComment(prNumber: number, comment: ReviewComment): Promise<void> {
      const url = `${repoBase}/pulls/${prNumber}/comments`;
      await githubFetch<unknown>(url, token, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          body: comment.body,
          path: comment.path,
          line: comment.line,
          side: 'RIGHT',
        }),
      });
    },

    async createReview(prNumber: number, payload: ReviewPayload): Promise<void> {
      const url = `${repoBase}/pulls/${prNumber}/reviews`;
      await githubFetch<unknown>(url, token, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          body: payload.body,
          event: payload.event,
          comments: payload.comments.map((c) => ({
            path: c.path,
            line: c.line,
            body: c.body,
          })),
        }),
      });
    },

    async getPRInfo(prNumber: number): Promise<PRInfo> {
      const url = `${repoBase}/pulls/${prNumber}`;
      const pr = await githubFetch<GitHubPRResponse>(url, token);

      let state: PRInfo['state'];
      if (pr.merged_at) {
        state = 'merged';
      } else if (pr.state === 'open') {
        state = 'open';
      } else {
        state = 'closed';
      }

      return {
        number: pr.number,
        title: pr.title,
        state,
        author: pr.user?.login ?? 'unknown',
        baseBranch: pr.base.ref,
        headBranch: pr.head.ref,
        url: pr.html_url,
      };
    },
  };
}
