/**
 * PII field mapping for AugmentaSec (ASEC-013).
 *
 * Detects Personally Identifiable Information fields in a codebase
 * using both static pattern matching and LLM-enhanced analysis.
 */

import type {PiiFieldCandidate, PiiInfo, SecurityProfile} from '../discovery/types.js';
import type {LLMProvider} from '../providers/llm/types.js';
import {logger} from '../utils/logger.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PiiClassification =
  | 'direct-identifier'
  | 'quasi-identifier'
  | 'sensitive'
  | 'unknown';

// ---------------------------------------------------------------------------
// Static PII detection patterns
// ---------------------------------------------------------------------------

interface PiiPattern {
  pattern: RegExp;
  classification: PiiClassification;
  label: string;
}

const PII_PATTERNS: PiiPattern[] = [
  // Direct identifiers
  {pattern: /\bemail\b/i, classification: 'direct-identifier', label: 'email'},
  {pattern: /\bssn\b/i, classification: 'direct-identifier', label: 'SSN'},
  {pattern: /\bsocial[_-]?security/i, classification: 'direct-identifier', label: 'social security number'},
  {pattern: /\bpassport[_-]?(number|num|no)?\b/i, classification: 'direct-identifier', label: 'passport number'},
  {pattern: /\bdriver[_-]?licen[sc]e/i, classification: 'direct-identifier', label: 'driver license'},
  {pattern: /\bnational[_-]?id\b/i, classification: 'direct-identifier', label: 'national ID'},
  {pattern: /\btax[_-]?id\b/i, classification: 'direct-identifier', label: 'tax ID'},

  // Quasi-identifiers
  {pattern: /\b(first|last|full)[_-]?name\b/i, classification: 'quasi-identifier', label: 'name'},
  {pattern: /\bdate[_-]?of[_-]?birth\b/i, classification: 'quasi-identifier', label: 'date of birth'},
  {pattern: /\bdob\b/i, classification: 'quasi-identifier', label: 'date of birth'},
  {pattern: /\bbirthday\b/i, classification: 'quasi-identifier', label: 'birthday'},
  {pattern: /\bzip[_-]?code\b/i, classification: 'quasi-identifier', label: 'zip code'},
  {pattern: /\bpostal[_-]?code\b/i, classification: 'quasi-identifier', label: 'postal code'},
  {pattern: /\bgender\b/i, classification: 'quasi-identifier', label: 'gender'},
  {pattern: /\bethnicity\b/i, classification: 'quasi-identifier', label: 'ethnicity'},
  {pattern: /\bphone[_-]?(number|num)?\b/i, classification: 'quasi-identifier', label: 'phone number'},
  {pattern: /\baddress\b/i, classification: 'quasi-identifier', label: 'address'},
  {pattern: /\bage\b/i, classification: 'quasi-identifier', label: 'age'},

  // Sensitive data
  {pattern: /\bcredit[_-]?card\b/i, classification: 'sensitive', label: 'credit card'},
  {pattern: /\bcard[_-]?number\b/i, classification: 'sensitive', label: 'card number'},
  {pattern: /\bcvv\b/i, classification: 'sensitive', label: 'CVV'},
  {pattern: /\biban\b/i, classification: 'sensitive', label: 'IBAN'},
  {pattern: /\bbank[_-]?account\b/i, classification: 'sensitive', label: 'bank account'},
  {pattern: /\bsalary\b/i, classification: 'sensitive', label: 'salary'},
  {pattern: /\bincome\b/i, classification: 'sensitive', label: 'income'},
  {pattern: /\bmedical\b/i, classification: 'sensitive', label: 'medical data'},
  {pattern: /\bhealth[_-]?(record|data|info)\b/i, classification: 'sensitive', label: 'health data'},
  {pattern: /\bdiagnos[ie]s\b/i, classification: 'sensitive', label: 'diagnosis'},
  {pattern: /\bpassword\b/i, classification: 'sensitive', label: 'password'},
  {pattern: /\bsecret[_-]?key\b/i, classification: 'sensitive', label: 'secret key'},
  {pattern: /\bbiometric\b/i, classification: 'sensitive', label: 'biometric data'},
];

// ---------------------------------------------------------------------------
// Static detection from profile
// ---------------------------------------------------------------------------

export function detectStaticPii(
  profile: SecurityProfile,
): PiiFieldCandidate[] {
  const candidates: PiiFieldCandidate[] = [];
  const seen = new Set<string>();

  // Check existing PII candidates from profile
  for (const existing of profile.piiFields.candidates) {
    const key = `${existing.field}:${existing.location}`;
    if (!seen.has(key)) {
      seen.add(key);
      candidates.push(existing);
    }
  }

  // Scan API endpoint paths for PII patterns
  for (const endpoint of profile.api.endpoints) {
    const path = endpoint.path.toLowerCase();
    for (const piiPattern of PII_PATTERNS) {
      if (piiPattern.pattern.test(path)) {
        const key = `${piiPattern.label}:${endpoint.file}`;
        if (!seen.has(key)) {
          seen.add(key);
          candidates.push({
            field: piiPattern.label,
            location: `${endpoint.file}:${endpoint.line}`,
            classification: piiPattern.classification,
            confidence: 0.6,
          });
        }
      }
    }
  }

  return candidates;
}

/**
 * Tests a string against all PII patterns and returns matches.
 */
export function matchPiiPatterns(
  text: string,
): Array<{label: string; classification: PiiClassification}> {
  const matches: Array<{label: string; classification: PiiClassification}> = [];
  for (const piiPattern of PII_PATTERNS) {
    if (piiPattern.pattern.test(text)) {
      matches.push({
        label: piiPattern.label,
        classification: piiPattern.classification,
      });
    }
  }
  return matches;
}

// ---------------------------------------------------------------------------
// LLM-enhanced detection
// ---------------------------------------------------------------------------

const PII_SCHEMA = `{
  "candidates": [
    {
      "field": "string",
      "location": "string",
      "classification": "direct-identifier | quasi-identifier | sensitive | unknown",
      "confidence": "number 0-1"
    }
  ]
}`;

function buildPiiPrompt(
  profile: SecurityProfile,
  staticCandidates: PiiFieldCandidate[],
): string {
  const dbList =
    profile.database.databases
      .map(d => `${d.type}${d.orm ? ` (${d.orm})` : ''}`)
      .join(', ') || 'none detected';

  const existingPii = staticCandidates
    .map(
      c => `- ${c.field} (${c.classification}) at ${c.location} [confidence: ${c.confidence}]`,
    )
    .join('\n');

  const endpoints = profile.api.endpoints
    .slice(0, 30)
    .map(e => `  ${e.method} ${e.path}`)
    .join('\n');

  return `Analyze the following codebase profile for PII fields.

Project: ${profile.project.name}
Languages: ${profile.languages.primary}
Databases: ${dbList}

API endpoints (first 30):
${endpoints || 'None detected'}

Already detected PII:
${existingPii || 'None detected yet.'}

Identify additional PII fields not already in the detected list.`;
}

/**
 * Maps PII fields using static patterns and LLM analysis.
 */
export async function mapPiiFields(
  profile: SecurityProfile,
  provider: LLMProvider,
): Promise<PiiInfo> {
  const staticCandidates = detectStaticPii(profile);
  const prompt = buildPiiPrompt(profile, staticCandidates);

  let llmCandidates: PiiFieldCandidate[] = [];
  try {
    const result = await provider.analyzeStructured<PiiInfo>(
      [
        {
          role: 'system',
          content:
            'You are a data privacy analyst identifying PII fields in software systems. ' +
            'Return your analysis as structured JSON.',
        },
        {role: 'user', content: prompt},
      ],
      PII_SCHEMA,
    );

    if (result.candidates && Array.isArray(result.candidates)) {
      llmCandidates = result.candidates.map(c => ({
        ...c,
        confidence: Math.min(c.confidence, 0.7),
      }));
    }
  } catch {
    logger.warn('LLM PII analysis failed — using static results only');
  }

  // Merge and deduplicate
  const seen = new Set(
    staticCandidates.map(c => `${c.field}:${c.location}`.toLowerCase()),
  );
  const merged = [...staticCandidates];
  for (const c of llmCandidates) {
    const key = `${c.field}:${c.location}`.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(c);
    }
  }

  return {candidates: merged};
}
