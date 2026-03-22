import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {createGitLabPlatformAdapter} from '../gitlab.js';
import type {GitPlatform, SecurityReview} from '../../providers/git-platform/types.js';

const mockFetch = vi.fn();
beforeEach(() => { vi.stubGlobal('fetch', mockFetch); });
afterEach(() => { vi.restoreAllMocks(); });

function ok(data: unknown): Response {
  return {ok: true, status: 200, json: () => Promise.resolve(data), text: () => Promise.resolve(JSON.stringify(data))} as unknown as Response;
}
function err(status: number, body = ''): Response {
  return {ok: false, status, json: () => Promise.resolve({}), text: () => Promise.resolve(body)} as unknown as Response;
}
function makeMR(o: Record<string, unknown> = {}) {
  return {id: 100, iid: 5, title: 'Fix', state: 'opened', author: {username: 'dev1'}, target_branch: 'main', source_branch: 'fix/auth', web_url: 'https://gitlab.com/t/r/-/merge_requests/5', created_at: '2026-03-20T10:00:00Z', updated_at: '2026-03-20T12:00:00Z', ...o};
}

describe('GitLab adapter', () => {
  let a: GitPlatform;
  beforeEach(() => { a = createGitLabPlatformAdapter('glpat-test', 'https://gitlab.com', 'team/repo'); });

  it('has name gitlab', () => { expect(a.name).toBe('gitlab'); });

  describe('getPullRequests', () => {
    it('maps open MRs', async () => {
      mockFetch.mockResolvedValueOnce(ok([makeMR()]));
      const r = await a.getPullRequests('open');
      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('state=opened'), expect.any(Object));
      expect(r).toHaveLength(1);
      expect(r[0].state).toBe('open');
      expect(r[0].number).toBe(5);
    });
    it('maps merged MRs', async () => {
      mockFetch.mockResolvedValueOnce(ok([makeMR({state: 'merged'})]));
      const r = await a.getPullRequests('merged');
      expect(r[0].state).toBe('merged');
    });
    it('handles null author', async () => {
      mockFetch.mockResolvedValueOnce(ok([makeMR({author: null})]));
      expect((await a.getPullRequests('open'))[0].author).toBe('unknown');
    });
    it('throws on error', async () => {
      mockFetch.mockResolvedValueOnce(err(403, 'Forbidden'));
      await expect(a.getPullRequests('open')).rejects.toThrow(/GitLab getPullRequests failed \(403\)/);
    });
  });

  describe('getDiff', () => {
    it('parses diffs', async () => {
      mockFetch.mockResolvedValueOnce(ok({diffs: [
        {new_path: 'a.ts', old_path: 'a.ts', new_file: true, deleted_file: false, renamed_file: false, diff: '+l1\n+l2\n+l3'},
        {new_path: 'b.ts', old_path: 'b.ts', new_file: false, deleted_file: true, renamed_file: false, diff: '-r1\n-r2'},
      ]}));
      const d = await a.getDiff('main', 'fix');
      expect(d.files).toHaveLength(2);
      expect(d.files[0].status).toBe('added');
      expect(d.files[0].additions).toBe(3);
      expect(d.files[1].status).toBe('deleted');
      expect(d.additions).toBe(3);
      expect(d.deletions).toBe(2);
    });
    it('handles renamed', async () => {
      mockFetch.mockResolvedValueOnce(ok({diffs: [{new_path: 'n.ts', old_path: 'o.ts', new_file: false, deleted_file: false, renamed_file: true, diff: ''}]}));
      expect((await a.getDiff('main', 'r')).files[0].status).toBe('renamed');
    });
    it('handles empty', async () => {
      mockFetch.mockResolvedValueOnce(ok({diffs: []}));
      const d = await a.getDiff('main', 'main');
      expect(d.files).toHaveLength(0);
    });
  });

  describe('getBranches', () => {
    it('maps branches', async () => {
      mockFetch.mockResolvedValueOnce(ok([{name: 'main', default: true, commit: {id: 'abc'}}, {name: 'dev', default: false, commit: {id: 'def'}}]));
      const b = await a.getBranches();
      expect(b).toHaveLength(2);
      expect(b[0].isDefault).toBe(true);
    });
  });

  describe('createIssue', () => {
    it('creates and returns URL', async () => {
      mockFetch.mockResolvedValueOnce(ok({web_url: 'https://gitlab.com/t/r/-/issues/42'}));
      const url = await a.createIssue({title: 'SQL injection', body: 'Details', severity: 'critical', labels: ['security']});
      expect(url).toBe('https://gitlab.com/t/r/-/issues/42');
    });
  });

  describe('createPullRequest', () => {
    it('creates MR and returns URL', async () => {
      mockFetch.mockResolvedValueOnce(ok({web_url: 'https://gitlab.com/t/r/-/merge_requests/99'}));
      expect(await a.createPullRequest('fix: patch', 'Body', 'fix/x', 'main')).toBe('https://gitlab.com/t/r/-/merge_requests/99');
    });
  });

  describe('commentOnPR', () => {
    it('posts note with findings', async () => {
      mockFetch.mockResolvedValueOnce(ok({}));
      const review: SecurityReview = {summary: 'Issues found.', findings: [{file: 'a.ts', line: 15, severity: 'critical', message: 'Creds', suggestedFix: 'Use env'}], approved: false};
      await a.commentOnPR(5, review);
      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/merge_requests/5/notes'), expect.objectContaining({method: 'POST'}));
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.body).toContain('[CRITICAL]');
      expect(body.body).toContain('Use env');
    });
  });

  describe('event handlers', () => {
    it('onPullRequestOpened', () => { a.onPullRequestOpened(vi.fn()); expect(true).toBe(true); });
    it('onPush', () => { a.onPush(vi.fn()); expect(true).toBe(true); });
  });
});
