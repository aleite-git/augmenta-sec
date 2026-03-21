/**
 * Shared utilities for scanner adapters.
 *
 * Uses `node:child_process` execFile (not exec) to avoid shell injection.
 */

import {execFile} from 'node:child_process';

const DEFAULT_TIMEOUT_MS = 60_000;

/** Check if a binary exists on PATH. */
export async function isBinaryAvailable(binary: string): Promise<boolean> {
  const whichCmd = process.platform === 'win32' ? 'where' : 'which';
  return new Promise(resolve => {
    execFile(whichCmd, [binary], error => {
      resolve(!error);
    });
  });
}

export interface RunCommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/** Run a command with timeout and return stdout, stderr, and exit code. */
export async function runCommand(
  command: string,
  args: string[],
  options?: {cwd?: string; timeout?: number},
): Promise<RunCommandResult> {
  const timeout = options?.timeout ?? DEFAULT_TIMEOUT_MS;

  return new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      {
        cwd: options?.cwd,
        timeout,
        maxBuffer: 50 * 1024 * 1024, // 50 MB for large scan outputs
      },
      (error, stdout, stderr) => {
        if (!error) {
          resolve({
            stdout: stdout ?? '',
            stderr: stderr ?? '',
            exitCode: 0,
          });
          return;
        }

        const err = error as NodeJS.ErrnoException & {
          killed?: boolean;
          code?: string | number;
        };

        // Timeout — child was killed
        if (err.killed || err.code === 'ETIMEDOUT') {
          reject(new Error(`Command timed out after ${timeout}ms: ${command}`));
          return;
        }

        // Binary not found
        if (err.code === 'ENOENT') {
          reject(new Error(`Binary not found: ${command}`));
          return;
        }

        // Non-zero exit code but process completed — return the output.
        const exitCode =
          typeof err.code === 'number'
            ? err.code
            : (err as unknown as {status?: number}).status ?? 1;
        resolve({
          stdout: stdout ?? '',
          stderr: stderr ?? '',
          exitCode,
        });
      },
    );
  });
}
