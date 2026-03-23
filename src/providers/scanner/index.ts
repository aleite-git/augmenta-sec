/**
 * Scanner adapters barrel export.
 */

export {createSemgrepScanner, parseSarifOutput} from './semgrep.js';
export {createTrivyScanner, scanFilesystem, scanContainer} from './trivy.js';
export {createNpmAuditScanner, detectPackageManager, parseYarnAuditOutput} from './npm-audit.js';
export type {PackageManager} from './npm-audit.js';
export {createGitleaksScanner, mapSecretSeverity} from './gitleaks.js';
export {createCodeqlScanner} from './codeql.js';
export {createPipAuditScanner} from './pip-audit.js';
export {createBanditScanner} from './bandit.js';
export {createGosecScanner} from './gosec.js';
export {createCargoAuditScanner} from './cargo-audit.js';
export {createZapScanner} from './zap.js';
export type {ZapScannerConfig} from './zap.js';
export {isBinaryAvailable, runCommand} from './utils.js';
export type {RunCommandResult} from './utils.js';
export {
  createScannerRegistry,
  defaultRegistry,
  createCommandScanner,
  loadPluginScanner,
} from './plugin.js';
export type {ScannerFactory, ScannerRegistry} from './plugin.js';
export type {ScannerCategory, ScanTarget, RawFinding, NormalizedFinding, ScanResult, SecurityScanner, ScannerAdapter, ScannerAdapterConfig, CommandScannerDef, ModuleScannerDef} from './types.js';
