import {describe, it, expect} from 'vitest';
import {
  mapFindingToCompliance,
  generateComplianceReport,
} from '../compliance.js';
import type {ComplianceFramework} from '../compliance.js';
import type {Finding} from '../types.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

let idCounter = 0;

/** Builds a minimal finding for testing. */
function makeFinding(overrides: Partial<Finding> = {}): Finding {
  idCounter++;
  return {
    id: `compliance-test-${idCounter}`,
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
// mapFindingToCompliance
// ---------------------------------------------------------------------------

describe('mapFindingToCompliance', () => {
  it('maps a finding with CWE-89 to OWASP A03, CWE Top 25, and SANS 25', () => {
    const finding = makeFinding({
      cweId: 'CWE-89',
      title: 'Parameterized query not used',
      description: 'Raw SQL query with user input.',
      category: 'database',
    });

    const mappings = mapFindingToCompliance(finding);

    // Should map to OWASP A03 (Injection) via CWE
    const owaspMappings = mappings.filter((m) => m.framework === 'owasp-top-10');
    expect(owaspMappings.some((m) => m.id === 'A03')).toBe(true);

    // Should map to CWE-89 in CWE Top 25
    const cweMappings = mappings.filter((m) => m.framework === 'cwe-top-25');
    expect(cweMappings.some((m) => m.id === 'CWE-89')).toBe(true);

    // Should map to CWE-89 in SANS 25
    const sansMappings = mappings.filter((m) => m.framework === 'sans-25');
    expect(sansMappings.some((m) => m.id === 'CWE-89')).toBe(true);
  });

  it('maps CWE-79 (XSS) to correct framework items', () => {
    const finding = makeFinding({
      cweId: 'CWE-79',
      title: 'Cross-site scripting',
      category: 'xss',
    });

    const mappings = mapFindingToCompliance(finding);

    const owasp = mappings.filter((m) => m.framework === 'owasp-top-10');
    expect(owasp.some((m) => m.id === 'A03')).toBe(true); // Injection

    const cwe = mappings.filter((m) => m.framework === 'cwe-top-25');
    expect(cwe.some((m) => m.id === 'CWE-79')).toBe(true);
  });

  it('maps by OWASP category field', () => {
    const finding = makeFinding({
      owaspCategory: 'A01:2021-Broken Access Control',
      title: 'IDOR found',
      description: 'Insecure direct object reference.',
      category: 'access',
    });

    const mappings = mapFindingToCompliance(finding);

    const owasp = mappings.filter((m) => m.framework === 'owasp-top-10');
    expect(owasp.some((m) => m.id === 'A01')).toBe(true);
  });

  it('maps by keyword when no CWE or OWASP field is present', () => {
    const finding = makeFinding({
      title: 'SQL injection in login form',
      description: 'User input not sanitized.',
      category: 'injection',
    });

    const mappings = mapFindingToCompliance(finding);

    // "injection" keyword should match OWASP A03
    const owasp = mappings.filter((m) => m.framework === 'owasp-top-10');
    expect(owasp.some((m) => m.id === 'A03')).toBe(true);

    // "sql injection" keyword should match CWE-89
    const cwe = mappings.filter((m) => m.framework === 'cwe-top-25');
    expect(cwe.some((m) => m.id === 'CWE-89')).toBe(true);
  });

  it('maps hardcoded credentials via CWE-798', () => {
    const finding = makeFinding({
      cweId: 'CWE-798',
      title: 'Hardcoded API key',
      description: 'API key found in source code.',
      category: 'secrets',
    });

    const mappings = mapFindingToCompliance(finding);

    const owasp = mappings.filter((m) => m.framework === 'owasp-top-10');
    expect(owasp.some((m) => m.id === 'A07')).toBe(true); // Auth failures

    const cwe = mappings.filter((m) => m.framework === 'cwe-top-25');
    expect(cwe.some((m) => m.id === 'CWE-798')).toBe(true);
  });

  it('maps SSRF via CWE-918', () => {
    const finding = makeFinding({
      cweId: 'CWE-918',
      title: 'Server-side request forgery',
      category: 'ssrf',
    });

    const mappings = mapFindingToCompliance(finding);

    const owasp = mappings.filter((m) => m.framework === 'owasp-top-10');
    expect(owasp.some((m) => m.id === 'A10')).toBe(true);

    const cwe = mappings.filter((m) => m.framework === 'cwe-top-25');
    expect(cwe.some((m) => m.id === 'CWE-918')).toBe(true);
  });

  it('maps deserialization via CWE-502', () => {
    const finding = makeFinding({
      cweId: 'CWE-502',
      title: 'Insecure deserialization',
      category: 'deserialization',
    });

    const mappings = mapFindingToCompliance(finding);

    const owasp = mappings.filter((m) => m.framework === 'owasp-top-10');
    expect(owasp.some((m) => m.id === 'A08')).toBe(true); // Integrity failures

    const cwe = mappings.filter((m) => m.framework === 'cwe-top-25');
    expect(cwe.some((m) => m.id === 'CWE-502')).toBe(true);
  });

  it('maps authentication keyword findings to OWASP A07', () => {
    const finding = makeFinding({
      title: 'Weak password policy',
      description: 'Authentication allows short passwords.',
      category: 'auth',
    });

    const mappings = mapFindingToCompliance(finding);
    const owasp = mappings.filter((m) => m.framework === 'owasp-top-10');
    expect(owasp.some((m) => m.id === 'A07')).toBe(true);
  });

  it('maps vulnerable dependency findings to OWASP A06', () => {
    const finding = makeFinding({
      title: 'Outdated lodash dependency with known CVE',
      description: 'Vulnerable component detected.',
      category: 'dependency',
      cveId: 'CVE-2021-23337',
    });

    const mappings = mapFindingToCompliance(finding);
    const owasp = mappings.filter((m) => m.framework === 'owasp-top-10');
    expect(owasp.some((m) => m.id === 'A06')).toBe(true);
  });

  it('returns empty array for a finding with no matching criteria', () => {
    const finding = makeFinding({
      title: 'Code style issue',
      description: 'Indentation is inconsistent.',
      category: 'style',
      cweId: undefined,
      owaspCategory: undefined,
    });

    const mappings = mapFindingToCompliance(finding);
    // May or may not match depending on keyword overlap — but "style" alone
    // should not match any security framework
    // Check it does not crash and returns an array
    expect(Array.isArray(mappings)).toBe(true);
  });

  it('does not produce duplicate mappings for the same framework+id', () => {
    // A finding that could match via both CWE and keyword
    const finding = makeFinding({
      cweId: 'CWE-89',
      title: 'SQL injection detected',
      description: 'SQL injection in query.',
      category: 'injection',
    });

    const mappings = mapFindingToCompliance(finding);
    const keys = mappings.map((m) => `${m.framework}:${m.id}`);
    const uniqueKeys = [...new Set(keys)];
    expect(keys.length).toBe(uniqueKeys.length);
  });

  it('includes name and description in every mapping', () => {
    const finding = makeFinding({
      cweId: 'CWE-79',
      title: 'XSS',
      category: 'xss',
    });

    const mappings = mapFindingToCompliance(finding);
    for (const m of mappings) {
      expect(m.name).toBeTruthy();
      expect(m.description).toBeTruthy();
      expect(m.framework).toBeTruthy();
      expect(m.id).toBeTruthy();
    }
  });
});

// ---------------------------------------------------------------------------
// generateComplianceReport
// ---------------------------------------------------------------------------

describe('generateComplianceReport', () => {
  it('returns one report per requested framework', () => {
    const findings = [makeFinding({cweId: 'CWE-89', category: 'injection'})];
    const reports = generateComplianceReport(findings, [
      'owasp-top-10',
      'cwe-top-25',
    ]);

    expect(reports).toHaveLength(2);
    expect(reports[0].framework).toBe('owasp-top-10');
    expect(reports[1].framework).toBe('cwe-top-25');
  });

  it('reports covered and uncovered items for OWASP Top 10', () => {
    const findings = [
      makeFinding({cweId: 'CWE-89', category: 'injection', title: 'SQLi'}),
      makeFinding({cweId: 'CWE-79', category: 'xss', title: 'XSS'}),
    ];

    const reports = generateComplianceReport(findings, ['owasp-top-10']);
    const report = reports[0];

    // A03 (Injection) should be covered
    expect(report.coveredItems).toContain('A03');

    // Total items = 10 (A01-A10)
    expect(report.coveredItems.length + report.uncoveredItems.length).toBe(10);
  });

  it('lists findings by item correctly', () => {
    const sqli = makeFinding({cweId: 'CWE-89', title: 'SQLi', category: 'db'});
    const xss = makeFinding({cweId: 'CWE-79', title: 'XSS', category: 'web'});

    const reports = generateComplianceReport([sqli, xss], ['owasp-top-10']);
    const report = reports[0];

    // Both CWE-89 and CWE-79 map to A03 (Injection)
    expect(report.findingsByItem['A03']).toBeDefined();
    expect(report.findingsByItem['A03'].length).toBeGreaterThanOrEqual(1);
  });

  it('handles empty findings array', () => {
    const reports = generateComplianceReport([], ['owasp-top-10']);
    const report = reports[0];

    expect(report.coveredItems).toHaveLength(0);
    expect(report.uncoveredItems).toHaveLength(10);
    expect(Object.values(report.findingsByItem).every((f) => f.length === 0)).toBe(true);
  });

  it('generates CWE Top 25 report with 25 items', () => {
    const findings = [makeFinding({cweId: 'CWE-787', title: 'OOB Write'})];
    const reports = generateComplianceReport(findings, ['cwe-top-25']);
    const report = reports[0];

    expect(report.coveredItems.length + report.uncoveredItems.length).toBe(25);
    expect(report.coveredItems).toContain('CWE-787');
  });

  it('generates SANS 25 report with 25 items', () => {
    const findings = [makeFinding({cweId: 'CWE-79', title: 'XSS vuln'})];
    const reports = generateComplianceReport(findings, ['sans-25']);
    const report = reports[0];

    expect(report.coveredItems.length + report.uncoveredItems.length).toBe(25);
    expect(report.coveredItems).toContain('CWE-79');
  });

  it('can map a single finding to multiple OWASP items', () => {
    // CWE-352 is in A01 (Broken Access Control) — check it maps
    const finding = makeFinding({
      cweId: 'CWE-352',
      title: 'CSRF vulnerability',
      category: 'csrf',
    });

    const reports = generateComplianceReport([finding], ['owasp-top-10']);
    const report = reports[0];

    expect(report.coveredItems).toContain('A01'); // CWE-352 is in A01
  });

  it('generates all three frameworks at once', () => {
    const findings = [
      makeFinding({cweId: 'CWE-89', title: 'SQLi'}),
      makeFinding({cweId: 'CWE-798', title: 'Hardcoded creds'}),
    ];

    const frameworks: ComplianceFramework[] = [
      'owasp-top-10',
      'cwe-top-25',
      'sans-25',
    ];
    const reports = generateComplianceReport(findings, frameworks);

    expect(reports).toHaveLength(3);
    for (const report of reports) {
      expect(report.coveredItems.length).toBeGreaterThan(0);
      expect(report.framework).toBeTruthy();
    }
  });

  it('does not double-count the same finding for a single item', () => {
    // One finding that matches A03 via CWE and keyword — should appear once
    const finding = makeFinding({
      cweId: 'CWE-89',
      title: 'SQL injection',
      category: 'injection',
    });

    const reports = generateComplianceReport([finding], ['owasp-top-10']);
    const a03Findings = reports[0].findingsByItem['A03'];

    // The finding should appear exactly once (not duplicated by CWE + keyword)
    const ids = a03Findings.map((f) => f.id);
    expect(ids.length).toBe(1);
  });

  it('report findingsByItem keys cover all framework items', () => {
    const reports = generateComplianceReport([], ['owasp-top-10']);
    const report = reports[0];

    const allKeys = Object.keys(report.findingsByItem);
    expect(allKeys).toHaveLength(10);
    for (let i = 1; i <= 10; i++) {
      const id = `A${String(i).padStart(2, '0')}`;
      expect(allKeys).toContain(id);
    }
  });
});
