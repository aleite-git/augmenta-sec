/**
 * ASEC-070: Remediation engine core.
 *
 * Orchestrates rule-based and (optionally) LLM-enhanced remediation
 * suggestions for scan findings. Works without an LLM provider by
 * falling back to the built-in rule set.
 */

import type {Finding} from '../findings/types.js';
import type {SecurityProfile} from '../discovery/types.js';
import type {LLMProvider} from '../providers/llm/types.js';
import {applyRules} from './rules.js';
import {enhanceWithLLM} from './llm-enhance.js';
import {scorePriority} from './priority.js';
import {estimateEffort} from './effort.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Effort level for a remediation suggestion. */
export type EffortLevel = 'low' | 'medium' | 'high';

/** A single remediation suggestion tied to a finding. */
export interface RemediationSuggestion {
  /** ID of the finding this suggestion addresses. */
  findingId: string;
  /** Short human-readable title. */
  title: string;
  /** Detailed description of the remediation. */
  description: string;
  /** Estimated effort to implement the fix. */
  effort: EffortLevel;
  /** Priority score (0-100, higher = more urgent). */
  priority: number;
  /** Optional code example showing the fix. */
  codeExample?: string;
}

/** Full result returned by {@link runRemediation}. */
export interface RemediationResult {
  /** All suggestions, sorted by priority descending then effort ascending. */
  suggestions: RemediationSuggestion[];
  /** Whether LLM enhancement was used. */
  llmEnhanced: boolean;
}

// ---------------------------------------------------------------------------
// Effort ordering for tie-breaking
// ---------------------------------------------------------------------------

const EFFORT_ORDER: Record<EffortLevel, number> = {
  low: 0,
  medium: 1,
  high: 2,
};

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

/**
 * Runs the remediation engine against a set of findings.
 *
 * 1. Applies built-in rules to generate baseline suggestions.
 * 2. Computes priority scores and effort estimates using profile context.
 * 3. Optionally enhances suggestions via an LLM provider.
 * 4. Sorts by priority (descending), then effort (ascending).
 *
 * @param findings  - Scan findings to remediate.
 * @param profile   - Security profile of the scanned project.
 * @param provider  - Optional LLM provider for enhanced suggestions.
 * @returns Sorted remediation suggestions.
 */
export async function runRemediation(
  findings: Finding[],
  profile: SecurityProfile,
  provider?: LLMProvider,
): Promise<RemediationResult> {
  if (findings.length === 0) {
    return {suggestions: [], llmEnhanced: false};
  }

  // Step 1: rule-based suggestions
  let suggestions = applyRules(findings);

  // Step 2: enrich with priority + effort from profile context
  suggestions = suggestions.map((s) => {
    const finding = findings.find((f) => f.id === s.findingId);
    if (!finding) return s;

    const priority = scorePriority(finding, profile);
    const effortResult = estimateEffort(s, profile);
    return {...s, priority, effort: effortResult.level};
  });

  // Step 3: optional LLM enhancement
  let llmEnhanced = false;
  if (provider) {
    try {
      const before = suggestions.map((s) => `${s.findingId}:${s.title}`);
      const enhanced = await enhanceWithLLM(suggestions, findings, provider);

      // Detect whether the LLM actually changed any suggestions
      const after = enhanced.map((s) => `${s.findingId}:${s.title}`);
      const changed =
        before.length !== after.length ||
        before.some((b, i) => b !== after[i]);

      suggestions = enhanced;
      llmEnhanced = changed;
    } catch {
      // Graceful fallback — keep rule-based suggestions
    }
  }

  // Step 4: sort by priority desc, then effort asc
  suggestions.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return EFFORT_ORDER[a.effort] - EFFORT_ORDER[b.effort];
  });

  return {suggestions, llmEnhanced};
}
