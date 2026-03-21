import {createHmac} from 'node:crypto';
import {afterEach, describe, expect, it} from 'vitest';
import {startServer, stopServer, type DaemonContext} from '../daemon.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function signGitHub(body: string, secret: string): string {
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
}

async function request(
  port: number,
  method: string,
  path: string,
  body?: string,
  headers?: Record<string, string>,
): Promise<{status: number; json: Record<string, unknown>}> {
  const url = `http://localhost:${port}${path}`;
  const res = await fetch(url, {
    method,
    headers: {'Content-Type': 'application/json', ...headers},
    body,
  });
  const json = (await res.json()) as Record<string, unknown>;
  return {status: res.status, json};
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('daemon server', () => {
  let ctx: DaemonContext;
  let port: number;

  let portCounter = 18400;

  afterEach(async () => {
    if (ctx) {
      await stopServer(ctx);
    }
  });

  async function start(overrides?: {
    githubWebhookSecret?: string;
    gitlabWebhookSecret?: string;
  }) {
    port = portCounter++;
    ctx = await startServer(
      {
        dbPath: ':memory:',
        version: '0.1.0-test',
        ...overrides,
      },
      port,
    );
  }

  // --- GET /health ---

  it('GET /health returns status, uptime, version', async () => {
    await start();
    const {status, json} = await request(port, 'GET', '/health');
    expect(status).toBe(200);
    expect(json.status).toBe('ok');
    expect(json.version).toBe('0.1.0-test');
    expect(typeof json.uptime).toBe('number');
  });

  // --- GET /status ---

  it('GET /status returns lastScanTime, findingsCount, scheduledJobs', async () => {
    await start();
    const {status, json} = await request(port, 'GET', '/status');
    expect(status).toBe(200);
    expect(json.lastScanTime).toBeNull();
    expect(json.findingsCount).toBe(0);
    expect(json.scheduledJobs).toBe(0);
  });

  // --- POST /api/scan ---

  it('POST /api/scan enqueues a scan', async () => {
    await start();
    const {status, json} = await request(
      port,
      'POST',
      '/api/scan',
      JSON.stringify({repo: 'org/repo', ref: 'main'}),
    );
    expect(status).toBe(202);
    expect(json.repo).toBe('org/repo');
    expect(json.ref).toBe('main');
    expect(json.trigger).toBe('api');
    expect(json.status).toBe('pending');
  });

  it('POST /api/scan defaults ref to HEAD', async () => {
    await start();
    const {status, json} = await request(
      port,
      'POST',
      '/api/scan',
      JSON.stringify({repo: 'org/repo'}),
    );
    expect(status).toBe(202);
    expect(json.ref).toBe('HEAD');
  });

  it('POST /api/scan rejects missing repo', async () => {
    await start();
    const {status, json} = await request(
      port,
      'POST',
      '/api/scan',
      JSON.stringify({}),
    );
    expect(status).toBe(400);
    expect(json.error).toContain('repo');
  });

  it('POST /api/scan rejects invalid JSON', async () => {
    await start();
    const {status, json} = await request(
      port,
      'POST',
      '/api/scan',
      'not-json',
    );
    expect(status).toBe(400);
    expect(json.error).toContain('repo');
  });

  // --- POST /api/review ---

  it('POST /api/review enqueues a review', async () => {
    await start();
    const {status, json} = await request(
      port,
      'POST',
      '/api/review',
      JSON.stringify({repo: 'org/repo', ref: 'feat/x'}),
    );
    expect(status).toBe(202);
    expect(json.trigger).toBe('review');
  });

  it('POST /api/review rejects missing repo', async () => {
    await start();
    const {status} = await request(
      port,
      'POST',
      '/api/review',
      JSON.stringify({ref: 'main'}),
    );
    expect(status).toBe(400);
  });

  // --- GET /api/findings ---

  it('GET /api/findings returns history and totalFindings', async () => {
    await start();
    const {status, json} = await request(port, 'GET', '/api/findings');
    expect(status).toBe(200);
    expect(json.history).toEqual([]);
    expect(json.totalFindings).toBe(0);
  });

  it('GET /api/findings respects limit query param', async () => {
    await start();
    ctx.store.recordScan('repo', 'main', 1, 100, 'completed');
    ctx.store.recordScan('repo', 'dev', 2, 200, 'completed');
    ctx.store.recordScan('repo', 'feat', 3, 300, 'completed');

    const {json} = await request(port, 'GET', '/api/findings?limit=2');
    const history = json.history as unknown[];
    expect(history).toHaveLength(2);
    expect(json.totalFindings).toBe(6);
  });

  // --- POST /webhooks/github ---

  it('POST /webhooks/github returns 503 when secret not configured', async () => {
    await start();
    const {status, json} = await request(
      port,
      'POST',
      '/webhooks/github',
      '{}',
    );
    expect(status).toBe(503);
    expect(json.error).toContain('not configured');
  });

  it('POST /webhooks/github processes a valid push', async () => {
    await start({githubWebhookSecret: 'gh-secret'});
    const body = JSON.stringify({
      ref: 'refs/heads/main',
      repository: {full_name: 'org/repo'},
    });
    const sig = signGitHub(body, 'gh-secret');
    const {status, json} = await request(port, 'POST', '/webhooks/github', body, {
      'x-hub-signature-256': sig,
      'x-github-event': 'push',
    });
    expect(status).toBe(200);
    expect(json.action).toBe('scan');

    const logs = ctx.store.listWebhookLogs();
    expect(logs).toHaveLength(1);
    const queue = ctx.store.listScanQueue();
    expect(queue).toHaveLength(1);
  });

  it('POST /webhooks/github returns 401 on bad signature', async () => {
    await start({githubWebhookSecret: 'gh-secret'});
    const {status, json} = await request(
      port,
      'POST',
      '/webhooks/github',
      '{"ref":"main"}',
      {
        'x-hub-signature-256': 'sha256=bad',
        'x-github-event': 'push',
      },
    );
    expect(status).toBe(401);
    expect(json.error).toContain('Invalid');
  });

  // --- POST /webhooks/gitlab ---

  it('POST /webhooks/gitlab returns 503 when secret not configured', async () => {
    await start();
    const {status} = await request(
      port,
      'POST',
      '/webhooks/gitlab',
      '{}',
    );
    expect(status).toBe(503);
  });

  it('POST /webhooks/gitlab processes a valid push', async () => {
    await start({gitlabWebhookSecret: 'gl-secret'});
    const body = JSON.stringify({
      object_kind: 'push',
      ref: 'refs/heads/main',
      project: {path_with_namespace: 'group/project'},
    });
    const {status, json} = await request(
      port,
      'POST',
      '/webhooks/gitlab',
      body,
      {'x-gitlab-token': 'gl-secret'},
    );
    expect(status).toBe(200);
    expect(json.action).toBe('scan');
  });

  it('POST /webhooks/gitlab returns 401 on bad token', async () => {
    await start({gitlabWebhookSecret: 'gl-secret'});
    const {status} = await request(
      port,
      'POST',
      '/webhooks/gitlab',
      '{}',
      {'x-gitlab-token': 'wrong'},
    );
    expect(status).toBe(401);
  });

  // --- 404 ---

  it('returns 404 for unknown routes', async () => {
    await start();
    const {status, json} = await request(port, 'GET', '/nonexistent');
    expect(status).toBe(404);
    expect(json.error).toContain('Not found');
  });

  it('returns 404 for wrong method on known routes', async () => {
    await start();
    const {status} = await request(port, 'POST', '/health');
    expect(status).toBe(404);
  });
});
