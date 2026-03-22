/**
 * ASEC-071: Rule-based remediation suggestions.
 *
 * Built-in rules covering OWASP Top 10 and common vulnerability
 * categories. Each rule pattern-matches on finding category and/or
 * title to produce a suggestion template.
 */

import type {Finding} from '../findings/types.js';
import type {RemediationSuggestion, EffortLevel} from './engine.js';

// ---------------------------------------------------------------------------
// Rule definition
// ---------------------------------------------------------------------------

/** A single remediation rule that pattern-matches on a finding. */
export interface RemediationRule {
  /** Unique rule identifier. */
  id: string;
  /** Finding categories this rule applies to (case-insensitive substring match). */
  categories: string[];
  /** Finding title patterns this rule applies to (case-insensitive substring match). */
  titlePatterns: string[];
  /** Suggestion title when the rule matches. */
  title: string;
  /** Suggestion description template. */
  description: string;
  /** Default effort level. */
  effort: EffortLevel;
  /** Default priority score (0-100). */
  defaultPriority: number;
  /** Optional code example. */
  codeExample?: string;
}

// ---------------------------------------------------------------------------
// Built-in rules (OWASP Top 10 + common findings)
// ---------------------------------------------------------------------------

const BUILTIN_RULES: RemediationRule[] = [
  // A01:2021 — Broken Access Control
  {
    id: 'rule-missing-auth',
    categories: ['auth', 'access-control', 'authorization'],
    titlePatterns: ['missing auth', 'no authentication', 'unauthenticated', 'broken access'],
    title: 'Add authentication middleware',
    description:
      'Protect the endpoint with authentication middleware that validates tokens or session credentials before granting access. Ensure all state-changing routes require authentication.',
    effort: 'medium',
    defaultPriority: 90,
    codeExample: [
      '// Express middleware example',
      'app.use("/api/protected", authMiddleware);',
      '',
      'function authMiddleware(req, res, next) {',
      '  const token = req.headers.authorization?.split(" ")[1];',
      '  if (!token || !verifyToken(token)) {',
      '    return res.status(401).json({ error: "Unauthorized" });',
      '  }',
      '  next();',
      '}',
    ].join('\n'),
  },
  {
    id: 'rule-missing-rbac',
    categories: ['auth', 'access-control', 'authorization'],
    titlePatterns: ['missing rbac', 'no role check', 'privilege escalation', 'idor'],
    title: 'Implement role-based access control',
    description:
      'Add RBAC checks to verify the authenticated user has the required role or ownership before accessing the resource. Check object ownership for user-specific data.',
    effort: 'medium',
    defaultPriority: 85,
  },

  // A02:2021 — Cryptographic Failures
  {
    id: 'rule-missing-https',
    categories: ['crypto', 'transport', 'tls', 'network'],
    titlePatterns: ['missing https', 'http://', 'insecure transport', 'no tls', 'cleartext'],
    title: 'Enforce HTTPS / TLS',
    description:
      'Replace HTTP URLs with HTTPS and enforce TLS on all external communications. Configure HSTS headers and redirect HTTP to HTTPS at the load balancer or application level.',
    effort: 'low',
    defaultPriority: 80,
    codeExample: [
      '// Enforce HSTS via Helmet',
      'import helmet from "helmet";',
      'app.use(helmet.hsts({ maxAge: 31536000, includeSubDomains: true }));',
    ].join('\n'),
  },
  {
    id: 'rule-weak-crypto',
    categories: ['crypto', 'encryption'],
    titlePatterns: ['weak hash', 'md5', 'sha1', 'weak cipher', 'weak encryption', 'insecure random'],
    title: 'Use strong cryptographic algorithms',
    description:
      'Replace weak hashing algorithms (MD5, SHA-1) with SHA-256 or stronger. Use AES-256-GCM for encryption. Use cryptographically secure random number generators (crypto.randomBytes / crypto.getRandomValues).',
    effort: 'low',
    defaultPriority: 75,
  },

  // A03:2021 — Injection
  {
    id: 'rule-sql-injection',
    categories: ['injection', 'sql', 'database'],
    titlePatterns: ['sql injection', 'sqli', 'raw query', 'unsanitized query', 'string concatenation.*query'],
    title: 'Use parameterized queries',
    description:
      'Replace string concatenation or template literal SQL queries with parameterized queries or a query builder / ORM. Never interpolate user input into SQL strings directly.',
    effort: 'medium',
    defaultPriority: 95,
    codeExample: [
      '// BEFORE (vulnerable)',
      'const result = await db.query(`SELECT * FROM users WHERE id = ${userId}`);',
      '',
      '// AFTER (parameterized)',
      'const result = await db.query("SELECT * FROM users WHERE id = $1", [userId]);',
    ].join('\n'),
  },
  {
    id: 'rule-xss',
    categories: ['xss', 'injection', 'output-encoding'],
    titlePatterns: ['xss', 'cross-site scripting', 'unsanitized output', 'innerhtml', 'dangerously'],
    title: 'Sanitize output and escape HTML',
    description:
      'Escape all user-controlled data before rendering in HTML. Use a templating engine with auto-escaping, or explicitly escape special characters (&, <, >, ", \').',
    effort: 'low',
    defaultPriority: 85,
    codeExample: [
      '// Use DOMPurify for HTML sanitization',
      'import DOMPurify from "dompurify";',
      'const clean = DOMPurify.sanitize(userInput);',
    ].join('\n'),
  },
  {
    id: 'rule-command-injection',
    categories: ['injection', 'command-injection', 'os-command'],
    titlePatterns: ['command injection', 'os command', 'exec(', 'shell injection', 'child_process'],
    title: 'Avoid shell command execution with user input',
    description:
      'Never pass user input to shell commands (exec, spawn with shell: true). Use parameterized APIs, execFile with explicit arguments, or dedicated libraries instead of shell invocation.',
    effort: 'medium',
    defaultPriority: 95,
    codeExample: [
      '// BEFORE (vulnerable)',
      'exec(`grep ${userInput} /var/log/app.log`);',
      '',
      '// AFTER (safe)',
      'execFile("grep", [userInput, "/var/log/app.log"]);',
    ].join('\n'),
  },

  // A04:2021 — Insecure Design (CSRF)
  {
    id: 'rule-csrf',
    categories: ['csrf', 'session', 'insecure-design'],
    titlePatterns: ['csrf', 'cross-site request forgery', 'missing csrf', 'no csrf'],
    title: 'Add CSRF protection',
    description:
      'Implement CSRF tokens for all state-changing endpoints. Use the Synchronizer Token Pattern or Double Submit Cookie pattern. Set SameSite cookie attribute.',
    effort: 'medium',
    defaultPriority: 80,
    codeExample: [
      '// Express CSRF middleware',
      'import csrf from "csurf";',
      'app.use(csrf({ cookie: { httpOnly: true, sameSite: "strict" } }));',
    ].join('\n'),
  },

  // A05:2021 — Security Misconfiguration
  {
    id: 'rule-security-headers',
    categories: ['headers', 'misconfiguration', 'security-headers'],
    titlePatterns: ['missing header', 'security header', 'content-security-policy', 'x-frame-options', 'cors'],
    title: 'Configure security headers',
    description:
      'Add security headers: Content-Security-Policy, X-Content-Type-Options, X-Frame-Options, Strict-Transport-Security, Referrer-Policy. Use Helmet or equivalent middleware.',
    effort: 'low',
    defaultPriority: 70,
    codeExample: [
      'import helmet from "helmet";',
      'app.use(helmet());',
    ].join('\n'),
  },
  {
    id: 'rule-debug-enabled',
    categories: ['misconfiguration', 'debug', 'information-disclosure'],
    titlePatterns: ['debug mode', 'verbose error', 'stack trace', 'debug enabled'],
    title: 'Disable debug mode in production',
    description:
      'Ensure debug mode, verbose error messages, and stack traces are disabled in production. Use environment-specific configuration and generic error responses for end users.',
    effort: 'low',
    defaultPriority: 65,
  },

  // A06:2021 — Vulnerable and Outdated Components
  {
    id: 'rule-outdated-deps',
    categories: ['dependencies', 'sca', 'vulnerable-component'],
    titlePatterns: ['outdated', 'vulnerable dep', 'known vulnerability', 'cve-', 'npm audit'],
    title: 'Update vulnerable dependencies',
    description:
      'Upgrade the affected dependency to a patched version. If no patch exists, evaluate alternative packages. Add automated dependency scanning (Dependabot, Renovate) to CI.',
    effort: 'low',
    defaultPriority: 75,
  },

  // A07:2021 — Identification and Authentication Failures
  {
    id: 'rule-hardcoded-secrets',
    categories: ['secrets', 'credentials', 'hardcoded'],
    titlePatterns: ['hardcoded secret', 'hardcoded password', 'hardcoded key', 'api key in', 'password in source'],
    title: 'Move secrets to environment variables or secret manager',
    description:
      'Remove hardcoded secrets from source code. Use environment variables, a secret manager (e.g., AWS Secrets Manager, Vault, Scaleway Secret Manager), or .env files excluded from version control.',
    effort: 'low',
    defaultPriority: 90,
    codeExample: [
      '// BEFORE (hardcoded)',
      'const apiKey = "sk-1234567890abcdef";',
      '',
      '// AFTER (environment variable)',
      'const apiKey = process.env.API_KEY;',
      'if (!apiKey) throw new Error("API_KEY not configured");',
    ].join('\n'),
  },
  {
    id: 'rule-weak-password',
    categories: ['auth', 'password', 'credentials'],
    titlePatterns: ['weak password', 'password policy', 'password strength', 'no password validation'],
    title: 'Enforce strong password policy',
    description:
      'Require minimum password length (12+ characters), complexity rules, and check against known breached passwords (haveibeenpwned API). Use bcrypt/scrypt/argon2 for password hashing.',
    effort: 'medium',
    defaultPriority: 70,
  },

  // A08:2021 — Software and Data Integrity Failures
  {
    id: 'rule-deserialization',
    categories: ['deserialization', 'injection', 'integrity'],
    titlePatterns: ['deserializ', 'unsafe deserializ', 'untrusted data', 'pickle', 'yaml.load'],
    title: 'Validate deserialized data',
    description:
      'Never deserialize untrusted data without validation. Use safe deserialization methods (yaml.safeLoad, JSON.parse with schema validation). Validate input schemas with Zod or similar.',
    effort: 'medium',
    defaultPriority: 80,
  },

  // A09:2021 — Security Logging and Monitoring Failures
  {
    id: 'rule-missing-logging',
    categories: ['logging', 'monitoring', 'audit'],
    titlePatterns: ['missing log', 'no audit', 'no logging', 'insufficient logging'],
    title: 'Add security event logging',
    description:
      'Log authentication events (login, logout, failed attempts), authorization failures, input validation errors, and data access. Use structured logging with correlation IDs. Never log PII or secrets.',
    effort: 'medium',
    defaultPriority: 60,
  },

  // A10:2021 — Server-Side Request Forgery (SSRF)
  {
    id: 'rule-ssrf',
    categories: ['ssrf', 'injection', 'request-forgery'],
    titlePatterns: ['ssrf', 'server-side request forgery', 'url injection', 'open redirect'],
    title: 'Validate and restrict outbound URLs',
    description:
      'Validate and allowlist outbound URLs. Block requests to internal/private IP ranges (127.0.0.0/8, 10.0.0.0/8, 172.16.0.0/12, 169.254.169.254). Use a URL parser to prevent bypass via DNS rebinding or IP encoding tricks.',
    effort: 'medium',
    defaultPriority: 85,
  },

  // Extra — Path traversal
  {
    id: 'rule-path-traversal',
    categories: ['path-traversal', 'injection', 'file-access'],
    titlePatterns: ['path traversal', 'directory traversal', '../', 'lfi', 'local file inclusion'],
    title: 'Sanitize file paths',
    description:
      'Resolve and normalize file paths before use. Verify the resolved path stays within the expected directory (jail check). Reject paths containing ".." sequences.',
    effort: 'low',
    defaultPriority: 85,
    codeExample: [
      'import path from "node:path";',
      '',
      'function safePath(base: string, userPath: string): string {',
      '  const resolved = path.resolve(base, userPath);',
      '  if (!resolved.startsWith(path.resolve(base))) {',
      '    throw new Error("Path traversal detected");',
      '  }',
      '  return resolved;',
      '}',
    ].join('\n'),
  },
];

// ---------------------------------------------------------------------------
// Matching logic
// ---------------------------------------------------------------------------

function matchesCategory(finding: Finding, categories: string[]): boolean {
  const cat = finding.category.toLowerCase();
  return categories.some((c) => cat.includes(c.toLowerCase()));
}

function matchesTitle(finding: Finding, patterns: string[]): boolean {
  const title = finding.title.toLowerCase();
  return patterns.some((p) => {
    try {
      return new RegExp(p, 'i').test(title);
    } catch {
      return title.includes(p.toLowerCase());
    }
  });
}

function ruleMatches(finding: Finding, rule: RemediationRule): boolean {
  return matchesCategory(finding, rule.categories) ||
    matchesTitle(finding, rule.titlePatterns);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns all built-in remediation rules.
 */
export function getRules(): RemediationRule[] {
  return [...BUILTIN_RULES];
}

/**
 * Applies built-in rules against a list of findings and returns
 * remediation suggestions for all matched findings.
 *
 * A finding can match multiple rules; each match produces a separate
 * suggestion.
 */
export function applyRules(findings: Finding[]): RemediationSuggestion[] {
  const suggestions: RemediationSuggestion[] = [];

  for (const finding of findings) {
    for (const rule of BUILTIN_RULES) {
      if (ruleMatches(finding, rule)) {
        suggestions.push({
          findingId: finding.id,
          title: rule.title,
          description: rule.description,
          effort: rule.effort,
          priority: rule.defaultPriority,
          codeExample: rule.codeExample,
        });
      }
    }
  }

  return suggestions;
}
