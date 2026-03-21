/**
 * JSON report generator for AugmentaSec findings.
 */

import type {FindingsReport} from '../findings/types.js';

/** Generates a formatted JSON string from a findings report. */
export function generateJsonReport(report: FindingsReport): string {
  return JSON.stringify(report, null, 2);
}
