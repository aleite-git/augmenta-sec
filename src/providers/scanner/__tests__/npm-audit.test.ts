import {describe, it, expect, vi, beforeEach} from 'vitest';
import {createNpmAuditScanner} from '../npm-audit.js';
import type {ScanTarget} from '../types.js';

vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}));

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    existsSync: vi.fn(),
  };
});

import {execFile} from 'node:child_process';
import {existsSync} from 'node:fs';

const mockExecFile = vi.mocked(execFile);
const mockExistsSync = vi.mocked(existsSync);

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

const NPM_AUDIT_V2_OUTPUT = JSON.stringify({
  vulnerabilities: {
    lodash: {
      name: 'lodash',
      severity: 'critical',
      via: [{
        title: 'Prototype Pollution in lodash',
        url: 'https://npmjs.com/advisories/1523',
        source: 1523,
      }],
      effects: [],
      range: '<4.17.21',
      fixAvailable: {name: 'lodash', version: '4.17.21', isSemVerMajor: false},
    },
    minimist: {
      name: 'minimist',
      severity: 'moderate',
      via: [{
        title: 'Prototype Pollution in minimist',
        url: 'https://npmjs.com/advisories/1179',
        source: 1179,
      }],
      effects: ['mkdirp'],
      range: '<1.2.6',
      fixAvailable: true,
    },
    mkdirp: {
      name: 'mkdirp',
      severity: 'high',
      via: ['minimist'],
      effects: [],
      range: '0.4.1 - 0.5.1',
      fixAvailable: true,
    },
  },
});

const NPM_AUDIT_V1_OUTPUT = JSON.stringify({
  advisories: {
    '1523': {
      id: 1523,
      module_name: 'lodash',
      severity: 'critical',
      title: 'Prototype Pollution',
      url: 'https://npmjs.com/advisories/1523',
      overview: 'lodash before 4.17.21 is vulnerable to prototype pollution',
    },
  },
});

describe('createNpmAuditScanner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExistsSync.mockReturnValue(true);
  });

  it('has correct name and category', () => {
    const scanner = createNpmAuditScanner();
    expect(scanner.name).toBe('npm-audit');
    expect(scanner.category).toBe('sca');
  });

  describe('isAvailable', () => {
    it('returns true when npm binary exists', async () => {
      mockResolve('/usr/local/bin/npm');
      const scanner = createNpmAuditScanner();
      const available = await scanner.isAvailable();
      expect(available).toBe(true);
    });

    it('returns false when npm is missing', async () => {
      mockReject({code: 'ENOENT'});
      const scanner = createNpmAuditScanner();
      const available = await scanner.isAvailable();
      expect(available).toBe(false);
    });
  });

  describe('scan', () => {
    it('returns error when no package-lock.json exists', async () => {
      mockExistsSync.mockReturnValue(false);
      const scanner = createNpmAuditScanner();
      const result = await scanner.scan(target);
      expect(result.findings).toHaveLength(0);
      expect(result.error).toContain('package-lock.json');
    });

    it('parses npm audit v2 JSON output', async () => {
      mockResolve(NPM_AUDIT_V2_OUTPUT);
      const scanner = createNpmAuditScanner();
      const result = await scanner.scan(target);

      expect(result.scanner).toBe('npm-audit');
      expect(result.category).toBe('sca');
      expect(result.findings).toHaveLength(3);
      expect(result.error).toBeUndefined();

      const lodashFinding = result.findings.find(f => f.ruleId === 'npm:lodash');
      expect(lodashFinding).toBeDefined();
      expect(lodashFinding!.message).toContain('Prototype Pollution');
      expect(lodashFinding!.file).toBe('package-lock.json');
    });

    it('treats exit code 1 as success (vulns found, not error)', async () => {
      mockReject({code: 1, status: 1, stdout: NPM_AUDIT_V2_OUTPUT, stderr: ''});
      const scanner = createNpmAuditScanner();
      const result = await scanner.scan(target);
      expect(result.findings.length).toBeGreaterThan(0);
      expect(result.error).toBeUndefined();
    });

    it('maps "moderate" to "medium"', async () => {
      mockResolve(NPM_AUDIT_V2_OUTPUT);
      const scanner = createNpmAuditScanner();
      const result = await scanner.scan(target);
      const minimistFinding = result.findings.find(f => f.ruleId === 'npm:minimist');
      expect(minimistFinding).toBeDefined();
      expect(minimistFinding!.severity).toBe('medium');
    });

    it('maps "critical" to "critical"', async () => {
      mockResolve(NPM_AUDIT_V2_OUTPUT);
      const scanner = createNpmAuditScanner();
      const result = await scanner.scan(target);
      const lodashFinding = result.findings.find(f => f.ruleId === 'npm:lodash');
      expect(lodashFinding!.severity).toBe('critical');
    });

    it('maps "high" to "high"', async () => {
      mockResolve(NPM_AUDIT_V2_OUTPUT);
      const scanner = createNpmAuditScanner();
      const result = await scanner.scan(target);
      const mkdirpFinding = result.findings.find(f => f.ruleId === 'npm:mkdirp');
      expect(mkdirpFinding!.severity).toBe('high');
    });

    it('handles "via" with only string references (transitive deps)', async () => {
      mockResolve(NPM_AUDIT_V2_OUTPUT);
      const scanner = createNpmAuditScanner();
      const result = await scanner.scan(target);
      const mkdirpFinding = result.findings.find(f => f.ruleId === 'npm:mkdirp');
      expect(mkdirpFinding).toBeDefined();
      expect(mkdirpFinding!.message).toContain('Vulnerability in mkdirp');
    });

    it('parses legacy npm audit v1 format', async () => {
      mockResolve(NPM_AUDIT_V1_OUTPUT);
      const scanner = createNpmAuditScanner();
      const result = await scanner.scan(target);
      expect(result.findings).toHaveLength(1);
      expect(result.findings[0].ruleId).toBe('npm:1523');
      expect(result.findings[0].message).toBe('Prototype Pollution');
      expect(result.findings[0].severity).toBe('critical');
    });

    it('includes metadata with package details', async () => {
      mockResolve(NPM_AUDIT_V2_OUTPUT);
      const scanner = createNpmAuditScanner();
      const result = await scanner.scan(target);
      const lodashFinding = result.findings.find(f => f.ruleId === 'npm:lodash');
      expect(lodashFinding!.metadata).toBeDefined();
      expect(lodashFinding!.metadata!.packageName).toBe('lodash');
      expect(lodashFinding!.metadata!.range).toBe('<4.17.21');
    });

    it('handles empty audit output', async () => {
      mockResolve(JSON.stringify({}));
      const scanner = createNpmAuditScanner();
      const result = await scanner.scan(target);
      expect(result.findings).toHaveLength(0);
      expect(result.error).toBeUndefined();
    });

    it('handles timeout error', async () => {
      mockReject({code: 'ETIMEDOUT', killed: true});
      const scanner = createNpmAuditScanner();
      const result = await scanner.scan(target);
      expect(result.findings).toHaveLength(0);
      expect(result.error).toContain('timed out');
    });

    it('handles npm not found', async () => {
      mockReject({code: 'ENOENT'});
      const scanner = createNpmAuditScanner();
      const result = await scanner.scan(target);
      expect(result.findings).toHaveLength(0);
      expect(result.error).toContain('not found');
    });

    it('reports duration', async () => {
      mockResolve(JSON.stringify({}));
      const scanner = createNpmAuditScanner();
      const result = await scanner.scan(target);
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });
  });
});
