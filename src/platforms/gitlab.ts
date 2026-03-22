/**
 * GitLab adapter for the GitPlatform interface (ASEC-041).
 */

import type {
  Branch, Diff, DiffFile, GitPlatform, PullRequest,
  SecurityIssue, SecurityReview,
} from '../providers/git-platform/types.js';

export interface GitLabConfig {
  token: string;
  projectId: string;
  baseUrl?: string;
}

function apiUrl(baseUrl: string, path: string): string {
  return `${baseUrl}/api/v4${path}`;
}

function glHeaders(token: string): Record<string, string> {
  return {'PRIVATE-TOKEN': token, 'Content-Type': 'application/json'};
}

async function assertOk(response: Response, context: string): Promise<void> {
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`GitLab ${context} failed (${response.status}): ${body}`);
  }
}

function mapMRState(state: string): 'open' | 'closed' | 'merged' {
  if (state === 'merged') return 'merged';
  if (state === 'opened') return 'open';
  return 'closed';
}

function mapDiffStatus(
  newFile: boolean, deletedFile: boolean, renamedFile: boolean,
): 'added' | 'modified' | 'deleted' | 'renamed' {
  if (newFile) return 'added';
  if (deletedFile) return 'deleted';
  if (renamedFile) return 'renamed';
  return 'modified';
}

function countPatchChanges(diff: string): {additions: number; deletions: number} {
  let additions = 0;
  let deletions = 0;
  for (const line of diff.split('\n')) {
    if (line.startsWith('+') && !line.startsWith('+++')) additions++;
    else if (line.startsWith('-') && !line.startsWith('---')) deletions++;
  }
  return {additions, deletions};
}

interface GitLabMR {
  id: number; iid: number; title: string; state: string;
  author: {username: string} | null;
  target_branch: string; source_branch: string;
  web_url: string; created_at: string; updated_at: string;
}

interface GitLabDiffEntry {
  new_path: string; old_path: string;
  new_file: boolean; deleted_file: boolean; renamed_file: boolean;
  diff: string;
}

interface GitLabBranch {
  name: string; default: boolean; commit: {id: string};
}

export function createGitLabPlatformAdapter(
  token: string, baseUrl = 'https://gitlab.com', projectId?: string,
): GitPlatform {
  const base = baseUrl.replace(/\/+$/, '');
  const pid = projectId ?? '';
  const encodedPid = encodeURIComponent(pid);
  const prOpenedHandlers: Array<(pr: PullRequest) => Promise<void>> = [];
  const pushHandlers: Array<(branch: string) => Promise<void>> = [];

  return {
    name: 'gitlab',

    async getPullRequests(state: 'open' | 'merged'): Promise<PullRequest[]> {
      const apiState = state === 'open' ? 'opened' : 'merged';
      const url = apiUrl(base, `/projects/${encodedPid}/merge_requests?state=${apiState}&per_page=100`);
      const response = await fetch(url, {headers: glHeaders(token)});
      await assertOk(response, 'getPullRequests');
      const data = (await response.json()) as GitLabMR[];
      return data.map((mr) => ({
        id: String(mr.id), number: mr.iid, title: mr.title,
        state: mapMRState(mr.state),
        author: mr.author?.username ?? 'unknown',
        baseBranch: mr.target_branch, headBranch: mr.source_branch,
        url: mr.web_url, createdAt: mr.created_at, updatedAt: mr.updated_at,
      }));
    },

    async getDiff(baseBranch: string, head: string): Promise<Diff> {
      const url = apiUrl(base, `/projects/${encodedPid}/repository/compare?from=${encodeURIComponent(baseBranch)}&to=${encodeURIComponent(head)}`);
      const response = await fetch(url, {headers: glHeaders(token)});
      await assertOk(response, 'getDiff');
      const data = (await response.json()) as {diffs: GitLabDiffEntry[]};
      const files: DiffFile[] = (data.diffs ?? []).map((d) => {
        const counts = countPatchChanges(d.diff);
        return {
          path: d.new_path,
          status: mapDiffStatus(d.new_file, d.deleted_file, d.renamed_file),
          additions: counts.additions, deletions: counts.deletions,
          patch: d.diff || undefined,
        };
      });
      const additions = files.reduce((sum, f) => sum + f.additions, 0);
      const deletions = files.reduce((sum, f) => sum + f.deletions, 0);
      return {files, additions, deletions};
    },

    async getBranches(): Promise<Branch[]> {
      const url = apiUrl(base, `/projects/${encodedPid}/repository/branches?per_page=100`);
      const response = await fetch(url, {headers: glHeaders(token)});
      await assertOk(response, 'getBranches');
      const data = (await response.json()) as GitLabBranch[];
      return data.map((b) => ({name: b.name, isDefault: b.default, lastCommit: b.commit.id}));
    },

    async createIssue(issue: SecurityIssue): Promise<string> {
      const url = apiUrl(base, `/projects/${encodedPid}/issues`);
      const body = JSON.stringify({title: issue.title, description: issue.body, labels: issue.labels.join(',')});
      const response = await fetch(url, {method: 'POST', headers: glHeaders(token), body});
      await assertOk(response, 'createIssue');
      const data = (await response.json()) as {web_url: string};
      return data.web_url;
    },

    async createPullRequest(title: string, body: string, head: string, baseBranch: string): Promise<string> {
      const url = apiUrl(base, `/projects/${encodedPid}/merge_requests`);
      const payload = JSON.stringify({title, description: body, source_branch: head, target_branch: baseBranch});
      const response = await fetch(url, {method: 'POST', headers: glHeaders(token), body: payload});
      await assertOk(response, 'createPullRequest');
      const data = (await response.json()) as {web_url: string};
      return data.web_url;
    },

    async commentOnPR(prNumber: number, review: SecurityReview): Promise<void> {
      const url = apiUrl(base, `/projects/${encodedPid}/merge_requests/${prNumber}/notes`);
      const parts = [review.summary];
      for (const f of review.findings) {
        const badge = `**[${f.severity.toUpperCase()}]**`;
        let c = `\n${badge} ${f.message} (${f.file}:${f.line})`;
        if (f.suggestedFix) c += `\n\n**Suggested fix:**\n\`\`\`\n${f.suggestedFix}\n\`\`\``;
        parts.push(c);
      }
      const body = JSON.stringify({body: parts.join('\n')});
      const response = await fetch(url, {method: 'POST', headers: glHeaders(token), body});
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
