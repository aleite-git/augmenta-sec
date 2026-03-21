import {describe, it, expect, vi, beforeEach} from 'vitest';
import {createSemgrepScanner} from '../semgrep.js';
import type {ScanTarget} from '../types.js';

vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}));

import {execFile} from 'node:child_process';

const mockExecFile = vi.mocked(execFile);

function mockResolve(stdout: string, stderr = '') {
  mockExecFile.mockImplementation(
    ((...args: unknown[]) => {
      const cb = args[args.length - 1] as Function;
      if (typeof cb === 'function') cb(null, stdout, stderr);
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

describe('createSemgrepScanner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('has correct name and category', () => {
    const scanner = createSemgrepScanner();
    expect(scanner.name).toBe('semgrep');
    expect(scanner.category).toBe('sast');
  });

  describe('isAvailable', () => {
    it('returns true when semgrep binary exists', async () => {
      mockResolve('/usr/local/bin/semgrep');
      const scanner = createSemgrepScanner();
      const available = await scanner.isAvailable();
      expect(available).toBe(true);
    });

    it('returns false when semgrep binary is missing', async () => {
      mockReject({code: 'ENOENT'});
      const scanner = createSemgrepScanner();
      const available = await scanner.isAvailable();
      expect(available).toBe(false);
    });
  });

  describe('scan', () => {
    it('parses Semgrep JSON output correctly', async () => {
      const semgrepOutput = JSON.stringify({
        results: [
          {
            check_id: 'javascript.lang.security.audit.xss.no-direct-innerhtml',
            path: 'src/app.ts',
            start: {line: 42, col: 5},
            end: {line: 42, col: 30},
            extra: {
              message: 'Detected direct use of innerHTML',
              severity: 'ERROR',
              metadata: {cwe: 'CWE-79'},
            },
          },
          {
            check_id: 'typescript.best-practice.no-console-log',
            path: 'src/utils.ts',
            start: {line: 10, col: 1},
            end: {line: 10, col: 20},
            extra: {
              message: 'Avoid console.log in production',
              severity: 'WARNING',
              metadata: {},
            },
          },
        ],
      });

      mockResolve(semgrepOutput);

      const scanner = createSemgrepScanner();
      const result = await scanner.scan(target);

      expect(result.scanner).toBe('semgrep');
      expect(result.category).toBe('sast');
      expect(result.findings).toHaveLength(2);
      expect(result.error).toBeUndefined();

      expect(result.findings[0].ruleId).toBe(
        'javascript.lang.security.audit.xss.no-direct-innerhtml',
      );
      expect(result.findings[0].message).toBe(
        'Detected direct use of innerHTML',
      );
      expect(result.findings[0].file).toBe('src/app.ts');
      expect(result.findings[0].line).toBe(42);
      expect(result.findings[0].column).toBe(5);

      expect(result.findings[1].ruleId).toBe(
        'typescript.best-practice.no-console-log',
      );
      expect(result.findings[1].file).toBe('src/utils.ts');
    });

    it('maps severity correctly: ERROR to high, WARNING to medium, INFO to low', async () => {
      const semgrepOutput = JSON.stringify({
        results: [
          {
            check_id: 'rule-error',
            path: 'a.ts',
            start: {line: 1, col: 1},
            end: {line: 1, col: 10},
            extra: {message: 'Error finding', severity: 'ERROR'},
          },
          {
            check_id: 'rule-warning',
            path: 'b.ts',
            start: {line: 1, col: 1},
            end: {line: 1, col: 10},
            extra: {message: 'Warning finding', severity: 'WARNING'},
          },
          {
            check_id: 'rule-info',
            path: 'c.ts',
            start: {line: 1, col: 1},
            end: {line: 1, col: 10},
            extra: {message: 'Info finding', severity: 'INFO'},
          },
          {
            check_id: 'rule-unknown',
            path: 'd.ts',
            start: {line: 1, col: 1},
            end: {line: 1, col: 10},
            extra: {message: 'Unknown severity', severity: 'SOMETHING'},
          },
        ],
      });

      mockResolve(semgrepOutput);

      const scanner = createSemgrepScanner();
      const result = await scanner.scan(target);

      expect(result.findings[0].severity).toBe('high');
      expect(result.findings[1].severity).toBe('medium');
      expect(result.findings[2].severity).toBe('low');
      expect(result.findings[3].severity).toBe('informational');
    });

    it('handles empty results', async () => {
      mockResolve(JSON.stringify({results: []}));

      const scanner = createSemgrepScanner();
      const result = await scanner.scan(target);

      expect(result.findings).toHaveLength(0);
      expect(result.error).toBeUndefined();
    });

    it('handles empty JSON object gracefully', async () => {
      mockResolve('{}');

      const scanner = createSemgrepScanner();
      const result = await scanner.scan(target);

      expect(result.findings).toHaveLength(0);
      expect(result.error).toBeUndefined();
    });

    it('handles timeout error', async () => {
      mockReject({code: 'ETIMEDOUT', killed: true});

      const scanner = createSemgrepScanner();
      const result = await scanner.scan(target);

      expect(result.findings).toHaveLength(0);
      expect(result.error).toContain('timed out');
    });

    it('handles binary not found error', async () => {
      mockReject({code: 'ENOENT'});

      const scanner = createSemgrepScanner();
      const result = await scanner.scan(target);

      expect(result.findings).toHaveLength(0);
      expect(result.error).toContain('not found');
    });

    it('preserves metadata from semgrep output', async () => {
      const semgrepOutput = JSON.stringify({
        results: [
          {
            check_id: 'test-rule',
            path: 'test.ts',
            start: {line: 1, col: 1},
            end: {line: 1, col: 10},
            extra: {
              message: 'Test',
              severity: 'ERROR',
              metadata: {cwe: 'CWE-79', owasp: 'A7'},
            },
          },
        ],
      });

      mockResolve(semgrepOutput);

      const scanner = createSemgrepScanner();
      const result = await scanner.scan(target);

      expect(result.findings[0].metadata).toEqual({cwe: 'CWE-79', owasp: 'A7'});
    });

    it('reports duration', async () => {
      mockResolve(JSON.stringify({results: []}));

      const scanner = createSemgrepScanner();
      const result = await scanner.scan(target);

      expect(result.duration).toBeGreaterThanOrEqual(0);
    });
  });
});
