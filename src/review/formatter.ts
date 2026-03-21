/**
 * Findings-to-review formatter (ASEC-045).
 *
 * Maps canonical findings to line-level PR review comments compatible
 * with the GitPlatform SecurityReview / ReviewFinding types.
 */

import type {Diff, DiffFile} from '../providers/git-platform/types.js';
import type {
  SecurityReview,
  ReviewFinding,
} from '../providers/git-platform/types.js';
import type {Finding} from '../findings/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveLine(finding: Finding, diffFile: DiffFile | undefined): number {
  if (finding.line && finding.line > 0) return finding.line;

  if (diffFile?.patch) {
    const hunkMatch = /^@@\s+-\d+(?:,\d+)?\s+\+(\d+)/.exec(diffFile.patch);
    if (hunkMatch) {
      return parseInt(hunkMatch[1], 10);
    }
  }

  return 1;
}

function severityIcon(severity: string): string {
  switch (severity) {
    case 'critical':
      return '\ud83d\udd34 CRITICAL';
    case 'high':
      return '\ud83d\udfe0 HIGH';
    case 'medium':
      return '\ud83d\udfe1 MEDIUM';
    case 'low':
      return '\ud83d\udd35 LOW';
    default:
      return '\u26aa INFO';
  }
}

function buildCommentBody(finding: Finding): string {
  const parts: string[] = [];

  parts.push(
    `**${severityIcon(finding.severity)}** \u2014 ${finding.title}`,
  );
  parts.push('');
  parts.push(finding.description);

  if (finding.cweId) {
    parts.push('');
    parts.push(`**CWE:** ${finding.cweId}`);
  }

  if (finding.suggestedFix) {
    parts.push('');
    parts.push('**Suggested fix:**');
    parts.push(`\`\`\`\n${finding.suggestedFix}\n\`\`\``);
  }

  return parts.join('\n');
}

function buildSummary(findings: Finding[], approved: boolean): string {
  if (findings.length === 0) {
    return '\u2705 **AugmentaSec Security Review** \u2014 No security issues found.';
  }

  const counts: Record<string, number> = {};
  for (const f of findings) {
    counts[f.severity] = (counts[f.severity] ?? 0) + 1;
  }

  const parts: string[] = [];
  const status = approved ? '\u2705' : '\u26a0\ufe0f';
  parts.push(
    `${status} **AugmentaSec Security Review** \u2014 ${findings.length} finding(s)`,
  );
  parts.push('');

  for (const [sev, count] of Object.entries(counts)) {
    parts.push(`- ${severityIcon(sev)}: ${count}`);
  }

  if (!approved) {
    parts.push('');
    parts.push('Please address the findings above before merging.');
  }

  return parts.join('\n');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Converts canonical findings into a SecurityReview that can be
 * posted to a git platform via commentOnPR.
 *
 * Findings without a file path are included in the summary but
 * omitted from inline comments (they cannot be mapped to a line).
 */
export function formatAsReview(
  findings: Finding[],
  diff: Diff,
  approved: boolean,
): SecurityReview {
  const filesByPath = new Map<string, DiffFile>();
  for (const f of diff.files) {
    filesByPath.set(f.path, f);
  }

  const reviewFindings: ReviewFinding[] = findings
    .filter(
      (f): f is Finding & {file: string} => typeof f.file === 'string',
    )
    .map((f) => {
      const diffFile = filesByPath.get(f.file);
      const line = resolveLine(f, diffFile);

      const reviewSeverity: ReviewFinding['severity'] =
        f.severity === 'informational' ? 'low' : f.severity;

      return {
        file: f.file,
        line,
        severity: reviewSeverity,
        message: buildCommentBody(f),
        suggestedFix: f.suggestedFix,
      };
    });

  return {
    summary: buildSummary(findings, approved),
    findings: reviewFindings,
    approved,
  };
}
