/**
 * Trivy scanner adapter.
 *
 * Supports filesystem and container image scanning.
 * Convenience helpers `scanFilesystem` and `scanContainer` are also exported.
 */

import type {
  RawFinding,
  ScannerAdapter,
  ScannerAdapterConfig,
  ScannerCategory,
  ScanResult,
  ScanTarget,
} from './types.js';
import {isBinaryAvailable, runCommand} from './utils.js';

const DEFAULT_TIMEOUT_MS = 120_000;

function mapSeverity(trivySeverity: string): RawFinding['severity'] {
  switch (trivySeverity.toUpperCase()) {
    case 'CRITICAL': return 'critical';
    case 'HIGH': return 'high';
    case 'MEDIUM': return 'medium';
    case 'LOW': return 'low';
    case 'UNKNOWN': default: return 'informational';
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

function parseTrivyOutput(stdout: string): RawFinding[] {
  const parsed: TrivyOutput = JSON.parse(stdout || '{}');
  const findings: RawFinding[] = [];

  for (const entry of parsed.Results ?? []) {
    for (const vuln of entry.Vulnerabilities ?? []) {
      const message = [vuln.Title, vuln.Description].filter(Boolean).join(' \u2014 ');
      findings.push({
        ruleId: vuln.VulnerabilityID,
        message: message || vuln.VulnerabilityID,
        severity: mapSeverity(vuln.Severity),
        file: entry.Target,
        metadata: {pkgName: vuln.PkgName, installedVersion: vuln.InstalledVersion, fixedVersion: vuln.FixedVersion, target: entry.Target, type: entry.Type},
      });
    }
  }

  return findings;
}

/** Create a Trivy scanner conforming to ScannerAdapter. */
export function createTrivyScanner(mode: 'fs' | 'image' = 'fs', config?: ScannerAdapterConfig): ScannerAdapter {
  const category: ScannerCategory = mode === 'image' ? 'container' : 'sca';
  const timeout = config?.timeout ?? DEFAULT_TIMEOUT_MS;

  return {
    name: 'trivy',
    category,
    config,

    async isAvailable(): Promise<boolean> {
      return isBinaryAvailable('trivy');
    },

    async scan(target: ScanTarget): Promise<ScanResult> {
      const start = Date.now();

      try {
        const args = mode === 'image'
          ? ['image', '--format', 'json', target.image ?? '']
          : ['fs', '--format', 'json', target.rootDir];
        if (config?.extraArgs) args.push(...config.extraArgs);

        const result = await runCommand('trivy', args, {cwd: target.rootDir, timeout});
        const findings = parseTrivyOutput(result.stdout);

        return {scanner: 'trivy', category, findings, duration: Date.now() - start};
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return {scanner: 'trivy', category, findings: [], duration: Date.now() - start, error: message};
      }
    },
  };
}

/** Convenience: scan a filesystem path for dependency vulnerabilities. */
export async function scanFilesystem(target: ScanTarget, config?: ScannerAdapterConfig): Promise<ScanResult> {
  return createTrivyScanner('fs', config).scan(target);
}

/** Convenience: scan a container image for vulnerabilities. */
export async function scanContainer(image: string, config?: ScannerAdapterConfig): Promise<ScanResult> {
  return createTrivyScanner('image', config).scan({rootDir: '.', image});
}
