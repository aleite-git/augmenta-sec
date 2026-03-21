/**
 * Trust boundary detection for AugmentaSec (ASEC-012).
 *
 * Uses LLM-enhanced analysis to identify trust boundaries in a codebase
 * based on auth middleware, API gateways, input validation layers,
 * network boundaries, and data flow transitions.
 */

import type {SecurityProfile, TrustBoundaryInfo} from '../discovery/types.js';
import type {LLMProvider} from '../providers/llm/types.js';
import {logger} from '../utils/logger.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Categories of trust boundaries that can be detected. */
export type TrustBoundaryType =
  | 'auth-middleware'
  | 'api-gateway'
  | 'input-validation'
  | 'network-boundary'
  | 'service-boundary'
  | 'data-flow';

/** A detected trust boundary with classification and evidence. */
export interface TrustBoundary {
  name: string;
  type: TrustBoundaryType;
  description: string;
  confidence: number;
  locations: string[];
  crossesFrom: string;
  crossesTo: string;
}

/** Result of trust boundary detection including LLM-enhanced insights. */
export interface TrustBoundaryResult {
  boundaries: TrustBoundary[];
  summary: string;
}

// ---------------------------------------------------------------------------
// Static heuristic detection
// ---------------------------------------------------------------------------

/**
 * Extracts trust boundary candidates from the security profile
 * using static heuristics (no LLM needed).
 */
export function detectStaticBoundaries(
  profile: SecurityProfile,
): TrustBoundary[] {
  const boundaries: TrustBoundary[] = [];

  // Auth middleware boundaries
  for (const pattern of profile.auth.patterns) {
    if (
      pattern.type === 'middleware' ||
      pattern.type === 'guard' ||
      pattern.type === 'decorator'
    ) {
      boundaries.push({
        name: `Auth ${pattern.type}`,
        type: 'auth-middleware',
        description: `Authentication ${pattern.type} enforcing access control`,
        confidence: 0.85,
        locations: pattern.files,
        crossesFrom: 'untrusted-client',
        crossesTo: 'authenticated-zone',
      });
    }
  }

  // API route boundaries
  if (profile.api.routeCount > 0) {
    const routeFiles = [
      ...new Set(profile.api.endpoints.map(e => e.file)),
    ];
    boundaries.push({
      name: 'API entry point',
      type: 'api-gateway',
      description: `${profile.api.routeCount} API routes serving as entry points`,
      confidence: 0.9,
      locations: routeFiles,
      crossesFrom: 'external-network',
      crossesTo: 'application-layer',
    });
  }

  // Database boundaries
  for (const db of profile.database.databases) {
    const locations: string[] = [];
    if (db.migrationsDir) locations.push(db.migrationsDir);
    if (db.schemaDir) locations.push(db.schemaDir);

    boundaries.push({
      name: `Database (${db.type})`,
      type: 'data-flow',
      description: `Data flow boundary to ${db.type} database${db.orm ? ` via ${db.orm}` : ''}`,
      confidence: 0.8,
      locations,
      crossesFrom: 'application-layer',
      crossesTo: 'data-store',
    });
  }

  // Docker / container boundaries
  if (profile.docker.hasDocker) {
    boundaries.push({
      name: 'Container boundary',
      type: 'network-boundary',
      description: 'Containerized deployment with network isolation',
      confidence: 0.75,
      locations: profile.docker.dockerfiles,
      crossesFrom: 'host-network',
      crossesTo: 'container-network',
    });
  }

  // Existing trust boundary candidates from profile
  for (const candidate of profile.trustBoundaries.candidates) {
    boundaries.push({
      name: candidate.name,
      type: mapCandidateType(candidate.type),
      description: candidate.notes ?? `Trust boundary: ${candidate.name}`,
      confidence: candidate.confidence,
      locations: candidate.locations,
      crossesFrom: 'unknown',
      crossesTo: 'unknown',
    });
  }

  return boundaries;
}

function mapCandidateType(
  type: 'field' | 'header' | 'cookie' | 'session',
): TrustBoundaryType {
  switch (type) {
    case 'header':
    case 'cookie':
      return 'input-validation';
    case 'session':
      return 'auth-middleware';
    case 'field':
      return 'data-flow';
  }
}

// ---------------------------------------------------------------------------
// LLM-enhanced detection
// ---------------------------------------------------------------------------

/** Schema hint for structured LLM output. */
const TRUST_BOUNDARY_SCHEMA = `{
  "boundaries": [
    {
      "name": "string",
      "type": "auth-middleware | api-gateway | input-validation | network-boundary | service-boundary | data-flow",
      "description": "string",
      "confidence": "number 0-1",
      "locations": ["string"],
      "crossesFrom": "string",
      "crossesTo": "string"
    }
  ],
  "summary": "string"
}`;

function buildPrompt(
  profile: SecurityProfile,
  staticBoundaries: TrustBoundary[],
): string {
  const frameworkList = [
    ...profile.frameworks.backend.map(f => f.name),
    ...profile.frameworks.frontend.map(f => f.name),
  ].join(', ') || 'none detected';

  const authList =
    profile.auth.providers.map(p => p.name).join(', ') || 'none detected';

  const dbList =
    profile.database.databases.map(d => d.type).join(', ') || 'none detected';

  const existingBoundaries = staticBoundaries
    .map(
      b =>
        `- ${b.name} (${b.type}): ${b.crossesFrom} -> ${b.crossesTo} [confidence: ${b.confidence}]`,
    )
    .join('\n');

  return `Analyze the following security profile for trust boundaries.

Project: ${profile.project.name}
Languages: ${profile.languages.primary}
Frameworks: ${frameworkList}
Auth providers: ${authList}
Databases: ${dbList}
API styles: ${profile.api.styles.join(', ')}
API routes: ${profile.api.routeCount}
Docker: ${profile.docker.hasDocker ? 'yes' : 'no'}
IaC tools: ${profile.iac.tools.map(t => t.tool).join(', ') || 'none'}

Already detected boundaries:
${existingBoundaries || 'None detected yet.'}

Identify additional trust boundaries that static analysis may have missed.
Return ONLY boundaries not already in the list above.`;
}

/**
 * Detects trust boundaries using both static heuristics and LLM analysis.
 */
export async function detectTrustBoundaries(
  profile: SecurityProfile,
  provider: LLMProvider,
): Promise<TrustBoundaryInfo> {
  const staticBoundaries = detectStaticBoundaries(profile);

  const prompt = buildPrompt(profile, staticBoundaries);

  let llmBoundaries: TrustBoundary[] = [];
  try {
    const result = await provider.analyzeStructured<TrustBoundaryResult>(
      [
        {
          role: 'system',
          content:
            'You are a security architect analyzing trust boundaries in a software system. ' +
            'Return your analysis as structured JSON.',
        },
        {role: 'user', content: prompt},
      ],
      TRUST_BOUNDARY_SCHEMA,
    );

    if (result.boundaries && Array.isArray(result.boundaries)) {
      llmBoundaries = result.boundaries.map(b => ({
        ...b,
        confidence: Math.min(b.confidence, 0.7),
      }));
    }
  } catch {
    logger.warn('LLM trust boundary analysis failed — using static results only');
  }

  // Merge static and LLM boundaries, deduplicating by name
  const seen = new Set(staticBoundaries.map(b => b.name.toLowerCase()));
  const merged = [...staticBoundaries];
  for (const b of llmBoundaries) {
    if (!seen.has(b.name.toLowerCase())) {
      seen.add(b.name.toLowerCase());
      merged.push(b);
    }
  }

  return {
    candidates: merged.map(b => ({
      name: b.name,
      type: mapToProfileType(b.type),
      confidence: b.confidence,
      locations: b.locations,
      notes: `${b.description} [${b.crossesFrom} -> ${b.crossesTo}]`,
    })),
  };
}

function mapToProfileType(
  type: TrustBoundaryType,
): 'field' | 'header' | 'cookie' | 'session' {
  switch (type) {
    case 'auth-middleware':
      return 'session';
    case 'api-gateway':
    case 'input-validation':
      return 'header';
    case 'network-boundary':
    case 'service-boundary':
      return 'cookie';
    case 'data-flow':
      return 'field';
  }
}
