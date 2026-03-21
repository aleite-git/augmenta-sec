import type {Detector, DetectorContext, ApiInfo, EndpointSummary} from '../types.js';

/** Patterns that match route definitions across frameworks. */
const ROUTE_PATTERNS = {
  // Express / Koa / Fastify
  expressApp: /(?:app|router|server)\.(get|post|put|patch|delete|options|head|all)\s*\(\s*['"`]([^'"`]+)['"`]/,
  // NestJS decorators
  nestDecorator: /@(Get|Post|Put|Patch|Delete|Options|Head|All)\s*\(\s*['"`]?([^'"`)\s]*)['"`]?\s*\)/,
  // Flask
  flask: /@app\.route\s*\(\s*['"`]([^'"`]+)['"`].*methods\s*=\s*\[([^\]]+)\]/,
  // Django (urls.py)
  django: /path\s*\(\s*['"`]([^'"`]+)['"`]/,
  // Go (gin, echo, fiber)
  goRouter: /\.(GET|POST|PUT|PATCH|DELETE)\s*\(\s*["']([^"']+)["']/,
};

const SPEC_FILES = [
  'openapi.yaml', 'openapi.yml', 'openapi.json',
  'api/openapi.yaml', 'api/openapi.yml', 'api/openapi.json',
  'swagger.yaml', 'swagger.yml', 'swagger.json',
  'api/swagger.yaml', 'api/swagger.yml', 'api/swagger.json',
  'docs/openapi.yaml', 'docs/swagger.yaml',
];

const GRAPHQL_INDICATORS = [
  'schema.graphql', '**/*.graphql', '**/*.gql',
  '**/typeDefs.ts', '**/typeDefs.js',
];

const _TRPC_INDICATORS = [
  '**/trpc.ts', '**/trpc.js',
  '**/*router*.ts', '**/*router*.js',
];

export const apiDetector: Detector<ApiInfo> = {
  name: 'api',

  async detect(ctx: DetectorContext): Promise<ApiInfo> {
    const styles = new Set<string>();
    let specFile: string | undefined;
    const endpoints: EndpointSummary[] = [];

    // ── Check for OpenAPI/Swagger spec ──
    for (const spec of SPEC_FILES) {
      if (await ctx.fileExists(spec)) {
        specFile = spec;
        styles.add('rest');
        break;
      }
    }

    // ── Check for GraphQL ──
    const gqlFiles = await ctx.findFiles(GRAPHQL_INDICATORS);
    if (gqlFiles.length > 0) {
      styles.add('graphql');
    }
    // Also check for graphql dependencies
    const gqlDeps = await ctx.grep(
      /["'](?:graphql|@apollo\/server|apollo-server|type-graphql|@graphql-yoga|mercurius)["']/,
      ['**/package.json'],
    );
    if (gqlDeps.length > 0) {
      styles.add('graphql');
    }

    // ── Check for tRPC ──
    const trpcDeps = await ctx.grep(
      /["']@trpc\//,
      ['**/package.json'],
    );
    if (trpcDeps.length > 0) {
      styles.add('trpc');
    }

    // ── Detect REST route definitions ──
    const sourceGlobs = [
      '**/*.ts', '**/*.js', '**/*.py', '**/*.go',
      '**/*.java', '**/*.rb',
    ];

    // Express-style routes
    const expressMatches = await ctx.grep(
      ROUTE_PATTERNS.expressApp,
      sourceGlobs,
      {maxMatches: 500},
    );
    for (const m of expressMatches) {
      const parts = m.content.match(ROUTE_PATTERNS.expressApp);
      if (parts) {
        styles.add('rest');
        endpoints.push({
          method: parts[1].toUpperCase(),
          path: parts[2],
          file: m.file,
          line: m.line,
        });
      }
    }

    // NestJS decorators
    const nestMatches = await ctx.grep(
      ROUTE_PATTERNS.nestDecorator,
      sourceGlobs,
      {maxMatches: 500},
    );
    for (const m of nestMatches) {
      const parts = m.content.match(ROUTE_PATTERNS.nestDecorator);
      if (parts) {
        styles.add('rest');
        endpoints.push({
          method: parts[1].toUpperCase(),
          path: parts[2] || '/',
          file: m.file,
          line: m.line,
        });
      }
    }

    // Go routes
    const goMatches = await ctx.grep(
      ROUTE_PATTERNS.goRouter,
      ['**/*.go'],
      {maxMatches: 500},
    );
    for (const m of goMatches) {
      const parts = m.content.match(ROUTE_PATTERNS.goRouter);
      if (parts) {
        styles.add('rest');
        endpoints.push({
          method: parts[1].toUpperCase(),
          path: parts[2],
          file: m.file,
          line: m.line,
        });
      }
    }

    if (styles.size === 0) {
      styles.add('unknown');
    }

    return {
      styles: [...styles],
      specFile,
      routeCount: endpoints.length,
      endpoints,
    };
  },
};
