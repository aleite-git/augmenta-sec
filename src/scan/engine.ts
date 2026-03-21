/**
 * Scan engine for AugmentaSec (ASEC-005).
 *
 * Orchestrates security scanning: loads the security profile, runs enabled
 * scanners in parallel, normalizes + deduplicates findings, applies contextual
 * severity scoring, and returns a consolidated FindingsReport.
 */

import {readFile} from 'node:fs/promises';
import {join} from 'node:path';

import {parse as parseYaml} from 'yaml';

import type {AugmentaSecConfig} from '../config/schema.js';
import type {SecurityProfile} from '../discovery/types.js';
import {
  createFinding,
  deduplicateFindings,
  summarizeFindings,
  adjustSeverity,
  isAtLeast,
} from '../findings/index.js';
import type {
  Finding,
  FindingsReport,
  SeverityContext,
} from '../findings/index.js';
import type {
  ScanResult,
  RawFinding,
  SecurityScanner,
} from '../providers/scanner/types.js';
import {
  createSemgrepScanner,
  createTrivyScanner,
  createNpmAuditScanner,
  createGitleaksScanner,
  createCodeqlScanner,
  createPipAuditScanner,
  createBanditScanner,
  createGosecScanner,
  createCargoAuditScanner,
} from '../providers/scanner/index.js';
import {logger} from '../utils/logger.js';

// ---------------------------------------------------------------------------
// Scanner registry
// ---------------------------------------------------------------------------

/** Maps scanner name to its factory function. */
const SCANNER_FACTORIES: Record<string, () => SecurityScanner> = {
  semgrep: createSemgrepScanner,
  trivy: createTrivyScanner,
  'npm-audit': createNpmAuditScanner,
  gitleaks: createGitleaksScanner,
  codeql: createCodeqlScanner,
  'pip-audit': createPipAuditScanner,
  bandit: createBanditScanner,
  gosec: createGosecScanner,
  'cargo-audit': createCargoAuditScanner,
};

// ---------------------------------------------------------------------------
// Profile loading
// ---------------------------------------------------------------------------

const PROFILE_DIR = '.augmenta-sec';
const PROFILE_FILE = 'profile.yaml';

/**
 * Loads the security profile from `.augmenta-sec/profile.yaml`.
 *
 * @throws If the profile file does not exist or is invalid YAML.
 */
export async function loadSecurityProfile(
  rootDir: string,
): Promise<SecurityProfile> {
  const filePath = join(rootDir, PROFILE_DIR, PROFILE_FILE);
  const raw = await readFile(filePath, 'utf-8');
  const parsed = parseYaml(raw) as SecurityProfile;
  return parsed;
}

// ---------------------------------------------------------------------------
// Severity context builder
// ---------------------------------------------------------------------------

const TEST_PATH_PATTERNS = [
  /[/\\]__tests__[/\\]/,
  /[/\\]test[/\\]/,
  /[/\\]tests[/\\]/,
  /\.test\./,
  /\.spec\./,
];

const THIRD_PARTY_PATTERNS = [
  /[/\\]node_modules[/\\]/,
  /[/\\]vendor[/\\]/,
  /[/\\]third[_-]party[/\\]/,
];

const AUTH_PATH_PATTERNS = [
  /[/\\]auth[/\\]/,
  /[/\\]authentication[/\\]/,
  /[/\\]login[/\\]/,
  /[/\\]session[/\\]/,
  /middleware.*auth/i,
  /guard/i,
];

function matchesAny(file: string, patterns: RegExp[]): boolean {
  return patterns.some(p => p.test(file));
}

/** Builds a {@link SeverityContext} from the security profile and a finding. */
export function buildSeverityContext(
  profile: SecurityProfile,
  finding: {file?: string; category: string},
): SeverityContext {
  const file = finding.file ?? '';
  const apiEndpointFiles = new Set(
    profile.api.endpoints.map(e => e.file),
  );

  return {
    isPublicFacing: profile.api.routeCount > 0,
    handlesPII: profile.piiFields.candidates.length > 0,
    hasAuthSystem: profile.auth.providers.length > 0,
    trustBoundaryCount: profile.trustBoundaries.candidates.length,
    isInAuthCode: matchesAny(file, AUTH_PATH_PATTERNS),
    isInApiRoute: apiEndpointFiles.has(file),
    isInTestCode: matchesAny(file, TEST_PATH_PATTERNS),
    isInThirdParty: matchesAny(file, THIRD_PARTY_PATTERNS),
  };
}

// ---------------------------------------------------------------------------
// Finding normalization
// ---------------------------------------------------------------------------

/** Converts a RawFinding from a scanner into a canonical Finding. */
function normalizeRawFinding(
  raw: RawFinding,
  scanResult: ScanResult,
): Finding {
  return createFinding({
    source: 'scanner',
    scanner: scanResult.scanner,
    category: scanResult.category,
    severity: raw.severity,
    rawSeverity: raw.severity,
    title: raw.ruleId,
    description: raw.message,
    file: raw.file,
    line: raw.line,
    column: raw.column,
    confidence: 0.7,
    cweId: raw.metadata?.cwe as string | undefined,
    cveId: raw.metadata?.cve as string | undefined,
    metadata: raw.metadata,
  });
}

// ---------------------------------------------------------------------------
// Scanner instantiation
// ---------------------------------------------------------------------------

/** Resolves scanner names from config to SecurityScanner instances. */
export async function resolveEnabledScanners(
  scannerNames: string[],
): Promise<SecurityScanner[]> {
  const scanners: SecurityScanner[] = [];

  for (const name of scannerNames) {
    const factory = SCANNER_FACTORIES[name];
    if (!factory) {
      logger.warn(`Unknown scanner: ${name} — skipping`);
      continue;
    }

    const scanner = factory();
    const available = await scanner.isAvailable();
    if (!available) {
      logger.warn(`Scanner ${name} is not available — skipping`);
      continue;
    }

    scanners.push(scanner);
  }

  return scanners;
}

// ---------------------------------------------------------------------------
// Main scan engine
// ---------------------------------------------------------------------------

export interface ScanEngineOptions {
  /** Override scanners to run (bypasses config). */
  scanners?: SecurityScanner[];
  /** Override security profile (bypasses loading from disk). */
  profile?: SecurityProfile;
}

/**
 * Runs a full security scan against the target directory.
 *
 * Steps:
 * 1. Load security profile from `.augmenta-sec/profile.yaml`
 * 2. Resolve and instantiate enabled scanners
 * 3. Run all scanners in parallel
 * 4. Normalize raw findings into canonical Finding objects
 * 5. Deduplicate findings
 * 6. Apply contextual severity scoring
 * 7. Filter by minimum severity
 * 8. Build and return FindingsReport
 */
export async function runScan(
  rootDir: string,
  config: AugmentaSecConfig,
  options?: ScanEngineOptions,
): Promise<FindingsReport> {
  // Step 1: Load security profile
  const profile = options?.profile ?? await loadSecurityProfile(rootDir);

  // Step 2: Resolve scanners
  const scanners =
    options?.scanners ??
    (await resolveEnabledScanners(config.scanners));

  if (scanners.length === 0) {
    logger.warn('No scanners available — returning empty report');
    return buildEmptyReport(rootDir);
  }

  // Step 3: Run all scanners in parallel
  logger.info(`Running ${scanners.length} scanner(s)...`);
  const scanResults = await Promise.allSettled(
    scanners.map(async scanner => {
      const start = performance.now();
      logger.debug(`Starting ${scanner.name}...`);
      const result = await scanner.scan({rootDir});
      logger.debug(
        `${scanner.name} completed in ${Math.round(performance.now() - start)}ms ` +
          `(${result.findings.length} findings)`,
      );
      return result;
    }),
  );

  // Step 4: Normalize raw findings
  const allFindings: Finding[] = [];
  for (const settled of scanResults) {
    if (settled.status === 'rejected') {
      logger.error(`Scanner failed: ${String(settled.reason)}`);
      continue;
    }

    const result = settled.value;
    if (result.error) {
      logger.warn(
        `${result.scanner} reported an error: ${result.error}`,
      );
    }

    for (const raw of result.findings) {
      allFindings.push(normalizeRawFinding(raw, result));
    }
  }

  // Step 5: Deduplicate
  const deduped = deduplicateFindings(allFindings, 'fuzzy');
  if (deduped.stats.suppressedCount > 0) {
    logger.info(
      `Deduplicated: ${deduped.stats.total} → ${deduped.stats.unique} findings ` +
        `(${deduped.stats.suppressedCount} duplicates removed)`,
    );
  }

  // Step 6: Apply contextual severity scoring
  const scored = deduped.unique.map(finding => {
    const ctx = buildSeverityContext(profile, finding);
    const adjusted = adjustSeverity(finding.rawSeverity, ctx);
    return {...finding, severity: adjusted};
  });

  // Step 7: Filter by minimum severity
  const minSeverity = config.scan.min_severity;
  const filtered = scored.filter(f =>
    isAtLeast(f.severity, minSeverity),
  );

  // Step 8: Apply max_findings cap
  const maxFindings = config.scan.max_findings;
  const capped =
    maxFindings > 0 ? filtered.slice(0, maxFindings) : filtered;

  // Step 9: Build report
  return {
    version: '1.0',
    generatedAt: new Date().toISOString(),
    target: rootDir,
    summary: summarizeFindings(capped),
    findings: capped,
  };
}

/** Produces an empty findings report. */
function buildEmptyReport(target: string): FindingsReport {
  return {
    version: '1.0',
    generatedAt: new Date().toISOString(),
    target,
    summary: summarizeFindings([]),
    findings: [],
  };
}
