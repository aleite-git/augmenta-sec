/**
 * ASEC-074: Autonomy decision engine.
 *
 * Determines what action AugmentaSec should take for a given finding
 * based on the configured autonomy thresholds (per-severity actions).
 */

import type {AugmentaSecConfig, AutonomyAction} from '../config/schema.js';
import type {Finding} from '../findings/types.js';

/** The resolved action for a finding, including the reason. */
export interface AutonomyDecision {
  /** The action to take. */
  action: AutonomyAction;
  /** Human-readable reason for the decision. */
  reason: string;
  /** The finding severity that drove the decision. */
  severity: string;
}

/** Severity levels that have a direct autonomy mapping in config. */
const MAPPED_SEVERITIES = ['critical', 'high', 'medium', 'low'] as const;
type MappedSeverity = (typeof MAPPED_SEVERITIES)[number];

/**
 * Returns true if the severity has a direct autonomy mapping.
 */
function isMappedSeverity(severity: string): severity is MappedSeverity {
  return (MAPPED_SEVERITIES as readonly string[]).includes(severity);
}

/**
 * Determines the autonomy action for a finding based on config thresholds.
 *
 * The decision logic:
 * 1. Look up the finding severity in the autonomy config.
 * 2. If the severity is "informational", default to "note" (lowest action).
 * 3. Return the configured action for that severity level.
 *
 * @param finding - The security finding to evaluate.
 * @param config - The fully-resolved AugmentaSec configuration.
 * @returns An {@link AutonomyDecision} with the action and reason.
 */
export function determineAction(
  finding: Finding,
  config: AugmentaSecConfig,
): AutonomyDecision {
  const {severity} = finding;
  const {autonomy} = config;

  // "informational" findings always get the lowest action.
  if (!isMappedSeverity(severity)) {
    return {
      action: 'note',
      reason: `Severity "${severity}" defaults to "note" (no autonomy threshold configured)`,
      severity,
    };
  }

  const action = autonomy[severity];

  return {
    action,
    reason: `Autonomy config maps severity "${severity}" to action "${action}"`,
    severity,
  };
}
