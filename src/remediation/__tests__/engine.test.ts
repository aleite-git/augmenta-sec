import {describe, it, expect, vi} from 'vitest';

import type {Finding} from '../../findings/types.js';
import type {SecurityProfile} from '../../discovery/types.js';
import type {LLMProvider, LLMRole} from '../../providers/llm/types.js';
import {runRemediation} from '../engine.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: 'finding-001',
    source: 'scanner',
    scanner: 'semgrep',
    category: 'injection',
    severity: 'high',
    rawSeverity: 'high',
    title: 'SQL injection in query builder',
    description: 'User input flows into raw SQL without parameterization.',
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
    securityControls: {present: [{name: 'helmet', type: 'header', present: true, confidence: 0.9, source: 'package.json'}], missing: []},
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

function makeProvider(responseContent: string): LLMProvider {
  return {
    name: 'test',
    model: 'test-model',
    capabilities: {
      maxContextTokens: 100_000,
      supportsImages: false,
      supportsStructuredOutput: false,
    },
    analyze: vi.fn().mockResolvedValue({
      content: responseContent,
      tokensUsed: {input: 100, output: 200},
      model: 'test-model',
      role: 'analysis' as LLMRole,
    }),
    analyzeStructured: vi.fn(),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runRemediation', () => {
  it('returns empty suggestions for empty findings', async () => {
    const result = await runRemediation([], makeProfile());
    expect(result.suggestions).toHaveLength(0);
    expect(result.llmEnhanced).toBe(false);
  });

  it('produces rule-based suggestions without LLM provider', async () => {
    const findings = [makeFinding()];
    const result = await runRemediation(findings, makeProfile());

    expect(result.suggestions.length).toBeGreaterThan(0);
    expect(result.llmEnhanced).toBe(false);

    // All suggestions should reference our finding
    for (const s of result.suggestions) {
      expect(s.findingId).toBe('finding-001');
    }
  });

  it('sorts by priority descending', async () => {
    const findings = [
      makeFinding({id: 'low-sev', severity: 'low', category: 'headers', title: 'missing security header'}),
      makeFinding({id: 'critical-sev', severity: 'critical', category: 'injection', title: 'sql injection in query'}),
    ];
    const result = await runRemediation(findings, makeProfile());

    expect(result.suggestions.length).toBeGreaterThan(0);
    // First suggestion should have higher or equal priority than second
    for (let i = 1; i < result.suggestions.length; i++) {
      expect(result.suggestions[i - 1].priority).toBeGreaterThanOrEqual(
        result.suggestions[i].priority,
      );
    }
  });

  it('uses LLM enhancement when provider is supplied', async () => {
    const finding = makeFinding();
    const llmResponse = JSON.stringify([
      {
        findingId: 'finding-001',
        title: 'LLM-enhanced: Use parameterized queries',
        description: 'Enhanced context-specific suggestion.',
        effort: 'low',
        priority: 99,
      },
    ]);

    const result = await runRemediation(
      [finding],
      makeProfile(),
      makeProvider(llmResponse),
    );

    expect(result.llmEnhanced).toBe(true);
  });

  it('falls back gracefully when LLM fails', async () => {
    const finding = makeFinding();
    const provider = makeProvider('');
    vi.mocked(provider.analyze).mockRejectedValue(new Error('LLM timeout'));

    const result = await runRemediation([finding], makeProfile(), provider);

    expect(result.llmEnhanced).toBe(false);
    // Should still have rule-based suggestions
    expect(result.suggestions.length).toBeGreaterThan(0);
  });

  it('handles multiple findings with different categories', async () => {
    const findings = [
      makeFinding({id: 'f1', category: 'injection', title: 'SQL injection'}),
      makeFinding({id: 'f2', category: 'secrets', title: 'Hardcoded secret found', severity: 'medium'}),
      makeFinding({id: 'f3', category: 'xss', title: 'XSS in template', severity: 'high'}),
    ];

    const result = await runRemediation(findings, makeProfile());
    expect(result.suggestions.length).toBeGreaterThan(0);

    const findingIds = new Set(result.suggestions.map((s) => s.findingId));
    expect(findingIds.size).toBeGreaterThanOrEqual(2);
  });
});
