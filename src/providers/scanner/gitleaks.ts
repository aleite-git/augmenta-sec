/**
 * Gitleaks scanner adapter with secret-type severity mapping.
 */

import type {RawFinding, ScannerAdapter, ScannerAdapterConfig, ScanResult, ScanTarget} from './types.js';
import {isBinaryAvailable, runCommand} from './utils.js';

const DEFAULT_TIMEOUT_MS = 60_000;

interface GitleaksFinding { RuleID: string; Description: string; File: string; StartLine: number; EndLine: number; StartColumn?: number; EndColumn?: number; Match?: string; Secret?: string; Entropy?: number; Fingerprint?: string; }

const CRITICAL_SECRET_PATTERNS: ReadonlySet<string> = new Set(['aws-access-key', 'aws-secret-access-key', 'gcp-service-account', 'gcp-api-key', 'azure-storage-key', 'private-key', 'github-pat', 'gitlab-pat']);
const HIGH_SECRET_PATTERNS: ReadonlySet<string> = new Set(['generic-api-key', 'slack-token', 'stripe-api-key', 'twilio-api-key', 'sendgrid-api-key', 'mailgun-api-key', 'database-url', 'jwt-secret', 'password-in-url']);

export function mapSecretSeverity(ruleId: string): RawFinding['severity'] {
  const id = ruleId.toLowerCase();
  if (CRITICAL_SECRET_PATTERNS.has(id)) return 'critical';
  for (const p of CRITICAL_SECRET_PATTERNS) { if (id.includes(p)) return 'critical'; }
  if (HIGH_SECRET_PATTERNS.has(id)) return 'high';
  for (const p of HIGH_SECRET_PATTERNS) { if (id.includes(p)) return 'high'; }
  return 'medium';
}

export function createGitleaksScanner(config?: ScannerAdapterConfig): ScannerAdapter {
  const timeout = config?.timeout ?? DEFAULT_TIMEOUT_MS;
  return {
    name: 'gitleaks', category: 'secrets', config,
    async isAvailable(): Promise<boolean> { return isBinaryAvailable('gitleaks'); },
    async scan(target: ScanTarget): Promise<ScanResult> {
      const start = Date.now();
      try {
        const args = ['detect', '--source', target.rootDir, '--report-format', 'json', '--report-path', '/dev/stdout', '--no-git'];
        if (config?.extraArgs) args.push(...config.extraArgs);
        const result = await runCommand('gitleaks', args, {cwd: target.rootDir, timeout});
        let parsed: GitleaksFinding[] = [];
        const stdout = result.stdout.trim();
        if (stdout) parsed = JSON.parse(stdout) as GitleaksFinding[];
        const findings: RawFinding[] = parsed.map(f => ({ruleId: f.RuleID, message: f.Description, severity: mapSecretSeverity(f.RuleID), file: f.File, line: f.StartLine, column: f.StartColumn, metadata: {fingerprint: f.Fingerprint, entropy: f.Entropy}}));
        return {scanner: 'gitleaks', category: 'secrets', findings, duration: Date.now() - start};
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return {scanner: 'gitleaks', category: 'secrets', findings: [], duration: Date.now() - start, error: message};
      }
    },
  };
}
