/**
 * Report templates for AugmentaSec (ASEC-154).
 *
 * Provides a template system for rendering findings reports in different
 * formats: executive summary, technical detail, and compliance mapping.
 *
 * Each template defines an ordered list of sections that are assembled
 * into a formatted plain-text report.
 */

import type {Finding, FindingsReport, Severity} from '../findings/types.js';
import {
  mapFindingToCompliance,
  type ComplianceMapping,
} from '../findings/compliance.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single section within a report template. */
export interface ReportSection {
  /** Section title displayed as a heading. */
  title: string;
  /** Brief description of what this section contains. */
  description: string;
  /** Renders section content from a findings report. */
  render: (report: FindingsReport) => string;
}

/** A named report template composed of ordered sections. */
export interface ReportTemplate {
  /** Unique template identifier. */
  name: string;
  /** Human-readable template description. */
  description: string;
  /** Ordered list of sections in this template. */
  sections: ReportSection[];
}

/** Names of built-in templates. */
export type BuiltInTemplate =
  | 'executive-summary'
  | 'technical-detail'
  | 'compliance';

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

function severityIndex(s: Severity): number {
  const idx = SEVERITY_ORDER.indexOf(s);
  return idx >= 0 ? idx : SEVERITY_ORDER.length;
}

function sortFindings(findings: Finding[]): Finding[] {
  return [...findings].sort(
    (a, b) => severityIndex(a.severity) - severityIndex(b.severity),
  );
}

function riskLevel(report: FindingsReport): string {
  const {bySeverity} = report.summary;
  if (bySeverity.critical > 0) return 'CRITICAL';
  if (bySeverity.high > 0) return 'HIGH';
  if (bySeverity.medium > 0) return 'MEDIUM';
  if (bySeverity.low > 0) return 'LOW';
  return 'INFORMATIONAL';
}

// ---------------------------------------------------------------------------
// Section renderers — Executive Summary
// ---------------------------------------------------------------------------

function renderOverview(report: FindingsReport): string {
  const {summary} = report;
  const lines: string[] = [
    `Target: ${report.target}`,
    `Generated: ${report.generatedAt}`,
    `Version: ${report.version}`,
    '',
    `Total findings: ${summary.total}`,
    `Risk level: ${riskLevel(report)}`,
  ];
  return lines.join('\n');
}

function renderSeverityBreakdown(report: FindingsReport): string {
  const {bySeverity} = report.summary;
  return SEVERITY_ORDER
    .map(sev => `  ${sev.padEnd(15)} ${bySeverity[sev]}`)
    .join('\n');
}

function renderTopCategories(report: FindingsReport): string {
  const entries = Object.entries(report.summary.byCategory).sort(
    ([, a], [, b]) => b - a,
  );
  if (entries.length === 0) return '  No findings to categorize.';
  return entries.map(([cat, count]) => `  ${cat}: ${count}`).join('\n');
}

function renderRecommendations(report: FindingsReport): string {
  const {bySeverity} = report.summary;
  const recs: string[] = [];

  if (bySeverity.critical > 0) {
    recs.push(
      `- URGENT: Address ${bySeverity.critical} critical finding(s) immediately.`,
    );
  }
  if (bySeverity.high > 0) {
    recs.push(
      `- HIGH PRIORITY: Remediate ${bySeverity.high} high-severity finding(s) within this sprint.`,
    );
  }
  if (bySeverity.medium > 0) {
    recs.push(
      `- Schedule remediation of ${bySeverity.medium} medium-severity finding(s).`,
    );
  }
  if (recs.length === 0) {
    recs.push('- No critical or high-severity issues found. Continue monitoring.');
  }

  return recs.join('\n');
}

// ---------------------------------------------------------------------------
// Section renderers — Technical Detail
// ---------------------------------------------------------------------------

function renderFindingDetail(f: Finding): string {
  const location =
    f.file != null
      ? `${f.file}${f.line != null ? `:${f.line}` : ''}`
      : 'N/A';

  const lines: string[] = [
    `  [${f.severity.toUpperCase()}] ${f.title}`,
    `    ID:       ${f.id}`,
    `    Category: ${f.category}`,
    `    Source:   ${f.source}${f.scanner ? ` (${f.scanner})` : ''}`,
    `    Location: ${location}`,
  ];

  if (f.cweId) lines.push(`    CWE:      ${f.cweId}`);
  if (f.cveId) lines.push(`    CVE:      ${f.cveId}`);
  if (f.owaspCategory) lines.push(`    OWASP:    ${f.owaspCategory}`);
  lines.push(`    Confidence: ${(f.confidence * 100).toFixed(0)}%`);
  lines.push(`    Status:   ${f.status}`);
  lines.push('');
  lines.push(`    ${f.description}`);

  if (f.suggestedFix) {
    lines.push('');
    lines.push(`    Suggested fix: ${f.suggestedFix}`);
  }

  if (f.contextualNote) {
    lines.push(`    Context: ${f.contextualNote}`);
  }

  return lines.join('\n');
}

function renderAllFindings(report: FindingsReport): string {
  const sorted = sortFindings(report.findings);
  if (sorted.length === 0) return '  No findings.';
  return sorted.map(f => renderFindingDetail(f)).join('\n\n');
}

function renderSourceBreakdown(report: FindingsReport): string {
  const {bySource} = report.summary;
  return [
    `  scanner: ${bySource.scanner}`,
    `  llm:     ${bySource.llm}`,
    `  manual:  ${bySource.manual}`,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Section renderers — Compliance
// ---------------------------------------------------------------------------

function renderComplianceMappings(report: FindingsReport): string {
  if (report.findings.length === 0) {
    return '  No findings to map.';
  }

  const allMappings: Array<{finding: Finding; mapping: ComplianceMapping}> = [];
  for (const finding of report.findings) {
    const mappings = mapFindingToCompliance(finding);
    for (const mapping of mappings) {
      allMappings.push({finding, mapping});
    }
  }

  if (allMappings.length === 0) {
    return '  No findings matched compliance frameworks.';
  }

  // Group by framework
  const byFramework = new Map<string, Array<{finding: Finding; mapping: ComplianceMapping}>>();
  for (const entry of allMappings) {
    const key = entry.mapping.framework;
    if (!byFramework.has(key)) byFramework.set(key, []);
    byFramework.get(key)!.push(entry);
  }

  const sections: string[] = [];
  for (const [framework, entries] of byFramework) {
    sections.push(`  [${framework}]`);

    // Group by item ID within framework
    const byItem = new Map<string, Array<{finding: Finding; mapping: ComplianceMapping}>>();
    for (const entry of entries) {
      const key = entry.mapping.id;
      if (!byItem.has(key)) byItem.set(key, []);
      byItem.get(key)!.push(entry);
    }

    for (const [itemId, itemEntries] of byItem) {
      const firstMapping = itemEntries[0].mapping;
      sections.push(`    ${itemId}: ${firstMapping.name} (${itemEntries.length} finding(s))`);
      for (const entry of itemEntries) {
        sections.push(`      - ${entry.finding.title} [${entry.finding.severity}]`);
      }
    }
    sections.push('');
  }

  return sections.join('\n');
}

function renderCweOwaspSummary(report: FindingsReport): string {
  const cweIds = new Set<string>();
  const owaspCats = new Set<string>();

  for (const finding of report.findings) {
    if (finding.cweId) cweIds.add(finding.cweId);
    if (finding.owaspCategory) owaspCats.add(finding.owaspCategory);
  }

  const lines: string[] = [];
  if (cweIds.size > 0) {
    lines.push('  CWE IDs referenced:');
    for (const cwe of [...cweIds].sort()) {
      lines.push(`    - ${cwe}`);
    }
  } else {
    lines.push('  No CWE IDs referenced.');
  }

  lines.push('');

  if (owaspCats.size > 0) {
    lines.push('  OWASP categories referenced:');
    for (const cat of [...owaspCats].sort()) {
      lines.push(`    - ${cat}`);
    }
  } else {
    lines.push('  No OWASP categories referenced.');
  }

  return lines.join('\n');
}

function renderComplianceGaps(report: FindingsReport): string {
  const covered = new Set<string>();
  for (const finding of report.findings) {
    const mappings = mapFindingToCompliance(finding);
    for (const m of mappings) {
      if (m.framework === 'owasp-top-10') {
        covered.add(m.id);
      }
    }
  }

  const allOwaspIds = [
    'A01', 'A02', 'A03', 'A04', 'A05',
    'A06', 'A07', 'A08', 'A09', 'A10',
  ];

  const gaps = allOwaspIds.filter(id => !covered.has(id));
  if (gaps.length === 0) {
    return '  All OWASP Top 10 categories covered by scan findings.';
  }

  return [
    '  OWASP Top 10 categories NOT covered by any finding:',
    ...gaps.map(id => `    - ${id}`),
    '',
    '  Consider adding scanners or manual review for uncovered categories.',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Built-in templates
// ---------------------------------------------------------------------------

const EXECUTIVE_SUMMARY_TEMPLATE: ReportTemplate = {
  name: 'executive-summary',
  description:
    'High-level overview for stakeholders with risk level, severity breakdown, and key recommendations.',
  sections: [
    {
      title: 'Overview',
      description: 'Report metadata and overall risk assessment.',
      render: renderOverview,
    },
    {
      title: 'Severity Breakdown',
      description: 'Count of findings per severity level.',
      render: renderSeverityBreakdown,
    },
    {
      title: 'Top Categories',
      description: 'Most common finding categories.',
      render: renderTopCategories,
    },
    {
      title: 'Recommendations',
      description: 'Actionable next steps based on findings.',
      render: renderRecommendations,
    },
  ],
};

const TECHNICAL_DETAIL_TEMPLATE: ReportTemplate = {
  name: 'technical-detail',
  description:
    'Detailed technical report with full finding information, locations, and suggested fixes.',
  sections: [
    {
      title: 'Overview',
      description: 'Report metadata and overall risk assessment.',
      render: renderOverview,
    },
    {
      title: 'Source Breakdown',
      description: 'Findings by detection source.',
      render: renderSourceBreakdown,
    },
    {
      title: 'Findings',
      description: 'All findings sorted by severity with full details.',
      render: renderAllFindings,
    },
  ],
};

const COMPLIANCE_TEMPLATE: ReportTemplate = {
  name: 'compliance',
  description:
    'Maps findings to CWE and OWASP Top 10 frameworks, identifying coverage and gaps.',
  sections: [
    {
      title: 'Overview',
      description: 'Report metadata and overall risk assessment.',
      render: renderOverview,
    },
    {
      title: 'CWE / OWASP Summary',
      description: 'Unique CWE IDs and OWASP categories referenced by findings.',
      render: renderCweOwaspSummary,
    },
    {
      title: 'Compliance Mappings',
      description: 'Findings mapped to compliance framework items.',
      render: renderComplianceMappings,
    },
    {
      title: 'Coverage Gaps',
      description: 'Compliance framework items with no corresponding findings.',
      render: renderComplianceGaps,
    },
  ],
};

// ---------------------------------------------------------------------------
// Template registry
// ---------------------------------------------------------------------------

const TEMPLATES: Map<string, ReportTemplate> = new Map([
  ['executive-summary', EXECUTIVE_SUMMARY_TEMPLATE],
  ['technical-detail', TECHNICAL_DETAIL_TEMPLATE],
  ['compliance', COMPLIANCE_TEMPLATE],
]);

/**
 * Returns all available built-in template names.
 */
export function getTemplateNames(): string[] {
  return [...TEMPLATES.keys()];
}

/**
 * Returns a template by name, or `undefined` if not found.
 */
export function getTemplate(name: string): ReportTemplate | undefined {
  return TEMPLATES.get(name);
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

/**
 * Renders a findings report using the specified template.
 *
 * Each template section is rendered as a titled block, separated by
 * horizontal rules. The result is a plain-text string ready for
 * terminal output or file export.
 *
 * @param report - The findings report to render.
 * @param templateName - Name of a built-in template.
 * @returns A formatted plain-text report string.
 * @throws Error if the template name is not recognized.
 */
export function renderReport(
  report: FindingsReport,
  templateName: BuiltInTemplate | string,
): string {
  const template = TEMPLATES.get(templateName);
  if (!template) {
    const available = [...TEMPLATES.keys()].join(', ');
    throw new Error(
      `Unknown template "${templateName}". Available: ${available}`,
    );
  }

  const separator = '='.repeat(60);
  const parts: string[] = [
    separator,
    `  AugmentaSec Report — ${template.name}`,
    separator,
    '',
  ];

  for (const section of template.sections) {
    parts.push(`--- ${section.title} ---`);
    parts.push('');
    parts.push(section.render(report));
    parts.push('');
  }

  parts.push(separator);
  parts.push(`Generated by AugmentaSec v${report.version}`);
  parts.push(separator);

  return parts.join('\n');
}
