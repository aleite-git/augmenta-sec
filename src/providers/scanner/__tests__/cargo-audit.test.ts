import {describe, it, expect, vi, beforeEach} from 'vitest';
import {createCargoAuditScanner} from '../cargo-audit.js';
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

const CARGO_AUDIT_OUTPUT = JSON.stringify({
  vulnerabilities: {
    found: true,
    count: 3,
    list: [
      {
        advisory: {
          id: 'RUSTSEC-2021-0078',
          title: 'Overflow in `hyper` when decoding chunk size',
          description: 'hyper before 0.14.10 has an integer overflow bug.',
          cvss: 9.8,
          url: 'https://rustsec.org/advisories/RUSTSEC-2021-0078',
          date: '2021-07-07',
        },
        package: {name: 'hyper', version: '0.14.4'},
        versions: {patched: ['>=0.14.10'], unaffected: []},
      },
      {
        advisory: {
          id: 'RUSTSEC-2023-0001',
          title: 'Memory safety issue in tokio',
          description: 'tokio has a use-after-free bug.',
          cvss: 7.5,
          url: 'https://rustsec.org/advisories/RUSTSEC-2023-0001',
        },
        package: {name: 'tokio', version: '1.20.0'},
        versions: {patched: ['>=1.24.2']},
      },
      {
        advisory: {
          id: 'RUSTSEC-2024-0002',
          title: 'Minor information disclosure in serde',
          description: 'Serde can leak memory layout information.',
          cvss: 3.1,
        },
        package: {name: 'serde', version: '1.0.100'},
      },
    ],
  },
});

describe('createCargoAuditScanner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('has correct name and category', () => {
    const scanner = createCargoAuditScanner();
    expect(scanner.name).toBe('cargo-audit');
    expect(scanner.category).toBe('sca');
  });

  describe('isAvailable', () => {
    it('returns true when cargo-audit binary exists', async () => {
      mockResolve('/usr/local/bin/cargo-audit');
      const scanner = createCargoAuditScanner();
      const available = await scanner.isAvailable();
      expect(available).toBe(true);
    });

    it('returns false when cargo-audit binary is missing', async () => {
      mockReject({code: 'ENOENT'});
      const scanner = createCargoAuditScanner();
      const available = await scanner.isAvailable();
      expect(available).toBe(false);
    });
  });

  describe('scan', () => {
    it('parses cargo audit JSON output correctly', async () => {
      mockResolve(CARGO_AUDIT_OUTPUT);

      const scanner = createCargoAuditScanner();
      const result = await scanner.scan(target);

      expect(result.scanner).toBe('cargo-audit');
      expect(result.category).toBe('sca');
      expect(result.findings).toHaveLength(3);
      expect(result.error).toBeUndefined();

      expect(result.findings[0].ruleId).toBe('RUSTSEC-2021-0078');
      expect(result.findings[0].message).toBe(
        'Overflow in `hyper` when decoding chunk size',
      );
      expect(result.findings[0].file).toBe('Cargo.lock');
    });

    it('derives severity from CVSS score: >=9 critical', async () => {
      mockResolve(CARGO_AUDIT_OUTPUT);

      const scanner = createCargoAuditScanner();
      const result = await scanner.scan(target);

      expect(result.findings[0].severity).toBe('critical');
    });

    it('derives severity from CVSS score: >=7 high', async () => {
      mockResolve(CARGO_AUDIT_OUTPUT);

      const scanner = createCargoAuditScanner();
      const result = await scanner.scan(target);

      expect(result.findings[1].severity).toBe('high');
    });

    it('derives severity from CVSS score: <4 low', async () => {
      mockResolve(CARGO_AUDIT_OUTPUT);

      const scanner = createCargoAuditScanner();
      const result = await scanner.scan(target);

      expect(result.findings[2].severity).toBe('low');
    });

    it('derives severity from CVSS score: >=4 and <7 medium', async () => {
      const output = JSON.stringify({
        vulnerabilities: {
          found: true,
          count: 1,
          list: [
            {
              advisory: {
                id: 'RUSTSEC-2024-0099',
                title: 'Medium severity issue',
                cvss: 5.5,
              },
              package: {name: 'test-crate', version: '1.0.0'},
            },
          ],
        },
      });
      mockResolve(output);

      const scanner = createCargoAuditScanner();
      const result = await scanner.scan(target);

      expect(result.findings[0].severity).toBe('medium');
    });

    it('defaults to medium when CVSS is null', async () => {
      const output = JSON.stringify({
        vulnerabilities: {
          found: true,
          count: 1,
          list: [
            {
              advisory: {
                id: 'RUSTSEC-2024-0100',
                title: 'No CVSS score',
                cvss: null,
              },
              package: {name: 'test-crate', version: '1.0.0'},
            },
          ],
        },
      });
      mockResolve(output);

      const scanner = createCargoAuditScanner();
      const result = await scanner.scan(target);

      expect(result.findings[0].severity).toBe('medium');
    });

    it('defaults to medium when CVSS is undefined', async () => {
      const output = JSON.stringify({
        vulnerabilities: {
          found: true,
          count: 1,
          list: [
            {
              advisory: {
                id: 'RUSTSEC-2024-0101',
                title: 'Missing CVSS',
              },
              package: {name: 'test-crate', version: '1.0.0'},
            },
          ],
        },
      });
      mockResolve(output);

      const scanner = createCargoAuditScanner();
      const result = await scanner.scan(target);

      expect(result.findings[0].severity).toBe('medium');
    });

    it('includes metadata with package and version details', async () => {
      mockResolve(CARGO_AUDIT_OUTPUT);

      const scanner = createCargoAuditScanner();
      const result = await scanner.scan(target);

      expect(result.findings[0].metadata).toBeDefined();
      expect(result.findings[0].metadata!.packageName).toBe('hyper');
      expect(result.findings[0].metadata!.packageVersion).toBe('0.14.4');
      expect(result.findings[0].metadata!.patchedVersions).toEqual(['>=0.14.10']);
      expect(result.findings[0].metadata!.url).toBe(
        'https://rustsec.org/advisories/RUSTSEC-2021-0078',
      );
      expect(result.findings[0].metadata!.description).toBe(
        'hyper before 0.14.10 has an integer overflow bug.',
      );
    });

    it('handles empty vulnerabilities list', async () => {
      const output = JSON.stringify({
        vulnerabilities: {found: false, count: 0, list: []},
      });
      mockResolve(output);

      const scanner = createCargoAuditScanner();
      const result = await scanner.scan(target);

      expect(result.findings).toHaveLength(0);
      expect(result.error).toBeUndefined();
    });

    it('handles empty JSON object', async () => {
      mockResolve('{}');

      const scanner = createCargoAuditScanner();
      const result = await scanner.scan(target);

      expect(result.findings).toHaveLength(0);
      expect(result.error).toBeUndefined();
    });

    it('handles timeout error', async () => {
      mockReject({code: 'ETIMEDOUT', killed: true});

      const scanner = createCargoAuditScanner();
      const result = await scanner.scan(target);

      expect(result.findings).toHaveLength(0);
      expect(result.error).toContain('timed out');
    });

    it('handles binary not found error', async () => {
      mockReject({code: 'ENOENT'});

      const scanner = createCargoAuditScanner();
      const result = await scanner.scan(target);

      expect(result.findings).toHaveLength(0);
      expect(result.error).toContain('not found');
    });

    it('reports duration', async () => {
      mockResolve(JSON.stringify({}));

      const scanner = createCargoAuditScanner();
      const result = await scanner.scan(target);

      expect(result.duration).toBeGreaterThanOrEqual(0);
    });
  });
});
