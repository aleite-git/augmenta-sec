import {describe, it, expect} from 'vitest';
import {mergeProfiles} from '../profile-merge.js';
import type {SecurityProfile} from '../types.js';

function makeProfile(overrides: Partial<SecurityProfile> = {}): SecurityProfile {
  return {
    version: '1.0', generatedAt: '2026-01-01T00:00:00Z', target: '/test',
    project: {name: 'test-project'},
    languages: {primary: 'TypeScript', all: []},
    frameworks: {backend: [], frontend: [], fullstack: [], orm: [], testing: []},
    auth: {providers: [], patterns: []}, database: {databases: []},
    api: {styles: [], routeCount: 0, endpoints: []},
    securityControls: {present: [], missing: []},
    ci: {platform: 'none', workflows: [], securityChecks: []},
    docs: {hasReadme: false, hasContributing: false, hasSecurityPolicy: false, hasChangelog: false, hasLicense: false, architectureDocs: [], aiConfigs: []},
    trustBoundaries: {candidates: []}, piiFields: {candidates: []},
    monorepo: {isMonorepo: false, workspaces: []}, git: {hasGit: false},
    docker: {hasDocker: false, dockerfiles: [], hasCompose: false, composeFiles: [], baseImages: [], usesNonRoot: false, hasMultiStage: false, healthCheck: false},
    iac: {tools: []}, secrets: {envFiles: [], gitignoresEnv: false, findings: []},
    licenses: {dependencyLicenses: []},
    pythonEcosystem: {detected: false, packageManager: null, hasVirtualEnv: false, virtualEnvPaths: [], hasPyprojectToml: false, hasPoetryLock: false, hasPipfileLock: false, frameworks: [], securityDeps: []},
    goEcosystem: {detected: false, hasGoSum: false, directDeps: 0, indirectDeps: 0, frameworks: [], securityTools: [], hasVendor: false, hasUnsafeImports: false},
    rustEcosystem: {detected: false, hasCargoLock: false, crateCount: 0, hasUnsafeBlocks: false, unsafeFileCount: 0, frameworks: [], securityDeps: [], isWorkspace: false, workspaceMembers: []},
    jvmEcosystem: {detected: false, buildTool: null, hasSpringBoot: false, hasSpringSecurity: false, frameworks: [], securityDeps: [], hasGradleLock: false, hasMavenWrapper: false, hasGradleWrapper: false},
    ...overrides,
  };
}

describe('mergeProfiles', () => {
  it('overwrites auto-detected fields with fresh data', () => {
    const existing = makeProfile({languages: {primary: 'JavaScript', all: [{name: 'JavaScript', percentage: 100, fileCount: 5}]}});
    const fresh = makeProfile({languages: {primary: 'TypeScript', all: [{name: 'TypeScript', percentage: 100, fileCount: 10}]}});
    const {profile} = mergeProfiles(existing, fresh);
    expect(profile.languages.primary).toBe('TypeScript');
  });

  it('preserves manually annotated trust boundaries (with notes)', () => {
    const existing = makeProfile({trustBoundaries: {candidates: [{name: 'api-gw', type: 'header', confidence: 0.8, locations: ['src/gw.ts'], notes: 'Verified'}]}});
    const fresh = makeProfile({trustBoundaries: {candidates: [{name: 'api-gw', type: 'header', confidence: 0.5, locations: ['src/gw2.ts']}]}});
    const {profile, conflicts} = mergeProfiles(existing, fresh);
    expect(profile.trustBoundaries.candidates[0].notes).toBe('Verified');
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].resolution).toBe('kept-existing');
  });

  it('preserves trust boundaries with confidence 1.0', () => {
    const existing = makeProfile({trustBoundaries: {candidates: [{name: 'db', type: 'field', confidence: 1.0, locations: ['db.ts']}]}});
    const fresh = makeProfile({trustBoundaries: {candidates: [{name: 'db', type: 'field', confidence: 0.7, locations: ['db2.ts']}]}});
    const {profile} = mergeProfiles(existing, fresh);
    expect(profile.trustBoundaries.candidates[0].confidence).toBe(1.0);
  });

  it('replaces auto-detected trust boundaries with fresh data', () => {
    const existing = makeProfile({trustBoundaries: {candidates: [{name: 'auth', type: 'cookie', confidence: 0.6, locations: ['auth.ts']}]}});
    const fresh = makeProfile({trustBoundaries: {candidates: [{name: 'auth', type: 'cookie', confidence: 0.9, locations: ['auth2.ts']}]}});
    const {profile, conflicts} = mergeProfiles(existing, fresh);
    expect(profile.trustBoundaries.candidates[0].confidence).toBe(0.9);
    expect(conflicts).toHaveLength(0);
  });

  it('adds new trust boundary candidates from fresh scan', () => {
    const {profile} = mergeProfiles(makeProfile(), makeProfile({trustBoundaries: {candidates: [{name: 'new', type: 'session', confidence: 0.7, locations: ['s.ts']}]}}));
    expect(profile.trustBoundaries.candidates).toHaveLength(1);
  });

  it('removes auto-detected trust boundaries not in fresh scan', () => {
    const existing = makeProfile({trustBoundaries: {candidates: [{name: 'old', type: 'field', confidence: 0.5, locations: ['old.ts']}]}});
    const {profile} = mergeProfiles(existing, makeProfile());
    expect(profile.trustBoundaries.candidates).toHaveLength(0);
  });

  it('preserves manually classified PII fields (confidence 1.0)', () => {
    const existing = makeProfile({piiFields: {candidates: [{field: 'email', location: 'users', classification: 'direct-identifier', confidence: 1.0}]}});
    const fresh = makeProfile({piiFields: {candidates: [{field: 'email', location: 'users', classification: 'quasi-identifier', confidence: 0.7}]}});
    const {profile, conflicts} = mergeProfiles(existing, fresh);
    expect(profile.piiFields.candidates[0].classification).toBe('direct-identifier');
    expect(conflicts).toHaveLength(1);
  });

  it('replaces auto-detected PII fields with fresh data', () => {
    const existing = makeProfile({piiFields: {candidates: [{field: 'phone', location: 'contacts', classification: 'unknown', confidence: 0.5}]}});
    const fresh = makeProfile({piiFields: {candidates: [{field: 'phone', location: 'contacts', classification: 'direct-identifier', confidence: 0.9}]}});
    const {profile} = mergeProfiles(existing, fresh);
    expect(profile.piiFields.candidates[0].classification).toBe('direct-identifier');
  });

  it('preserves project description from existing profile', () => {
    const existing = makeProfile({project: {name: 'test', description: 'Manual'}});
    const fresh = makeProfile({project: {name: 'test', description: 'Auto'}});
    const {profile, conflicts} = mergeProfiles(existing, fresh);
    expect(profile.project.description).toBe('Manual');
    expect(conflicts.some((c) => c.path === 'project.description')).toBe(true);
  });

  it('uses fresh description when existing has none', () => {
    const {profile} = mergeProfiles(makeProfile({project: {name: 't'}}), makeProfile({project: {name: 't', description: 'Fresh'}}));
    expect(profile.project.description).toBe('Fresh');
  });

  it('returns empty conflicts for identical profiles', () => {
    const p = makeProfile();
    expect(mergeProfiles(p, p).conflicts).toHaveLength(0);
  });

  it('uses fresh generatedAt timestamp', () => {
    const {profile} = mergeProfiles(makeProfile({generatedAt: '2026-01-01'}), makeProfile({generatedAt: '2026-03-22'}));
    expect(profile.generatedAt).toBe('2026-03-22');
  });
});
