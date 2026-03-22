import {afterEach, describe, expect, it} from 'vitest';
import {
  createServer,
  stopServer,
  type ServerContext,
} from '../core.js';
import {createScanRoutes, createScanStore, type ScanStore} from '../routes/scan.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function request(
  port: number,
  method: string,
  path: string,
  body?: string,
  headers?: Record<string, string>,
): Promise<{status: number; json: Record<string, unknown>}> {
  const url = `http://127.0.0.1:${port}${path}`;
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

describe('scan routes', () => {
  let ctx: ServerContext;
  let store: ScanStore;
  let portCounter = 19100;

  afterEach(async () => {
    if (ctx) {
      await stopServer(ctx);
    }
  });

  async function startWithScanRoutes(port: number): Promise<void> {
    store = createScanStore();
    const routes = createScanRoutes(store);
    ctx = await createServer({port}, routes);
  }

  it('POST /api/scan creates a queued scan', async () => {
    const port = portCounter++;
    await startWithScanRoutes(port);

    const {status, json} = await request(
      port,
      'POST',
      '/api/scan',
      JSON.stringify({target: '/path/to/project'}),
    );

    expect(status).toBe(202);
    expect(json.status).toBe('queued');
    expect(typeof json.scanId).toBe('string');
  });

  it('POST /api/scan with config passes through', async () => {
    const port = portCounter++;
    await startWithScanRoutes(port);

    const {status, json} = await request(
      port,
      'POST',
      '/api/scan',
      JSON.stringify({
        target: '/my/project',
        config: {categories: ['auth'], minSeverity: 'high'},
      }),
    );

    expect(status).toBe(202);
    expect(typeof json.scanId).toBe('string');
  });

  it('POST /api/scan rejects missing target', async () => {
    const port = portCounter++;
    await startWithScanRoutes(port);

    const {status, json} = await request(
      port,
      'POST',
      '/api/scan',
      JSON.stringify({}),
    );

    expect(status).toBe(400);
    expect(json.error).toContain('target');
  });

  it('POST /api/scan rejects empty target', async () => {
    const port = portCounter++;
    await startWithScanRoutes(port);

    const {status, json} = await request(
      port,
      'POST',
      '/api/scan',
      JSON.stringify({target: ''}),
    );

    expect(status).toBe(400);
    expect(json.error).toBeDefined();
  });

  it('GET /api/scan/:id returns queued scan', async () => {
    const port = portCounter++;
    await startWithScanRoutes(port);

    // Create a scan first
    const createRes = await request(
      port,
      'POST',
      '/api/scan',
      JSON.stringify({target: '/test/dir'}),
    );
    const scanId = createRes.json.scanId as string;

    // Retrieve it
    const {status, json} = await request(port, 'GET', `/api/scan/${scanId}`);
    expect(status).toBe(200);
    expect(json.scanId).toBe(scanId);
    expect(['queued', 'running', 'completed']).toContain(json.status);
    expect(json.target).toBe('/test/dir');
  });

  it('GET /api/scan/:id returns 404 for unknown scan', async () => {
    const port = portCounter++;
    await startWithScanRoutes(port);

    const {status, json} = await request(
      port,
      'GET',
      '/api/scan/nonexistent-id',
    );
    expect(status).toBe(404);
    expect(json.error).toContain('not found');
  });

  it('scan eventually completes', async () => {
    const port = portCounter++;
    await startWithScanRoutes(port);

    const createRes = await request(
      port,
      'POST',
      '/api/scan',
      JSON.stringify({target: '/test/project'}),
    );
    const scanId = createRes.json.scanId as string;

    // Wait a bit for the async scan to complete.
    await new Promise((resolve) => setTimeout(resolve, 100));

    const {status, json} = await request(port, 'GET', `/api/scan/${scanId}`);
    expect(status).toBe(200);
    expect(json.status).toBe('completed');
    expect(json.result).toBeDefined();
    const result = json.result as Record<string, unknown>;
    expect(result.target).toBe('/test/project');
    expect(typeof result.durationMs).toBe('number');
  });

  it('POST /api/scan rejects invalid target pattern', async () => {
    const port = portCounter++;
    await startWithScanRoutes(port);

    const {status, json} = await request(
      port,
      'POST',
      '/api/scan',
      JSON.stringify({target: '<script>alert(1)</script>'}),
    );

    expect(status).toBe(400);
    expect(json.error).toBeDefined();
  });
});

describe('scan store', () => {
  it('stores and retrieves scan records', () => {
    const store = createScanStore();
    const now = new Date().toISOString();

    store.set('scan-1', {
      scanId: 'scan-1',
      status: 'queued',
      target: '/test',
      createdAt: now,
      updatedAt: now,
    });

    expect(store.get('scan-1')?.target).toBe('/test');
    expect(store.get('nonexistent')).toBeUndefined();
  });

  it('lists all scans', () => {
    const store = createScanStore();
    const now = new Date().toISOString();

    store.set('scan-1', {
      scanId: 'scan-1',
      status: 'queued',
      target: '/a',
      createdAt: now,
      updatedAt: now,
    });
    store.set('scan-2', {
      scanId: 'scan-2',
      status: 'completed',
      target: '/b',
      createdAt: now,
      updatedAt: now,
    });

    expect(store.list()).toHaveLength(2);
  });

  it('clears all scans', () => {
    const store = createScanStore();
    const now = new Date().toISOString();

    store.set('scan-1', {
      scanId: 'scan-1',
      status: 'queued',
      target: '/a',
      createdAt: now,
      updatedAt: now,
    });

    store.clear();
    expect(store.list()).toHaveLength(0);
  });
});
