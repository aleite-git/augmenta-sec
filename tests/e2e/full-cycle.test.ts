/**
 * E2E full-cycle test — runs init -> verify profile -> scan (offline)
 * -> verify output, all via child_process.execFile against temp dirs.
 *
 * ASEC-120
 */

import {describe, it, expect, afterEach} from 'vitest';
import {execFile} from 'node:child_process';
import {mkdtemp, rm, cp, readFile, access} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {parse as parseYaml} from 'yaml';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PROJECT_ROOT = join(import.meta.dirname, '../..');
const CLI_ENTRY = join(PROJECT_ROOT, 'src/index.ts');
const TSX_BIN = join(PROJECT_ROOT, 'node_modules/.bin/tsx');
const FIXTURES_DIR = join(PROJECT_ROOT, 'tests/fixtures');

/** Executes the CLI via tsx and returns stdout/stderr/exitCode. */
function runCli(
  args: string[],
  options?: {cwd?: string; timeout?: number},
): Promise<{stdout: string; stderr: string; exitCode: number}> {
  return new Promise((resolve) => {
    execFile(
      TSX_BIN,
      [CLI_ENTRY, ...args],
      {
        cwd: options?.cwd ?? PROJECT_ROOT,
        timeout: options?.timeout ?? 30_000,
        env: {...process.env, NO_COLOR: '1', FORCE_COLOR: '0'},
      },
      (error, stdout, stderr) => {
        resolve({
          stdout: stdout ?? '',
          stderr: stderr ?? '',
          exitCode: error?.code ? Number(error.code) : error ? 1 : 0,
        });
      },
    );
  });
}

/** Creates a temp dir with a copy of a fixture. Returns cleanup function. */
async function createTempFixture(
  fixtureName: string,
): Promise<{tmpDir: string; cleanup: () => Promise<void>}> {
  const tmpDir = await mkdtemp(join(tmpdir(), `asec-e2e-cycle-${fixtureName}-`));
  const srcDir = join(FIXTURES_DIR, fixtureName);
  await cp(srcDir, tmpDir, {recursive: true});
  return {
    tmpDir,
    cleanup: async () => rm(tmpDir, {recursive: true, force: true}),
  };
}

// ---------------------------------------------------------------------------
// Full cycle: init -> verify -> scan -> verify
// ---------------------------------------------------------------------------

describe('full cycle — node-express-react', () => {
  let cleanup: (() => Promise<void>) | undefined;

  afterEach(async () => {
    if (cleanup) {
      await cleanup();
      cleanup = undefined;
    }
  });

  it('init -> verify profile -> scan (offline) -> verify output', async () => {
    const fixture = await createTempFixture('node-express-react');
    cleanup = fixture.cleanup;
    const profilePath = join(fixture.tmpDir, '.augmenta-sec', 'profile.yaml');

    // Step 1: init
    const initResult = await runCli(['init', fixture.tmpDir]);
    expect(initResult.exitCode).toBe(0);
    expect(initResult.stdout).toContain('Profile written to');

    // Step 2: verify profile.yaml exists and has valid content
    await expect(access(profilePath)).resolves.toBeUndefined();
    const rawYaml = await readFile(profilePath, 'utf-8');
    expect(rawYaml).toContain('# AugmentaSec Security Profile');

    const profile = parseYaml(rawYaml);
    expect(profile.version).toBe('1.0');
    expect(profile.languages.primary).toBe('typescript');
    expect(profile.project.name).toBe(
      fixture.tmpDir.split('/').pop(),
    );

    // Verify framework detection in profile YAML
    const backendNames = profile.frameworks.backend.map(
      (f: {name: string}) => f.name,
    );
    expect(backendNames).toContain('express');

    // Verify auth detection
    const authProviders = profile.auth.providers.map(
      (p: {name: string}) => p.name,
    );
    expect(authProviders).toContain('jwt');

    // Step 3: scan (offline — no external scanners)
    // The scan command currently prints a stub message
    const scanResult = await runCli(['scan', fixture.tmpDir]);
    expect(scanResult.exitCode).toBe(0);

    // Step 4: verify scan output
    // Currently scan is a stub, so we verify it runs without error
    // and produces the expected stub output
    expect(scanResult.stdout).toContain('Scan');
  });
});

describe('full cycle — python-django', () => {
  let cleanup: (() => Promise<void>) | undefined;

  afterEach(async () => {
    if (cleanup) {
      await cleanup();
      cleanup = undefined;
    }
  });

  it('init -> verify profile -> scan (offline) -> verify output', async () => {
    const fixture = await createTempFixture('python-django');
    cleanup = fixture.cleanup;
    const profilePath = join(fixture.tmpDir, '.augmenta-sec', 'profile.yaml');

    // Step 1: init
    const initResult = await runCli(['init', fixture.tmpDir]);
    expect(initResult.exitCode).toBe(0);

    // Step 2: verify profile
    const rawYaml = await readFile(profilePath, 'utf-8');
    const profile = parseYaml(rawYaml);
    expect(profile.version).toBe('1.0');
    expect(profile.languages.primary).toBe('python');

    // Verify Python ecosystem
    expect(profile.pythonEcosystem.detected).toBe(true);
    expect(profile.pythonEcosystem.frameworks).toContain('django');

    // Verify CI platform
    expect(profile.ci.platform).toBe('gitlab-ci');

    // Step 3: scan (offline)
    const scanResult = await runCli(['scan', fixture.tmpDir]);
    expect(scanResult.exitCode).toBe(0);
  });
});

describe('full cycle — go-gin', () => {
  let cleanup: (() => Promise<void>) | undefined;

  afterEach(async () => {
    if (cleanup) {
      await cleanup();
      cleanup = undefined;
    }
  });

  it('init -> verify profile -> scan (offline) -> verify output', async () => {
    const fixture = await createTempFixture('go-gin');
    cleanup = fixture.cleanup;
    const profilePath = join(fixture.tmpDir, '.augmenta-sec', 'profile.yaml');

    // Step 1: init
    const initResult = await runCli(['init', fixture.tmpDir]);
    expect(initResult.exitCode).toBe(0);

    // Step 2: verify profile
    const rawYaml = await readFile(profilePath, 'utf-8');
    const profile = parseYaml(rawYaml);
    expect(profile.version).toBe('1.0');
    expect(profile.languages.primary).toBe('go');

    // Verify Go ecosystem
    expect(profile.goEcosystem.detected).toBe(true);
    expect(profile.goEcosystem.goVersion).toBeDefined();

    // Verify API detection
    expect(profile.api.styles).toContain('rest');
    expect(profile.api.routeCount).toBeGreaterThan(0);

    // Step 3: scan (offline)
    const scanResult = await runCli(['scan', fixture.tmpDir]);
    expect(scanResult.exitCode).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('full cycle — edge cases', () => {
  let cleanup: (() => Promise<void>) | undefined;

  afterEach(async () => {
    if (cleanup) {
      await cleanup();
      cleanup = undefined;
    }
  });

  it('init on empty directory produces a valid (minimal) profile', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'asec-e2e-empty-'));
    cleanup = async () => rm(tmpDir, {recursive: true, force: true});

    const {exitCode} = await runCli(['init', tmpDir]);
    expect(exitCode).toBe(0);

    const profilePath = join(tmpDir, '.augmenta-sec', 'profile.yaml');
    await expect(access(profilePath)).resolves.toBeUndefined();

    const rawYaml = await readFile(profilePath, 'utf-8');
    const profile = parseYaml(rawYaml);
    expect(profile.version).toBe('1.0');
    expect(profile.languages.primary).toBe('unknown');
  });

  it('running init twice overwrites the profile without error', async () => {
    const fixture = await createTempFixture('node-express-react');
    cleanup = fixture.cleanup;

    const result1 = await runCli(['init', fixture.tmpDir]);
    expect(result1.exitCode).toBe(0);

    const result2 = await runCli(['init', fixture.tmpDir]);
    expect(result2.exitCode).toBe(0);

    // Profile should still be valid
    const profilePath = join(fixture.tmpDir, '.augmenta-sec', 'profile.yaml');
    const rawYaml = await readFile(profilePath, 'utf-8');
    const profile = parseYaml(rawYaml);
    expect(profile.version).toBe('1.0');
  });

  it('init also generates endpoints.yaml when routes are found', async () => {
    const fixture = await createTempFixture('node-express-react');
    cleanup = fixture.cleanup;

    await runCli(['init', fixture.tmpDir]);

    const endpointsPath = join(fixture.tmpDir, '.augmenta-sec', 'endpoints.yaml');
    await expect(access(endpointsPath)).resolves.toBeUndefined();

    const rawYaml = await readFile(endpointsPath, 'utf-8');
    expect(rawYaml).toContain('endpoints');
  });
});
