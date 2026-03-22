import {describe, it, expect} from 'vitest';
import {
  adjustSeverity,
  severityToNumber,
  numberToSeverity,
  isAtLeast,
  scoreSeverity,
} from '../severity.js';
import type {SeverityContext} from '../severity.js';

/** Returns a default context with all flags off. */
function baseContext(overrides: Partial<SeverityContext> = {}): SeverityContext {
  return {
    isPublicFacing: false,
    handlesPII: false,
    hasAuthSystem: false,
    trustBoundaryCount: 0,
    isInAuthCode: false,
    isInApiRoute: false,
    isInTestCode: false,
    isInThirdParty: false,
    ...overrides,
  };
}

describe('severityToNumber / numberToSeverity', () => {
  it('roundtrips all severity levels', () => {
    const levels = [
      'informational',
      'low',
      'medium',
      'high',
      'critical',
    ] as const;

    for (const level of levels) {
      const num = severityToNumber(level);
      expect(numberToSeverity(num)).toBe(level);
    }
  });

  it('maps informational=1, low=2, medium=3, high=4, critical=5', () => {
    expect(severityToNumber('informational')).toBe(1);
    expect(severityToNumber('low')).toBe(2);
    expect(severityToNumber('medium')).toBe(3);
    expect(severityToNumber('high')).toBe(4);
    expect(severityToNumber('critical')).toBe(5);
  });

  it('throws on invalid severity string', () => {
    expect(() => severityToNumber('unknown' as never)).toThrow(
      'Unknown severity',
    );
  });

  it('throws on out-of-range number', () => {
    expect(() => numberToSeverity(0)).toThrow();
    expect(() => numberToSeverity(6)).toThrow();
    expect(() => numberToSeverity(2.5)).toThrow();
  });
});

describe('isAtLeast', () => {
  it('returns true when severity meets threshold', () => {
    expect(isAtLeast('high', 'medium')).toBe(true);
    expect(isAtLeast('critical', 'critical')).toBe(true);
    expect(isAtLeast('medium', 'medium')).toBe(true);
  });

  it('returns false when severity is below threshold', () => {
    expect(isAtLeast('low', 'medium')).toBe(false);
    expect(isAtLeast('informational', 'critical')).toBe(false);
  });
});

describe('adjustSeverity', () => {
  it('downgrades test code findings by 1 level', () => {
    const ctx = baseContext({isInTestCode: true});
    expect(adjustSeverity('high', ctx)).toBe('medium');
  });

  it('downgrades third-party code findings by 1 level', () => {
    const ctx = baseContext({isInThirdParty: true});
    expect(adjustSeverity('high', ctx)).toBe('medium');
  });

  it('upgrades auth code findings when project handles PII', () => {
    const ctx = baseContext({isInAuthCode: true, handlesPII: true});
    expect(adjustSeverity('medium', ctx)).toBe('high');
  });

  it('does not upgrade auth code findings when project does NOT handle PII', () => {
    const ctx = baseContext({isInAuthCode: true, handlesPII: false});
    expect(adjustSeverity('medium', ctx)).toBe('medium');
  });

  it('upgrades public API route findings by 1 level', () => {
    const ctx = baseContext({isInApiRoute: true});
    expect(adjustSeverity('medium', ctx)).toBe('high');
  });

  it('never exceeds critical', () => {
    const ctx = baseContext({
      isInAuthCode: true,
      handlesPII: true,
      isInApiRoute: true,
    });
    // critical + 2 upgrades should still be critical
    expect(adjustSeverity('critical', ctx)).toBe('critical');
    // high + 2 upgrades = capped at critical
    expect(adjustSeverity('high', ctx)).toBe('critical');
  });

  it('never goes below informational', () => {
    const ctx = baseContext({isInTestCode: true, isInThirdParty: true});
    // informational - 2 downgrades should still be informational
    expect(adjustSeverity('informational', ctx)).toBe('informational');
    // low - 2 downgrades = capped at informational
    expect(adjustSeverity('low', ctx)).toBe('informational');
  });

  it('stacks multiple adjustments up to ±2 levels', () => {
    // Two downgrades: test + third-party = -2
    const downCtx = baseContext({isInTestCode: true, isInThirdParty: true});
    expect(adjustSeverity('critical', downCtx)).toBe('medium');

    // Two upgrades: auth+PII + public API = +2
    const upCtx = baseContext({
      isInAuthCode: true,
      handlesPII: true,
      isInApiRoute: true,
    });
    expect(adjustSeverity('low', upCtx)).toBe('high');
  });

  it('caps stacked adjustments at ±2 even if more rules match', () => {
    // All four rules match: -1 -1 +1 +1 = 0 net (within ±2 cap)
    const ctx = baseContext({
      isInTestCode: true,
      isInThirdParty: true,
      isInAuthCode: true,
      handlesPII: true,
      isInApiRoute: true,
    });
    expect(adjustSeverity('medium', ctx)).toBe('medium');
  });

  it('returns raw severity when no contextual signals apply', () => {
    const ctx = baseContext();
    expect(adjustSeverity('high', ctx)).toBe('high');
    expect(adjustSeverity('low', ctx)).toBe('low');
  });
});

describe('scoreSeverity', () => {
  it('returns base score for neutral context', () => {
    const ctx = baseContext();
    const score = scoreSeverity('high', ctx);
    expect(score.value).toBe(70);
    expect(score.level).toBe('high');
    expect(score.reasoning).toHaveLength(1);
  });
  it('returns base scores', () => {
    const ctx = baseContext();
    expect(scoreSeverity('critical', ctx).value).toBe(90);
    expect(scoreSeverity('medium', ctx).value).toBe(50);
    expect(scoreSeverity('low', ctx).value).toBe(30);
    expect(scoreSeverity('informational', ctx).value).toBe(10);
  });
  it('increases for API route', () => { expect(scoreSeverity('medium', baseContext({isInApiRoute: true})).value).toBe(60); });
  it('increases for PII', () => { expect(scoreSeverity('medium', baseContext({handlesPII: true})).value).toBe(60); });
  it('increases for auth code', () => { expect(scoreSeverity('medium', baseContext({isInAuthCode: true})).value).toBe(55); });
  it('increases for trust boundaries', () => { expect(scoreSeverity('medium', baseContext({trustBoundaryCount: 3})).value).toBe(55); });
  it('no increase for low trust boundaries', () => { expect(scoreSeverity('medium', baseContext({trustBoundaryCount: 1})).value).toBe(50); });
  it('decreases for test code', () => { expect(scoreSeverity('medium', baseContext({isInTestCode: true})).value).toBe(35); });
  it('decreases for third-party', () => { expect(scoreSeverity('medium', baseContext({isInThirdParty: true})).value).toBe(40); });
  it('stacks adjustments', () => { expect(scoreSeverity('high', baseContext({isInApiRoute: true, handlesPII: true, isInAuthCode: true, trustBoundaryCount: 2})).value).toBe(100); });
  it('clamps at 0', () => { expect(scoreSeverity('informational', baseContext({isInTestCode: true, isInThirdParty: true})).value).toBe(0); });
  it('clamps at 100', () => { expect(scoreSeverity('critical', baseContext({isInApiRoute: true, handlesPII: true, isInAuthCode: true, trustBoundaryCount: 5})).value).toBe(100); });
  it('maps thresholds to levels', () => {
    const ctx = baseContext();
    expect(scoreSeverity('critical', ctx).level).toBe('critical');
    expect(scoreSeverity('high', ctx).level).toBe('high');
    expect(scoreSeverity('medium', ctx).level).toBe('medium');
    expect(scoreSeverity('low', ctx).level).toBe('low');
    expect(scoreSeverity('informational', ctx).level).toBe('informational');
  });
});
