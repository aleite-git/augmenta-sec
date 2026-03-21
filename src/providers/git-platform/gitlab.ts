/**
 * GitLab adapter for the GitPlatform interface.
 *
 * Uses native `fetch` to interact with the GitLab REST API v4.
 * Handles merge requests (GitLab's equivalent of pull requests), diffs,
 * branches, issues, and MR comments.
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

export interface GitLabConfig {
  /** GitLab personal access token or project token. */
  token: string;
  /** GitLab project ID (numeric) or URL-encoded path (e.g. "group/project"). */
  projectId: string | number;
  /** Base URL for the GitLab API (default: https://gitlab.com/api/v4). */
  apiBaseUrl?: string;
}

/** Rate limit warning threshold. */
const RATE_LIMIT_WARNING_THRESHOLD = 100;

/**
 * Maps a GitLab diff file status to the DiffFile status union.
 *
 * GitLab compare API returns `new_file`, `renamed_file`, `deleted_file`
 * booleans on each diff entry rather than a single status string.
 */
function mapDiffFileStatus(file: {
  new_file: boolean;
  renamed_file: boolean;
  deleted_file: boolean;
}): 'added' | 'modified' | 'deleted' | 'renamed' {
  if (file.new_file) return 'added';
  if (file.deleted_file) return 'deleted';
  if (file.renamed_file) return 'renamed';
  return 'modified';
}

/**
 * Maps a GitLab merge request state to the PullRequest state union.
 *
 * GitLab states: `opened`, `closed`, `merged`, `locked`.
 */
function mapMRState(state: string): 'open' | 'closed' | 'merged' {
  if (state === 'opened') return 'open';
  if (state === 'merged') return 'merged';
  return 'closed';
}

/**
 * Counts additions and deletions from a unified diff patch string.
 */
function countPatchStats(diff: string): {additions: number; deletions: number} {
  let additions = 0;
  let deletions = 0;
  for (const line of diff.split('\n')) {
    if (line.startsWith('+') && !line.startsWith('+++')) {
      additions++;
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      deletions++;
    }
  }
  return {additions, deletions};
}

/**
 * Checks the rate limit headers from a GitLab API response and logs a
 * warning when the remaining quota is low.
 */
function checkRateLimit(headers: Headers): void {
  const remaining = headers.get('ratelimit-remaining');
  if (remaining === null) {
    return;
  }
  const remainingNum = parseInt(remaining, 10);
  if (remainingNum < RATE_LIMIT_WARNING_THRESHOLD) {
    const resetEpoch = headers.get('ratelimit-reset');
    const resetDate = resetEpoch
      ? new Date(parseInt(resetEpoch, 10) * 1000).toISOString()
      : 'unknown';
    console.warn(
      `[GitLab] Rate limit low: ${remainingNum} requests remaining ` +
        `(resets at ${resetDate})`,
    );
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
 * Handles HTTP error responses from the GitLab API and throws descriptive
 * errors based on status code.
 */
async function handleApiError(
  response: Response,
  context: string,
): Promise<never> {
  const status = response.status;
  if (status === 404) {
    throw new Error(
      `GitLab ${context}: project or resource not found (404). ` +
        'Verify the project ID and resource exist.',
    );
  }
  if (status === 401) {
    throw new Error(
      `GitLab ${context}: authentication failed (401). ` +
        'Verify your token is valid.',
    );
  }
  if (status === 403) {
    throw new Error(
      `GitLab ${context}: insufficient permissions (403). ` +
        'Verify your token has the required scopes.',
    );
  }
  if (status === 429) {
    throw new Error(
      `GitLab ${context}: rate limited (429). ` +
        'Wait and retry, or use a token with a higher rate limit.',
    );
  }

  let message = response.statusText;
  try {
    const body = await response.json();
    if (body.message) {
      message = typeof body.message === 'string'
        ? body.message
        : JSON.stringify(body.message);
    } else if (body.error) {
      message = body.error;
    }
  } catch {
    // Body was not JSON — use statusText.
  }

  throw new Error(`GitLab ${context} failed (${status}): ${message}`);
}

/**
 * Creates a GitLab adapter implementing the GitPlatform interface.
 */
export function createGitLabAdapter(config: GitLabConfig): GitPlatform {
  const baseUrl = config.apiBaseUrl ?? 'https://gitlab.com/api/v4';
  const projectPath = `/projects/${encodeURIComponent(String(config.projectId))}`;
  const token = config.token;

  // Event handler storage — these will be invoked by the webhook server
  // (a later ticket). For now we just store them.
  const prOpenedHandlers: Array<(pr: PullRequest) => Promise<void>> = [];
  const pushHandlers: Array<(branch: string) => Promise<void>> = [];

  /**
   * Makes an authenticated request to the GitLab API.
   */
  async function gitlabFetch(
    path: string,
    options: RequestInit = {},
  ): Promise<Response> {
    const url = `${baseUrl}${projectPath}${path}`;
    const headers: Record<string, string> = {
      'PRIVATE-TOKEN': token,
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> | undefined),
    };

    return fetch(url, {
      ...options,
      headers,
    });
  }

  return {
    name: 'gitlab',

    async getPullRequests(
      state: 'open' | 'merged',
    ): Promise<PullRequest[]> {
      try {
        // GitLab uses "opened" for open MRs and "merged" for merged.
        const apiState = state === 'open' ? 'opened' : 'merged';

        const response = await gitlabFetch(
          `/merge_requests?state=${apiState}&per_page=100`,
        );

        if (!response.ok) {
          await handleApiError(response, 'getPullRequests');
        }

        checkRateLimit(response.headers);

        const data = await response.json();

        return (data as Array<Record<string, unknown>>).map((mr) => ({
          id: String(mr.id),
          number: mr.iid as number,
          title: mr.title as string,
          state: mapMRState(mr.state as string),
          author: ((mr.author as Record<string, unknown>)?.username as string) ?? 'unknown',
          baseBranch: mr.target_branch as string,
          headBranch: mr.source_branch as string,
          url: mr.web_url as string,
          createdAt: mr.created_at as string,
          updatedAt: mr.updated_at as string,
        }));
      } catch (error) {
        if (error instanceof Error && error.message.startsWith('GitLab ')) {
          throw error;
        }
        if (error instanceof Error) {
          throw new Error(`GitLab getPullRequests failed: ${error.message}`);
        }
        throw new Error(`GitLab getPullRequests failed: ${String(error)}`);
      }
    },

    async getDiff(base: string, head: string): Promise<Diff> {
      try {
        const response = await gitlabFetch(
          `/repository/compare?from=${encodeURIComponent(base)}&to=${encodeURIComponent(head)}`,
        );

        if (!response.ok) {
          await handleApiError(response, 'getDiff');
        }

        checkRateLimit(response.headers);

        const data = await response.json() as {
          diffs: Array<{
            old_path: string;
            new_path: string;
            new_file: boolean;
            renamed_file: boolean;
            deleted_file: boolean;
            diff: string;
          }>;
        };

        const files: DiffFile[] = (data.diffs ?? []).map((file) => {
          const stats = countPatchStats(file.diff);
          return {
            path: file.new_path,
            status: mapDiffFileStatus(file),
            additions: stats.additions,
            deletions: stats.deletions,
            patch: file.diff || undefined,
          };
        });

        const additions = files.reduce((sum, f) => sum + f.additions, 0);
        const deletions = files.reduce((sum, f) => sum + f.deletions, 0);

        return {files, additions, deletions};
      } catch (error) {
        if (error instanceof Error && error.message.startsWith('GitLab ')) {
          throw error;
        }
        if (error instanceof Error) {
          throw new Error(`GitLab getDiff failed: ${error.message}`);
        }
        throw new Error(`GitLab getDiff failed: ${String(error)}`);
      }
    },

    async getBranches(): Promise<Branch[]> {
      try {
        const response = await gitlabFetch(
          '/repository/branches?per_page=100',
        );

        if (!response.ok) {
          await handleApiError(response, 'getBranches');
        }

        checkRateLimit(response.headers);

        const data = await response.json() as Array<{
          name: string;
          default: boolean;
          commit: {id: string};
        }>;

        return data.map((branch) => ({
          name: branch.name,
          isDefault: branch.default,
          lastCommit: branch.commit.id,
        }));
      } catch (error) {
        if (error instanceof Error && error.message.startsWith('GitLab ')) {
          throw error;
        }
        if (error instanceof Error) {
          throw new Error(`GitLab getBranches failed: ${error.message}`);
        }
        throw new Error(`GitLab getBranches failed: ${String(error)}`);
      }
    },

    async createIssue(issue: SecurityIssue): Promise<string> {
      try {
        const response = await gitlabFetch('/issues', {
          method: 'POST',
          body: JSON.stringify({
            title: issue.title,
            description: issue.body,
            labels: issue.labels.join(','),
          }),
        });

        if (!response.ok) {
          await handleApiError(response, 'createIssue');
        }

        checkRateLimit(response.headers);

        const data = await response.json() as {web_url: string};
        return data.web_url;
      } catch (error) {
        if (error instanceof Error && error.message.startsWith('GitLab ')) {
          throw error;
        }
        if (error instanceof Error) {
          throw new Error(`GitLab createIssue failed: ${error.message}`);
        }
        throw new Error(`GitLab createIssue failed: ${String(error)}`);
      }
    },

    async createPullRequest(
      title: string,
      body: string,
      head: string,
      base: string,
    ): Promise<string> {
      try {
        const response = await gitlabFetch('/merge_requests', {
          method: 'POST',
          body: JSON.stringify({
            title,
            description: body,
            source_branch: head,
            target_branch: base,
          }),
        });

        if (!response.ok) {
          await handleApiError(response, 'createPullRequest');
        }

        checkRateLimit(response.headers);

        const data = await response.json() as {web_url: string};
        return data.web_url;
      } catch (error) {
        if (error instanceof Error && error.message.startsWith('GitLab ')) {
          throw error;
        }
        if (error instanceof Error) {
          throw new Error(`GitLab createPullRequest failed: ${error.message}`);
        }
        throw new Error(`GitLab createPullRequest failed: ${String(error)}`);
      }
    },

    async commentOnPR(
      prNumber: number,
      review: SecurityReview,
    ): Promise<void> {
      try {
        // Post summary as a note on the MR.
        let commentBody = `## Security Review\n\n${review.summary}`;

        if (review.findings.length > 0) {
          commentBody += '\n\n### Findings\n\n';
          for (const finding of review.findings) {
            commentBody += `- **${finding.file}:${finding.line}** — ${formatFindingComment(finding)}\n`;
          }
        }

        commentBody += `\n\n**Status:** ${review.approved ? 'Approved' : 'Changes Requested'}`;

        const response = await gitlabFetch(
          `/merge_requests/${prNumber}/notes`,
          {
            method: 'POST',
            body: JSON.stringify({body: commentBody}),
          },
        );

        if (!response.ok) {
          await handleApiError(response, 'commentOnPR');
        }

        checkRateLimit(response.headers);
      } catch (error) {
        if (error instanceof Error && error.message.startsWith('GitLab ')) {
          throw error;
        }
        if (error instanceof Error) {
          throw new Error(`GitLab commentOnPR failed: ${error.message}`);
        }
        throw new Error(`GitLab commentOnPR failed: ${String(error)}`);
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
