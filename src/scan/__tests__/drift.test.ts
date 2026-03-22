/**
 * Tests for drift detection (ASEC-015).
 */

import {describe, it, expect} from 'vitest';
import type {SecurityProfile} from '../../discovery/types.js';
import {detectDrift} from '../drift.js';
import type {DriftReport} from '../drift.js';

// ---------------------------------------------------------------------------
// Fixture helper
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('detectDrift', () => {
  it('returns empty report when profiles are identical', () => {
    const baseline = makeProfile();
    const current = makeProfile();

    const report = detectDrift(current, baseline);

    expect(report.changes).toEqual([]);
    expect(report.regressions).toEqual([]);
    expect(report.improvements).toEqual([]);
    expect(report.summary.totalChanges).toBe(0);
  });

  // --- Language changes ---

  it('detects primary language change', () => {
    const baseline = makeProfile({
      languages: {primary: 'javascript', all: []},
    });
    const current = makeProfile({
      languages: {primary: 'typescript', all: []},
    });

    const report = detectDrift(current, baseline);
    expect(report.changes.length).toBe(1);
    expect(report.changes[0].path).toBe('languages.primary');
    expect(report.changes[0].impact).toBe('neutral');
  });

  it('detects new languages added', () => {
    const baseline = makeProfile({
      languages: {primary: 'typescript', all: []},
    });
    const current = makeProfile({
      languages: {
        primary: 'typescript',
        all: [{name: 'python', percentage: 10, fileCount: 5}],
      },
    });

    const report = detectDrift(current, baseline);
    expect(report.changes.some(c => c.description.includes('python'))).toBe(true);
  });

  // --- Auth changes ---

  it('detects added auth provider as improvement', () => {
    const baseline = makeProfile();
    const current = makeProfile({
      auth: {
        providers: [
          {name: 'oauth2', type: 'third-party', confidence: 0.9, source: 'code'},
        ],
        patterns: [],
      },
    });

    const report = detectDrift(current, baseline);
    expect(report.improvements.length).toBe(1);
    expect(report.improvements[0].description).toContain('oauth2');
  });

  it('detects removed auth provider as regression', () => {
    const baseline = makeProfile({
      auth: {
        providers: [
          {name: 'jwt', type: 'first-party', confidence: 0.9, source: 'code'},
        ],
        patterns: [],
      },
    });
    const current = makeProfile();

    const report = detectDrift(current, baseline);
    expect(report.regressions.length).toBe(1);
    expect(report.regressions[0].description).toContain('jwt');
  });

  it('detects added auth pattern as improvement', () => {
    const baseline = makeProfile();
    const current = makeProfile({
      auth: {
        providers: [],
        patterns: [{type: 'middleware', files: ['src/auth.ts']}],
      },
    });

    const report = detectDrift(current, baseline);
    expect(report.improvements.some(c => c.description.includes('middleware'))).toBe(true);
  });

  // --- Security controls ---

  it('detects added security control as improvement', () => {
    const baseline = makeProfile();
    const current = makeProfile({
      securityControls: {
        present: [
          {
            name: 'CSP headers',
            type: 'headers',
            present: true,
            confidence: 0.9,
            source: 'code',
          },
        ],
        missing: [],
      },
    });

    const report = detectDrift(current, baseline);
    expect(report.improvements.some(c => c.description.includes('CSP headers'))).toBe(true);
  });

  it('detects removed security control as regression', () => {
    const baseline = makeProfile({
      securityControls: {
        present: [
          {
            name: 'Rate limiting',
            type: 'rate-limiting',
            present: true,
            confidence: 0.9,
            source: 'code',
          },
        ],
        missing: [],
      },
    });
    const current = makeProfile();

    const report = detectDrift(current, baseline);
    expect(report.regressions.some(c => c.description.includes('Rate limiting'))).toBe(true);
  });

  // --- Docker changes ---

  it('detects Docker non-root as improvement', () => {
    const baseline = makeProfile({
      docker: {
        hasDocker: true,
        dockerfiles: ['Dockerfile'],
        hasCompose: false,
        composeFiles: [],
        baseImages: [],
        usesNonRoot: false,
        hasMultiStage: false,
        healthCheck: false,
      },
    });
    const current = makeProfile({
      docker: {
        hasDocker: true,
        dockerfiles: ['Dockerfile'],
        hasCompose: false,
        composeFiles: [],
        baseImages: [],
        usesNonRoot: true,
        hasMultiStage: false,
        healthCheck: false,
      },
    });

    const report = detectDrift(current, baseline);
    expect(report.improvements.some(c => c.description.includes('non-root'))).toBe(true);
  });

  it('detects Docker non-root removal as regression', () => {
    const baseline = makeProfile({
      docker: {
        hasDocker: true,
        dockerfiles: ['Dockerfile'],
        hasCompose: false,
        composeFiles: [],
        baseImages: [],
        usesNonRoot: true,
        hasMultiStage: false,
        healthCheck: false,
      },
    });
    const current = makeProfile({
      docker: {
        hasDocker: true,
        dockerfiles: ['Dockerfile'],
        hasCompose: false,
        composeFiles: [],
        baseImages: [],
        usesNonRoot: false,
        hasMultiStage: false,
        healthCheck: false,
      },
    });

    const report = detectDrift(current, baseline);
    expect(report.regressions.some(c => c.description.includes('non-root'))).toBe(true);
  });

  it('detects multi-stage build added as improvement', () => {
    const baseline = makeProfile({
      docker: {
        hasDocker: true,
        dockerfiles: ['Dockerfile'],
        hasCompose: false,
        composeFiles: [],
        baseImages: [],
        usesNonRoot: false,
        hasMultiStage: false,
        healthCheck: false,
      },
    });
    const current = makeProfile({
      docker: {
        hasDocker: true,
        dockerfiles: ['Dockerfile'],
        hasCompose: false,
        composeFiles: [],
        baseImages: [],
        usesNonRoot: false,
        hasMultiStage: true,
        healthCheck: false,
      },
    });

    const report = detectDrift(current, baseline);
    expect(report.improvements.some(c => c.description.includes('multi-stage'))).toBe(true);
  });

  it('detects health check changes', () => {
    const baseline = makeProfile({
      docker: {
        hasDocker: true,
        dockerfiles: ['Dockerfile'],
        hasCompose: false,
        composeFiles: [],
        baseImages: [],
        usesNonRoot: false,
        hasMultiStage: false,
        healthCheck: true,
      },
    });
    const current = makeProfile({
      docker: {
        hasDocker: true,
        dockerfiles: ['Dockerfile'],
        hasCompose: false,
        composeFiles: [],
        baseImages: [],
        usesNonRoot: false,
        hasMultiStage: false,
        healthCheck: false,
      },
    });

    const report = detectDrift(current, baseline);
    expect(report.regressions.some(c => c.description.includes('health check'))).toBe(true);
  });

  // --- Secrets ---

  it('detects new secret findings as regression', () => {
    const baseline = makeProfile();
    const current = makeProfile({
      secrets: {
        envFiles: ['.env'],
        gitignoresEnv: true,
        findings: [
          {
            type: 'hardcoded',
            file: 'src/config.ts',
            line: 10,
            pattern: 'API_KEY=...',
            risk: 'high',
          },
        ],
      },
    });

    const report = detectDrift(current, baseline);
    expect(report.regressions.some(c => c.path === 'secrets.findings')).toBe(true);
  });

  it('detects gitignore removal for env files as regression', () => {
    const baseline = makeProfile({
      secrets: {envFiles: [], gitignoresEnv: true, findings: []},
    });
    const current = makeProfile({
      secrets: {envFiles: [], gitignoresEnv: false, findings: []},
    });

    const report = detectDrift(current, baseline);
    expect(report.regressions.some(c => c.description.includes('gitignored'))).toBe(true);
  });

  it('detects gitignore addition for env files as improvement', () => {
    const baseline = makeProfile({
      secrets: {envFiles: [], gitignoresEnv: false, findings: []},
    });
    const current = makeProfile({
      secrets: {envFiles: [], gitignoresEnv: true, findings: []},
    });

    const report = detectDrift(current, baseline);
    expect(report.improvements.some(c => c.description.includes('gitignored'))).toBe(true);
  });

  // --- Docs ---

  it('detects security policy addition as improvement', () => {
    const baseline = makeProfile();
    const current = makeProfile({
      docs: {
        hasReadme: false,
        hasContributing: false,
        hasSecurityPolicy: true,
        hasChangelog: false,
        hasLicense: false,
        architectureDocs: [],
        aiConfigs: [],
      },
    });

    const report = detectDrift(current, baseline);
    expect(report.improvements.some(c => c.description.includes('Security policy'))).toBe(true);
  });

  // --- CI ---

  it('detects added CI security check as improvement', () => {
    const baseline = makeProfile();
    const current = makeProfile({
      ci: {
        platform: 'github',
        workflows: [],
        securityChecks: [
          {name: 'CodeQL', type: 'sast', workflow: 'ci.yml'},
        ],
      },
    });

    const report = detectDrift(current, baseline);
    expect(report.improvements.some(c => c.description.includes('CodeQL'))).toBe(true);
  });

  it('detects removed CI security check as regression', () => {
    const baseline = makeProfile({
      ci: {
        platform: 'github',
        workflows: [],
        securityChecks: [
          {name: 'Trivy', type: 'container', workflow: 'ci.yml'},
        ],
      },
    });
    const current = makeProfile({
      ci: {
        platform: 'github',
        workflows: [],
        securityChecks: [],
      },
    });

    const report = detectDrift(current, baseline);
    expect(report.regressions.some(c => c.description.includes('Trivy'))).toBe(true);
  });

  // --- API ---

  it('detects API route count changes', () => {
    const baseline = makeProfile({
      api: {styles: ['rest'], routeCount: 10, endpoints: []},
    });
    const current = makeProfile({
      api: {styles: ['rest'], routeCount: 15, endpoints: []},
    });

    const report = detectDrift(current, baseline);
    expect(report.changes.some(c => c.path === 'api.routeCount')).toBe(true);
  });

  it('detects new API endpoints', () => {
    const baseline = makeProfile({
      api: {styles: ['rest'], routeCount: 1, endpoints: [
        {method: 'GET', path: '/api/users', file: 'src/routes.ts', line: 1},
      ]},
    });
    const current = makeProfile({
      api: {styles: ['rest'], routeCount: 2, endpoints: [
        {method: 'GET', path: '/api/users', file: 'src/routes.ts', line: 1},
        {method: 'POST', path: '/api/users', file: 'src/routes.ts', line: 20},
      ]},
    });

    const report = detectDrift(current, baseline);
    expect(report.changes.some(c => c.description.includes('POST /api/users'))).toBe(true);
  });

  // --- Summary ---

  it('correctly categorizes summary counts', () => {
    const baseline = makeProfile({
      auth: {
        providers: [
          {name: 'jwt', type: 'first-party', confidence: 0.9, source: 'code'},
        ],
        patterns: [],
      },
    });
    const current = makeProfile({
      // Auth provider removed (regression)
      auth: {providers: [], patterns: []},
      // Security policy added (improvement)
      docs: {
        hasReadme: false,
        hasContributing: false,
        hasSecurityPolicy: true,
        hasChangelog: false,
        hasLicense: false,
        architectureDocs: [],
        aiConfigs: [],
      },
    });

    const report: DriftReport = detectDrift(current, baseline);

    expect(report.summary.regressionCount).toBeGreaterThanOrEqual(1);
    expect(report.summary.improvementCount).toBeGreaterThanOrEqual(1);
    expect(report.summary.totalChanges).toBe(
      report.summary.regressionCount +
        report.summary.improvementCount +
        report.summary.neutralCount,
    );
  });

  // --- Database ---

  it('detects new database added', () => {
    const baseline = makeProfile();
    const current = makeProfile({
      database: {
        databases: [{type: 'postgresql', confidence: 0.9}],
      },
    });

    const report = detectDrift(current, baseline);
    expect(report.changes.some(c => c.description.includes('postgresql'))).toBe(true);
  });

  // --- PII ---

  it('detects new PII fields', () => {
    const baseline = makeProfile();
    const current = makeProfile({
      piiFields: {
        candidates: [
          {
            field: 'email',
            location: 'src/user.ts',
            classification: 'direct-identifier',
            confidence: 0.9,
          },
        ],
      },
    });

    const report = detectDrift(current, baseline);
    expect(report.changes.some(c => c.description.includes('email'))).toBe(true);
  });
});
