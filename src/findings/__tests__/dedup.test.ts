import {describe, it, expect} from 'vitest';
import {
  deduplicateFindings,
  levenshteinDistance,
  stringSimilarity,
} from '../dedup.js';
import type {DeduplicationStrategy} from '../dedup.js';
import type {Finding} from '../types.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

let idCounter = 0;

/** Builds a minimal finding for testing with auto-incrementing IDs. */
function makeFinding(overrides: Partial<Finding> = {}): Finding {
  idCounter++;
  return {
    id: `test-${idCounter}`,
    source: 'scanner',
    category: 'injection',
    severity: 'high',
    rawSeverity: 'high',
    title: 'Test finding',
    description: 'A test finding.',
    confidence: 0.8,
    status: 'open',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// levenshteinDistance
// ---------------------------------------------------------------------------

describe('levenshteinDistance', () => {
  it('returns 0 for identical strings', () => {
    expect(levenshteinDistance('abc', 'abc')).toBe(0);
  });

  it('returns the length of the other string when one is empty', () => {
    expect(levenshteinDistance('', 'hello')).toBe(5);
    expect(levenshteinDistance('hello', '')).toBe(5);
  });

  it('returns 0 for two empty strings', () => {
    expect(levenshteinDistance('', '')).toBe(0);
  });

  it('computes correct distance for simple edits', () => {
    expect(levenshteinDistance('kitten', 'sitting')).toBe(3);
    expect(levenshteinDistance('saturday', 'sunday')).toBe(3);
  });

  it('handles single-character differences', () => {
    expect(levenshteinDistance('a', 'b')).toBe(1);
    expect(levenshteinDistance('a', 'ab')).toBe(1);
  });

  it('is symmetric', () => {
    expect(levenshteinDistance('abc', 'xyz')).toBe(
      levenshteinDistance('xyz', 'abc'),
    );
  });
});

// ---------------------------------------------------------------------------
// stringSimilarity
// ---------------------------------------------------------------------------

describe('stringSimilarity', () => {
  it('returns 1 for identical strings', () => {
    expect(stringSimilarity('hello', 'hello')).toBe(1);
  });

  it('returns 1 for two empty strings', () => {
    expect(stringSimilarity('', '')).toBe(1);
  });

  it('returns 0 for completely different strings of equal length', () => {
    // 'abc' vs 'xyz' => distance 3, maxLen 3 => 1 - 3/3 = 0
    expect(stringSimilarity('abc', 'xyz')).toBe(0);
  });

  it('returns a value between 0 and 1 for partially similar strings', () => {
    const sim = stringSimilarity('SQL injection found', 'SQL injection detected');
    expect(sim).toBeGreaterThan(0.5);
    expect(sim).toBeLessThan(1);
  });

  it('returns higher similarity for more similar strings', () => {
    const simClose = stringSimilarity('SQL injection', 'SQL Injection');
    const simFar = stringSimilarity('SQL injection', 'Buffer overflow');
    expect(simClose).toBeGreaterThan(simFar);
  });
});

// ---------------------------------------------------------------------------
// deduplicateFindings — empty / single
// ---------------------------------------------------------------------------

describe('deduplicateFindings', () => {
  it('returns empty result for empty input', () => {
    const result = deduplicateFindings([]);
    expect(result.unique).toEqual([]);
    expect(result.duplicates).toEqual([]);
    expect(result.stats).toEqual({
      total: 0,
      unique: 0,
      duplicateGroups: 0,
      suppressedCount: 0,
    });
  });

  it('returns the single finding as unique when only one is given', () => {
    const f = makeFinding();
    const result = deduplicateFindings([f]);
    expect(result.unique).toHaveLength(1);
    expect(result.unique[0]).toBe(f);
    expect(result.duplicates).toHaveLength(0);
    expect(result.stats.total).toBe(1);
    expect(result.stats.unique).toBe(1);
    expect(result.stats.suppressedCount).toBe(0);
  });

  it('keeps distinct findings as unique', () => {
    const findings = [
      makeFinding({title: 'SQL injection', file: 'a.ts', line: 10}),
      makeFinding({title: 'XSS vulnerability', file: 'b.ts', line: 20}),
      makeFinding({title: 'Path traversal', file: 'c.ts', line: 30}),
    ];
    const result = deduplicateFindings(findings, 'exact');
    expect(result.unique).toHaveLength(3);
    expect(result.duplicates).toHaveLength(0);
    expect(result.stats.suppressedCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Exact strategy
// ---------------------------------------------------------------------------

describe('deduplicateFindings — exact strategy', () => {
  it('groups findings with same title, file, and line', () => {
    const f1 = makeFinding({
      title: 'SQL injection',
      file: 'src/db.ts',
      line: 42,
      confidence: 0.9,
      scanner: 'semgrep',
    });
    const f2 = makeFinding({
      title: 'SQL injection',
      file: 'src/db.ts',
      line: 42,
      confidence: 0.7,
      scanner: 'trivy',
    });
    const result = deduplicateFindings([f1, f2], 'exact');

    expect(result.unique).toHaveLength(1);
    expect(result.duplicates).toHaveLength(1);
    expect(result.duplicates[0].canonical).toBe(f1); // higher confidence
    expect(result.duplicates[0].duplicates).toEqual([f2]);
    expect(result.stats.total).toBe(2);
    expect(result.stats.unique).toBe(1);
    expect(result.stats.duplicateGroups).toBe(1);
    expect(result.stats.suppressedCount).toBe(1);
  });

  it('normalizes title comparison (case-insensitive, trimmed)', () => {
    const f1 = makeFinding({
      title: '  SQL Injection  ',
      file: 'src/db.ts',
      line: 42,
      confidence: 0.8,
    });
    const f2 = makeFinding({
      title: 'sql injection',
      file: 'src/db.ts',
      line: 42,
      confidence: 0.8,
    });
    const result = deduplicateFindings([f1, f2], 'exact');

    expect(result.unique).toHaveLength(1);
    expect(result.duplicates).toHaveLength(1);
  });

  it('does not group findings with different files', () => {
    const f1 = makeFinding({title: 'SQL injection', file: 'a.ts', line: 42});
    const f2 = makeFinding({title: 'SQL injection', file: 'b.ts', line: 42});
    const result = deduplicateFindings([f1, f2], 'exact');

    expect(result.unique).toHaveLength(2);
    expect(result.duplicates).toHaveLength(0);
  });

  it('does not group findings with different lines', () => {
    const f1 = makeFinding({title: 'SQL injection', file: 'a.ts', line: 10});
    const f2 = makeFinding({title: 'SQL injection', file: 'a.ts', line: 20});
    const result = deduplicateFindings([f1, f2], 'exact');

    expect(result.unique).toHaveLength(2);
    expect(result.duplicates).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Location-based strategy
// ---------------------------------------------------------------------------

describe('deduplicateFindings — location-based strategy', () => {
  it('groups findings at the same file+line with similar titles', () => {
    const f1 = makeFinding({
      title: 'SQL injection vulnerability detected',
      file: 'src/db.ts',
      line: 42,
      confidence: 0.9,
    });
    const f2 = makeFinding({
      title: 'SQL injection vulnerability found',
      file: 'src/db.ts',
      line: 42,
      confidence: 0.7,
    });
    const result = deduplicateFindings([f1, f2], 'location-based');

    expect(result.unique).toHaveLength(1);
    expect(result.duplicates).toHaveLength(1);
  });

  it('does not group findings without file/line', () => {
    const f1 = makeFinding({title: 'SQL injection', file: undefined, line: undefined});
    const f2 = makeFinding({title: 'SQL injection', file: undefined, line: undefined});
    const result = deduplicateFindings([f1, f2], 'location-based');

    expect(result.unique).toHaveLength(2);
    expect(result.duplicates).toHaveLength(0);
  });

  it('does not group findings with dissimilar titles at same location', () => {
    const f1 = makeFinding({
      title: 'SQL injection in query builder',
      file: 'src/db.ts',
      line: 42,
    });
    const f2 = makeFinding({
      title: 'Buffer overflow in memory allocator',
      file: 'src/db.ts',
      line: 42,
    });
    const result = deduplicateFindings([f1, f2], 'location-based');

    expect(result.unique).toHaveLength(2);
    expect(result.duplicates).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Fuzzy strategy
// ---------------------------------------------------------------------------

describe('deduplicateFindings — fuzzy strategy', () => {
  it('groups findings with very similar titles (>= 0.9)', () => {
    const f1 = makeFinding({
      title: 'SQL injection in query builder',
      file: 'a.ts',
      line: 10,
      confidence: 0.9,
    });
    const f2 = makeFinding({
      title: 'SQL injection in query builders',
      file: 'b.ts',
      line: 20,
      confidence: 0.7,
    });
    const result = deduplicateFindings([f1, f2], 'fuzzy');

    expect(result.unique).toHaveLength(1);
    expect(result.duplicates).toHaveLength(1);
    expect(result.duplicates[0].canonical).toBe(f1); // higher confidence
  });

  it('groups findings with same CWE, category, and similar titles', () => {
    const f1 = makeFinding({
      title: 'SQL injection vulnerability',
      category: 'injection',
      cweId: 'CWE-89',
      confidence: 0.8,
    });
    const f2 = makeFinding({
      title: 'SQL injection vulnerability found',
      category: 'injection',
      cweId: 'CWE-89',
      confidence: 0.6,
    });
    const result = deduplicateFindings([f1, f2], 'fuzzy');

    expect(result.unique).toHaveLength(1);
    expect(result.duplicates).toHaveLength(1);
  });

  it('does not group findings with completely different titles', () => {
    const f1 = makeFinding({title: 'SQL injection found', file: 'a.ts', line: 10});
    const f2 = makeFinding({title: 'Buffer overflow detected', file: 'b.ts', line: 20});
    const result = deduplicateFindings([f1, f2], 'fuzzy');

    expect(result.unique).toHaveLength(2);
    expect(result.duplicates).toHaveLength(0);
  });

  it('defaults to fuzzy strategy when none is specified', () => {
    const f1 = makeFinding({
      title: 'SQL injection in query builder',
      file: 'src/db.ts',
      line: 42,
      confidence: 0.9,
    });
    const f2 = makeFinding({
      title: 'SQL injection in query builder',
      file: 'src/db.ts',
      line: 42,
      confidence: 0.7,
    });
    const result = deduplicateFindings([f1, f2]);

    expect(result.unique).toHaveLength(1);
    expect(result.duplicates).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Canonical selection
// ---------------------------------------------------------------------------

describe('deduplicateFindings — canonical selection', () => {
  it('picks the finding with highest confidence as canonical', () => {
    const f1 = makeFinding({
      title: 'SQL injection',
      file: 'src/db.ts',
      line: 42,
      confidence: 0.6,
      scanner: 'trivy',
    });
    const f2 = makeFinding({
      title: 'SQL injection',
      file: 'src/db.ts',
      line: 42,
      confidence: 0.95,
      scanner: 'npm-audit',
    });
    const result = deduplicateFindings([f1, f2], 'exact');

    expect(result.duplicates[0].canonical).toBe(f2);
  });

  it('breaks confidence ties using scanner trust', () => {
    const f1 = makeFinding({
      title: 'SQL injection',
      file: 'src/db.ts',
      line: 42,
      confidence: 0.8,
      scanner: 'eslint',
    });
    const f2 = makeFinding({
      title: 'SQL injection',
      file: 'src/db.ts',
      line: 42,
      confidence: 0.8,
      scanner: 'semgrep',
    });
    const result = deduplicateFindings([f1, f2], 'exact');

    expect(result.duplicates[0].canonical).toBe(f2); // semgrep is more trusted
  });

  it('handles unknown scanner names gracefully', () => {
    const f1 = makeFinding({
      title: 'SQL injection',
      file: 'src/db.ts',
      line: 42,
      confidence: 0.8,
      scanner: 'custom-scanner-xyz',
    });
    const f2 = makeFinding({
      title: 'SQL injection',
      file: 'src/db.ts',
      line: 42,
      confidence: 0.8,
      scanner: undefined,
    });
    const result = deduplicateFindings([f1, f2], 'exact');

    // Both have trust=1, confidence is same, so first one wins (reduce keeps first)
    expect(result.duplicates[0].canonical).toBe(f1);
  });
});

// ---------------------------------------------------------------------------
// Multiple groups
// ---------------------------------------------------------------------------

describe('deduplicateFindings — multiple groups', () => {
  it('correctly handles multiple duplicate groups', () => {
    const findings = [
      makeFinding({title: 'SQL injection', file: 'a.ts', line: 10, confidence: 0.9}),
      makeFinding({title: 'SQL injection', file: 'a.ts', line: 10, confidence: 0.7}),
      makeFinding({title: 'XSS vulnerability', file: 'b.ts', line: 20, confidence: 0.8}),
      makeFinding({title: 'XSS vulnerability', file: 'b.ts', line: 20, confidence: 0.6}),
      makeFinding({title: 'Path traversal', file: 'c.ts', line: 30, confidence: 0.5}),
    ];
    const result = deduplicateFindings(findings, 'exact');

    expect(result.unique).toHaveLength(3);
    expect(result.duplicates).toHaveLength(2);
    expect(result.stats.total).toBe(5);
    expect(result.stats.unique).toBe(3);
    expect(result.stats.duplicateGroups).toBe(2);
    expect(result.stats.suppressedCount).toBe(2);
  });

  it('provides a reason string for each duplicate group', () => {
    const f1 = makeFinding({title: 'SQL injection', file: 'a.ts', line: 10});
    const f2 = makeFinding({title: 'SQL injection', file: 'a.ts', line: 10});

    const exactResult = deduplicateFindings([f1, f2], 'exact');
    expect(exactResult.duplicates[0].reason).toContain('Exact');

    const f3 = makeFinding({title: 'SQL injection vulnerability detected', file: 'a.ts', line: 10});
    const f4 = makeFinding({title: 'SQL injection vulnerability found', file: 'a.ts', line: 10});
    const locResult = deduplicateFindings([f3, f4], 'location-based');
    expect(locResult.duplicates[0].reason).toContain('file and line');

    const f5 = makeFinding({title: 'SQL injection in query builder', file: 'x.ts', line: 1, confidence: 0.9});
    const f6 = makeFinding({title: 'SQL injection in query builders', file: 'y.ts', line: 2, confidence: 0.7});
    const fuzzyResult = deduplicateFindings([f5, f6], 'fuzzy');
    expect(fuzzyResult.duplicates[0].reason).toContain('Fuzzy');
  });
});

// ---------------------------------------------------------------------------
// Transitive grouping
// ---------------------------------------------------------------------------

describe('deduplicateFindings — transitive grouping', () => {
  it('groups transitively via union-find (A~B and B~C means A,B,C in one group)', () => {
    // Three findings at the same location with exact same title
    const f1 = makeFinding({title: 'SQL injection', file: 'a.ts', line: 10, confidence: 0.9, scanner: 'semgrep'});
    const f2 = makeFinding({title: 'SQL injection', file: 'a.ts', line: 10, confidence: 0.7, scanner: 'trivy'});
    const f3 = makeFinding({title: 'SQL injection', file: 'a.ts', line: 10, confidence: 0.5, scanner: 'eslint'});

    const result = deduplicateFindings([f1, f2, f3], 'exact');

    expect(result.unique).toHaveLength(1);
    expect(result.duplicates).toHaveLength(1);
    expect(result.duplicates[0].canonical).toBe(f1); // highest confidence
    expect(result.duplicates[0].duplicates).toHaveLength(2);
    expect(result.stats.suppressedCount).toBe(2);
  });
});
