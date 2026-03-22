/**
 * Semgrep scanner adapter with SARIF parsing.
 */

import type {RawFinding, ScannerAdapter, ScannerAdapterConfig, ScanResult, ScanTarget} from './types.js';
import {isBinaryAvailable, runCommand} from './utils.js';

const DEFAULT_TIMEOUT_MS = 60_000;

function mapSeverity(s: string): RawFinding['severity'] {
  switch (s.toUpperCase()) { case 'ERROR': return 'high'; case 'WARNING': return 'medium'; case 'INFO': return 'low'; default: return 'informational'; }
}

function mapSarifLevel(l: string): RawFinding['severity'] {
  switch (l.toLowerCase()) { case 'error': return 'high'; case 'warning': return 'medium'; case 'note': return 'low'; case 'none': return 'informational'; default: return 'informational'; }
}

interface SemgrepResult { check_id: string; path: string; start: {line: number; col: number}; end: {line: number; col: number}; extra: {message: string; severity: string; metadata?: Record<string, unknown>}; }
interface SemgrepOutput { results?: SemgrepResult[]; errors?: unknown[]; }
interface SarifResult { ruleId?: string; level?: string; message?: {text?: string}; locations?: Array<{physicalLocation?: {artifactLocation?: {uri?: string}; region?: {startLine?: number; startColumn?: number}}}>; properties?: Record<string, unknown>; }
interface SarifOutput { runs?: Array<{results?: SarifResult[]}>; }

export function parseSarifOutput(output: string): RawFinding[] {
  const sarif: SarifOutput = JSON.parse(output);
  const findings: RawFinding[] = [];
  for (const run of sarif.runs ?? []) {
    for (const r of run.results ?? []) {
      const loc = r.locations?.[0]?.physicalLocation;
      const ruleId = r.ruleId ?? 'unknown';
      findings.push({ruleId, message: r.message?.text ?? ruleId, severity: mapSarifLevel(r.level ?? 'warning'), file: loc?.artifactLocation?.uri, line: loc?.region?.startLine, column: loc?.region?.startColumn, metadata: r.properties});
    }
  }
  return findings;
}

export function createSemgrepScanner(config?: ScannerAdapterConfig): ScannerAdapter {
  const rules = config?.rules ?? ['auto'];
  const timeout = config?.timeout ?? DEFAULT_TIMEOUT_MS;
  return {
    name: 'semgrep', category: 'sast', config,
    async isAvailable(): Promise<boolean> { return isBinaryAvailable('semgrep'); },
    async scan(target: ScanTarget): Promise<ScanResult> {
      const start = Date.now();
      try {
        const args = ['scan', '--json'];
        for (const rule of rules) { args.push('--config', rule); }
        if (config?.extraArgs) { args.push(...config.extraArgs); }
        args.push(target.rootDir);
        const result = await runCommand('semgrep', args, {cwd: target.rootDir, timeout});
        const parsed: SemgrepOutput = JSON.parse(result.stdout || '{}');
        const findings: RawFinding[] = (parsed.results ?? []).map(r => ({ruleId: r.check_id, message: r.extra.message, severity: mapSeverity(r.extra.severity), file: r.path, line: r.start.line, column: r.start.col, metadata: r.extra.metadata}));
        return {scanner: 'semgrep', category: 'sast', findings, duration: Date.now() - start};
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return {scanner: 'semgrep', category: 'sast', findings: [], duration: Date.now() - start, error: message};
      }
    },
  };
}
