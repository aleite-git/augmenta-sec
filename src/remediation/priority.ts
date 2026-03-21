/**
 * ASEC-075: Priority scoring for remediation suggestions.
 *
 * Computes a 0-100 priority score based on:
 * - Severity (40%)
 * - Exploitability (20%) — is the finding in public-facing code?
 * - Business impact (20%) — PII, auth systems, databases at risk
 * - Fix effort inverse (20%) — easier fixes get higher priority
 */

import type {Finding, Severity} from '../findings/types.js';
import type {SecurityProfile} from '../discovery/types.js';

// ---------------------------------------------------------------------------
// Severity scores (40% weight)
// ---------------------------------------------------------------------------

const SEVERITY_SCORES: Record<Severity, number> = {
  critical: 100,
  high: 80,
  medium: 50,
  low: 25,
  informational: 10,
};

// ---------------------------------------------------------------------------
// Exploitability helpers (20% weight)
// ---------------------------------------------------------------------------

/** Categories / patterns that indicate public-facing / exploitable code. */
const EXPLOITABLE_CATEGORIES = new Set([
  'injection',
  'sql',
  'xss',
  'csrf',
  'ssrf',
  'auth',
  'command-injection',
  'path-traversal',
]);

/** File path patterns indicating API / public-facing code. */
const PUBLIC_FACING_PATTERNS = [
  /routes?\//i,
  /api\//i,
  /controllers?\//i,
  /handlers?\//i,
  /middleware\//i,
  /endpoints?\//i,
  /server\.(ts|js|py|go|rs|java)$/i,
];

function computeExploitability(finding: Finding, profile: SecurityProfile): number {
  let score = 0;

  // Category-based exploitability
  if (EXPLOITABLE_CATEGORIES.has(finding.category.toLowerCase())) {
    score += 40;
  }

  // File-location based exploitability
  if (finding.file) {
    const isPublicFacing = PUBLIC_FACING_PATTERNS.some((p) =>
      p.test(finding.file!),
    );
    if (isPublicFacing) {
      score += 30;
    }
  }

  // Project has public API endpoints
  if (profile.api.routeCount > 0) {
    score += 15;
  }

  // High confidence amplifies exploitability
  if (finding.confidence >= 0.8) {
    score += 15;
  }

  return Math.min(100, score);
}

// ---------------------------------------------------------------------------
// Business impact helpers (20% weight)
// ---------------------------------------------------------------------------

function computeBusinessImpact(finding: Finding, profile: SecurityProfile): number {
  let score = 0;

  // PII handling increases impact
  if (profile.piiFields.candidates.length > 0) {
    score += 30;
  }

  // Auth system present + finding in auth code
  if (profile.auth.providers.length > 0) {
    score += 15;
    const isAuthRelated =
      finding.category.toLowerCase().includes('auth') ||
      finding.title.toLowerCase().includes('auth') ||
      (finding.file?.toLowerCase().includes('auth') ?? false);
    if (isAuthRelated) {
      score += 25;
    }
  }

  // Database present + finding is injection-related
  if (profile.database.databases.length > 0) {
    const isDbRelated =
      finding.category.toLowerCase().includes('sql') ||
      finding.category.toLowerCase().includes('injection') ||
      finding.category.toLowerCase().includes('database');
    if (isDbRelated) {
      score += 30;
    }
  }

  return Math.min(100, score);
}

// ---------------------------------------------------------------------------
// Fix effort inverse (20% weight)
// ---------------------------------------------------------------------------

/**
 * Lower effort = higher priority (we want quick wins first).
 * Maps CWE categories to approximate effort.
 */
function computeFixEffortInverse(finding: Finding): number {
  const cat = finding.category.toLowerCase();

  // Easy fixes score high (low effort = high priority)
  const easyCategories = [
    'headers',
    'misconfiguration',
    'secrets',
    'hardcoded',
    'dependencies',
    'transport',
    'crypto',
  ];
  if (easyCategories.some((c) => cat.includes(c))) {
    return 80;
  }

  // Medium fixes
  const mediumCategories = [
    'xss',
    'csrf',
    'injection',
    'sql',
    'path-traversal',
  ];
  if (mediumCategories.some((c) => cat.includes(c))) {
    return 50;
  }

  // Hard fixes
  const hardCategories = ['auth', 'access-control', 'deserialization', 'ssrf'];
  if (hardCategories.some((c) => cat.includes(c))) {
    return 30;
  }

  return 50; // default medium
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Computes a 0-100 priority score for a finding.
 *
 * Weighting:
 * - Severity: 40%
 * - Exploitability: 20%
 * - Business impact: 20%
 * - Fix effort (inverse): 20%
 *
 * @returns Integer score from 0 to 100.
 */
export function scorePriority(
  finding: Finding,
  profile: SecurityProfile,
): number {
  const severity = SEVERITY_SCORES[finding.severity] * 0.4;
  const exploitability = computeExploitability(finding, profile) * 0.2;
  const businessImpact = computeBusinessImpact(finding, profile) * 0.2;
  const effortInverse = computeFixEffortInverse(finding) * 0.2;

  const raw = severity + exploitability + businessImpact + effortInverse;
  return Math.round(Math.max(0, Math.min(100, raw)));
}
