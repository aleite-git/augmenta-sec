/**
 * Tests for the scan engine (ASEC-005).
 */

import {describe, it, expect, vi, beforeEach} from 'vitest';
import type {AugmentaSecConfig} from '../../config/schema.js';
import type {SecurityProfile} from '../../discovery/types.js';
import type {
  SecurityScanner,
  ScanResult,
} from '../../providers/scanner/types.js';
import {
  runScan,
  buildSeverityContext,
  resolveEnabledScanners,
} from '../engine.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeConfig(
  overrides: Partial<AugmentaSecConfig> = {},
): AugmentaSecConfig {
  return {
    llm: {
      triage: 'gemini/gemini-2.5-flash-lite',
      analysis: 'gemini/gemini-2.5-flash',
      reasoning: 'gemini/gemini-2.5-pro',
    },
    autonomy: {
      critical: 'create-pr-and-alert',
      high: 'create-issue',
      medium: 'report',
      low: 'note',
      max_auto_prs_per_day: 3,
      never_auto_merge: true,
      respect_freeze: true,
    },
    scanners: ['semgrep', 'trivy'],
    custom_scanners: [],
    scan: {
      categories: ['auth', 'injection'],
      min_severity: 'low',
      max_findings: 0,
    },
    review: {
      auto_approve_below: 'medium',
      inline_comments: true,
      summary_comment: true,
    },
    output: {
      format: 'text',
      verbosity: 'normal',
    },
    ...overrides,
  };
}

function makeProfile(
  overrides: Partial<SecurityProfile> = {},
): SecurityProfile {
  return {
    version: '1.0',
    generatedAt: '2026-01-01T00:00:00.000Z',
    target: '/test/project',
    project: {name: 'test-project'},
    languages: {primary: 'typescript', all: []},
    frameworks: {
      backend: [],
      frontend: [],
      fullstack: [],
      orm: [],
      testing: [],
    },
    auth: {providers: [], patterns: []},
    database: {databases: []},
    api: {styles: [], routeCount: 0, endpoints: []},
    securityControls: {present: [], missing: []},
    ci: {platform: 'none', workflows: [], securityChecks: []},
    docs: {
      hasReadme: false,
      hasContributing: false,
      hasSecurityPolicy: false,
      hasChangelog: false,
      hasLicense: false,
      architectureDocs: [],
      aiConfigs: [],
    },
    trustBoundaries: {candidates: []},
    piiFields: {candidates: []},
    monorepo: {isMonorepo: false, workspaces: []},
    git: {hasGit: false},
    docker: {
      hasDocker: false,
      dockerfiles: [],
      hasCompose: false,
      composeFiles: [],
      baseImages: [],
      usesNonRoot: false,
      hasMultiStage: false,
      healthCheck: false,
    },
    iac: {tools: []},
    secrets: {envFiles: [], gitignoresEnv: false, findings: []},
    licenses: {dependencyLicenses: []},
    pythonEcosystem: {
      detected: false,
      packageManager: null,
      hasVirtualEnv: false,
      virtualEnvPaths: [],
      hasPyprojectToml: false,
      hasPoetryLock: false,
      hasPipfileLock: false,
      frameworks: [],
      securityDeps: [],
    },
    goEcosystem: {
      detected: false,
      hasGoSum: false,
      directDeps: 0,
      indirectDeps: 0,
      frameworks: [],
      securityTools: [],
      hasVendor: false,
      hasUnsafeImports: false,
    },
    rustEcosystem: {
      detected: false,
      hasCargoLock: false,
      crateCount: 0,
      hasUnsafeBlocks: false,
      unsafeFileCount: 0,
      frameworks: [],
      securityDeps: [],
      isWorkspace: false,
      workspaceMembers: [],
    },
    jvmEcosystem: {
      detected: false,
      buildTool: null,
      hasSpringBoot: false,
      hasSpringSecurity: false,
      frameworks: [],
      securityDeps: [],
      hasGradleLock: false,
      hasMavenWrapper: false,
      hasGradleWrapper: false,
    },
    ...overrides,
  };
}

function makeMockScanner(
  name: string,
  findings: ScanResult['findings'] = [],
): SecurityScanner {
  return {
    name,
    category: 'sast',
    isAvailable: vi.fn().mockResolvedValue(true),
    scan: vi.fn().mockResolvedValue({
      scanner: name,
      category: 'sast',
      findings,
      duration: 100,
    } satisfies ScanResult),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runScan', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns empty report when no scanners are provided', async () => {
    const config = makeConfig();
    const profile = makeProfile();

    const report = await runScan('/test', config, {
      scanners: [],
      profile,
    });

    expect(report.findings).toEqual([]);
    expect(report.summary.total).toBe(0);
    expect(report.version).toBe('1.0');
    expect(report.target).toBe('/test');
  });

  it('collects findings from multiple scanners in parallel', async () => {
    const scanner1 = makeMockScanner('semgrep', [
      {
        ruleId: 'sql-injection',
        message: 'SQL injection detected',
        severity: 'high',
        file: 'src/api.ts',
        line: 42,
      },
    ]);
    const scanner2 = makeMockScanner('trivy', [
      {
        ruleId: 'cve-2024-1234',
        message: 'Vulnerable dependency',
        severity: 'medium',
        file: 'package.json',
        line: 10,
      },
    ]);

    const config = makeConfig();
    const profile = makeProfile();

    const report = await runScan('/test', config, {
      scanners: [scanner1, scanner2],
      profile,
    });

    expect(report.findings.length).toBe(2);
    expect(report.summary.total).toBe(2);
    expect(scanner1.scan).toHaveBeenCalledOnce();
    expect(scanner2.scan).toHaveBeenCalledOnce();
  });

  it('deduplicates identical findings from different scanners', async () => {
    const finding = {
      ruleId: 'sql-injection',
      message: 'SQL injection detected',
      severity: 'high' as const,
      file: 'src/api.ts',
      line: 42,
    };

    const scanner1 = makeMockScanner('semgrep', [finding]);
    const scanner2 = makeMockScanner('codeql', [finding]);

    const config = makeConfig();
    const profile = makeProfile();

    const report = await runScan('/test', config, {
      scanners: [scanner1, scanner2],
      profile,
    });

    expect(report.findings.length).toBe(1);
  });

  it('filters findings below min_severity', async () => {
    const scanner = makeMockScanner('semgrep', [
      {
        ruleId: 'info-finding',
        message: 'Informational note',
        severity: 'informational',
        file: 'src/utils.ts',
        line: 1,
      },
      {
        ruleId: 'high-finding',
        message: 'Critical issue',
        severity: 'high',
        file: 'src/api.ts',
        line: 10,
      },
    ]);

    const config = makeConfig({
      scan: {categories: [], min_severity: 'medium', max_findings: 0},
    });
    const profile = makeProfile();

    const report = await runScan('/test', config, {
      scanners: [scanner],
      profile,
    });

    expect(report.findings.length).toBe(1);
    expect(report.findings[0].title).toBe('high-finding');
  });

  it('caps findings at max_findings', async () => {
    const findings = Array.from({length: 20}, (_, i) => ({
      ruleId: `rule-${i}`,
      message: `Finding ${i}`,
      severity: 'medium' as const,
      file: `src/file${i}.ts`,
      line: i + 1,
    }));

    const scanner = makeMockScanner('semgrep', findings);
    const config = makeConfig({
      scan: {categories: [], min_severity: 'low', max_findings: 5},
    });
    const profile = makeProfile();

    const report = await runScan('/test', config, {
      scanners: [scanner],
      profile,
    });

    expect(report.findings.length).toBe(5);
  });

  it('handles scanner failures gracefully', async () => {
    const failScanner: SecurityScanner = {
      name: 'fail-scanner',
      category: 'sast',
      isAvailable: vi.fn().mockResolvedValue(true),
      scan: vi.fn().mockRejectedValue(new Error('Scanner crashed')),
    };
    const goodScanner = makeMockScanner('semgrep', [
      {
        ruleId: 'ok-finding',
        message: 'Found something',
        severity: 'low',
        file: 'src/ok.ts',
        line: 1,
      },
    ]);

    const config = makeConfig();
    const profile = makeProfile();

    const report = await runScan('/test', config, {
      scanners: [failScanner, goodScanner],
      profile,
    });

    expect(report.findings.length).toBe(1);
  });

  it('handles scanner error field (non-thrown errors)', async () => {
    const errorScanner: SecurityScanner = {
      name: 'error-scanner',
      category: 'sast',
      isAvailable: vi.fn().mockResolvedValue(true),
      scan: vi.fn().mockResolvedValue({
        scanner: 'error-scanner',
        category: 'sast',
        findings: [],
        duration: 50,
        error: 'Partial failure',
      } satisfies ScanResult),
    };

    const config = makeConfig();
    const profile = makeProfile();

    const report = await runScan('/test', config, {
      scanners: [errorScanner],
      profile,
    });

    expect(report.findings).toEqual([]);
    expect(report.summary.total).toBe(0);
  });

  it('applies contextual severity scoring', async () => {
    const scanner = makeMockScanner('semgrep', [
      {
        ruleId: 'test-finding',
        message: 'Finding in test code',
        severity: 'high',
        file: 'src/__tests__/auth.test.ts',
        line: 10,
      },
    ]);

    const config = makeConfig();
    const profile = makeProfile();

    const report = await runScan('/test', config, {
      scanners: [scanner],
      profile,
    });

    expect(report.findings[0].severity).toBe('medium');
  });

  it('includes report metadata', async () => {
    const config = makeConfig();
    const profile = makeProfile();

    const report = await runScan('/test', config, {
      scanners: [],
      profile,
    });

    expect(report.version).toBe('1.0');
    expect(report.target).toBe('/test');
    expect(report.generatedAt).toBeTruthy();
    expect(report.summary).toBeDefined();
  });
});

describe('buildSeverityContext', () => {
  it('detects test code paths', () => {
    const profile = makeProfile();
    const ctx = buildSeverityContext(profile, {
      file: 'src/__tests__/auth.test.ts',
      category: 'sast',
    });
    expect(ctx.isInTestCode).toBe(true);
  });

  it('detects third-party paths', () => {
    const profile = makeProfile();
    const ctx = buildSeverityContext(profile, {
      file: 'project/node_modules/lodash/index.js',
      category: 'sast',
    });
    expect(ctx.isInThirdParty).toBe(true);
  });

  it('detects auth code paths', () => {
    const profile = makeProfile();
    const ctx = buildSeverityContext(profile, {
      file: 'src/auth/middleware.ts',
      category: 'sast',
    });
    expect(ctx.isInAuthCode).toBe(true);
  });

  it('detects API route files', () => {
    const profile = makeProfile({
      api: {
        styles: ['rest'],
        routeCount: 5,
        endpoints: [
          {method: 'GET', path: '/api/users', file: 'src/routes.ts', line: 10},
        ],
      },
    });
    const ctx = buildSeverityContext(profile, {
      file: 'src/routes.ts',
      category: 'sast',
    });
    expect(ctx.isInApiRoute).toBe(true);
  });

  it('reports PII presence from profile', () => {
    const profile = makeProfile({
      piiFields: {
        candidates: [
          {
            field: 'email',
            location: 'src/models/user.ts',
            classification: 'direct-identifier',
            confidence: 0.9,
          },
        ],
      },
    });
    const ctx = buildSeverityContext(profile, {
      file: 'src/api.ts',
      category: 'sast',
    });
    expect(ctx.handlesPII).toBe(true);
  });

  it('handles missing file gracefully', () => {
    const profile = makeProfile();
    const ctx = buildSeverityContext(profile, {
      file: undefined,
      category: 'sast',
    });
    expect(ctx.isInTestCode).toBe(false);
    expect(ctx.isInThirdParty).toBe(false);
    expect(ctx.isInAuthCode).toBe(false);
  });
});

describe('resolveEnabledScanners', () => {
  it('warns and skips unknown scanner names', async () => {
    const scanners = await resolveEnabledScanners([
      'nonexistent-scanner',
    ]);
    expect(scanners).toEqual([]);
  });
});
