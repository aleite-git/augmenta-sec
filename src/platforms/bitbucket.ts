/**
 * Bitbucket adapter for the GitPlatform interface (ASEC-042).
 */

import type {
  Branch, Diff, DiffFile, GitPlatform, PullRequest,
  SecurityIssue, SecurityReview,
} from '../providers/git-platform/types.js';

export interface BitbucketConfig {
  token: string;
  workspace: string;
  repoSlug: string;
  baseUrl?: string;
}

function apiUrl(baseUrl: string, path: string): string {
  return `${baseUrl}/2.0${path}`;
}

function authHeaders(token: string): Record<string, string> {
  return {Authorization: `Bearer ${token}`, 'Content-Type': 'application/json'};
}

async function assertOk(response: Response, context: string): Promise<void> {
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Bitbucket ${context} failed (${response.status}): ${body}`);
  }
}

function mapPRState(state: string): 'open' | 'closed' | 'merged' {
  if (state === 'OPEN') return 'open';
  if (state === 'MERGED') return 'merged';
  return 'closed';
}

function mapDiffStatus(status: string): 'added' | 'modified' | 'deleted' | 'renamed' {
  if (status === 'added') return 'added';
  if (status === 'removed') return 'deleted';
  if (status === 'renamed') return 'renamed';
  return 'modified';
}

interface BitbucketPR {
  id: number; title: string; state: string;
  author: {display_name: string; nickname?: string} | null;
  destination: {branch: {name: string}};
  source: {branch: {name: string}};
  links: {html: {href: string}};
  created_on: string; updated_on: string;
}

interface BitbucketDiffstatEntry {
  new?: {path: string}; old?: {path: string};
  status: string; lines_added: number; lines_removed: number;
}

interface BitbucketBranch {
  name: string; target: {hash: string};
}

interface BitbucketRef {
  type: string; name: string;
}

export function createBitbucketPlatformAdapter(
  token: string, workspace: string, repoSlug?: string,
  baseUrl = 'https://api.bitbucket.org',
): GitPlatform {
  const base = baseUrl.replace(/\/+$/, '');
  const slug = repoSlug ?? '';
  const repoPath = `/repositories/${encodeURIComponent(workspace)}/${encodeURIComponent(slug)}`;
  const prOpenedHandlers: Array<(pr: PullRequest) => Promise<void>> = [];
  const pushHandlers: Array<(branch: string) => Promise<void>> = [];

  return {
    name: 'bitbucket',

    async getPullRequests(state: 'open' | 'merged'): Promise<PullRequest[]> {
      const bbState = state === 'open' ? 'OPEN' : 'MERGED';
      const url = apiUrl(base, `${repoPath}/pullrequests?state=${bbState}&pagelen=50`);
      const response = await fetch(url, {headers: authHeaders(token)});
      await assertOk(response, 'getPullRequests');
      const data = (await response.json()) as {values: BitbucketPR[]};
      return (data.values ?? []).map((pr) => ({
        id: String(pr.id), number: pr.id, title: pr.title,
        state: mapPRState(pr.state),
        author: pr.author?.nickname ?? pr.author?.display_name ?? 'unknown',
        baseBranch: pr.destination.branch.name, headBranch: pr.source.branch.name,
        url: pr.links.html.href,
        createdAt: pr.created_on, updatedAt: pr.updated_on,
      }));
    },

    async getDiff(baseBranch: string, head: string): Promise<Diff> {
      const spec = `${encodeURIComponent(baseBranch)}..${encodeURIComponent(head)}`;
      const url = apiUrl(base, `${repoPath}/diffstat/${spec}?pagelen=500`);
      const response = await fetch(url, {headers: authHeaders(token)});
      await assertOk(response, 'getDiff');
      const data = (await response.json()) as {values: BitbucketDiffstatEntry[]};
      const files: DiffFile[] = (data.values ?? []).map((entry) => ({
        path: entry.new?.path ?? entry.old?.path ?? 'unknown',
        status: mapDiffStatus(entry.status),
        additions: entry.lines_added, deletions: entry.lines_removed,
      }));
      const additions = files.reduce((sum, f) => sum + f.additions, 0);
      const deletions = files.reduce((sum, f) => sum + f.deletions, 0);
      return {files, additions, deletions};
    },

    async getBranches(): Promise<Branch[]> {
      const branchUrl = apiUrl(base, `${repoPath}/refs/branches?pagelen=100`);
      const branchResponse = await fetch(branchUrl, {headers: authHeaders(token)});
      await assertOk(branchResponse, 'getBranches');
      const branchData = (await branchResponse.json()) as {values: BitbucketBranch[]};
      const repoUrl = apiUrl(base, repoPath);
      const repoResponse = await fetch(repoUrl, {headers: authHeaders(token)});
      await assertOk(repoResponse, 'getBranches (repo metadata)');
      const repoData = (await repoResponse.json()) as {mainbranch?: BitbucketRef};
      const defaultBranch = repoData.mainbranch?.name ?? 'main';
      return (branchData.values ?? []).map((b) => ({
        name: b.name, isDefault: b.name === defaultBranch, lastCommit: b.target.hash,
      }));
    },

    async createIssue(issue: SecurityIssue): Promise<string> {
      const url = apiUrl(base, `${repoPath}/issues`);
      const payload = JSON.stringify({
        title: issue.title, content: {raw: issue.body}, kind: 'bug',
        priority: issue.severity === 'critical' || issue.severity === 'high' ? 'critical' : 'major',
      });
      const response = await fetch(url, {method: 'POST', headers: authHeaders(token), body: payload});
      await assertOk(response, 'createIssue');
      const data = (await response.json()) as {links: {html: {href: string}}};
      return data.links.html.href;
    },

    async createPullRequest(title: string, body: string, head: string, baseBranch: string): Promise<string> {
      const url = apiUrl(base, `${repoPath}/pullrequests`);
      const payload = JSON.stringify({
        title, description: body,
        source: {branch: {name: head}}, destination: {branch: {name: baseBranch}},
        close_source_branch: true,
      });
      const response = await fetch(url, {method: 'POST', headers: authHeaders(token), body: payload});
      await assertOk(response, 'createPullRequest');
      const data = (await response.json()) as {links: {html: {href: string}}};
      return data.links.html.href;
    },

    async commentOnPR(prNumber: number, review: SecurityReview): Promise<void> {
      const url = apiUrl(base, `${repoPath}/pullrequests/${prNumber}/comments`);
      const parts = [review.summary];
      for (const f of review.findings) {
        const badge = `**[${f.severity.toUpperCase()}]**`;
        let c = `\n${badge} ${f.message} (${f.file}:${f.line})`;
        if (f.suggestedFix) c += `\n\n**Suggested fix:**\n\`\`\`\n${f.suggestedFix}\n\`\`\``;
        parts.push(c);
      }
      const payload = JSON.stringify({content: {raw: parts.join('\n')}});
      const response = await fetch(url, {method: 'POST', headers: authHeaders(token), body: payload});
      await assertOk(response, 'commentOnPR');
    },

    onPullRequestOpened(handler: (pr: PullRequest) => Promise<void>): void {
      prOpenedHandlers.push(handler);
    },
    onPush(handler: (branch: string) => Promise<void>): void {
      pushHandlers.push(handler);
    },
  };
}
