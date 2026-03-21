/**
 * Scan module barrel export.
 */

export {
  runScan,
  loadSecurityProfile,
  resolveEnabledScanners,
  buildSeverityContext,
} from './engine.js';
export type {ScanEngineOptions} from './engine.js';

export {
  detectTrustBoundaries,
  detectStaticBoundaries,
} from './trust-boundaries.js';
export type {
  TrustBoundary,
  TrustBoundaryType,
  TrustBoundaryResult,
} from './trust-boundaries.js';

export {
  mapPiiFields,
  detectStaticPii,
  matchPiiPatterns,
} from './pii-mapping.js';
export type {PiiClassification} from './pii-mapping.js';

export {
  generateThreatModel,
  generateStaticThreats,
  inferStrideCategories,
  computeRiskLevel,
  buildRiskMatrix,
} from './threat-model.js';
export type {
  StrideCategory,
  Threat,
  Mitigation,
  RiskEntry,
  ThreatModel,
} from './threat-model.js';

export {detectDrift} from './drift.js';
export type {
  DriftChange,
  DriftReport,
  DriftKind,
  DriftImpact,
} from './drift.js';
