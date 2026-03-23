/**
 * External scanner abstraction — Semgrep, CodeQL, Trivy, npm audit, etc.
 */

export type ScannerCategory = 'sast' | 'dast' | 'sca' | 'container' | 'secrets';

export interface ScanTarget {
  rootDir: string;
  files?: string[];
  image?: string;
  /** Target URL for DAST scanners (e.g., OWASP ZAP). */
  url?: string;
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
 */
export interface ScannerAdapterConfig {
  rules?: string[];
  timeout?: number;
  extraArgs?: string[];
}

/**
 * Extended scanner interface with configuration support.
 */
export interface ScannerAdapter extends SecurityScanner {
  config?: ScannerAdapterConfig;
}

// ---------------------------------------------------------------------------
// Custom scanner plugin definitions (ASEC-108)
// ---------------------------------------------------------------------------

/** Definition for a command-based custom scanner. */
export interface CommandScannerDef {
  name: string;
  command: string;
  args?: string[];
  outputFormat: 'sarif' | 'json';
  category: ScannerCategory;
  timeout?: number;
}

/** Definition for a module-based custom scanner plugin. */
export interface ModuleScannerDef {
  name: string;
  module: string;
}
