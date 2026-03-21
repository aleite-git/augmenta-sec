/**
 * Bitbucket Cloud adapter for the GitPlatform interface.
 *
 * Uses native fetch to interact with the Bitbucket Cloud REST API v2.
 * Handles pull requests, diffs, branches, issues, and PR comments.
 */

import type {
  Branch,
  Diff,
  DiffFile,
  GitPlatform,
  PullRequest,
  SecurityIssue,
  SecurityReview,
} from './types.js';

export interface BitbucketConfig {
  /** Bitbucket username (for Basic auth). */
  username: string;
  /** Bitbucket app password (for Basic auth). */
  appPassword: string;
  /** Bitbucket workspace slug. */
  workspace: string;
  /** Repository slug. */
  repoSlug: string;
  /** Base URL for the Bitbucket API (default: https://api.bitbucket.org/2.0). */
  apiBaseUrl?: string;
}

/** Maximum items per page for Bitbucket API requests. */
const PAGE_SIZE = 100;

/**
 * Maps a Bitbucket PR state to the PullRequest state union.
 *
 * Bitbucket uses OPEN, MERGED, DECLINED, and SUPERSEDED.
 */
function mapPRState(
  state: string,
): 'open' | 'closed' | 'merged' {
  const upper = state.toUpperCase();
  if (upper === 'OPEN') {
    return 'open';
  }
  if (upper === 'MERGED') {
    return 'merged';
  }
  // DECLINED and SUPERSEDED both map to closed.
  return 'closed';
}

/**
 * Maps a Bitbucket diffstat status string to the DiffFile status union.
 *
 * Bitbucket diffstat statuses: added, removed, modified, renamed.
 */
function mapFileStatus(
  status: string,
): 'added' | 'modified' | 'deleted' | 'renamed' {
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

/**
 * Formats a review finding as a markdown comment body.
 */
function formatFindingComment(finding: {
  severity: string;
  message: string;
  suggestedFix?: string;
}): string {
  const severityBadge = `**[${finding.severity.toUpperCase()}]**`;
  let body = `${severityBadge} ${finding.message}`;
  if (finding.suggestedFix) {
    body += `\n\n**Suggested fix:**\n\`\`\`\n${finding.suggestedFix}\n\`\`\``;
  }
  return body;
}

/**
 * Wraps a fetch error or non-OK response with a descriptive message,
 * handling specific HTTP status codes.
 */
function handleApiError(
  status: number,
  context: string,
  message: string,
): never {
  if (status === 401) {
    throw new Error(
      `Bitbucket ${context}: authentication failed (401). ` +
        'Verify your username and app password.',
    );
  }
  if (status === 403) {
    throw new Error(
      `Bitbucket ${context}: insufficient permissions (403). ` +
        'Verify your app password has the required scopes.',
    );
  }
  if (status === 404) {
    throw new Error(
      `Bitbucket ${context}: resource not found (404). ` +
        'Verify the workspace, repo slug, and resource exist.',
    );
  }
  throw new Error(
    `Bitbucket ${context} failed (${status}): ${message}`,
  );
}

/**
 * Maps a security severity level to a Bitbucket issue priority.
 */
function mapSeverityToPriority(
  severity: 'critical' | 'high' | 'medium' | 'low' | 'informational',
): string {
  switch (severity) {
    case 'critical':
      return 'critical';
    case 'high':
      return 'major';
    case 'medium':
      return 'major';
    case 'low':
      return 'minor';
    case 'informational':
      return 'trivial';
    default:
      return 'major';
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Creates a Bitbucket Cloud adapter implementing the GitPlatform interface.
 */
export function createBitbucketAdapter(
  config: BitbucketConfig,
): GitPlatform {
  const baseUrl =
    config.apiBaseUrl ?? 'https://api.bitbucket.org/2.0';
  const {workspace, repoSlug} = config;
  const repoPath = `repositories/${workspace}/${repoSlug}`;

  // Basic auth header: base64(username:appPassword)
  const credentials = Buffer.from(
    `${config.username}:${config.appPassword}`,
  ).toString('base64');
  const authHeader = `Basic ${credentials}`;

  // Event handler storage — will be invoked by the webhook server (a later ticket).
  const prOpenedHandlers: Array<(pr: PullRequest) => Promise<void>> = [];
  const pushHandlers: Array<(branch: string) => Promise<void>> = [];

  /**
   * Makes an authenticated request to the Bitbucket API.
   */
  async function apiRequest(
    path: string,
    options: RequestInit = {},
  ): Promise<Response> {
    const url = `${baseUrl}/${path}`;
    const headers: Record<string, string> = {
      Authorization: authHeader,
      Accept: 'application/json',
      ...(options.headers as Record<string, string> | undefined),
    };

    if (options.body) {
      headers['Content-Type'] = 'application/json';
    }

    return fetch(url, {
      ...options,
      headers,
    });
  }

  /**
   * Makes an authenticated GET request and returns the parsed JSON body.
   * Throws on non-OK responses with descriptive error messages.
   */
  async function apiGet(path: string, context: string): Promise<any> {
    const response = await apiRequest(path);
    if (!response.ok) {
      const text = await response.text();
      handleApiError(response.status, context, text);
    }
    return response.json();
  }

  /**
   * Makes an authenticated POST request and returns the parsed JSON body.
   * Throws on non-OK responses with descriptive error messages.
   */
  async function apiPost(
    path: string,
    body: unknown,
    context: string,
  ): Promise<any> {
    const response = await apiRequest(path, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const text = await response.text();
      handleApiError(response.status, context, text);
    }
    return response.json();
  }

  return {
    name: 'bitbucket',

    async getPullRequests(
      state: 'open' | 'merged',
    ): Promise<PullRequest[]> {
      // Bitbucket uses uppercase state values: OPEN, MERGED, DECLINED, SUPERSEDED.
      const bbState = state.toUpperCase();
      const path =
        `${repoPath}/pullrequests?state=${bbState}&pagelen=${PAGE_SIZE}`;

      const data = await apiGet(path, 'getPullRequests');
      const values: any[] = data.values ?? [];

      return values.map((pr: any) => ({
        id: String(pr.id),
        number: pr.id,
        title: pr.title,
        state: mapPRState(pr.state),
        author: pr.author?.display_name ?? 'unknown',
        baseBranch: pr.destination?.branch?.name ?? '',
        headBranch: pr.source?.branch?.name ?? '',
        url: pr.links?.html?.href ?? '',
        createdAt: pr.created_on ?? '',
        updatedAt: pr.updated_on ?? '',
      }));
    },

    async getDiff(base: string, head: string): Promise<Diff> {
      // Use the diffstat endpoint which provides per-file addition/deletion stats.
      const spec = `${base}..${head}`;
      const path =
        `${repoPath}/diffstat/${spec}?pagelen=${PAGE_SIZE}`;

      const data = await apiGet(path, 'getDiff');
      const values: any[] = data.values ?? [];

      const files: DiffFile[] = values.map((entry: any) => ({
        path: entry.new?.path ?? entry.old?.path ?? '',
        status: mapFileStatus(entry.status ?? 'modified'),
        additions: entry.lines_added ?? 0,
        deletions: entry.lines_removed ?? 0,
      }));

      const additions = files.reduce((sum, f) => sum + f.additions, 0);
      const deletions = files.reduce((sum, f) => sum + f.deletions, 0);

      return {files, additions, deletions};
    },

    async getBranches(): Promise<Branch[]> {
      const path =
        `${repoPath}/refs/branches?pagelen=${PAGE_SIZE}`;

      const data = await apiGet(path, 'getBranches');
      const values: any[] = data.values ?? [];

      return values.map((branch: any) => ({
        name: branch.name,
        isDefault: branch.name === data.mainbranch?.name,
        lastCommit: branch.target?.hash ?? '',
      }));
    },

    async createIssue(issue: SecurityIssue): Promise<string> {
      const body = {
        title: issue.title,
        content: {
          raw: issue.body,
        },
        priority: mapSeverityToPriority(issue.severity),
        kind: 'bug',
      };

      const data = await apiPost(
        `${repoPath}/issues`,
        body,
        'createIssue',
      );

      return data.links?.html?.href ?? '';
    },

    async createPullRequest(
      title: string,
      body: string,
      head: string,
      base: string,
    ): Promise<string> {
      const payload = {
        title,
        description: body,
        source: {
          branch: {name: head},
        },
        destination: {
          branch: {name: base},
        },
        close_source_branch: true,
      };

      const data = await apiPost(
        `${repoPath}/pullrequests`,
        payload,
        'createPullRequest',
      );

      return data.links?.html?.href ?? '';
    },

    async commentOnPR(
      prNumber: number,
      review: SecurityReview,
    ): Promise<void> {
      // Bitbucket does not have a native review concept like GitHub.
      // We post the summary as a top-level comment, then each finding
      // as an inline comment.
      const summaryBody = {
        content: {
          raw: review.summary,
        },
      };

      await apiPost(
        `${repoPath}/pullrequests/${prNumber}/comments`,
        summaryBody,
        'commentOnPR',
      );

      // Post inline comments for each finding.
      for (const finding of review.findings) {
        const commentBody = {
          content: {
            raw: formatFindingComment(finding),
          },
          inline: {
            path: finding.file,
            to: finding.line,
          },
        };

        await apiPost(
          `${repoPath}/pullrequests/${prNumber}/comments`,
          commentBody,
          'commentOnPR',
        );
      }
    },

    onPullRequestOpened(
      handler: (pr: PullRequest) => Promise<void>,
    ): void {
      prOpenedHandlers.push(handler);
    },

    onPush(handler: (branch: string) => Promise<void>): void {
      pushHandlers.push(handler);
    },
  };
}

/* eslint-enable @typescript-eslint/no-explicit-any */
