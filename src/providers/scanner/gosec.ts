/**
 * Gosec scanner adapter.
 *
 * Runs `gosec -fmt=json ./...` to find security issues in Go code.
 * Gosec exits with code 1 when issues are found — this is not an error.
 */

import type {
  RawFinding,
  ScanResult,
  ScanTarget,
  SecurityScanner,
} from './types.js';
import {isBinaryAvailable, runCommand} from './utils.js';

/** Gosec severity to RawFinding severity mapping. */
function mapSeverity(
  gosecSeverity: string,
): RawFinding['severity'] {
  switch (gosecSeverity.toUpperCase()) {
    case 'HIGH':
      return 'high';
    case 'MEDIUM':
      return 'medium';
    case 'LOW':
      return 'low';
    default:
      return 'informational';
  }
}

interface GosecIssue {
  rule_id: string;
  details: string;
  severity: string;
  confidence: string;
  file: string;
  line: string;
  column: string;
  cwe?: {id?: string; url?: string};
  nosec?: boolean;
}

interface GosecOutput {
  Issues?: GosecIssue[];
  Stats?: {found?: number; files?: number};
}

/** Create a Gosec scanner conforming to SecurityScanner. */
export function createGosecScanner(): SecurityScanner {
  return {
    name: 'gosec',
    category: 'sast',

    async isAvailable(): Promise<boolean> {
      return isBinaryAvailable('gosec');
    },

    async scan(target: ScanTarget): Promise<ScanResult> {
      const start = Date.now();

      try {
        // Gosec exits 1 when issues are found — not an error.
        const result = await runCommand(
          'gosec',
          ['-fmt=json', './...'],
          {cwd: target.rootDir, timeout: 120_000},
        );

        const parsed: GosecOutput = JSON.parse(result.stdout || '{}');
        const findings: RawFinding[] = (parsed.Issues ?? []).map(issue => ({
          ruleId: issue.rule_id,
          message: issue.details,
          severity: mapSeverity(issue.severity),
          file: issue.file,
          line: parseInt(issue.line, 10) || undefined,
          column: parseInt(issue.column, 10) || undefined,
          metadata: {
            confidence: issue.confidence,
            cwe: issue.cwe,
            nosec: issue.nosec,
          },
        }));

        return {
          scanner: 'gosec',
          category: 'sast',
          findings,
          duration: Date.now() - start,
        };
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : String(error);
        return {
          scanner: 'gosec',
          category: 'sast',
          findings: [],
          duration: Date.now() - start,
          error: message,
        };
      }
    },
  };
}
