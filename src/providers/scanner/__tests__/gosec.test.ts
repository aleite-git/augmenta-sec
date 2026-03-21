import {describe, it, expect, vi, beforeEach} from 'vitest';
import {createGosecScanner} from '../gosec.js';
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

const GOSEC_OUTPUT = JSON.stringify({
  Issues: [
    {
      rule_id: 'G401',
      details: 'Use of weak cryptographic primitive',
      severity: 'MEDIUM',
      confidence: 'HIGH',
      file: '/project/crypto.go',
      line: '15',
      column: '2',
      cwe: {id: '326', url: 'https://cwe.mitre.org/data/definitions/326.html'},
    },
    {
      rule_id: 'G104',
      details: 'Errors unhandled.',
      severity: 'LOW',
      confidence: 'HIGH',
      file: '/project/main.go',
      line: '42',
      column: '10',
    },
    {
      rule_id: 'G204',
      details: 'Subprocess launched with variable',
      severity: 'HIGH',
      confidence: 'MEDIUM',
      file: '/project/exec.go',
      line: '8',
      column: '3',
      cwe: {id: '78', url: 'https://cwe.mitre.org/data/definitions/78.html'},
    },
  ],
  Stats: {found: 3, files: 10},
});

describe('createGosecScanner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('has correct name and category', () => {
    const scanner = createGosecScanner();
    expect(scanner.name).toBe('gosec');
    expect(scanner.category).toBe('sast');
  });

  describe('isAvailable', () => {
    it('returns true when gosec binary exists', async () => {
      mockResolve('/usr/local/bin/gosec');
      const scanner = createGosecScanner();
      const available = await scanner.isAvailable();
      expect(available).toBe(true);
    });

    it('returns false when gosec binary is missing', async () => {
      mockReject({code: 'ENOENT'});
      const scanner = createGosecScanner();
      const available = await scanner.isAvailable();
      expect(available).toBe(false);
    });
  });

  describe('scan', () => {
    it('parses Gosec JSON output correctly', async () => {
      mockResolve(GOSEC_OUTPUT);

      const scanner = createGosecScanner();
      const result = await scanner.scan(target);

      expect(result.scanner).toBe('gosec');
      expect(result.category).toBe('sast');
      expect(result.findings).toHaveLength(3);
      expect(result.error).toBeUndefined();

      expect(result.findings[0].ruleId).toBe('G401');
      expect(result.findings[0].message).toBe('Use of weak cryptographic primitive');
      expect(result.findings[0].severity).toBe('medium');
      expect(result.findings[0].file).toBe('/project/crypto.go');
      expect(result.findings[0].line).toBe(15);
      expect(result.findings[0].column).toBe(2);

      expect(result.findings[1].ruleId).toBe('G104');
      expect(result.findings[1].severity).toBe('low');

      expect(result.findings[2].ruleId).toBe('G204');
      expect(result.findings[2].severity).toBe('high');
    });

    it('maps severity correctly: HIGH to high, MEDIUM to medium, LOW to low', async () => {
      mockResolve(GOSEC_OUTPUT);

      const scanner = createGosecScanner();
      const result = await scanner.scan(target);

      expect(result.findings[0].severity).toBe('medium');
      expect(result.findings[1].severity).toBe('low');
      expect(result.findings[2].severity).toBe('high');
    });

    it('maps unknown severity to informational', async () => {
      const output = JSON.stringify({
        Issues: [{
          rule_id: 'G999',
          details: 'Unknown severity',
          severity: 'UNKNOWN',
          confidence: 'LOW',
          file: 'test.go',
          line: '1',
          column: '1',
        }],
      });
      mockResolve(output);

      const scanner = createGosecScanner();
      const result = await scanner.scan(target);

      expect(result.findings[0].severity).toBe('informational');
    });

    it('parses line and column as numbers', async () => {
      mockResolve(GOSEC_OUTPUT);

      const scanner = createGosecScanner();
      const result = await scanner.scan(target);

      expect(typeof result.findings[0].line).toBe('number');
      expect(typeof result.findings[0].column).toBe('number');
    });

    it('handles non-numeric line/column gracefully', async () => {
      const output = JSON.stringify({
        Issues: [{
          rule_id: 'G100',
          details: 'Bad line',
          severity: 'LOW',
          confidence: 'LOW',
          file: 'test.go',
          line: 'abc',
          column: '',
        }],
      });
      mockResolve(output);

      const scanner = createGosecScanner();
      const result = await scanner.scan(target);

      expect(result.findings[0].line).toBeUndefined();
      expect(result.findings[0].column).toBeUndefined();
    });

    it('includes metadata with confidence and CWE', async () => {
      mockResolve(GOSEC_OUTPUT);

      const scanner = createGosecScanner();
      const result = await scanner.scan(target);

      expect(result.findings[0].metadata).toBeDefined();
      expect(result.findings[0].metadata!.confidence).toBe('HIGH');
      expect(result.findings[0].metadata!.cwe).toEqual({
        id: '326',
        url: 'https://cwe.mitre.org/data/definitions/326.html',
      });
    });

    it('handles empty Issues', async () => {
      mockResolve(JSON.stringify({Issues: []}));

      const scanner = createGosecScanner();
      const result = await scanner.scan(target);

      expect(result.findings).toHaveLength(0);
      expect(result.error).toBeUndefined();
    });

    it('handles empty JSON object', async () => {
      mockResolve('{}');

      const scanner = createGosecScanner();
      const result = await scanner.scan(target);

      expect(result.findings).toHaveLength(0);
      expect(result.error).toBeUndefined();
    });

    it('handles timeout error', async () => {
      mockReject({code: 'ETIMEDOUT', killed: true});

      const scanner = createGosecScanner();
      const result = await scanner.scan(target);

      expect(result.findings).toHaveLength(0);
      expect(result.error).toContain('timed out');
    });

    it('handles binary not found error', async () => {
      mockReject({code: 'ENOENT'});

      const scanner = createGosecScanner();
      const result = await scanner.scan(target);

      expect(result.findings).toHaveLength(0);
      expect(result.error).toContain('not found');
    });

    it('reports duration', async () => {
      mockResolve(JSON.stringify({Issues: []}));

      const scanner = createGosecScanner();
      const result = await scanner.scan(target);

      expect(result.duration).toBeGreaterThanOrEqual(0);
    });
  });
});
