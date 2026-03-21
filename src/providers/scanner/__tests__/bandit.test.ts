import {describe, it, expect, vi, beforeEach} from 'vitest';
import {createBanditScanner} from '../bandit.js';
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

const BANDIT_OUTPUT = JSON.stringify({
  results: [
    {
      test_id: 'B101',
      test_name: 'assert_used',
      issue_text: 'Use of assert detected.',
      issue_severity: 'LOW',
      issue_confidence: 'HIGH',
      filename: '/project/app.py',
      line_number: 10,
      col_offset: 0,
      more_info: 'https://bandit.readthedocs.io/en/latest/plugins/b101.html',
    },
    {
      test_id: 'B608',
      test_name: 'hardcoded_sql_expressions',
      issue_text: 'Possible SQL injection vector through string-based query construction.',
      issue_severity: 'MEDIUM',
      issue_confidence: 'MEDIUM',
      filename: '/project/db.py',
      line_number: 25,
      col_offset: 4,
      more_info: 'https://bandit.readthedocs.io/en/latest/plugins/b608.html',
    },
    {
      test_id: 'B602',
      test_name: 'subprocess_popen_with_shell_equals_true',
      issue_text: 'subprocess call with shell=True identified.',
      issue_severity: 'HIGH',
      issue_confidence: 'HIGH',
      filename: '/project/utils.py',
      line_number: 42,
      col_offset: 8,
    },
  ],
});

describe('createBanditScanner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('has correct name and category', () => {
    const scanner = createBanditScanner();
    expect(scanner.name).toBe('bandit');
    expect(scanner.category).toBe('sast');
  });

  describe('isAvailable', () => {
    it('returns true when bandit binary exists', async () => {
      mockResolve('/usr/local/bin/bandit');
      const scanner = createBanditScanner();
      const available = await scanner.isAvailable();
      expect(available).toBe(true);
    });

    it('returns false when bandit binary is missing', async () => {
      mockReject({code: 'ENOENT'});
      const scanner = createBanditScanner();
      const available = await scanner.isAvailable();
      expect(available).toBe(false);
    });
  });

  describe('scan', () => {
    it('parses Bandit JSON output correctly', async () => {
      mockResolve(BANDIT_OUTPUT);

      const scanner = createBanditScanner();
      const result = await scanner.scan(target);

      expect(result.scanner).toBe('bandit');
      expect(result.category).toBe('sast');
      expect(result.findings).toHaveLength(3);
      expect(result.error).toBeUndefined();

      expect(result.findings[0].ruleId).toBe('B101');
      expect(result.findings[0].message).toBe('Use of assert detected.');
      expect(result.findings[0].severity).toBe('low');
      expect(result.findings[0].file).toBe('/project/app.py');
      expect(result.findings[0].line).toBe(10);
      expect(result.findings[0].column).toBe(0);

      expect(result.findings[1].ruleId).toBe('B608');
      expect(result.findings[1].severity).toBe('medium');

      expect(result.findings[2].ruleId).toBe('B602');
      expect(result.findings[2].severity).toBe('high');
    });

    it('maps severity correctly: HIGH to high, MEDIUM to medium, LOW to low', async () => {
      mockResolve(BANDIT_OUTPUT);

      const scanner = createBanditScanner();
      const result = await scanner.scan(target);

      expect(result.findings[0].severity).toBe('low');
      expect(result.findings[1].severity).toBe('medium');
      expect(result.findings[2].severity).toBe('high');
    });

    it('maps unknown severity to informational', async () => {
      const output = JSON.stringify({
        results: [
          {
            test_id: 'B999',
            issue_text: 'Unknown severity test',
            issue_severity: 'UNKNOWN',
            issue_confidence: 'LOW',
            filename: 'test.py',
            line_number: 1,
          },
        ],
      });
      mockResolve(output);

      const scanner = createBanditScanner();
      const result = await scanner.scan(target);

      expect(result.findings[0].severity).toBe('informational');
    });

    it('includes metadata with test name and confidence', async () => {
      mockResolve(BANDIT_OUTPUT);

      const scanner = createBanditScanner();
      const result = await scanner.scan(target);

      expect(result.findings[0].metadata).toBeDefined();
      expect(result.findings[0].metadata!.testName).toBe('assert_used');
      expect(result.findings[0].metadata!.confidence).toBe('HIGH');
      expect(result.findings[0].metadata!.moreInfo).toBe(
        'https://bandit.readthedocs.io/en/latest/plugins/b101.html',
      );
    });

    it('handles empty results', async () => {
      mockResolve(JSON.stringify({results: []}));

      const scanner = createBanditScanner();
      const result = await scanner.scan(target);

      expect(result.findings).toHaveLength(0);
      expect(result.error).toBeUndefined();
    });

    it('handles empty JSON object', async () => {
      mockResolve('{}');

      const scanner = createBanditScanner();
      const result = await scanner.scan(target);

      expect(result.findings).toHaveLength(0);
      expect(result.error).toBeUndefined();
    });

    it('handles timeout error', async () => {
      mockReject({code: 'ETIMEDOUT', killed: true});

      const scanner = createBanditScanner();
      const result = await scanner.scan(target);

      expect(result.findings).toHaveLength(0);
      expect(result.error).toContain('timed out');
    });

    it('handles binary not found error', async () => {
      mockReject({code: 'ENOENT'});

      const scanner = createBanditScanner();
      const result = await scanner.scan(target);

      expect(result.findings).toHaveLength(0);
      expect(result.error).toContain('not found');
    });

    it('reports duration', async () => {
      mockResolve(JSON.stringify({results: []}));

      const scanner = createBanditScanner();
      const result = await scanner.scan(target);

      expect(result.duration).toBeGreaterThanOrEqual(0);
    });
  });
});
