import type {Detector, DetectorContext, AuthInfo, AuthProvider, AuthPattern} from '../types.js';

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

interface AuthSignature {
  name: string;
  type: AuthProvider['type'];
}

/** Maps dependency names to auth provider identities. */
const AUTH_DEPENDENCY_MAP: Record<string, AuthSignature> = {
  // Firebase
  'firebase-admin':          {name: 'firebase-auth', type: 'third-party'},
  '@firebase/auth':          {name: 'firebase-auth', type: 'third-party'},
  'firebase':                {name: 'firebase-auth', type: 'third-party'},

  // Auth0
  'auth0':                   {name: 'auth0', type: 'third-party'},
  '@auth0/auth0-spa-js':     {name: 'auth0', type: 'third-party'},
  '@auth0/auth0-react':      {name: 'auth0', type: 'third-party'},
  '@auth0/nextjs-auth0':     {name: 'auth0', type: 'third-party'},

  // Supabase
  '@supabase/supabase-js':   {name: 'supabase-auth', type: 'third-party'},
  '@supabase/auth-helpers-nextjs': {name: 'supabase-auth', type: 'third-party'},

  // Clerk
  '@clerk/nextjs':           {name: 'clerk', type: 'third-party'},
  '@clerk/clerk-sdk-node':   {name: 'clerk', type: 'third-party'},

  // Passport.js
  'passport':                {name: 'passport', type: 'first-party'},

  // JWT
  'jsonwebtoken':            {name: 'jwt', type: 'first-party'},
  'jose':                    {name: 'jwt', type: 'first-party'},

  // NextAuth / Auth.js
  'next-auth':               {name: 'nextauth', type: 'first-party'},
  '@auth/core':              {name: 'authjs', type: 'first-party'},

  // Lucia
  'lucia':                   {name: 'lucia', type: 'first-party'},

  // Session
  'express-session':         {name: 'session-based', type: 'first-party'},

  // AWS Cognito
  'amazon-cognito-identity-js': {name: 'cognito', type: 'third-party'},
  '@aws-sdk/client-cognito-identity-provider': {name: 'cognito', type: 'third-party'},

  // Keycloak
  'keycloak-js':             {name: 'keycloak', type: 'third-party'},
  'keycloak-connect':        {name: 'keycloak', type: 'third-party'},

  // Python
  'django-allauth':          {name: 'django-allauth', type: 'first-party'},
  'flask-login':             {name: 'flask-login', type: 'first-party'},
  'python-jose':             {name: 'jwt', type: 'first-party'},
  'PyJWT':                   {name: 'jwt', type: 'first-party'},
};

/** Grep patterns for auth-related code. */
const AUTH_PATTERNS = {
  middleware: /(?:auth[Mm]iddleware|requireAuth|isAuthenticated|protect(?:Route)?|authenticate)\s*[=(]/,
  guard: /(?:AuthGuard|RolesGuard|JwtGuard|canActivate)\s*[({]/,
  tokenVerify: /(?:verifyIdToken|jwt\.verify|verify[Tt]oken|decodeToken)\s*\(/,
  session: /(?:req\.session|express-session|cookie-session)/,
  rbac: /(?:checkRole|requireRole|hasPermission|isAdmin|role\s*===|authorize)\s*[=(]/,
  decorator: /@(?:UseGuards|Roles|Auth|Authorized|Protected)\s*\(/,
};

export const authDetector: Detector<AuthInfo> = {
  name: 'auth',

  async detect(ctx: DetectorContext): Promise<AuthInfo> {
    const providers = new Map<string, AuthProvider>();

    // ── Dependency-based detection ──
    const pkgFiles = await ctx.findFiles(['**/package.json']);
    for (const pkgFile of pkgFiles) {
      const pkg = await ctx.readJson<PackageJson>(pkgFile);
      if (!pkg) continue;
      const allDeps = {...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {})};

      for (const dep of Object.keys(allDeps)) {
        const sig = AUTH_DEPENDENCY_MAP[dep];
        if (sig && !providers.has(sig.name)) {
          providers.set(sig.name, {
            name: sig.name,
            type: sig.type,
            confidence: 1.0,
            source: `dependency: ${dep} (${pkgFile})`,
          });
        }
      }
    }

    // ── Python deps ──
    const reqFiles = await ctx.findFiles(['requirements.txt', '**/requirements.txt']);
    for (const reqFile of reqFiles) {
      const content = await ctx.readFile(reqFile);
      if (!content) continue;
      for (const line of content.split('\n')) {
        const pkg = line.trim().split(/[=<>!~]/)[0].toLowerCase();
        const sig = AUTH_DEPENDENCY_MAP[pkg];
        if (sig && !providers.has(sig.name)) {
          providers.set(sig.name, {
            name: sig.name,
            type: sig.type,
            confidence: 1.0,
            source: `dependency: ${pkg} (${reqFile})`,
          });
        }
      }
    }

    // ── Pattern-based detection (grep source files) ──
    const sourceGlobs = ['**/*.ts', '**/*.js', '**/*.py', '**/*.go', '**/*.java', '**/*.rb'];
    const patterns: AuthPattern[] = [];

    for (const [patternType, regex] of Object.entries(AUTH_PATTERNS)) {
      const matches = await ctx.grep(regex, sourceGlobs, {maxMatches: 20});
      if (matches.length > 0) {
        const files = [...new Set(matches.map(m => m.file))];
        patterns.push({
          type: patternType as AuthPattern['type'],
          files,
        });
      }
    }

    // If we found auth middleware/guard patterns but no provider,
    // mark as custom auth
    if (patterns.length > 0 && providers.size === 0) {
      providers.set('custom', {
        name: 'custom',
        type: 'custom',
        confidence: 0.7,
        source: 'inferred from code patterns',
      });
    }

    return {
      providers: [...providers.values()],
      patterns,
    };
  },
};
