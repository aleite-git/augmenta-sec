/**
 * JSON report generator for AugmentaSec (ASEC-156).
 *
 * Serializes a {@link FindingsReport} to a deterministic, pretty-printed
 * JSON string suitable for machine consumption and downstream tooling.
 */

import type {FindingsReport} from '../findings/types.js';

/**
 * Generates a JSON string from a findings report.
 *
 * The output is pretty-printed with 2-space indentation and includes
 * all fields of the report without transformation.
 *
 * @param report - The findings report to serialize.
 * @returns A deterministic JSON string.
 */
export function generateJsonReport(report: FindingsReport): string {
  return JSON.stringify(report, null, 2);
}
