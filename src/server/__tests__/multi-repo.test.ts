import {describe, it, expect, beforeEach, vi} from 'vitest';
import {tmpdir} from 'node:os';
import {mkdtemp, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {MultiRepoManager} from '../multi-repo.js';
import type {Finding} from '../../findings/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: overrides.id ?? 'f-1',
    source: 'scanner',
    scanner: 'semgrep',
    category: 'injection',
    severity: 'high',
    rawSeverity: 'high',
    title: 'SQL injection',
    description: 'User input in query',
    confidence: 0.9,
    status: 'open',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

let tempDirs: string[] = [];

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'asec-test-'));
  tempDirs.push(dir);
  return dir;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MultiRepoManager', () => {
  let manager: MultiRepoManager;

  beforeEach(async () => {
    manager = new MultiRepoManager();
    // Clean up any temp dirs from previous tests
    for (const dir of tempDirs) {
      try {
        await rm(dir, {recursive: true});
      } catch {
        // ignore
      }
    }
    tempDirs = [];
  });

  // -----------------------------------------------------------------------
  // addRepo
  // -----------------------------------------------------------------------

  describe('addRepo', () => {
    it('registers a new repository', async () => {
      const dir = await createTempDir();
      const config = await manager.addRepo(dir);

      expect(config.id).toBeDefined();
      expect(config.rootDir).toBe(dir);
      expect(config.addedAt).toBeDefined();
      expect(config.tags).toEqual([]);
    });

    it('uses custom name and tags', async () => {
      const dir = await createTempDir();
      const config = await manager.addRepo(dir, {
        name: 'my-repo',
        tags: ['security', 'backend'],
      });

      expect(config.name).toBe('my-repo');
      expect(config.tags).toEqual(['security', 'backend']);
    });

    it('defaults name to directory basename', async () => {
      const dir = await createTempDir();
      const config = await manager.addRepo(dir);
      // Basename of mkdtemp result
      expect(config.name).toMatch(/^asec-test-/);
    });

    it('throws for non-existent directory', async () => {
      await expect(
        manager.addRepo('/tmp/does-not-exist-12345678'),
      ).rejects.toThrow('Directory does not exist');
    });

    it('throws for duplicate path', async () => {
      const dir = await createTempDir();
      await manager.addRepo(dir);
      await expect(manager.addRepo(dir)).rejects.toThrow(
        'Repository already registered',
      );
    });
  });

  // -----------------------------------------------------------------------
  // removeRepo
  // -----------------------------------------------------------------------

  describe('removeRepo', () => {
    it('removes a registered repository', async () => {
      const dir = await createTempDir();
      const config = await manager.addRepo(dir);

      expect(manager.removeRepo(config.id)).toBe(true);
      expect(manager.listRepos()).toHaveLength(0);
    });

    it('returns false for unknown ID', () => {
      expect(manager.removeRepo('nonexistent')).toBe(false);
    });

    it('also clears scan results for that repo', async () => {
      const dir = await createTempDir();
      const scanFn = vi.fn(async () => [makeFinding()]);
      const mgr = new MultiRepoManager(scanFn);
      const config = await mgr.addRepo(dir);

      await mgr.scanAll();
      expect(mgr.getAggregateFindings().allFindings).toHaveLength(1);

      mgr.removeRepo(config.id);
      expect(mgr.getAggregateFindings().allFindings).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // listRepos
  // -----------------------------------------------------------------------

  describe('listRepos', () => {
    it('returns all repos when no tag filter', async () => {
      const d1 = await createTempDir();
      const d2 = await createTempDir();
      await manager.addRepo(d1);
      await manager.addRepo(d2);

      expect(manager.listRepos()).toHaveLength(2);
    });

    it('filters by tags', async () => {
      const d1 = await createTempDir();
      const d2 = await createTempDir();
      await manager.addRepo(d1, {tags: ['backend']});
      await manager.addRepo(d2, {tags: ['frontend']});

      const result = manager.listRepos(['backend']);
      expect(result).toHaveLength(1);
      expect(result[0].tags).toContain('backend');
    });

    it('returns empty array for no matching tags', async () => {
      const dir = await createTempDir();
      await manager.addRepo(dir, {tags: ['backend']});

      expect(manager.listRepos(['mobile'])).toHaveLength(0);
    });

    it('returns all for empty tag filter', async () => {
      const dir = await createTempDir();
      await manager.addRepo(dir, {tags: ['backend']});

      // Empty array means no filter
      expect(manager.listRepos([])).toHaveLength(1);
    });
  });

  // -----------------------------------------------------------------------
  // getRepo
  // -----------------------------------------------------------------------

  describe('getRepo', () => {
    it('returns repo by ID', async () => {
      const dir = await createTempDir();
      const config = await manager.addRepo(dir);

      expect(manager.getRepo(config.id)).toEqual(config);
    });

    it('returns undefined for unknown ID', () => {
      expect(manager.getRepo('nonexistent')).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // scanAll
  // -----------------------------------------------------------------------

  describe('scanAll', () => {
    it('scans all repos with default scan function (no findings)', async () => {
      const dir = await createTempDir();
      await manager.addRepo(dir);

      const results = await manager.scanAll();
      expect(results).toHaveLength(1);
      expect(results[0].findings).toEqual([]);
      expect(results[0].error).toBeUndefined();
    });

    it('returns findings from custom scan function', async () => {
      const dir = await createTempDir();
      const findings = [makeFinding({id: 'scan-1'}), makeFinding({id: 'scan-2'})];
      const scanFn = vi.fn(async () => findings);
      const mgr = new MultiRepoManager(scanFn);
      await mgr.addRepo(dir);

      const results = await mgr.scanAll();
      expect(results[0].findings).toHaveLength(2);
      expect(scanFn).toHaveBeenCalledWith(dir);
    });

    it('handles scan errors gracefully', async () => {
      const dir = await createTempDir();
      const scanFn = vi.fn(async () => {
        throw new Error('Scanner crashed');
      });
      const mgr = new MultiRepoManager(scanFn);
      await mgr.addRepo(dir);

      const results = await mgr.scanAll();
      expect(results).toHaveLength(1);
      expect(results[0].error).toBe('Scanner crashed');
      expect(results[0].findings).toEqual([]);
    });

    it('scans multiple repos in parallel', async () => {
      const d1 = await createTempDir();
      const d2 = await createTempDir();
      const scanFn = vi.fn(async (rootDir: string) => {
        return [makeFinding({id: `finding-${rootDir.slice(-6)}`})];
      });
      const mgr = new MultiRepoManager(scanFn);
      await mgr.addRepo(d1);
      await mgr.addRepo(d2);

      const results = await mgr.scanAll();
      expect(results).toHaveLength(2);
      expect(scanFn).toHaveBeenCalledTimes(2);
    });

    it('returns empty array when no repos registered', async () => {
      const results = await manager.scanAll();
      expect(results).toEqual([]);
    });

    it('records duration for each scan', async () => {
      const dir = await createTempDir();
      const scanFn = vi.fn(async () => []);
      const mgr = new MultiRepoManager(scanFn);
      await mgr.addRepo(dir);

      const results = await mgr.scanAll();
      expect(results[0].duration).toBeGreaterThanOrEqual(0);
      expect(results[0].scannedAt).toBeDefined();
    });
  });

  // -----------------------------------------------------------------------
  // getAggregateFindings
  // -----------------------------------------------------------------------

  describe('getAggregateFindings', () => {
    it('aggregates findings from multiple repos', async () => {
      const d1 = await createTempDir();
      const d2 = await createTempDir();
      const scanFn = vi.fn(async (rootDir: string) => {
        if (rootDir === d1) {
          return [
            makeFinding({id: 'f1', severity: 'high'}),
            makeFinding({id: 'f2', severity: 'low'}),
          ];
        }
        return [makeFinding({id: 'f3', severity: 'critical'})];
      });
      const mgr = new MultiRepoManager(scanFn);
      await mgr.addRepo(d1);
      await mgr.addRepo(d2);

      await mgr.scanAll();
      const agg = mgr.getAggregateFindings();

      expect(agg.allFindings).toHaveLength(3);
      expect(agg.repos).toHaveLength(2);
      expect(agg.summary.total).toBe(3);
      expect(agg.summary.bySeverity.high).toBe(1);
      expect(agg.summary.bySeverity.low).toBe(1);
      expect(agg.summary.bySeverity.critical).toBe(1);
      expect(agg.generatedAt).toBeDefined();
    });

    it('returns empty aggregate when no scans performed', () => {
      const agg = manager.getAggregateFindings();
      expect(agg.allFindings).toEqual([]);
      expect(agg.repos).toEqual([]);
      expect(agg.summary.total).toBe(0);
    });

    it('includes per-repo finding counts', async () => {
      const d1 = await createTempDir();
      const d2 = await createTempDir();
      const scanFn = vi.fn(async (rootDir: string) => {
        if (rootDir === d1) return [makeFinding(), makeFinding({id: 'f2'})];
        return [];
      });
      const mgr = new MultiRepoManager(scanFn);
      await mgr.addRepo(d1, {name: 'repo-a'});
      await mgr.addRepo(d2, {name: 'repo-b'});

      await mgr.scanAll();
      const agg = mgr.getAggregateFindings();

      const repoA = agg.repos.find(r => r.repoName === 'repo-a');
      const repoB = agg.repos.find(r => r.repoName === 'repo-b');
      expect(repoA?.findingsCount).toBe(2);
      expect(repoB?.findingsCount).toBe(0);
    });
  });
});
