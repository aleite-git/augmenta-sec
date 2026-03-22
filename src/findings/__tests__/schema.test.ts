import {describe, it, expect} from 'vitest';
import {normalizeFinding, normalizeSeverity, normalizeConfidence, validateFinding, buildFindingsReport} from '../schema.js';
import type {NormalizedFinding, RawFinding} from '../schema.js';

describe('normalizeSeverity', () => {
  it('maps standard labels', () => { expect(normalizeSeverity('critical')).toBe('critical'); expect(normalizeSeverity('high')).toBe('high'); expect(normalizeSeverity('medium')).toBe('medium'); expect(normalizeSeverity('low')).toBe('low'); expect(normalizeSeverity('informational')).toBe('informational'); });
  it('maps aliases', () => { expect(normalizeSeverity('crit')).toBe('critical'); expect(normalizeSeverity('error')).toBe('high'); expect(normalizeSeverity('warning')).toBe('medium'); expect(normalizeSeverity('moderate')).toBe('medium'); expect(normalizeSeverity('minor')).toBe('low'); expect(normalizeSeverity('info')).toBe('informational'); expect(normalizeSeverity('note')).toBe('informational'); });
  it('case-insensitive', () => { expect(normalizeSeverity('HIGH')).toBe('high'); expect(normalizeSeverity('  Medium  ')).toBe('medium'); });
  it('defaults to informational', () => { expect(normalizeSeverity(undefined)).toBe('informational'); expect(normalizeSeverity('banana')).toBe('informational'); });
});

describe('normalizeConfidence', () => {
  it('returns 0.5 for undefined', () => { expect(normalizeConfidence(undefined)).toBe(0.5); });
  it('passes through 0-1', () => { expect(normalizeConfidence(0.75)).toBe(0.75); expect(normalizeConfidence(0)).toBe(0); expect(normalizeConfidence(1)).toBe(1); });
  it('converts 0-100 scale', () => { expect(normalizeConfidence(85)).toBe(0.85); expect(normalizeConfidence(100)).toBe(1); });
  it('maps string labels', () => { expect(normalizeConfidence('high')).toBe(0.9); expect(normalizeConfidence('medium')).toBe(0.7); expect(normalizeConfidence('low')).toBe(0.3); expect(normalizeConfidence('firm')).toBe(0.7); });
  it('parses numeric strings', () => { expect(normalizeConfidence('0.8')).toBe(0.8); expect(normalizeConfidence('75')).toBe(0.75); });
  it('returns 0.5 for unparseable', () => { expect(normalizeConfidence('banana')).toBe(0.5); });
  it('clamps', () => { expect(normalizeConfidence(-0.5)).toBe(0); expect(normalizeConfidence(200)).toBe(1); });
});

describe('normalizeFinding', () => {
  it('normalizes standard fields', () => {
    const raw: RawFinding = {title: 'SQL injection', description: 'desc', severity: 'high', category: 'injection', file: 'src/db.ts', line: 42, column: 10, cweId: 'CWE-89', owasp: 'A03:2021', confidence: 0.95, metadata: {ruleId: 'sql-001'}};
    const r = normalizeFinding(raw, 'semgrep');
    expect(r.id).toBeTruthy(); expect(r.title).toBe('SQL injection'); expect(r.severity).toBe('high'); expect(r.source).toBe('semgrep'); expect(r.cwe).toBe('CWE-89');
  });
  it('uses ruleId as title fallback', () => { expect(normalizeFinding({ruleId: 'xss-1'}, 'e').title).toBe('xss-1'); });
  it('defaults title to Untitled', () => { expect(normalizeFinding({}, 'c').title).toBe('Untitled finding'); });
  it('uses alt field names', () => { const r = normalizeFinding({title: 'P', message: 'msg', path: 'lib/u.ts', startLine: 100, startColumn: 5}, 't'); expect(r.file).toBe('lib/u.ts'); expect(r.line).toBe(100); expect(r.description).toBe('msg'); });
  it('handles CWE array', () => { expect(normalizeFinding({title: 'M', cwe: ['CWE-79', 'CWE-80']}, 's').cwe).toBe('CWE-79'); });
  it('unique IDs', () => { const a = normalizeFinding({title: 'S'}, 's'); const b = normalizeFinding({title: 'S'}, 's'); expect(a.id).not.toBe(b.id); });
  it('defaults metadata to empty', () => { expect(normalizeFinding({title: 'I'}, 's').metadata).toEqual({}); });
  it('uses type as category fallback', () => { expect(normalizeFinding({title: 'I', type: 'dep'}, 'n').category).toBe('dep'); });
  it('uses owaspCategory fallback', () => { expect(normalizeFinding({title: 'A', owaspCategory: 'A07'}, 's').owasp).toBe('A07'); });
});

function makeValid(o: Partial<NormalizedFinding> = {}): NormalizedFinding {
  return {id: 'abc-123', title: 'Test', description: 'A test.', severity: 'high', category: 'injection', source: 'semgrep', confidence: 0.8, metadata: {}, ...o};
}

describe('validateFinding', () => {
  it('valid finding', () => { expect(validateFinding(makeValid()).valid).toBe(true); });
  it('missing id', () => { expect(validateFinding(makeValid({id: ''})).valid).toBe(false); });
  it('missing title', () => { expect(validateFinding(makeValid({title: ''})).valid).toBe(false); });
  it('missing source', () => { expect(validateFinding(makeValid({source: ''})).valid).toBe(false); });
  it('missing category', () => { expect(validateFinding(makeValid({category: ''})).valid).toBe(false); });
  it('invalid severity', () => { expect(validateFinding(makeValid({severity: 'x' as never})).valid).toBe(false); });
  it('bad confidence', () => { expect(validateFinding(makeValid({confidence: -0.1})).valid).toBe(false); expect(validateFinding(makeValid({confidence: 1.5})).valid).toBe(false); });
  it('bad CWE', () => { expect(validateFinding(makeValid({cwe: 'bad'})).valid).toBe(false); });
  it('valid CWE', () => { expect(validateFinding(makeValid({cwe: 'CWE-79'})).valid).toBe(true); });
  it('undefined CWE', () => { expect(validateFinding(makeValid({cwe: undefined})).valid).toBe(true); });
  it('bad line', () => { expect(validateFinding(makeValid({line: 0})).valid).toBe(false); expect(validateFinding(makeValid({line: -1})).valid).toBe(false); expect(validateFinding(makeValid({line: 1.5})).valid).toBe(false); });
  it('bad column', () => { expect(validateFinding(makeValid({column: 0})).valid).toBe(false); });
  it('valid line+column', () => { expect(validateFinding(makeValid({line: 42, column: 10})).valid).toBe(true); });
  it('multiple errors', () => { expect(validateFinding(makeValid({id: '', title: '', severity: 'x' as never, confidence: 2})).errors.length).toBeGreaterThanOrEqual(4); });
  it('non-string description', () => { expect(validateFinding(makeValid({description: 42 as unknown as string})).valid).toBe(false); });
});

describe('buildFindingsReport', () => {
  it('summary counts', () => {
    const findings = [makeValid({severity: 'critical'}), makeValid({severity: 'high'}), makeValid({severity: 'high'}), makeValid({severity: 'medium'}), makeValid({severity: 'low'}), makeValid({severity: 'informational'})];
    const r = buildFindingsReport(findings, {scanTime: '2026-01-01T00:00:00Z', target: '/repo'});
    expect(r.summary.critical).toBe(1); expect(r.summary.high).toBe(2); expect(r.summary.medium).toBe(1); expect(r.summary.low).toBe(1); expect(r.summary.informational).toBe(1);
  });
  it('empty findings', () => { const r = buildFindingsReport([], {scanTime: '2026-01-01T00:00:00Z', target: '/r'}); expect(r.findings).toHaveLength(0); expect(r.summary.critical).toBe(0); });
  it('metadata', () => { const m = {scanTime: '2026-01-01T00:00:00Z', target: '/r', scanners: ['s'], durationMs: 123}; expect(buildFindingsReport([], m).metadata.durationMs).toBe(123); });
});
