/**
 * Integration tests for the discovery engine internals — verifies
 * DetectorContext, individual detectors, and parallel execution
 * against real fixture directories.
 *
 * ASEC-115
 */

import {describe, it, expect} from 'vitest';
import {resolve, join} from 'node:path';

import {createDetectorContext} from '../../src/utils/file-utils.js';
import {runDiscovery} from '../../src/discovery/engine.js';
import type {DetectorContext} from '../../src/discovery/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FIXTURES_DIR = resolve(import.meta.dirname, '../fixtures');

function fixtureCtx(fixtureName: string): DetectorContext {
  return createDetectorContext(join(FIXTURES_DIR, fixtureName));
}

// ---------------------------------------------------------------------------
// DetectorContext — file operations
// ---------------------------------------------------------------------------

describe('DetectorContext — file operations', () => {
  const ctx = fixtureCtx('node-express-react');

  it('findFiles returns matching files', async () => {
    const files = await ctx.findFiles(['**/*.ts']);
    expect(files.length).toBeGreaterThan(0);
    expect(files.some(f => f.endsWith('.ts'))).toBe(true);
  });

  it('readFile returns file content', async () => {
    const content = await ctx.readFile('package.json');
    expect(content).not.toBeNull();
    expect(content).toContain('node-express-react-fixture');
  });

  it('readFile returns null for non-existent file', async () => {
    const content = await ctx.readFile('does-not-exist.txt');
    expect(content).toBeNull();
  });

  it('readJson parses JSON files', async () => {
    const pkg = await ctx.readJson<{name: string}>('package.json');
    expect(pkg).not.toBeNull();
    expect(pkg!.name).toBe('node-express-react-fixture');
  });

  it('fileExists returns true for existing file', async () => {
    const exists = await ctx.fileExists('package.json');
    expect(exists).toBe(true);
  });

  it('fileExists returns false for missing file', async () => {
    const exists = await ctx.fileExists('nonexistent.json');
    expect(exists).toBe(false);
  });

  it('grep finds pattern matches in files', async () => {
    const matches = await ctx.grep(/express/, ['**/*.ts', '**/*.json']);
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0]).toHaveProperty('file');
    expect(matches[0]).toHaveProperty('line');
    expect(matches[0]).toHaveProperty('content');
  });
});

// ---------------------------------------------------------------------------
// Discovery engine — parallel execution correctness
// ---------------------------------------------------------------------------

describe('runDiscovery — parallel detector execution', () => {
  it('produces no warnings for well-formed fixtures', async () => {
    const rootDir = join(FIXTURES_DIR, 'node-express-react');
    const {warnings} = await runDiscovery(rootDir);
    expect(warnings).toEqual([]);
  });

  it('sets generatedAt to a valid ISO timestamp', async () => {
    const rootDir = join(FIXTURES_DIR, 'node-express-react');
    const {profile} = await runDiscovery(rootDir);
    const date = new Date(profile.generatedAt);
    expect(date.getTime()).not.toBeNaN();
  });

  it('sets project.name from directory basename', async () => {
    const rootDir = join(FIXTURES_DIR, 'node-express-react');
    const {profile} = await runDiscovery(rootDir);
    expect(profile.project.name).toBe('node-express-react');
  });

  it('sets target to absolute path', async () => {
    const rootDir = join(FIXTURES_DIR, 'node-express-react');
    const {profile} = await runDiscovery(rootDir);
    expect(profile.target).toBe(rootDir);
  });

  it('returns consistent results across runs', async () => {
    const rootDir = join(FIXTURES_DIR, 'go-gin');
    const run1 = await runDiscovery(rootDir);
    const run2 = await runDiscovery(rootDir);

    // Structure should be identical (timestamps differ)
    expect(run1.profile.languages.primary).toBe(run2.profile.languages.primary);
    expect(run1.profile.languages.all.length).toBe(run2.profile.languages.all.length);
    expect(run1.profile.api.routeCount).toBe(run2.profile.api.routeCount);
    expect(run1.profile.goEcosystem.detected).toBe(run2.profile.goEcosystem.detected);
  });
});

// ---------------------------------------------------------------------------
// Cross-fixture consistency checks
// ---------------------------------------------------------------------------

describe('runDiscovery — cross-fixture consistency', () => {
  it('node fixture does not detect Python or Go ecosystem', async () => {
    const rootDir = join(FIXTURES_DIR, 'node-express-react');
    const {profile} = await runDiscovery(rootDir);
    expect(profile.pythonEcosystem.detected).toBe(false);
    expect(profile.goEcosystem.detected).toBe(false);
  });

  it('python fixture does not detect Go or Rust ecosystem', async () => {
    const rootDir = join(FIXTURES_DIR, 'python-django');
    const {profile} = await runDiscovery(rootDir);
    expect(profile.goEcosystem.detected).toBe(false);
    expect(profile.rustEcosystem.detected).toBe(false);
  });

  it('go fixture does not detect Python or JVM ecosystem', async () => {
    const rootDir = join(FIXTURES_DIR, 'go-gin');
    const {profile} = await runDiscovery(rootDir);
    expect(profile.pythonEcosystem.detected).toBe(false);
    expect(profile.jvmEcosystem.detected).toBe(false);
  });

  it('all fixtures produce version 1.0 profiles', async () => {
    const fixtures = ['node-express-react', 'python-django', 'go-gin'];
    for (const fixture of fixtures) {
      const rootDir = join(FIXTURES_DIR, fixture);
      const {profile} = await runDiscovery(rootDir);
      expect(profile.version).toBe('1.0');
    }
  });
});
