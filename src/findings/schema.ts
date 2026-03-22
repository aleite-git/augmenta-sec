/**
 * Normalized finding schema and validation for AugmentaSec.
 *
 * Provides a unified {@link NormalizedFinding} interface that represents
 * scanner output in a canonical form, plus factory and validation helpers.
 */

import {randomUUID} from 'node:crypto';
import type {Severity} from './types.js';

// ---------------------------------------------------------------------------
// NormalizedFinding
// ---------------------------------------------------------------------------

/** A scanner finding normalized into AugmentaSec's canonical shape. */
export interface NormalizedFinding {
  /** Unique identifier (UUID v4). */
  id: string;
  /** Short human-readable title. */
  title: string;
  /** Detailed description of the finding. */
  description: string;
  /** Contextually-adjusted severity. */
  severity: Severity;
  /** High-level category, e.g. "injection", "auth", "pii", "dependencies". */
  category: string;
  /** Scanner name that produced this finding, e.g. "semgrep", "trivy". */
  source: string;
  /** File path where the finding was detected. */
  file?: string;
  /** Line number in the file. */
  line?: number;
  /** Column number in the file. */
  column?: number;
  /** CWE identifier, e.g. "CWE-79". */
  cwe?: string;
  /** OWASP Top 10 category, e.g. "A03:2021-Injection". */
  owasp?: string;
  /** Confidence score from 0 (lowest) to 1 (highest). */
  confidence: number;
  /** Arbitrary key-value metadata from the source scanner. */
  metadata: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// NormalizedFindingsReport
// ---------------------------------------------------------------------------

/** Summary of findings counts by severity level. */
export interface SeverityCounts {
  critical: number;
  high: number;
  medium: number;
  low: number;
  informational: number;
}

/** Metadata about the scan that produced a findings report. */
export interface ScanMetadata {
  /** ISO 8601 timestamp when the scan started. */
  scanTime: string;
  /** Target that was scanned (repo path, URL, etc.). */
  target: string;
  /** Scanners that contributed findings. */
  scanners?: string[];
  /** Duration of the scan in milliseconds. */
  durationMs?: number;
}

/** A complete normalized findings report with summary statistics. */
export interface NormalizedFindingsReport {
  /** Normalized findings from all scanners. */
  findings: NormalizedFinding[];
  /** Counts by severity level. */
  summary: SeverityCounts;
  /** Metadata about the scan run. */
  metadata: ScanMetadata;
}

// ---------------------------------------------------------------------------
// Raw finding shape (loose input from scanners)
// ---------------------------------------------------------------------------

/**
 * Loosely-typed raw finding from a scanner. Fields may be missing or
 * named differently depending on the scanner.
 */
export interface RawFinding {
  /** Title or rule name. */
  title?: string;
  /** Rule ID (some scanners use this instead of title). */
  ruleId?: string;
  /** Description or message. */
  description?: string;
  message?: string;
  /** Severity as a string — scanners use various casing and labels. */
  severity?: string;
  /** Category or type. */
  category?: string;
  type?: string;
  /** File path. */
  file?: string;
  path?: string;
  /** Line number. */
  line?: number;
  startLine?: number;
  /** Column number. */
  column?: number;
  startColumn?: number;
  /** CWE ID(s). */
  cwe?: string | string[];
  cweId?: string;
  /** OWASP mapping. */
  owasp?: string;
  owaspCategory?: string;
  /** Confidence. */
  confidence?: number | string;
  /** Extra data. */
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Severity normalization
// ---------------------------------------------------------------------------

const SEVERITY_ALIASES: Record<string, Severity> = {
  critical: 'critical',
  crit: 'critical',
  high: 'high',
  error: 'high',
  medium: 'medium',
  med: 'medium',
  moderate: 'medium',
  warning: 'medium',
  low: 'low',
  minor: 'low',
  informational: 'informational',
  info: 'informational',
  note: 'informational',
  none: 'informational',
};

/** Maps a raw severity string to a canonical {@link Severity}. */
export function normalizeSeverity(raw: string | undefined): Severity {
  if (!raw) return 'informational';
  const key = raw.toLowerCase().trim();
  return SEVERITY_ALIASES[key] ?? 'informational';
}

// ---------------------------------------------------------------------------
// Confidence normalization
// ---------------------------------------------------------------------------

/**
 * Normalizes a confidence value to a number between 0 and 1.
 * Accepts numbers (0-1 or 0-100) and string labels.
 */
export function normalizeConfidence(raw: number | string | undefined): number {
  if (raw == null) return 0.5;

  if (typeof raw === 'string') {
    const lower = raw.toLowerCase().trim();
    if (lower === 'high' || lower === 'certain') return 0.9;
    if (lower === 'medium' || lower === 'moderate' || lower === 'firm') return 0.7;
    if (lower === 'low' || lower === 'tentative') return 0.3;
    const parsed = parseFloat(lower);
    if (!isNaN(parsed)) {
      return parsed > 1 ? Math.min(parsed / 100, 1) : Math.max(0, Math.min(1, parsed));
    }
    return 0.5;
  }

  // Number input: if > 1, assume 0-100 scale
  if (raw > 1) return Math.min(raw / 100, 1);
  return Math.max(0, Math.min(1, raw));
}

// ---------------------------------------------------------------------------
// normalizeFinding
// ---------------------------------------------------------------------------

/**
 * Converts raw scanner output to a {@link NormalizedFinding}.
 *
 * Maps common field names from various scanner formats into the canonical
 * shape, normalizing severity labels and confidence values.
 *
 * @param raw - Raw finding object from a scanner.
 * @param source - Scanner name, e.g. "semgrep", "trivy".
 * @returns A fully-populated {@link NormalizedFinding}.
 */
export function normalizeFinding(raw: RawFinding, source: string): NormalizedFinding {
  const cweRaw = raw.cweId ?? (Array.isArray(raw.cwe) ? raw.cwe[0] : raw.cwe);
  return {
    id: randomUUID(),
    title: raw.title ?? raw.ruleId ?? 'Untitled finding',
    description: raw.description ?? raw.message ?? '',
    severity: normalizeSeverity(raw.severity),
    category: raw.category ?? raw.type ?? 'general',
    source,
    file: raw.file ?? raw.path,
    line: raw.line ?? raw.startLine,
    column: raw.column ?? raw.startColumn,
    cwe: cweRaw,
    owasp: raw.owasp ?? raw.owaspCategory,
    confidence: normalizeConfidence(raw.confidence),
    metadata: raw.metadata ?? {},
  };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/** Validation error describing what is wrong with a finding. */
export interface ValidationError {
  /** Field path that failed validation. */
  field: string;
  /** Human-readable error message. */
  message: string;
}

/** Result of validating a {@link NormalizedFinding}. */
export interface ValidationResult {
  /** Whether the finding is valid. */
  valid: boolean;
  /** List of validation errors (empty if valid). */
  errors: ValidationError[];
}

const VALID_SEVERITIES = new Set<string>([
  'critical',
  'high',
  'medium',
  'low',
  'informational',
]);

const CWE_PATTERN = /^CWE-\d+$/;

/**
 * Validates a {@link NormalizedFinding} for completeness and correctness.
 *
 * @param finding - The finding to validate.
 * @returns A {@link ValidationResult}.
 */
export function validateFinding(finding: NormalizedFinding): ValidationResult {
  const errors: ValidationError[] = [];

  if (!finding.id || typeof finding.id !== 'string') {
    errors.push({field: 'id', message: 'id is required and must be a non-empty string'});
  }
  if (!finding.title || typeof finding.title !== 'string') {
    errors.push({field: 'title', message: 'title is required and must be a non-empty string'});
  }
  if (typeof finding.description !== 'string') {
    errors.push({field: 'description', message: 'description must be a string'});
  }
  if (!finding.source || typeof finding.source !== 'string') {
    errors.push({field: 'source', message: 'source is required and must be a non-empty string'});
  }
  if (!finding.category || typeof finding.category !== 'string') {
    errors.push({
      field: 'category',
      message: 'category is required and must be a non-empty string',
    });
  }

  if (!VALID_SEVERITIES.has(finding.severity)) {
    errors.push({
      field: 'severity',
      message: `severity must be one of: ${[...VALID_SEVERITIES].join(', ')}`,
    });
  }

  if (typeof finding.confidence !== 'number' || finding.confidence < 0 || finding.confidence > 1) {
    errors.push({field: 'confidence', message: 'confidence must be a number between 0 and 1'});
  }

  if (finding.cwe != null && !CWE_PATTERN.test(finding.cwe)) {
    errors.push({field: 'cwe', message: 'cwe must match the pattern CWE-<digits>'});
  }

  if (finding.line != null && (!Number.isInteger(finding.line) || finding.line < 1)) {
    errors.push({field: 'line', message: 'line must be a positive integer'});
  }

  if (finding.column != null && (!Number.isInteger(finding.column) || finding.column < 1)) {
    errors.push({field: 'column', message: 'column must be a positive integer'});
  }

  return {valid: errors.length === 0, errors};
}

// ---------------------------------------------------------------------------
// Report builder
// ---------------------------------------------------------------------------

/**
 * Builds a {@link NormalizedFindingsReport} from normalized findings and scan metadata.
 *
 * @param findings - Array of normalized findings.
 * @param metadata - Scan metadata (time, target, etc.).
 * @returns A complete findings report with summary counts.
 */
export function buildFindingsReport(
  findings: NormalizedFinding[],
  metadata: ScanMetadata,
): NormalizedFindingsReport {
  const summary: SeverityCounts = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    informational: 0,
  };

  for (const f of findings) {
    if (f.severity in summary) {
      summary[f.severity]++;
    }
  }

  return {findings, summary, metadata};
}
