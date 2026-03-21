/**
 * E2E tests for the AugmentaSec CLI — tests --help, --version,
 * and `init` in a temporary directory via child_process.execFile.
 *
 * ASEC-120
 */

import {describe, it, expect, afterEach} from 'vitest';
import {execFile} from 'node:child_process';
import {mkdtemp, rm, cp, readFile, access} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';

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
  const tmpDir = await mkdtemp(join(tmpdir(), `asec-e2e-${fixtureName}-`));
  const srcDir = join(FIXTURES_DIR, fixtureName);
  await cp(srcDir, tmpDir, {recursive: true});
  return {
    tmpDir,
    cleanup: async () => rm(tmpDir, {recursive: true, force: true}),
  };
}

// ---------------------------------------------------------------------------
// --help
// ---------------------------------------------------------------------------

describe('CLI --help', () => {
  it('prints usage information', async () => {
    const {stdout, exitCode} = await runCli(['--help']);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('Usage:');
    expect(stdout).toContain('augmenta-sec');
  });

  it('lists available commands', async () => {
    const {stdout} = await runCli(['--help']);
    expect(stdout).toContain('init');
    expect(stdout).toContain('scan');
    expect(stdout).toContain('review');
  });

  it('shows description', async () => {
    const {stdout} = await runCli(['--help']);
    expect(stdout).toContain('security');
  });
});

// ---------------------------------------------------------------------------
// --version
// ---------------------------------------------------------------------------

describe('CLI --version', () => {
  it('prints the version number', async () => {
    const {stdout, exitCode} = await runCli(['--version']);
    expect(exitCode).toBe(0);
    expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('matches package.json version', async () => {
    const pkgJson = JSON.parse(
      await readFile(join(PROJECT_ROOT, 'package.json'), 'utf-8'),
    );
    const {stdout} = await runCli(['--version']);
    expect(stdout.trim()).toBe(pkgJson.version);
  });
});

// ---------------------------------------------------------------------------
// init in temp dir
// ---------------------------------------------------------------------------

describe('CLI init — temp directory', () => {
  let cleanup: (() => Promise<void>) | undefined;

  afterEach(async () => {
    if (cleanup) {
      await cleanup();
      cleanup = undefined;
    }
  });

  it('creates profile.yaml in a temp copy of node-express-react', async () => {
    const fixture = await createTempFixture('node-express-react');
    cleanup = fixture.cleanup;

    const {exitCode} = await runCli(['init', fixture.tmpDir]);
    expect(exitCode).toBe(0);

    const profilePath = join(fixture.tmpDir, '.augmenta-sec', 'profile.yaml');
    await expect(access(profilePath)).resolves.toBeUndefined();
  });

  it('creates profile.yaml in a temp copy of python-django', async () => {
    const fixture = await createTempFixture('python-django');
    cleanup = fixture.cleanup;

    const {exitCode} = await runCli(['init', fixture.tmpDir]);
    expect(exitCode).toBe(0);

    const profilePath = join(fixture.tmpDir, '.augmenta-sec', 'profile.yaml');
    await expect(access(profilePath)).resolves.toBeUndefined();
  });

  it('creates profile.yaml in a temp copy of go-gin', async () => {
    const fixture = await createTempFixture('go-gin');
    cleanup = fixture.cleanup;

    const {exitCode} = await runCli(['init', fixture.tmpDir]);
    expect(exitCode).toBe(0);

    const profilePath = join(fixture.tmpDir, '.augmenta-sec', 'profile.yaml');
    await expect(access(profilePath)).resolves.toBeUndefined();
  });

  it('output includes discovery summary', async () => {
    const fixture = await createTempFixture('node-express-react');
    cleanup = fixture.cleanup;

    const {stdout, exitCode} = await runCli(['init', fixture.tmpDir]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('Discovery Results');
    expect(stdout).toContain('Languages');
    expect(stdout).toContain('Profile written to');
  });

  it('exits with error for non-existent path', async () => {
    const {exitCode, stderr} = await runCli(['init', '/tmp/asec-nonexistent-dir-xyz']);
    // The CLI calls process.exit(1) for non-existent dirs
    expect(exitCode).not.toBe(0);
  });
});
