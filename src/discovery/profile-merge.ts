/**
 * Profile merge — combines fresh scan results with an existing profile
 * while preserving manual annotations.
 *
 * Strategy: auto-detected fields are overwritten by fresh data, but
 * manually-edited fields (trust boundaries, PII candidates with
 * human-assigned classifications, and user notes) are preserved.
 */

import type {
  SecurityProfile,
  TrustBoundaryCandidate,
  PiiFieldCandidate,
} from './types.js';

/** Describes a conflict that occurred during profile merge. */
export interface MergeConflict {
  path: string;
  existingValue: unknown;
  freshValue: unknown;
  resolution: 'kept-existing' | 'used-fresh';
  reason: string;
}

/** Result of a profile merge. */
export interface MergeResult {
  profile: SecurityProfile;
  conflicts: MergeConflict[];
}

function isManualTrustBoundary(candidate: TrustBoundaryCandidate): boolean {
  return candidate.notes !== undefined || candidate.confidence === 1.0;
}

function isManualPiiField(candidate: PiiFieldCandidate): boolean {
  return candidate.confidence === 1.0;
}

function mergeTrustBoundaries(
  existing: TrustBoundaryCandidate[],
  fresh: TrustBoundaryCandidate[],
): {merged: TrustBoundaryCandidate[]; conflicts: MergeConflict[]} {
  const conflicts: MergeConflict[] = [];
  const merged: TrustBoundaryCandidate[] = [];
  const freshByName = new Map(fresh.map((c) => [c.name, c]));

  for (const candidate of existing) {
    if (isManualTrustBoundary(candidate)) {
      merged.push(candidate);
      const freshCandidate = freshByName.get(candidate.name);
      if (freshCandidate) {
        conflicts.push({
          path: `trustBoundaries.candidates[${candidate.name}]`,
          existingValue: candidate,
          freshValue: freshCandidate,
          resolution: 'kept-existing',
          reason: 'Manual annotation preserved',
        });
        freshByName.delete(candidate.name);
      }
    } else {
      const freshCandidate = freshByName.get(candidate.name);
      if (freshCandidate) {
        merged.push(freshCandidate);
        freshByName.delete(candidate.name);
      }
    }
  }

  for (const candidate of freshByName.values()) {
    merged.push(candidate);
  }

  return {merged, conflicts};
}

function mergePiiFields(
  existing: PiiFieldCandidate[],
  fresh: PiiFieldCandidate[],
): {merged: PiiFieldCandidate[]; conflicts: MergeConflict[]} {
  const conflicts: MergeConflict[] = [];
  const merged: PiiFieldCandidate[] = [];
  const freshByKey = new Map(fresh.map((c) => [`${c.field}@${c.location}`, c]));

  for (const candidate of existing) {
    const key = `${candidate.field}@${candidate.location}`;
    if (isManualPiiField(candidate)) {
      merged.push(candidate);
      const freshCandidate = freshByKey.get(key);
      if (freshCandidate) {
        conflicts.push({
          path: `piiFields.candidates[${key}]`,
          existingValue: candidate,
          freshValue: freshCandidate,
          resolution: 'kept-existing',
          reason: 'Manual classification preserved',
        });
        freshByKey.delete(key);
      }
    } else {
      const freshCandidate = freshByKey.get(key);
      if (freshCandidate) {
        merged.push(freshCandidate);
        freshByKey.delete(key);
      }
    }
  }

  for (const candidate of freshByKey.values()) {
    merged.push(candidate);
  }

  return {merged, conflicts};
}

/**
 * Merges a fresh scan profile with an existing profile.
 *
 * Fresh data overwrites auto-detected fields. Manual annotations
 * (trust boundaries with notes, PII with confidence 1.0) are preserved.
 */
export function mergeProfiles(
  existing: SecurityProfile,
  fresh: SecurityProfile,
): MergeResult {
  const conflicts: MergeConflict[] = [];

  const tbMerge = mergeTrustBoundaries(
    existing.trustBoundaries.candidates,
    fresh.trustBoundaries.candidates,
  );
  conflicts.push(...tbMerge.conflicts);

  const piiMerge = mergePiiFields(
    existing.piiFields.candidates,
    fresh.piiFields.candidates,
  );
  conflicts.push(...piiMerge.conflicts);

  const profile: SecurityProfile = {
    ...fresh,
    project: {
      ...fresh.project,
      description: existing.project.description ?? fresh.project.description,
    },
    trustBoundaries: {candidates: tbMerge.merged},
    piiFields: {candidates: piiMerge.merged},
  };

  if (
    existing.project.description &&
    fresh.project.description &&
    existing.project.description !== fresh.project.description
  ) {
    conflicts.push({
      path: 'project.description',
      existingValue: existing.project.description,
      freshValue: fresh.project.description,
      resolution: 'kept-existing',
      reason: 'Project description preserved from existing profile',
    });
  }

  return {profile, conflicts};
}
