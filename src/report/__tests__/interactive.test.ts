/**
 * Tests for the interactive CLI report viewer (ASEC-156).
 */

import {describe, it, expect} from 'vitest';
import {
  createInteractiveState,
  getCurrentPageFindings,
  renderPage,
  handleKeypress,
  formatFindingSummary,
  formatFindingDetail,
  formatHeader,
  formatFooter,
  severityColor,
  PAGE_SIZE,
  ANSI,
} from '../interactive.js';
import type {InteractiveState} from '../interactive.js';
import type {Finding, FindingsReport, Severity} from '../../findings/types.js';

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
    description: 'A test finding description.',
    confidence: 0.8,
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

function makeManyFindings(count: number): Finding[] {
  const severities: Severity[] = ['critical', 'high', 'medium', 'low', 'informational'];
  return Array.from({length: count}, (_, i) => {
    const sev = severities[i % severities.length];
    return makeFinding({
      id: `f-${i}`,
      severity: sev,
      rawSeverity: sev,
      title: `Finding ${i}`,
      category: `cat-${i % 3}`,
    });
  });
}

function makeReportWithMany(count: number): FindingsReport {
  const findings = makeManyFindings(count);
  return makeReport({
    findings,
    summary: {
      total: count,
      bySeverity: {critical: 0, high: count, medium: 0, low: 0, informational: 0},
      byCategory: {},
      bySource: {scanner: count, llm: 0, manual: 0},
    },
  });
}

function key(str: string): Buffer {
  return Buffer.from(str);
}

// ---------------------------------------------------------------------------
// PAGE_SIZE constant
// ---------------------------------------------------------------------------

describe('PAGE_SIZE', () => {
  it('is 10', () => {
    expect(PAGE_SIZE).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// ANSI constants
// ---------------------------------------------------------------------------

describe('ANSI', () => {
  it('contains reset code', () => {
    expect(ANSI.reset).toBe('\x1b[0m');
  });

  it('contains severity color codes', () => {
    expect(ANSI.critical).toBeDefined();
    expect(ANSI.high).toBeDefined();
    expect(ANSI.medium).toBeDefined();
    expect(ANSI.low).toBeDefined();
    expect(ANSI.informational).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// severityColor()
// ---------------------------------------------------------------------------

describe('severityColor', () => {
  it('returns red for critical', () => {
    expect(severityColor('critical')).toBe(ANSI.critical);
  });

  it('returns different colors for each severity', () => {
    const colors = new Set([
      severityColor('critical'),
      severityColor('high'),
      severityColor('medium'),
      severityColor('low'),
      severityColor('informational'),
    ]);
    expect(colors.size).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// createInteractiveState()
// ---------------------------------------------------------------------------

describe('createInteractiveState', () => {
  it('creates initial state with empty report', () => {
    const report = makeReport();
    const state = createInteractiveState(report);
    expect(state.findings).toHaveLength(0);
    expect(state.selectedIndex).toBe(0);
    expect(state.currentPage).toBe(0);
    expect(state.totalPages).toBe(1);
    expect(state.running).toBe(true);
    expect(state.expandedIndices.size).toBe(0);
  });

  it('sorts findings by severity (critical first)', () => {
    const findings = [
      makeFinding({id: '1', severity: 'low'}),
      makeFinding({id: '2', severity: 'critical'}),
      makeFinding({id: '3', severity: 'medium'}),
    ];
    const report = makeReport({findings});
    const state = createInteractiveState(report);

    expect(state.findings[0].severity).toBe('critical');
    expect(state.findings[1].severity).toBe('medium');
    expect(state.findings[2].severity).toBe('low');
  });

  it('calculates correct page count', () => {
    const report = makeReportWithMany(25);
    const state = createInteractiveState(report);
    expect(state.totalPages).toBe(3); // ceil(25/10)
  });

  it('has at least 1 page even with no findings', () => {
    const report = makeReport();
    const state = createInteractiveState(report);
    expect(state.totalPages).toBe(1);
  });

  it('calculates 1 page for exactly PAGE_SIZE findings', () => {
    const report = makeReportWithMany(PAGE_SIZE);
    const state = createInteractiveState(report);
    expect(state.totalPages).toBe(1);
  });

  it('calculates 2 pages for PAGE_SIZE + 1 findings', () => {
    const report = makeReportWithMany(PAGE_SIZE + 1);
    const state = createInteractiveState(report);
    expect(state.totalPages).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// getCurrentPageFindings()
// ---------------------------------------------------------------------------

describe('getCurrentPageFindings', () => {
  it('returns first PAGE_SIZE findings on page 0', () => {
    const report = makeReportWithMany(25);
    const state = createInteractiveState(report);
    const pageFindings = getCurrentPageFindings(state);
    expect(pageFindings).toHaveLength(PAGE_SIZE);
  });

  it('returns remaining findings on last page', () => {
    const report = makeReportWithMany(25);
    const state = createInteractiveState(report);
    state.currentPage = 2;
    const pageFindings = getCurrentPageFindings(state);
    expect(pageFindings).toHaveLength(5); // 25 - 20 = 5
  });

  it('returns empty array for empty report', () => {
    const report = makeReport();
    const state = createInteractiveState(report);
    const pageFindings = getCurrentPageFindings(state);
    expect(pageFindings).toHaveLength(0);
  });

  it('returns all findings when total is less than PAGE_SIZE', () => {
    const report = makeReportWithMany(3);
    const state = createInteractiveState(report);
    const pageFindings = getCurrentPageFindings(state);
    expect(pageFindings).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// formatFindingSummary()
// ---------------------------------------------------------------------------

describe('formatFindingSummary', () => {
  it('includes the finding title', () => {
    const finding = makeFinding({title: 'SQL Injection'});
    const result = formatFindingSummary(finding, 1, false);
    expect(result).toContain('SQL Injection');
  });

  it('includes severity label in uppercase', () => {
    const finding = makeFinding({severity: 'critical'});
    const result = formatFindingSummary(finding, 1, false);
    expect(result).toContain('CRITICAL');
  });

  it('includes index number', () => {
    const finding = makeFinding();
    const result = formatFindingSummary(finding, 42, false);
    expect(result).toContain('42');
  });

  it('shows selection indicator when selected', () => {
    const finding = makeFinding();
    const selected = formatFindingSummary(finding, 1, true);
    const notSelected = formatFindingSummary(finding, 1, false);
    expect(selected).toContain('>');
    expect(notSelected).not.toMatch(/^[^A-Z]*>/);
  });

  it('includes file location when present', () => {
    const finding = makeFinding({file: 'src/app.ts', line: 10});
    const result = formatFindingSummary(finding, 1, false);
    expect(result).toContain('src/app.ts:10');
  });

  it('omits location when file is not set', () => {
    const finding = makeFinding({file: undefined});
    const result = formatFindingSummary(finding, 1, false);
    expect(result).not.toContain('undefined');
  });

  it('includes ANSI color codes', () => {
    const finding = makeFinding({severity: 'critical'});
    const result = formatFindingSummary(finding, 1, false);
    expect(result).toContain('\x1b[');
  });
});

// ---------------------------------------------------------------------------
// formatFindingDetail()
// ---------------------------------------------------------------------------

describe('formatFindingDetail', () => {
  it('includes the finding title', () => {
    const finding = makeFinding({title: 'XSS in template'});
    const result = formatFindingDetail(finding);
    expect(result).toContain('XSS in template');
  });

  it('includes severity, category, source', () => {
    const finding = makeFinding({
      severity: 'high',
      category: 'injection',
      source: 'scanner',
    });
    const result = formatFindingDetail(finding);
    expect(result).toContain('HIGH');
    expect(result).toContain('injection');
    expect(result).toContain('scanner');
  });

  it('includes confidence percentage', () => {
    const finding = makeFinding({confidence: 0.85});
    const result = formatFindingDetail(finding);
    expect(result).toContain('85%');
  });

  it('includes status', () => {
    const finding = makeFinding({status: 'confirmed'});
    const result = formatFindingDetail(finding);
    expect(result).toContain('confirmed');
  });

  it('includes file location with line and column', () => {
    const finding = makeFinding({file: 'src/db.ts', line: 42, column: 10});
    const result = formatFindingDetail(finding);
    expect(result).toContain('src/db.ts:42:10');
  });

  it('includes CWE when present', () => {
    const finding = makeFinding({cweId: 'CWE-89'});
    const result = formatFindingDetail(finding);
    expect(result).toContain('CWE-89');
  });

  it('includes CVE when present', () => {
    const finding = makeFinding({cveId: 'CVE-2024-1234'});
    const result = formatFindingDetail(finding);
    expect(result).toContain('CVE-2024-1234');
  });

  it('includes OWASP category when present', () => {
    const finding = makeFinding({owaspCategory: 'A03:2021-Injection'});
    const result = formatFindingDetail(finding);
    expect(result).toContain('A03:2021-Injection');
  });

  it('includes description', () => {
    const finding = makeFinding({description: 'User input flows into query.'});
    const result = formatFindingDetail(finding);
    expect(result).toContain('User input flows into query.');
  });

  it('includes suggested fix when present', () => {
    const finding = makeFinding({suggestedFix: 'Use parameterized queries.'});
    const result = formatFindingDetail(finding);
    expect(result).toContain('Suggested fix:');
    expect(result).toContain('Use parameterized queries.');
  });

  it('includes contextual note when present', () => {
    const finding = makeFinding({contextualNote: 'This is in auth middleware.'});
    const result = formatFindingDetail(finding);
    expect(result).toContain('This is in auth middleware.');
  });

  it('omits optional fields when not present', () => {
    const finding = makeFinding({
      cweId: undefined,
      cveId: undefined,
      owaspCategory: undefined,
      suggestedFix: undefined,
      contextualNote: undefined,
      file: undefined,
    });
    const result = formatFindingDetail(finding);
    expect(result).not.toContain('CWE:');
    expect(result).not.toContain('CVE:');
    expect(result).not.toContain('OWASP:');
    expect(result).not.toContain('Suggested fix:');
    expect(result).not.toContain('Location:');
  });

  it('includes scanner name in parentheses', () => {
    const finding = makeFinding({scanner: 'semgrep'});
    const result = formatFindingDetail(finding);
    expect(result).toContain('(semgrep)');
  });
});

// ---------------------------------------------------------------------------
// formatHeader()
// ---------------------------------------------------------------------------

describe('formatHeader', () => {
  it('includes AugmentaSec title', () => {
    const report = makeReport();
    const result = formatHeader(report);
    expect(result).toContain('AugmentaSec');
  });

  it('includes target name', () => {
    const report = makeReport({target: '/my/project'});
    const result = formatHeader(report);
    expect(result).toContain('/my/project');
  });

  it('includes total findings count', () => {
    const report = makeReport({
      summary: {
        total: 42,
        bySeverity: {critical: 0, high: 0, medium: 0, low: 0, informational: 0},
        byCategory: {},
        bySource: {scanner: 42, llm: 0, manual: 0},
      },
    });
    const result = formatHeader(report);
    expect(result).toContain('42 finding(s)');
  });

  it('includes severity breakdown', () => {
    const report = makeReport({
      summary: {
        total: 5,
        bySeverity: {critical: 1, high: 2, medium: 1, low: 1, informational: 0},
        byCategory: {},
        bySource: {scanner: 5, llm: 0, manual: 0},
      },
    });
    const result = formatHeader(report);
    expect(result).toContain('C:1');
    expect(result).toContain('H:2');
    expect(result).toContain('M:1');
    expect(result).toContain('L:1');
    expect(result).toContain('I:0');
  });
});

// ---------------------------------------------------------------------------
// formatFooter()
// ---------------------------------------------------------------------------

describe('formatFooter', () => {
  it('includes page number', () => {
    const result = formatFooter(0, 3);
    expect(result).toContain('Page 1/3');
  });

  it('includes navigation hints', () => {
    const result = formatFooter(0, 1);
    expect(result).toContain('navigate');
    expect(result).toContain('Enter');
    expect(result).toContain('q quit');
  });
});

// ---------------------------------------------------------------------------
// renderPage()
// ---------------------------------------------------------------------------

describe('renderPage', () => {
  it('renders header and footer', () => {
    const report = makeReport();
    const state = createInteractiveState(report);
    const output = renderPage(report, state);
    expect(output).toContain('AugmentaSec');
    expect(output).toContain('Page 1/1');
  });

  it('shows "No findings" for empty report', () => {
    const report = makeReport();
    const state = createInteractiveState(report);
    const output = renderPage(report, state);
    expect(output).toContain('No findings to display');
  });

  it('renders findings on current page', () => {
    const report = makeReportWithMany(3);
    const state = createInteractiveState(report);
    const output = renderPage(report, state);
    // Should contain findings
    expect(output).toContain('Finding');
  });

  it('shows expanded detail when finding is expanded', () => {
    const findings = [
      makeFinding({
        id: 'f1',
        title: 'SQL Injection',
        description: 'Detailed SQLi description.',
      }),
    ];
    const report = makeReport({
      findings,
      summary: {
        total: 1,
        bySeverity: {critical: 0, high: 1, medium: 0, low: 0, informational: 0},
        byCategory: {injection: 1},
        bySource: {scanner: 1, llm: 0, manual: 0},
      },
    });
    const state = createInteractiveState(report);
    state.expandedIndices.add(0);
    const output = renderPage(report, state);
    expect(output).toContain('Detailed SQLi description.');
  });

  it('renders correct page numbers for multi-page report', () => {
    const report = makeReportWithMany(25);
    const state = createInteractiveState(report);
    state.currentPage = 1;
    const output = renderPage(report, state);
    expect(output).toContain('Page 2/3');
  });
});

// ---------------------------------------------------------------------------
// handleKeypress() — navigation
// ---------------------------------------------------------------------------

describe('handleKeypress — navigation', () => {
  it('moves down with down arrow', () => {
    const report = makeReportWithMany(5);
    const state = createInteractiveState(report);
    expect(state.selectedIndex).toBe(0);

    const changed = handleKeypress(key('\x1b[B'), state);
    expect(changed).toBe(true);
    expect(state.selectedIndex).toBe(1);
  });

  it('moves up with up arrow', () => {
    const report = makeReportWithMany(5);
    const state = createInteractiveState(report);
    state.selectedIndex = 2;

    const changed = handleKeypress(key('\x1b[A'), state);
    expect(changed).toBe(true);
    expect(state.selectedIndex).toBe(1);
  });

  it('does not move above index 0', () => {
    const report = makeReportWithMany(5);
    const state = createInteractiveState(report);
    expect(state.selectedIndex).toBe(0);

    const changed = handleKeypress(key('\x1b[A'), state);
    expect(changed).toBe(false);
    expect(state.selectedIndex).toBe(0);
  });

  it('does not move below last finding', () => {
    const report = makeReportWithMany(3);
    const state = createInteractiveState(report);
    state.selectedIndex = 2;

    const changed = handleKeypress(key('\x1b[B'), state);
    expect(changed).toBe(false);
    expect(state.selectedIndex).toBe(2);
  });

  it('switches page when navigating past page boundary (down)', () => {
    const report = makeReportWithMany(15);
    const state = createInteractiveState(report);
    state.selectedIndex = PAGE_SIZE - 1; // last item on page 0
    state.currentPage = 0;

    handleKeypress(key('\x1b[B'), state);
    expect(state.selectedIndex).toBe(PAGE_SIZE);
    expect(state.currentPage).toBe(1);
  });

  it('switches page when navigating past page boundary (up)', () => {
    const report = makeReportWithMany(15);
    const state = createInteractiveState(report);
    state.selectedIndex = PAGE_SIZE; // first item on page 1
    state.currentPage = 1;

    handleKeypress(key('\x1b[A'), state);
    expect(state.selectedIndex).toBe(PAGE_SIZE - 1);
    expect(state.currentPage).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// handleKeypress() — page navigation
// ---------------------------------------------------------------------------

describe('handleKeypress — page navigation', () => {
  it('goes to next page with right arrow', () => {
    const report = makeReportWithMany(25);
    const state = createInteractiveState(report);

    const changed = handleKeypress(key('\x1b[C'), state);
    expect(changed).toBe(true);
    expect(state.currentPage).toBe(1);
    expect(state.selectedIndex).toBe(PAGE_SIZE);
  });

  it('goes to previous page with left arrow', () => {
    const report = makeReportWithMany(25);
    const state = createInteractiveState(report);
    state.currentPage = 2;
    state.selectedIndex = 20;

    const changed = handleKeypress(key('\x1b[D'), state);
    expect(changed).toBe(true);
    expect(state.currentPage).toBe(1);
    expect(state.selectedIndex).toBe(PAGE_SIZE);
  });

  it('does not go past last page', () => {
    const report = makeReportWithMany(25);
    const state = createInteractiveState(report);
    state.currentPage = 2; // last page

    const changed = handleKeypress(key('\x1b[C'), state);
    expect(changed).toBe(false);
    expect(state.currentPage).toBe(2);
  });

  it('does not go before first page', () => {
    const report = makeReportWithMany(25);
    const state = createInteractiveState(report);

    const changed = handleKeypress(key('\x1b[D'), state);
    expect(changed).toBe(false);
    expect(state.currentPage).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// handleKeypress() — expand/collapse
// ---------------------------------------------------------------------------

describe('handleKeypress — expand/collapse', () => {
  it('expands finding on Enter', () => {
    const report = makeReportWithMany(5);
    const state = createInteractiveState(report);

    handleKeypress(key('\r'), state);
    expect(state.expandedIndices.has(0)).toBe(true);
  });

  it('collapses expanded finding on Enter', () => {
    const report = makeReportWithMany(5);
    const state = createInteractiveState(report);
    state.expandedIndices.add(0);

    handleKeypress(key('\r'), state);
    expect(state.expandedIndices.has(0)).toBe(false);
  });

  it('toggles correct finding when not on index 0', () => {
    const report = makeReportWithMany(5);
    const state = createInteractiveState(report);
    state.selectedIndex = 3;

    handleKeypress(key('\r'), state);
    expect(state.expandedIndices.has(3)).toBe(true);
    expect(state.expandedIndices.has(0)).toBe(false);
  });

  it('works with newline character too', () => {
    const report = makeReportWithMany(5);
    const state = createInteractiveState(report);

    handleKeypress(key('\n'), state);
    expect(state.expandedIndices.has(0)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// handleKeypress() — quit
// ---------------------------------------------------------------------------

describe('handleKeypress — quit', () => {
  it('quits on "q"', () => {
    const report = makeReportWithMany(5);
    const state = createInteractiveState(report);

    handleKeypress(key('q'), state);
    expect(state.running).toBe(false);
  });

  it('quits on Ctrl+C', () => {
    const report = makeReportWithMany(5);
    const state = createInteractiveState(report);

    handleKeypress(key('\x03'), state);
    expect(state.running).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// handleKeypress() — edge cases
// ---------------------------------------------------------------------------

describe('handleKeypress — edge cases', () => {
  it('returns false for unrecognized keys', () => {
    const report = makeReportWithMany(5);
    const state = createInteractiveState(report);

    const changed = handleKeypress(key('x'), state);
    expect(changed).toBe(false);
  });

  it('returns false for navigation with empty findings', () => {
    const report = makeReport();
    const state = createInteractiveState(report);

    expect(handleKeypress(key('\x1b[A'), state)).toBe(false);
    expect(handleKeypress(key('\x1b[B'), state)).toBe(false);
  });

  it('still allows quit with empty findings', () => {
    const report = makeReport();
    const state = createInteractiveState(report);

    handleKeypress(key('q'), state);
    expect(state.running).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

describe('pagination', () => {
  it('correctly paginates 25 findings into 3 pages', () => {
    const report = makeReportWithMany(25);
    const state = createInteractiveState(report);

    // Page 0: indices 0-9
    expect(getCurrentPageFindings(state)).toHaveLength(10);

    // Page 1: indices 10-19
    state.currentPage = 1;
    expect(getCurrentPageFindings(state)).toHaveLength(10);

    // Page 2: indices 20-24
    state.currentPage = 2;
    expect(getCurrentPageFindings(state)).toHaveLength(5);
  });

  it('paginates exactly PAGE_SIZE findings into 1 page', () => {
    const report = makeReportWithMany(PAGE_SIZE);
    const state = createInteractiveState(report);
    expect(state.totalPages).toBe(1);
    expect(getCurrentPageFindings(state)).toHaveLength(PAGE_SIZE);
  });

  it('navigating to page 2 shows correct page in render', () => {
    const report = makeReportWithMany(25);
    const state = createInteractiveState(report);
    state.currentPage = 1;
    state.selectedIndex = 10;
    const output = renderPage(report, state);
    expect(output).toContain('Page 2/3');
  });
});

// ---------------------------------------------------------------------------
// Output formatting
// ---------------------------------------------------------------------------

describe('output formatting', () => {
  it('uses ANSI codes for severity coloring', () => {
    const finding = makeFinding({severity: 'critical'});
    const summary = formatFindingSummary(finding, 1, false);
    expect(summary).toContain(ANSI.critical);
    expect(summary).toContain(ANSI.reset);
  });

  it('uses bold for selected items', () => {
    const finding = makeFinding();
    const selected = formatFindingSummary(finding, 1, true);
    expect(selected).toContain(ANSI.bold);
  });

  it('uses dim for metadata in header', () => {
    const report = makeReport();
    const header = formatHeader(report);
    expect(header).toContain(ANSI.dim);
  });

  it('uses green for suggested fix', () => {
    const finding = makeFinding({suggestedFix: 'Fix it.'});
    const detail = formatFindingDetail(finding);
    expect(detail).toContain(ANSI.green);
  });

  it('word-wraps long descriptions', () => {
    const longDesc = 'word '.repeat(50).trim();
    const finding = makeFinding({description: longDesc});
    const detail = formatFindingDetail(finding);
    const lines = detail.split('\n');
    // Should be more than 1 line for description
    const descLines = lines.filter(l => l.trim().startsWith('word'));
    expect(descLines.length).toBeGreaterThan(1);
  });
});
