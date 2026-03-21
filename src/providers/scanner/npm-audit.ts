/**
 * npm audit scanner adapter.
 *
 * Runs `npm audit --json` and parses vulnerability output.
 * npm audit exits with code 1 when vulnerabilities are found — this is not an error.
 */

import {existsSync} from 'node:fs';
import {join} from 'node:path';

import type {
  RawFinding,
  ScanResult,
  ScanTarget,
  SecurityScanner,
} from './types.js';
import {isBinaryAvailable, runCommand} from './utils.js';

/** npm severity to RawFinding severity mapping. */
function mapSeverity(
  npmSeverity: string,
): RawFinding['severity'] {
  switch (npmSeverity.toLowerCase()) {
    case 'critical':
      return 'critical';
    case 'high':
      return 'high';
    case 'moderate':
      return 'medium';
    case 'low':
      return 'low';
    case 'info':
      return 'informational';
    default:
      return 'informational';
  }
}

/**
 * npm audit v2 JSON format (npm 7+).
 * Uses the `vulnerabilities` object keyed by package name.
 */
interface NpmAuditVulnerability {
  name: string;
  severity: string;
  via: Array<string | {title?: string; url?: string; source?: number}>;
  effects: string[];
  range: string;
  fixAvailable?: boolean | {name: string; version: string; isSemVerMajor: boolean};
}

interface NpmAuditOutput {
  vulnerabilities?: Record<string, NpmAuditVulnerability>;
  /** Legacy npm audit v1 format. */
  advisories?: Record<
    string,
    {
      id: number;
      module_name: string;
      severity: string;
      title: string;
      url: string;
      overview?: string;
      findings?: Array<{version: string; paths: string[]}>;
    }
  >;
}

/** Create an npm audit scanner conforming to SecurityScanner. */
export function createNpmAuditScanner(): SecurityScanner {
  return {
    name: 'npm-audit',
    category: 'sca',

    async isAvailable(): Promise<boolean> {
      return isBinaryAvailable('npm');
    },

    async scan(target: ScanTarget): Promise<ScanResult> {
      const start = Date.now();

      // Require package-lock.json for npm audit to work
      const lockPath = join(target.rootDir, 'package-lock.json');
      if (!existsSync(lockPath)) {
        return {
          scanner: 'npm-audit',
          category: 'sca',
          findings: [],
          duration: Date.now() - start,
          error: 'No package-lock.json found in target directory',
        };
      }

      try {
        // npm audit exits 1 when vulnerabilities are found — not an error.
        const result = await runCommand(
          'npm',
          ['audit', '--json'],
          {cwd: target.rootDir, timeout: 60_000},
        );

        const parsed: NpmAuditOutput = JSON.parse(result.stdout || '{}');
        const findings: RawFinding[] = [];

        // npm v2 format (npm 7+): vulnerabilities object
        if (parsed.vulnerabilities) {
          for (const [name, vuln] of Object.entries(parsed.vulnerabilities)) {
            const viaDetails = vuln.via
              .filter(
                (v): v is {title?: string; url?: string; source?: number} =>
                  typeof v !== 'string',
              )
              .map(v => v.title)
              .filter(Boolean);

            const message =
              viaDetails.length > 0
                ? viaDetails.join('; ')
                : `Vulnerability in ${name}`;

            findings.push({
              ruleId: `npm:${name}`,
              message,
              severity: mapSeverity(vuln.severity),
              file: 'package-lock.json',
              metadata: {
                packageName: name,
                range: vuln.range,
                fixAvailable: vuln.fixAvailable,
                effects: vuln.effects,
              },
            });
          }
        }

        // Legacy npm v1 format: advisories object
        if (parsed.advisories && findings.length === 0) {
          for (const advisory of Object.values(parsed.advisories)) {
            findings.push({
              ruleId: `npm:${advisory.id}`,
              message: advisory.title,
              severity: mapSeverity(advisory.severity),
              file: 'package-lock.json',
              metadata: {
                moduleName: advisory.module_name,
                url: advisory.url,
                overview: advisory.overview,
              },
            });
          }
        }

        return {
          scanner: 'npm-audit',
          category: 'sca',
          findings,
          duration: Date.now() - start,
        };
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : String(error);
        return {
          scanner: 'npm-audit',
          category: 'sca',
          findings: [],
          duration: Date.now() - start,
          error: message,
        };
      }
    },
  };
}
