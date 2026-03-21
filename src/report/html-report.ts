/**
 * HTML report generator for AugmentaSec findings.
 */

import type {FindingsReport} from '../findings/types.js';

/** Generates an HTML string from a findings report. */
export function generateHtmlReport(report: FindingsReport): string {
  const escapedTarget = escapeHtml(report.target);
  const rows = report.findings
    .map(
      (f) =>
        `<tr><td>${escapeHtml(f.severity)}</td><td>${escapeHtml(f.title)}</td><td>${escapeHtml(f.file ?? '')}</td></tr>`,
    )
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>AugmentaSec Report</title></head>
<body>
<h1>AugmentaSec Security Report</h1>
<p>Target: ${escapedTarget}</p>
<p>Generated: ${escapeHtml(report.generatedAt)}</p>
<p>Total findings: ${report.summary.total}</p>
<table>
<thead><tr><th>Severity</th><th>Title</th><th>File</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
