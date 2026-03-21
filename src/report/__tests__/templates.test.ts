/**
 * Tests for report templates (ASEC-154).
 */

import {describe, it, expect} from 'vitest';
import {
  renderReport,
  getTemplate,
  getTemplateNames,
} from '../templates.js';
import type {ReportTemplate} from '../templates.js';
import type {Finding, FindingsReport, Severity} from '../../findings/types.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: 'test-id-1',
    source: 'scanner',
    category: 'injection',
    severity: 'high',
    rawSeverity: 'high',
    title: 'SQL Injection in query builder',
    description: 'User input flows into raw SQL query without sanitization.',
    confidence: 0.9,
    status: 'open',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeReport(overrides: Partial<FindingsReport> = {}): FindingsReport {
  return {
    version: '1.0.0',
    generatedAt: '2026-03-21T12:00:00.000Z',
    target: '/test/project',
    summary: {
      total: 0,
      bySeverity: {critical: 0, high: 0, medium: 0, low: 0, informational: 0},
      byCategory: {},
      bySource: {scanner: 0, llm: 0, manual: 0},
    },
    findings: [],
    ...overrides,
  };
}

function makeReportWithFindings(): FindingsReport {
  const findings: Finding[] = [
    makeFinding({
      id: 'f1',
      severity: 'critical',
      rawSeverity: 'critical',
      title: 'Remote Code Execution',
      category: 'injection',
      cweId: 'CWE-94',
      owaspCategory: 'A03:2021-Injection',
      suggestedFix: 'Sanitize user input before evaluation.',
      contextualNote: 'This is in a public API endpoint.',
    }),
    makeFinding({
      id: 'f2',
      severity: 'high',
      rawSeverity: 'high',
      title: 'SQL Injection',
      category: 'injection',
      cweId: 'CWE-89',
      file: 'src/db.ts',
      line: 42,
    }),
    makeFinding({
      id: 'f3',
      severity: 'medium',
      rawSeverity: 'medium',
      title: 'Missing CSRF Token',
      category: 'auth',
      cweId: 'CWE-352',
    }),
    makeFinding({
      id: 'f4',
      severity: 'low',
      rawSeverity: 'low',
      title: 'Verbose Error Messages',
      category: 'misconfiguration',
      source: 'llm',
    }),
    makeFinding({
      id: 'f5',
      severity: 'informational',
      rawSeverity: 'informational',
      title: 'Outdated Dependency',
      category: 'dependency',
      source: 'scanner',
      scanner: 'trivy',
    }),
  ];

  return makeReport({
    findings,
    summary: {
      total: 5,
      bySeverity: {critical: 1, high: 1, medium: 1, low: 1, informational: 1},
      byCategory: {injection: 2, auth: 1, misconfiguration: 1, dependency: 1},
      bySource: {scanner: 3, llm: 1, manual: 0},
    },
  });
}

// ---------------------------------------------------------------------------
// getTemplateNames()
// ---------------------------------------------------------------------------

describe('getTemplateNames', () => {
  it('returns all three built-in template names', () => {
    const names = getTemplateNames();
    expect(names).toContain('executive-summary');
    expect(names).toContain('technical-detail');
    expect(names).toContain('compliance');
    expect(names).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// getTemplate()
// ---------------------------------------------------------------------------

describe('getTemplate', () => {
  it('returns a template for each built-in name', () => {
    for (const name of ['executive-summary', 'technical-detail', 'compliance']) {
      const template = getTemplate(name);
      expect(template).toBeDefined();
      expect(template!.name).toBe(name);
      expect(template!.description).toBeTruthy();
      expect(template!.sections.length).toBeGreaterThan(0);
    }
  });

  it('returns undefined for unknown template names', () => {
    expect(getTemplate('nonexistent')).toBeUndefined();
  });

  it('each section has title, description, and render function', () => {
    for (const name of getTemplateNames()) {
      const template = getTemplate(name) as ReportTemplate;
      for (const section of template.sections) {
        expect(typeof section.title).toBe('string');
        expect(section.title.length).toBeGreaterThan(0);
        expect(typeof section.description).toBe('string');
        expect(typeof section.render).toBe('function');
      }
    }
  });
});

// ---------------------------------------------------------------------------
// renderReport() — general
// ---------------------------------------------------------------------------

describe('renderReport', () => {
  it('throws for unknown template names', () => {
    const report = makeReport();
    expect(() => renderReport(report, 'unknown')).toThrow(
      /Unknown template "unknown"/,
    );
  });

  it('includes available template names in error message', () => {
    const report = makeReport();
    expect(() => renderReport(report, 'bad')).toThrow(/executive-summary/);
  });

  it('includes the template name in the header', () => {
    const report = makeReport();
    const result = renderReport(report, 'executive-summary');
    expect(result).toContain('executive-summary');
  });

  it('includes version in the footer', () => {
    const report = makeReport({version: '2.5.0'});
    const result = renderReport(report, 'executive-summary');
    expect(result).toContain('AugmentaSec v2.5.0');
  });

  it('renders all sections as separate blocks', () => {
    const report = makeReport();
    const result = renderReport(report, 'executive-summary');
    expect(result).toContain('--- Overview ---');
    expect(result).toContain('--- Severity Breakdown ---');
    expect(result).toContain('--- Top Categories ---');
    expect(result).toContain('--- Recommendations ---');
  });
});

// ---------------------------------------------------------------------------
// renderReport() — executive-summary
// ---------------------------------------------------------------------------

describe('executive-summary template', () => {
  it('includes target and timestamp in overview', () => {
    const report = makeReport({
      target: '/my/repo',
      generatedAt: '2026-03-21T10:00:00Z',
    });
    const result = renderReport(report, 'executive-summary');
    expect(result).toContain('/my/repo');
    expect(result).toContain('2026-03-21T10:00:00Z');
  });

  it('shows correct risk level for critical findings', () => {
    const report = makeReport({
      summary: {
        total: 1,
        bySeverity: {critical: 1, high: 0, medium: 0, low: 0, informational: 0},
        byCategory: {injection: 1},
        bySource: {scanner: 1, llm: 0, manual: 0},
      },
    });
    const result = renderReport(report, 'executive-summary');
    expect(result).toContain('CRITICAL');
  });

  it('shows HIGH risk level when no critical findings', () => {
    const report = makeReport({
      summary: {
        total: 1,
        bySeverity: {critical: 0, high: 2, medium: 0, low: 0, informational: 0},
        byCategory: {},
        bySource: {scanner: 2, llm: 0, manual: 0},
      },
    });
    const result = renderReport(report, 'executive-summary');
    expect(result).toContain('Risk level: HIGH');
  });

  it('shows MEDIUM risk level when only medium findings', () => {
    const report = makeReport({
      summary: {
        total: 1,
        bySeverity: {critical: 0, high: 0, medium: 3, low: 0, informational: 0},
        byCategory: {},
        bySource: {scanner: 3, llm: 0, manual: 0},
      },
    });
    const result = renderReport(report, 'executive-summary');
    expect(result).toContain('Risk level: MEDIUM');
  });

  it('shows LOW risk level when only low findings', () => {
    const report = makeReport({
      summary: {
        total: 1,
        bySeverity: {critical: 0, high: 0, medium: 0, low: 1, informational: 0},
        byCategory: {},
        bySource: {scanner: 1, llm: 0, manual: 0},
      },
    });
    const result = renderReport(report, 'executive-summary');
    expect(result).toContain('Risk level: LOW');
  });

  it('shows INFORMATIONAL risk level when only info findings', () => {
    const report = makeReport({
      summary: {
        total: 0,
        bySeverity: {critical: 0, high: 0, medium: 0, low: 0, informational: 0},
        byCategory: {},
        bySource: {scanner: 0, llm: 0, manual: 0},
      },
    });
    const result = renderReport(report, 'executive-summary');
    expect(result).toContain('Risk level: INFORMATIONAL');
  });

  it('shows severity counts in breakdown', () => {
    const report = makeReportWithFindings();
    const result = renderReport(report, 'executive-summary');
    expect(result).toContain('critical');
    expect(result).toContain('high');
    expect(result).toContain('medium');
    expect(result).toContain('low');
    expect(result).toContain('informational');
  });

  it('shows category counts', () => {
    const report = makeReportWithFindings();
    const result = renderReport(report, 'executive-summary');
    expect(result).toContain('injection: 2');
    expect(result).toContain('auth: 1');
  });

  it('handles empty findings gracefully', () => {
    const report = makeReport();
    const result = renderReport(report, 'executive-summary');
    expect(result).toContain('No findings to categorize');
    expect(result).toContain('No critical or high-severity issues found');
  });

  it('includes URGENT recommendation for critical findings', () => {
    const report = makeReport({
      summary: {
        total: 1,
        bySeverity: {critical: 3, high: 0, medium: 0, low: 0, informational: 0},
        byCategory: {},
        bySource: {scanner: 3, llm: 0, manual: 0},
      },
    });
    const result = renderReport(report, 'executive-summary');
    expect(result).toContain('URGENT');
    expect(result).toContain('3 critical');
  });

  it('includes HIGH PRIORITY recommendation for high findings', () => {
    const report = makeReport({
      summary: {
        total: 2,
        bySeverity: {critical: 0, high: 2, medium: 0, low: 0, informational: 0},
        byCategory: {},
        bySource: {scanner: 2, llm: 0, manual: 0},
      },
    });
    const result = renderReport(report, 'executive-summary');
    expect(result).toContain('HIGH PRIORITY');
    expect(result).toContain('2 high-severity');
  });
});

// ---------------------------------------------------------------------------
// renderReport() — technical-detail
// ---------------------------------------------------------------------------

describe('technical-detail template', () => {
  it('includes source breakdown', () => {
    const report = makeReportWithFindings();
    const result = renderReport(report, 'technical-detail');
    expect(result).toContain('scanner: 3');
    expect(result).toContain('llm:     1');
    expect(result).toContain('manual:  0');
  });

  it('includes full finding details', () => {
    const report = makeReportWithFindings();
    const result = renderReport(report, 'technical-detail');
    expect(result).toContain('Remote Code Execution');
    expect(result).toContain('SQL Injection');
    expect(result).toContain('CWE-94');
    expect(result).toContain('CWE-89');
    expect(result).toContain('src/db.ts:42');
  });

  it('shows suggested fix when present', () => {
    const report = makeReportWithFindings();
    const result = renderReport(report, 'technical-detail');
    expect(result).toContain('Suggested fix:');
    expect(result).toContain('Sanitize user input');
  });

  it('shows contextual note when present', () => {
    const report = makeReportWithFindings();
    const result = renderReport(report, 'technical-detail');
    expect(result).toContain('Context:');
    expect(result).toContain('public API endpoint');
  });

  it('shows scanner name in parentheses', () => {
    const report = makeReportWithFindings();
    const result = renderReport(report, 'technical-detail');
    expect(result).toContain('(trivy)');
  });

  it('handles empty findings', () => {
    const report = makeReport();
    const result = renderReport(report, 'technical-detail');
    expect(result).toContain('No findings.');
  });

  it('sorts findings by severity (critical first)', () => {
    const report = makeReportWithFindings();
    const result = renderReport(report, 'technical-detail');
    const critIdx = result.indexOf('[CRITICAL]');
    const highIdx = result.indexOf('[HIGH]');
    const medIdx = result.indexOf('[MEDIUM]');
    const lowIdx = result.indexOf('[LOW]');
    const infoIdx = result.indexOf('[INFORMATIONAL]');

    expect(critIdx).toBeLessThan(highIdx);
    expect(highIdx).toBeLessThan(medIdx);
    expect(medIdx).toBeLessThan(lowIdx);
    expect(lowIdx).toBeLessThan(infoIdx);
  });

  it('shows OWASP category when present', () => {
    const report = makeReportWithFindings();
    const result = renderReport(report, 'technical-detail');
    expect(result).toContain('A03:2021-Injection');
  });

  it('shows N/A location when file is not set', () => {
    const finding = makeFinding({file: undefined, line: undefined});
    const report = makeReport({
      findings: [finding],
      summary: {
        total: 1,
        bySeverity: {critical: 0, high: 1, medium: 0, low: 0, informational: 0},
        byCategory: {injection: 1},
        bySource: {scanner: 1, llm: 0, manual: 0},
      },
    });
    const result = renderReport(report, 'technical-detail');
    expect(result).toContain('Location: N/A');
  });

  it('shows confidence percentage', () => {
    const finding = makeFinding({confidence: 0.85});
    const report = makeReport({
      findings: [finding],
      summary: {
        total: 1,
        bySeverity: {critical: 0, high: 1, medium: 0, low: 0, informational: 0},
        byCategory: {injection: 1},
        bySource: {scanner: 1, llm: 0, manual: 0},
      },
    });
    const result = renderReport(report, 'technical-detail');
    expect(result).toContain('85%');
  });
});

// ---------------------------------------------------------------------------
// renderReport() — compliance
// ---------------------------------------------------------------------------

describe('compliance template', () => {
  it('includes CWE/OWASP summary section', () => {
    const report = makeReportWithFindings();
    const result = renderReport(report, 'compliance');
    expect(result).toContain('CWE IDs referenced');
    expect(result).toContain('CWE-94');
    expect(result).toContain('CWE-89');
    expect(result).toContain('CWE-352');
  });

  it('includes OWASP categories when present', () => {
    const report = makeReportWithFindings();
    const result = renderReport(report, 'compliance');
    expect(result).toContain('OWASP categories referenced');
    expect(result).toContain('A03:2021-Injection');
  });

  it('shows compliance mappings', () => {
    const report = makeReportWithFindings();
    const result = renderReport(report, 'compliance');
    expect(result).toContain('Compliance Mappings');
    // Should map to at least owasp-top-10
    expect(result).toContain('owasp-top-10');
  });

  it('identifies coverage gaps', () => {
    // With only injection findings, most OWASP categories should be gaps
    const finding = makeFinding({cweId: 'CWE-89'});
    const report = makeReport({
      findings: [finding],
      summary: {
        total: 1,
        bySeverity: {critical: 0, high: 1, medium: 0, low: 0, informational: 0},
        byCategory: {injection: 1},
        bySource: {scanner: 1, llm: 0, manual: 0},
      },
    });
    const result = renderReport(report, 'compliance');
    expect(result).toContain('Coverage Gaps');
    expect(result).toContain('NOT covered');
  });

  it('handles empty findings gracefully', () => {
    const report = makeReport();
    const result = renderReport(report, 'compliance');
    expect(result).toContain('No findings to map');
    expect(result).toContain('No CWE IDs referenced');
    expect(result).toContain('No OWASP categories referenced');
  });

  it('handles findings without CWE IDs', () => {
    const finding = makeFinding({cweId: undefined, owaspCategory: undefined});
    const report = makeReport({
      findings: [finding],
      summary: {
        total: 1,
        bySeverity: {critical: 0, high: 1, medium: 0, low: 0, informational: 0},
        byCategory: {injection: 1},
        bySource: {scanner: 1, llm: 0, manual: 0},
      },
    });
    const result = renderReport(report, 'compliance');
    expect(result).toContain('No CWE IDs referenced');
  });

  it('groups findings by framework in compliance mappings', () => {
    const report = makeReportWithFindings();
    const result = renderReport(report, 'compliance');
    // Should have at least one framework section
    expect(result).toMatch(/\[owasp-top-10\]|\[cwe-top-25\]|\[sans-25\]/);
  });

  it('shows finding count per compliance item', () => {
    const findings: Finding[] = [
      makeFinding({id: 'a', cweId: 'CWE-89', title: 'SQLi 1'}),
      makeFinding({id: 'b', cweId: 'CWE-89', title: 'SQLi 2'}),
    ];
    const report = makeReport({
      findings,
      summary: {
        total: 2,
        bySeverity: {critical: 0, high: 2, medium: 0, low: 0, informational: 0},
        byCategory: {injection: 2},
        bySource: {scanner: 2, llm: 0, manual: 0},
      },
    });
    const result = renderReport(report, 'compliance');
    expect(result).toContain('2 finding(s)');
  });
});
