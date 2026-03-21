/**
 * Semgrep scanner adapter.
 *
 * Runs `semgrep scan --json --config auto` and maps results to RawFinding.
 */

import type {
  RawFinding,
  ScanResult,
  ScanTarget,
  SecurityScanner,
} from './types.js';
import {isBinaryAvailable, runCommand} from './utils.js';

/** Semgrep severity to RawFinding severity mapping. */
function mapSeverity(
  semgrepSeverity: string,
): RawFinding['severity'] {
  switch (semgrepSeverity.toUpperCase()) {
    case 'ERROR':
      return 'high';
    case 'WARNING':
      return 'medium';
    case 'INFO':
      return 'low';
    default:
      return 'informational';
  }
}

interface SemgrepResult {
  check_id: string;
  path: string;
  start: {line: number; col: number};
  end: {line: number; col: number};
  extra: {
    message: string;
    severity: string;
    metadata?: Record<string, unknown>;
  };
}

interface SemgrepOutput {
  results?: SemgrepResult[];
  errors?: unknown[];
}

/** Create a Semgrep scanner conforming to SecurityScanner. */
export function createSemgrepScanner(): SecurityScanner {
  return {
    name: 'semgrep',
    category: 'sast',

    async isAvailable(): Promise<boolean> {
      return isBinaryAvailable('semgrep');
    },

    async scan(target: ScanTarget): Promise<ScanResult> {
      const start = Date.now();

      try {
        const result = await runCommand(
          'semgrep',
          ['scan', '--json', '--config', 'auto', target.rootDir],
          {cwd: target.rootDir, timeout: 60_000},
        );

        const parsed: SemgrepOutput = JSON.parse(result.stdout || '{}');
        const findings: RawFinding[] = (parsed.results ?? []).map(r => ({
          ruleId: r.check_id,
          message: r.extra.message,
          severity: mapSeverity(r.extra.severity),
          file: r.path,
          line: r.start.line,
          column: r.start.col,
          metadata: r.extra.metadata,
        }));

        return {
          scanner: 'semgrep',
          category: 'sast',
          findings,
          duration: Date.now() - start,
        };
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : String(error);
        return {
          scanner: 'semgrep',
          category: 'sast',
          findings: [],
          duration: Date.now() - start,
          error: message,
        };
      }
    },
  };
}
