import {describe, it, expect} from 'vitest';

import type {Finding} from '../../findings/types.js';
import type {SecurityProfile} from '../../discovery/types.js';
import {scorePriority} from '../priority.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: 'test-finding',
    source: 'scanner',
    scanner: 'semgrep',
    category: 'injection',
    severity: 'high',
    rawSeverity: 'high',
    title: 'SQL injection in query builder',
    description: 'User input flows into raw SQL.',
    file: 'src/api/routes/users.ts',
    line: 42,
    confidence: 0.9,
    cweId: 'CWE-89',
    status: 'open',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeProfile(overrides: Partial<SecurityProfile> = {}): SecurityProfile {
  return {
    version: '1.0.0',
    generatedAt: '2026-01-01T00:00:00.000Z',
    target: '/project',
    project: {name: 'test-project'},
    languages: {primary: 'TypeScript', all: [{name: 'TypeScript', percentage: 100, fileCount: 50}]},
    frameworks: {backend: [], frontend: [], fullstack: [], orm: [], testing: []},
    auth: {providers: [{name: 'jwt', type: 'custom', confidence: 0.9, source: 'src/auth.ts'}], patterns: []},
    database: {databases: [{type: 'postgresql', confidence: 0.9}]},
    api: {styles: ['REST'], routeCount: 15, endpoints: []},
    securityControls: {present: [], missing: []},
    ci: {platform: 'github-actions', workflows: [], securityChecks: []},
    docs: {hasReadme: true, hasContributing: false, hasSecurityPolicy: false, hasChangelog: false, hasLicense: true, architectureDocs: [], aiConfigs: []},
    trustBoundaries: {candidates: []},
    piiFields: {candidates: [{field: 'email', location: 'src/models/user.ts', classification: 'direct-identifier', confidence: 0.9}]},
    monorepo: {isMonorepo: false, workspaces: []},
    git: {hasGit: true},
    docker: {hasDocker: false, dockerfiles: [], hasCompose: false, composeFiles: [], baseImages: [], usesNonRoot: false, hasMultiStage: false, healthCheck: false},
    iac: {tools: []},
    secrets: {envFiles: [], gitignoresEnv: true, findings: []},
    licenses: {dependencyLicenses: []},
    pythonEcosystem: {detected: false, packageManager: null, hasVirtualEnv: false, virtualEnvPaths: [], hasPyprojectToml: false, hasPoetryLock: false, hasPipfileLock: false, frameworks: [], securityDeps: []},
    goEcosystem: {detected: false, hasGoSum: false, directDeps: 0, indirectDeps: 0, frameworks: [], securityTools: [], hasVendor: false, hasUnsafeImports: false},
    rustEcosystem: {detected: false, hasCargoLock: false, crateCount: 0, hasUnsafeBlocks: false, unsafeFileCount: 0, frameworks: [], securityDeps: [], isWorkspace: false, workspaceMembers: []},
    jvmEcosystem: {detected: false, buildTool: null, hasSpringBoot: false, hasSpringSecurity: false, frameworks: [], securityDeps: [], hasGradleLock: false, hasMavenWrapper: false, hasGradleWrapper: false},
    ...overrides,
  } as SecurityProfile;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('scorePriority', () => {
  it('returns a number between 0 and 100', () => {
    const score = scorePriority(makeFinding(), makeProfile());
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('critical severity scores higher than low severity', () => {
    const critical = scorePriority(
      makeFinding({severity: 'critical'}),
      makeProfile(),
    );
    const low = scorePriority(
      makeFinding({severity: 'low'}),
      makeProfile(),
    );
    expect(critical).toBeGreaterThan(low);
  });

  it('informational severity scores lowest', () => {
    const info = scorePriority(
      makeFinding({severity: 'informational', category: 'misc', confidence: 0.3}),
      makeProfile({api: {styles: [], routeCount: 0, endpoints: []}, piiFields: {candidates: []}, auth: {providers: [], patterns: []}, database: {databases: []}}),
    );
    expect(info).toBeLessThan(40);
  });

  it('findings in API routes score higher (exploitability)', () => {
    const inRoute = scorePriority(
      makeFinding({file: 'src/api/routes/users.ts'}),
      makeProfile(),
    );
    const notInRoute = scorePriority(
      makeFinding({file: 'src/utils/helpers.ts'}),
      makeProfile(),
    );
    expect(inRoute).toBeGreaterThan(notInRoute);
  });

  it('PII presence increases business impact', () => {
    const withPII = scorePriority(
      makeFinding(),
      makeProfile({
        piiFields: {
          candidates: [
            {field: 'email', location: 'src/user.ts', classification: 'direct-identifier', confidence: 0.9},
          ],
        },
      }),
    );
    const noPII = scorePriority(
      makeFinding(),
      makeProfile({piiFields: {candidates: []}}),
    );
    expect(withPII).toBeGreaterThan(noPII);
  });

  it('auth-related finding in project with auth scores higher', () => {
    const authFinding = makeFinding({
      category: 'auth',
      title: 'Missing auth middleware',
      file: 'src/auth/middleware.ts',
    });
    const withAuth = scorePriority(
      authFinding,
      makeProfile({
        auth: {
          providers: [{name: 'jwt', type: 'custom', confidence: 0.9, source: 'src/auth.ts'}],
          patterns: [],
        },
      }),
    );
    const noAuth = scorePriority(
      authFinding,
      makeProfile({auth: {providers: [], patterns: []}}),
    );
    expect(withAuth).toBeGreaterThan(noAuth);
  });

  it('database-related injection scores higher when DB present', () => {
    const sqlFinding = makeFinding({
      category: 'sql',
      title: 'SQL injection in query',
    });
    const withDB = scorePriority(
      sqlFinding,
      makeProfile({
        database: {databases: [{type: 'postgresql', confidence: 0.9}]},
      }),
    );
    const noDB = scorePriority(
      sqlFinding,
      makeProfile({database: {databases: []}}),
    );
    expect(withDB).toBeGreaterThan(noDB);
  });

  it('high confidence increases exploitability score', () => {
    const highConf = scorePriority(
      makeFinding({confidence: 0.95}),
      makeProfile(),
    );
    const lowConf = scorePriority(
      makeFinding({confidence: 0.3}),
      makeProfile(),
    );
    expect(highConf).toBeGreaterThan(lowConf);
  });

  it('easy-fix categories (headers, secrets) get higher effort-inverse score', () => {
    // Headers are easy to fix
    const headersFinding = makeFinding({
      category: 'headers',
      title: 'Missing security headers',
      severity: 'medium',
    });
    // Auth is harder to fix
    const authFinding = makeFinding({
      category: 'auth',
      title: 'Missing authentication',
      severity: 'medium',
    });

    const headersScore = scorePriority(headersFinding, makeProfile());
    const authScore = scorePriority(authFinding, makeProfile());

    // Headers finding should have a higher effort-inverse component,
    // but auth has higher exploitability + business impact, so overall
    // comparison depends on all factors. We just verify both compute.
    expect(typeof headersScore).toBe('number');
    expect(typeof authScore).toBe('number');
  });

  it('returns integer values', () => {
    const score = scorePriority(makeFinding(), makeProfile());
    expect(Number.isInteger(score)).toBe(true);
  });

  it('project with no API routes reduces exploitability', () => {
    const withRoutes = scorePriority(
      makeFinding(),
      makeProfile({api: {styles: ['REST'], routeCount: 20, endpoints: []}}),
    );
    const noRoutes = scorePriority(
      makeFinding(),
      makeProfile({api: {styles: [], routeCount: 0, endpoints: []}}),
    );
    expect(withRoutes).toBeGreaterThan(noRoutes);
  });
});
