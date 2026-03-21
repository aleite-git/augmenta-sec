import {describe, it, expect, vi, beforeEach} from 'vitest';
import {createPipAuditScanner} from '../pip-audit.js';
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

const PIP_AUDIT_OUTPUT = JSON.stringify({
  dependencies: [
    {
      name: 'requests',
      version: '2.25.0',
      vulns: [
        {
          id: 'CVE-2023-32681',
          description: 'Unintended leak of Proxy-Authorization header',
          fix_versions: ['2.31.0'],
          aliases: ['GHSA-j8r2-6x86-q33q'],
        },
      ],
    },
    {
      name: 'flask',
      version: '2.0.0',
      vulns: [
        {
          id: 'CVE-2023-30861',
          description: 'Session cookie set without Secure flag on redirect',
          fix_versions: ['2.3.2'],
          aliases: [],
        },
        {
          id: 'CVE-2024-99999',
          description: 'Hypothetical vulnerability with no fix',
          fix_versions: [],
          aliases: ['GHSA-xxxx-yyyy-zzzz'],
        },
      ],
    },
    {
      name: 'safe-package',
      version: '1.0.0',
      vulns: [],
    },
  ],
});

describe('createPipAuditScanner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('has correct name and category', () => {
    const scanner = createPipAuditScanner();
    expect(scanner.name).toBe('pip-audit');
    expect(scanner.category).toBe('sca');
  });

  describe('isAvailable', () => {
    it('returns true when pip-audit binary exists', async () => {
      mockResolve('/usr/local/bin/pip-audit');
      const scanner = createPipAuditScanner();
      const available = await scanner.isAvailable();
      expect(available).toBe(true);
    });

    it('returns false when pip-audit binary is missing', async () => {
      mockReject({code: 'ENOENT'});
      const scanner = createPipAuditScanner();
      const available = await scanner.isAvailable();
      expect(available).toBe(false);
    });
  });

  describe('scan', () => {
    it('parses pip-audit JSON output correctly', async () => {
      mockResolve(PIP_AUDIT_OUTPUT);

      const scanner = createPipAuditScanner();
      const result = await scanner.scan(target);

      expect(result.scanner).toBe('pip-audit');
      expect(result.category).toBe('sca');
      expect(result.findings).toHaveLength(3);
      expect(result.error).toBeUndefined();

      expect(result.findings[0].ruleId).toBe('CVE-2023-32681');
      expect(result.findings[0].message).toBe(
        'Unintended leak of Proxy-Authorization header',
      );
      expect(result.findings[0].file).toBe('requirements.txt');
      expect(result.findings[0].severity).toBe('medium');
    });

    it('includes metadata with package details', async () => {
      mockResolve(PIP_AUDIT_OUTPUT);

      const scanner = createPipAuditScanner();
      const result = await scanner.scan(target);

      expect(result.findings[0].metadata).toBeDefined();
      expect(result.findings[0].metadata!.packageName).toBe('requests');
      expect(result.findings[0].metadata!.installedVersion).toBe('2.25.0');
      expect(result.findings[0].metadata!.fixVersions).toEqual(['2.31.0']);
      expect(result.findings[0].metadata!.aliases).toEqual([
        'GHSA-j8r2-6x86-q33q',
      ]);
    });

    it('skips dependencies with no vulns', async () => {
      mockResolve(PIP_AUDIT_OUTPUT);

      const scanner = createPipAuditScanner();
      const result = await scanner.scan(target);

      expect(result.findings).toHaveLength(3);
      const ruleIds = result.findings.map(f => f.ruleId);
      expect(ruleIds).not.toContain('safe-package');
    });

    it('maps severity to medium by default', async () => {
      mockResolve(PIP_AUDIT_OUTPUT);

      const scanner = createPipAuditScanner();
      const result = await scanner.scan(target);

      for (const finding of result.findings) {
        expect(finding.severity).toBe('medium');
      }
    });

    it('uses vuln id as message fallback when description is empty', async () => {
      const output = JSON.stringify({
        dependencies: [
          {
            name: 'pkg',
            version: '1.0.0',
            vulns: [{id: 'CVE-2024-00000', description: ''}],
          },
        ],
      });
      mockResolve(output);

      const scanner = createPipAuditScanner();
      const result = await scanner.scan(target);

      expect(result.findings[0].message).toBe('CVE-2024-00000');
    });

    it('handles empty dependencies list', async () => {
      mockResolve(JSON.stringify({dependencies: []}));

      const scanner = createPipAuditScanner();
      const result = await scanner.scan(target);

      expect(result.findings).toHaveLength(0);
      expect(result.error).toBeUndefined();
    });

    it('handles empty JSON object', async () => {
      mockResolve('{}');

      const scanner = createPipAuditScanner();
      const result = await scanner.scan(target);

      expect(result.findings).toHaveLength(0);
      expect(result.error).toBeUndefined();
    });

    it('handles timeout error', async () => {
      mockReject({code: 'ETIMEDOUT', killed: true});

      const scanner = createPipAuditScanner();
      const result = await scanner.scan(target);

      expect(result.findings).toHaveLength(0);
      expect(result.error).toContain('timed out');
    });

    it('handles binary not found error', async () => {
      mockReject({code: 'ENOENT'});

      const scanner = createPipAuditScanner();
      const result = await scanner.scan(target);

      expect(result.findings).toHaveLength(0);
      expect(result.error).toContain('not found');
    });

    it('reports duration', async () => {
      mockResolve(JSON.stringify({dependencies: []}));

      const scanner = createPipAuditScanner();
      const result = await scanner.scan(target);

      expect(result.duration).toBeGreaterThanOrEqual(0);
    });
  });
});
