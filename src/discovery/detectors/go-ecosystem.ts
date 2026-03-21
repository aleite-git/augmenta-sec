import type {Detector, DetectorContext} from '../types.js';
import type {GoEcosystemInfo} from '../types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Well-known Go web / microservice frameworks. */
const GO_FRAMEWORKS: Record<string, string> = {
  'github.com/gin-gonic/gin': 'gin',
  'github.com/labstack/echo': 'echo',
  'github.com/gofiber/fiber': 'fiber',
  'github.com/gorilla/mux': 'gorilla-mux',
  'github.com/go-chi/chi': 'chi',
  'github.com/beego/beego': 'beego',
  'github.com/valyala/fasthttp': 'fasthttp',
  'github.com/julienschmidt/httprouter': 'httprouter',
  'google.golang.org/grpc': 'grpc',
  'github.com/grpc-ecosystem/grpc-gateway': 'grpc-gateway',
  'gorm.io/gorm': 'gorm',
  'entgo.io/ent': 'ent',
  'github.com/jmoiron/sqlx': 'sqlx',
  'github.com/go-pg/pg': 'go-pg',
  'github.com/uptrace/bun': 'bun',
};

/** Security-related Go dependencies/tools. */
const SECURITY_TOOLS: Record<string, string> = {
  'github.com/securego/gosec': 'gosec',
  'golang.org/x/crypto': 'x/crypto',
  'github.com/dgrijalva/jwt-go': 'jwt-go',
  'github.com/golang-jwt/jwt': 'golang-jwt',
  'github.com/coreos/go-oidc': 'go-oidc',
  'github.com/casbin/casbin': 'casbin',
  'github.com/gorilla/csrf': 'gorilla-csrf',
  'github.com/rs/cors': 'rs-cors',
  'go.uber.org/zap': 'zap-logger',
  'github.com/sirupsen/logrus': 'logrus',
  'github.com/go-playground/validator': 'go-validator',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface GoModParsed {
  modulePath?: string;
  goVersion?: string;
  directDeps: string[];
  indirectDeps: string[];
}

/**
 * Parses a go.mod file and extracts module path, Go version,
 * and dependency module paths (direct vs. indirect).
 */
function parseGoMod(content: string): GoModParsed {
  const result: GoModParsed = {
    directDeps: [],
    indirectDeps: [],
  };

  const lines = content.split('\n');
  let inRequireBlock = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Module path
    const moduleMatch = trimmed.match(/^module\s+(.+)$/);
    if (moduleMatch) {
      result.modulePath = moduleMatch[1].trim();
      continue;
    }

    // Go version
    const goMatch = trimmed.match(/^go\s+(\d+\.\d+(?:\.\d+)?)$/);
    if (goMatch) {
      result.goVersion = goMatch[1];
      continue;
    }

    // require block start
    if (trimmed === 'require (') {
      inRequireBlock = true;
      continue;
    }
    if (trimmed === ')') {
      inRequireBlock = false;
      continue;
    }

    // Single-line require
    const singleReq = trimmed.match(/^require\s+(\S+)\s/);
    if (singleReq) {
      if (trimmed.includes('// indirect')) {
        result.indirectDeps.push(singleReq[1]);
      } else {
        result.directDeps.push(singleReq[1]);
      }
      continue;
    }

    // Inside require block
    if (inRequireBlock && trimmed) {
      const depMatch = trimmed.match(/^(\S+)\s/);
      if (depMatch) {
        if (trimmed.includes('// indirect')) {
          result.indirectDeps.push(depMatch[1]);
        } else {
          result.directDeps.push(depMatch[1]);
        }
      }
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Detector
// ---------------------------------------------------------------------------

export const goEcosystemDetector: Detector<GoEcosystemInfo> = {
  name: 'go-ecosystem',

  async detect(ctx: DetectorContext): Promise<GoEcosystemInfo> {
    const hasGoMod = await ctx.fileExists('go.mod');

    if (!hasGoMod) {
      return {
        detected: false,
        hasGoSum: false,
        directDeps: 0,
        indirectDeps: 0,
        frameworks: [],
        securityTools: [],
        hasVendor: false,
        hasUnsafeImports: false,
      };
    }

    const goModContent = await ctx.readFile('go.mod');
    const parsed = goModContent
      ? parseGoMod(goModContent)
      : {directDeps: [] as string[], indirectDeps: [] as string[]};

    const hasGoSum = await ctx.fileExists('go.sum');

    // Check for vendor directory
    const vendorFiles = await ctx.findFiles(['vendor/modules.txt']);
    const hasVendor = vendorFiles.length > 0;

    // Detect frameworks from deps
    const allModules = new Set([...parsed.directDeps, ...parsed.indirectDeps]);
    const frameworks: string[] = [];
    for (const [modPrefix, name] of Object.entries(GO_FRAMEWORKS)) {
      for (const mod of allModules) {
        if (mod === modPrefix || mod.startsWith(modPrefix + '/')) {
          frameworks.push(name);
          break;
        }
      }
    }

    // Detect security tools
    const securityTools: string[] = [];
    for (const [modPrefix, name] of Object.entries(SECURITY_TOOLS)) {
      for (const mod of allModules) {
        if (mod === modPrefix || mod.startsWith(modPrefix + '/')) {
          securityTools.push(name);
          break;
        }
      }
    }

    // Check for unsafe imports
    const unsafeMatches = await ctx.grep(
      /"unsafe"/,
      ['**/*.go'],
      {maxMatches: 1},
    );
    const hasUnsafeImports = unsafeMatches.length > 0;

    return {
      detected: true,
      goModFile: 'go.mod',
      goVersion: parsed.goVersion,
      modulePath: parsed.modulePath,
      hasGoSum,
      directDeps: parsed.directDeps.length,
      indirectDeps: parsed.indirectDeps.length,
      frameworks,
      securityTools,
      hasVendor,
      hasUnsafeImports,
    };
  },
};
