/**
 * Offline HTML report exporter for AugmentaSec (ASEC-155).
 *
 * Generates a self-contained HTML file with:
 *   - Header with scan metadata
 *   - SVG severity distribution chart
 *   - Findings table sortable by severity
 *   - Optional profile summary
 *
 * The output has zero external dependencies — all styles and scripts are
 * inlined so the report can be viewed offline.
 */

import type {Finding, FindingsReport, Severity} from '../findings/types.js';
import type {SecurityProfile} from '../discovery/types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Options for HTML export. */
export interface HtmlExportOptions {
  /** Custom title for the report. Defaults to 'AugmentaSec Security Report'. */
  title?: string;
  /** Include a profile summary section. Requires the profile to be passed. */
  includeProfile?: boolean;
  /** Security profile to include when includeProfile is true. */
  profile?: SecurityProfile;
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
// SVG severity chart
// ---------------------------------------------------------------------------

function generateSeverityChart(bySeverity: Record<Severity, number>): string {
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
      `    <text x="${labelWidth - 8}" y="${y + barHeight / 2 + 5}" text-anchor="end" font-size="13" fill="#374151">${sev}</text>`,
      `    <rect x="${labelWidth}" y="${y}" width="${barWidth}" height="${barHeight}" rx="4" fill="${color}" />`,
      count > 0
        ? `    <text x="${labelWidth + barWidth + 6}" y="${y + barHeight / 2 + 5}" font-size="12" fill="#374151">${count}</text>`
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
// Finding row
// ---------------------------------------------------------------------------

function findingRow(f: Finding, index: number): string {
  const sevColor = SEVERITY_COLORS[f.severity];
  const location =
    f.file != null
      ? `${escapeHtml(f.file)}${f.line != null ? `:${f.line}` : ''}`
      : '\u2014';

  const descriptionEscaped = escapeHtml(f.description);
  const suggestedFix = f.suggestedFix
    ? `<p><strong>Suggested fix:</strong> ${escapeHtml(f.suggestedFix)}</p>`
    : '';
  const cweDisplay = f.cweId ? escapeHtml(f.cweId) : '\u2014';
  const owaspDisplay = f.owaspCategory
    ? escapeHtml(f.owaspCategory)
    : '\u2014';

  return `<tr class="finding-row" data-severity="${f.severity}">
  <td><span class="severity-badge" style="color:${sevColor};font-weight:600">${escapeHtml(f.severity)}</span></td>
  <td>${escapeHtml(f.title)}</td>
  <td>${escapeHtml(f.category)}</td>
  <td><code>${location}</code></td>
  <td>${escapeHtml(f.source)}${f.scanner ? ` (${escapeHtml(f.scanner)})` : ''}</td>
  <td>${cweDisplay}</td>
  <td>${owaspDisplay}</td>
</tr>
<tr class="finding-detail" id="detail-${index}" style="display:none">
  <td colspan="7" class="detail-cell">
    <p>${descriptionEscaped}</p>
    ${suggestedFix}
  </td>
</tr>`;
}

// ---------------------------------------------------------------------------
// Profile summary
// ---------------------------------------------------------------------------

function renderProfileSection(profile: SecurityProfile): string {
  const langList =
    profile.languages.all.length > 0
      ? profile.languages.all
          .map(l => `${escapeHtml(l.name)} (${l.percentage.toFixed(0)}%)`)
          .join(', ')
      : 'N/A';

  const frameworkList = [
    ...profile.frameworks.backend,
    ...profile.frameworks.frontend,
    ...profile.frameworks.fullstack,
  ]
    .map(f => escapeHtml(f.name))
    .join(', ') || 'None detected';

  const authProviders =
    profile.auth.providers.length > 0
      ? profile.auth.providers.map(p => escapeHtml(p.name)).join(', ')
      : 'None detected';

  const dbList =
    profile.database.databases.length > 0
      ? profile.database.databases
          .map(d => escapeHtml(d.type))
          .join(', ')
      : 'None detected';

  const secControls =
    profile.securityControls.present.length > 0
      ? profile.securityControls.present
          .map(c => escapeHtml(c.name))
          .join(', ')
      : 'None detected';

  return `
<h2>Profile Summary</h2>
<div class="summary-grid">
  <div class="summary-card">
    <div class="label">Languages</div>
    <div class="value" style="font-size:0.875rem;font-weight:400">${langList}</div>
  </div>
  <div class="summary-card">
    <div class="label">Frameworks</div>
    <div class="value" style="font-size:0.875rem;font-weight:400">${frameworkList}</div>
  </div>
  <div class="summary-card">
    <div class="label">Auth Providers</div>
    <div class="value" style="font-size:0.875rem;font-weight:400">${authProviders}</div>
  </div>
  <div class="summary-card">
    <div class="label">Databases</div>
    <div class="value" style="font-size:0.875rem;font-weight:400">${dbList}</div>
  </div>
  <div class="summary-card">
    <div class="label">Security Controls</div>
    <div class="value" style="font-size:0.875rem;font-weight:400">${secControls}</div>
  </div>
</div>`;
}

// ---------------------------------------------------------------------------
// Risk level
// ---------------------------------------------------------------------------

function riskLevel(report: FindingsReport): {label: string; color: string} {
  const {bySeverity} = report.summary;
  if (bySeverity.critical > 0) return {label: 'Critical', color: '#dc2626'};
  if (bySeverity.high > 0) return {label: 'High', color: '#ea580c'};
  if (bySeverity.medium > 0) return {label: 'Medium', color: '#ca8a04'};
  if (bySeverity.low > 0) return {label: 'Low', color: '#2563eb'};
  return {label: 'None', color: '#16a34a'};
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generates a self-contained offline HTML report from a findings report.
 *
 * The output includes inline CSS, an inline SVG severity chart, a findings
 * table, and an optional profile summary section. No external resources
 * are referenced — the file is fully self-contained.
 *
 * @param report - The findings report to render.
 * @param options - Optional configuration for the export.
 * @returns A complete HTML document as a string.
 */
export function exportHtml(
  report: FindingsReport,
  options: HtmlExportOptions = {},
): string {
  const title = options.title ?? 'AugmentaSec Security Report';
  const includeProfile =
    options.includeProfile === true && options.profile != null;

  const {summary, findings} = report;
  const sorted = sortFindings(findings);
  const chart = generateSeverityChart(summary.bySeverity);
  const risk = riskLevel(report);

  const categories = Object.entries(summary.byCategory)
    .sort(([, a], [, b]) => b - a)
    .map(([cat, count]) => `${escapeHtml(cat)}: ${count}`)
    .join(', ');

  const findingRows =
    sorted.length > 0
      ? sorted.map((f, i) => findingRow(f, i)).join('\n')
      : '<tr><td colspan="7" style="text-align:center;color:#6b7280">No findings</td></tr>';

  const profileSection =
    includeProfile && options.profile
      ? renderProfileSection(options.profile)
      : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)} \u2014 ${escapeHtml(report.target)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #1f2937; background: #f9fafb; padding: 2rem; line-height: 1.5; }
  .container { max-width: 1100px; margin: 0 auto; }
  h1 { font-size: 1.75rem; margin-bottom: 0.25rem; }
  h2 { font-size: 1.25rem; margin: 1.5rem 0 0.75rem; border-bottom: 1px solid #e5e7eb; padding-bottom: 0.25rem; }
  .meta { color: #6b7280; font-size: 0.875rem; margin-bottom: 1.5rem; }
  .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem; margin-bottom: 1.5rem; }
  .summary-card { background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 1rem; }
  .summary-card .label { font-size: 0.75rem; text-transform: uppercase; color: #6b7280; letter-spacing: 0.05em; }
  .summary-card .value { font-size: 1.5rem; font-weight: 700; margin-top: 0.25rem; }
  table { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; }
  th, td { padding: 0.5rem 0.75rem; text-align: left; font-size: 0.875rem; border-bottom: 1px solid #f3f4f6; }
  th { background: #f9fafb; font-weight: 600; color: #374151; cursor: default; }
  code { font-size: 0.8rem; background: #f3f4f6; padding: 0.1rem 0.3rem; border-radius: 3px; }
  .chart-section { margin: 1.5rem 0; }
  .footer { margin-top: 2rem; font-size: 0.75rem; color: #9ca3af; text-align: center; }
  .finding-row { cursor: pointer; }
  .finding-row:hover { background: #f3f4f6; }
  .detail-cell { padding: 1rem 1.5rem; background: #fafafa; border-left: 3px solid #e5e7eb; }
  .detail-cell p { margin-bottom: 0.5rem; }
  .severity-badge { text-transform: uppercase; font-size: 0.75rem; }
</style>
</head>
<body>
<div class="container">

<h1>${escapeHtml(title)}</h1>
<p class="meta">Target: <strong>${escapeHtml(report.target)}</strong> &middot; Generated: ${escapeHtml(report.generatedAt)} &middot; Version: ${escapeHtml(report.version)}</p>

<h2>Executive Summary</h2>
<div class="summary-grid">
  <div class="summary-card">
    <div class="label">Total Findings</div>
    <div class="value">${summary.total}</div>
  </div>
  <div class="summary-card">
    <div class="label">Risk Level</div>
    <div class="value" style="color:${risk.color}">${risk.label}</div>
  </div>
  <div class="summary-card">
    <div class="label">Critical / High</div>
    <div class="value" style="color:${summary.bySeverity.critical > 0 ? '#dc2626' : summary.bySeverity.high > 0 ? '#ea580c' : '#16a34a'}">${summary.bySeverity.critical} / ${summary.bySeverity.high}</div>
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

${profileSection}

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
    <th>OWASP</th>
  </tr>
</thead>
<tbody>
${findingRows}
</tbody>
</table>

<p class="footer">Generated by AugmentaSec v${escapeHtml(report.version)}</p>

</div>
<script>
(function(){
  var rows = document.querySelectorAll('.finding-row');
  for (var i = 0; i < rows.length; i++) {
    (function(idx){
      rows[idx].addEventListener('click', function(){
        var detail = document.getElementById('detail-' + idx);
        if (detail) {
          detail.style.display = detail.style.display === 'none' ? '' : 'none';
        }
      });
    })(i);
  }
})();
</script>
</body>
</html>`;
}
