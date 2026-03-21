/**
 * Profile merge utilities for `asec init`.
 *
 * When a user runs `asec init` again on a project that already has a
 * security profile, this module merges the freshly-detected profile
 * with the existing one — preserving manual edits (trust boundaries,
 * PII annotations, custom notes) while updating auto-detected data.
 */

import type {
  PiiFieldCandidate,
  PiiInfo,
  SecurityProfile,
  TrustBoundaryCandidate,
  TrustBoundaryInfo,
} from '../discovery/types.js';

/**
 * Returns `true` when the existing profile contains entries that look
 * like they were manually added or edited by a human.
 *
 * Heuristic: any trust-boundary or PII candidate with a `notes` field,
 * or any entry not present in a freshly-generated (empty) profile.
 */
export function hasManualEdits(existing: SecurityProfile): boolean {
  const hasTrustBoundaryEdits = existing.trustBoundaries.candidates.length > 0;
  const hasPiiEdits = existing.piiFields.candidates.length > 0;

  if (!hasTrustBoundaryEdits && !hasPiiEdits) {
    return false;
  }

  // Check for notes — a strong signal of manual editing
  const hasNotes =
    existing.trustBoundaries.candidates.some(c => c.notes !== undefined) ||
    existing.piiFields.candidates.some(
      c => (c as PiiFieldCandidate & {notes?: string}).notes !== undefined,
    );

  return hasNotes || hasTrustBoundaryEdits || hasPiiEdits;
}

/**
 * Merges two security profiles.
 *
 * Strategy:
 * - Auto-detected sections (languages, frameworks, database, api,
 *   securityControls, ci, docs, auth) are taken from `updated`.
 * - User-curated sections (trustBoundaries, piiFields) are merged:
 *   existing entries are kept (preserving notes), new entries from
 *   `updated` are appended.
 * - `version`, `generatedAt`, `target`, and `project` come from
 *   `updated`.
 */
export function mergeProfiles(
  existing: SecurityProfile,
  updated: SecurityProfile,
): SecurityProfile {
  return {
    // Metadata — always from the latest run
    version: updated.version,
    generatedAt: updated.generatedAt,
    target: updated.target,
    project: updated.project,

    // Auto-detected sections — replace wholesale
    languages: updated.languages,
    frameworks: updated.frameworks,
    auth: updated.auth,
    database: updated.database,
    api: updated.api,
    securityControls: updated.securityControls,
    ci: updated.ci,
    docs: updated.docs,

    // User-curated sections — merge carefully
    trustBoundaries: mergeTrustBoundaries(
      existing.trustBoundaries,
      updated.trustBoundaries,
    ),
    piiFields: mergePiiFields(existing.piiFields, updated.piiFields),
  };
}

/**
 * Merges trust boundary candidates, keyed by `name + type`.
 * Existing entries are preserved (including notes); new ones are appended.
 */
function mergeTrustBoundaries(
  existing: TrustBoundaryInfo,
  updated: TrustBoundaryInfo,
): TrustBoundaryInfo {
  const keyOf = (c: TrustBoundaryCandidate): string =>
    `${c.name}::${c.type}`;

  const merged = new Map<string, TrustBoundaryCandidate>();

  // Seed with existing entries (preserves notes and manual fields)
  for (const c of existing.candidates) {
    merged.set(keyOf(c), c);
  }

  // Append new entries from updated that are not already present
  for (const c of updated.candidates) {
    const key = keyOf(c);
    if (!merged.has(key)) {
      merged.set(key, c);
    }
  }

  return {candidates: [...merged.values()]};
}

/**
 * Merges PII field candidates, keyed by `field + location`.
 * Existing entries are preserved; new ones are appended.
 */
function mergePiiFields(
  existing: PiiInfo,
  updated: PiiInfo,
): PiiInfo {
  const keyOf = (c: PiiFieldCandidate): string =>
    `${c.field}::${c.location}`;

  const merged = new Map<string, PiiFieldCandidate>();

  // Seed with existing entries
  for (const c of existing.candidates) {
    merged.set(keyOf(c), c);
  }

  // Append new entries from updated that are not already present
  for (const c of updated.candidates) {
    const key = keyOf(c);
    if (!merged.has(key)) {
      merged.set(key, c);
    }
  }

  return {candidates: [...merged.values()]};
}
