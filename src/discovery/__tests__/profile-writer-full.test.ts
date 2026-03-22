import {describe, it, expect, vi, beforeEach} from 'vitest';
import type {SecurityProfile} from '../types.js';

vi.mock('node:fs/promises', () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
}));

function createTestProfile(overrides: Partial<SecurityProfile> = {}): SecurityProfile {
  return {
    version: '1.0',
    generatedAt: '2026-03-22T12:00:00.000Z',
    target: '/test-project',
    project: {name: 'test-project'},
    languages: {primary: 'typescript', all: [{name: 'typescript', fileCount: 10, percentage: 100}]},
    frameworks: {
      backend: [{name: 'express', category: 'backend', confidence: 1.0}],
      frontend: [{name: 'react', category: 'frontend', confidence: 1.0}],
      fullstack: [],
      orm: [{name: 'drizzle', category: 'orm', confidence: 1.0}],
      testing: [{name: 'vitest', category: 'testing', confidence: 1.0}],
    },
    auth: {
      providers: [{name: 'jwt', type: 'first-party', confidence: 1.0, source: 'dep'}],
      patterns: [{type: 'middleware', files: ['src/auth.ts']}],
    },
    database: {databases: [{type: 'postgresql', orm: 'drizzle', confidence: 1.0, migrationsDir: 'drizzle'}]},
    api: {styles: ['rest'], routeCount: 0, endpoints: [], ...overrides.api},
    securityControls: {
      present: [{name: 'Helmet', type: 'http-headers', present: true, confidence: 1.0, source: 'dep'}],
      missing: [{name: 'CORS', type: 'cross-origin', present: false, confidence: 0.8, source: 'not detected'}],
    },
    ci: {platform: 'github-actions', workflows: [{name: 'CI', file: '.github/workflows/ci.yml', triggers: ['push']}], securityChecks: [{name: 'CodeQL', type: 'sast', workflow: '.github/workflows/security.yml'}]},
    docs: {hasReadme: true, hasContributing: true, hasSecurityPolicy: true, hasChangelog: true, hasLicense: true, architectureDocs: ['docs/architecture.md'], aiConfigs: ['CLAUDE.md']},
    trustBoundaries: {candidates: []},
    piiFields: {candidates: []},
    monorepo: {isMonorepo: false, workspaces: []},
    git: {hasGit: true, platform: 'github'},
    docker: {hasDocker: true, dockerfiles: ['Dockerfile'], hasCompose: true, composeFiles: ['docker-compose.yml'], baseImages: ['node:18-alpine'], usesNonRoot: true, hasMultiStage: true, healthCheck: true},
    iac: {tools: []},
    secrets: {envFiles: ['.env'], gitignoresEnv: true, findings: []},
    licenses: {dependencyLicenses: []},
    pythonEcosystem: {detected: false, packageManager: null, hasVirtualEnv: false, virtualEnvPaths: [], hasPyprojectToml: false, hasPoetryLock: false, hasPipfileLock: false, frameworks: [], securityDeps: []},
    goEcosystem: {detected: false, hasGoSum: false, directDeps: 0, indirectDeps: 0, frameworks: [], securityTools: [], hasVendor: false, hasUnsafeImports: false},
    rustEcosystem: {detected: false, hasCargoLock: false, crateCount: 0, hasUnsafeBlocks: false, unsafeFileCount: 0, frameworks: [], securityDeps: [], isWorkspace: false, workspaceMembers: []},
    jvmEcosystem: {detected: false, buildTool: null, hasSpringBoot: false, hasSpringSecurity: false, frameworks: [], securityDeps: [], hasGradleLock: false, hasMavenWrapper: false, hasGradleWrapper: false},
    ...overrides,
  };
}

describe('writeProfile — full sections', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('includes all profile sections in YAML output', async () => {
    const {writeFile} = await import('node:fs/promises');
    const {writeProfile} = await import('../profile-writer.js');
    await writeProfile(createTestProfile(), '/test-project');
    const content = vi.mocked(writeFile).mock.calls[0][1] as string;
    for (const key of ['languages:', 'frameworks:', 'auth:', 'database:', 'api:', 'securityControls:', 'ci:', 'docs:', 'monorepo:', 'git:', 'docker:', 'iac:', 'secrets:', 'licenses:', 'trustBoundaries:', 'piiFields:']) {
      expect(content).toContain(key);
    }
  });

  it('includes ecosystem sections in YAML output', async () => {
    const {writeFile} = await import('node:fs/promises');
    const {writeProfile} = await import('../profile-writer.js');
    await writeProfile(createTestProfile({pythonEcosystem: {detected: true, packageManager: 'poetry', hasVirtualEnv: true, virtualEnvPaths: ['.venv'], hasPyprojectToml: true, hasPoetryLock: true, hasPipfileLock: false, frameworks: ['django'], securityDeps: ['bandit']}}), '/test-project');
    const content = vi.mocked(writeFile).mock.calls[0][1] as string;
    expect(content).toContain('pythonEcosystem:');
    expect(content).toContain('poetry');
  });

  it('writes auth providers correctly', async () => {
    const {writeFile} = await import('node:fs/promises');
    const YAML = await import('yaml');
    const {writeProfile} = await import('../profile-writer.js');
    await writeProfile(createTestProfile(), '/test-project');
    const raw = vi.mocked(writeFile).mock.calls[0][1] as string;
    const parsed = YAML.parse(raw.split('\n').filter(l => !l.startsWith('#')).join('\n').trim());
    expect(parsed.auth.providers).toHaveLength(1);
    expect(parsed.auth.providers[0].name).toBe('jwt');
  });

  it('writes database section with migrations dir', async () => {
    const {writeFile} = await import('node:fs/promises');
    const YAML = await import('yaml');
    const {writeProfile} = await import('../profile-writer.js');
    await writeProfile(createTestProfile(), '/test-project');
    const parsed = YAML.parse((vi.mocked(writeFile).mock.calls[0][1] as string).split('\n').filter(l => !l.startsWith('#')).join('\n').trim());
    expect(parsed.database.databases[0].type).toBe('postgresql');
    expect(parsed.database.databases[0].migrationsDir).toBe('drizzle');
  });

  it('writes security controls present and missing', async () => {
    const {writeFile} = await import('node:fs/promises');
    const YAML = await import('yaml');
    const {writeProfile} = await import('../profile-writer.js');
    await writeProfile(createTestProfile(), '/test-project');
    const parsed = YAML.parse((vi.mocked(writeFile).mock.calls[0][1] as string).split('\n').filter(l => !l.startsWith('#')).join('\n').trim());
    expect(parsed.securityControls.present).toHaveLength(1);
    expect(parsed.securityControls.missing).toHaveLength(1);
  });

  it('writes CI section with workflows', async () => {
    const {writeFile} = await import('node:fs/promises');
    const YAML = await import('yaml');
    const {writeProfile} = await import('../profile-writer.js');
    await writeProfile(createTestProfile(), '/test-project');
    const parsed = YAML.parse((vi.mocked(writeFile).mock.calls[0][1] as string).split('\n').filter(l => !l.startsWith('#')).join('\n').trim());
    expect(parsed.ci.platform).toBe('github-actions');
    expect(parsed.ci.workflows).toHaveLength(1);
  });

  it('writes docker section with all fields', async () => {
    const {writeFile} = await import('node:fs/promises');
    const YAML = await import('yaml');
    const {writeProfile} = await import('../profile-writer.js');
    await writeProfile(createTestProfile(), '/test-project');
    const parsed = YAML.parse((vi.mocked(writeFile).mock.calls[0][1] as string).split('\n').filter(l => !l.startsWith('#')).join('\n').trim());
    expect(parsed.docker.hasDocker).toBe(true);
    expect(parsed.docker.usesNonRoot).toBe(true);
    expect(parsed.docker.hasMultiStage).toBe(true);
  });

  it('writes docs section with boolean flags', async () => {
    const {writeFile} = await import('node:fs/promises');
    const YAML = await import('yaml');
    const {writeProfile} = await import('../profile-writer.js');
    await writeProfile(createTestProfile(), '/test-project');
    const parsed = YAML.parse((vi.mocked(writeFile).mock.calls[0][1] as string).split('\n').filter(l => !l.startsWith('#')).join('\n').trim());
    expect(parsed.docs.hasReadme).toBe(true);
    expect(parsed.docs.hasContributing).toBe(true);
    expect(parsed.docs.aiConfigs).toContain('CLAUDE.md');
  });

  it('writes frameworks in all categories', async () => {
    const {writeFile} = await import('node:fs/promises');
    const YAML = await import('yaml');
    const {writeProfile} = await import('../profile-writer.js');
    await writeProfile(createTestProfile(), '/test-project');
    const parsed = YAML.parse((vi.mocked(writeFile).mock.calls[0][1] as string).split('\n').filter(l => !l.startsWith('#')).join('\n').trim());
    expect(parsed.frameworks.backend[0].name).toBe('express');
    expect(parsed.frameworks.frontend[0].name).toBe('react');
    expect(parsed.frameworks.orm[0].name).toBe('drizzle');
    expect(parsed.frameworks.testing[0].name).toBe('vitest');
  });

  it('writes secrets section', async () => {
    const {writeFile} = await import('node:fs/promises');
    const YAML = await import('yaml');
    const {writeProfile} = await import('../profile-writer.js');
    await writeProfile(createTestProfile(), '/test-project');
    const parsed = YAML.parse((vi.mocked(writeFile).mock.calls[0][1] as string).split('\n').filter(l => !l.startsWith('#')).join('\n').trim());
    expect(parsed.secrets.envFiles).toContain('.env');
    expect(parsed.secrets.gitignoresEnv).toBe(true);
  });

  it('writes to correct path with custom target directory', async () => {
    const {writeFile} = await import('node:fs/promises');
    const {writeProfile} = await import('../profile-writer.js');
    const filePath = await writeProfile(createTestProfile(), '/custom/path');
    expect(filePath).toBe('/custom/path/.augmenta-sec/profile.yaml');
    expect(vi.mocked(writeFile).mock.calls[0][0]).toBe('/custom/path/.augmenta-sec/profile.yaml');
  });

  it('endpoint count in endpoints.yaml matches routeCount', async () => {
    const {writeFile} = await import('node:fs/promises');
    const YAML = await import('yaml');
    const {writeProfile} = await import('../profile-writer.js');
    const endpoints = [
      {method: 'GET', path: '/api/users', file: 'routes.ts', line: 1},
      {method: 'POST', path: '/api/users', file: 'routes.ts', line: 5},
      {method: 'DELETE', path: '/api/users/:id', file: 'routes.ts', line: 10},
    ];
    await writeProfile(createTestProfile({api: {styles: ['rest'], routeCount: 3, endpoints}}), '/test-project');
    const endpointsRaw = vi.mocked(writeFile).mock.calls[1][1] as string;
    const parsed = YAML.parse(endpointsRaw.split('\n').filter(l => !l.startsWith('#')).join('\n').trim());
    expect(parsed.routeCount).toBe(3);
    expect(parsed.endpoints).toHaveLength(3);
  });

  it('writes UTF-8 encoded content', async () => {
    const {writeFile} = await import('node:fs/promises');
    const {writeProfile} = await import('../profile-writer.js');
    await writeProfile(createTestProfile(), '/test-project');
    expect(vi.mocked(writeFile).mock.calls[0][2]).toBe('utf-8');
  });
});
