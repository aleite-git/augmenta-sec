/**
 * Dashboard HTML generator for AugmentaSec.
 *
 * Produces a single-page HTML string with inline CSS and JS featuring:
 * - Severity distribution chart (SVG bar chart)
 * - Recent scans table
 * - Trend graph (SVG line chart)
 *
 * Route: GET /dashboard
 */

import type {TrendReport, ScanSnapshot, TrendLine} from '../report/trends.js';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generates a self-contained HTML dashboard page from a TrendReport.
 *
 * @param report The trend report containing scans and trend lines.
 * @returns A complete HTML string ready to serve.
 */
export function serveDashboard(report: TrendReport): string {
  const severityChart = renderSeverityChart(report);
  const recentScans = renderRecentScans(report.scans);
  const trendGraph = renderTrendGraph(report);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AugmentaSec Dashboard</title>
  <style>${getStyles()}</style>
</head>
<body>
  <header>
    <h1>AugmentaSec Dashboard</h1>
    <p class="subtitle">Security scan trends and analysis</p>
  </header>
  <main>
    <section class="card">
      <h2>Severity Distribution</h2>
      ${severityChart}
    </section>
    <section class="card">
      <h2>Trend Over Time</h2>
      ${trendGraph}
    </section>
    <section class="card">
      <h2>Recent Scans</h2>
      ${recentScans}
    </section>
  </main>
  <footer>
    <p>Generated ${escapeHtml(new Date().toISOString())}</p>
  </footer>
  <script>${getScript()}</script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Severity chart (SVG bar chart)
// ---------------------------------------------------------------------------

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#dc2626',
  high: '#ea580c',
  medium: '#ca8a04',
  low: '#2563eb',
  informational: '#6b7280',
};

function renderSeverityChart(report: TrendReport): string {
  if (report.scans.length === 0) {
    return '<p class="empty">No scan data available.</p>';
  }

  const latest = report.scans[report.scans.length - 1];
  const severities = ['critical', 'high', 'medium', 'low', 'informational'];
  const maxValue = Math.max(
    ...severities.map(
      s =>
        latest.summary.bySeverity[
          s as keyof typeof latest.summary.bySeverity
        ] ?? 0,
    ),
    1,
  );

  const barWidth = 60;
  const gap = 20;
  const chartHeight = 200;
  const chartWidth = severities.length * (barWidth + gap) + gap;

  const bars = severities
    .map((severity, i) => {
      const value =
        latest.summary.bySeverity[
          severity as keyof typeof latest.summary.bySeverity
        ] ?? 0;
      const barHeight =
        maxValue > 0 ? (value / maxValue) * (chartHeight - 40) : 0;
      const x = gap + i * (barWidth + gap);
      const y = chartHeight - barHeight - 30;
      const color = SEVERITY_COLORS[severity] ?? '#6b7280';

      return `<g>
        <rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" fill="${color}" rx="4"/>
        <text x="${x + barWidth / 2}" y="${y - 5}" text-anchor="middle" class="bar-value">${value}</text>
        <text x="${x + barWidth / 2}" y="${chartHeight - 10}" text-anchor="middle" class="bar-label">${escapeHtml(severity)}</text>
      </g>`;
    })
    .join('\n');

  return `<svg viewBox="0 0 ${chartWidth} ${chartHeight}" class="chart severity-chart" role="img" aria-label="Severity distribution chart">
    ${bars}
  </svg>`;
}

// ---------------------------------------------------------------------------
// Recent scans table
// ---------------------------------------------------------------------------

function renderRecentScans(scans: ScanSnapshot[]): string {
  if (scans.length === 0) {
    return '<p class="empty">No scans recorded yet.</p>';
  }

  const recentScans = scans.slice(-10).reverse();

  const rows = recentScans
    .map(
      s => `<tr>
      <td>${escapeHtml(s.timestamp)}</td>
      <td>${escapeHtml(s.target)}</td>
      <td>${s.summary.total}</td>
      <td class="sev-critical">${s.summary.bySeverity.critical}</td>
      <td class="sev-high">${s.summary.bySeverity.high}</td>
      <td class="sev-medium">${s.summary.bySeverity.medium}</td>
      <td class="sev-low">${s.summary.bySeverity.low}</td>
    </tr>`,
    )
    .join('\n');

  return `<table>
    <thead>
      <tr>
        <th>Timestamp</th>
        <th>Target</th>
        <th>Total</th>
        <th>Critical</th>
        <th>High</th>
        <th>Medium</th>
        <th>Low</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>`;
}

// ---------------------------------------------------------------------------
// Trend graph (SVG line chart)
// ---------------------------------------------------------------------------

function renderTrendGraph(report: TrendReport): string {
  const totalTrend = report.trends.find(t => t.metric === 'total');
  if (!totalTrend || totalTrend.points.length === 0) {
    return '<p class="empty">Not enough data for trend graph.</p>';
  }

  return renderTrendLine(totalTrend, report.trends);
}

function renderTrendLine(
  primaryTrend: TrendLine,
  allTrends: TrendLine[],
): string {
  const width = 600;
  const height = 250;
  const padding = 40;
  const plotWidth = width - padding * 2;
  const plotHeight = height - padding * 2;

  const allValues = allTrends
    .filter(t => ['total', 'critical', 'high'].includes(t.metric))
    .flatMap(t => t.points.map(p => p.value));
  const maxVal = Math.max(...allValues, 1);

  const lines: string[] = [];
  const metricsToPlot = ['total', 'critical', 'high'];
  const lineColors: Record<string, string> = {
    total: '#1d4ed8',
    critical: '#dc2626',
    high: '#ea580c',
  };

  for (const metric of metricsToPlot) {
    const trend = allTrends.find(t => t.metric === metric);
    if (!trend || trend.points.length === 0) continue;

    const points = trend.points.map((p, i) => {
      const x =
        padding + (i / Math.max(trend.points.length - 1, 1)) * plotWidth;
      const y = padding + plotHeight - (p.value / maxVal) * plotHeight;
      return `${x},${y}`;
    });

    const color = lineColors[metric] ?? '#6b7280';
    lines.push(
      `<polyline points="${points.join(' ')}" fill="none" stroke="${color}" stroke-width="2" />`,
    );

    // Dot on last point
    const lastParts = points[points.length - 1].split(',');
    lines.push(
      `<circle cx="${lastParts[0]}" cy="${lastParts[1]}" r="4" fill="${color}" />`,
    );
  }

  // X-axis labels (first, middle, last)
  const labels = primaryTrend.points;
  const labelIndices = [0];
  if (labels.length > 2) labelIndices.push(Math.floor(labels.length / 2));
  if (labels.length > 1) labelIndices.push(labels.length - 1);

  const xLabels = labelIndices
    .map(i => {
      const x =
        padding + (i / Math.max(labels.length - 1, 1)) * plotWidth;
      const dateStr = labels[i].timestamp.slice(0, 10);
      return `<text x="${x}" y="${height - 5}" text-anchor="middle" class="axis-label">${escapeHtml(dateStr)}</text>`;
    })
    .join('\n');

  // Legend
  const legendItems = metricsToPlot
    .map(
      (m, i) =>
        `<text x="${padding + i * 100}" y="15" fill="${lineColors[m]}" class="legend-label">${escapeHtml(m)}</text>`,
    )
    .join('\n');

  return `<svg viewBox="0 0 ${width} ${height}" class="chart trend-chart" role="img" aria-label="Trend graph">
    ${legendItems}
    ${lines.join('\n')}
    ${xLabels}
  </svg>`;
}

// ---------------------------------------------------------------------------
// CSS
// ---------------------------------------------------------------------------

function getStyles(): string {
  return `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0f172a; color: #e2e8f0; padding: 2rem;
    }
    header { text-align: center; margin-bottom: 2rem; }
    h1 { font-size: 1.8rem; color: #38bdf8; }
    .subtitle { color: #94a3b8; margin-top: 0.25rem; }
    h2 { font-size: 1.2rem; margin-bottom: 1rem; color: #f1f5f9; }
    main { max-width: 900px; margin: 0 auto; display: flex; flex-direction: column; gap: 1.5rem; }
    .card {
      background: #1e293b; border-radius: 12px; padding: 1.5rem;
      border: 1px solid #334155;
    }
    .chart { width: 100%; height: auto; }
    .bar-value { font-size: 12px; fill: #e2e8f0; }
    .bar-label { font-size: 11px; fill: #94a3b8; }
    .axis-label { font-size: 10px; fill: #94a3b8; }
    .legend-label { font-size: 12px; }
    table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
    th, td { padding: 0.5rem 0.75rem; text-align: left; border-bottom: 1px solid #334155; }
    th { color: #94a3b8; font-weight: 600; }
    td { color: #e2e8f0; }
    .sev-critical { color: #dc2626; font-weight: 600; }
    .sev-high { color: #ea580c; font-weight: 600; }
    .sev-medium { color: #ca8a04; }
    .sev-low { color: #2563eb; }
    .empty { color: #94a3b8; font-style: italic; }
    footer { text-align: center; margin-top: 2rem; color: #64748b; font-size: 0.75rem; }
  `;
}

// ---------------------------------------------------------------------------
// JS (minimal interactivity)
// ---------------------------------------------------------------------------

function getScript(): string {
  return `
    document.querySelectorAll('tr[data-scan]').forEach(function(row) {
      row.style.cursor = 'pointer';
    });
  `;
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

/** Escapes HTML special characters to prevent XSS. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

// Exported for testing
export {escapeHtml, renderSeverityChart, renderRecentScans, renderTrendGraph};
