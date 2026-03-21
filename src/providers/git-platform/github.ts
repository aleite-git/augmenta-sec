/**
 * GitHub adapter for the GitPlatform interface.
 *
 * Uses @octokit/rest to interact with the GitHub API (or GitHub Enterprise).
 * Handles pull requests, diffs, branches, issues, and PR reviews.
 */

import {Octokit} from '@octokit/rest';

import type {
  Branch,
  Diff,
  DiffFile,
  GitPlatform,
  PullRequest,
  SecurityIssue,
  SecurityReview,
} from './types.js';

export interface GitHubConfig {
  /** GitHub personal access token or app token. */
  token: string;
  /** Repository owner (user or organization). */
  owner: string;
  /** Repository name. */
  repo: string;
  /** Base URL for GitHub Enterprise (default: https://api.github.com). */
  apiBaseUrl?: string;
}

/** Rate limit warning threshold. */
const RATE_LIMIT_WARNING_THRESHOLD = 100;

/**
 * Maps a GitHub file status string to the DiffFile status union.
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
 * Maps a GitHub pull request state to the PullRequest state union.
 * GitHub's API uses "open" and "closed"; merged PRs are closed with
 * `merged_at` set.
 */
function mapPRState(
  state: string,
  mergedAt: string | null,
): 'open' | 'closed' | 'merged' {
  if (mergedAt) {
    return 'merged';
  }
  return state === 'open' ? 'open' : 'closed';
}

/**
 * Wraps an Octokit error with a descriptive message, handling specific
 * HTTP status codes.
 */
function wrapOctokitError(error: unknown, context: string): never {
  if (error instanceof Error && 'status' in error) {
    const status = (error as {status: number}).status;
    if (status === 404) {
      throw new Error(
        `GitHub ${context}: repository or resource not found (404). ` +
          'Verify the owner, repo, and resource exist.',
      );
    }
    if (status === 403) {
      throw new Error(
        `GitHub ${context}: insufficient permissions (403). ` +
          'Verify your token has the required scopes.',
      );
    }
    throw new Error(`GitHub ${context} failed (${status}): ${error.message}`);
  }
  if (error instanceof Error) {
    throw new Error(`GitHub ${context} failed: ${error.message}`);
  }
  throw new Error(`GitHub ${context} failed: ${String(error)}`);
}

/**
 * Checks the rate limit headers from a GitHub API response and logs a
 * warning when the remaining quota is low.
 */
function checkRateLimit(headers: {
  'x-ratelimit-remaining'?: string;
  'x-ratelimit-limit'?: string;
  'x-ratelimit-reset'?: string;
}): void {
  const remaining = headers['x-ratelimit-remaining'];
  if (remaining === undefined) {
    return;
  }
  const remainingNum = parseInt(remaining, 10);
  if (remainingNum < RATE_LIMIT_WARNING_THRESHOLD) {
    const resetEpoch = headers['x-ratelimit-reset'];
    const resetDate = resetEpoch
      ? new Date(parseInt(resetEpoch, 10) * 1000).toISOString()
      : 'unknown';
    console.warn(
      `[GitHub] Rate limit low: ${remainingNum} requests remaining ` +
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
 * Creates a GitHub adapter implementing the GitPlatform interface.
 */
export function createGitHubAdapter(config: GitHubConfig): GitPlatform {
  const octokit = new Octokit({
    auth: config.token,
    baseUrl: config.apiBaseUrl ?? 'https://api.github.com',
  });

  const {owner, repo} = config;

  // Event handler storage — these will be invoked by the webhook server
  // (a later ticket). For now we just store them.
  const prOpenedHandlers: Array<(pr: PullRequest) => Promise<void>> = [];
  const pushHandlers: Array<(branch: string) => Promise<void>> = [];

  return {
    name: 'github',

    async getPullRequests(
      state: 'open' | 'merged',
    ): Promise<PullRequest[]> {
      try {
        // GitHub API uses "closed" state; we filter by merged_at to
        // distinguish merged from simply closed.
        const apiState = state === 'merged' ? 'closed' : state;

        const response = await octokit.pulls.list({
          owner,
          repo,
          state: apiState as 'open' | 'closed' | 'all',
          per_page: 100,
        });

        checkRateLimit(response.headers as Record<string, string>);

        let pulls = response.data;

        // When the caller asks for merged PRs, filter to only those
        // that actually have a merged_at timestamp.
        if (state === 'merged') {
          pulls = pulls.filter((pr) => pr.merged_at !== null);
        }

        return pulls.map((pr) => ({
          id: String(pr.id),
          number: pr.number,
          title: pr.title,
          state: mapPRState(pr.state, pr.merged_at ?? null),
          author: pr.user?.login ?? 'unknown',
          baseBranch: pr.base.ref,
          headBranch: pr.head.ref,
          url: pr.html_url,
          createdAt: pr.created_at,
          updatedAt: pr.updated_at,
        }));
      } catch (error) {
        throw wrapOctokitError(error, 'getPullRequests');
      }
    },

    async getDiff(base: string, head: string): Promise<Diff> {
      try {
        const response = await octokit.repos.compareCommits({
          owner,
          repo,
          base,
          head,
        });

        checkRateLimit(response.headers as Record<string, string>);

        const files: DiffFile[] = (response.data.files ?? []).map((file) => ({
          path: file.filename,
          status: mapFileStatus(file.status ?? 'modified'),
          additions: file.additions,
          deletions: file.deletions,
          patch: file.patch,
        }));

        const additions = files.reduce((sum, f) => sum + f.additions, 0);
        const deletions = files.reduce((sum, f) => sum + f.deletions, 0);

        return {files, additions, deletions};
      } catch (error) {
        throw wrapOctokitError(error, 'getDiff');
      }
    },

    async getBranches(): Promise<Branch[]> {
      try {
        // Fetch the repo metadata to determine the default branch.
        const repoResponse = await octokit.repos.get({owner, repo});
        checkRateLimit(repoResponse.headers as Record<string, string>);
        const defaultBranch = repoResponse.data.default_branch;

        const branchResponse = await octokit.repos.listBranches({
          owner,
          repo,
          per_page: 100,
        });
        checkRateLimit(branchResponse.headers as Record<string, string>);

        return branchResponse.data.map((branch) => ({
          name: branch.name,
          isDefault: branch.name === defaultBranch,
          lastCommit: branch.commit.sha,
        }));
      } catch (error) {
        throw wrapOctokitError(error, 'getBranches');
      }
    },

    async createIssue(issue: SecurityIssue): Promise<string> {
      try {
        const response = await octokit.issues.create({
          owner,
          repo,
          title: issue.title,
          body: issue.body,
          labels: issue.labels,
        });

        checkRateLimit(response.headers as Record<string, string>);

        return response.data.html_url;
      } catch (error) {
        throw wrapOctokitError(error, 'createIssue');
      }
    },

    async createPullRequest(
      title: string,
      body: string,
      head: string,
      base: string,
    ): Promise<string> {
      try {
        const response = await octokit.pulls.create({
          owner,
          repo,
          title,
          body,
          head,
          base,
        });

        checkRateLimit(response.headers as Record<string, string>);

        return response.data.html_url;
      } catch (error) {
        throw wrapOctokitError(error, 'createPullRequest');
      }
    },

    async commentOnPR(
      prNumber: number,
      review: SecurityReview,
    ): Promise<void> {
      try {
        const comments = review.findings.map((finding) => ({
          path: finding.file,
          line: finding.line,
          body: formatFindingComment(finding),
        }));

        const event = review.approved
          ? ('APPROVE' as const)
          : ('REQUEST_CHANGES' as const);

        const response = await octokit.pulls.createReview({
          owner,
          repo,
          pull_number: prNumber,
          body: review.summary,
          event,
          comments,
        });

        checkRateLimit(response.headers as Record<string, string>);
      } catch (error) {
        throw wrapOctokitError(error, 'commentOnPR');
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
