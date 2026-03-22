/**
 * Review configuration helpers (ASEC-046).
 *
 * Provides severity-aware filtering and auto-approve logic based on
 * the project's AugmentaSecConfig.review settings.
 */

import type {AugmentaSecConfig} from '../config/schema.js';
import type {Finding, Severity} from '../findings/types.js';
import {isAtLeast} from '../findings/severity.js';

/**
 * Returns `true` when the review can be auto-approved.
 *
 * Auto-approval is granted only when **every** finding's severity is
 * strictly below the configured `auto_approve_below` threshold.
 * An empty findings array always auto-approves.
 */
export function shouldAutoApprove(
  findings: Finding[],
  config: AugmentaSecConfig,
): boolean {
  const threshold: Severity = config.review.auto_approve_below;
  return findings.every((f) => !isAtLeast(f.severity, threshold));
}

/**
 * Filters findings to only those at or above the configured
 * `min_severity` scan threshold.
 *
 * This prevents low-noise informational findings from cluttering
 * PR reviews when the project has set a higher minimum bar.
 */
export function filterByConfig(
  findings: Finding[],
  config: AugmentaSecConfig,
): Finding[] {
  const minSeverity: Severity = config.scan.min_severity;
  return findings.filter((f) => isAtLeast(f.severity, minSeverity));
}
