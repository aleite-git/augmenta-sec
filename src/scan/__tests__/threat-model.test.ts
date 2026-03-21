/**
 * Tests for threat model generation (ASEC-014).
 */

import {describe, it, expect, vi} from 'vitest';
import type {SecurityProfile} from '../../discovery/types.js';
import type {Finding} from '../../findings/types.js';
import type {LLMProvider, LLMCapabilities} from '../../providers/llm/types.js';
import {
  inferStrideCategories,
  generateStaticThreats,
  computeRiskLevel,
  buildRiskMatrix,
  generateThreatModel,
} from '../threat-model.js';

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

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: 'test-finding-1',
    source: 'scanner',
    scanner: 'semgrep',
    category: 'injection',
    severity: 'high',
    rawSeverity: 'high',
    title: 'SQL injection detected',
    description: 'User input flows into raw SQL query',
    confidence: 0.9,
    status: 'open',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeMockProvider(): LLMProvider {
  const caps: LLMCapabilities = {
    maxContextTokens: 100000,
    supportsImages: false,
    supportsStructuredOutput: true,
  };
  return {
    name: 'mock',
    model: 'mock-model',
    capabilities: caps,
    analyze: vi.fn().mockResolvedValue({
      content: '{}',
      tokensUsed: {input: 100, output: 50},
      model: 'mock-model',
      role: 'reasoning' as const,
    }),
    analyzeStructured: vi.fn().mockResolvedValue({
      threats: [],
      mitigations: [],
    }),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('inferStrideCategories', () => {
  it('maps injection findings to tampering + information-disclosure', () => {
    const finding = makeFinding({category: 'injection'});
    const categories = inferStrideCategories(finding);
    expect(categories).toContain('tampering');
    expect(categories).toContain('information-disclosure');
  });

  it('maps auth findings to spoofing + elevation-of-privilege', () => {
    const finding = makeFinding({category: 'auth'});
    const categories = inferStrideCategories(finding);
    expect(categories).toContain('spoofing');
    expect(categories).toContain('elevation-of-privilege');
  });

  it('maps secrets findings to information-disclosure', () => {
    const finding = makeFinding({category: 'secrets'});
    const categories = inferStrideCategories(finding);
    expect(categories).toContain('information-disclosure');
  });

  it('maps logging findings to repudiation', () => {
    const finding = makeFinding({category: 'logging'});
    const categories = inferStrideCategories(finding);
    expect(categories).toContain('repudiation');
  });

  it('uses keyword analysis from title for SQL injection', () => {
    const finding = makeFinding({
      category: 'unknown',
      title: 'sql-injection in user query',
    });
    const categories = inferStrideCategories(finding);
    expect(categories).toContain('tampering');
  });

  it('uses keyword analysis for DoS', () => {
    const finding = makeFinding({
      category: 'unknown',
      title: 'denial-of-service via resource exhaustion',
    });
    const categories = inferStrideCategories(finding);
    expect(categories).toContain('denial-of-service');
  });

  it('defaults to information-disclosure for unknown categories', () => {
    const finding = makeFinding({
      category: 'completely-unknown',
      title: 'some generic finding',
    });
    const categories = inferStrideCategories(finding);
    expect(categories).toContain('information-disclosure');
  });
});

describe('generateStaticThreats', () => {
  it('generates threats from findings', () => {
    const profile = makeProfile();
    const findings = [makeFinding()];
    const threats = generateStaticThreats(profile, findings);

    expect(threats.length).toBeGreaterThan(0);
    expect(threats[0].id).toMatch(/^TM-\d{3}$/);
    expect(threats[0].relatedFindings).toContain('test-finding-1');
  });

  it('generates threats for missing security controls', () => {
    const profile = makeProfile({
      securityControls: {
        present: [],
        missing: [
          {
            name: 'Rate limiting',
            type: 'rate-limiting',
            present: false,
            confidence: 0.9,
            source: 'code',
          },
        ],
      },
    });
    const threats = generateStaticThreats(profile, []);

    expect(threats.some(t => t.title.includes('Rate limiting'))).toBe(true);
  });

  it('generates auth gap threat when API has no auth', () => {
    const profile = makeProfile({
      api: {
        styles: ['rest'],
        routeCount: 10,
        endpoints: [],
      },
      auth: {providers: [], patterns: []},
    });
    const threats = generateStaticThreats(profile, []);

    const authThreat = threats.find(t =>
      t.title.includes('No authentication'),
    );
    expect(authThreat).toBeDefined();
    expect(authThreat!.severity).toBe('critical');
  });

  it('does not generate auth gap threat when auth exists', () => {
    const profile = makeProfile({
      api: {
        styles: ['rest'],
        routeCount: 10,
        endpoints: [],
      },
      auth: {
        providers: [
          {name: 'jwt', type: 'first-party', confidence: 0.9, source: 'code'},
        ],
        patterns: [],
      },
    });
    const threats = generateStaticThreats(profile, []);

    const authThreat = threats.find(t =>
      t.title.includes('No authentication'),
    );
    expect(authThreat).toBeUndefined();
  });

  it('returns empty array for empty profile and findings', () => {
    const profile = makeProfile();
    const threats = generateStaticThreats(profile, []);
    expect(threats).toEqual([]);
  });

  it('assigns sequential IDs', () => {
    const profile = makeProfile();
    const findings = [
      makeFinding({id: 'f1', category: 'injection'}),
      makeFinding({id: 'f2', category: 'auth'}),
    ];
    const threats = generateStaticThreats(profile, findings);

    const ids = threats.map(t => t.id);
    // Should be sequential starting from TM-001
    expect(ids[0]).toBe('TM-001');
  });
});

describe('computeRiskLevel', () => {
  it('returns critical for critical severity + very-likely', () => {
    expect(computeRiskLevel('critical', 'very-likely')).toBe('critical');
  });

  it('returns high for high severity + likely', () => {
    expect(computeRiskLevel('high', 'likely')).toBe('high');
  });

  it('returns medium for medium severity + possible', () => {
    expect(computeRiskLevel('medium', 'possible')).toBe('medium');
  });

  it('returns low for low severity + unlikely', () => {
    expect(computeRiskLevel('low', 'unlikely')).toBe('low');
  });

  it('returns low for high severity + unlikely', () => {
    expect(computeRiskLevel('high', 'unlikely')).toBe('low');
  });
});

describe('buildRiskMatrix', () => {
  it('builds entries for each threat', () => {
    const threats = [
      {
        id: 'TM-001',
        category: 'tampering' as const,
        title: 'Test',
        description: 'Test',
        affectedComponent: 'test',
        severity: 'high' as const,
        likelihood: 'likely' as const,
        relatedFindings: [],
      },
    ];

    const matrix = buildRiskMatrix(threats, []);
    expect(matrix.length).toBe(1);
    expect(matrix[0].threatId).toBe('TM-001');
    expect(matrix[0].residualRisk).toBe('high');
  });

  it('reduces residual risk when mitigations exist', () => {
    const threats = [
      {
        id: 'TM-001',
        category: 'tampering' as const,
        title: 'Test',
        description: 'Test',
        affectedComponent: 'test',
        severity: 'high' as const,
        likelihood: 'likely' as const,
        relatedFindings: [],
      },
    ];

    const mitigations = [
      {
        id: 'MIT-001',
        title: 'Fix',
        description: 'Fix it',
        threatIds: ['TM-001'],
        priority: 'immediate' as const,
        effort: 'low' as const,
        status: 'proposed' as const,
      },
    ];

    const matrix = buildRiskMatrix(threats, mitigations);
    expect(matrix[0].mitigationIds).toContain('MIT-001');
    expect(matrix[0].residualRisk).toBe('low');
  });

  it('sets negligible residual risk for implemented mitigations', () => {
    const threats = [
      {
        id: 'TM-001',
        category: 'tampering' as const,
        title: 'Test',
        description: 'Test',
        affectedComponent: 'test',
        severity: 'critical' as const,
        likelihood: 'very-likely' as const,
        relatedFindings: [],
      },
    ];

    const mitigations = [
      {
        id: 'MIT-001',
        title: 'Fix',
        description: 'Fix it',
        threatIds: ['TM-001'],
        priority: 'immediate' as const,
        effort: 'low' as const,
        status: 'implemented' as const,
      },
    ];

    const matrix = buildRiskMatrix(threats, mitigations);
    expect(matrix[0].residualRisk).toBe('negligible');
  });
});

describe('generateThreatModel', () => {
  it('generates a complete threat model', async () => {
    const profile = makeProfile({
      api: {
        styles: ['rest'],
        routeCount: 5,
        endpoints: [],
      },
      auth: {
        providers: [
          {name: 'jwt', type: 'first-party', confidence: 0.9, source: 'code'},
        ],
        patterns: [],
      },
    });
    const findings = [makeFinding()];
    const provider = makeMockProvider();

    const model = await generateThreatModel(profile, findings, provider);

    expect(model.threats.length).toBeGreaterThan(0);
    expect(model.riskMatrix.length).toBe(model.threats.length);
    expect(Array.isArray(model.mitigations)).toBe(true);
  });

  it('merges LLM threats with static threats', async () => {
    const profile = makeProfile();
    const findings = [makeFinding()];
    const provider = makeMockProvider();

    (provider.analyzeStructured as ReturnType<typeof vi.fn>).mockResolvedValue({
      threats: [
        {
          id: 'TM-100',
          category: 'denial-of-service',
          title: 'LLM-detected DoS vector',
          description: 'Potential DoS via unbounded queries',
          affectedComponent: 'API',
          severity: 'medium',
          likelihood: 'possible',
          relatedFindings: [],
        },
      ],
      mitigations: [],
    });

    const model = await generateThreatModel(profile, findings, provider);

    expect(
      model.threats.some(t => t.title === 'LLM-detected DoS vector'),
    ).toBe(true);
  });

  it('falls back to static threats when LLM fails', async () => {
    const profile = makeProfile();
    const findings = [makeFinding()];
    const provider = makeMockProvider();

    (provider.analyzeStructured as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('LLM unavailable'),
    );

    const model = await generateThreatModel(profile, findings, provider);

    expect(model.threats.length).toBeGreaterThan(0);
    expect(model.mitigations).toEqual([]);
  });

  it('deduplicates threats by title', async () => {
    const profile = makeProfile();
    const finding = makeFinding({
      title: 'SQL injection detected',
      category: 'injection',
    });
    const provider = makeMockProvider();

    // LLM returns a threat with the same title as one generated from findings
    (provider.analyzeStructured as ReturnType<typeof vi.fn>).mockResolvedValue({
      threats: [
        {
          id: 'TM-100',
          category: 'tampering',
          title: 'Tampering: SQL injection detected',
          description: 'Duplicate',
          affectedComponent: 'db',
          severity: 'high',
          likelihood: 'likely',
          relatedFindings: [],
        },
      ],
      mitigations: [],
    });

    const model = await generateThreatModel(profile, [finding], provider);

    // The static threats include "Tampering: SQL injection detected" and
    // "Information Disclosure: SQL injection detected". The LLM duplicate
    // should not create a third copy.
    const tamperingThreats = model.threats.filter(t =>
      t.title.toLowerCase().includes('tampering: sql injection'),
    );
    expect(tamperingThreats.length).toBe(1);
  });
});
