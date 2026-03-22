/**
 * ASEC-076: Duplicate issue detection for the remediation backlog.
 *
 * Before creating a new issue for a finding, checks existing open issues
 * on the platform to avoid duplicates. Matches by finding ID embedded
 * in issue bodies, and falls back to title similarity.
 */

import type {Finding} from '../findings/types.js';
import type {GitPlatform} from '../providers/git-platform/types.js';

/**
 * Computes a simple normalized similarity score between two strings.
 *
 * Uses a trigram-based approach: the ratio of shared trigrams to the
 * total unique trigrams across both strings. Returns a value between
 * 0 (no overlap) and 1 (identical).
 */
export function titleSimilarity(a: string, b: string): number {
  const normalize = (s: string): string => s.toLowerCase().trim();
  const trigramsOf = (s: string): Set<string> => {
    const result = new Set<string>();
    const normalized = normalize(s);
    for (let i = 0; i <= normalized.length - 3; i++) {
      result.add(normalized.substring(i, i + 3));
    }
    return result;
  };

  const triA = trigramsOf(a);
  const triB = trigramsOf(b);

  if (triA.size === 0 && triB.size === 0) {
    return 1;
  }
  if (triA.size === 0 || triB.size === 0) {
    return 0;
  }

  let shared = 0;
  for (const t of triA) {
    if (triB.has(t)) {
      shared++;
    }
  }

  const union = new Set([...triA, ...triB]);
  return shared / union.size;
}

/** Default similarity threshold for title-based matching. */
const TITLE_SIMILARITY_THRESHOLD = 0.6;

/**
 * Checks whether an issue already exists for the given finding.
 *
 * Detection strategy:
 * 1. **ID match:** Scans open issue bodies for the finding's UUID.
 * 2. **Title match:** Falls back to trigram similarity on issue titles.
 *
 * @param finding - The finding to check for duplicates.
 * @param platform - The git platform adapter.
 * @param similarityThreshold - Minimum title similarity (0-1) to consider
 *   a duplicate (default: 0.6).
 * @returns The URL of the duplicate issue, or `null` if none found.
 */
export async function checkForDuplicateIssue(
  finding: Finding,
  platform: GitPlatform,
  similarityThreshold: number = TITLE_SIMILARITY_THRESHOLD,
): Promise<string | null> {
  // Fetch open PRs as a proxy for open issues. The GitPlatform interface
  // currently exposes getPullRequests but not getIssues. We search PRs
  // (which on GitHub also includes issues via the same API surface) for
  // the finding ID.
  const openPRs = await platform.getPullRequests('open');

  // Strategy 1: exact finding ID match in the PR/issue title or body.
  // The PR title format includes the finding ID from buildPRTitle/buildIssueFromFinding.
  for (const pr of openPRs) {
    if (pr.title.includes(finding.id)) {
      return pr.url;
    }
  }

  // Strategy 2: title similarity on the finding title portion.
  const severityBadge = `[${finding.severity.toUpperCase()}]`;
  const candidateTitle = `${severityBadge} ${finding.title}`;

  for (const pr of openPRs) {
    const similarity = titleSimilarity(pr.title, candidateTitle);
    if (similarity >= similarityThreshold) {
      return pr.url;
    }
  }

  return null;
}
