import type {
  Detector,
  DetectorContext,
  SecretsInfo,
  SecretFinding,
} from '../types.js';

/** Patterns to detect hardcoded secrets in source files. */
const SECRET_PATTERNS: Array<{
  regex: RegExp;
  pattern: string;
  risk: SecretFinding['risk'];
}> = [
  {
    regex: /aws_access_key_id\s*[=:]\s*["']?[A-Z0-9]{16,}/i,
    pattern: 'aws_access_key_id',
    risk: 'high',
  },
  {
    regex: /aws_secret_access_key\s*[=:]\s*["']?\S+/i,
    pattern: 'aws_secret_access_key',
    risk: 'high',
  },
  {
    regex: /private_key\s*[=:]\s*["']?-----BEGIN/i,
    pattern: 'private_key',
    risk: 'high',
  },
  {
    regex: /PRIVATE[\s_-]?KEY\s*[=:]\s*["']?\S{10,}/i,
    pattern: 'PRIVATE_KEY',
    risk: 'high',
  },
  {
    regex: /SECRET\s*[=:]\s*["']?\S{8,}/i,
    pattern: 'SECRET',
    risk: 'medium',
  },
  {
    regex: /PASSWORD\s*[=:]\s*["']?\S{4,}/i,
    pattern: 'PASSWORD',
    risk: 'medium',
  },
  {
    regex: /API_KEY\s*[=:]\s*["']?\S{8,}/i,
    pattern: 'API_KEY',
    risk: 'medium',
  },
  {
    regex: /TOKEN\s*[=:]\s*["']?\S{8,}/i,
    pattern: 'TOKEN',
    risk: 'medium',
  },
];

/** File patterns to exclude from secret scanning (test files, examples). */
const EXCLUDED_PATTERNS = [
  /\.env\.example$/,
  /\.env\.sample$/,
  /\.env\.template$/,
  /\.test\.[jt]sx?$/,
  /\.spec\.[jt]sx?$/,
  /\/__tests__\//,
  /\/test\//,
  /\/tests\//,
  /\/fixtures\//,
  /\/mocks?\//,
];

function isExcludedFile(file: string): boolean {
  return EXCLUDED_PATTERNS.some(p => p.test(file));
}

export const secretsDetector: Detector<SecretsInfo> = {
  name: 'secrets',

  async detect(ctx: DetectorContext): Promise<SecretsInfo> {
    // ── Find .env files (exclude examples/samples/templates) ──
    const allEnvFiles = await ctx.findFiles([
      '**/.env',
      '**/.env.*',
    ]);
    const envFiles = allEnvFiles.filter(
      f =>
        !f.endsWith('.example') &&
        !f.endsWith('.sample') &&
        !f.endsWith('.template'),
    );

    // ── Check if .gitignore excludes .env ──
    let gitignoresEnv = false;
    const gitignore = await ctx.readFile('.gitignore');
    if (gitignore) {
      const lines = gitignore.split('\n').map(l => l.trim());
      gitignoresEnv = lines.some(
        l => l === '.env' || l === '.env*' || l === '*.env' || l === '.env.*',
      );
    }

    // ── Grep for hardcoded secrets in source files ──
    const sourceGlobs = [
      '**/*.ts',
      '**/*.js',
      '**/*.py',
      '**/*.go',
      '**/*.java',
      '**/*.rb',
      '**/*.yaml',
      '**/*.yml',
      '**/*.json',
    ];

    const findings: SecretFinding[] = [];

    for (const sp of SECRET_PATTERNS) {
      const matches = await ctx.grep(sp.regex, sourceGlobs, {maxMatches: 50});

      for (const m of matches) {
        // Skip excluded files (tests, examples, env files)
        if (isExcludedFile(m.file)) continue;
        if (m.file.includes('.env')) continue;

        findings.push({
          type: 'hardcoded',
          file: m.file,
          line: m.line,
          pattern: sp.pattern,
          risk: sp.risk,
        });
      }
    }

    return {envFiles, gitignoresEnv, findings};
  },
};
