import {describe, it, expect} from 'vitest';

import type {RemediationSuggestion} from '../engine.js';
import {formatRemediationReport, getEffortSummary} from '../report.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSuggestion(overrides: Partial<RemediationSuggestion> = {}): RemediationSuggestion {
  return {
    findingId: 'f-1',
    title: 'Use parameterized queries',
    description: 'Replace string concatenation with parameterized queries.',
    effort: 'medium',
    priority: 85,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('getEffortSummary', () => {
  it('counts suggestions by effort level', () => {
    const suggestions = [
      makeSuggestion({effort: 'low'}),
      makeSuggestion({effort: 'low'}),
      makeSuggestion({effort: 'medium'}),
      makeSuggestion({effort: 'high'}),
    ];
    const summary = getEffortSummary(suggestions);
    expect(summary.total).toBe(4);
    expect(summary.low).toBe(2);
    expect(summary.medium).toBe(1);
    expect(summary.high).toBe(1);
  });

  it('returns zeros for empty input', () => {
    const summary = getEffortSummary([]);
    expect(summary.total).toBe(0);
    expect(summary.low).toBe(0);
    expect(summary.medium).toBe(0);
    expect(summary.high).toBe(0);
  });
});

describe('formatRemediationReport', () => {
  it('returns a report header for empty suggestions', () => {
    const report = formatRemediationReport([]);
    expect(report).toContain('REMEDIATION REPORT');
    expect(report).toContain('No remediation suggestions');
  });

  it('includes executive summary with counts', () => {
    const suggestions = [
      makeSuggestion({effort: 'low', priority: 80}),
      makeSuggestion({findingId: 'f-2', effort: 'medium', priority: 60}),
      makeSuggestion({findingId: 'f-3', effort: 'high', priority: 40}),
    ];
    const report = formatRemediationReport(suggestions);

    expect(report).toContain('EXECUTIVE SUMMARY');
    expect(report).toContain('Total suggestions: 3');
    expect(report).toContain('Low effort:    1');
    expect(report).toContain('Medium effort: 1');
    expect(report).toContain('High effort:   1');
  });

  it('includes detailed suggestions section', () => {
    const suggestions = [
      makeSuggestion({title: 'Fix SQL injection', priority: 90}),
    ];
    const report = formatRemediationReport(suggestions);

    expect(report).toContain('DETAILED SUGGESTIONS');
    expect(report).toContain('Fix SQL injection');
    expect(report).toContain('Finding: f-1');
    expect(report).toContain('Priority: 90/100');
  });

  it('includes effort labels', () => {
    const suggestions = [
      makeSuggestion({effort: 'low'}),
      makeSuggestion({findingId: 'f-2', effort: 'medium'}),
      makeSuggestion({findingId: 'f-3', effort: 'high'}),
    ];
    const report = formatRemediationReport(suggestions);

    expect(report).toContain('Low (< 2 hours)');
    expect(report).toContain('Medium (2-8 hours)');
    expect(report).toContain('High (8+ hours)');
  });

  it('includes code examples section when present', () => {
    const suggestions = [
      makeSuggestion({
        title: 'Parameterize queries',
        codeExample: 'db.query("SELECT $1", [id])',
      }),
    ];
    const report = formatRemediationReport(suggestions);

    expect(report).toContain('CODE EXAMPLES');
    expect(report).toContain('Parameterize queries');
    expect(report).toContain('db.query("SELECT $1", [id])');
  });

  it('omits code examples section when none present', () => {
    const suggestions = [
      makeSuggestion({codeExample: undefined}),
    ];
    const report = formatRemediationReport(suggestions);
    expect(report).not.toContain('CODE EXAMPLES');
  });

  it('lists quick wins (low effort + high priority)', () => {
    const suggestions = [
      makeSuggestion({
        title: 'Quick win fix',
        effort: 'low',
        priority: 85,
      }),
      makeSuggestion({
        findingId: 'f-2',
        title: 'Not a quick win',
        effort: 'high',
        priority: 40,
      }),
    ];
    const report = formatRemediationReport(suggestions);

    expect(report).toContain('Quick wins');
    expect(report).toContain('Quick win fix');
  });

  it('does not list quick wins section when none qualify', () => {
    const suggestions = [
      makeSuggestion({effort: 'high', priority: 90}),
      makeSuggestion({findingId: 'f-2', effort: 'medium', priority: 50}),
    ];
    const report = formatRemediationReport(suggestions);
    expect(report).not.toContain('Quick wins');
  });

  it('numbers suggestions sequentially', () => {
    const suggestions = [
      makeSuggestion({title: 'First'}),
      makeSuggestion({findingId: 'f-2', title: 'Second'}),
      makeSuggestion({findingId: 'f-3', title: 'Third'}),
    ];
    const report = formatRemediationReport(suggestions);

    expect(report).toContain('1. First');
    expect(report).toContain('2. Second');
    expect(report).toContain('3. Third');
  });

  it('includes description in detailed suggestions', () => {
    const suggestions = [
      makeSuggestion({description: 'Replace concatenation with prepared statements.'}),
    ];
    const report = formatRemediationReport(suggestions);
    expect(report).toContain('Replace concatenation with prepared statements.');
  });

  it('handles single suggestion correctly', () => {
    const suggestions = [makeSuggestion()];
    const report = formatRemediationReport(suggestions);

    expect(report).toContain('REMEDIATION REPORT');
    expect(report).toContain('Total suggestions: 1');
    expect(report).toContain('1. Use parameterized queries');
  });
});
