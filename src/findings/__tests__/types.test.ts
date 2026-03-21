import {describe, it, expect} from 'vitest';
import {createFinding, summarizeFindings} from '../types.js';
import type {Finding} from '../types.js';

/** Builds a minimal finding for testing. */
function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: 'test-id',
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

describe('createFinding', () => {
  it('generates a unique UUID id', () => {
    const a = createFinding({
      source: 'scanner',
      category: 'auth',
      severity: 'high',
      rawSeverity: 'high',
      title: 'Finding A',
      description: 'desc',
      confidence: 0.9,
    });
    const b = createFinding({
      source: 'scanner',
      category: 'auth',
      severity: 'high',
      rawSeverity: 'high',
      title: 'Finding B',
      description: 'desc',
      confidence: 0.9,
    });

    expect(a.id).toBeTruthy();
    expect(b.id).toBeTruthy();
    expect(a.id).not.toBe(b.id);
    // UUID v4 format
    expect(a.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('sets createdAt to a valid ISO 8601 string', () => {
    const finding = createFinding({
      source: 'llm',
      category: 'pii',
      severity: 'medium',
      rawSeverity: 'medium',
      title: 'PII leak',
      description: 'desc',
      confidence: 0.7,
    });

    expect(finding.createdAt).toBeTruthy();
    const parsed = new Date(finding.createdAt);
    expect(parsed.toISOString()).toBe(finding.createdAt);
  });

  it('sets status to open', () => {
    const finding = createFinding({
      source: 'manual',
      category: 'dependencies',
      severity: 'low',
      rawSeverity: 'low',
      title: 'Outdated dep',
      description: 'desc',
      confidence: 1,
    });

    expect(finding.status).toBe('open');
  });

  it('preserves all provided fields', () => {
    const finding = createFinding({
      source: 'scanner',
      scanner: 'semgrep',
      category: 'injection',
      severity: 'critical',
      rawSeverity: 'high',
      title: 'SQL injection',
      description: 'User input in raw query',
      file: 'src/db.ts',
      line: 42,
      column: 10,
      confidence: 0.95,
      cweId: 'CWE-89',
      cveId: 'CVE-2024-1234',
      owaspCategory: 'A03:2021-Injection',
      suggestedFix: 'Use parameterized queries',
      contextualNote: 'This is in a public route',
      metadata: {ruleId: 'sql-injection-1'},
    });

    expect(finding.source).toBe('scanner');
    expect(finding.scanner).toBe('semgrep');
    expect(finding.category).toBe('injection');
    expect(finding.severity).toBe('critical');
    expect(finding.rawSeverity).toBe('high');
    expect(finding.file).toBe('src/db.ts');
    expect(finding.line).toBe(42);
    expect(finding.column).toBe(10);
    expect(finding.cweId).toBe('CWE-89');
    expect(finding.cveId).toBe('CVE-2024-1234');
    expect(finding.owaspCategory).toBe('A03:2021-Injection');
    expect(finding.suggestedFix).toBe('Use parameterized queries');
    expect(finding.contextualNote).toBe('This is in a public route');
    expect(finding.metadata).toEqual({ruleId: 'sql-injection-1'});
  });
});

describe('summarizeFindings', () => {
  it('counts by severity correctly', () => {
    const findings: Finding[] = [
      makeFinding({severity: 'critical'}),
      makeFinding({severity: 'high'}),
      makeFinding({severity: 'high'}),
      makeFinding({severity: 'medium'}),
      makeFinding({severity: 'low'}),
      makeFinding({severity: 'informational'}),
    ];

    const summary = summarizeFindings(findings);

    expect(summary.total).toBe(6);
    expect(summary.bySeverity.critical).toBe(1);
    expect(summary.bySeverity.high).toBe(2);
    expect(summary.bySeverity.medium).toBe(1);
    expect(summary.bySeverity.low).toBe(1);
    expect(summary.bySeverity.informational).toBe(1);
  });

  it('counts by category correctly', () => {
    const findings: Finding[] = [
      makeFinding({category: 'injection'}),
      makeFinding({category: 'injection'}),
      makeFinding({category: 'auth'}),
      makeFinding({category: 'pii'}),
    ];

    const summary = summarizeFindings(findings);

    expect(summary.byCategory).toEqual({
      injection: 2,
      auth: 1,
      pii: 1,
    });
  });

  it('counts by source correctly', () => {
    const findings: Finding[] = [
      makeFinding({source: 'scanner'}),
      makeFinding({source: 'scanner'}),
      makeFinding({source: 'llm'}),
      makeFinding({source: 'manual'}),
    ];

    const summary = summarizeFindings(findings);

    expect(summary.bySource.scanner).toBe(2);
    expect(summary.bySource.llm).toBe(1);
    expect(summary.bySource.manual).toBe(1);
  });

  it('handles an empty array', () => {
    const summary = summarizeFindings([]);

    expect(summary.total).toBe(0);
    expect(summary.bySeverity).toEqual({
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      informational: 0,
    });
    expect(summary.byCategory).toEqual({});
    expect(summary.bySource).toEqual({
      scanner: 0,
      llm: 0,
      manual: 0,
    });
  });
});
