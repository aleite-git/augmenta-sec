/**
 * Findings deduplication for AugmentaSec.
 *
 * Correlates findings across multiple scanners and suppresses duplicates
 * using exact, fuzzy (Levenshtein-based), or location-based matching.
 */

import type {Finding} from './types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Strategy used to identify duplicate findings. */
export type DeduplicationStrategy = 'exact' | 'fuzzy' | 'location-based';

/** A group of duplicate findings with one chosen as canonical. */
export interface DuplicateGroup {
  /** The representative finding for this group (highest confidence / most trusted scanner). */
  canonical: Finding;
  /** Other findings that are duplicates of the canonical one. */
  duplicates: Finding[];
  /** Human-readable reason why these were grouped. */
  reason: string;
}

/** Result of the deduplication process. */
export interface DeduplicatedResult {
  /** Unique findings after deduplication (one per group + ungrouped). */
  unique: Finding[];
  /** Groups of duplicate findings. */
  duplicates: DuplicateGroup[];
  /** Summary statistics. */
  stats: {
    /** Total input findings. */
    total: number;
    /** Number of unique findings after dedup. */
    unique: number;
    /** Number of duplicate groups. */
    duplicateGroups: number;
    /** Total suppressed (duplicate) findings. */
    suppressedCount: number;
  };
}

// ---------------------------------------------------------------------------
// Scanner trust ranking (higher = more trusted)
// ---------------------------------------------------------------------------

const SCANNER_TRUST: Record<string, number> = {
  semgrep: 5,
  codeql: 5,
  trivy: 4,
  'npm-audit': 3,
  gitleaks: 3,
  bandit: 3,
  eslint: 2,
};

/** Returns a trust score for the given scanner name, defaulting to 1. */
function scannerTrust(scanner?: string): number {
  if (!scanner) return 1;
  return SCANNER_TRUST[scanner.toLowerCase()] ?? 1;
}

// ---------------------------------------------------------------------------
// Similarity computation (Levenshtein-based)
// ---------------------------------------------------------------------------

/**
 * Computes the Levenshtein edit distance between two strings.
 *
 * Uses the classic dynamic-programming approach with O(min(a,b)) space.
 */
export function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // Ensure `a` is the shorter string for O(min(a,b)) space.
  if (a.length > b.length) {
    [a, b] = [b, a];
  }

  let prev = Array.from({length: a.length + 1}, (_, i) => i);
  let curr = new Array<number>(a.length + 1);

  for (let j = 1; j <= b.length; j++) {
    curr[0] = j;
    for (let i = 1; i <= a.length; i++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[i] = Math.min(
        curr[i - 1] + 1, // insertion
        prev[i] + 1, // deletion
        prev[i - 1] + cost, // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }

  return prev[a.length];
}

/**
 * Returns a similarity score between 0 and 1 for two strings.
 * 1 means identical, 0 means completely different.
 */
export function stringSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshteinDistance(a, b) / maxLen;
}

// ---------------------------------------------------------------------------
// Normalization helpers
// ---------------------------------------------------------------------------

/** Normalizes a string for comparison: lowercase, trim, collapse whitespace. */
function normalize(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, ' ');
}

// ---------------------------------------------------------------------------
// Matching predicates
// ---------------------------------------------------------------------------

/** Threshold for fuzzy title/description similarity (0-1). */
const FUZZY_THRESHOLD = 0.8;

/** Returns true if two findings are exact duplicates. */
function isExactMatch(a: Finding, b: Finding): boolean {
  return (
    normalize(a.title) === normalize(b.title) &&
    a.file === b.file &&
    a.line === b.line
  );
}

/** Returns true if two findings match by location (same file + line) with similar titles. */
function isLocationMatch(a: Finding, b: Finding): boolean {
  if (a.file == null || b.file == null) return false;
  if (a.line == null || b.line == null) return false;
  if (a.file !== b.file || a.line !== b.line) return false;
  return stringSimilarity(normalize(a.title), normalize(b.title)) >= FUZZY_THRESHOLD;
}

/** Returns true if two findings are fuzzy matches (similar title/description). */
function isFuzzyMatch(a: Finding, b: Finding): boolean {
  const titleSim = stringSimilarity(normalize(a.title), normalize(b.title));
  if (titleSim >= FUZZY_THRESHOLD) {
    // If titles are similar enough, check if they share location or category
    if (a.file === b.file && a.line === b.line) return true;
    if (a.category === b.category && a.cweId != null && a.cweId === b.cweId) {
      return true;
    }
    // Very high title similarity alone can indicate a duplicate
    if (titleSim >= 0.9) return true;
  }
  return false;
}

/** Selects the matching function for the given strategy. */
function matcherFor(
  strategy: DeduplicationStrategy,
): (a: Finding, b: Finding) => boolean {
  switch (strategy) {
    case 'exact':
      return isExactMatch;
    case 'location-based':
      return isLocationMatch;
    case 'fuzzy':
      return isFuzzyMatch;
  }
}

/** Returns a human-readable reason for the given strategy. */
function reasonFor(strategy: DeduplicationStrategy): string {
  switch (strategy) {
    case 'exact':
      return 'Exact match on title, file, and line';
    case 'location-based':
      return 'Same file and line with similar title';
    case 'fuzzy':
      return 'Fuzzy match on title with shared context';
  }
}

// ---------------------------------------------------------------------------
// Canonical selection
// ---------------------------------------------------------------------------

/**
 * Picks the canonical finding from a group.
 * Prefers higher confidence, then more trusted scanner.
 */
function pickCanonical(findings: Finding[]): Finding {
  return findings.reduce((best, current) => {
    if (current.confidence > best.confidence) return current;
    if (
      current.confidence === best.confidence &&
      scannerTrust(current.scanner) > scannerTrust(best.scanner)
    ) {
      return current;
    }
    return best;
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Deduplicates an array of findings using the specified strategy.
 *
 * The canonical finding in each duplicate group is the one with the highest
 * confidence, with ties broken by scanner trust ranking.
 *
 * @param findings - All findings to deduplicate.
 * @param strategy - Matching strategy (default: `'fuzzy'`).
 * @returns A {@link DeduplicatedResult} with unique findings and duplicate groups.
 */
export function deduplicateFindings(
  findings: Finding[],
  strategy: DeduplicationStrategy = 'fuzzy',
): DeduplicatedResult {
  if (findings.length === 0) {
    return {
      unique: [],
      duplicates: [],
      stats: {total: 0, unique: 0, duplicateGroups: 0, suppressedCount: 0},
    };
  }

  const matcher = matcherFor(strategy);
  const reason = reasonFor(strategy);

  // Union-Find to group findings.
  const parent = findings.map((_, i) => i);

  function find(i: number): number {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]]; // path compression
      i = parent[i];
    }
    return i;
  }

  function union(i: number, j: number): void {
    const ri = find(i);
    const rj = find(j);
    if (ri !== rj) parent[ri] = rj;
  }

  // O(n^2) pairwise comparison — acceptable for typical finding counts.
  for (let i = 0; i < findings.length; i++) {
    for (let j = i + 1; j < findings.length; j++) {
      if (matcher(findings[i], findings[j])) {
        union(i, j);
      }
    }
  }

  // Collect groups.
  const groups = new Map<number, Finding[]>();
  for (let i = 0; i < findings.length; i++) {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(findings[i]);
  }

  const unique: Finding[] = [];
  const duplicates: DuplicateGroup[] = [];

  for (const members of groups.values()) {
    if (members.length === 1) {
      unique.push(members[0]);
    } else {
      const canonical = pickCanonical(members);
      const dupes = members.filter((f) => f !== canonical);
      unique.push(canonical);
      duplicates.push({canonical, duplicates: dupes, reason});
    }
  }

  const suppressedCount = findings.length - unique.length;

  return {
    unique,
    duplicates,
    stats: {
      total: findings.length,
      unique: unique.length,
      duplicateGroups: duplicates.length,
      suppressedCount,
    },
  };
}
