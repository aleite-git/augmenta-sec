/**
 * Contextual severity scoring for AugmentaSec findings.
 *
 * Adjusts raw scanner severity based on project context (public exposure,
 * PII handling, auth proximity, etc.) so that findings are ranked by
 * actual risk rather than generic scanner heuristics.
 */

import type {Severity} from './types.js';

// ---------------------------------------------------------------------------
// Context descriptor
// ---------------------------------------------------------------------------

/** Contextual signals used to adjust a finding's raw severity. */
export interface SeverityContext {
  // From security profile
  /** Whether the project exposes public API endpoints. */
  isPublicFacing: boolean;
  /** Whether PII fields were detected in the codebase. */
  handlesPII: boolean;
  /** Whether an auth system was detected. */
  hasAuthSystem: boolean;
  /** Number of trust boundaries identified. */
  trustBoundaryCount: number;

  // From finding location
  /** Whether the finding is in auth-related code. */
  isInAuthCode: boolean;
  /** Whether the finding is in an API route handler. */
  isInApiRoute: boolean;
  /** Whether the finding is in test code. */
  isInTestCode: boolean;
  /** Whether the finding is in third-party / vendored code. */
  isInThirdParty: boolean;
}

// ---------------------------------------------------------------------------
// Numeric ↔ Severity mapping
// ---------------------------------------------------------------------------

const SEVERITY_ORDER: readonly Severity[] = [
  'informational', // 1
  'low', // 2
  'medium', // 3
  'high', // 4
  'critical', // 5
] as const;

/** Converts a severity label to a numeric value (informational=1 … critical=5). */
export function severityToNumber(severity: Severity): number {
  const idx = SEVERITY_ORDER.indexOf(severity);
  if (idx === -1) {
    throw new Error(`Unknown severity: ${severity}`);
  }
  return idx + 1;
}

/** Converts a numeric value (1–5) back to a severity label. */
export function numberToSeverity(n: number): Severity {
  if (n < 1 || n > 5 || !Number.isInteger(n)) {
    throw new Error(`Severity number must be an integer 1–5, got ${n}`);
  }
  return SEVERITY_ORDER[n - 1];
}

// ---------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------

/** Returns `true` when `severity` is at least as severe as `threshold`. */
export function isAtLeast(severity: Severity, threshold: Severity): boolean {
  return severityToNumber(severity) >= severityToNumber(threshold);
}

// ---------------------------------------------------------------------------
// Contextual adjustment
// ---------------------------------------------------------------------------

/**
 * Adjusts a raw severity based on contextual signals.
 *
 * **Rules (applied additively, capped at ±2 levels):**
 * - Finding in test code → -1
 * - Finding in third-party code → -1
 * - Finding in auth code AND project handles PII → +1
 * - Finding in a public API route → +1
 *
 * The result is always clamped to the [informational, critical] range.
 */
export function adjustSeverity(
  rawSeverity: Severity,
  context: SeverityContext,
): Severity {
  let delta = 0;

  // Downgrades
  if (context.isInTestCode) {
    delta -= 1;
  }
  if (context.isInThirdParty) {
    delta -= 1;
  }

  // Upgrades
  if (context.isInAuthCode && context.handlesPII) {
    delta += 1;
  }
  if (context.isInApiRoute) {
    delta += 1;
  }

  // Cap cumulative adjustment at ±2
  delta = Math.max(-2, Math.min(2, delta));

  const raw = severityToNumber(rawSeverity);
  const adjusted = Math.max(1, Math.min(5, raw + delta));

  return numberToSeverity(adjusted);
}
