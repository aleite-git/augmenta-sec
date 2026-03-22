/**
 * Threat model generation for AugmentaSec (ASEC-014).
 *
 * Generates a STRIDE-based threat model from the security profile
 * and scan findings using LLM-powered analysis.
 */

import type {SecurityProfile} from '../discovery/types.js';
import type {Finding} from '../findings/types.js';
import type {LLMProvider} from '../providers/llm/types.js';
import {logger} from '../utils/logger.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type StrideCategory =
  | 'spoofing'
  | 'tampering'
  | 'repudiation'
  | 'information-disclosure'
  | 'denial-of-service'
  | 'elevation-of-privilege';

export interface Threat {
  id: string;
  category: StrideCategory;
  title: string;
  description: string;
  affectedComponent: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  likelihood: 'very-likely' | 'likely' | 'possible' | 'unlikely';
  relatedFindings: string[];
}

export interface Mitigation {
  id: string;
  title: string;
  description: string;
  threatIds: string[];
  priority: 'immediate' | 'short-term' | 'long-term';
  effort: 'low' | 'medium' | 'high';
  status: 'proposed' | 'in-progress' | 'implemented';
}

export interface RiskEntry {
  threatId: string;
  severity: string;
  likelihood: string;
  riskLevel: 'critical' | 'high' | 'medium' | 'low';
  mitigationIds: string[];
  residualRisk: 'high' | 'medium' | 'low' | 'negligible';
}

export interface ThreatModel {
  threats: Threat[];
  mitigations: Mitigation[];
  riskMatrix: RiskEntry[];
}

// ---------------------------------------------------------------------------
// STRIDE mapping from findings
// ---------------------------------------------------------------------------

const CATEGORY_TO_STRIDE: Record<string, StrideCategory[]> = {
  auth: ['spoofing', 'elevation-of-privilege'],
  authentication: ['spoofing'],
  authorization: ['elevation-of-privilege'],
  injection: ['tampering', 'information-disclosure'],
  xss: ['tampering', 'spoofing'],
  csrf: ['spoofing', 'tampering'],
  crypto: ['information-disclosure', 'tampering'],
  pii: ['information-disclosure'],
  secrets: ['information-disclosure', 'spoofing'],
  logging: ['repudiation'],
  config: ['information-disclosure', 'denial-of-service'],
  dependencies: ['tampering', 'elevation-of-privilege'],
  containers: ['elevation-of-privilege', 'denial-of-service'],
  sast: ['tampering', 'information-disclosure'],
  sca: ['tampering'],
};

export function inferStrideCategories(finding: Finding): StrideCategory[] {
  const categories = new Set<StrideCategory>();

  const categoryLower = finding.category.toLowerCase();
  for (const [key, strides] of Object.entries(CATEGORY_TO_STRIDE)) {
    if (categoryLower.includes(key)) {
      for (const s of strides) categories.add(s);
    }
  }

  const titleLower = finding.title.toLowerCase();
  if (/sql.?inject|command.?inject|ldap.?inject/i.test(titleLower)) {
    categories.add('tampering');
    categories.add('information-disclosure');
  }
  if (/xss|cross.?site.?script/i.test(titleLower)) {
    categories.add('tampering');
    categories.add('spoofing');
  }
  if (/dos|denial.?of.?service|resource.?exhaust/i.test(titleLower)) {
    categories.add('denial-of-service');
  }
  if (/priv.?escalat|permission|rbac/i.test(titleLower)) {
    categories.add('elevation-of-privilege');
  }
  if (/log.?inject|audit|log.?forg/i.test(titleLower)) {
    categories.add('repudiation');
  }

  return categories.size > 0
    ? [...categories]
    : ['information-disclosure'];
}

// ---------------------------------------------------------------------------
// Static threat generation
// ---------------------------------------------------------------------------

export function generateStaticThreats(
  profile: SecurityProfile,
  findings: Finding[],
): Threat[] {
  const threats: Threat[] = [];
  let counter = 1;

  for (const finding of findings) {
    const strideCategories = inferStrideCategories(finding);
    for (const category of strideCategories) {
      threats.push({
        id: `TM-${String(counter++).padStart(3, '0')}`,
        category,
        title: `${strideName(category)}: ${finding.title}`,
        description: finding.description,
        affectedComponent: finding.file ?? 'unknown',
        severity: finding.severity === 'informational' ? 'low' : finding.severity,
        likelihood: severityToLikelihood(finding.severity),
        relatedFindings: [finding.id],
      });
    }
  }

  const missingControls = profile.securityControls.missing;
  for (const control of missingControls) {
    threats.push({
      id: `TM-${String(counter++).padStart(3, '0')}`,
      category: controlToStride(control.type),
      title: `Missing security control: ${control.name}`,
      description: `Security control "${control.name}" (${control.type}) is not present in the codebase`,
      affectedComponent: 'system-wide',
      severity: 'medium',
      likelihood: 'possible',
      relatedFindings: [],
    });
  }

  if (profile.auth.providers.length === 0 && profile.api.routeCount > 0) {
    threats.push({
      id: `TM-${String(counter++).padStart(3, '0')}`,
      category: 'spoofing',
      title: 'No authentication detected for API endpoints',
      description:
        `${profile.api.routeCount} API routes detected but no authentication ` +
        'provider was found. All endpoints may be publicly accessible.',
      affectedComponent: 'API layer',
      severity: 'critical',
      likelihood: 'very-likely',
      relatedFindings: [],
    });
  }

  return threats;
}

function strideName(category: StrideCategory): string {
  const names: Record<StrideCategory, string> = {
    spoofing: 'Spoofing',
    tampering: 'Tampering',
    repudiation: 'Repudiation',
    'information-disclosure': 'Information Disclosure',
    'denial-of-service': 'Denial of Service',
    'elevation-of-privilege': 'Elevation of Privilege',
  };
  return names[category];
}

function severityToLikelihood(
  severity: string,
): 'very-likely' | 'likely' | 'possible' | 'unlikely' {
  switch (severity) {
    case 'critical': return 'very-likely';
    case 'high': return 'likely';
    case 'medium': return 'possible';
    default: return 'unlikely';
  }
}

function controlToStride(controlType: string): StrideCategory {
  const mapping: Record<string, StrideCategory> = {
    authentication: 'spoofing',
    authorization: 'elevation-of-privilege',
    encryption: 'information-disclosure',
    logging: 'repudiation',
    'input-validation': 'tampering',
    'rate-limiting': 'denial-of-service',
  };
  return mapping[controlType] ?? 'information-disclosure';
}

// ---------------------------------------------------------------------------
// Risk matrix
// ---------------------------------------------------------------------------

const SEVERITY_SCORE: Record<string, number> = {
  critical: 4, high: 3, medium: 2, low: 1,
};

const LIKELIHOOD_SCORE: Record<string, number> = {
  'very-likely': 4, likely: 3, possible: 2, unlikely: 1,
};

export function computeRiskLevel(
  severity: string,
  likelihood: string,
): 'critical' | 'high' | 'medium' | 'low' {
  const score =
    (SEVERITY_SCORE[severity] ?? 2) * (LIKELIHOOD_SCORE[likelihood] ?? 2);
  if (score >= 12) return 'critical';
  if (score >= 8) return 'high';
  if (score >= 4) return 'medium';
  return 'low';
}

export function buildRiskMatrix(
  threats: Threat[],
  mitigations: Mitigation[],
): RiskEntry[] {
  return threats.map(threat => {
    const relatedMitigations = mitigations.filter(m =>
      m.threatIds.includes(threat.id),
    );
    const riskLevel = computeRiskLevel(threat.severity, threat.likelihood);
    const hasImplemented = relatedMitigations.some(
      m => m.status === 'implemented',
    );
    const hasMitigation = relatedMitigations.length > 0;

    let residualRisk: 'high' | 'medium' | 'low' | 'negligible';
    if (hasImplemented) {
      residualRisk = 'negligible';
    } else if (hasMitigation) {
      residualRisk = riskLevel === 'critical' ? 'medium' : 'low';
    } else {
      residualRisk =
        riskLevel === 'critical' || riskLevel === 'high' ? 'high' : 'medium';
    }

    return {
      threatId: threat.id,
      severity: threat.severity,
      likelihood: threat.likelihood,
      riskLevel,
      mitigationIds: relatedMitigations.map(m => m.id),
      residualRisk,
    };
  });
}

// ---------------------------------------------------------------------------
// LLM-enhanced threat model
// ---------------------------------------------------------------------------

const THREAT_MODEL_SCHEMA = `{
  "threats": [],
  "mitigations": []
}`;

function buildThreatModelPrompt(
  profile: SecurityProfile,
  staticThreats: Threat[],
  findings: Finding[],
): string {
  const threatSummary = staticThreats
    .slice(0, 20)
    .map(t => `- [${t.id}] ${t.category}: ${t.title} (${t.severity})`)
    .join('\n');

  const findingSummary = findings
    .slice(0, 20)
    .map(f => `- ${f.severity}: ${f.title} (${f.category})`)
    .join('\n');

  return `Generate a STRIDE threat model.

Project: ${profile.project.name}
Languages: ${profile.languages.primary}
Auth: ${profile.auth.providers.map(p => p.name).join(', ') || 'none'}
API routes: ${profile.api.routeCount}

Existing threats:
${threatSummary || 'None'}

Findings:
${findingSummary || 'None'}

Generate additional threats and mitigations starting from TM-${String(staticThreats.length + 1).padStart(3, '0')}.`;
}

export async function generateThreatModel(
  profile: SecurityProfile,
  findings: Finding[],
  provider: LLMProvider,
): Promise<ThreatModel> {
  const staticThreats = generateStaticThreats(profile, findings);
  const prompt = buildThreatModelPrompt(profile, staticThreats, findings);

  let llmThreats: Threat[] = [];
  let llmMitigations: Mitigation[] = [];

  try {
    const result = await provider.analyzeStructured<{
      threats: Threat[];
      mitigations: Mitigation[];
    }>(
      [
        {
          role: 'system',
          content: 'You are a security threat modeler using STRIDE. Return JSON.',
        },
        {role: 'user', content: prompt},
      ],
      THREAT_MODEL_SCHEMA,
    );

    if (result.threats && Array.isArray(result.threats)) {
      llmThreats = result.threats;
    }
    if (result.mitigations && Array.isArray(result.mitigations)) {
      llmMitigations = result.mitigations.map(m => ({
        ...m,
        status: m.status ?? 'proposed',
      }));
    }
  } catch {
    logger.warn('LLM threat model generation failed — using static analysis only');
  }

  const allThreats = mergeThreats(staticThreats, llmThreats);

  const threatIds = new Set(allThreats.map(t => t.id));
  const validMitigations = llmMitigations.filter(m =>
    m.threatIds.some(id => threatIds.has(id)),
  );

  const riskMatrix = buildRiskMatrix(allThreats, validMitigations);

  return {
    threats: allThreats,
    mitigations: validMitigations,
    riskMatrix,
  };
}

function mergeThreats(
  staticThreats: Threat[],
  llmThreats: Threat[],
): Threat[] {
  const seen = new Set(staticThreats.map(t => t.title.toLowerCase()));
  const merged = [...staticThreats];

  for (const threat of llmThreats) {
    if (!seen.has(threat.title.toLowerCase())) {
      seen.add(threat.title.toLowerCase());
      merged.push(threat);
    }
  }

  return merged;
}
