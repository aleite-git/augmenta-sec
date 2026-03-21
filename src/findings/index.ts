/**
 * Findings module — canonical schema, factory helpers, and severity scoring.
 *
 * @example
 * ```ts
 * import {createFinding, adjustSeverity, summarizeFindings} from './findings/index.js';
 *
 * const finding = createFinding({
 *   source: 'scanner',
 *   scanner: 'semgrep',
 *   category: 'injection',
 *   severity: 'high',
 *   rawSeverity: 'high',
 *   title: 'SQL injection in query builder',
 *   description: 'User input flows into raw SQL query.',
 *   confidence: 0.9,
 * });
 * ```
 */

export type {
  Severity,
  FindingSource,
  FindingStatus,
  Finding,
  FindingsReport,
  FindingsSummary,
} from './types.js';

export {createFinding, summarizeFindings} from './types.js';

export type {SeverityContext} from './severity.js';

export {
  adjustSeverity,
  severityToNumber,
  numberToSeverity,
  isAtLeast,
} from './severity.js';
