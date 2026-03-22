/**
 * npm/yarn/pnpm audit scanner adapter.
 */

import {existsSync} from 'node:fs';
import {join} from 'node:path';
import type {RawFinding, ScannerAdapter, ScannerAdapterConfig, ScanResult, ScanTarget} from './types.js';
import {isBinaryAvailable, runCommand} from './utils.js';

const DEFAULT_TIMEOUT_MS = 60_000;

function mapSeverity(s: string): RawFinding['severity'] {
  switch (s.toLowerCase()) { case 'critical': return 'critical'; case 'high': return 'high'; case 'moderate': return 'medium'; case 'low': return 'low'; case 'info': return 'informational'; default: return 'informational'; }
}

export type PackageManager = 'npm' | 'yarn' | 'pnpm';

export function detectPackageManager(rootDir: string): PackageManager {
  if (existsSync(join(rootDir, 'pnpm-lock.yaml'))) return 'pnpm';
  if (existsSync(join(rootDir, 'yarn.lock'))) return 'yarn';
  return 'npm';
}

interface NpmAuditVuln { name: string; severity: string; via: Array<string | {title?: string; url?: string; source?: number}>; effects: string[]; range: string; fixAvailable?: boolean | {name: string; version: string; isSemVerMajor: boolean}; }
interface NpmAuditOutput { vulnerabilities?: Record<string, NpmAuditVuln>; advisories?: Record<string, {id: number; module_name: string; severity: string; title: string; url: string; overview?: string}>; }
interface YarnAdvisory { type: 'auditAdvisory' | 'auditSummary'; data: {advisory?: {id: number; module_name: string; severity: string; title: string; url: string; overview?: string; cves?: string[]}}; }

export function parseYarnAuditOutput(stdout: string): RawFinding[] {
  const findings: RawFinding[] = [];
  for (const line of stdout.trim().split('\n').filter(Boolean)) {
    let entry: YarnAdvisory;
    try { entry = JSON.parse(line) as YarnAdvisory; } catch { continue; }
    if (entry.type !== 'auditAdvisory' || !entry.data.advisory) continue;
    const a = entry.data.advisory;
    const cveId = a.cves?.[0];
    findings.push({ruleId: `yarn:${a.id}`, message: a.title, severity: mapSeverity(a.severity), file: 'yarn.lock', metadata: {moduleName: a.module_name, url: a.url, overview: a.overview, ...(cveId ? {cveId} : {})}});
  }
  return findings;
}

export function createNpmAuditScanner(config?: ScannerAdapterConfig): ScannerAdapter {
  const timeout = config?.timeout ?? DEFAULT_TIMEOUT_MS;
  return {
    name: 'npm-audit', category: 'sca', config,
    async isAvailable(): Promise<boolean> { return isBinaryAvailable('npm'); },
    async scan(target: ScanTarget): Promise<ScanResult> {
      const start = Date.now();
      const pm = detectPackageManager(target.rootDir);
      const lockMap: Record<PackageManager, string> = {npm: 'package-lock.json', yarn: 'yarn.lock', pnpm: 'pnpm-lock.yaml'};
      const lockFile = lockMap[pm];
      if (!existsSync(join(target.rootDir, lockFile))) return {scanner: 'npm-audit', category: 'sca', findings: [], duration: Date.now() - start, error: `No ${lockFile} found in target directory`};
      try {
        const args = ['audit', '--json'];
        if (config?.extraArgs) args.push(...config.extraArgs);
        const result = await runCommand(pm, args, {cwd: target.rootDir, timeout});
        let findings: RawFinding[];
        if (pm === 'yarn') { findings = parseYarnAuditOutput(result.stdout); }
        else {
          const parsed: NpmAuditOutput = JSON.parse(result.stdout || '{}');
          if (parsed.vulnerabilities) {
            findings = [];
            for (const [name, vuln] of Object.entries(parsed.vulnerabilities)) {
              const via = vuln.via.filter((v): v is {title?: string; url?: string; source?: number} => typeof v !== 'string').map(v => v.title).filter(Boolean);
              findings.push({ruleId: `npm:${name}`, message: via.length > 0 ? via.join('; ') : `Vulnerability in ${name}`, severity: mapSeverity(vuln.severity), file: 'package-lock.json', metadata: {packageName: name, range: vuln.range, fixAvailable: vuln.fixAvailable, effects: vuln.effects}});
            }
          } else if (parsed.advisories) {
            findings = Object.values(parsed.advisories).map(a => ({ruleId: `npm:${a.id}`, message: a.title, severity: mapSeverity(a.severity), file: 'package-lock.json', metadata: {moduleName: a.module_name, url: a.url, overview: a.overview}}));
          } else { findings = []; }
        }
        return {scanner: 'npm-audit', category: 'sca', findings, duration: Date.now() - start};
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return {scanner: 'npm-audit', category: 'sca', findings: [], duration: Date.now() - start, error: message};
      }
    },
  };
}
