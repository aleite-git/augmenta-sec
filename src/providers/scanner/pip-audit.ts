/**
 * pip-audit scanner adapter.
 *
 * Runs `pip-audit --format=json --desc` and maps Python dependency
 * vulnerabilities to RawFinding.
 */

import type {
  RawFinding,
  ScanResult,
  ScanTarget,
  SecurityScanner,
} from './types.js';
import {isBinaryAvailable, runCommand} from './utils.js';

/** Derive severity from aliases or default to medium. */
function deriveSeverity(
  vuln: PipAuditVuln,
): RawFinding['severity'] {
  // Check aliases for GHSA entries with known severity patterns
  for (const alias of vuln.aliases ?? []) {
    if (alias.startsWith('GHSA-')) {
      // GHSA does not embed severity in the ID; default heuristic
      return 'medium';
    }
  }

  // pip-audit may include fix_versions — presence suggests actionable/medium+
  if (vuln.fix_versions && vuln.fix_versions.length > 0) {
    return 'medium';
  }

  return 'medium';
}

interface PipAuditVuln {
  id: string;
  description: string;
  fix_versions?: string[];
  aliases?: string[];
}

interface PipAuditDependency {
  name: string;
  version: string;
  vulns: PipAuditVuln[];
}

interface PipAuditOutput {
  dependencies?: PipAuditDependency[];
}

/** Create a pip-audit scanner conforming to SecurityScanner. */
export function createPipAuditScanner(): SecurityScanner {
  return {
    name: 'pip-audit',
    category: 'sca',

    async isAvailable(): Promise<boolean> {
      return isBinaryAvailable('pip-audit');
    },

    async scan(target: ScanTarget): Promise<ScanResult> {
      const start = Date.now();

      try {
        const result = await runCommand(
          'pip-audit',
          ['--format=json', '--desc'],
          {cwd: target.rootDir, timeout: 120_000},
        );

        const parsed: PipAuditOutput = JSON.parse(result.stdout || '{}');
        const findings: RawFinding[] = [];

        for (const dep of parsed.dependencies ?? []) {
          for (const vuln of dep.vulns ?? []) {
            findings.push({
              ruleId: vuln.id,
              message: vuln.description || vuln.id,
              severity: deriveSeverity(vuln),
              file: 'requirements.txt',
              metadata: {
                packageName: dep.name,
                installedVersion: dep.version,
                fixVersions: vuln.fix_versions,
                aliases: vuln.aliases,
              },
            });
          }
        }

        return {
          scanner: 'pip-audit',
          category: 'sca',
          findings,
          duration: Date.now() - start,
        };
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : String(error);
        return {
          scanner: 'pip-audit',
          category: 'sca',
          findings: [],
          duration: Date.now() - start,
          error: message,
        };
      }
    },
  };
}
