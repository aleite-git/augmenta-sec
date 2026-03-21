import {describe, it, expect, vi, beforeEach} from 'vitest';
import {createTrivyScanner} from '../trivy.js';
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
        });
        cb(err, error.stdout ?? '', error.stderr ?? '');
      }
    }) as typeof execFile,
  );
}

const target: ScanTarget = {rootDir: '/project'};

const TRIVY_FS_OUTPUT = JSON.stringify({
  Results: [
    {
      Target: 'package-lock.json',
      Type: 'npm',
      Vulnerabilities: [
        {
          VulnerabilityID: 'CVE-2023-1234',
          PkgName: 'lodash',
          InstalledVersion: '4.17.19',
          FixedVersion: '4.17.21',
          Title: 'Prototype Pollution',
          Description: 'lodash before 4.17.21 has a prototype pollution vulnerability',
          Severity: 'CRITICAL',
        },
        {
          VulnerabilityID: 'CVE-2023-5678',
          PkgName: 'express',
          InstalledVersion: '4.17.0',
          FixedVersion: '4.18.2',
          Title: 'Open Redirect',
          Description: 'Express before 4.18.2 allows open redirect',
          Severity: 'MEDIUM',
        },
      ],
    },
    {
      Target: 'go.sum',
      Type: 'gomod',
      Vulnerabilities: [
        {
          VulnerabilityID: 'CVE-2023-9999',
          PkgName: 'golang.org/x/net',
          InstalledVersion: 'v0.1.0',
          FixedVersion: 'v0.7.0',
          Title: 'HTTP/2 rapid reset',
          Severity: 'HIGH',
        },
      ],
    },
  ],
});

describe('createTrivyScanner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('has correct name and category for fs mode', () => {
    const scanner = createTrivyScanner('fs');
    expect(scanner.name).toBe('trivy');
    expect(scanner.category).toBe('sca');
  });

  it('has correct name and category for image mode', () => {
    const scanner = createTrivyScanner('image');
    expect(scanner.name).toBe('trivy');
    expect(scanner.category).toBe('container');
  });

  it('defaults to fs mode', () => {
    const scanner = createTrivyScanner();
    expect(scanner.category).toBe('sca');
  });

  describe('isAvailable', () => {
    it('returns true when trivy binary exists', async () => {
      mockResolve('/usr/local/bin/trivy');
      const scanner = createTrivyScanner();
      const available = await scanner.isAvailable();
      expect(available).toBe(true);
    });

    it('returns false when trivy binary is missing', async () => {
      mockReject({code: 'ENOENT'});
      const scanner = createTrivyScanner();
      const available = await scanner.isAvailable();
      expect(available).toBe(false);
    });
  });

  describe('scan (fs mode)', () => {
    it('parses Trivy JSON output for filesystem mode', async () => {
      mockResolve(TRIVY_FS_OUTPUT);

      const scanner = createTrivyScanner('fs');
      const result = await scanner.scan(target);

      expect(result.scanner).toBe('trivy');
      expect(result.category).toBe('sca');
      expect(result.findings).toHaveLength(3);
      expect(result.error).toBeUndefined();

      expect(result.findings[0].ruleId).toBe('CVE-2023-1234');
      expect(result.findings[0].message).toContain('Prototype Pollution');
      expect(result.findings[0].file).toBe('package-lock.json');
    });

    it('maps CRITICAL to critical severity', async () => {
      mockResolve(TRIVY_FS_OUTPUT);
      const scanner = createTrivyScanner();
      const result = await scanner.scan(target);
      expect(result.findings[0].severity).toBe('critical');
    });

    it('maps HIGH to high severity', async () => {
      mockResolve(TRIVY_FS_OUTPUT);
      const scanner = createTrivyScanner();
      const result = await scanner.scan(target);
      expect(result.findings[2].severity).toBe('high');
    });

    it('maps MEDIUM to medium severity', async () => {
      mockResolve(TRIVY_FS_OUTPUT);
      const scanner = createTrivyScanner();
      const result = await scanner.scan(target);
      expect(result.findings[1].severity).toBe('medium');
    });

    it('maps UNKNOWN to informational', async () => {
      const output = JSON.stringify({
        Results: [{
          Target: 'test.lock',
          Type: 'npm',
          Vulnerabilities: [{
            VulnerabilityID: 'CVE-UNKNOWN',
            PkgName: 'unknown-pkg',
            InstalledVersion: '1.0.0',
            Severity: 'UNKNOWN',
          }],
        }],
      });
      mockResolve(output);
      const scanner = createTrivyScanner();
      const result = await scanner.scan(target);
      expect(result.findings[0].severity).toBe('informational');
    });

    it('includes package metadata in findings', async () => {
      mockResolve(TRIVY_FS_OUTPUT);
      const scanner = createTrivyScanner();
      const result = await scanner.scan(target);
      const metadata = result.findings[0].metadata;
      expect(metadata).toBeDefined();
      expect(metadata!.pkgName).toBe('lodash');
      expect(metadata!.installedVersion).toBe('4.17.19');
      expect(metadata!.fixedVersion).toBe('4.17.21');
      expect(metadata!.target).toBe('package-lock.json');
      expect(metadata!.type).toBe('npm');
    });

    it('handles empty results', async () => {
      mockResolve(JSON.stringify({Results: []}));
      const scanner = createTrivyScanner();
      const result = await scanner.scan(target);
      expect(result.findings).toHaveLength(0);
      expect(result.error).toBeUndefined();
    });

    it('handles null Vulnerabilities array', async () => {
      const output = JSON.stringify({
        Results: [{Target: 'package-lock.json', Type: 'npm', Vulnerabilities: null}],
      });
      mockResolve(output);
      const scanner = createTrivyScanner();
      const result = await scanner.scan(target);
      expect(result.findings).toHaveLength(0);
    });

    it('combines Title and Description in message', async () => {
      mockResolve(TRIVY_FS_OUTPUT);
      const scanner = createTrivyScanner();
      const result = await scanner.scan(target);
      expect(result.findings[0].message).toContain('Prototype Pollution');
      expect(result.findings[0].message).toContain('lodash before 4.17.21');
    });

    it('uses VulnerabilityID as message fallback when Title/Description absent', async () => {
      const output = JSON.stringify({
        Results: [{
          Target: 'test.lock',
          Type: 'npm',
          Vulnerabilities: [{
            VulnerabilityID: 'CVE-NO-TITLE',
            PkgName: 'pkg',
            InstalledVersion: '1.0.0',
            Severity: 'LOW',
          }],
        }],
      });
      mockResolve(output);
      const scanner = createTrivyScanner();
      const result = await scanner.scan(target);
      expect(result.findings[0].message).toBe('CVE-NO-TITLE');
    });
  });

  describe('scan (image mode)', () => {
    it('uses image mode when configured', async () => {
      const imageTarget: ScanTarget = {rootDir: '/project', image: 'my-app:latest'};
      const imageOutput = JSON.stringify({
        Results: [{
          Target: 'my-app:latest (alpine 3.18.4)',
          Type: 'alpine',
          Vulnerabilities: [{
            VulnerabilityID: 'CVE-2023-0001',
            PkgName: 'openssl',
            InstalledVersion: '3.1.2-r0',
            FixedVersion: '3.1.4-r0',
            Title: 'Buffer overflow in openssl',
            Severity: 'HIGH',
          }],
        }],
      });
      mockResolve(imageOutput);
      const scanner = createTrivyScanner('image');
      const result = await scanner.scan(imageTarget);
      expect(result.category).toBe('container');
      expect(result.findings).toHaveLength(1);
      expect(result.findings[0].ruleId).toBe('CVE-2023-0001');
    });
  });

  describe('error handling', () => {
    it('handles timeout error', async () => {
      mockReject({code: 'ETIMEDOUT', killed: true});
      const scanner = createTrivyScanner();
      const result = await scanner.scan(target);
      expect(result.findings).toHaveLength(0);
      expect(result.error).toContain('timed out');
    });

    it('handles binary not found', async () => {
      mockReject({code: 'ENOENT'});
      const scanner = createTrivyScanner();
      const result = await scanner.scan(target);
      expect(result.findings).toHaveLength(0);
      expect(result.error).toContain('not found');
    });

    it('reports duration on success', async () => {
      mockResolve(JSON.stringify({Results: []}));
      const scanner = createTrivyScanner();
      const result = await scanner.scan(target);
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });
  });
});
