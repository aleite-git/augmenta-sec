/**
 * REST API module (ASEC-086).
 *
 * Provides a lightweight HTTP server for findings, scans, and reviews.
 *
 * Routes:
 *   GET  /api/findings        — list findings (with query filters)
 *   GET  /api/findings/:id    — single finding by ID
 *   POST /api/scan            — trigger a scan (returns job ID)
 *   GET  /api/scan/:jobId     — poll scan job status
 *   POST /api/review          — submit a manual review
 *   GET  /health              — health check
 */

import {createServer, IncomingMessage, ServerResponse} from 'node:http';
import {randomUUID} from 'node:crypto';
import type {Finding, FindingStatus, Severity} from '../findings/types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ScanJobStatus = 'queued' | 'running' | 'completed' | 'failed';

export interface ScanJob {
  jobId: string;
  status: ScanJobStatus;
  target?: string;
  createdAt: string;
  completedAt?: string;
  findingsCount?: number;
  error?: string;
}

export interface ReviewPayload {
  findingId: string;
  status: FindingStatus;
  comment?: string;
  reviewer: string;
}

export interface ReviewResult {
  findingId: string;
  previousStatus: FindingStatus;
  newStatus: FindingStatus;
  reviewer: string;
  reviewedAt: string;
}

export interface FindingsFilter {
  severity?: Severity;
  status?: FindingStatus;
  category?: string;
  scanner?: string;
  limit?: number;
  offset?: number;
}

export interface ApiResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}

export type RouteHandler = (
  req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
) => Promise<void>;

export interface Route {
  method: string;
  pattern: RegExp;
  paramNames: string[];
  handler: RouteHandler;
}

// ---------------------------------------------------------------------------
// In-memory stores (production would use a persistent backend)
// ---------------------------------------------------------------------------

const findings = new Map<string, Finding>();
const scanJobs = new Map<string, ScanJob>();

// ---------------------------------------------------------------------------
// Store accessors (exposed for testing)
// ---------------------------------------------------------------------------

export function getFindingsStore(): Map<string, Finding> {
  return findings;
}

export function getScanJobsStore(): Map<string, ScanJob> {
  return scanJobs;
}

export function clearStores(): void {
  findings.clear();
  scanJobs.clear();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sendJson<T>(res: ServerResponse, status: number, body: ApiResponse<T>): void {
  res.writeHead(status, {'Content-Type': 'application/json'});
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

function parseQuery(url: string): Record<string, string> {
  const idx = url.indexOf('?');
  if (idx === -1) return {};
  const params: Record<string, string> = {};
  const qs = url.slice(idx + 1);
  for (const pair of qs.split('&')) {
    const [key, val] = pair.split('=');
    if (key) {
      params[decodeURIComponent(key)] = decodeURIComponent(val ?? '');
    }
  }
  return params;
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

/** GET /api/findings — list with optional filters. */
async function listFindings(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const query = parseQuery(req.url ?? '');
  let result = Array.from(findings.values());

  if (query.severity) {
    result = result.filter(f => f.severity === query.severity);
  }
  if (query.status) {
    result = result.filter(f => f.status === query.status);
  }
  if (query.category) {
    result = result.filter(f => f.category === query.category);
  }
  if (query.scanner) {
    result = result.filter(f => f.scanner === query.scanner);
  }

  const offset = parseInt(query.offset ?? '0', 10) || 0;
  const limit = parseInt(query.limit ?? '100', 10) || 100;
  const paginated = result.slice(offset, offset + limit);

  sendJson(res, 200, {
    ok: true,
    data: {
      findings: paginated,
      total: result.length,
      offset,
      limit,
    },
  });
}

/** GET /api/findings/:id — single finding. */
async function getFinding(
  _req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
): Promise<void> {
  const finding = findings.get(params.id);
  if (!finding) {
    sendJson(res, 404, {ok: false, error: `Finding ${params.id} not found`});
    return;
  }
  sendJson(res, 200, {ok: true, data: finding});
}

/** POST /api/scan — start a new scan job. */
async function startScan(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  let body: {target?: string} = {};
  try {
    const raw = await readBody(req);
    if (raw.trim()) {
      body = JSON.parse(raw);
    }
  } catch {
    sendJson(res, 400, {ok: false, error: 'Invalid JSON body'});
    return;
  }

  const job: ScanJob = {
    jobId: randomUUID(),
    status: 'queued',
    target: body.target,
    createdAt: new Date().toISOString(),
  };

  scanJobs.set(job.jobId, job);
  sendJson(res, 201, {ok: true, data: job});
}

/** GET /api/scan/:jobId — poll scan job status. */
async function getScanStatus(
  _req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
): Promise<void> {
  const job = scanJobs.get(params.jobId);
  if (!job) {
    sendJson(res, 404, {ok: false, error: `Scan job ${params.jobId} not found`});
    return;
  }
  sendJson(res, 200, {ok: true, data: job});
}

/** POST /api/review — submit a review for a finding. */
async function submitReview(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  let body: ReviewPayload;
  try {
    const raw = await readBody(req);
    body = JSON.parse(raw);
  } catch {
    sendJson(res, 400, {ok: false, error: 'Invalid JSON body'});
    return;
  }

  if (!body.findingId || !body.status || !body.reviewer) {
    sendJson(res, 400, {
      ok: false,
      error: 'Missing required fields: findingId, status, reviewer',
    });
    return;
  }

  const validStatuses: FindingStatus[] = [
    'open',
    'confirmed',
    'false-positive',
    'accepted-risk',
    'fixed',
  ];
  if (!validStatuses.includes(body.status)) {
    sendJson(res, 400, {
      ok: false,
      error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
    });
    return;
  }

  const finding = findings.get(body.findingId);
  if (!finding) {
    sendJson(res, 404, {
      ok: false,
      error: `Finding ${body.findingId} not found`,
    });
    return;
  }

  const previousStatus = finding.status;
  finding.status = body.status;

  const result: ReviewResult = {
    findingId: finding.id,
    previousStatus,
    newStatus: body.status,
    reviewer: body.reviewer,
    reviewedAt: new Date().toISOString(),
  };

  sendJson(res, 200, {ok: true, data: result});
}

/** GET /health — health check. */
async function healthCheck(
  _req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  sendJson(res, 200, {ok: true, data: {status: 'healthy'}});
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

const routes: Route[] = [
  {
    method: 'GET',
    pattern: /^\/api\/findings$/,
    paramNames: [],
    handler: listFindings,
  },
  {
    method: 'GET',
    pattern: /^\/api\/findings\/([^/]+)$/,
    paramNames: ['id'],
    handler: getFinding,
  },
  {
    method: 'POST',
    pattern: /^\/api\/scan$/,
    paramNames: [],
    handler: startScan,
  },
  {
    method: 'GET',
    pattern: /^\/api\/scan\/([^/]+)$/,
    paramNames: ['jobId'],
    handler: getScanStatus,
  },
  {
    method: 'POST',
    pattern: /^\/api\/review$/,
    paramNames: [],
    handler: submitReview,
  },
  {
    method: 'GET',
    pattern: /^\/health$/,
    paramNames: [],
    handler: healthCheck,
  },
];

/** Matches a request to a registered route. */
export function matchRoute(
  method: string,
  url: string,
): {handler: RouteHandler; params: Record<string, string>} | null {
  const pathname = url.split('?')[0];
  for (const route of routes) {
    if (route.method !== method) continue;
    const match = pathname.match(route.pattern);
    if (!match) continue;
    const params: Record<string, string> = {};
    for (let i = 0; i < route.paramNames.length; i++) {
      params[route.paramNames[i]] = match[i + 1];
    }
    return {handler: route.handler, params};
  }
  return null;
}

// ---------------------------------------------------------------------------
// Server factory
// ---------------------------------------------------------------------------

export interface ApiServerOptions {
  port?: number;
}

export interface ApiServer {
  listen(): Promise<void>;
  close(): Promise<void>;
  port: number;
  /** The underlying HTTP server, exposed for testing. */
  server: ReturnType<typeof createServer>;
}

/**
 * Creates and returns an API server instance.
 *
 * @param options - Server configuration.
 * @returns An {@link ApiServer} that can be started and stopped.
 */
export function createApiServer(options: ApiServerOptions = {}): ApiServer {
  const port = options.port ?? 3000;

  const server = createServer(async (req, res) => {
    const method = req.method ?? 'GET';
    const url = req.url ?? '/';

    const matched = matchRoute(method, url);
    if (!matched) {
      sendJson(res, 404, {ok: false, error: 'Not found'});
      return;
    }

    try {
      await matched.handler(req, res, matched.params);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Internal server error';
      sendJson(res, 500, {ok: false, error: message});
    }
  });

  return {
    port,
    server,
    listen() {
      return new Promise<void>((resolve, reject) => {
        server.on('error', reject);
        server.listen(port, () => resolve());
      });
    },
    close() {
      return new Promise<void>((resolve, reject) => {
        server.close(err => (err ? reject(err) : resolve()));
      });
    },
  };
}
