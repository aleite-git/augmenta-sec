import {describe, it, expect, vi, beforeEach} from 'vitest';
import {createCodeqlScanner} from '../codeql.js';
import type {ScanTarget} from '../types.js';

vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}));

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    mkdtempSync: vi.fn(() => '/tmp/codeql-abc123'),
    rmSync: vi.fn(),
  };
});

vi.mock('node:os', () => ({
  tmpdir: vi.fn(() => '/tmp'),
}));

import {execFile} from 'node:child_process';
import {rmSync} from 'node:fs';

const mockExecFile = vi.mocked(execFile);
const mockRmSync = vi.mocked(rmSync);

/**
 * Track call count to distinguish between the database create
 * and database analyze invocations.
 */
let callCount: number;

function mockResolveSequence(stdouts: string[]) {
  callCount = 0;
  mockExecFile.mockImplementation(
    ((...args: unknown[]) => {
      const cb = args[args.length - 1] as Function;
      if (typeof cb === 'function') {
        const idx = callCount++;
        cb(null, stdouts[idx] ?? '', '');
      }
    }) as typeof execFile,
  );
}

function mockReject(error: {
  code?: string | number;
  killed?: boolean;
  stdout?: string;
  stderr?: string;
  status?: number;
}) {
  mockExecFile.mockImplementation(
    ((...args: unknown[]) => {
      const cb = args[args.length - 1] as Function;
      if (typeof cb === 'function') {
        const err = Object.assign(new Error('command failed'), {
          code: error.code,
          killed: error.killed,
          stdout: error.stdout ?? '',
          stderr: error.stderr ?? '',
          status: error.status,
        });
        cb(err, error.stdout ?? '', error.stderr ?? '');
      }
    }) as typeof execFile,
  );
}

const target: ScanTarget = {rootDir: '/project'};

const SARIF_OUTPUT = JSON.stringify({
  runs: [
    {
      results: [
        {
          ruleId: 'js/xss',
          message: {text: 'Cross-site scripting vulnerability'},
          level: 'error',
          locations: [
            {
              physicalLocation: {
                artifactLocation: {uri: 'src/app.js'},
                region: {startLine: 42, startColumn: 5},
              },
            },
          ],
        },
        {
          ruleId: 'js/sql-injection',
          message: {text: 'SQL injection via user input'},
          level: 'warning',
          locations: [
            {
              physicalLocation: {
                artifactLocation: {uri: 'src/db.js'},
                region: {startLine: 15, startColumn: 10},
              },
            },
          ],
        },
        {
          ruleId: 'js/log-injection',
          message: {text: 'Log injection from untrusted data'},
          level: 'note',
          locations: [
            {
              physicalLocation: {
                artifactLocation: {uri: 'src/logger.js'},
                region: {startLine: 7},
              },
            },
          ],
        },
      ],
    },
  ],
});

describe('createCodeqlScanner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    callCount = 0;
  });

  it('has correct name and category', () => {
    const scanner = createCodeqlScanner();
    expect(scanner.name).toBe('codeql');
    expect(scanner.category).toBe('sast');
  });

  describe('isAvailable', () => {
    it('returns true when codeql binary exists', async () => {
      mockResolveSequence(['/usr/local/bin/codeql']);
      const scanner = createCodeqlScanner();
      const available = await scanner.isAvailable();
      expect(available).toBe(true);
    });

    it('returns false when codeql binary is missing', async () => {
      mockReject({code: 'ENOENT'});
      const scanner = createCodeqlScanner();
      const available = await scanner.isAvailable();
      expect(available).toBe(false);
    });
  });

  describe('scan', () => {
    it('parses SARIF output correctly', async () => {
      mockResolveSequence(['', SARIF_OUTPUT]);

      const scanner = createCodeqlScanner();
      const result = await scanner.scan(target);

      expect(result.scanner).toBe('codeql');
      expect(result.category).toBe('sast');
      expect(result.findings).toHaveLength(3);
      expect(result.error).toBeUndefined();

      expect(result.findings[0].ruleId).toBe('js/xss');
      expect(result.findings[0].message).toBe('Cross-site scripting vulnerability');
      expect(result.findings[0].severity).toBe('high');
      expect(result.findings[0].file).toBe('src/app.js');
      expect(result.findings[0].line).toBe(42);
      expect(result.findings[0].column).toBe(5);

      expect(result.findings[1].ruleId).toBe('js/sql-injection');
      expect(result.findings[1].severity).toBe('medium');

      expect(result.findings[2].ruleId).toBe('js/log-injection');
      expect(result.findings[2].severity).toBe('low');
    });

    it('maps severity correctly: error to high, warning to medium, note to low', async () => {
      mockResolveSequence(['', SARIF_OUTPUT]);

      const scanner = createCodeqlScanner();
      const result = await scanner.scan(target);

      expect(result.findings[0].severity).toBe('high');
      expect(result.findings[1].severity).toBe('medium');
      expect(result.findings[2].severity).toBe('low');
    });

    it('handles unknown severity level as informational', async () => {
      const sarif = JSON.stringify({
        runs: [{
          results: [{
            ruleId: 'test',
            message: {text: 'test'},
            level: 'something-else',
            locations: [],
          }],
        }],
      });
      mockResolveSequence(['', sarif]);

      const scanner = createCodeqlScanner();
      const result = await scanner.scan(target);

      expect(result.findings[0].severity).toBe('informational');
    });

    it('handles empty runs', async () => {
      mockResolveSequence(['', JSON.stringify({runs: []})]);

      const scanner = createCodeqlScanner();
      const result = await scanner.scan(target);

      expect(result.findings).toHaveLength(0);
      expect(result.error).toBeUndefined();
    });

    it('handles empty JSON object', async () => {
      mockResolveSequence(['', '{}']);

      const scanner = createCodeqlScanner();
      const result = await scanner.scan(target);

      expect(result.findings).toHaveLength(0);
      expect(result.error).toBeUndefined();
    });

    it('handles results without locations', async () => {
      const sarif = JSON.stringify({
        runs: [{
          results: [{
            ruleId: 'js/test',
            message: {text: 'No location'},
            level: 'warning',
          }],
        }],
      });
      mockResolveSequence(['', sarif]);

      const scanner = createCodeqlScanner();
      const result = await scanner.scan(target);

      expect(result.findings).toHaveLength(1);
      expect(result.findings[0].file).toBeUndefined();
      expect(result.findings[0].line).toBeUndefined();
    });

    it('handles results without ruleId or message', async () => {
      const sarif = JSON.stringify({
        runs: [{results: [{}]}],
      });
      mockResolveSequence(['', sarif]);

      const scanner = createCodeqlScanner();
      const result = await scanner.scan(target);

      expect(result.findings).toHaveLength(1);
      expect(result.findings[0].ruleId).toBe('unknown');
      expect(result.findings[0].message).toBe('');
      expect(result.findings[0].severity).toBe('medium');
    });

    it('cleans up temp directory after successful scan', async () => {
      mockResolveSequence(['', '{}']);

      const scanner = createCodeqlScanner();
      await scanner.scan(target);

      expect(mockRmSync).toHaveBeenCalledWith('/tmp/codeql-abc123', {
        recursive: true,
        force: true,
      });
    });

    it('cleans up temp directory after failed scan', async () => {
      mockReject({code: 'ETIMEDOUT', killed: true});

      const scanner = createCodeqlScanner();
      await scanner.scan(target);

      expect(mockRmSync).toHaveBeenCalledWith('/tmp/codeql-abc123', {
        recursive: true,
        force: true,
      });
    });

    it('handles timeout error', async () => {
      mockReject({code: 'ETIMEDOUT', killed: true});

      const scanner = createCodeqlScanner();
      const result = await scanner.scan(target);

      expect(result.findings).toHaveLength(0);
      expect(result.error).toContain('timed out');
    });

    it('handles binary not found error', async () => {
      mockReject({code: 'ENOENT'});

      const scanner = createCodeqlScanner();
      const result = await scanner.scan(target);

      expect(result.findings).toHaveLength(0);
      expect(result.error).toContain('not found');
    });

    it('reports duration', async () => {
      mockResolveSequence(['', '{}']);

      const scanner = createCodeqlScanner();
      const result = await scanner.scan(target);

      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it('accepts a custom language parameter', () => {
      const scanner = createCodeqlScanner('python');
      expect(scanner.name).toBe('codeql');
    });
  });
});
