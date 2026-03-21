/**
 * Tests for trust boundary detection (ASEC-012).
 */

import {describe, it, expect, vi} from 'vitest';
import type {SecurityProfile} from '../../discovery/types.js';
import type {LLMProvider, LLMCapabilities} from '../../providers/llm/types.js';
import {
  detectStaticBoundaries,
  detectTrustBoundaries,
} from '../trust-boundaries.js';

// ---------------------------------------------------------------------------
// Fixtures
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
    frameworks: {backend: [], frontend: [], fullstack: [], orm: [], testing: []},
    auth: {providers: [], patterns: []},
    database: {databases: []},
    api: {styles: [], routeCount: 0, endpoints: []},
    securityControls: {present: [], missing: []},
    ci: {platform: 'none', workflows: [], securityChecks: []},
    docs: {hasReadme: false, hasContributing: false, hasSecurityPolicy: false, hasChangelog: false, hasLicense: false, architectureDocs: [], aiConfigs: []},
    trustBoundaries: {candidates: []},
    piiFields: {candidates: []},
    monorepo: {isMonorepo: false, workspaces: []},
    git: {hasGit: false},
    docker: {hasDocker: false, dockerfiles: [], hasCompose: false, composeFiles: [], baseImages: [], usesNonRoot: false, hasMultiStage: false, healthCheck: false},
    iac: {tools: []},
    secrets: {envFiles: [], gitignoresEnv: false, findings: []},
    licenses: {dependencyLicenses: []},
    pythonEcosystem: {detected: false, packageManager: null, hasVirtualEnv: false, virtualEnvPaths: [], hasPyprojectToml: false, hasPoetryLock: false, hasPipfileLock: false, frameworks: [], securityDeps: []},
    goEcosystem: {detected: false, hasGoSum: false, directDeps: 0, indirectDeps: 0, frameworks: [], securityTools: [], hasVendor: false, hasUnsafeImports: false},
    rustEcosystem: {detected: false, hasCargoLock: false, crateCount: 0, hasUnsafeBlocks: false, unsafeFileCount: 0, frameworks: [], securityDeps: [], isWorkspace: false, workspaceMembers: []},
    jvmEcosystem: {detected: false, buildTool: null, hasSpringBoot: false, hasSpringSecurity: false, frameworks: [], securityDeps: [], hasGradleLock: false, hasMavenWrapper: false, hasGradleWrapper: false},
    ...overrides,
  };
}

function makeMockProvider(): LLMProvider {
  const caps: LLMCapabilities = {maxContextTokens: 100000, supportsImages: false, supportsStructuredOutput: true};
  return {
    name: 'mock',
    model: 'mock-model',
    capabilities: caps,
    analyze: vi.fn().mockResolvedValue({content: '{}', tokensUsed: {input: 100, output: 50}, model: 'mock-model', role: 'analysis' as const}),
    analyzeStructured: vi.fn().mockResolvedValue({boundaries: [], summary: 'No additional boundaries found'}),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('detectStaticBoundaries', () => {
  it('returns empty array for minimal profile', () => {
    const profile = makeProfile();
    const boundaries = detectStaticBoundaries(profile);
    expect(boundaries).toEqual([]);
  });

  it('detects auth middleware boundaries', () => {
    const profile = makeProfile({
      auth: {
        providers: [{name: 'jwt', type: 'first-party', confidence: 0.9, source: 'code'}],
        patterns: [{type: 'middleware', files: ['src/middleware/auth.ts']}],
      },
    });
    const boundaries = detectStaticBoundaries(profile);
    expect(boundaries.length).toBeGreaterThanOrEqual(1);
    const authBoundary = boundaries.find(b => b.type === 'auth-middleware');
    expect(authBoundary).toBeDefined();
    expect(authBoundary!.crossesFrom).toBe('untrusted-client');
    expect(authBoundary!.crossesTo).toBe('authenticated-zone');
  });

  it('detects API entry point boundaries', () => {
    const profile = makeProfile({
      api: {styles: ['rest'], routeCount: 10, endpoints: [{method: 'GET', path: '/api/users', file: 'src/routes.ts', line: 1}]},
    });
    const boundaries = detectStaticBoundaries(profile);
    const apiBoundary = boundaries.find(b => b.type === 'api-gateway');
    expect(apiBoundary).toBeDefined();
    expect(apiBoundary!.description).toContain('10 API routes');
  });

  it('detects database data flow boundaries', () => {
    const profile = makeProfile({
      database: {databases: [{type: 'postgresql', orm: 'drizzle', confidence: 0.9}]},
    });
    const boundaries = detectStaticBoundaries(profile);
    const dbBoundary = boundaries.find(b => b.type === 'data-flow');
    expect(dbBoundary).toBeDefined();
    expect(dbBoundary!.name).toContain('postgresql');
  });

  it('detects Docker container boundaries', () => {
    const profile = makeProfile({
      docker: {hasDocker: true, dockerfiles: ['Dockerfile'], hasCompose: false, composeFiles: [], baseImages: ['node:18-alpine'], usesNonRoot: true, hasMultiStage: true, healthCheck: true},
    });
    const boundaries = detectStaticBoundaries(profile);
    const dockerBoundary = boundaries.find(b => b.type === 'network-boundary');
    expect(dockerBoundary).toBeDefined();
  });

  it('includes existing trust boundary candidates from profile', () => {
    const profile = makeProfile({
      trustBoundaries: {candidates: [{name: 'Authorization header', type: 'header', confidence: 0.8, locations: ['src/middleware/auth.ts']}]},
    });
    const boundaries = detectStaticBoundaries(profile);
    expect(boundaries.some(b => b.name === 'Authorization header')).toBe(true);
  });

  it('detects guard-type auth patterns', () => {
    const profile = makeProfile({
      auth: {providers: [], patterns: [{type: 'guard', files: ['src/guards/roles.guard.ts']}]},
    });
    const boundaries = detectStaticBoundaries(profile);
    expect(boundaries.some(b => b.type === 'auth-middleware')).toBe(true);
  });
});

describe('detectTrustBoundaries', () => {
  it('merges static and LLM boundaries', async () => {
    const profile = makeProfile({
      api: {styles: ['rest'], routeCount: 5, endpoints: [{method: 'GET', path: '/api/data', file: 'src/api.ts', line: 1}]},
    });
    const provider = makeMockProvider();
    (provider.analyzeStructured as ReturnType<typeof vi.fn>).mockResolvedValue({
      boundaries: [{name: 'Redis cache', type: 'service-boundary', description: 'Cache layer boundary', confidence: 0.9, locations: ['src/cache.ts'], crossesFrom: 'app', crossesTo: 'cache'}],
      summary: 'Found cache boundary',
    });
    const result = await detectTrustBoundaries(profile, provider);
    expect(result.candidates.length).toBeGreaterThanOrEqual(2);
    expect(result.candidates.some(c => c.name === 'Redis cache')).toBe(true);
  });

  it('falls back to static boundaries when LLM fails', async () => {
    const profile = makeProfile({
      auth: {providers: [{name: 'oauth', type: 'third-party', confidence: 0.8, source: 'code'}], patterns: [{type: 'middleware', files: ['src/auth.ts']}]},
    });
    const provider = makeMockProvider();
    (provider.analyzeStructured as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('LLM unavailable'));
    const result = await detectTrustBoundaries(profile, provider);
    expect(result.candidates.length).toBeGreaterThanOrEqual(1);
  });

  it('deduplicates boundaries by name', async () => {
    const profile = makeProfile({
      api: {styles: ['rest'], routeCount: 3, endpoints: [{method: 'GET', path: '/api/x', file: 'src/r.ts', line: 1}]},
    });
    const provider = makeMockProvider();
    (provider.analyzeStructured as ReturnType<typeof vi.fn>).mockResolvedValue({
      boundaries: [{name: 'API entry point', type: 'api-gateway', description: 'Duplicate', confidence: 0.9, locations: ['src/r.ts'], crossesFrom: 'net', crossesTo: 'app'}],
      summary: 'Found duplicate',
    });
    const result = await detectTrustBoundaries(profile, provider);
    const apiCount = result.candidates.filter(c => c.name.toLowerCase().includes('api entry point')).length;
    expect(apiCount).toBe(1);
  });

  it('caps LLM boundary confidence at 0.7', async () => {
    const profile = makeProfile();
    const provider = makeMockProvider();
    (provider.analyzeStructured as ReturnType<typeof vi.fn>).mockResolvedValue({
      boundaries: [{name: 'High confidence boundary', type: 'service-boundary', description: 'Test', confidence: 0.95, locations: ['src/svc.ts'], crossesFrom: 'a', crossesTo: 'b'}],
      summary: 'Test',
    });
    const result = await detectTrustBoundaries(profile, provider);
    const llmBoundary = result.candidates.find(c => c.name === 'High confidence boundary');
    expect(llmBoundary).toBeDefined();
    expect(llmBoundary!.confidence).toBeLessThanOrEqual(0.7);
  });
});
