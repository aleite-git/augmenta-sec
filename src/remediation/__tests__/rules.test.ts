import {describe, it, expect} from 'vitest';

import type {Finding} from '../../findings/types.js';
import {applyRules, getRules} from '../rules.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: 'test-finding',
    source: 'scanner',
    scanner: 'semgrep',
    category: 'injection',
    severity: 'high',
    rawSeverity: 'high',
    title: 'SQL injection in query builder',
    description: 'User input flows into raw SQL.',
    file: 'src/db/query.ts',
    line: 42,
    confidence: 0.9,
    cweId: 'CWE-89',
    status: 'open',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('getRules', () => {
  it('returns at least 15 built-in rules', () => {
    const rules = getRules();
    expect(rules.length).toBeGreaterThanOrEqual(15);
  });

  it('returns a copy (not the original array)', () => {
    const r1 = getRules();
    const r2 = getRules();
    expect(r1).not.toBe(r2);
    expect(r1).toEqual(r2);
  });

  it('all rules have required fields', () => {
    for (const rule of getRules()) {
      expect(rule.id).toBeTruthy();
      expect(rule.categories.length).toBeGreaterThan(0);
      expect(rule.titlePatterns.length).toBeGreaterThan(0);
      expect(rule.title).toBeTruthy();
      expect(rule.description).toBeTruthy();
      expect(['low', 'medium', 'high']).toContain(rule.effort);
      expect(rule.defaultPriority).toBeGreaterThanOrEqual(0);
      expect(rule.defaultPriority).toBeLessThanOrEqual(100);
    }
  });
});

describe('applyRules', () => {
  it('returns empty array for empty findings', () => {
    expect(applyRules([])).toEqual([]);
  });

  it('matches SQL injection findings', () => {
    const findings = [makeFinding({category: 'injection', title: 'SQL injection in query'})];
    const suggestions = applyRules(findings);

    expect(suggestions.length).toBeGreaterThan(0);
    const sqlSuggestion = suggestions.find((s) =>
      s.title.toLowerCase().includes('parameterized'),
    );
    expect(sqlSuggestion).toBeDefined();
  });

  it('matches XSS findings', () => {
    const findings = [
      makeFinding({
        id: 'xss-1',
        category: 'xss',
        title: 'Cross-site scripting in template',
      }),
    ];
    const suggestions = applyRules(findings);

    expect(suggestions.length).toBeGreaterThan(0);
    const xssSuggestion = suggestions.find(
      (s) =>
        s.title.toLowerCase().includes('sanitize') ||
        s.title.toLowerCase().includes('escape'),
    );
    expect(xssSuggestion).toBeDefined();
  });

  it('matches CSRF findings', () => {
    const findings = [
      makeFinding({id: 'csrf-1', category: 'csrf', title: 'Missing CSRF token'}),
    ];
    const suggestions = applyRules(findings);

    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions.some((s) => s.title.toLowerCase().includes('csrf'))).toBe(
      true,
    );
  });

  it('matches hardcoded secret findings', () => {
    const findings = [
      makeFinding({
        id: 'secret-1',
        category: 'secrets',
        title: 'Hardcoded secret found in source',
      }),
    ];
    const suggestions = applyRules(findings);

    expect(suggestions.length).toBeGreaterThan(0);
    expect(
      suggestions.some((s) => s.title.toLowerCase().includes('secret')),
    ).toBe(true);
  });

  it('matches missing auth findings', () => {
    const findings = [
      makeFinding({
        id: 'auth-1',
        category: 'auth',
        title: 'Missing authentication on endpoint',
      }),
    ];
    const suggestions = applyRules(findings);

    expect(suggestions.length).toBeGreaterThan(0);
    expect(
      suggestions.some((s) => s.title.toLowerCase().includes('auth')),
    ).toBe(true);
  });

  it('matches SSRF findings', () => {
    const findings = [
      makeFinding({id: 'ssrf-1', category: 'ssrf', title: 'Server-side request forgery'}),
    ];
    const suggestions = applyRules(findings);
    expect(suggestions.length).toBeGreaterThan(0);
  });

  it('matches missing HTTPS findings', () => {
    const findings = [
      makeFinding({
        id: 'https-1',
        category: 'transport',
        title: 'Missing HTTPS on endpoint',
      }),
    ];
    const suggestions = applyRules(findings);
    expect(suggestions.length).toBeGreaterThan(0);
  });

  it('matches outdated dependency findings', () => {
    const findings = [
      makeFinding({
        id: 'dep-1',
        category: 'dependencies',
        title: 'Outdated package with known vulnerability',
      }),
    ];
    const suggestions = applyRules(findings);
    expect(suggestions.length).toBeGreaterThan(0);
  });

  it('matches command injection findings', () => {
    const findings = [
      makeFinding({
        id: 'cmd-1',
        category: 'command-injection',
        title: 'Command injection via exec()',
      }),
    ];
    const suggestions = applyRules(findings);
    expect(suggestions.length).toBeGreaterThan(0);
  });

  it('matches path traversal findings', () => {
    const findings = [
      makeFinding({
        id: 'pt-1',
        category: 'path-traversal',
        title: 'Path traversal in file upload',
      }),
    ];
    const suggestions = applyRules(findings);
    expect(suggestions.length).toBeGreaterThan(0);
  });

  it('includes code examples where available', () => {
    const findings = [makeFinding({category: 'injection', title: 'SQL injection'})];
    const suggestions = applyRules(findings);
    const withCode = suggestions.filter((s) => s.codeExample);
    expect(withCode.length).toBeGreaterThan(0);
  });

  it('a single finding can match multiple rules', () => {
    // A finding in 'auth' category with 'missing rbac' in title matches both
    // rule-missing-auth (category match) and rule-missing-rbac (title match)
    const findings = [
      makeFinding({
        id: 'multi-match',
        category: 'auth',
        title: 'Missing RBAC on admin endpoint',
      }),
    ];
    const suggestions = applyRules(findings);
    expect(suggestions.length).toBeGreaterThanOrEqual(2);
  });

  it('returns suggestions with correct findingId', () => {
    const findings = [makeFinding({id: 'my-unique-id'})];
    const suggestions = applyRules(findings);
    for (const s of suggestions) {
      expect(s.findingId).toBe('my-unique-id');
    }
  });

  it('does not match unrelated categories', () => {
    const findings = [
      makeFinding({
        id: 'unrelated',
        category: 'performance',
        title: 'Slow query detected',
      }),
    ];
    const suggestions = applyRules(findings);
    expect(suggestions).toHaveLength(0);
  });
});
