/**
 * cargo-audit scanner adapter.
 *
 * Runs `cargo audit --json` to find known vulnerabilities in Rust dependencies.
 * Severity is derived from the CVSS score in advisories.
 */

import type {
  RawFinding,
  ScanResult,
  ScanTarget,
  SecurityScanner,
} from './types.js';
import {isBinaryAvailable, runCommand} from './utils.js';

/** Derive severity from CVSS score. */
function severityFromCvss(
  cvss: number | null | undefined,
): RawFinding['severity'] {
  if (cvss == null) return 'medium';
  if (cvss >= 9) return 'critical';
  if (cvss >= 7) return 'high';
  if (cvss >= 4) return 'medium';
  return 'low';
}

interface CargoAdvisory {
  id: string;
  title: string;
  description?: string;
  cvss?: number | null;
  url?: string;
  date?: string;
}

interface CargoVulnerability {
  advisory: CargoAdvisory;
  package?: {
    name?: string;
    version?: string;
  };
  versions?: {
    patched?: string[];
    unaffected?: string[];
  };
}

interface CargoAuditOutput {
  vulnerabilities?: {
    found: boolean;
    count: number;
    list?: CargoVulnerability[];
  };
}

/** Create a cargo-audit scanner conforming to SecurityScanner. */
export function createCargoAuditScanner(): SecurityScanner {
  return {
    name: 'cargo-audit',
    category: 'sca',

    async isAvailable(): Promise<boolean> {
      return isBinaryAvailable('cargo-audit');
    },

    async scan(target: ScanTarget): Promise<ScanResult> {
      const start = Date.now();

      try {
        const result = await runCommand(
          'cargo-audit',
          ['audit', '--json'],
          {cwd: target.rootDir, timeout: 120_000},
        );

        const parsed: CargoAuditOutput = JSON.parse(result.stdout || '{}');
        const findings: RawFinding[] = (
          parsed.vulnerabilities?.list ?? []
        ).map(vuln => ({
          ruleId: vuln.advisory.id,
          message: vuln.advisory.title,
          severity: severityFromCvss(vuln.advisory.cvss),
          file: 'Cargo.lock',
          metadata: {
            description: vuln.advisory.description,
            packageName: vuln.package?.name,
            packageVersion: vuln.package?.version,
            patchedVersions: vuln.versions?.patched,
            url: vuln.advisory.url,
          },
        }));

        return {
          scanner: 'cargo-audit',
          category: 'sca',
          findings,
          duration: Date.now() - start,
        };
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : String(error);
        return {
          scanner: 'cargo-audit',
          category: 'sca',
          findings: [],
          duration: Date.now() - start,
          error: message,
        };
      }
    },
  };
}
