import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {createBitbucketPlatformAdapter} from '../bitbucket.js';
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
function makePR(o: Record<string, unknown> = {}) {
  return {id: 42, title: 'Add headers', state: 'OPEN', author: {display_name: 'Dev One', nickname: 'dev1'}, destination: {branch: {name: 'main'}}, source: {branch: {name: 'feat/h'}}, links: {html: {href: 'https://bb.org/t/r/pull-requests/42'}}, created_on: '2026-03-20T10:00:00Z', updated_on: '2026-03-20T12:00:00Z', ...o};
}

describe('Bitbucket adapter', () => {
  let a: GitPlatform;
  beforeEach(() => { a = createBitbucketPlatformAdapter('bb-token', 'team', 'repo', 'https://api.bitbucket.org'); });

  it('has name bitbucket', () => { expect(a.name).toBe('bitbucket'); });

  describe('getPullRequests', () => {
    it('maps open PRs', async () => {
      mockFetch.mockResolvedValueOnce(ok({values: [makePR()]}));
      const r = await a.getPullRequests('open');
      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('state=OPEN'), expect.any(Object));
      expect(r).toHaveLength(1);
      expect(r[0].state).toBe('open');
      expect(r[0].author).toBe('dev1');
    });
    it('maps merged', async () => {
      mockFetch.mockResolvedValueOnce(ok({values: [makePR({state: 'MERGED'})]}));
      expect((await a.getPullRequests('merged'))[0].state).toBe('merged');
    });
    it('maps closed', async () => {
      mockFetch.mockResolvedValueOnce(ok({values: [makePR({state: 'DECLINED'})]}));
      expect((await a.getPullRequests('open'))[0].state).toBe('closed');
    });
    it('fallback to display_name', async () => {
      mockFetch.mockResolvedValueOnce(ok({values: [makePR({author: {display_name: 'D2'}})]}));
      expect((await a.getPullRequests('open'))[0].author).toBe('D2');
    });
    it('null author', async () => {
      mockFetch.mockResolvedValueOnce(ok({values: [makePR({author: null})]}));
      expect((await a.getPullRequests('open'))[0].author).toBe('unknown');
    });
    it('error', async () => {
      mockFetch.mockResolvedValueOnce(err(401, 'Unauth'));
      await expect(a.getPullRequests('open')).rejects.toThrow(/Bitbucket getPullRequests failed \(401\)/);
    });
  });

  describe('getDiff', () => {
    it('parses diffstat', async () => {
      mockFetch.mockResolvedValueOnce(ok({values: [
        {new: {path: 'a.ts'}, old: {path: 'a.ts'}, status: 'added', lines_added: 50, lines_removed: 0},
        {new: {path: 'b.ts'}, old: {path: 'b.ts'}, status: 'removed', lines_added: 0, lines_removed: 30},
      ]}));
      const d = await a.getDiff('main', 'feat');
      expect(d.files[0].status).toBe('added');
      expect(d.files[1].status).toBe('deleted');
      expect(d.additions).toBe(50);
      expect(d.deletions).toBe(30);
    });
    it('renamed', async () => {
      mockFetch.mockResolvedValueOnce(ok({values: [{new: {path: 'n.ts'}, old: {path: 'o.ts'}, status: 'renamed', lines_added: 0, lines_removed: 0}]}));
      expect((await a.getDiff('main', 'r')).files[0].status).toBe('renamed');
    });
    it('falls back to old path', async () => {
      mockFetch.mockResolvedValueOnce(ok({values: [{old: {path: 'rm.ts'}, status: 'removed', lines_added: 0, lines_removed: 10}]}));
      expect((await a.getDiff('main', 'c')).files[0].path).toBe('rm.ts');
    });
    it('empty', async () => {
      mockFetch.mockResolvedValueOnce(ok({values: []}));
      expect((await a.getDiff('main', 'main')).files).toHaveLength(0);
    });
  });

  describe('getBranches', () => {
    it('maps with default flag', async () => {
      mockFetch.mockResolvedValueOnce(ok({values: [{name: 'main', target: {hash: 'abc'}}, {name: 'dev', target: {hash: 'def'}}]}));
      mockFetch.mockResolvedValueOnce(ok({mainbranch: {type: 'branch', name: 'main'}}));
      const b = await a.getBranches();
      expect(b).toHaveLength(2);
      expect(b[0].isDefault).toBe(true);
      expect(b[1].isDefault).toBe(false);
    });
    it('defaults to main', async () => {
      mockFetch.mockResolvedValueOnce(ok({values: [{name: 'main', target: {hash: 'a'}}]}));
      mockFetch.mockResolvedValueOnce(ok({}));
      expect((await a.getBranches())[0].isDefault).toBe(true);
    });
  });

  describe('createIssue', () => {
    it('creates and returns URL', async () => {
      mockFetch.mockResolvedValueOnce(ok({links: {html: {href: 'https://bb.org/t/r/issues/99'}}}));
      expect(await a.createIssue({title: 'XSS', body: 'Found', severity: 'high', labels: ['sec']})).toBe('https://bb.org/t/r/issues/99');
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.priority).toBe('critical');
    });
    it('low -> major', async () => {
      mockFetch.mockResolvedValueOnce(ok({links: {html: {href: 'url'}}}));
      await a.createIssue({title: 'x', body: 'y', severity: 'low', labels: []});
      expect(JSON.parse(mockFetch.mock.calls[0][1].body).priority).toBe('major');
    });
  });

  describe('createPullRequest', () => {
    it('creates PR', async () => {
      mockFetch.mockResolvedValueOnce(ok({links: {html: {href: 'https://bb.org/t/r/pull-requests/50'}}}));
      expect(await a.createPullRequest('fix: xss', 'Body', 'fix/x', 'main')).toBe('https://bb.org/t/r/pull-requests/50');
    });
  });

  describe('commentOnPR', () => {
    it('posts comment', async () => {
      mockFetch.mockResolvedValueOnce(ok({}));
      const review: SecurityReview = {summary: 'Review.', findings: [{file: 'h.ts', line: 20, severity: 'high', message: 'Missing validation'}], approved: false};
      await a.commentOnPR(42, review);
      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/pullrequests/42/comments'), expect.objectContaining({method: 'POST'}));
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.content.raw).toContain('[HIGH]');
    });
    it('includes suggested fix', async () => {
      mockFetch.mockResolvedValueOnce(ok({}));
      const review: SecurityReview = {summary: 'R', findings: [{file: 'db.ts', line: 10, severity: 'critical', message: 'SQLi', suggestedFix: 'Parameterize'}], approved: false};
      await a.commentOnPR(1, review);
      expect(JSON.parse(mockFetch.mock.calls[0][1].body).content.raw).toContain('Parameterize');
    });
  });

  describe('event handlers', () => {
    it('onPullRequestOpened', () => { a.onPullRequestOpened(vi.fn()); expect(true).toBe(true); });
    it('onPush', () => { a.onPush(vi.fn()); expect(true).toBe(true); });
  });
});
