/**
 * Gitleaks scanner adapter.
 *
 * Runs `gitleaks detect` with JSON output to find hardcoded secrets.
 * Gitleaks exits with code 1 when leaks are found — this is not an error.
 * All gitleaks findings are mapped to high severity (secrets are always serious).
 */

import type {
  RawFinding,
  ScanResult,
  ScanTarget,
  SecurityScanner,
} from './types.js';
import {isBinaryAvailable, runCommand} from './utils.js';

interface GitleaksFinding {
  RuleID: string;
  Description: string;
  File: string;
  StartLine: number;
  EndLine: number;
  StartColumn?: number;
  EndColumn?: number;
  Match?: string;
  Secret?: string;
  Entropy?: number;
  Fingerprint?: string;
}

/** Create a Gitleaks scanner conforming to SecurityScanner. */
export function createGitleaksScanner(): SecurityScanner {
  return {
    name: 'gitleaks',
    category: 'secrets',

    async isAvailable(): Promise<boolean> {
      return isBinaryAvailable('gitleaks');
    },

    async scan(target: ScanTarget): Promise<ScanResult> {
      const start = Date.now();

      try {
        // gitleaks exits 1 when leaks are found — not an error.
        const result = await runCommand(
          'gitleaks',
          [
            'detect',
            '--source', target.rootDir,
            '--report-format', 'json',
            '--report-path', '/dev/stdout',
            '--no-git',
          ],
          {cwd: target.rootDir, timeout: 60_000},
        );

        // Exit code 0 = no leaks; exit code 1 = leaks found.
        // Both are valid; parse stdout either way.
        let parsed: GitleaksFinding[] = [];
        const stdout = result.stdout.trim();
        if (stdout) {
          parsed = JSON.parse(stdout) as GitleaksFinding[];
        }

        const findings: RawFinding[] = parsed.map(f => ({
          ruleId: f.RuleID,
          message: f.Description,
          severity: 'high' as const,
          file: f.File,
          line: f.StartLine,
          column: f.StartColumn,
          metadata: {
            fingerprint: f.Fingerprint,
            entropy: f.Entropy,
          },
        }));

        return {
          scanner: 'gitleaks',
          category: 'secrets',
          findings,
          duration: Date.now() - start,
        };
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : String(error);
        return {
          scanner: 'gitleaks',
          category: 'secrets',
          findings: [],
          duration: Date.now() - start,
          error: message,
        };
      }
    },
  };
}
