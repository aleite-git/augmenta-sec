/**
 * HTML report generator for AugmentaSec (ASEC-156).
 *
 * Produces a self-contained HTML document with:
 *   - Executive summary (total findings, severity breakdown)
 *   - Inline SVG severity chart (horizontal bar chart)
 *   - Detailed findings table sorted by severity
 *
 * The output has zero external dependencies — all styles and charts are
 * inlined so the report can be viewed offline or attached to an email.
 */

import type {Finding, FindingsReport, Severity} from '../findings/types.js';

// ---------------------------------------------------------------------------
// Severity helpers
// ---------------------------------------------------------------------------

const SEVERITY_ORDER: readonly Severity[] = [
  'critical',
  'high',
  'medium',
  'low',
  'informational',
] as const;

const SEVERITY_COLORS: Record<Severity, string> = {
  critical: '#dc2626',
  high: '#ea580c',
  medium: '#ca8a04',
  low: '#2563eb',
  informational: '#6b7280',
};

// ---------------------------------------------------------------------------
// SVG severity chart
// ---------------------------------------------------------------------------

/**
 * Generates an inline SVG horizontal bar chart showing the count of
 * findings per severity level.
 */
export function generateSeverityChart(
  bySeverity: Record<Severity, number>,
): string {
  const maxCount = Math.max(1, ...Object.values(bySeverity));

  const barHeight = 28;
  const labelWidth = 120;
  const barAreaWidth = 300;
  const gap = 8;
  const chartHeight = SEVERITY_ORDER.length * (barHeight + gap) + gap;
  const chartWidth = labelWidth + barAreaWidth + 60;

  const bars = SEVERITY_ORDER.map((sev, i) => {
    const count = bySeverity[sev];
    const barWidth = maxCount > 0 ? (count / maxCount) * barAreaWidth : 0;
    const y = gap + i * (barHeight + gap);
    const color = SEVERITY_COLORS[sev];

    return [
      `  <text x="${labelWidth - 8}" y="${y + barHeight / 2 + 5}" text-anchor="end" font-size="13" fill="#374151">${sev}</text>`,
      `  <rect x="${labelWidth}" y="${y}" width="${barWidth}" height="${barHeight}" rx="4" fill="${color}" />`,
      count > 0
        ? `  <text x="${labelWidth + barWidth + 6}" y="${y + barHeight / 2 + 5}" font-size="12" fill="#374151">${count}</text>`
        : '',
    ]
      .filter(Boolean)
      .join('\n');
  }).join('\n');

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${chartWidth}" height="${chartHeight}" role="img" aria-label="Severity distribution chart">`,
    `  <title>Severity distribution</title>`,
    bars,
    `</svg>`,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// HTML escaping
// ---------------------------------------------------------------------------

/** Escapes special HTML characters to prevent XSS in report output. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ---------------------------------------------------------------------------
// Finding rows
// ---------------------------------------------------------------------------

function findingRow(f: Finding): string {
  const sevColor = SEVERITY_COLORS[f.severity];
  const location =
    f.file != null
      ? `${escapeHtml(f.file)}${f.line != null ? `:${f.line}` : ''}`
      : '\u2014';

  return [
    '<tr>',
    `  <td><span style="color:${sevColor};font-weight:600">${escapeHtml(f.severity)}</span></td>`,
    `  <td>${escapeHtml(f.title)}</td>`,
    `  <td>${escapeHtml(f.category)}</td>`,
    `  <td><code>${location}</code></td>`,
    `  <td>${escapeHtml(f.source)}${f.scanner ? ` (${escapeHtml(f.scanner)})` : ''}</td>`,
    `  <td>${f.cweId ? escapeHtml(f.cweId) : '\u2014'}</td>`,
    '</tr>',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Sort findings by severity (critical first)
// ---------------------------------------------------------------------------

function severityIndex(s: Severity): number {
  const idx = SEVERITY_ORDER.indexOf(s);
  return idx >= 0 ? idx : SEVERITY_ORDER.length;
}

function sortFindings(findings: Finding[]): Finding[] {
  return [...findings].sort(
    (a, b) => severityIndex(a.severity) - severityIndex(b.severity),
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generates a self-contained HTML report from a findings report.
 *
 * @param report - The findings report.
 * @returns A complete HTML document as a string.
 */
export function generateHtmlReport(report: FindingsReport): string {
  const {summary, findings} = report;
  const sorted = sortFindings(findings);
  const chart = generateSeverityChart(summary.bySeverity);

  const criticalCount = summary.bySeverity.critical;
  const highCount = summary.bySeverity.high;
  const riskLevel =
    criticalCount > 0
      ? 'Critical'
      : highCount > 0
        ? 'High'
        : summary.bySeverity.medium > 0
          ? 'Medium'
          : 'Low';

  const categories = Object.entries(summary.byCategory)
    .sort(([, a], [, b]) => b - a)
    .map(([cat, count]) => `${escapeHtml(cat)}: ${count}`)
    .join(', ');

  const findingRows =
    sorted.length > 0
      ? sorted.map(f => findingRow(f)).join('\n')
      : '<tr><td colspan="6" style="text-align:center;color:#6b7280">No findings</td></tr>';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>AugmentaSec Security Report \u2014 ${escapeHtml(report.target)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #1f2937; background: #f9fafb; padding: 2rem; line-height: 1.5; }
  .container { max-width: 960px; margin: 0 auto; }
  h1 { font-size: 1.75rem; margin-bottom: 0.25rem; }
  h2 { font-size: 1.25rem; margin: 1.5rem 0 0.75rem; border-bottom: 1px solid #e5e7eb; padding-bottom: 0.25rem; }
  .meta { color: #6b7280; font-size: 0.875rem; margin-bottom: 1.5rem; }
  .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem; margin-bottom: 1.5rem; }
  .summary-card { background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 1rem; }
  .summary-card .label { font-size: 0.75rem; text-transform: uppercase; color: #6b7280; letter-spacing: 0.05em; }
  .summary-card .value { font-size: 1.5rem; font-weight: 700; margin-top: 0.25rem; }
  table { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; }
  th, td { padding: 0.5rem 0.75rem; text-align: left; font-size: 0.875rem; border-bottom: 1px solid #f3f4f6; }
  th { background: #f9fafb; font-weight: 600; color: #374151; }
  code { font-size: 0.8rem; background: #f3f4f6; padding: 0.1rem 0.3rem; border-radius: 3px; }
  .chart-section { margin: 1.5rem 0; }
  .footer { margin-top: 2rem; font-size: 0.75rem; color: #9ca3af; text-align: center; }
</style>
</head>
<body>
<div class="container">

<h1>Security Report</h1>
<p class="meta">Target: <strong>${escapeHtml(report.target)}</strong> &middot; Generated: ${escapeHtml(report.generatedAt)} &middot; Version: ${escapeHtml(report.version)}</p>

<h2>Executive Summary</h2>
<div class="summary-grid">
  <div class="summary-card">
    <div class="label">Total Findings</div>
    <div class="value">${summary.total}</div>
  </div>
  <div class="summary-card">
    <div class="label">Risk Level</div>
    <div class="value">${riskLevel}</div>
  </div>
  <div class="summary-card">
    <div class="label">Critical / High</div>
    <div class="value" style="color:${criticalCount > 0 ? '#dc2626' : highCount > 0 ? '#ea580c' : '#16a34a'}">${criticalCount} / ${highCount}</div>
  </div>
  <div class="summary-card">
    <div class="label">Categories</div>
    <div class="value" style="font-size:0.875rem;font-weight:400">${categories || '\u2014'}</div>
  </div>
</div>

<h2>Severity Distribution</h2>
<div class="chart-section">
${chart}
</div>

<h2>Findings</h2>
<table>
<thead>
  <tr>
    <th>Severity</th>
    <th>Title</th>
    <th>Category</th>
    <th>Location</th>
    <th>Source</th>
    <th>CWE</th>
  </tr>
</thead>
<tbody>
${findingRows}
</tbody>
</table>

<p class="footer">Generated by AugmentaSec v${escapeHtml(report.version)}</p>

</div>
</body>
</html>`;
}
