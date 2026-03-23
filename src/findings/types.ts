/**
 * Canonical findings schema for AugmentaSec.
 *
 * Normalizes output from all sources (scanners, LLM analysis, manual review)
 * into a single unified finding format for consistent reporting and triage.
 */

import {randomUUID} from 'node:crypto';

// ---------------------------------------------------------------------------
// Core enums / union types
// ---------------------------------------------------------------------------

export type Severity =
  | 'critical'
  | 'high'
  | 'medium'
  | 'low'
  | 'informational';

export type FindingSource = 'scanner' | 'llm' | 'manual';

export type FindingStatus =
  | 'open'
  | 'confirmed'
  | 'false-positive'
  | 'accepted-risk'
  | 'fixed';

// ---------------------------------------------------------------------------
// Finding
// ---------------------------------------------------------------------------

export interface Finding {
  /** Unique identifier (UUID v4). */
  id: string;
  /** Where this finding originated. */
  source: FindingSource;
  /** Scanner that produced the finding, e.g. "semgrep", "trivy". */
  scanner?: string;
  /** High-level category, e.g. "auth", "injection", "pii", "dependencies". */
  category: string;
  /** Contextually-adjusted severity. */
  severity: Severity;
  /** Original severity before contextual adjustment. */
  rawSeverity: Severity;
  /** Short human-readable title. */
  title: string;
  /** Detailed description of the finding. */
  description: string;
  /** File path where the finding was detected. */
  file?: string;
  /** Line number in the file. */
  line?: number;
  /** Column number in the file. */
  column?: number;
  /** Confidence score from 0 (lowest) to 1 (highest). */
  confidence: number;
  /** CWE identifier, e.g. "CWE-79". */
  cweId?: string;
  /** CVE identifier, e.g. "CVE-2024-1234". */
  cveId?: string;
  /** OWASP Top 10 category, e.g. "A03:2021-Injection". */
  owaspCategory?: string;
  /** Suggested remediation or fix. */
  suggestedFix?: string;
  /** LLM-generated contextual note about why this finding matters here. */
  contextualNote?: string;
  /** Current triage status. */
  status: FindingStatus;
  /** ISO 8601 timestamp of when this finding was created. */
  createdAt: string;
  /** Arbitrary key-value metadata from the source. */
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Report + Summary
// ---------------------------------------------------------------------------

export interface FindingsSummary {
  total: number;
  bySeverity: Record<Severity, number>;
  byCategory: Record<string, number>;
  bySource: Record<FindingSource, number>;
}

export interface FindingsReport {
  version: string;
  generatedAt: string;
  target: string;
  summary: FindingsSummary;
  findings: Finding[];
  /** Non-fatal warnings (e.g. scanner failures) surfaced during the scan. */
  warnings?: string[];
}

// ---------------------------------------------------------------------------
// Factory helpers
// ---------------------------------------------------------------------------

/** Creates a {@link Finding} with a generated UUID and default status. */
export function createFinding(
  partial: Omit<Finding, 'id' | 'createdAt' | 'status'>,
): Finding {
  return {
    ...partial,
    id: randomUUID(),
    status: 'open',
    createdAt: new Date().toISOString(),
  };
}

/** Builds a {@link FindingsSummary} from an array of findings. */
export function summarizeFindings(findings: Finding[]): FindingsSummary {
  const bySeverity: Record<Severity, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    informational: 0,
  };

  const byCategory: Record<string, number> = {};

  const bySource: Record<FindingSource, number> = {
    scanner: 0,
    llm: 0,
    manual: 0,
  };

  for (const f of findings) {
    bySeverity[f.severity]++;
    byCategory[f.category] = (byCategory[f.category] ?? 0) + 1;
    bySource[f.source]++;
  }

  return {
    total: findings.length,
    bySeverity,
    byCategory,
    bySource,
  };
}
