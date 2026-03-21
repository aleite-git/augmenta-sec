import type {
  Detector, DetectorContext,
  SecurityControlsInfo, SecurityControl,
} from '../types.js';

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

interface ControlSignature {
  name: string;
  type: string;
  packages: string[];
  /** Pattern to grep in source to confirm actual usage. */
  usagePattern?: RegExp;
}

/** Security controls we look for, with the packages that provide them. */
const CONTROL_SIGNATURES: ControlSignature[] = [
  {
    name: 'HTTP Security Headers',
    type: 'http-headers',
    packages: ['helmet'],
    usagePattern: /helmet\s*\(/,
  },
  {
    name: 'CORS',
    type: 'cross-origin',
    packages: ['cors', '@fastify/cors', '@koa/cors'],
    usagePattern: /cors\s*\(/,
  },
  {
    name: 'Rate Limiting',
    type: 'rate-limiting',
    packages: ['express-rate-limit', 'rate-limiter-flexible', '@fastify/rate-limit', 'bottleneck'],
    usagePattern: /(?:rateLimit|RateLimiter|rateLimiter|limiter)\s*[({]/,
  },
  {
    name: 'Input Validation',
    type: 'input-validation',
    packages: ['zod', 'joi', 'yup', 'class-validator', 'ajv', 'express-validator', 'superstruct', 'valibot'],
    usagePattern: /(?:z\.object|z\.string|Joi\.object|yup\.object|@IsString|@IsEmail|validate|ajv\.compile)/,
  },
  {
    name: 'CSRF Protection',
    type: 'csrf',
    packages: ['csurf', 'csrf-csrf', '@fastify/csrf-protection', 'csrf'],
  },
  {
    name: 'Password Hashing',
    type: 'password-hashing',
    packages: ['bcrypt', 'bcryptjs', 'argon2', 'scrypt-js'],
    usagePattern: /(?:bcrypt\.hash|argon2\.hash|hashPassword)\s*\(/,
  },
  {
    name: 'XSS Prevention',
    type: 'xss-prevention',
    packages: ['sanitize-html', 'dompurify', 'xss', 'isomorphic-dompurify', 'xss-filters'],
  },
  {
    name: 'SQL Injection Prevention',
    type: 'sqli-prevention',
    packages: ['express-mongo-sanitize', 'mongo-sanitize'],
  },
  {
    name: 'HPP (HTTP Parameter Pollution)',
    type: 'hpp',
    packages: ['hpp'],
  },
  {
    name: 'Content Security Policy',
    type: 'csp',
    packages: ['helmet-csp', 'content-security-policy'],
    usagePattern: /contentSecurityPolicy|(?:Content-Security-Policy)/,
  },
  {
    name: 'Cookie Security',
    type: 'cookie-security',
    packages: ['cookie-parser', 'cookie-session'],
    usagePattern: /(?:httpOnly|secure|sameSite)\s*:/,
  },
  {
    name: 'Request Size Limiting',
    type: 'request-size',
    packages: [],
    usagePattern: /(?:express\.json\s*\(\s*\{[^}]*limit|bodyParser.*limit|payload.*limit)/,
  },
];

/**
 * Controls we recommend but only flag as "missing" when they make
 * sense in context (e.g., CSRF only matters for session-based auth).
 */
const ALWAYS_RECOMMENDED = [
  'HTTP Security Headers',
  'CORS',
  'Rate Limiting',
  'Input Validation',
];

export const securityControlsDetector: Detector<SecurityControlsInfo> = {
  name: 'security-controls',

  async detect(ctx: DetectorContext): Promise<SecurityControlsInfo> {
    // Gather all dependencies from every package.json
    const allDeps = new Set<string>();
    const pkgFiles = await ctx.findFiles(['**/package.json']);
    for (const pkgFile of pkgFiles) {
      const pkg = await ctx.readJson<PackageJson>(pkgFile);
      if (!pkg) continue;
      for (const dep of Object.keys(pkg.dependencies ?? {})) allDeps.add(dep);
      for (const dep of Object.keys(pkg.devDependencies ?? {})) allDeps.add(dep);
    }

    // Also check Python requirements
    const reqFiles = await ctx.findFiles(['requirements.txt', '**/requirements.txt']);
    for (const reqFile of reqFiles) {
      const content = await ctx.readFile(reqFile);
      if (!content) continue;
      for (const line of content.split('\n')) {
        const pkg = line.trim().split(/[=<>!~]/)[0].toLowerCase();
        if (pkg) allDeps.add(pkg);
      }
    }

    const present: SecurityControl[] = [];
    const missing: SecurityControl[] = [];
    const sourceGlobs = ['**/*.ts', '**/*.js', '**/*.py', '**/*.go'];

    for (const sig of CONTROL_SIGNATURES) {
      // Check if any of the associated packages are dependencies
      const matchedPkg = sig.packages.find(p => allDeps.has(p));
      let confirmed = false;
      let confidence = 0;

      if (matchedPkg) {
        confidence = 0.8; // dependency found

        // If we have a usage pattern, grep to confirm actual usage
        if (sig.usagePattern) {
          const usageMatches = await ctx.grep(sig.usagePattern, sourceGlobs, {maxMatches: 3});
          if (usageMatches.length > 0) {
            confidence = 1.0;
            confirmed = true;
          }
        } else {
          confirmed = true;
        }
      } else if (sig.usagePattern) {
        // No package, but check for inline usage patterns
        const usageMatches = await ctx.grep(sig.usagePattern, sourceGlobs, {maxMatches: 3});
        if (usageMatches.length > 0) {
          confidence = 0.7;
          confirmed = true;
        }
      }

      if (confirmed || matchedPkg) {
        present.push({
          name: sig.name,
          type: sig.type,
          present: true,
          confidence,
          source: matchedPkg
            ? `dependency: ${matchedPkg}`
            : 'code pattern match',
          details: matchedPkg ?? undefined,
        });
      } else if (ALWAYS_RECOMMENDED.includes(sig.name)) {
        missing.push({
          name: sig.name,
          type: sig.type,
          present: false,
          confidence: 0.8,
          source: 'not detected in dependencies or code',
        });
      }
    }

    return {present, missing};
  },
};
