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
