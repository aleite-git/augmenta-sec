/**
 * Tests for PII field mapping (ASEC-013).
 */

import {describe, it, expect, vi} from 'vitest';
import type {SecurityProfile} from '../../discovery/types.js';
import type {LLMProvider, LLMCapabilities} from '../../providers/llm/types.js';
import {
  detectStaticPii,
  matchPiiPatterns,
  mapPiiFields,
} from '../pii-mapping.js';

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
      role: 'analysis' as const,
    }),
    analyzeStructured: vi.fn().mockResolvedValue({
      candidates: [],
    }),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('matchPiiPatterns', () => {
  it('detects email as a direct identifier', () => {
    const matches = matchPiiPatterns('email');
    expect(matches.some(m => m.label === 'email')).toBe(true);
    expect(matches[0].classification).toBe('direct-identifier');
  });

  it('detects SSN as a direct identifier', () => {
    const matches = matchPiiPatterns('ssn');
    expect(matches.some(m => m.label === 'SSN')).toBe(true);
  });

  it('detects date_of_birth as a quasi-identifier', () => {
    const matches = matchPiiPatterns('date_of_birth');
    expect(matches.some(m => m.label === 'date of birth')).toBe(true);
    expect(matches[0].classification).toBe('quasi-identifier');
  });

  it('detects credit_card as sensitive', () => {
    const matches = matchPiiPatterns('credit_card');
    expect(matches.some(m => m.label === 'credit card')).toBe(true);
    expect(matches[0].classification).toBe('sensitive');
  });

  it('detects password as sensitive', () => {
    const matches = matchPiiPatterns('password');
    expect(matches.some(m => m.classification === 'sensitive')).toBe(true);
  });

  it('detects phone number as quasi-identifier', () => {
    const matches = matchPiiPatterns('phone_number');
    expect(matches.some(m => m.label === 'phone number')).toBe(true);
    expect(matches[0].classification).toBe('quasi-identifier');
  });

  it('returns empty array for non-PII text', () => {
    const matches = matchPiiPatterns('config_version');
    expect(matches).toEqual([]);
  });

  it('detects multiple PII patterns in one string', () => {
    const matches = matchPiiPatterns('email and phone number');
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it('is case-insensitive', () => {
    const matches = matchPiiPatterns('EMAIL');
    expect(matches.some(m => m.label === 'email')).toBe(true);
  });
});

describe('detectStaticPii', () => {
  it('returns empty for minimal profile', () => {
    const profile = makeProfile();
    const candidates = detectStaticPii(profile);
    expect(candidates).toEqual([]);
  });

  it('includes existing PII candidates from profile', () => {
    const profile = makeProfile({
      piiFields: {
        candidates: [
          {
            field: 'email',
            location: 'src/models/user.ts',
            classification: 'direct-identifier',
            confidence: 0.9,
          },
        ],
      },
    });

    const candidates = detectStaticPii(profile);
    expect(candidates.length).toBe(1);
    expect(candidates[0].field).toBe('email');
  });

  it('detects PII in API endpoint paths', () => {
    const profile = makeProfile({
      api: {
        styles: ['rest'],
        routeCount: 1,
        endpoints: [
          {
            method: 'POST',
            path: '/api/users/email',
            file: 'src/routes/users.ts',
            line: 10,
          },
        ],
      },
    });

    const candidates = detectStaticPii(profile);
    expect(candidates.some(c => c.field === 'email')).toBe(true);
  });

  it('deduplicates PII candidates', () => {
    const profile = makeProfile({
      piiFields: {
        candidates: [
          {
            field: 'email',
            location: 'src/user.ts',
            classification: 'direct-identifier',
            confidence: 0.9,
          },
          {
            field: 'email',
            location: 'src/user.ts',
            classification: 'direct-identifier',
            confidence: 0.9,
          },
        ],
      },
    });

    const candidates = detectStaticPii(profile);
    expect(candidates.length).toBe(1);
  });
});

describe('mapPiiFields', () => {
  it('merges static and LLM results', async () => {
    const profile = makeProfile({
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

    const provider = makeMockProvider();
    (provider.analyzeStructured as ReturnType<typeof vi.fn>).mockResolvedValue({
      candidates: [
        {
          field: 'phone',
          location: 'src/profile.ts',
          classification: 'quasi-identifier',
          confidence: 0.8,
        },
      ],
    });

    const result = await mapPiiFields(profile, provider);
    expect(result.candidates.length).toBe(2);
    expect(result.candidates.some(c => c.field === 'email')).toBe(true);
    expect(result.candidates.some(c => c.field === 'phone')).toBe(true);
  });

  it('falls back to static when LLM fails', async () => {
    const profile = makeProfile({
      piiFields: {
        candidates: [
          {
            field: 'ssn',
            location: 'src/tax.ts',
            classification: 'direct-identifier',
            confidence: 0.9,
          },
        ],
      },
    });

    const provider = makeMockProvider();
    (provider.analyzeStructured as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('LLM unavailable'),
    );

    const result = await mapPiiFields(profile, provider);
    expect(result.candidates.length).toBe(1);
    expect(result.candidates[0].field).toBe('ssn');
  });

  it('caps LLM confidence at 0.7', async () => {
    const profile = makeProfile();
    const provider = makeMockProvider();
    (provider.analyzeStructured as ReturnType<typeof vi.fn>).mockResolvedValue({
      candidates: [
        {
          field: 'biometric',
          location: 'src/auth.ts',
          classification: 'sensitive',
          confidence: 0.95,
        },
      ],
    });

    const result = await mapPiiFields(profile, provider);
    expect(result.candidates[0].confidence).toBeLessThanOrEqual(0.7);
  });

  it('deduplicates LLM and static results by field+location', async () => {
    const profile = makeProfile({
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

    const provider = makeMockProvider();
    (provider.analyzeStructured as ReturnType<typeof vi.fn>).mockResolvedValue({
      candidates: [
        {
          field: 'email',
          location: 'src/user.ts',
          classification: 'direct-identifier',
          confidence: 0.8,
        },
      ],
    });

    const result = await mapPiiFields(profile, provider);
    expect(result.candidates.length).toBe(1);
  });
});
