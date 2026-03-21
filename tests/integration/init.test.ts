/**
 * Integration tests for `asec init` — runs the full discovery engine
 * against real fixture directories and verifies profile.yaml content.
 *
 * ASEC-115
 */

import {describe, it, expect, afterEach} from 'vitest';
import {resolve, join} from 'node:path';
import {readFile, rm, access} from 'node:fs/promises';
import {parse as parseYaml} from 'yaml';

import {runDiscovery} from '../../src/discovery/engine.js';
import {writeProfile} from '../../src/discovery/profile-writer.js';
import type {SecurityProfile} from '../../src/discovery/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FIXTURES_DIR = resolve(import.meta.dirname, '../fixtures');
const PROFILE_DIR = '.augmenta-sec';
const PROFILE_FILE = 'profile.yaml';

/** Runs discovery + writes profile, returns parsed profile. */
async function initFixture(fixtureName: string): Promise<{
  profile: SecurityProfile;
  profilePath: string;
  rawYaml: string;
  duration: number;
  warnings: string[];
}> {
  const rootDir = join(FIXTURES_DIR, fixtureName);
  const {profile, duration, warnings} = await runDiscovery(rootDir);
  const profilePath = await writeProfile(profile, rootDir);
  const rawYaml = await readFile(profilePath, 'utf-8');
  return {profile, profilePath, rawYaml, duration, warnings};
}

/** Cleans up generated .augmenta-sec directory. */
async function cleanupFixture(fixtureName: string): Promise<void> {
  const outputDir = join(FIXTURES_DIR, fixtureName, PROFILE_DIR);
  await rm(outputDir, {recursive: true, force: true});
}

// ---------------------------------------------------------------------------
// node-express-react
// ---------------------------------------------------------------------------

describe('asec init — node-express-react fixture', () => {
  afterEach(async () => {
    await cleanupFixture('node-express-react');
  });

  it('creates .augmenta-sec/profile.yaml', async () => {
    const {profilePath} = await initFixture('node-express-react');
    await expect(access(profilePath)).resolves.toBeUndefined();
  });

  it('detects TypeScript as primary language', async () => {
    const {profile} = await initFixture('node-express-react');
    expect(profile.languages.primary).toBe('typescript');
    expect(profile.languages.all.length).toBeGreaterThan(0);
    const ts = profile.languages.all.find(l => l.name === 'typescript');
    expect(ts).toBeDefined();
    expect(ts!.percentage).toBeGreaterThan(0);
  });

  it('detects Express, React, and Prisma frameworks', async () => {
    const {profile} = await initFixture('node-express-react');

    const backendNames = profile.frameworks.backend.map(f => f.name);
    expect(backendNames).toContain('express');

    const frontendNames = profile.frameworks.frontend.map(f => f.name);
    expect(frontendNames).toContain('react');

    const ormNames = profile.frameworks.orm.map(f => f.name);
    expect(ormNames).toContain('prisma');
  });

  it('detects JWT authentication', async () => {
    const {profile} = await initFixture('node-express-react');
    const providerNames = profile.auth.providers.map(p => p.name);
    expect(providerNames).toContain('jwt');
  });

  it('detects database via Prisma ORM', async () => {
    const {profile} = await initFixture('node-express-react');
    expect(profile.database.databases.length).toBeGreaterThan(0);
    const db = profile.database.databases.find(d => d.orm === 'prisma');
    expect(db).toBeDefined();
  });

  it('detects REST API routes', async () => {
    const {profile} = await initFixture('node-express-react');
    expect(profile.api.styles).toContain('rest');
    expect(profile.api.routeCount).toBeGreaterThan(0);
  });

  it('detects security controls (helmet, cors)', async () => {
    const {profile} = await initFixture('node-express-react');
    const presentNames = profile.securityControls.present.map(c => c.name.toLowerCase());
    expect(presentNames.some(n => n.includes('helmet') || n.includes('http security'))).toBe(true);
    expect(presentNames.some(n => n.includes('cors'))).toBe(true);
  });

  it('detects GitHub Actions CI', async () => {
    const {profile} = await initFixture('node-express-react');
    expect(profile.ci.platform).toBe('github-actions');
    expect(profile.ci.workflows.length).toBeGreaterThan(0);
  });

  it('detects Docker', async () => {
    const {profile} = await initFixture('node-express-react');
    expect(profile.docker.hasDocker).toBe(true);
    expect(profile.docker.dockerfiles.length).toBeGreaterThan(0);
  });

  it('writes valid YAML with header comment', async () => {
    const {rawYaml} = await initFixture('node-express-react');
    expect(rawYaml).toContain('# AugmentaSec Security Profile');
    // Parse should not throw
    const parsed = parseYaml(rawYaml);
    expect(parsed).toHaveProperty('version', '1.0');
    expect(parsed).toHaveProperty('generatedAt');
    expect(parsed).toHaveProperty('languages');
  });

  it('profile has all required top-level sections', async () => {
    const {profile} = await initFixture('node-express-react');
    const requiredKeys: Array<keyof SecurityProfile> = [
      'version', 'generatedAt', 'target', 'project',
      'languages', 'frameworks', 'auth', 'database',
      'api', 'securityControls', 'ci', 'docs',
      'trustBoundaries', 'piiFields', 'monorepo',
      'git', 'docker', 'iac', 'secrets', 'licenses',
      'pythonEcosystem', 'goEcosystem', 'rustEcosystem', 'jvmEcosystem',
    ];
    for (const key of requiredKeys) {
      expect(profile).toHaveProperty(key);
    }
  });

  it('completes within a reasonable time', async () => {
    const {duration} = await initFixture('node-express-react');
    expect(duration).toBeLessThan(10_000); // 10 seconds max
  });
});

// ---------------------------------------------------------------------------
// python-django
// ---------------------------------------------------------------------------

describe('asec init — python-django fixture', () => {
  afterEach(async () => {
    await cleanupFixture('python-django');
  });

  it('creates .augmenta-sec/profile.yaml', async () => {
    const {profilePath} = await initFixture('python-django');
    await expect(access(profilePath)).resolves.toBeUndefined();
  });

  it('detects Python as primary language', async () => {
    const {profile} = await initFixture('python-django');
    expect(profile.languages.primary).toBe('python');
  });

  it('detects Django framework', async () => {
    const {profile} = await initFixture('python-django');
    const allFrameworks = [
      ...profile.frameworks.backend,
      ...profile.frameworks.frontend,
      ...profile.frameworks.fullstack,
    ];
    const names = allFrameworks.map(f => f.name.toLowerCase());
    expect(names).toContain('django');
  });

  it('detects PostgreSQL database via Django ORM', async () => {
    const {profile} = await initFixture('python-django');
    expect(profile.database.databases.length).toBeGreaterThan(0);
    const pg = profile.database.databases.find(
      d => d.type === 'postgresql' || d.orm === 'django-orm',
    );
    expect(pg).toBeDefined();
  });

  it('detects GitLab CI', async () => {
    const {profile} = await initFixture('python-django');
    expect(profile.ci.platform).toBe('gitlab-ci');
  });

  it('detects Docker', async () => {
    const {profile} = await initFixture('python-django');
    expect(profile.docker.hasDocker).toBe(true);
  });

  it('detects Python ecosystem', async () => {
    const {profile} = await initFixture('python-django');
    expect(profile.pythonEcosystem.detected).toBe(true);
    expect(profile.pythonEcosystem.frameworks).toContain('django');
  });

  it('is not a monorepo', async () => {
    const {profile} = await initFixture('python-django');
    expect(profile.monorepo.isMonorepo).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// go-gin
// ---------------------------------------------------------------------------

describe('asec init — go-gin fixture', () => {
  afterEach(async () => {
    await cleanupFixture('go-gin');
  });

  it('creates .augmenta-sec/profile.yaml', async () => {
    const {profilePath} = await initFixture('go-gin');
    await expect(access(profilePath)).resolves.toBeUndefined();
  });

  it('detects Go as primary language', async () => {
    const {profile} = await initFixture('go-gin');
    expect(profile.languages.primary).toBe('go');
  });

  it('detects Gin and GORM frameworks', async () => {
    const {profile} = await initFixture('go-gin');
    const allFrameworks = [
      ...profile.frameworks.backend,
      ...profile.frameworks.frontend,
      ...profile.frameworks.fullstack,
      ...profile.frameworks.orm,
    ];
    const names = allFrameworks.map(f => f.name.toLowerCase());
    expect(names).toContain('gin');
    expect(names).toContain('gorm');
  });

  it('detects REST API routes', async () => {
    const {profile} = await initFixture('go-gin');
    expect(profile.api.styles).toContain('rest');
    expect(profile.api.routeCount).toBeGreaterThan(0);
  });

  it('detects Go ecosystem', async () => {
    const {profile} = await initFixture('go-gin');
    expect(profile.goEcosystem.detected).toBe(true);
    expect(profile.goEcosystem.goVersion).toBeDefined();
    expect(profile.goEcosystem.frameworks).toContain('gin');
  });

  it('detects Docker', async () => {
    const {profile} = await initFixture('go-gin');
    expect(profile.docker.hasDocker).toBe(true);
  });

  it('has no CI (no workflow files in fixture)', async () => {
    const {profile} = await initFixture('go-gin');
    expect(profile.ci.platform).toBe('none');
  });

  it('is not a monorepo', async () => {
    const {profile} = await initFixture('go-gin');
    expect(profile.monorepo.isMonorepo).toBe(false);
  });
});
