import {describe, it, expect} from 'vitest';
import {
  normalizeFinding,
  normalizeSeverity,
  normalizeConfidence,
  validateFinding,
  buildFindingsReport,
} from '../schema.js';
import type {NormalizedFinding, RawFinding} from '../schema.js';

// ---------------------------------------------------------------------------
// normalizeSeverity
// ---------------------------------------------------------------------------

describe('normalizeSeverity', () => {
  it('maps standard severity labels', () => {
    expect(normalizeSeverity('critical')).toBe('critical');
    expect(normalizeSeverity('high')).toBe('high');
    expect(normalizeSeverity('medium')).toBe('medium');
    expect(normalizeSeverity('low')).toBe('low');
    expect(normalizeSeverity('informational')).toBe('informational');
  });

  it('maps common aliases', () => {
    expect(normalizeSeverity('crit')).toBe('critical');
    expect(normalizeSeverity('error')).toBe('high');
    expect(normalizeSeverity('warning')).toBe('medium');
    expect(normalizeSeverity('moderate')).toBe('medium');
    expect(normalizeSeverity('minor')).toBe('low');
    expect(normalizeSeverity('info')).toBe('informational');
    expect(normalizeSeverity('note')).toBe('informational');
    expect(normalizeSeverity('none')).toBe('informational');
  });

  it('is case-insensitive and trims whitespace', () => {
    expect(normalizeSeverity('HIGH')).toBe('high');
    expect(normalizeSeverity('  Medium  ')).toBe('medium');
    expect(normalizeSeverity('CRITICAL')).toBe('critical');
  });

  it('defaults to informational for unknown or undefined', () => {
    expect(normalizeSeverity(undefined)).toBe('informational');
    expect(normalizeSeverity('banana')).toBe('informational');
  });
});

// ---------------------------------------------------------------------------
// normalizeConfidence
// ---------------------------------------------------------------------------

describe('normalizeConfidence', () => {
  it('returns 0.5 for undefined/null', () => {
    expect(normalizeConfidence(undefined)).toBe(0.5);
  });

  it('passes through numbers in 0-1 range', () => {
    expect(normalizeConfidence(0.75)).toBe(0.75);
    expect(normalizeConfidence(0)).toBe(0);
    expect(normalizeConfidence(1)).toBe(1);
  });

  it('converts 0-100 scale numbers', () => {
    expect(normalizeConfidence(85)).toBe(0.85);
    expect(normalizeConfidence(100)).toBe(1);
    expect(normalizeConfidence(50)).toBe(0.5);
  });

  it('maps string labels', () => {
    expect(normalizeConfidence('high')).toBe(0.9);
    expect(normalizeConfidence('certain')).toBe(0.9);
    expect(normalizeConfidence('medium')).toBe(0.7);
    expect(normalizeConfidence('moderate')).toBe(0.7);
    expect(normalizeConfidence('firm')).toBe(0.7);
    expect(normalizeConfidence('low')).toBe(0.3);
    expect(normalizeConfidence('tentative')).toBe(0.3);
  });

  it('parses numeric strings', () => {
    expect(normalizeConfidence('0.8')).toBe(0.8);
    expect(normalizeConfidence('75')).toBe(0.75);
  });

  it('returns 0.5 for unparseable strings', () => {
    expect(normalizeConfidence('banana')).toBe(0.5);
  });

  it('clamps values to [0, 1]', () => {
    expect(normalizeConfidence(-0.5)).toBe(0);
    expect(normalizeConfidence(200)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// normalizeFinding
// ---------------------------------------------------------------------------

describe('normalizeFinding', () => {
  it('normalizes a raw finding with standard fields', () => {
    const raw: RawFinding = {
      title: 'SQL injection',
      description: 'User input in raw query',
      severity: 'high',
      category: 'injection',
      file: 'src/db.ts',
      line: 42,
      column: 10,
      cweId: 'CWE-89',
      owasp: 'A03:2021-Injection',
      confidence: 0.95,
      metadata: {ruleId: 'sql-001'},
    };
    const result = normalizeFinding(raw, 'semgrep');
    expect(result.id).toBeTruthy();
    expect(result.title).toBe('SQL injection');
    expect(result.description).toBe('User input in raw query');
    expect(result.severity).toBe('high');
    expect(result.category).toBe('injection');
    expect(result.source).toBe('semgrep');
    expect(result.file).toBe('src/db.ts');
    expect(result.line).toBe(42);
    expect(result.column).toBe(10);
    expect(result.cwe).toBe('CWE-89');
    expect(result.owasp).toBe('A03:2021-Injection');
    expect(result.confidence).toBe(0.95);
    expect(result.metadata).toEqual({ruleId: 'sql-001'});
  });

  it('uses ruleId as title when title is missing', () => {
    const raw: RawFinding = {ruleId: 'xss-check-1'};
    const result = normalizeFinding(raw, 'eslint');
    expect(result.title).toBe('xss-check-1');
  });

  it('defaults title to "Untitled finding" when neither title nor ruleId is present', () => {
    const raw: RawFinding = {};
    const result = normalizeFinding(raw, 'custom');
    expect(result.title).toBe('Untitled finding');
  });

  it('uses alternative field names (path, startLine, startColumn, message)', () => {
    const raw: RawFinding = {
      title: 'Path issue',
      message: 'Found via message field',
      path: 'lib/utils.ts',
      startLine: 100,
      startColumn: 5,
    };
    const result = normalizeFinding(raw, 'trivy');
    expect(result.file).toBe('lib/utils.ts');
    expect(result.line).toBe(100);
    expect(result.column).toBe(5);
    expect(result.description).toBe('Found via message field');
  });

  it('handles CWE as an array (takes first)', () => {
    const raw: RawFinding = {title: 'Multiple CWEs', cwe: ['CWE-79', 'CWE-80']};
    const result = normalizeFinding(raw, 'scanner');
    expect(result.cwe).toBe('CWE-79');
  });

  it('uses owaspCategory as fallback for owasp', () => {
    const raw: RawFinding = {title: 'Auth issue', owaspCategory: 'A07:2021-Auth'};
    const result = normalizeFinding(raw, 'scanner');
    expect(result.owasp).toBe('A07:2021-Auth');
  });

  it('uses type as fallback for category', () => {
    const raw: RawFinding = {title: 'Issue', type: 'dependency'};
    const result = normalizeFinding(raw, 'npm-audit');
    expect(result.category).toBe('dependency');
  });

  it('defaults to empty metadata when not provided', () => {
    const raw: RawFinding = {title: 'Issue'};
    const result = normalizeFinding(raw, 'scanner');
    expect(result.metadata).toEqual({});
  });

  it('generates unique IDs for each normalized finding', () => {
    const raw: RawFinding = {title: 'Same'};
    const a = normalizeFinding(raw, 's');
    const b = normalizeFinding(raw, 's');
    expect(a.id).not.toBe(b.id);
  });
});

// ---------------------------------------------------------------------------
// validateFinding
// ---------------------------------------------------------------------------

function makeValid(overrides: Partial<NormalizedFinding> = {}): NormalizedFinding {
  return {
    id: 'abcdef01-2345-4678-9abc-def012345678',
    title: 'Test finding',
    description: 'A test.',
    severity: 'high',
    category: 'injection',
    source: 'semgrep',
    confidence: 0.8,
    metadata: {},
    ...overrides,
  };
}

describe('validateFinding', () => {
  it('returns valid for a correct finding', () => {
    const result = validateFinding(makeValid());
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('reports missing id', () => {
    const result = validateFinding(makeValid({id: ''}));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'id')).toBe(true);
  });

  it('reports missing title', () => {
    const result = validateFinding(makeValid({title: ''}));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'title')).toBe(true);
  });

  it('reports missing source', () => {
    const result = validateFinding(makeValid({source: ''}));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'source')).toBe(true);
  });

  it('reports missing category', () => {
    const result = validateFinding(makeValid({category: ''}));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'category')).toBe(true);
  });

  it('reports invalid severity', () => {
    const result = validateFinding(makeValid({severity: 'banana' as never}));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'severity')).toBe(true);
  });

  it('reports out-of-range confidence', () => {
    const low = validateFinding(makeValid({confidence: -0.1}));
    expect(low.valid).toBe(false);
    expect(low.errors.some((e) => e.field === 'confidence')).toBe(true);
    const high = validateFinding(makeValid({confidence: 1.5}));
    expect(high.valid).toBe(false);
    expect(high.errors.some((e) => e.field === 'confidence')).toBe(true);
  });

  it('reports invalid CWE format', () => {
    const result = validateFinding(makeValid({cwe: 'not-a-cwe'}));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'cwe')).toBe(true);
  });

  it('accepts valid CWE format', () => {
    const result = validateFinding(makeValid({cwe: 'CWE-79'}));
    expect(result.valid).toBe(true);
  });

  it('accepts undefined CWE (optional field)', () => {
    const result = validateFinding(makeValid({cwe: undefined}));
    expect(result.valid).toBe(true);
  });

  it('reports invalid line number', () => {
    expect(validateFinding(makeValid({line: 0})).valid).toBe(false);
    expect(validateFinding(makeValid({line: -1})).valid).toBe(false);
    expect(validateFinding(makeValid({line: 1.5})).valid).toBe(false);
  });

  it('reports invalid column number', () => {
    const result = validateFinding(makeValid({column: 0}));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'column')).toBe(true);
  });

  it('accepts valid line and column', () => {
    const result = validateFinding(makeValid({line: 42, column: 10}));
    expect(result.valid).toBe(true);
  });

  it('collects multiple errors', () => {
    const result = validateFinding(
      makeValid({id: '', title: '', severity: 'x' as never, confidence: 2}),
    );
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(4);
  });

  it('reports non-string description', () => {
    const result = validateFinding(makeValid({description: 42 as unknown as string}));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'description')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// buildFindingsReport
// ---------------------------------------------------------------------------

describe('buildFindingsReport', () => {
  it('builds a report with correct summary counts', () => {
    const findings: NormalizedFinding[] = [
      makeValid({severity: 'critical'}),
      makeValid({severity: 'high'}),
      makeValid({severity: 'high'}),
      makeValid({severity: 'medium'}),
      makeValid({severity: 'low'}),
      makeValid({severity: 'informational'}),
    ];
    const metadata = {scanTime: '2026-01-01T00:00:00.000Z', target: '/path/to/repo'};
    const report = buildFindingsReport(findings, metadata);
    expect(report.findings).toHaveLength(6);
    expect(report.summary.critical).toBe(1);
    expect(report.summary.high).toBe(2);
    expect(report.summary.medium).toBe(1);
    expect(report.summary.low).toBe(1);
    expect(report.summary.informational).toBe(1);
    expect(report.metadata).toBe(metadata);
  });

  it('handles empty findings array', () => {
    const metadata = {scanTime: '2026-01-01T00:00:00.000Z', target: '/repo'};
    const report = buildFindingsReport([], metadata);
    expect(report.findings).toHaveLength(0);
    expect(report.summary.critical).toBe(0);
    expect(report.summary.high).toBe(0);
    expect(report.summary.medium).toBe(0);
    expect(report.summary.low).toBe(0);
    expect(report.summary.informational).toBe(0);
  });

  it('includes optional metadata fields', () => {
    const metadata = {
      scanTime: '2026-01-01T00:00:00.000Z',
      target: '/repo',
      scanners: ['semgrep', 'trivy'],
      durationMs: 12345,
    };
    const report = buildFindingsReport([], metadata);
    expect(report.metadata.scanners).toEqual(['semgrep', 'trivy']);
    expect(report.metadata.durationMs).toBe(12345);
  });
});
