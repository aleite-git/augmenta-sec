/**
 * Trivy scanner adapter with scanFilesystem/scanContainer helpers.
 */

import type {RawFinding, ScannerAdapter, ScannerAdapterConfig, ScannerCategory, ScanResult, ScanTarget} from './types.js';
import {isBinaryAvailable, runCommand} from './utils.js';

const DEFAULT_TIMEOUT_MS = 120_000;

function mapSeverity(s: string): RawFinding['severity'] {
  switch (s.toUpperCase()) { case 'CRITICAL': return 'critical'; case 'HIGH': return 'high'; case 'MEDIUM': return 'medium'; case 'LOW': return 'low'; default: return 'informational'; }
}

interface TrivyVuln { VulnerabilityID: string; PkgName: string; InstalledVersion: string; FixedVersion?: string; Title?: string; Description?: string; Severity: string; }
interface TrivyEntry { Target?: string; Type?: string; Vulnerabilities?: TrivyVuln[] | null; }
interface TrivyOutput { Results?: TrivyEntry[]; }

function parseTrivyOutput(stdout: string): RawFinding[] {
  const parsed: TrivyOutput = JSON.parse(stdout || '{}');
  const findings: RawFinding[] = [];
  for (const entry of parsed.Results ?? []) {
    for (const v of entry.Vulnerabilities ?? []) {
      const msg = [v.Title, v.Description].filter(Boolean).join(' \u2014 ');
      findings.push({ruleId: v.VulnerabilityID, message: msg || v.VulnerabilityID, severity: mapSeverity(v.Severity), file: entry.Target, metadata: {pkgName: v.PkgName, installedVersion: v.InstalledVersion, fixedVersion: v.FixedVersion, target: entry.Target, type: entry.Type}});
    }
  }
  return findings;
}

export function createTrivyScanner(mode: 'fs' | 'image' = 'fs', config?: ScannerAdapterConfig): ScannerAdapter {
  const category: ScannerCategory = mode === 'image' ? 'container' : 'sca';
  const timeout = config?.timeout ?? DEFAULT_TIMEOUT_MS;
  return {
    name: 'trivy', category, config,
    async isAvailable(): Promise<boolean> { return isBinaryAvailable('trivy'); },
    async scan(target: ScanTarget): Promise<ScanResult> {
      const start = Date.now();
      try {
        const args = mode === 'image' ? ['image', '--format', 'json', target.image ?? ''] : ['fs', '--format', 'json', target.rootDir];
        if (config?.extraArgs) args.push(...config.extraArgs);
        const result = await runCommand('trivy', args, {cwd: target.rootDir, timeout});
        return {scanner: 'trivy', category, findings: parseTrivyOutput(result.stdout), duration: Date.now() - start};
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return {scanner: 'trivy', category, findings: [], duration: Date.now() - start, error: message};
      }
    },
  };
}

export async function scanFilesystem(target: ScanTarget, config?: ScannerAdapterConfig): Promise<ScanResult> {
  return createTrivyScanner('fs', config).scan(target);
}

export async function scanContainer(image: string, config?: ScannerAdapterConfig): Promise<ScanResult> {
  return createTrivyScanner('image', config).scan({rootDir: '.', image});
}
