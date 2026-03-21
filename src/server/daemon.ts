/**
 * HTTP daemon server for AugmentaSec server mode.
 *
 * Built on Node.js native `http` module.
 *
 * Routes:
 * - GET  /health          -- liveness probe (ASEC-085)
 * - GET  /status          -- operational status (ASEC-085)
 * - POST /api/scan        -- enqueue a scan
 * - POST /api/review      -- enqueue a review
 * - GET  /api/findings    -- list scan history and findings
 * - POST /webhooks/github -- GitHub webhook receiver (ASEC-081)
 * - POST /webhooks/gitlab -- GitLab webhook receiver (ASEC-081)
 *
 * @module ASEC-080
 */

import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import {handleHealth, handleStatus} from './health.js';
import {createStateStore, type StateStore} from './state.js';
import {createScheduler, type Scheduler} from './scheduler.js';
import {handleGitHubWebhook, handleGitLabWebhook} from './webhooks.js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface DaemonConfig {
  /** Path to SQLite database file. Use `:memory:` for ephemeral store. */
  dbPath: string;
  /** Semantic version string reported by /health. */
  version: string;
  /** GitHub webhook secret (optional; webhooks rejected if not set). */
  githubWebhookSecret?: string;
  /** GitLab webhook secret (optional; webhooks rejected if not set). */
  gitlabWebhookSecret?: string;
}

export interface DaemonContext {
  server: Server;
  store: StateStore;
  scheduler: Scheduler;
  startTime: number;
}

// ---------------------------------------------------------------------------
// Body reader
// ---------------------------------------------------------------------------

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

// ---------------------------------------------------------------------------
// JSON helpers
// ---------------------------------------------------------------------------

function jsonResponse(
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

function errorResponse(
  res: ServerResponse,
  statusCode: number,
  message: string,
): void {
  jsonResponse(res, statusCode, {error: message});
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  config: DaemonConfig,
  ctx: DaemonContext,
): Promise<void> {
  const url = new URL(
    req.url ?? '/',
    `http://${req.headers.host ?? 'localhost'}`,
  );
  const method = req.method ?? 'GET';
  const path = url.pathname;

  // --- GET /health ---
  if (method === 'GET' && path === '/health') {
    jsonResponse(res, 200, handleHealth(ctx.startTime, config.version));
    return;
  }

  // --- GET /status ---
  if (method === 'GET' && path === '/status') {
    jsonResponse(res, 200, handleStatus(ctx.store));
    return;
  }

  // --- POST /api/scan ---
  if (method === 'POST' && path === '/api/scan') {
    const body = await readBody(req);
    const parsed = safeParse(body);
    if (!parsed || typeof parsed.repo !== 'string') {
      errorResponse(res, 400, 'Missing required field: repo');
      return;
    }
    const ref = typeof parsed.ref === 'string' ? parsed.ref : 'HEAD';
    const queued = ctx.store.enqueueScan(parsed.repo, ref, 'api');
    jsonResponse(res, 202, queued);
    return;
  }

  // --- POST /api/review ---
  if (method === 'POST' && path === '/api/review') {
    const body = await readBody(req);
    const parsed = safeParse(body);
    if (!parsed || typeof parsed.repo !== 'string') {
      errorResponse(res, 400, 'Missing required field: repo');
      return;
    }
    const ref = typeof parsed.ref === 'string' ? parsed.ref : 'HEAD';
    const queued = ctx.store.enqueueScan(parsed.repo, ref, 'review');
    jsonResponse(res, 202, queued);
    return;
  }

  // --- GET /api/findings ---
  if (method === 'GET' && path === '/api/findings') {
    const limitStr = url.searchParams.get('limit');
    const limit = limitStr ? parseInt(limitStr, 10) : 50;
    const history = ctx.store.listScanHistory(isNaN(limit) ? 50 : limit);
    jsonResponse(res, 200, {
      history,
      totalFindings: ctx.store.totalFindingsCount(),
    });
    return;
  }

  // --- POST /webhooks/github ---
  if (method === 'POST' && path === '/webhooks/github') {
    if (!config.githubWebhookSecret) {
      errorResponse(res, 503, 'GitHub webhook secret not configured');
      return;
    }
    const body = await readBody(req);
    const signature = (req.headers['x-hub-signature-256'] as string) ?? '';
    const event = (req.headers['x-github-event'] as string) ?? '';
    try {
      const result = handleGitHubWebhook(
        body,
        signature,
        config.githubWebhookSecret,
        event,
      );
      ctx.store.logWebhook('github', result.event, body);
      if (result.action === 'scan' || result.action === 'review') {
        ctx.store.enqueueScan(
          result.repo,
          result.ref,
          `github.${result.event}`,
        );
      }
      jsonResponse(res, 200, result);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Webhook verification failed';
      errorResponse(res, 401, message);
    }
    return;
  }

  // --- POST /webhooks/gitlab ---
  if (method === 'POST' && path === '/webhooks/gitlab') {
    if (!config.gitlabWebhookSecret) {
      errorResponse(res, 503, 'GitLab webhook secret not configured');
      return;
    }
    const body = await readBody(req);
    const token = (req.headers['x-gitlab-token'] as string) ?? '';
    try {
      const result = handleGitLabWebhook(
        body,
        token,
        config.gitlabWebhookSecret,
      );
      ctx.store.logWebhook('gitlab', result.event, body);
      if (result.action === 'scan' || result.action === 'review') {
        ctx.store.enqueueScan(
          result.repo,
          result.ref,
          `gitlab.${result.event}`,
        );
      }
      jsonResponse(res, 200, result);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Webhook verification failed';
      errorResponse(res, 401, message);
    }
    return;
  }

  // --- 404 ---
  errorResponse(res, 404, `Not found: ${method} ${path}`);
}

function safeParse(body: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(body);
    if (typeof parsed === 'object' && parsed !== null) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Starts the AugmentaSec HTTP daemon.
 *
 * @param config Daemon configuration.
 * @param port   TCP port to listen on (default `7400`).
 * @returns A promise that resolves with the running {@link DaemonContext}.
 */
export function startServer(
  config: DaemonConfig,
  port = 7400,
): Promise<DaemonContext> {
  const startTime = Date.now();
  const store = createStateStore(config.dbPath);
  const scheduler = createScheduler();

  const server = createServer((req, res) => {
    handleRequest(req, res, config, ctx).catch((err) => {
      console.error('[server] unhandled error:', err);
      if (!res.headersSent) {
        errorResponse(res, 500, 'Internal server error');
      }
    });
  });

  const ctx: DaemonContext = {server, store, scheduler, startTime};

  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(port, () => {
      resolve(ctx);
    });
  });
}

/**
 * Gracefully shuts down the server, scheduler, and state store.
 */
export async function stopServer(ctx: DaemonContext): Promise<void> {
  ctx.scheduler.stop();
  await new Promise<void>((resolve, reject) => {
    ctx.server.close((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
  ctx.store.close();
}
