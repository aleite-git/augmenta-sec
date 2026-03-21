/**
 * Trivy scanner adapter.
 *
 * Supports two modes:
 * - `fs` (default): `trivy fs --format json <rootDir>` — dependency scanning (SCA)
 * - `image`: `trivy image --format json <target.image>` — container scanning
 */

import type {
  RawFinding,
  ScanResult,
  ScanTarget,
  ScannerCategory,
  SecurityScanner,
} from './types.js';
import {isBinaryAvailable, runCommand} from './utils.js';

/** Trivy severity to RawFinding severity mapping. */
function mapSeverity(
  trivySeverity: string,
): RawFinding['severity'] {
  switch (trivySeverity.toUpperCase()) {
    case 'CRITICAL':
      return 'critical';
    case 'HIGH':
      return 'high';
    case 'MEDIUM':
      return 'medium';
    case 'LOW':
      return 'low';
    case 'UNKNOWN':
    default:
      return 'informational';
  }
}

interface TrivyVulnerability {
  VulnerabilityID: string;
  PkgName: string;
  InstalledVersion: string;
  FixedVersion?: string;
  Title?: string;
  Description?: string;
  Severity: string;
}

interface TrivyResultEntry {
  Target?: string;
  Type?: string;
  Vulnerabilities?: TrivyVulnerability[] | null;
}

interface TrivyOutput {
  Results?: TrivyResultEntry[];
}

/** Create a Trivy scanner conforming to SecurityScanner. */
export function createTrivyScanner(
  mode: 'fs' | 'image' = 'fs',
): SecurityScanner {
  const category: ScannerCategory = mode === 'image' ? 'container' : 'sca';

  return {
    name: 'trivy',
    category,

    async isAvailable(): Promise<boolean> {
      return isBinaryAvailable('trivy');
    },

    async scan(target: ScanTarget): Promise<ScanResult> {
      const start = Date.now();

      try {
        const args =
          mode === 'image'
            ? ['image', '--format', 'json', target.image ?? '']
            : ['fs', '--format', 'json', target.rootDir];

        const result = await runCommand('trivy', args, {
          cwd: target.rootDir,
          timeout: 120_000,
        });

        const parsed: TrivyOutput = JSON.parse(result.stdout || '{}');
        const findings: RawFinding[] = [];

        for (const entry of parsed.Results ?? []) {
          for (const vuln of entry.Vulnerabilities ?? []) {
            const message = [vuln.Title, vuln.Description]
              .filter(Boolean)
              .join(' — ');

            findings.push({
              ruleId: vuln.VulnerabilityID,
              message: message || vuln.VulnerabilityID,
              severity: mapSeverity(vuln.Severity),
              file: entry.Target,
              metadata: {
                pkgName: vuln.PkgName,
                installedVersion: vuln.InstalledVersion,
                fixedVersion: vuln.FixedVersion,
                target: entry.Target,
                type: entry.Type,
              },
            });
          }
        }

        return {
          scanner: 'trivy',
          category,
          findings,
          duration: Date.now() - start,
        };
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : String(error);
        return {
          scanner: 'trivy',
          category,
          findings: [],
          duration: Date.now() - start,
          error: message,
        };
      }
    },
  };
}
