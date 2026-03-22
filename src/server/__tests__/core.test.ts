import {afterEach, describe, expect, it} from 'vitest';
import {
  createServer,
  stopServer,
  matchRoute,
  type ServerContext,
  type Route,
} from '../core.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function request(
  port: number,
  method: string,
  path: string,
  body?: string,
  headers?: Record<string, string>,
): Promise<{status: number; json: Record<string, unknown>; headers: Headers}> {
  const url = `http://127.0.0.1:${port}${path}`;
  const res = await fetch(url, {
    method,
    headers: {'Content-Type': 'application/json', ...headers},
    body,
  });
  const json = (await res.json()) as Record<string, unknown>;
  return {status: res.status, json, headers: res.headers};
}

// ---------------------------------------------------------------------------
// matchRoute unit tests
// ---------------------------------------------------------------------------

describe('matchRoute', () => {
  it('matches exact paths', () => {
    expect(matchRoute('/api/scan', '/api/scan')).toEqual({});
  });

  it('returns null for non-matching paths', () => {
    expect(matchRoute('/api/scan', '/api/profile')).toBeNull();
  });

  it('extracts path parameters', () => {
    expect(matchRoute('/api/scan/:id', '/api/scan/abc-123')).toEqual({
      id: 'abc-123',
    });
  });

  it('extracts multiple path parameters', () => {
    expect(
      matchRoute('/api/:type/:id', '/api/scan/xyz'),
    ).toEqual({type: 'scan', id: 'xyz'});
  });

  it('returns null for different segment counts', () => {
    expect(matchRoute('/api/scan/:id', '/api/scan')).toBeNull();
    expect(matchRoute('/api/scan', '/api/scan/extra')).toBeNull();
  });

  it('decodes URI components in path params', () => {
    expect(matchRoute('/api/:name', '/api/hello%20world')).toEqual({
      name: 'hello world',
    });
  });
});

// ---------------------------------------------------------------------------
// Server integration tests
// ---------------------------------------------------------------------------

describe('core server', () => {
  let ctx: ServerContext;
  let portCounter = 19000;

  afterEach(async () => {
    if (ctx) {
      await stopServer(ctx);
    }
  });

  it('GET /health returns status and uptime without auth', async () => {
    const port = portCounter++;
    ctx = await createServer({port, apiKey: 'test-key'});
    const {status, json} = await request(port, 'GET', '/health');
    expect(status).toBe(200);
    expect(json.status).toBe('ok');
    expect(typeof json.uptime).toBe('number');
  });

  it('returns 401 for missing auth on protected routes', async () => {
    const port = portCounter++;
    const routes: Route[] = [
      {
        method: 'GET',
        pattern: '/api/test',
        handler(_req, res) {
          res.writeHead(200, {'Content-Type': 'application/json'});
          res.end(JSON.stringify({ok: true}));
        },
      },
    ];
    ctx = await createServer({port, apiKey: 'secret-key'}, routes);
    const {status, json} = await request(port, 'GET', '/api/test');
    expect(status).toBe(401);
    expect(json.error).toContain('Authorization');
  });

  it('returns 401 for invalid API key', async () => {
    const port = portCounter++;
    const routes: Route[] = [
      {
        method: 'GET',
        pattern: '/api/test',
        handler(_req, res) {
          res.writeHead(200, {'Content-Type': 'application/json'});
          res.end(JSON.stringify({ok: true}));
        },
      },
    ];
    ctx = await createServer({port, apiKey: 'secret-key'}, routes);
    const {status, json} = await request(port, 'GET', '/api/test', undefined, {
      Authorization: 'Bearer wrong-key',
    });
    expect(status).toBe(401);
    expect(json.error).toContain('Invalid API key');
  });

  it('allows access with valid API key', async () => {
    const port = portCounter++;
    const routes: Route[] = [
      {
        method: 'GET',
        pattern: '/api/test',
        handler(_req, res) {
          res.writeHead(200, {'Content-Type': 'application/json'});
          res.end(JSON.stringify({ok: true}));
        },
      },
    ];
    ctx = await createServer({port, apiKey: 'secret-key'}, routes);
    const {status, json} = await request(port, 'GET', '/api/test', undefined, {
      Authorization: 'Bearer secret-key',
    });
    expect(status).toBe(200);
    expect(json.ok).toBe(true);
  });

  it('skips auth when no apiKey is configured', async () => {
    const port = portCounter++;
    const routes: Route[] = [
      {
        method: 'GET',
        pattern: '/api/test',
        handler(_req, res) {
          res.writeHead(200, {'Content-Type': 'application/json'});
          res.end(JSON.stringify({open: true}));
        },
      },
    ];
    ctx = await createServer({port}, routes);
    const {status, json} = await request(port, 'GET', '/api/test');
    expect(status).toBe(200);
    expect(json.open).toBe(true);
  });

  it('returns 404 for unknown routes', async () => {
    const port = portCounter++;
    ctx = await createServer({port});
    const {status, json} = await request(port, 'GET', '/nonexistent');
    expect(status).toBe(404);
    expect(json.error).toContain('Not found');
  });

  it('returns 400 for invalid JSON body', async () => {
    const port = portCounter++;
    const routes: Route[] = [
      {
        method: 'POST',
        pattern: '/api/data',
        handler(_req, res) {
          res.writeHead(200, {'Content-Type': 'application/json'});
          res.end(JSON.stringify({ok: true}));
        },
      },
    ];
    ctx = await createServer({port}, routes);
    const {status, json} = await request(
      port,
      'POST',
      '/api/data',
      'not-json',
    );
    expect(status).toBe(400);
    expect(json.error).toContain('Invalid JSON');
  });

  it('returns 401 for invalid Authorization format', async () => {
    const port = portCounter++;
    const routes: Route[] = [
      {
        method: 'GET',
        pattern: '/api/test',
        handler(_req, res) {
          res.writeHead(200, {'Content-Type': 'application/json'});
          res.end(JSON.stringify({ok: true}));
        },
      },
    ];
    ctx = await createServer({port, apiKey: 'key'}, routes);
    const {status, json} = await request(port, 'GET', '/api/test', undefined, {
      Authorization: 'Basic credentials',
    });
    expect(status).toBe(401);
    expect(json.error).toContain('Invalid Authorization format');
  });

  it('routes with path params work correctly', async () => {
    const port = portCounter++;
    const routes: Route[] = [
      {
        method: 'GET',
        pattern: '/api/items/:id',
        handler(_req, res, params) {
          res.writeHead(200, {'Content-Type': 'application/json'});
          res.end(JSON.stringify({id: params.pathParams['id']}));
        },
      },
    ];
    ctx = await createServer({port}, routes);
    const {status, json} = await request(port, 'GET', '/api/items/my-item');
    expect(status).toBe(200);
    expect(json.id).toBe('my-item');
  });

  it('passes parsed body to POST handlers', async () => {
    const port = portCounter++;
    const routes: Route[] = [
      {
        method: 'POST',
        pattern: '/api/echo',
        handler(_req, res, params) {
          res.writeHead(200, {'Content-Type': 'application/json'});
          res.end(JSON.stringify({received: params.body}));
        },
      },
    ];
    ctx = await createServer({port}, routes);
    const {status, json} = await request(
      port,
      'POST',
      '/api/echo',
      JSON.stringify({hello: 'world'}),
    );
    expect(status).toBe(200);
    const received = json.received as Record<string, unknown>;
    expect(received.hello).toBe('world');
  });

  it('handles server errors gracefully', async () => {
    const port = portCounter++;
    const routes: Route[] = [
      {
        method: 'GET',
        pattern: '/api/error',
        handler() {
          throw new Error('Something broke');
        },
      },
    ];
    ctx = await createServer({port}, routes);
    const {status, json} = await request(port, 'GET', '/api/error');
    expect(status).toBe(500);
    expect(json.error).toBe('Internal server error');
  });
});
