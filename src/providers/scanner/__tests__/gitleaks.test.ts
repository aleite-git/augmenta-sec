import {describe, it, expect, vi, beforeEach} from 'vitest';
import {createGitleaksScanner} from '../gitleaks.js';
import type {ScanTarget} from '../types.js';

vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}));

import {execFile} from 'node:child_process';

const mockExecFile = vi.mocked(execFile);

function mockResolve(stdout: string, stderr = '') {
  mockExecFile.mockImplementation(
    ((...args: unknown[]) => {
      const cb = args[args.length - 1] as (...cbArgs: unknown[]) => void;
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
      const cb = args[args.length - 1] as (...cbArgs: unknown[]) => void;
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

const GITLEAKS_OUTPUT = JSON.stringify([
  {
    RuleID: 'aws-access-key',
    Description: 'AWS Access Key',
    File: 'config/prod.env',
    StartLine: 3,
    EndLine: 3,
    StartColumn: 1,
    EndColumn: 30,
    Match: 'AKIAIOSFODNN7EXAMPLE',
    Secret: 'AKIAIOSFODNN7EXAMPLE',
    Entropy: 3.6,
    Fingerprint: 'config/prod.env:aws-access-key:3',
  },
  {
    RuleID: 'generic-api-key',
    Description: 'Generic API Key',
    File: 'src/services/payment.ts',
    StartLine: 15,
    EndLine: 15,
    StartColumn: 20,
    EndColumn: 55,
    Match: 'sk_live_abc123xyz',
    Secret: 'sk_live_abc123xyz',
    Entropy: 4.2,
    Fingerprint: 'src/services/payment.ts:generic-api-key:15',
  },
]);

describe('createGitleaksScanner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('has correct name and category', () => {
    const scanner = createGitleaksScanner();
    expect(scanner.name).toBe('gitleaks');
    expect(scanner.category).toBe('secrets');
  });

  describe('isAvailable', () => {
    it('returns true when gitleaks binary exists', async () => {
      mockResolve('/usr/local/bin/gitleaks');
      const scanner = createGitleaksScanner();
      const available = await scanner.isAvailable();
      expect(available).toBe(true);
    });

    it('returns false when gitleaks binary is missing', async () => {
      mockReject({code: 'ENOENT'});
      const scanner = createGitleaksScanner();
      const available = await scanner.isAvailable();
      expect(available).toBe(false);
    });
  });

  describe('scan', () => {
    it('parses gitleaks JSON output', async () => {
      mockReject({code: 1, status: 1, stdout: GITLEAKS_OUTPUT, stderr: ''});

      const scanner = createGitleaksScanner();
      const result = await scanner.scan(target);

      expect(result.scanner).toBe('gitleaks');
      expect(result.category).toBe('secrets');
      expect(result.findings).toHaveLength(2);
      expect(result.error).toBeUndefined();

      expect(result.findings[0].ruleId).toBe('aws-access-key');
      expect(result.findings[0].message).toBe('AWS Access Key');
      expect(result.findings[0].file).toBe('config/prod.env');
      expect(result.findings[0].line).toBe(3);
      expect(result.findings[0].column).toBe(1);

      expect(result.findings[1].ruleId).toBe('generic-api-key');
      expect(result.findings[1].message).toBe('Generic API Key');
      expect(result.findings[1].file).toBe('src/services/payment.ts');
      expect(result.findings[1].line).toBe(15);
    });

    it('treats exit code 1 as success (leaks found)', async () => {
      mockReject({code: 1, status: 1, stdout: GITLEAKS_OUTPUT, stderr: ''});
      const scanner = createGitleaksScanner();
      const result = await scanner.scan(target);
      expect(result.error).toBeUndefined();
      expect(result.findings).toHaveLength(2);
    });

    it('all findings are high severity', async () => {
      mockReject({code: 1, status: 1, stdout: GITLEAKS_OUTPUT, stderr: ''});
      const scanner = createGitleaksScanner();
      const result = await scanner.scan(target);
      for (const finding of result.findings) {
        expect(finding.severity).toBe('high');
      }
    });

    it('handles no leaks found (exit 0, empty output)', async () => {
      mockResolve('');
      const scanner = createGitleaksScanner();
      const result = await scanner.scan(target);
      expect(result.findings).toHaveLength(0);
      expect(result.error).toBeUndefined();
    });

    it('handles no leaks found (exit 0, empty array)', async () => {
      mockResolve('[]');
      const scanner = createGitleaksScanner();
      const result = await scanner.scan(target);
      expect(result.findings).toHaveLength(0);
      expect(result.error).toBeUndefined();
    });

    it('includes metadata with fingerprint and entropy', async () => {
      mockReject({code: 1, status: 1, stdout: GITLEAKS_OUTPUT, stderr: ''});
      const scanner = createGitleaksScanner();
      const result = await scanner.scan(target);
      expect(result.findings[0].metadata).toBeDefined();
      expect(result.findings[0].metadata!.fingerprint).toBe(
        'config/prod.env:aws-access-key:3',
      );
      expect(result.findings[0].metadata!.entropy).toBe(3.6);
    });

    it('handles timeout error', async () => {
      mockReject({code: 'ETIMEDOUT', killed: true});
      const scanner = createGitleaksScanner();
      const result = await scanner.scan(target);
      expect(result.findings).toHaveLength(0);
      expect(result.error).toContain('timed out');
    });

    it('handles binary not found error', async () => {
      mockReject({code: 'ENOENT'});
      const scanner = createGitleaksScanner();
      const result = await scanner.scan(target);
      expect(result.findings).toHaveLength(0);
      expect(result.error).toContain('not found');
    });

    it('reports duration', async () => {
      mockResolve('');
      const scanner = createGitleaksScanner();
      const result = await scanner.scan(target);
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });
  });
});
