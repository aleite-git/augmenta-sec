/**
 * ASEC-072: Issue creation from security findings.
 *
 * Transforms a Finding into a platform-specific security issue
 * and creates it via the GitPlatform adapter.
 */

import type {Finding} from '../findings/types.js';
import type {GitPlatform, SecurityIssue} from '../providers/git-platform/types.js';

/**
 * Builds a {@link SecurityIssue} from a {@link Finding}.
 *
 * Exported for testing; callers should use {@link createIssueFromFinding}.
 */
export function buildIssueFromFinding(finding: Finding): SecurityIssue {
  const severityBadge = `[${finding.severity.toUpperCase()}]`;
  const title = `${severityBadge} ${finding.title}`;

  const bodyParts: string[] = [
    `## Security Finding`,
    '',
    `**Severity:** ${finding.severity}`,
    `**Category:** ${finding.category}`,
    `**Confidence:** ${(finding.confidence * 100).toFixed(0)}%`,
    `**Source:** ${finding.source}`,
  ];

  if (finding.scanner) {
    bodyParts.push(`**Scanner:** ${finding.scanner}`);
  }
  if (finding.cweId) {
    bodyParts.push(`**CWE:** ${finding.cweId}`);
  }
  if (finding.cveId) {
    bodyParts.push(`**CVE:** ${finding.cveId}`);
  }
  if (finding.owaspCategory) {
    bodyParts.push(`**OWASP:** ${finding.owaspCategory}`);
  }

  bodyParts.push('', '### Description', '', finding.description);

  if (finding.file) {
    const location = finding.line
      ? `${finding.file}:${finding.line}`
      : finding.file;
    bodyParts.push('', '### Location', '', `\`${location}\``);
  }

  if (finding.suggestedFix) {
    bodyParts.push('', '### Suggested Fix', '', finding.suggestedFix);
  }

  if (finding.contextualNote) {
    bodyParts.push('', '### Context', '', finding.contextualNote);
  }

  bodyParts.push(
    '',
    '---',
    `*Created by AugmentaSec — Finding ID: \`${finding.id}\`*`,
  );

  const labels = ['security', finding.severity];
  if (finding.category) {
    labels.push(finding.category);
  }

  return {
    title,
    body: bodyParts.join('\n'),
    severity: finding.severity,
    labels,
  };
}

/**
 * Creates a security issue on the given platform from a finding.
 *
 * @param finding - The security finding to file as an issue.
 * @param platform - The git platform adapter to use.
 * @returns The URL of the created issue.
 */
export async function createIssueFromFinding(
  finding: Finding,
  platform: GitPlatform,
): Promise<string> {
  const issue = buildIssueFromFinding(finding);
  return platform.createIssue(issue);
}
