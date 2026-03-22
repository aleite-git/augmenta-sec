import {describe, it, expect} from 'vitest';

import type {SecurityProfile} from '../../discovery/types.js';
import type {RemediationSuggestion} from '../engine.js';
import {estimateEffort} from '../effort.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSuggestion(overrides: Partial<RemediationSuggestion> = {}): RemediationSuggestion {
  return {
    findingId: 'f-1',
    title: 'Fix the thing',
    description: 'A remediation suggestion.',
    effort: 'medium',
    priority: 75,
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
    auth: {providers: [], patterns: []},
    database: {databases: []},
    api: {styles: ['REST'], routeCount: 5, endpoints: []},
    securityControls: {present: [], missing: []},
    ci: {platform: 'github-actions', workflows: [], securityChecks: []},
    docs: {hasReadme: true, hasContributing: false, hasSecurityPolicy: false, hasChangelog: false, hasLicense: true, architectureDocs: [], aiConfigs: []},
    trustBoundaries: {candidates: []},
    piiFields: {candidates: []},
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

describe('estimateEffort', () => {
  it('returns an effort estimate with level, hours, and factors', () => {
    const result = estimateEffort(makeSuggestion(), makeProfile());
    expect(result).toHaveProperty('level');
    expect(result).toHaveProperty('estimatedHours');
    expect(result).toHaveProperty('factors');
    expect(['low', 'medium', 'high']).toContain(result.level);
    expect(result.estimatedHours).toBeGreaterThan(0);
    expect(result.factors.length).toBeGreaterThan(0);
  });

  it('low effort suggestion returns low hours', () => {
    const result = estimateEffort(makeSuggestion({effort: 'low'}), makeProfile());
    expect(result.estimatedHours).toBeLessThanOrEqual(4);
  });

  it('high effort suggestion returns high hours', () => {
    const result = estimateEffort(makeSuggestion({effort: 'high'}), makeProfile());
    expect(result.estimatedHours).toBeGreaterThan(4);
  });

  it('multi-language codebase increases effort', () => {
    const singleLang = makeProfile({
      languages: {
        primary: 'TypeScript',
        all: [{name: 'TypeScript', percentage: 100, fileCount: 50}],
      },
    });
    const multiLang = makeProfile({
      languages: {
        primary: 'TypeScript',
        all: [
          {name: 'TypeScript', percentage: 40, fileCount: 50},
          {name: 'Python', percentage: 30, fileCount: 30},
          {name: 'Go', percentage: 20, fileCount: 20},
          {name: 'Rust', percentage: 10, fileCount: 10},
        ],
      },
    });

    const s = makeSuggestion({effort: 'medium'});
    const single = estimateEffort(s, singleLang);
    const multi = estimateEffort(s, multiLang);

    expect(multi.estimatedHours).toBeGreaterThan(single.estimatedHours);
  });

  it('monorepo increases effort', () => {
    const flat = makeProfile({monorepo: {isMonorepo: false, workspaces: []}});
    const mono = makeProfile({
      monorepo: {
        isMonorepo: true,
        workspaces: [
          {name: 'api', path: 'packages/api', type: 'app'},
          {name: 'web', path: 'packages/web', type: 'app'},
          {name: 'shared', path: 'packages/shared', type: 'library'},
        ],
      },
    });

    const s = makeSuggestion({effort: 'medium'});
    const flatResult = estimateEffort(s, flat);
    const monoResult = estimateEffort(s, mono);

    expect(monoResult.estimatedHours).toBeGreaterThan(flatResult.estimatedHours);
  });

  it('existing security controls reduce effort', () => {
    const noControls = makeProfile({
      securityControls: {present: [], missing: []},
    });
    const withControls = makeProfile({
      securityControls: {
        present: [
          {name: 'helmet', type: 'header', present: true, confidence: 0.9, source: 'package.json'},
          {name: 'cors', type: 'header', present: true, confidence: 0.9, source: 'package.json'},
          {name: 'csrf', type: 'middleware', present: true, confidence: 0.9, source: 'package.json'},
          {name: 'rate-limit', type: 'middleware', present: true, confidence: 0.9, source: 'package.json'},
          {name: 'auth', type: 'middleware', present: true, confidence: 0.9, source: 'src/auth.ts'},
        ],
        missing: [],
      },
    });

    const s = makeSuggestion({effort: 'medium'});
    const withoutResult = estimateEffort(s, noControls);
    const withResult = estimateEffort(s, withControls);

    expect(withResult.estimatedHours).toBeLessThan(withoutResult.estimatedHours);
  });

  it('CI security checks reduce effort', () => {
    const noCI = makeProfile({
      ci: {platform: 'github-actions', workflows: [], securityChecks: []},
    });
    const withCI = makeProfile({
      ci: {
        platform: 'github-actions',
        workflows: [],
        securityChecks: [
          {name: 'sast', type: 'sast', workflow: 'ci.yml'},
          {name: 'sca', type: 'sca', workflow: 'ci.yml'},
          {name: 'container', type: 'container', workflow: 'ci.yml'},
        ],
      },
    });

    const s = makeSuggestion({effort: 'medium'});
    const noResult = estimateEffort(s, noCI);
    const withResult = estimateEffort(s, withCI);

    expect(withResult.estimatedHours).toBeLessThan(noResult.estimatedHours);
  });

  it('includes critical priority factor for high-priority suggestions', () => {
    const result = estimateEffort(
      makeSuggestion({priority: 95}),
      makeProfile(),
    );
    expect(result.factors).toContain(
      'Critical priority — immediate action recommended',
    );
  });

  it('does not include critical priority factor for low-priority suggestions', () => {
    const result = estimateEffort(
      makeSuggestion({priority: 50}),
      makeProfile(),
    );
    expect(
      result.factors.includes('Critical priority — immediate action recommended'),
    ).toBe(false);
  });

  it('classifies final level based on computed hours', () => {
    // Low base + single language + no monorepo = should stay low
    const lowResult = estimateEffort(
      makeSuggestion({effort: 'low'}),
      makeProfile(),
    );
    expect(lowResult.level).toBe('low');

    // High base + multi-lang + monorepo = should be high
    const bigProfile = makeProfile({
      languages: {
        primary: 'TypeScript',
        all: [
          {name: 'TypeScript', percentage: 25, fileCount: 50},
          {name: 'Python', percentage: 25, fileCount: 50},
          {name: 'Go', percentage: 25, fileCount: 50},
          {name: 'Rust', percentage: 25, fileCount: 50},
        ],
      },
      monorepo: {
        isMonorepo: true,
        workspaces: Array.from({length: 10}, (_, i) => ({
          name: `pkg-${i}`,
          path: `packages/pkg-${i}`,
          type: 'package' as const,
        })),
      },
    });
    const highResult = estimateEffort(
      makeSuggestion({effort: 'high'}),
      bigProfile,
    );
    expect(highResult.level).toBe('high');
  });
});
