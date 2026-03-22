/**
 * ASEC-074: Effort estimation for remediation suggestions.
 *
 * Estimates the implementation effort based on finding severity,
 * project context from the security profile, and fix complexity.
 */

import type {SecurityProfile} from '../discovery/types.js';
import type {RemediationSuggestion, EffortLevel} from './engine.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Detailed effort estimation result. */
export interface EffortEstimate {
  /** Categorical effort level. */
  level: EffortLevel;
  /** Estimated hours to implement the fix. */
  estimatedHours: number;
  /** Factors that influenced the estimate. */
  factors: string[];
}

// ---------------------------------------------------------------------------
// Heuristics
// ---------------------------------------------------------------------------

/** Base hours by effort level from the suggestion's rule-based default. */
const BASE_HOURS: Record<EffortLevel, number> = {
  low: 1,
  medium: 4,
  high: 12,
};

/**
 * Estimates effort for a remediation suggestion given project context.
 *
 * Factors considered:
 * - Base effort from the suggestion's default level.
 * - Codebase size: more languages/frameworks increase complexity.
 * - Monorepo: multiple workspaces multiply the fix scope.
 * - Existing security controls: presence reduces effort (patterns exist).
 * - CI maturity: automated security checks reduce validation effort.
 */
export function estimateEffort(
  suggestion: RemediationSuggestion,
  profile: SecurityProfile,
): EffortEstimate {
  const factors: string[] = [];
  let hours = BASE_HOURS[suggestion.effort];
  let level = suggestion.effort;

  // Factor: codebase complexity (language count)
  const langCount = profile.languages.all.length;
  if (langCount > 3) {
    hours *= 1.5;
    factors.push(`Multi-language codebase (${langCount} languages)`);
  } else if (langCount > 1) {
    hours *= 1.2;
    factors.push(`${langCount} languages detected`);
  } else {
    factors.push('Single-language codebase');
  }

  // Factor: monorepo
  if (profile.monorepo.isMonorepo) {
    const workspaceCount = profile.monorepo.workspaces.length;
    if (workspaceCount > 5) {
      hours *= 1.5;
      factors.push(`Large monorepo (${workspaceCount} workspaces)`);
    } else if (workspaceCount > 1) {
      hours *= 1.2;
      factors.push(`Monorepo (${workspaceCount} workspaces)`);
    }
  }

  // Factor: existing security controls (reduces effort)
  const controlCount = profile.securityControls.present.length;
  if (controlCount >= 5) {
    hours *= 0.8;
    factors.push(`Strong security baseline (${controlCount} controls present)`);
  } else if (controlCount === 0) {
    hours *= 1.3;
    factors.push('No existing security controls detected');
  }

  // Factor: CI maturity (reduces validation effort)
  const ciSecurityChecks = profile.ci.securityChecks.length;
  if (ciSecurityChecks >= 3) {
    hours *= 0.9;
    factors.push(`Mature CI security pipeline (${ciSecurityChecks} checks)`);
  } else if (ciSecurityChecks === 0) {
    hours *= 1.1;
    factors.push('No CI security checks detected');
  }

  // Factor: priority affects urgency perception but not raw hours
  if (suggestion.priority >= 90) {
    factors.push('Critical priority — immediate action recommended');
  }

  // Round and determine final level
  hours = Math.round(hours * 10) / 10;

  if (hours <= 2) {
    level = 'low';
  } else if (hours <= 8) {
    level = 'medium';
  } else {
    level = 'high';
  }

  return {level, estimatedHours: hours, factors};
}
