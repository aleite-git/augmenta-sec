import {describe, it, expect, vi, beforeEach} from 'vitest';
import type {SecurityProfile} from '../types.js';

// Mock fs/promises
vi.mock('node:fs/promises', () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
}));

function createTestProfile(overrides: Partial<SecurityProfile> = {}): SecurityProfile {
  return {
    version: '1.0',
    generatedAt: '2026-03-21T12:00:00.000Z',
    target: '/test-project',
    project: {name: 'test-project'},
    languages: {primary: 'typescript', all: [{name: 'typescript', fileCount: 10, percentage: 100}]},
    frameworks: {
      backend: [{name: 'express', category: 'backend', confidence: 1.0}],
      frontend: [], fullstack: [], orm: [], testing: [],
    },
    auth: {providers: [], patterns: []},
    database: {databases: []},
    api: {styles: ['rest'], routeCount: 0, endpoints: [], ...overrides.api},
    securityControls: {present: [], missing: []},
    ci: {platform: 'github-actions', workflows: [], securityChecks: []},
    docs: {
      hasReadme: true, hasContributing: false, hasSecurityPolicy: false,
      hasChangelog: false, hasLicense: false, architectureDocs: [], aiConfigs: [],
    },
    trustBoundaries: {candidates: []},
    piiFields: {candidates: []},
    monorepo: {isMonorepo: false, workspaces: []},
    git: {hasGit: true, platform: 'github'},
    docker: {
      hasDocker: false, dockerfiles: [], hasCompose: false,
      composeFiles: [], baseImages: [], usesNonRoot: false,
      hasMultiStage: false, healthCheck: false,
    },
    iac: {tools: []},
    secrets: {envFiles: [], gitignoresEnv: false, findings: []},
    licenses: {dependencyLicenses: []},
    ...overrides,
  };
}

describe('writeProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('writes profile.yaml to .augmenta-sec directory', async () => {
    const {writeFile, mkdir} = await import('node:fs/promises');
    const {writeProfile} = await import('../profile-writer.js');
    const profile = createTestProfile();

    const filePath = await writeProfile(profile, '/test-project');

    expect(filePath).toBe('/test-project/.augmenta-sec/profile.yaml');
    expect(writeFile).toHaveBeenCalled();
    // First call should be the profile.yaml write
    const writeCall = vi.mocked(writeFile).mock.calls[0];
    expect(writeCall[0]).toBe('/test-project/.augmenta-sec/profile.yaml');
  });

  it('creates .augmenta-sec directory if not exists', async () => {
    const {mkdir} = await import('node:fs/promises');
    const {writeProfile} = await import('../profile-writer.js');
    const profile = createTestProfile();

    await writeProfile(profile, '/test-project');

    expect(mkdir).toHaveBeenCalledWith('/test-project/.augmenta-sec', {recursive: true});
  });

  it('writes valid and parseable YAML', async () => {
    const {writeFile} = await import('node:fs/promises');
    const YAML = await import('yaml');
    const {writeProfile} = await import('../profile-writer.js');
    const profile = createTestProfile();

    await writeProfile(profile, '/test-project');

    const writeCall = vi.mocked(writeFile).mock.calls[0];
    const content = writeCall[1] as string;

    // Strip header comments for YAML parsing
    const yamlContent = content
      .split('\n')
      .filter(line => !line.startsWith('#'))
      .join('\n')
      .trim();

    // Should be valid YAML
    const parsed = YAML.parse(yamlContent);
    expect(parsed).toBeDefined();
    expect(parsed.version).toBe('1.0');
    expect(parsed.target).toBe('/test-project');
    expect(parsed.languages.primary).toBe('typescript');
  });

  it('writes separate endpoints.yaml when endpoints exist', async () => {
    const {writeFile} = await import('node:fs/promises');
    const {writeProfile} = await import('../profile-writer.js');

    const profile = createTestProfile({
      api: {
        styles: ['rest'],
        routeCount: 2,
        endpoints: [
          {method: 'GET', path: '/api/users', file: 'src/routes.ts', line: 10},
          {method: 'POST', path: '/api/users', file: 'src/routes.ts', line: 15},
        ],
      },
    });

    await writeProfile(profile, '/test-project');

    // Should write both profile.yaml and endpoints.yaml
    expect(writeFile).toHaveBeenCalledTimes(2);

    const endpointsCall = vi.mocked(writeFile).mock.calls[1];
    expect(endpointsCall[0]).toBe('/test-project/.augmenta-sec/endpoints.yaml');

    const endpointsContent = endpointsCall[1] as string;
    expect(endpointsContent).toContain('Detected API Endpoints');
  });

  it('does not write endpoints.yaml when no endpoints', async () => {
    const {writeFile} = await import('node:fs/promises');
    const {writeProfile} = await import('../profile-writer.js');

    const profile = createTestProfile({
      api: {styles: ['unknown'], routeCount: 0, endpoints: []},
    });

    await writeProfile(profile, '/test-project');

    // Should only write profile.yaml
    expect(writeFile).toHaveBeenCalledTimes(1);
  });

  it('includes header comments in output', async () => {
    const {writeFile} = await import('node:fs/promises');
    const {writeProfile} = await import('../profile-writer.js');
    const profile = createTestProfile();

    await writeProfile(profile, '/test-project');

    const writeCall = vi.mocked(writeFile).mock.calls[0];
    const content = writeCall[1] as string;

    expect(content).toContain('# AugmentaSec Security Profile');
    expect(content).toContain('# Generated:');
    expect(content).toContain('# Run `asec scan`');
    expect(content).toContain('[auto]');
    expect(content).toContain('[review]');
    expect(content).toContain('[llm]');
  });

  it('replaces endpoints array with summary text in profile YAML', async () => {
    const {writeFile} = await import('node:fs/promises');
    const YAML = await import('yaml');
    const {writeProfile} = await import('../profile-writer.js');

    const profile = createTestProfile({
      api: {
        styles: ['rest'],
        routeCount: 3,
        endpoints: [
          {method: 'GET', path: '/a', file: 'a.ts', line: 1},
          {method: 'POST', path: '/b', file: 'b.ts', line: 2},
          {method: 'PUT', path: '/c', file: 'c.ts', line: 3},
        ],
      },
    });

    await writeProfile(profile, '/test-project');

    const writeCall = vi.mocked(writeFile).mock.calls[0];
    const content = writeCall[1] as string;
    const yamlContent = content
      .split('\n')
      .filter(line => !line.startsWith('#'))
      .join('\n')
      .trim();
    const parsed = YAML.parse(yamlContent);

    // Endpoints in profile.yaml should be a summary string, not the full array
    expect(typeof parsed.api.endpoints).toBe('string');
    expect(parsed.api.endpoints).toContain('3 endpoints detected');
    expect(parsed.api.endpoints).toContain('endpoints.yaml');
  });
});
