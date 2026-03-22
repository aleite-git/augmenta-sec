/**
 * HTTP server core for AugmentaSec server mode.
 *
 * Built on Node.js native `http` module. Provides:
 * - JSON request/response handling
 * - API key authentication middleware
 * - Health check endpoint
 * - Pluggable route registration
 *
 * @module ASEC-080
 */

import {
  createServer as nodeCreateServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface ServerConfig {
  port: number;
  host?: string;
  apiKey?: string;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RouteHandler = (
  req: IncomingMessage,
  res: ServerResponse,
  params: RouteParams,
) => Promise<void> | void;

export interface RouteParams {
  pathParams: Record<string, string>;
  query: URLSearchParams;
  body: unknown;
}

export interface Route {
  method: string;
  pattern: string;
  handler: RouteHandler;
}

export interface ServerContext {
  server: Server;
  config: ServerConfig;
  startTime: number;
  routes: Route[];
}

// ---------------------------------------------------------------------------
// Body reader
// ---------------------------------------------------------------------------

const MAX_BODY_SIZE = 1024 * 1024; // 1 MB

export function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_SIZE) {
        req.destroy();
        reject(new Error('Request body too large'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

// ---------------------------------------------------------------------------
// JSON helpers
// ---------------------------------------------------------------------------

export function jsonResponse(
  res: ServerResponse,
  statusCode: number,
  body: unknown,
): void {
  const json = JSON.stringify(body);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(json),
  });
  res.end(json);
}

export function errorResponse(
  res: ServerResponse,
  statusCode: number,
  message: string,
): void {
  jsonResponse(res, statusCode, {error: message});
}

// ---------------------------------------------------------------------------
// Route matching
// ---------------------------------------------------------------------------

/**
 * Matches a URL path against a route pattern with `:param` segments.
 * Returns extracted params or `null` if no match.
 */
export function matchRoute(
  pattern: string,
  path: string,
): Record<string, string> | null {
  const patternParts = pattern.split('/').filter(Boolean);
  const pathParts = path.split('/').filter(Boolean);

  if (patternParts.length !== pathParts.length) {
    return null;
  }

  const params: Record<string, string> = {};
  for (let i = 0; i < patternParts.length; i++) {
    const patternPart = patternParts[i];
    const pathPart = pathParts[i];

    if (patternPart.startsWith(':')) {
      params[patternPart.slice(1)] = decodeURIComponent(pathPart);
    } else if (patternPart !== pathPart) {
      return null;
    }
  }

  return params;
}

// ---------------------------------------------------------------------------
// Authentication middleware
// ---------------------------------------------------------------------------

function checkAuth(
  req: IncomingMessage,
  config: ServerConfig,
): {authorized: boolean; message?: string} {
  if (!config.apiKey) {
    return {authorized: true};
  }

  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    return {authorized: false, message: 'Missing Authorization header'};
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return {authorized: false, message: 'Invalid Authorization format'};
  }

  if (parts[1] !== config.apiKey) {
    return {authorized: false, message: 'Invalid API key'};
  }

  return {authorized: true};
}

// ---------------------------------------------------------------------------
// Request handler
// ---------------------------------------------------------------------------

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: ServerContext,
): Promise<void> {
  const url = new URL(
    req.url ?? '/',
    `http://${req.headers.host ?? 'localhost'}`,
  );
  const method = (req.method ?? 'GET').toUpperCase();
  const path = url.pathname;

  // Health check does not require auth
  if (method === 'GET' && path === '/health') {
    const uptimeMs = Date.now() - ctx.startTime;
    jsonResponse(res, 200, {
      status: 'ok',
      uptime: Math.floor(uptimeMs / 1000),
    });
    return;
  }

  // Auth check for all other routes
  const authResult = checkAuth(req, ctx.config);
  if (!authResult.authorized) {
    errorResponse(res, 401, authResult.message ?? 'Unauthorized');
    return;
  }

  // Match routes
  for (const route of ctx.routes) {
    if (route.method !== method) continue;

    const pathParams = matchRoute(route.pattern, path);
    if (pathParams === null) continue;

    // Parse body for POST/PUT/PATCH
    let body: unknown = undefined;
    if (['POST', 'PUT', 'PATCH'].includes(method)) {
      const raw = await readBody(req);
      if (raw.length > 0) {
        try {
          body = JSON.parse(raw);
        } catch {
          errorResponse(res, 400, 'Invalid JSON in request body');
          return;
        }
      }
    }

    const params: RouteParams = {
      pathParams,
      query: url.searchParams,
      body,
    };

    await route.handler(req, res, params);
    return;
  }

  // No route matched
  errorResponse(res, 404, `Not found: ${method} ${path}`);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Creates and starts an HTTP server with the given configuration.
 *
 * @param config Server configuration (port, host, apiKey).
 * @param routes Array of route definitions.
 * @returns A promise resolving to the {@link ServerContext}.
 */
export function createServer(
  config: ServerConfig,
  routes: Route[] = [],
): Promise<ServerContext> {
  const startTime = Date.now();
  const ctx: ServerContext = {
    server: null as unknown as Server,
    config,
    startTime,
    routes,
  };

  const server = nodeCreateServer((req, res) => {
    handleRequest(req, res, ctx).catch((err: unknown) => {
      console.error('[server] unhandled error:', err);
      if (!res.headersSent) {
        errorResponse(res, 500, 'Internal server error');
      }
    });
  });

  ctx.server = server;

  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(config.port, config.host ?? '127.0.0.1', () => {
      resolve(ctx);
    });
  });
}

/**
 * Gracefully stops the server.
 */
export function stopServer(ctx: ServerContext): Promise<void> {
  return new Promise((resolve, reject) => {
    ctx.server.close((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}
