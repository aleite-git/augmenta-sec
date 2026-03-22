/**
 * Drift detection for AugmentaSec (ASEC-015).
 *
 * Compares a current security profile against a baseline to detect
 * changes, regressions, and improvements in the security posture.
 */

import type {SecurityProfile} from '../discovery/types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DriftKind = 'added' | 'removed' | 'changed';
export type DriftImpact = 'regression' | 'improvement' | 'neutral';

export interface DriftChange {
  path: string;
  kind: DriftKind;
  impact: DriftImpact;
  description: string;
  baselineValue?: string;
  currentValue?: string;
}

export interface DriftReport {
  changes: DriftChange[];
  regressions: DriftChange[];
  improvements: DriftChange[];
  summary: {
    totalChanges: number;
    regressionCount: number;
    improvementCount: number;
    neutralCount: number;
  };
}

// ---------------------------------------------------------------------------
// Comparison helpers
// ---------------------------------------------------------------------------

function arrayDiff<T>(
  baseline: T[],
  current: T[],
  keyFn: (item: T) => string,
): {added: T[]; removed: T[]} {
  const baselineKeys = new Set(baseline.map(keyFn));
  const currentKeys = new Set(current.map(keyFn));
  return {
    added: current.filter(item => !baselineKeys.has(keyFn(item))),
    removed: baseline.filter(item => !currentKeys.has(keyFn(item))),
  };
}

// ---------------------------------------------------------------------------
// Section-specific diffing
// ---------------------------------------------------------------------------

function diffLanguages(baseline: SecurityProfile, current: SecurityProfile): DriftChange[] {
  const changes: DriftChange[] = [];
  if (baseline.languages.primary !== current.languages.primary) {
    changes.push({
      path: 'languages.primary',
      kind: 'changed',
      impact: 'neutral',
      description: `Primary language changed from "${baseline.languages.primary}" to "${current.languages.primary}"`,
      baselineValue: baseline.languages.primary,
      currentValue: current.languages.primary,
    });
  }
  const {added, removed} = arrayDiff(baseline.languages.all, current.languages.all, l => l.name);
  for (const lang of added) {
    changes.push({path: 'languages.all', kind: 'added', impact: 'neutral', description: `New language detected: ${lang.name} (${lang.percentage}%)`, currentValue: lang.name});
  }
  for (const lang of removed) {
    changes.push({path: 'languages.all', kind: 'removed', impact: 'neutral', description: `Language removed: ${lang.name}`, baselineValue: lang.name});
  }
  return changes;
}

function diffAuth(baseline: SecurityProfile, current: SecurityProfile): DriftChange[] {
  const changes: DriftChange[] = [];
  const {added, removed} = arrayDiff(baseline.auth.providers, current.auth.providers, p => p.name);
  for (const p of added) {
    changes.push({path: 'auth.providers', kind: 'added', impact: 'improvement', description: `New auth provider added: ${p.name} (${p.type})`, currentValue: p.name});
  }
  for (const p of removed) {
    changes.push({path: 'auth.providers', kind: 'removed', impact: 'regression', description: `Auth provider removed: ${p.name} (${p.type})`, baselineValue: p.name});
  }
  const {added: ap, removed: rp} = arrayDiff(baseline.auth.patterns, current.auth.patterns, p => `${p.type}:${p.files.sort().join(',')}`);
  for (const p of ap) {
    changes.push({path: 'auth.patterns', kind: 'added', impact: 'improvement', description: `New auth pattern detected: ${p.type}`, currentValue: p.type});
  }
  for (const p of rp) {
    changes.push({path: 'auth.patterns', kind: 'removed', impact: 'regression', description: `Auth pattern removed: ${p.type}`, baselineValue: p.type});
  }
  return changes;
}

function diffApi(baseline: SecurityProfile, current: SecurityProfile): DriftChange[] {
  const changes: DriftChange[] = [];
  if (baseline.api.routeCount !== current.api.routeCount) {
    const diff = current.api.routeCount - baseline.api.routeCount;
    changes.push({
      path: 'api.routeCount',
      kind: 'changed',
      impact: 'neutral',
      description: `API route count changed from ${baseline.api.routeCount} to ${current.api.routeCount} (${diff > 0 ? '+' : ''}${diff})`,
      baselineValue: String(baseline.api.routeCount),
      currentValue: String(current.api.routeCount),
    });
  }
  const {added, removed} = arrayDiff(baseline.api.endpoints, current.api.endpoints, e => `${e.method}:${e.path}`);
  for (const ep of added) {
    changes.push({path: 'api.endpoints', kind: 'added', impact: 'neutral', description: `New API endpoint: ${ep.method} ${ep.path}`, currentValue: `${ep.method} ${ep.path}`});
  }
  for (const ep of removed) {
    changes.push({path: 'api.endpoints', kind: 'removed', impact: 'neutral', description: `API endpoint removed: ${ep.method} ${ep.path}`, baselineValue: `${ep.method} ${ep.path}`});
  }
  return changes;
}

function diffSecurityControls(baseline: SecurityProfile, current: SecurityProfile): DriftChange[] {
  const changes: DriftChange[] = [];
  const {added, removed} = arrayDiff(baseline.securityControls.present, current.securityControls.present, c => c.name);
  for (const c of added) {
    changes.push({path: 'securityControls.present', kind: 'added', impact: 'improvement', description: `Security control added: ${c.name} (${c.type})`, currentValue: c.name});
  }
  for (const c of removed) {
    changes.push({path: 'securityControls.present', kind: 'removed', impact: 'regression', description: `Security control removed: ${c.name} (${c.type})`, baselineValue: c.name});
  }
  return changes;
}

function diffDatabase(baseline: SecurityProfile, current: SecurityProfile): DriftChange[] {
  const changes: DriftChange[] = [];
  const {added, removed} = arrayDiff(baseline.database.databases, current.database.databases, d => d.type);
  for (const db of added) {
    changes.push({path: 'database.databases', kind: 'added', impact: 'neutral', description: `New database detected: ${db.type}${db.orm ? ` (${db.orm})` : ''}`, currentValue: db.type});
  }
  for (const db of removed) {
    changes.push({path: 'database.databases', kind: 'removed', impact: 'neutral', description: `Database removed: ${db.type}`, baselineValue: db.type});
  }
  return changes;
}

function diffDocker(baseline: SecurityProfile, current: SecurityProfile): DriftChange[] {
  const changes: DriftChange[] = [];
  if (!baseline.docker.hasDocker && current.docker.hasDocker) {
    changes.push({path: 'docker.hasDocker', kind: 'added', impact: 'neutral', description: 'Docker support added to the project'});
  }
  if (baseline.docker.hasDocker && !current.docker.hasDocker) {
    changes.push({path: 'docker.hasDocker', kind: 'removed', impact: 'neutral', description: 'Docker support removed from the project'});
  }
  if (baseline.docker.hasDocker && current.docker.hasDocker) {
    if (!baseline.docker.usesNonRoot && current.docker.usesNonRoot) {
      changes.push({path: 'docker.usesNonRoot', kind: 'changed', impact: 'improvement', description: 'Docker now uses non-root user'});
    }
    if (baseline.docker.usesNonRoot && !current.docker.usesNonRoot) {
      changes.push({path: 'docker.usesNonRoot', kind: 'changed', impact: 'regression', description: 'Docker no longer uses non-root user'});
    }
    if (!baseline.docker.hasMultiStage && current.docker.hasMultiStage) {
      changes.push({path: 'docker.hasMultiStage', kind: 'changed', impact: 'improvement', description: 'Docker now uses multi-stage builds'});
    }
    if (baseline.docker.hasMultiStage && !current.docker.hasMultiStage) {
      changes.push({path: 'docker.hasMultiStage', kind: 'changed', impact: 'regression', description: 'Docker no longer uses multi-stage builds'});
    }
    if (!baseline.docker.healthCheck && current.docker.healthCheck) {
      changes.push({path: 'docker.healthCheck', kind: 'changed', impact: 'improvement', description: 'Docker health check added'});
    }
    if (baseline.docker.healthCheck && !current.docker.healthCheck) {
      changes.push({path: 'docker.healthCheck', kind: 'changed', impact: 'regression', description: 'Docker health check removed'});
    }
  }
  return changes;
}

function diffSecrets(baseline: SecurityProfile, current: SecurityProfile): DriftChange[] {
  const changes: DriftChange[] = [];
  const {added} = arrayDiff(baseline.secrets.findings, current.secrets.findings, f => `${f.type}:${f.file}:${f.line ?? 0}`);
  for (const finding of added) {
    changes.push({path: 'secrets.findings', kind: 'added', impact: 'regression', description: `New secret finding: ${finding.type} in ${finding.file} (risk: ${finding.risk})`, currentValue: `${finding.type} in ${finding.file}`});
  }
  if (baseline.secrets.gitignoresEnv && !current.secrets.gitignoresEnv) {
    changes.push({path: 'secrets.gitignoresEnv', kind: 'changed', impact: 'regression', description: '.env files are no longer gitignored'});
  }
  if (!baseline.secrets.gitignoresEnv && current.secrets.gitignoresEnv) {
    changes.push({path: 'secrets.gitignoresEnv', kind: 'changed', impact: 'improvement', description: '.env files are now gitignored'});
  }
  return changes;
}

function diffDocs(baseline: SecurityProfile, current: SecurityProfile): DriftChange[] {
  const changes: DriftChange[] = [];
  if (!baseline.docs.hasSecurityPolicy && current.docs.hasSecurityPolicy) {
    changes.push({path: 'docs.hasSecurityPolicy', kind: 'added', impact: 'improvement', description: 'Security policy (SECURITY.md) added'});
  }
  if (baseline.docs.hasSecurityPolicy && !current.docs.hasSecurityPolicy) {
    changes.push({path: 'docs.hasSecurityPolicy', kind: 'removed', impact: 'regression', description: 'Security policy (SECURITY.md) removed'});
  }
  return changes;
}

function diffCI(baseline: SecurityProfile, current: SecurityProfile): DriftChange[] {
  const changes: DriftChange[] = [];
  const {added, removed} = arrayDiff(baseline.ci.securityChecks, current.ci.securityChecks, c => `${c.name}:${c.type}`);
  for (const c of added) {
    changes.push({path: 'ci.securityChecks', kind: 'added', impact: 'improvement', description: `CI security check added: ${c.name} (${c.type})`, currentValue: c.name});
  }
  for (const c of removed) {
    changes.push({path: 'ci.securityChecks', kind: 'removed', impact: 'regression', description: `CI security check removed: ${c.name} (${c.type})`, baselineValue: c.name});
  }
  return changes;
}

function diffPii(baseline: SecurityProfile, current: SecurityProfile): DriftChange[] {
  const changes: DriftChange[] = [];
  const {added} = arrayDiff(baseline.piiFields.candidates, current.piiFields.candidates, c => `${c.field}:${c.location}`);
  for (const c of added) {
    changes.push({path: 'piiFields.candidates', kind: 'added', impact: 'neutral', description: `New PII field detected: ${c.field} (${c.classification}) at ${c.location}`, currentValue: c.field});
  }
  return changes;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function detectDrift(
  current: SecurityProfile,
  baseline: SecurityProfile,
): DriftReport {
  const allChanges: DriftChange[] = [
    ...diffLanguages(baseline, current),
    ...diffAuth(baseline, current),
    ...diffApi(baseline, current),
    ...diffSecurityControls(baseline, current),
    ...diffDatabase(baseline, current),
    ...diffDocker(baseline, current),
    ...diffSecrets(baseline, current),
    ...diffDocs(baseline, current),
    ...diffCI(baseline, current),
    ...diffPii(baseline, current),
  ];

  const regressions = allChanges.filter(c => c.impact === 'regression');
  const improvements = allChanges.filter(c => c.impact === 'improvement');
  const neutralCount = allChanges.filter(c => c.impact === 'neutral').length;

  return {
    changes: allChanges,
    regressions,
    improvements,
    summary: {
      totalChanges: allChanges.length,
      regressionCount: regressions.length,
      improvementCount: improvements.length,
      neutralCount,
    },
  };
}
