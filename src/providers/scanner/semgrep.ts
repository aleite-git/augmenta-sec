/**
 * Semgrep scanner adapter.
 *
 * Runs `semgrep scan --json --config auto` and maps results to RawFinding.
 * Also supports SARIF output parsing via `parseSarifOutput`.
 */

import type {
  RawFinding,
  ScannerAdapter,
  ScannerAdapterConfig,
  ScanResult,
  ScanTarget,
} from './types.js';
import {isBinaryAvailable, runCommand} from './utils.js';

const DEFAULT_TIMEOUT_MS = 60_000;

function mapSeverity(semgrepSeverity: string): RawFinding['severity'] {
  switch (semgrepSeverity.toUpperCase()) {
    case 'ERROR': return 'high';
    case 'WARNING': return 'medium';
    case 'INFO': return 'low';
    default: return 'informational';
  }
}

function mapSarifLevel(level: string): RawFinding['severity'] {
  switch (level.toLowerCase()) {
    case 'error': return 'high';
    case 'warning': return 'medium';
    case 'note': return 'low';
    case 'none': return 'informational';
    default: return 'informational';
  }
}

interface SemgrepResult {
  check_id: string;
  path: string;
  start: {line: number; col: number};
  end: {line: number; col: number};
  extra: {message: string; severity: string; metadata?: Record<string, unknown>};
}

interface SemgrepOutput {
  results?: SemgrepResult[];
  errors?: unknown[];
}

interface SarifResult {
  ruleId?: string;
  level?: string;
  message?: {text?: string};
  locations?: Array<{physicalLocation?: {artifactLocation?: {uri?: string}; region?: {startLine?: number; startColumn?: number}}}>;
  properties?: Record<string, unknown>;
}

interface SarifOutput {
  runs?: Array<{results?: SarifResult[]}>;
}

/**
 * Parse SARIF format output into normalized RawFinding[].
 * Works with Semgrep SARIF output or any SARIF 2.1.0 compliant data.
 */
export function parseSarifOutput(output: string): RawFinding[] {
  const sarif: SarifOutput = JSON.parse(output);
  const findings: RawFinding[] = [];

  for (const run of sarif.runs ?? []) {
    for (const result of run.results ?? []) {
      const location = result.locations?.[0]?.physicalLocation;
      const ruleId = result.ruleId ?? 'unknown';
      const message = result.message?.text ?? ruleId;
      const level = result.level ?? 'warning';

      findings.push({
        ruleId,
        message,
        severity: mapSarifLevel(level),
        file: location?.artifactLocation?.uri,
        line: location?.region?.startLine,
        column: location?.region?.startColumn,
        metadata: result.properties,
      });
    }
  }

  return findings;
}

/** Create a Semgrep scanner conforming to ScannerAdapter. */
export function createSemgrepScanner(config?: ScannerAdapterConfig): ScannerAdapter {
  const rules = config?.rules ?? ['auto'];
  const timeout = config?.timeout ?? DEFAULT_TIMEOUT_MS;

  return {
    name: 'semgrep',
    category: 'sast',
    config,

    async isAvailable(): Promise<boolean> {
      return isBinaryAvailable('semgrep');
    },

    async scan(target: ScanTarget): Promise<ScanResult> {
      const start = Date.now();

      try {
        const args = ['scan', '--json'];
        for (const rule of rules) {
          args.push('--config', rule);
        }
        if (config?.extraArgs) {
          args.push(...config.extraArgs);
        }
        args.push(target.rootDir);

        const result = await runCommand('semgrep', args, {cwd: target.rootDir, timeout});
        const parsed: SemgrepOutput = JSON.parse(result.stdout || '{}');
        const findings: RawFinding[] = (parsed.results ?? []).map(r => ({
          ruleId: r.check_id,
          message: r.extra.message,
          severity: mapSeverity(r.extra.severity),
          file: r.path,
          line: r.start.line,
          column: r.start.col,
          metadata: r.extra.metadata,
        }));

        return {scanner: 'semgrep', category: 'sast', findings, duration: Date.now() - start};
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return {scanner: 'semgrep', category: 'sast', findings: [], duration: Date.now() - start, error: message};
      }
    },
  };
}
