/**
 * Bandit scanner adapter.
 *
 * Runs `bandit -r <rootDir> -f json` to find security issues in Python code.
 * Bandit exits with code 1 when issues are found — this is not an error.
 */

import type {
  RawFinding,
  ScanResult,
  ScanTarget,
  SecurityScanner,
} from './types.js';
import {isBinaryAvailable, runCommand} from './utils.js';

/** Bandit severity to RawFinding severity mapping. */
function mapSeverity(
  banditSeverity: string,
): RawFinding['severity'] {
  switch (banditSeverity.toUpperCase()) {
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

interface BanditResult {
  test_id: string;
  test_name?: string;
  issue_text: string;
  issue_severity: string;
  issue_confidence: string;
  filename: string;
  line_number: number;
  col_offset?: number;
  line_range?: number[];
  more_info?: string;
}

interface BanditOutput {
  results?: BanditResult[];
  errors?: unknown[];
}

/** Create a Bandit scanner conforming to SecurityScanner. */
export function createBanditScanner(): SecurityScanner {
  return {
    name: 'bandit',
    category: 'sast',

    async isAvailable(): Promise<boolean> {
      return isBinaryAvailable('bandit');
    },

    async scan(target: ScanTarget): Promise<ScanResult> {
      const start = Date.now();

      try {
        // Bandit exits 1 when issues are found — not an error.
        const result = await runCommand(
          'bandit',
          ['-r', target.rootDir, '-f', 'json'],
          {cwd: target.rootDir, timeout: 120_000},
        );

        const parsed: BanditOutput = JSON.parse(result.stdout || '{}');
        const findings: RawFinding[] = (parsed.results ?? []).map(r => ({
          ruleId: r.test_id,
          message: r.issue_text,
          severity: mapSeverity(r.issue_severity),
          file: r.filename,
          line: r.line_number,
          column: r.col_offset,
          metadata: {
            testName: r.test_name,
            confidence: r.issue_confidence,
            moreInfo: r.more_info,
          },
        }));

        return {
          scanner: 'bandit',
          category: 'sast',
          findings,
          duration: Date.now() - start,
        };
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : String(error);
        return {
          scanner: 'bandit',
          category: 'sast',
          findings: [],
          duration: Date.now() - start,
          error: message,
        };
      }
    },
  };
}
