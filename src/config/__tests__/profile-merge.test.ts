import {describe, expect, it} from 'vitest';
import {mergeProfiles, hasManualEdits} from '../profile-merge.js';
import type {SecurityProfile} from '../../discovery/types.js';

/** Returns a minimal valid SecurityProfile for testing. */
function makeProfile(overrides?: Partial<SecurityProfile>): SecurityProfile {
  return {
    version: '1.0',
    generatedAt: '2026-01-01T00:00:00Z',
    target: '/test',
    project: {name: 'test-project'},
    languages: {primary: 'TypeScript', all: [{name: 'TypeScript', percentage: 100, fileCount: 50}]},
    frameworks: {
      backend: [{name: 'Express', category: 'backend', confidence: 0.9}],
      frontend: [],
      fullstack: [],
      orm: [],
      testing: [{name: 'Vitest', category: 'testing', confidence: 0.95}],
    },
    auth: {providers: [], patterns: []},
    database: {databases: []},
    api: {styles: ['REST'], routeCount: 5, endpoints: []},
    securityControls: {present: [], missing: []},
    ci: {platform: 'github-actions', workflows: [], securityChecks: []},
    docs: {
      hasReadme: true,
      hasContributing: false,
      hasSecurityPolicy: false,
      hasChangelog: false,
      hasLicense: true,
      architectureDocs: [],
      aiConfigs: [],
    },
    trustBoundaries: {candidates: []},
    piiFields: {candidates: []},
    ...overrides,
  };
}

describe('hasManualEdits', () => {
  it('returns false for a profile with no trust boundaries or PII fields', () => {
    const profile = makeProfile();
    expect(hasManualEdits(profile)).toBe(false);
  });

  it('returns true when trust boundaries have entries', () => {
    const profile = makeProfile({
      trustBoundaries: {
        candidates: [
          {name: 'Authorization', type: 'header', confidence: 0.9, locations: ['src/auth.ts']},
        ],
      },
    });
    expect(hasManualEdits(profile)).toBe(true);
  });

  it('returns true when PII fields have entries', () => {
    const profile = makeProfile({
      piiFields: {
        candidates: [
          {field: 'email', location: 'users.email', classification: 'direct-identifier', confidence: 0.95},
        ],
      },
    });
    expect(hasManualEdits(profile)).toBe(true);
  });

  it('returns true when trust boundaries have notes', () => {
    const profile = makeProfile({
      trustBoundaries: {
        candidates: [
          {
            name: 'API Key',
            type: 'header',
            confidence: 0.8,
            locations: ['src/middleware.ts'],
            notes: 'Used for internal service-to-service auth',
          },
        ],
      },
    });
    expect(hasManualEdits(profile)).toBe(true);
  });
});

describe('mergeProfiles', () => {
  it('takes metadata from the updated profile', () => {
    const existing = makeProfile({generatedAt: '2025-01-01T00:00:00Z'});
    const updated = makeProfile({generatedAt: '2026-06-01T00:00:00Z'});

    const merged = mergeProfiles(existing, updated);
    expect(merged.generatedAt).toBe('2026-06-01T00:00:00Z');
    expect(merged.version).toBe(updated.version);
    expect(merged.target).toBe(updated.target);
    expect(merged.project).toEqual(updated.project);
  });

  it('takes auto-detected sections from updated profile', () => {
    const existing = makeProfile({
      languages: {primary: 'JavaScript', all: [{name: 'JavaScript', percentage: 100, fileCount: 20}]},
    });
    const updated = makeProfile({
      languages: {primary: 'TypeScript', all: [{name: 'TypeScript', percentage: 80, fileCount: 40}]},
    });

    const merged = mergeProfiles(existing, updated);
    expect(merged.languages.primary).toBe('TypeScript');
  });

  it('preserves existing trust boundaries and appends new ones', () => {
    const existing = makeProfile({
      trustBoundaries: {
        candidates: [
          {
            name: 'Authorization',
            type: 'header' as const,
            confidence: 0.9,
            locations: ['src/auth.ts'],
            notes: 'Bearer token auth',
          },
        ],
      },
    });
    const updated = makeProfile({
      trustBoundaries: {
        candidates: [
          {name: 'Authorization', type: 'header' as const, confidence: 0.85, locations: ['src/auth.ts']},
          {name: 'X-API-Key', type: 'header' as const, confidence: 0.8, locations: ['src/api.ts']},
        ],
      },
    });

    const merged = mergeProfiles(existing, updated);
    expect(merged.trustBoundaries.candidates).toHaveLength(2);

    const authEntry = merged.trustBoundaries.candidates.find(
      (c: {name: string}) => c.name === 'Authorization',
    );
    expect(authEntry?.notes).toBe('Bearer token auth');
    expect(authEntry?.confidence).toBe(0.9);

    const apiKeyEntry = merged.trustBoundaries.candidates.find(
      (c: {name: string}) => c.name === 'X-API-Key',
    );
    expect(apiKeyEntry).toBeDefined();
  });

  it('preserves existing PII fields and appends new ones', () => {
    const existing = makeProfile({
      piiFields: {
        candidates: [
          {field: 'email', location: 'users.email', classification: 'direct-identifier' as const, confidence: 0.95},
        ],
      },
    });
    const updated = makeProfile({
      piiFields: {
        candidates: [
          {field: 'email', location: 'users.email', classification: 'direct-identifier' as const, confidence: 0.9},
          {field: 'ip_address', location: 'logs.client_ip', classification: 'quasi-identifier' as const, confidence: 0.85},
        ],
      },
    });

    const merged = mergeProfiles(existing, updated);
    expect(merged.piiFields.candidates).toHaveLength(2);

    const emailEntry = merged.piiFields.candidates.find(
      (c: {field: string}) => c.field === 'email',
    );
    expect(emailEntry?.confidence).toBe(0.95);

    const ipEntry = merged.piiFields.candidates.find(
      (c: {field: string}) => c.field === 'ip_address',
    );
    expect(ipEntry).toBeDefined();
  });

  it('handles empty existing profile gracefully', () => {
    const existing = makeProfile();
    const updated = makeProfile({
      trustBoundaries: {
        candidates: [
          {name: 'Cookie', type: 'cookie' as const, confidence: 0.7, locations: ['src/session.ts']},
        ],
      },
    });
    const merged = mergeProfiles(existing, updated);
    expect(merged.trustBoundaries.candidates).toHaveLength(1);
  });

  it('handles empty updated profile gracefully', () => {
    const existing = makeProfile({
      piiFields: {
        candidates: [
          {field: 'ssn', location: 'users.ssn', classification: 'sensitive' as const, confidence: 1.0},
        ],
      },
    });
    const updated = makeProfile();
    const merged = mergeProfiles(existing, updated);
    expect(merged.piiFields.candidates).toHaveLength(1);
  });

  it('distinguishes trust boundaries by name AND type', () => {
    const existing = makeProfile({
      trustBoundaries: {
        candidates: [
          {name: 'token', type: 'header' as const, confidence: 0.9, locations: ['src/auth.ts']},
        ],
      },
    });
    const updated = makeProfile({
      trustBoundaries: {
        candidates: [
          {name: 'token', type: 'cookie' as const, confidence: 0.8, locations: ['src/session.ts']},
        ],
      },
    });
    const merged = mergeProfiles(existing, updated);
    expect(merged.trustBoundaries.candidates).toHaveLength(2);
  });
});
