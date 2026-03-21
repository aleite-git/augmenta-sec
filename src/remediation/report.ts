/**
 * ASEC-076: Remediation report generation.
 *
 * Formats remediation suggestions into a structured plain-text report
 * with an executive summary, detailed suggestions, and code examples.
 */

import type {RemediationSuggestion, EffortLevel} from './engine.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Counts of suggestions grouped by effort level. */
export interface EffortSummary {
  low: number;
  medium: number;
  high: number;
  total: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildEffortSummary(suggestions: RemediationSuggestion[]): EffortSummary {
  const summary: EffortSummary = {low: 0, medium: 0, high: 0, total: suggestions.length};
  for (const s of suggestions) {
    summary[s.effort]++;
  }
  return summary;
}

function effortLabel(effort: EffortLevel): string {
  switch (effort) {
    case 'low':
      return 'Low (< 2 hours)';
    case 'medium':
      return 'Medium (2-8 hours)';
    case 'high':
      return 'High (8+ hours)';
  }
}

function separator(char = '=', length = 72): string {
  return char.repeat(length);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Computes the effort summary for a set of suggestions.
 */
export function getEffortSummary(
  suggestions: RemediationSuggestion[],
): EffortSummary {
  return buildEffortSummary(suggestions);
}

/**
 * Formats remediation suggestions into a plain-text report.
 *
 * Sections:
 * 1. Executive summary — counts by effort level.
 * 2. Detailed suggestions — sorted by priority.
 * 3. Code examples — for suggestions that include them.
 */
export function formatRemediationReport(
  suggestions: RemediationSuggestion[],
): string {
  if (suggestions.length === 0) {
    return [
      separator(),
      '  REMEDIATION REPORT',
      separator(),
      '',
      'No remediation suggestions to report.',
      '',
    ].join('\n');
  }

  const summary = buildEffortSummary(suggestions);
  const lines: string[] = [];

  // --- Executive Summary ---
  lines.push(separator());
  lines.push('  REMEDIATION REPORT');
  lines.push(separator());
  lines.push('');
  lines.push('EXECUTIVE SUMMARY');
  lines.push(separator('-', 40));
  lines.push(`Total suggestions: ${summary.total}`);
  lines.push(`  Low effort:    ${summary.low}`);
  lines.push(`  Medium effort: ${summary.medium}`);
  lines.push(`  High effort:   ${summary.high}`);
  lines.push('');

  // Quick wins
  const quickWins = suggestions.filter(
    (s) => s.effort === 'low' && s.priority >= 70,
  );
  if (quickWins.length > 0) {
    lines.push(`Quick wins (low effort, high priority): ${quickWins.length}`);
    for (const qw of quickWins) {
      lines.push(`  - [P${qw.priority}] ${qw.title}`);
    }
    lines.push('');
  }

  // --- Detailed Suggestions ---
  lines.push(separator());
  lines.push('  DETAILED SUGGESTIONS');
  lines.push(separator());
  lines.push('');

  for (let i = 0; i < suggestions.length; i++) {
    const s = suggestions[i];
    lines.push(`${i + 1}. ${s.title}`);
    lines.push(`   Finding: ${s.findingId}`);
    lines.push(`   Priority: ${s.priority}/100`);
    lines.push(`   Effort: ${effortLabel(s.effort)}`);
    lines.push(`   ${s.description}`);
    lines.push('');
  }

  // --- Code Examples ---
  const withExamples = suggestions.filter((s) => s.codeExample);
  if (withExamples.length > 0) {
    lines.push(separator());
    lines.push('  CODE EXAMPLES');
    lines.push(separator());
    lines.push('');

    for (const s of withExamples) {
      lines.push(`>> ${s.title}`);
      lines.push('');
      lines.push(s.codeExample!);
      lines.push('');
      lines.push(separator('-', 40));
      lines.push('');
    }
  }

  return lines.join('\n');
}
