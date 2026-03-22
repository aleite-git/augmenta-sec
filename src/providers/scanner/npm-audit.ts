/**
 * npm/yarn/pnpm audit scanner adapter.
 *
 * Detects the active package manager by checking for lock files, then runs
 * the appropriate audit command.
 */

import {existsSync} from 'node:fs';
import {join} from 'node:path';

import type {
  RawFinding,
  ScannerAdapter,
  ScannerAdapterConfig,
  ScanResult,
  ScanTarget,
} from './types.js';
import {isBinaryAvailable, runCommand} from './utils.js';

const DEFAULT_TIMEOUT_MS = 60_000;

function mapSeverity(npmSeverity: string): RawFinding['severity'] {
  switch (npmSeverity.toLowerCase()) {
    case 'critical': return 'critical';
    case 'high': return 'high';
    case 'moderate': return 'medium';
    case 'low': return 'low';
    case 'info': return 'informational';
    default: return 'informational';
  }
}

/** Supported package managers. */
export type PackageManager = 'npm' | 'yarn' | 'pnpm';

/** Detect which package manager is in use by examining lock files. */
export function detectPackageManager(rootDir: string): PackageManager {
  if (existsSync(join(rootDir, 'pnpm-lock.yaml'))) return 'pnpm';
  if (existsSync(join(rootDir, 'yarn.lock'))) return 'yarn';
  return 'npm';
}

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
  advisories?: Record<string, {id: number; module_name: string; severity: string; title: string; url: string; overview?: string}>;
}

interface YarnAuditAdvisory {
  type: 'auditAdvisory' | 'auditSummary';
  data: {advisory?: {id: number; module_name: string; severity: string; title: string; url: string; overview?: string; cves?: string[]}};
}

/** Parse yarn audit NDJSON output into RawFinding[]. */
export function parseYarnAuditOutput(stdout: string): RawFinding[] {
  const findings: RawFinding[] = [];
  const lines = stdout.trim().split('\n').filter(Boolean);

  for (const line of lines) {
    let entry: YarnAuditAdvisory;
    try { entry = JSON.parse(line) as YarnAuditAdvisory; } catch { continue; }
    if (entry.type !== 'auditAdvisory' || !entry.data.advisory) continue;

    const advisory = entry.data.advisory;
    const cveId = advisory.cves?.[0];

    findings.push({
      ruleId: `yarn:${advisory.id}`,
      message: advisory.title,
      severity: mapSeverity(advisory.severity),
      file: 'yarn.lock',
      metadata: {moduleName: advisory.module_name, url: advisory.url, overview: advisory.overview, ...(cveId ? {cveId} : {})},
    });
  }

  return findings;
}

/** Create an npm/yarn/pnpm audit scanner conforming to ScannerAdapter. */
export function createNpmAuditScanner(config?: ScannerAdapterConfig): ScannerAdapter {
  const timeout = config?.timeout ?? DEFAULT_TIMEOUT_MS;

  return {
    name: 'npm-audit',
    category: 'sca',
    config,

    async isAvailable(): Promise<boolean> {
      return isBinaryAvailable('npm');
    },

    async scan(target: ScanTarget): Promise<ScanResult> {
      const start = Date.now();
      const pm = detectPackageManager(target.rootDir);

      const lockFileMap: Record<PackageManager, string> = {npm: 'package-lock.json', yarn: 'yarn.lock', pnpm: 'pnpm-lock.yaml'};
      const lockFile = lockFileMap[pm];
      const lockPath = join(target.rootDir, lockFile);

      if (!existsSync(lockPath)) {
        return {scanner: 'npm-audit', category: 'sca', findings: [], duration: Date.now() - start, error: `No ${lockFile} found in target directory`};
      }

      try {
        const args = ['audit', '--json'];
        if (config?.extraArgs) args.push(...config.extraArgs);

        const result = await runCommand(pm, args, {cwd: target.rootDir, timeout});
        let findings: RawFinding[];

        if (pm === 'yarn') {
          findings = parseYarnAuditOutput(result.stdout);
        } else {
          const parsed: NpmAuditOutput = JSON.parse(result.stdout || '{}');

          if (parsed.vulnerabilities) {
            findings = [];
            for (const [name, vuln] of Object.entries(parsed.vulnerabilities)) {
              const viaDetails = vuln.via
                .filter((v): v is {title?: string; url?: string; source?: number} => typeof v !== 'string')
                .map(v => v.title)
                .filter(Boolean);

              findings.push({
                ruleId: `npm:${name}`,
                message: viaDetails.length > 0 ? viaDetails.join('; ') : `Vulnerability in ${name}`,
                severity: mapSeverity(vuln.severity),
                file: 'package-lock.json',
                metadata: {packageName: name, range: vuln.range, fixAvailable: vuln.fixAvailable, effects: vuln.effects},
              });
            }
          } else if (parsed.advisories) {
            findings = Object.values(parsed.advisories).map(a => ({
              ruleId: `npm:${a.id}`,
              message: a.title,
              severity: mapSeverity(a.severity),
              file: 'package-lock.json',
              metadata: {moduleName: a.module_name, url: a.url, overview: a.overview},
            }));
          } else {
            findings = [];
          }
        }

        return {scanner: 'npm-audit', category: 'sca', findings, duration: Date.now() - start};
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return {scanner: 'npm-audit', category: 'sca', findings: [], duration: Date.now() - start, error: message};
      }
    },
  };
}
