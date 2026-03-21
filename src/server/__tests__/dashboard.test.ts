import {describe, it, expect} from 'vitest';

import {
  serveDashboard,
  escapeHtml,
  renderSeverityChart,
  renderRecentScans,
  renderTrendGraph,
} from '../dashboard.js';
import type {TrendReport, ScanSnapshot, TrendLine} from '../../report/trends.js';
import type {FindingsSummary} from '../../findings/types.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeSummary(overrides: Partial<FindingsSummary> = {}): FindingsSummary {
  return {
    total: 10,
    bySeverity: {
      critical: 1,
      high: 2,
      medium: 3,
      low: 3,
      informational: 1,
    },
    byCategory: {injection: 5, auth: 3, pii: 2},
    bySource: {scanner: 6, llm: 3, manual: 1},
    ...overrides,
  };
}

function makeScan(overrides: Partial<ScanSnapshot> = {}): ScanSnapshot {
  return {
    id: '2026-03-01T10-00-00-000Z',
    timestamp: '2026-03-01T10:00:00.000Z',
    target: '/tmp/project',
    summary: makeSummary(),
    ...overrides,
  };
}

function makeTrendLine(overrides: Partial<TrendLine> = {}): TrendLine {
  return {
    metric: 'total',
    points: [
      {timestamp: '2026-03-01', value: 10},
      {timestamp: '2026-03-02', value: 8},
      {timestamp: '2026-03-03', value: 5},
    ],
    direction: 'improving',
    ...overrides,
  };
}

function makeReport(overrides: Partial<TrendReport> = {}): TrendReport {
  return {
    scans: [
      makeScan({id: 'scan-1', timestamp: '2026-03-01T10:00:00.000Z'}),
      makeScan({id: 'scan-2', timestamp: '2026-03-02T10:00:00.000Z'}),
    ],
    trends: [
      makeTrendLine({metric: 'total'}),
      makeTrendLine({metric: 'critical', points: [{timestamp: '2026-03-01', value: 2}, {timestamp: '2026-03-02', value: 1}], direction: 'improving'}),
      makeTrendLine({metric: 'high', points: [{timestamp: '2026-03-01', value: 3}, {timestamp: '2026-03-02', value: 2}], direction: 'improving'}),
      makeTrendLine({metric: 'medium', points: [], direction: 'stable'}),
      makeTrendLine({metric: 'low', points: [], direction: 'stable'}),
      makeTrendLine({metric: 'informational', points: [], direction: 'stable'}),
    ],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// escapeHtml
// ---------------------------------------------------------------------------

describe('escapeHtml', () => {
  it('escapes ampersands', () => {
    expect(escapeHtml('a & b')).toBe('a &amp; b');
  });

  it('escapes angle brackets', () => {
    expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
  });

  it('escapes double quotes', () => {
    expect(escapeHtml('"hello"')).toBe('&quot;hello&quot;');
  });

  it('escapes single quotes', () => {
    expect(escapeHtml("it's")).toBe('it&#x27;s');
  });

  it('handles strings with no special characters', () => {
    expect(escapeHtml('hello world')).toBe('hello world');
  });

  it('handles empty string', () => {
    expect(escapeHtml('')).toBe('');
  });

  it('escapes multiple special characters in one string', () => {
    expect(escapeHtml('<a href="x">&</a>')).toBe(
      '&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;',
    );
  });
});

// ---------------------------------------------------------------------------
// serveDashboard
// ---------------------------------------------------------------------------

describe('serveDashboard', () => {
  it('returns a complete HTML document', () => {
    const html = serveDashboard(makeReport());
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('</html>');
    expect(html).toContain('<title>AugmentaSec Dashboard</title>');
  });

  it('includes inline CSS', () => {
    const html = serveDashboard(makeReport());
    expect(html).toContain('<style>');
    expect(html).toContain('</style>');
    expect(html).toContain('font-family');
  });

  it('includes inline JS', () => {
    const html = serveDashboard(makeReport());
    expect(html).toContain('<script>');
    expect(html).toContain('</script>');
  });

  it('includes severity distribution section', () => {
    const html = serveDashboard(makeReport());
    expect(html).toContain('Severity Distribution');
  });

  it('includes trend section', () => {
    const html = serveDashboard(makeReport());
    expect(html).toContain('Trend Over Time');
  });

  it('includes recent scans section', () => {
    const html = serveDashboard(makeReport());
    expect(html).toContain('Recent Scans');
  });

  it('renders correctly with empty report', () => {
    const html = serveDashboard({scans: [], trends: []});
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('No scan data available');
  });

  it('includes a footer with generation timestamp', () => {
    const html = serveDashboard(makeReport());
    expect(html).toContain('<footer>');
    expect(html).toContain('Generated');
  });
});

// ---------------------------------------------------------------------------
// renderSeverityChart
// ---------------------------------------------------------------------------

describe('renderSeverityChart', () => {
  it('renders an SVG chart with bars for each severity', () => {
    const report = makeReport();
    const svg = renderSeverityChart(report);
    expect(svg).toContain('<svg');
    expect(svg).toContain('severity-chart');
    expect(svg).toContain('critical');
    expect(svg).toContain('high');
    expect(svg).toContain('medium');
    expect(svg).toContain('low');
    expect(svg).toContain('informational');
  });

  it('displays the correct values from the latest scan', () => {
    const report = makeReport({
      scans: [
        makeScan({
          summary: makeSummary({
            bySeverity: {critical: 7, high: 3, medium: 2, low: 1, informational: 0},
          }),
        }),
      ],
    });
    const svg = renderSeverityChart(report);
    expect(svg).toContain('>7<');
    expect(svg).toContain('>3<');
  });

  it('returns empty message when no scans', () => {
    const report = makeReport({scans: []});
    const result = renderSeverityChart(report);
    expect(result).toContain('No scan data available');
  });

  it('includes ARIA label for accessibility', () => {
    const svg = renderSeverityChart(makeReport());
    expect(svg).toContain('aria-label');
    expect(svg).toContain('role="img"');
  });
});

// ---------------------------------------------------------------------------
// renderRecentScans
// ---------------------------------------------------------------------------

describe('renderRecentScans', () => {
  it('renders a table with scan rows', () => {
    const scans = [
      makeScan({id: 'a', timestamp: '2026-03-01T10:00:00.000Z', target: '/proj-a'}),
      makeScan({id: 'b', timestamp: '2026-03-02T10:00:00.000Z', target: '/proj-b'}),
    ];
    const html = renderRecentScans(scans);
    expect(html).toContain('<table>');
    expect(html).toContain('<thead>');
    expect(html).toContain('<tbody>');
    expect(html).toContain('/proj-a');
    expect(html).toContain('/proj-b');
  });

  it('shows scans in reverse order (newest first)', () => {
    const scans = [
      makeScan({id: 'a', timestamp: '2026-03-01T10:00:00.000Z'}),
      makeScan({id: 'b', timestamp: '2026-03-02T10:00:00.000Z'}),
    ];
    const html = renderRecentScans(scans);
    const posA = html.indexOf('2026-03-01');
    const posB = html.indexOf('2026-03-02');
    expect(posB).toBeLessThan(posA);
  });

  it('limits to 10 most recent scans', () => {
    const scans: ScanSnapshot[] = [];
    for (let i = 0; i < 15; i++) {
      scans.push(
        makeScan({
          id: `scan-${i}`,
          timestamp: `2026-03-${String(i + 1).padStart(2, '0')}T10:00:00.000Z`,
        }),
      );
    }
    const html = renderRecentScans(scans);
    const rowCount = (html.match(/<tr>/g) ?? []).length;
    expect(rowCount).toBe(11);
  });

  it('returns empty message when no scans', () => {
    const html = renderRecentScans([]);
    expect(html).toContain('No scans recorded yet');
  });

  it('includes severity column headers', () => {
    const html = renderRecentScans([makeScan()]);
    expect(html).toContain('Critical');
    expect(html).toContain('High');
    expect(html).toContain('Medium');
    expect(html).toContain('Low');
  });
});

// ---------------------------------------------------------------------------
// renderTrendGraph
// ---------------------------------------------------------------------------

describe('renderTrendGraph', () => {
  it('renders an SVG line chart', () => {
    const report = makeReport();
    const svg = renderTrendGraph(report);
    expect(svg).toContain('<svg');
    expect(svg).toContain('trend-chart');
    expect(svg).toContain('<polyline');
  });

  it('returns empty message when no total trend', () => {
    const report = makeReport({trends: []});
    const result = renderTrendGraph(report);
    expect(result).toContain('Not enough data');
  });

  it('returns empty message when total trend has no points', () => {
    const report = makeReport({
      trends: [makeTrendLine({metric: 'total', points: []})],
    });
    const result = renderTrendGraph(report);
    expect(result).toContain('Not enough data');
  });

  it('includes legend labels', () => {
    const svg = renderTrendGraph(makeReport());
    expect(svg).toContain('total');
    expect(svg).toContain('critical');
    expect(svg).toContain('high');
  });

  it('includes x-axis date labels', () => {
    const svg = renderTrendGraph(makeReport());
    expect(svg).toContain('2026-03-01');
  });

  it('includes ARIA label for accessibility', () => {
    const svg = renderTrendGraph(makeReport());
    expect(svg).toContain('aria-label');
    expect(svg).toContain('role="img"');
  });
});
