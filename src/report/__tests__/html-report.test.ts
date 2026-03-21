/**
 * Tests for the HTML report generator (ASEC-156).
 */

import {describe, it, expect} from 'vitest';
import {
  generateHtmlReport,
  generateSeverityChart,
  escapeHtml,
} from '../html-report.js';
import type {FindingsReport, Finding, Severity} from '../../findings/types.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

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

function makeReport(overrides: Partial<FindingsReport> = {}): FindingsReport {
  return {
    version: '1.0',
    generatedAt: '2026-01-01T00:00:00.000Z',
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

// ---------------------------------------------------------------------------
// escapeHtml()
// ---------------------------------------------------------------------------

describe('escapeHtml', () => {
  it('escapes ampersand', () => {
    expect(escapeHtml('a & b')).toBe('a &amp; b');
  });

  it('escapes less-than', () => {
    expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
  });

  it('escapes greater-than', () => {
    expect(escapeHtml('a > b')).toBe('a &gt; b');
  });

  it('escapes double quotes', () => {
    expect(escapeHtml('"hello"')).toBe('&quot;hello&quot;');
  });

  it('escapes single quotes', () => {
    expect(escapeHtml("it's")).toBe('it&#039;s');
  });

  it('handles strings with no special characters', () => {
    expect(escapeHtml('hello world')).toBe('hello world');
  });

  it('handles empty strings', () => {
    expect(escapeHtml('')).toBe('');
  });

  it('escapes multiple special characters in one string', () => {
    expect(escapeHtml('<a href="x">&</a>')).toBe(
      '&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;',
    );
  });
});

// ---------------------------------------------------------------------------
// generateSeverityChart()
// ---------------------------------------------------------------------------

describe('generateSeverityChart', () => {
  it('returns valid SVG markup', () => {
    const bySeverity: Record<Severity, number> = {
      critical: 2,
      high: 5,
      medium: 3,
      low: 1,
      informational: 0,
    };

    const svg = generateSeverityChart(bySeverity);
    expect(svg).toContain('<svg');
    expect(svg).toContain('</svg>');
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
  });

  it('includes all severity labels', () => {
    const bySeverity: Record<Severity, number> = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      informational: 0,
    };

    const svg = generateSeverityChart(bySeverity);
    expect(svg).toContain('critical');
    expect(svg).toContain('high');
    expect(svg).toContain('medium');
    expect(svg).toContain('low');
    expect(svg).toContain('informational');
  });

  it('includes count text for non-zero severities', () => {
    const bySeverity: Record<Severity, number> = {
      critical: 3,
      high: 0,
      medium: 0,
      low: 0,
      informational: 0,
    };

    const svg = generateSeverityChart(bySeverity);
    expect(svg).toContain('>3</text>');
  });

  it('does not show count text for zero values', () => {
    const bySeverity: Record<Severity, number> = {
      critical: 0,
      high: 1,
      medium: 0,
      low: 0,
      informational: 0,
    };

    const svg = generateSeverityChart(bySeverity);
    const countMatches = svg.match(/>(\d+)<\/text>/g);
    expect(countMatches).toHaveLength(1);
    expect(countMatches![0]).toContain('>1</text>');
  });

  it('includes accessibility attributes', () => {
    const bySeverity: Record<Severity, number> = {
      critical: 0, high: 0, medium: 0, low: 0, informational: 0,
    };

    const svg = generateSeverityChart(bySeverity);
    expect(svg).toContain('role="img"');
    expect(svg).toContain('aria-label=');
    expect(svg).toContain('<title>');
  });
});

// ---------------------------------------------------------------------------
// generateHtmlReport()
// ---------------------------------------------------------------------------

describe('generateHtmlReport', () => {
  it('returns a complete HTML document', () => {
    const report = makeReport();
    const html = generateHtmlReport(report);

    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('</html>');
    expect(html).toContain('<head>');
    expect(html).toContain('</head>');
    expect(html).toContain('<body>');
    expect(html).toContain('</body>');
  });

  it('includes the report target', () => {
    const report = makeReport({target: '/my/project'});
    const html = generateHtmlReport(report);
    expect(html).toContain('/my/project');
  });

  it('includes the generation timestamp', () => {
    const report = makeReport({generatedAt: '2026-03-21T12:00:00.000Z'});
    const html = generateHtmlReport(report);
    expect(html).toContain('2026-03-21T12:00:00.000Z');
  });

  it('includes executive summary section', () => {
    const report = makeReport();
    const html = generateHtmlReport(report);
    expect(html).toContain('Executive Summary');
    expect(html).toContain('Total Findings');
    expect(html).toContain('Risk Level');
  });

  it('includes severity distribution chart', () => {
    const report = makeReport();
    const html = generateHtmlReport(report);
    expect(html).toContain('Severity Distribution');
    expect(html).toContain('<svg');
  });

  it('includes findings table headers', () => {
    const report = makeReport();
    const html = generateHtmlReport(report);
    expect(html).toContain('<th>Severity</th>');
    expect(html).toContain('<th>Title</th>');
    expect(html).toContain('<th>Category</th>');
    expect(html).toContain('<th>Location</th>');
    expect(html).toContain('<th>Source</th>');
    expect(html).toContain('<th>CWE</th>');
  });

  it('renders finding rows with correct data', () => {
    const finding = makeFinding({
      severity: 'critical',
      title: 'SQL Injection',
      category: 'injection',
      file: 'src/db.ts',
      line: 42,
      source: 'scanner',
      scanner: 'semgrep',
      cweId: 'CWE-89',
    });

    const report = makeReport({
      findings: [finding],
      summary: {
        total: 1,
        bySeverity: {critical: 1, high: 0, medium: 0, low: 0, informational: 0},
        byCategory: {injection: 1},
        bySource: {scanner: 1, llm: 0, manual: 0},
      },
    });

    const html = generateHtmlReport(report);
    expect(html).toContain('SQL Injection');
    expect(html).toContain('src/db.ts:42');
    expect(html).toContain('semgrep');
    expect(html).toContain('CWE-89');
    expect(html).toContain('critical');
  });

  it('shows "No findings" when there are no findings', () => {
    const report = makeReport({findings: []});
    const html = generateHtmlReport(report);
    expect(html).toContain('No findings');
  });

  it('sorts findings by severity (critical first)', () => {
    const findings = [
      makeFinding({id: '1', severity: 'low', title: 'Low finding'}),
      makeFinding({id: '2', severity: 'critical', title: 'Critical finding'}),
      makeFinding({id: '3', severity: 'medium', title: 'Medium finding'}),
    ];

    const report = makeReport({findings});
    const html = generateHtmlReport(report);

    const critIdx = html.indexOf('Critical finding');
    const medIdx = html.indexOf('Medium finding');
    const lowIdx = html.indexOf('Low finding');

    expect(critIdx).toBeLessThan(medIdx);
    expect(medIdx).toBeLessThan(lowIdx);
  });

  it('escapes HTML in finding titles to prevent XSS', () => {
    const finding = makeFinding({
      title: '<script>alert("xss")</script>',
    });

    const report = makeReport({
      findings: [finding],
      summary: {
        total: 1,
        bySeverity: {critical: 0, high: 1, medium: 0, low: 0, informational: 0},
        byCategory: {injection: 1},
        bySource: {scanner: 1, llm: 0, manual: 0},
      },
    });

    const html = generateHtmlReport(report);
    expect(html).not.toContain('<script>alert("xss")</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('renders dash for missing location', () => {
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

    const html = generateHtmlReport(report);
    expect(html).toMatch(/<code>[^<]*\u2014[^<]*<\/code>/);
  });

  it('renders dash for missing CWE', () => {
    const finding = makeFinding({cweId: undefined});
    const report = makeReport({
      findings: [finding],
      summary: {
        total: 1,
        bySeverity: {critical: 0, high: 1, medium: 0, low: 0, informational: 0},
        byCategory: {injection: 1},
        bySource: {scanner: 1, llm: 0, manual: 0},
      },
    });

    const html = generateHtmlReport(report);
    expect(html).toContain('\u2014</td>');
  });

  it('determines risk level correctly', () => {
    const critReport = makeReport({
      summary: {
        total: 1,
        bySeverity: {critical: 1, high: 0, medium: 0, low: 0, informational: 0},
        byCategory: {},
        bySource: {scanner: 1, llm: 0, manual: 0},
      },
    });
    expect(generateHtmlReport(critReport)).toContain('>Critical</div>');

    const highReport = makeReport({
      summary: {
        total: 1,
        bySeverity: {critical: 0, high: 1, medium: 0, low: 0, informational: 0},
        byCategory: {},
        bySource: {scanner: 1, llm: 0, manual: 0},
      },
    });
    expect(generateHtmlReport(highReport)).toContain('>High</div>');

    const medReport = makeReport({
      summary: {
        total: 1,
        bySeverity: {critical: 0, high: 0, medium: 1, low: 0, informational: 0},
        byCategory: {},
        bySource: {scanner: 1, llm: 0, manual: 0},
      },
    });
    expect(generateHtmlReport(medReport)).toContain('>Medium</div>');

    const lowReport = makeReport({
      summary: {
        total: 0,
        bySeverity: {critical: 0, high: 0, medium: 0, low: 0, informational: 0},
        byCategory: {},
        bySource: {scanner: 0, llm: 0, manual: 0},
      },
    });
    expect(generateHtmlReport(lowReport)).toContain('>Low</div>');
  });

  it('includes inline styles (no external dependencies)', () => {
    const report = makeReport();
    const html = generateHtmlReport(report);
    expect(html).toContain('<style>');
    expect(html).not.toContain('<link rel="stylesheet"');
  });

  it('includes the report version in the footer', () => {
    const report = makeReport({version: '2.0'});
    const html = generateHtmlReport(report);
    expect(html).toContain('AugmentaSec v2.0');
  });

  it('shows scanner name in parentheses when present', () => {
    const finding = makeFinding({source: 'scanner', scanner: 'trivy'});
    const report = makeReport({
      findings: [finding],
      summary: {
        total: 1,
        bySeverity: {critical: 0, high: 1, medium: 0, low: 0, informational: 0},
        byCategory: {injection: 1},
        bySource: {scanner: 1, llm: 0, manual: 0},
      },
    });

    const html = generateHtmlReport(report);
    expect(html).toContain('scanner (trivy)');
  });
});
