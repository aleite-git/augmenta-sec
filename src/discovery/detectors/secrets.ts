/**
 * Enhanced secret detection — pattern matching for common credential types,
 * .env file scanning, gitignore verification, and confidence scoring.
 */

import type {Detector, DetectorContext, SecretsInfo, SecretFinding} from '../types.js';

interface SecretPattern {
  regex: RegExp;
  pattern: string;
  risk: SecretFinding['risk'];
  confidence: number;
}

const SECRET_PATTERNS: SecretPattern[] = [
  {regex: /AKIA[0-9A-Z]{16}/, pattern: 'aws_access_key_id', risk: 'high', confidence: 0.95},
  {regex: /aws_access_key_id\s*[=:]\s*["']?[A-Z0-9]{16,}/i, pattern: 'aws_access_key_id', risk: 'high', confidence: 0.9},
  {regex: /aws_secret_access_key\s*[=:]\s*["']?\S+/i, pattern: 'aws_secret_access_key', risk: 'high', confidence: 0.9},
  {regex: /AIza[0-9A-Za-z_-]{35}/, pattern: 'gcp_api_key', risk: 'high', confidence: 0.95},
  {regex: /gh[ps]_[A-Za-z0-9_]{36,}/, pattern: 'github_token', risk: 'high', confidence: 0.95},
  {regex: /github_pat_[A-Za-z0-9_]{22,}/, pattern: 'github_fine_grained_token', risk: 'high', confidence: 0.95},
  {regex: /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/, pattern: 'jwt_token', risk: 'high', confidence: 0.85},
  {regex: /JWT_SECRET\s*[=:]\s*["']?\S{8,}/i, pattern: 'jwt_secret', risk: 'high', confidence: 0.9},
  {regex: /(?:postgres|mysql|mongodb|redis):\/\/[^:]+:[^@]+@[^\s"']+/i, pattern: 'database_url', risk: 'high', confidence: 0.9},
  {regex: /private_key\s*[=:]\s*["']?-----BEGIN/i, pattern: 'private_key', risk: 'high', confidence: 0.95},
  {regex: /PRIVATE[\s_-]?KEY\s*[=:]\s*["']?\S{10,}/i, pattern: 'PRIVATE_KEY', risk: 'high', confidence: 0.8},
  {regex: /SECRET\s*[=:]\s*["']?\S{8,}/i, pattern: 'SECRET', risk: 'medium', confidence: 0.6},
  {regex: /PASSWORD\s*[=:]\s*["']?\S{4,}/i, pattern: 'PASSWORD', risk: 'medium', confidence: 0.6},
  {regex: /API_KEY\s*[=:]\s*["']?\S{8,}/i, pattern: 'API_KEY', risk: 'medium', confidence: 0.7},
  {regex: /TOKEN\s*[=:]\s*["']?\S{8,}/i, pattern: 'TOKEN', risk: 'medium', confidence: 0.5},
  {regex: /BEARER\s+[A-Za-z0-9_-]{20,}/i, pattern: 'bearer_token', risk: 'medium', confidence: 0.7},
  {regex: /xox[bprs]-[A-Za-z0-9-]{10,}/, pattern: 'slack_token', risk: 'high', confidence: 0.95},
  {regex: /sk_live_[A-Za-z0-9]{20,}/, pattern: 'stripe_secret_key', risk: 'high', confidence: 0.95},
  {regex: /SG\.[A-Za-z0-9_-]{22,}\.[A-Za-z0-9_-]{22,}/, pattern: 'sendgrid_api_key', risk: 'high', confidence: 0.95},
  {regex: /SK[a-f0-9]{32}/, pattern: 'twilio_api_key', risk: 'high', confidence: 0.85},
];

const EXCLUDED_PATTERNS = [
  /\.env\.example$/, /\.env\.sample$/, /\.env\.template$/,
  /\.test\.[jt]sx?$/, /\.spec\.[jt]sx?$/,
  /\/__tests__\//, /\/test\//, /\/tests\//, /\/fixtures\//, /\/mocks?\//, 
];

function isExcludedFile(file: string): boolean {
  return EXCLUDED_PATTERNS.some((p) => p.test(file));
}

function adjustConfidence(base: number, content: string, file: string): number {
  let adjusted = base;
  if (/(?:prod|production|deploy)/.test(file)) adjusted = Math.min(1.0, adjusted + 0.1);
  if (/(?:your[_-]?|replace[_-]?|example|changeme|xxx|TODO)/i.test(content)) adjusted = Math.max(0.1, adjusted - 0.3);
  if (/^\s*(?:\/\/|#|\/\*|\*)/.test(content)) adjusted = Math.max(0.1, adjusted - 0.2);
  return Math.round(adjusted * 100) / 100;
}

export const secretsDetector: Detector<SecretsInfo> = {
  name: 'secrets',

  async detect(ctx: DetectorContext): Promise<SecretsInfo> {
    const allEnvFiles = await ctx.findFiles(['**/.env', '**/.env.*']);
    const envFiles = allEnvFiles.filter(
      (f) => !f.endsWith('.example') && !f.endsWith('.sample') && !f.endsWith('.template'),
    );

    let gitignoresEnv = false;
    const gitignore = await ctx.readFile('.gitignore');
    if (gitignore) {
      const lines = gitignore.split('\n').map((l) => l.trim());
      gitignoresEnv = lines.some(
        (l) => l === '.env' || l === '.env*' || l === '*.env' || l === '.env.*',
      );
    }

    const sourceGlobs = [
      '**/*.ts', '**/*.js', '**/*.py', '**/*.go', '**/*.java', '**/*.rb',
      '**/*.yaml', '**/*.yml', '**/*.json', '**/*.toml', '**/*.cfg',
      '**/*.ini', '**/*.properties',
    ];

    const findings: SecretFinding[] = [];
    const seen = new Set<string>();

    for (const sp of SECRET_PATTERNS) {
      const matches = await ctx.grep(sp.regex, sourceGlobs, {maxMatches: 50});
      for (const m of matches) {
        if (isExcludedFile(m.file)) continue;
        if (m.file.includes('.env')) continue;
        const key = `${m.file}:${m.line}:${sp.pattern}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const confidence = adjustConfidence(sp.confidence, m.content, m.file);
        findings.push({type: 'hardcoded', file: m.file, line: m.line, pattern: sp.pattern, risk: sp.risk, confidence});
      }
    }

    return {envFiles, gitignoresEnv, findings};
  },
};
