/**
 * External scanner abstraction — Semgrep, CodeQL, Trivy, npm audit, etc.
 */

export type ScannerCategory = 'sast' | 'dast' | 'sca' | 'container' | 'secrets';

export interface ScanTarget {
  rootDir: string;
  files?: string[];
  image?: string;
}

export interface RawFinding {
  ruleId: string;
  message: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'informational';
  file?: string;
  line?: number;
  column?: number;
  metadata?: Record<string, unknown>;
}

export interface NormalizedFinding {
  source: string;
  category: ScannerCategory;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'informational';
  file?: string;
  line?: number;
  title: string;
  description: string;
  confidence: number;
  cweId?: string;
  cveId?: string;
  suggestedFix?: string;
  /** Why this matters in THIS codebase — added by LLM contextual analysis. */
  contextualNote?: string;
}

export interface ScanResult {
  scanner: string;
  category: ScannerCategory;
  findings: RawFinding[];
  duration: number;
  error?: string;
}

export interface SecurityScanner {
  name: string;
  category: ScannerCategory;

  /** Check whether the scanner binary/service is available. */
  isAvailable(): Promise<boolean>;

  /** Run the scan and return raw findings. */
  scan(target: ScanTarget): Promise<ScanResult>;
}

/**
 * Scanner adapter configuration options.
 * Passed to factory functions to customize scanner behavior.
 */
export interface ScannerAdapterConfig {
  /** Custom rules or rule-sets to use (scanner-specific). */
  rules?: string[];
  /** Override the default scan timeout in milliseconds. */
  timeout?: number;
  /** Additional CLI flags to pass to the scanner binary. */
  extraArgs?: string[];
}

/**
 * Extended scanner interface with configuration support.
 * Wraps SecurityScanner with optional config and helper methods.
 */
export interface ScannerAdapter extends SecurityScanner {
  /** Scanner-specific configuration. */
  config?: ScannerAdapterConfig;
}
