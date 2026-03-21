import {describe, it, expect, vi, beforeEach} from 'vitest';
import {isBinaryAvailable, runCommand} from '../utils.js';

vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}));

import {execFile} from 'node:child_process';

const mockExecFile = vi.mocked(execFile);

/**
 * promisify(execFile) calls either:
 * - execFile(cmd, args, callback)       — 3 args (no options)
 * - execFile(cmd, args, opts, callback) — 4 args (with options)
 *
 * We detect which pattern by checking whether the last arg is a function.
 */
function mockExecFileImpl(
  resolve: boolean,
  data: {stdout?: string; stderr?: string; code?: string | number; killed?: boolean; status?: number},
) {
  mockExecFile.mockImplementation(
    ((...callArgs: unknown[]) => {
      const cb = callArgs[callArgs.length - 1] as (...cbArgs: unknown[]) => void;
      if (typeof cb === 'function') {
        if (resolve) {
          cb(null, data.stdout ?? '', data.stderr ?? '');
        } else {
          const err = Object.assign(new Error('command failed'), {
            code: data.code,
            killed: data.killed,
            stdout: data.stdout ?? '',
            stderr: data.stderr ?? '',
            status: data.status,
          });
          cb(err, data.stdout ?? '', data.stderr ?? '');
        }
      }
    }) as typeof execFile,
  );
}

describe('isBinaryAvailable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns true when binary is found', async () => {
    mockExecFileImpl(true, {stdout: '/usr/local/bin/semgrep'});
    const result = await isBinaryAvailable('semgrep');
    expect(result).toBe(true);
  });

  it('returns false when binary is not found', async () => {
    mockExecFileImpl(false, {code: 'ENOENT'});
    const result = await isBinaryAvailable('nonexistent');
    expect(result).toBe(false);
  });

  it('returns false on any error', async () => {
    mockExecFileImpl(false, {code: 1, status: 1});
    const result = await isBinaryAvailable('bad-binary');
    expect(result).toBe(false);
  });
});

describe('runCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns stdout and exit code 0 on success', async () => {
    mockExecFileImpl(true, {stdout: 'hello world', stderr: ''});
    const result = await runCommand('echo', ['hello', 'world']);

    expect(result.stdout).toBe('hello world');
    expect(result.stderr).toBe('');
    expect(result.exitCode).toBe(0);
  });

  it('returns output with non-zero exit code on process failure', async () => {
    mockExecFileImpl(false, {
      code: 1,
      status: 1,
      stdout: 'some output',
      stderr: 'some error',
    });

    const result = await runCommand('failing-cmd', []);

    expect(result.stdout).toBe('some output');
    expect(result.stderr).toBe('some error');
    expect(result.exitCode).toBe(1);
  });

  it('throws on timeout', async () => {
    mockExecFileImpl(false, {code: 'ETIMEDOUT', killed: true});

    await expect(
      runCommand('slow-cmd', [], {timeout: 1000}),
    ).rejects.toThrow(/timed out/);
  });

  it('throws on binary not found (ENOENT)', async () => {
    mockExecFileImpl(false, {code: 'ENOENT'});

    await expect(
      runCommand('nonexistent', []),
    ).rejects.toThrow(/not found/);
  });

  it('passes cwd and timeout to execFile', async () => {
    mockExecFileImpl(true, {stdout: 'output'});
    await runCommand('cmd', ['arg1'], {cwd: '/tmp', timeout: 30_000});

    expect(mockExecFile).toHaveBeenCalledWith(
      'cmd',
      ['arg1'],
      expect.objectContaining({cwd: '/tmp', timeout: 30_000}),
      expect.any(Function),
    );
  });
});
