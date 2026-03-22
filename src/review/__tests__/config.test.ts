/**
 * Tests for review config helpers (ASEC-046).
 */

import {describe, expect, it} from 'vitest';

import {shouldAutoApprove, filterByConfig} from '../config.js';
import type {AugmentaSecConfig} from '../../config/schema.js';
import type {Finding} from '../../findings/types.js';
import {createFinding} from '../../findings/types.js';
import {DEFAULT_CONFIG} from '../../config/defaults.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFinding(
  overrides: Partial<Omit<Finding, 'id' | 'createdAt' | 'status'>> = {},
): Finding {
  return createFinding({
    source: 'llm',
    category: 'injection',
    severity: 'medium',
    rawSeverity: 'medium',
    title: 'Test finding',
    description: 'A test finding.',
    confidence: 0.8,
    ...overrides,
  });
}

function makeConfig(
  overrides: Partial<AugmentaSecConfig> = {},
): AugmentaSecConfig {
  return {
    ...DEFAULT_CONFIG,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// shouldAutoApprove
// ---------------------------------------------------------------------------

describe('shouldAutoApprove', () => {
  it('approves when no findings exist', () => {
    const config = makeConfig();
    expect(shouldAutoApprove([], config)).toBe(true);
  });

  it('approves when all findings are below threshold', () => {
    const config = makeConfig();
    const findings = [
      makeFinding({severity: 'low'}),
      makeFinding({severity: 'informational'}),
    ];
    expect(shouldAutoApprove(findings, config)).toBe(true);
  });

  it('rejects when any finding meets or exceeds threshold', () => {
    const config = makeConfig();
    const findings = [
      makeFinding({severity: 'low'}),
      makeFinding({severity: 'medium'}),
    ];
    expect(shouldAutoApprove(findings, config)).toBe(false);
  });

  it('rejects when a finding exceeds threshold', () => {
    const config = makeConfig();
    const findings = [makeFinding({severity: 'critical'})];
    expect(shouldAutoApprove(findings, config)).toBe(false);
  });

  it('uses custom auto_approve_below threshold', () => {
    const config = makeConfig({
      review: {
        ...DEFAULT_CONFIG.review,
        auto_approve_below: 'high',
      },
    });

    const findingsMedium = [makeFinding({severity: 'medium'})];
    expect(shouldAutoApprove(findingsMedium, config)).toBe(true);

    const findingsHigh = [makeFinding({severity: 'high'})];
    expect(shouldAutoApprove(findingsHigh, config)).toBe(false);
  });

  it('handles informational threshold (approves nothing except empty)', () => {
    const config = makeConfig({
      review: {
        ...DEFAULT_CONFIG.review,
        auto_approve_below: 'informational',
      },
    });

    const findings = [makeFinding({severity: 'informational'})];
    expect(shouldAutoApprove(findings, config)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// filterByConfig
// ---------------------------------------------------------------------------

describe('filterByConfig', () => {
  it('returns all findings when min_severity is "informational"', () => {
    const config = makeConfig({
      scan: {
        ...DEFAULT_CONFIG.scan,
        min_severity: 'informational',
      },
    });

    const findings = [
      makeFinding({severity: 'informational'}),
      makeFinding({severity: 'low'}),
      makeFinding({severity: 'critical'}),
    ];

    expect(filterByConfig(findings, config)).toHaveLength(3);
  });

  it('filters out findings below min_severity', () => {
    const config = makeConfig({
      scan: {
        ...DEFAULT_CONFIG.scan,
        min_severity: 'high',
      },
    });

    const findings = [
      makeFinding({severity: 'informational'}),
      makeFinding({severity: 'low'}),
      makeFinding({severity: 'medium'}),
      makeFinding({severity: 'high'}),
      makeFinding({severity: 'critical'}),
    ];

    const filtered = filterByConfig(findings, config);
    expect(filtered).toHaveLength(2);
    expect(filtered.map((f) => f.severity)).toEqual(['high', 'critical']);
  });

  it('returns empty array when no findings meet threshold', () => {
    const config = makeConfig({
      scan: {
        ...DEFAULT_CONFIG.scan,
        min_severity: 'critical',
      },
    });

    const findings = [
      makeFinding({severity: 'low'}),
      makeFinding({severity: 'medium'}),
    ];

    expect(filterByConfig(findings, config)).toHaveLength(0);
  });

  it('returns empty array for empty input', () => {
    const config = makeConfig();
    expect(filterByConfig([], config)).toHaveLength(0);
  });

  it('uses default min_severity of "low"', () => {
    const config = makeConfig();
    const findings = [
      makeFinding({severity: 'informational'}),
      makeFinding({severity: 'low'}),
    ];

    const filtered = filterByConfig(findings, config);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].severity).toBe('low');
  });
});
