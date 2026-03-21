import {describe, it, expect, vi, beforeEach} from 'vitest';

// Mock the file-utils module to avoid real filesystem access
vi.mock('../../utils/file-utils.js', () => ({
  createDetectorContext: vi.fn(),
}));

// Mock the logger to suppress output during tests
vi.mock('../../utils/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock all 12 detectors
vi.mock('../detectors/index.js', () => ({
  languageDetector: {name: 'language', detect: vi.fn()},
  frameworkDetector: {name: 'framework', detect: vi.fn()},
  authDetector: {name: 'auth', detect: vi.fn()},
  databaseDetector: {name: 'database', detect: vi.fn()},
  apiDetector: {name: 'api', detect: vi.fn()},
  securityControlsDetector: {name: 'security-controls', detect: vi.fn()},
  ciDetector: {name: 'ci', detect: vi.fn()},
  docsDetector: {name: 'docs', detect: vi.fn()},
  pythonEcosystemDetector: {name: 'python-ecosystem', detect: vi.fn()},
  goEcosystemDetector: {name: 'go-ecosystem', detect: vi.fn()},
  rustEcosystemDetector: {name: 'rust-ecosystem', detect: vi.fn()},
  jvmEcosystemDetector: {name: 'jvm-ecosystem', detect: vi.fn()},
}));

/** Sets up default mock return values for all detectors. */
async function setupDefaultMocks() {
  const detectors = await import('../detectors/index.js');
  const {createDetectorContext} = await import('../../utils/file-utils.js');

  const mockCtx = {
    rootDir: '/test', findFiles: vi.fn(), readFile: vi.fn(),
    readJson: vi.fn(), readYaml: vi.fn(), fileExists: vi.fn(), grep: vi.fn(),
  };
  vi.mocked(createDetectorContext).mockReturnValue(mockCtx);

  vi.mocked(detectors.languageDetector.detect).mockResolvedValue({
    primary: 'unknown', all: [],
  });
  vi.mocked(detectors.frameworkDetector.detect).mockResolvedValue({
    backend: [], frontend: [], fullstack: [], orm: [], testing: [],
  });
  vi.mocked(detectors.authDetector.detect).mockResolvedValue({
    providers: [], patterns: [],
  });
  vi.mocked(detectors.databaseDetector.detect).mockResolvedValue({databases: []});
  vi.mocked(detectors.apiDetector.detect).mockResolvedValue({
    styles: ['unknown'], routeCount: 0, endpoints: [],
  });
  vi.mocked(detectors.securityControlsDetector.detect).mockResolvedValue({
    present: [], missing: [],
  });
  vi.mocked(detectors.ciDetector.detect).mockResolvedValue({
    platform: 'none', workflows: [], securityChecks: [],
  });
  vi.mocked(detectors.docsDetector.detect).mockResolvedValue({
    hasReadme: false, hasContributing: false, hasSecurityPolicy: false,
    hasChangelog: false, hasLicense: false, architectureDocs: [], aiConfigs: [],
  });
  vi.mocked(detectors.pythonEcosystemDetector.detect).mockResolvedValue({
    detected: false, packageManager: null, hasVirtualEnv: false, virtualEnvPaths: [],
    hasPyprojectToml: false, hasPoetryLock: false, hasPipfileLock: false,
    frameworks: [], securityDeps: [],
  });
  vi.mocked(detectors.goEcosystemDetector.detect).mockResolvedValue({
    detected: false, hasGoSum: false, directDeps: 0, indirectDeps: 0,
    frameworks: [], securityTools: [], hasVendor: false, hasUnsafeImports: false,
  });
  vi.mocked(detectors.rustEcosystemDetector.detect).mockResolvedValue({
    detected: false, hasCargoLock: false, crateCount: 0, hasUnsafeBlocks: false,
    unsafeFileCount: 0, frameworks: [], securityDeps: [],
    isWorkspace: false, workspaceMembers: [],
  });
  vi.mocked(detectors.jvmEcosystemDetector.detect).mockResolvedValue({
    detected: false, buildTool: null, hasSpringBoot: false, hasSpringSecurity: false,
    frameworks: [], securityDeps: [], hasGradleLock: false,
    hasMavenWrapper: false, hasGradleWrapper: false,
  });

  return detectors;
}

describe('runDiscovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('runs all 12 detectors in parallel and assembles a complete profile', async () => {
    const detectors = await setupDefaultMocks();

    // Override specific detectors with non-empty results
    vi.mocked(detectors.languageDetector.detect).mockResolvedValue({
      primary: 'typescript', all: [{name: 'typescript', fileCount: 10, percentage: 100}],
    });
    vi.mocked(detectors.frameworkDetector.detect).mockResolvedValue({
      backend: [{name: 'express', category: 'backend', confidence: 1.0}],
      frontend: [], fullstack: [], orm: [], testing: [],
    });
    vi.mocked(detectors.authDetector.detect).mockResolvedValue({
      providers: [{name: 'jwt', type: 'first-party', confidence: 1.0, source: 'dep'}],
      patterns: [],
    });
    vi.mocked(detectors.databaseDetector.detect).mockResolvedValue({
      databases: [{type: 'postgresql', orm: 'drizzle', confidence: 1.0}],
    });
    vi.mocked(detectors.apiDetector.detect).mockResolvedValue({
      styles: ['rest'], routeCount: 5, endpoints: [],
    });
    vi.mocked(detectors.securityControlsDetector.detect).mockResolvedValue({
      present: [{name: 'Helmet', type: 'http-headers', present: true, confidence: 1.0, source: 'dep'}],
      missing: [],
    });
    vi.mocked(detectors.ciDetector.detect).mockResolvedValue({
      platform: 'github-actions', workflows: [], securityChecks: [],
    });
    vi.mocked(detectors.docsDetector.detect).mockResolvedValue({
      hasReadme: true, hasContributing: false, hasSecurityPolicy: false,
      hasChangelog: false, hasLicense: true, architectureDocs: [], aiConfigs: [],
    });

    const {runDiscovery} = await import('../engine.js');
    const result = await runDiscovery('/test');

    // All 12 detectors should have been called
    expect(detectors.languageDetector.detect).toHaveBeenCalledTimes(1);
    expect(detectors.frameworkDetector.detect).toHaveBeenCalledTimes(1);
    expect(detectors.authDetector.detect).toHaveBeenCalledTimes(1);
    expect(detectors.databaseDetector.detect).toHaveBeenCalledTimes(1);
    expect(detectors.apiDetector.detect).toHaveBeenCalledTimes(1);
    expect(detectors.securityControlsDetector.detect).toHaveBeenCalledTimes(1);
    expect(detectors.ciDetector.detect).toHaveBeenCalledTimes(1);
    expect(detectors.docsDetector.detect).toHaveBeenCalledTimes(1);

    // Profile structure
    const profile = result.profile;
    expect(profile.version).toBe('1.0');
    expect(profile.target).toBe('/test');
    expect(profile.languages.primary).toBe('typescript');
    expect(profile.frameworks.backend[0].name).toBe('express');
    expect(profile.auth.providers[0].name).toBe('jwt');
    expect(profile.database.databases[0].type).toBe('postgresql');
    expect(profile.api.styles).toContain('rest');
    expect(profile.securityControls.present.length).toBe(1);
    expect(profile.ci.platform).toBe('github-actions');
    expect(profile.docs.hasReadme).toBe(true);
  });

  it('handles detector failures gracefully (one fails, others succeed)', async () => {
    const detectors = await setupDefaultMocks();

    // Language detector throws
    vi.mocked(detectors.languageDetector.detect).mockRejectedValue(
      new Error('Language detection failed'),
    );

    const {runDiscovery} = await import('../engine.js');
    const result = await runDiscovery('/test');

    // Should not throw -- result should be valid
    expect(result.profile).toBeDefined();
    // Fallback for failed language detector
    expect(result.profile.languages.primary).toBe('unknown');
    expect(result.profile.languages.all).toEqual([]);
    // Other detectors still succeed
    expect(result.profile.ci.platform).toBe('none');
  });

  it('returns warnings for failed detectors', async () => {
    const detectors = await setupDefaultMocks();

    vi.mocked(detectors.languageDetector.detect).mockRejectedValue(
      new Error('boom'),
    );

    const {runDiscovery} = await import('../engine.js');
    const result = await runDiscovery('/test');

    expect(result.warnings.length).toBe(1);
    expect(result.warnings[0]).toContain('language');
    expect(result.warnings[0]).toContain('boom');
  });

  it('profile has correct structure with all sections', async () => {
    await setupDefaultMocks();

    const {runDiscovery} = await import('../engine.js');
    const result = await runDiscovery('/test');
    const profile = result.profile;

    // Verify all required sections exist
    expect(profile).toHaveProperty('version');
    expect(profile).toHaveProperty('generatedAt');
    expect(profile).toHaveProperty('target');
    expect(profile).toHaveProperty('project');
    expect(profile).toHaveProperty('languages');
    expect(profile).toHaveProperty('frameworks');
    expect(profile).toHaveProperty('auth');
    expect(profile).toHaveProperty('database');
    expect(profile).toHaveProperty('api');
    expect(profile).toHaveProperty('securityControls');
    expect(profile).toHaveProperty('ci');
    expect(profile).toHaveProperty('docs');
    expect(profile).toHaveProperty('trustBoundaries');
    expect(profile).toHaveProperty('piiFields');

    // generatedAt should be an ISO string
    expect(() => new Date(profile.generatedAt)).not.toThrow();
    expect(profile.project.name).toBe('test'); // basename of /test
  });

  it('measures duration', async () => {
    await setupDefaultMocks();

    const {runDiscovery} = await import('../engine.js');
    const result = await runDiscovery('/test');

    expect(typeof result.duration).toBe('number');
    expect(result.duration).toBeGreaterThanOrEqual(0);
  });
});
