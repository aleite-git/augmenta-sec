/**
 * CodeQL scanner adapter.
 *
 * Creates a CodeQL database, then analyzes it with SARIF output.
 * Temporary database directory is cleaned up after the scan.
 */

import {join} from 'node:path';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';

import type {
  RawFinding,
  ScanResult,
  ScanTarget,
  SecurityScanner,
} from './types.js';
import {isBinaryAvailable, runCommand} from './utils.js';

/** SARIF level to RawFinding severity mapping. */
function mapSeverity(
  sarifLevel: string,
): RawFinding['severity'] {
  switch (sarifLevel.toLowerCase()) {
    case 'error':
      return 'high';
    case 'warning':
      return 'medium';
    case 'note':
      return 'low';
    default:
      return 'informational';
  }
}

interface SarifLocation {
  physicalLocation?: {
    artifactLocation?: {uri?: string};
    region?: {startLine?: number; startColumn?: number};
  };
}

interface SarifResult {
  ruleId?: string;
  message?: {text?: string};
  level?: string;
  locations?: SarifLocation[];
}

interface SarifRun {
  results?: SarifResult[];
}

interface SarifOutput {
  runs?: SarifRun[];
}

/** Create a CodeQL scanner conforming to SecurityScanner. */
export function createCodeqlScanner(
  language = 'javascript',
): SecurityScanner {
  return {
    name: 'codeql',
    category: 'sast',

    async isAvailable(): Promise<boolean> {
      return isBinaryAvailable('codeql');
    },

    async scan(target: ScanTarget): Promise<ScanResult> {
      const start = Date.now();
      const tempDir = mkdtempSync(join(tmpdir(), 'codeql-'));
      const dbPath = join(tempDir, 'codeql-db');
      const sarifPath = join(tempDir, 'results.sarif');

      try {
        // Step 1: Create the CodeQL database
        await runCommand(
          'codeql',
          [
            'database', 'create', dbPath,
            `--language=${language}`,
            `--source-root=${target.rootDir}`,
          ],
          {cwd: target.rootDir, timeout: 300_000},
        );

        // Step 2: Analyze the database
        const result = await runCommand(
          'codeql',
          [
            'database', 'analyze', dbPath,
            '--format=sarif-latest',
            `--output=${sarifPath}`,
          ],
          {cwd: target.rootDir, timeout: 300_000},
        );

        const parsed: SarifOutput = JSON.parse(result.stdout || '{}');
        const findings: RawFinding[] = [];

        for (const sarifResult of parsed.runs?.[0]?.results ?? []) {
          const location = sarifResult.locations?.[0]?.physicalLocation;
          findings.push({
            ruleId: sarifResult.ruleId ?? 'unknown',
            message: sarifResult.message?.text ?? '',
            severity: mapSeverity(sarifResult.level ?? 'warning'),
            file: location?.artifactLocation?.uri,
            line: location?.region?.startLine,
            column: location?.region?.startColumn,
          });
        }

        return {
          scanner: 'codeql',
          category: 'sast',
          findings,
          duration: Date.now() - start,
        };
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : String(error);
        return {
          scanner: 'codeql',
          category: 'sast',
          findings: [],
          duration: Date.now() - start,
          error: message,
        };
      } finally {
        rmSync(tempDir, {recursive: true, force: true});
      }
    },
  };
}
