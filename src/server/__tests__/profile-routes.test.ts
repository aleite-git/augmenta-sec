import {afterEach, describe, expect, it} from 'vitest';
import {
  createServer,
  stopServer,
  type ServerContext,
} from '../core.js';
import {
  createProfileRoutes,
  createProfileStore,
  type ProfileStore,
} from '../routes/profile.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function request(
  port: number,
  method: string,
  path: string,
  body?: string,
): Promise<{status: number; json: Record<string, unknown>}> {
  const url = `http://127.0.0.1:${port}${path}`;
  const res = await fetch(url, {
    method,
    headers: {'Content-Type': 'application/json'},
    body,
  });
  const json = (await res.json()) as Record<string, unknown>;
  return {status: res.status, json};
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('profile routes', () => {
  let ctx: ServerContext;
  let store: ProfileStore;
  let portCounter = 19200;

  afterEach(async () => {
    if (ctx) {
      await stopServer(ctx);
    }
  });

  async function startWithProfileRoutes(port: number): Promise<void> {
    store = createProfileStore();
    const routes = createProfileRoutes(store);
    ctx = await createServer({port}, routes);
  }

  it('POST /api/profile runs discovery and returns profile', async () => {
    const port = portCounter++;
    await startWithProfileRoutes(port);

    const {status, json} = await request(
      port,
      'POST',
      '/api/profile',
      JSON.stringify({target: '/path/to/project'}),
    );

    expect(status).toBe(200);
    expect(typeof json.profileId).toBe('string');
    expect(json.profile).toBeDefined();
    expect(json.cached).toBe(false);
  });

  it('POST /api/profile returns cached profile on second call', async () => {
    const port = portCounter++;
    await startWithProfileRoutes(port);

    // First call
    const first = await request(
      port,
      'POST',
      '/api/profile',
      JSON.stringify({target: '/same/project'}),
    );
    expect(first.json.cached).toBe(false);

    // Second call with same target
    const second = await request(
      port,
      'POST',
      '/api/profile',
      JSON.stringify({target: '/same/project'}),
    );
    expect(second.json.cached).toBe(true);
    expect(second.json.profileId).toBe(first.json.profileId);
  });

  it('POST /api/profile rejects missing target', async () => {
    const port = portCounter++;
    await startWithProfileRoutes(port);

    const {status, json} = await request(
      port,
      'POST',
      '/api/profile',
      JSON.stringify({}),
    );

    expect(status).toBe(400);
    expect(json.error).toContain('target');
  });

  it('GET /api/profiles returns empty list initially', async () => {
    const port = portCounter++;
    await startWithProfileRoutes(port);

    const {status, json} = await request(port, 'GET', '/api/profiles');
    expect(status).toBe(200);
    expect(json.profiles).toEqual([]);
    expect(json.total).toBe(0);
  });

  it('GET /api/profiles lists cached profiles', async () => {
    const port = portCounter++;
    await startWithProfileRoutes(port);

    // Create a profile
    await request(
      port,
      'POST',
      '/api/profile',
      JSON.stringify({target: '/project-a'}),
    );
    await request(
      port,
      'POST',
      '/api/profile',
      JSON.stringify({target: '/project-b'}),
    );

    const {status, json} = await request(port, 'GET', '/api/profiles');
    expect(status).toBe(200);
    const profiles = json.profiles as unknown[];
    expect(profiles).toHaveLength(2);
    expect(json.total).toBe(2);
  });
});

describe('profile store', () => {
  it('stores and retrieves profiles', () => {
    const store = createProfileStore();
    const now = new Date();

    store.set({
      profileId: 'p-1',
      target: '/test',
      profile: {
        languages: ['ts'],
        frameworks: [],
        hasAuth: false,
        hasDatabase: false,
        hasDocker: false,
        hasCI: false,
      },
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 3600000).toISOString(),
    });

    expect(store.get('p-1')?.target).toBe('/test');
    expect(store.getByTarget('/test')?.profileId).toBe('p-1');
  });

  it('returns undefined for expired profiles', () => {
    const store = createProfileStore();
    const past = new Date(Date.now() - 1000);

    store.set({
      profileId: 'p-old',
      target: '/expired',
      profile: {
        languages: [],
        frameworks: [],
        hasAuth: false,
        hasDatabase: false,
        hasDocker: false,
        hasCI: false,
      },
      createdAt: past.toISOString(),
      expiresAt: past.toISOString(), // Already expired
    });

    expect(store.get('p-old')).toBeUndefined();
    expect(store.getByTarget('/expired')).toBeUndefined();
  });

  it('prunes expired entries', () => {
    const store = createProfileStore();
    const now = new Date();
    const past = new Date(Date.now() - 1000);

    store.set({
      profileId: 'p-valid',
      target: '/valid',
      profile: {
        languages: [],
        frameworks: [],
        hasAuth: false,
        hasDatabase: false,
        hasDocker: false,
        hasCI: false,
      },
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 3600000).toISOString(),
    });

    store.set({
      profileId: 'p-expired',
      target: '/expired',
      profile: {
        languages: [],
        frameworks: [],
        hasAuth: false,
        hasDatabase: false,
        hasDocker: false,
        hasCI: false,
      },
      createdAt: past.toISOString(),
      expiresAt: past.toISOString(),
    });

    const removed = store.prune();
    expect(removed).toBe(1);
    expect(store.size()).toBe(1);
  });

  it('replaces existing profile for same target', () => {
    const store = createProfileStore();
    const now = new Date();

    store.set({
      profileId: 'p-1',
      target: '/project',
      profile: {
        languages: ['js'],
        frameworks: [],
        hasAuth: false,
        hasDatabase: false,
        hasDocker: false,
        hasCI: false,
      },
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 3600000).toISOString(),
    });

    store.set({
      profileId: 'p-2',
      target: '/project',
      profile: {
        languages: ['ts'],
        frameworks: [],
        hasAuth: true,
        hasDatabase: false,
        hasDocker: false,
        hasCI: false,
      },
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 3600000).toISOString(),
    });

    expect(store.getByTarget('/project')?.profileId).toBe('p-2');
    expect(store.get('p-1')).toBeUndefined();
    expect(store.list()).toHaveLength(1);
  });

  it('clears all profiles', () => {
    const store = createProfileStore();
    const now = new Date();

    store.set({
      profileId: 'p-1',
      target: '/a',
      profile: {
        languages: [],
        frameworks: [],
        hasAuth: false,
        hasDatabase: false,
        hasDocker: false,
        hasCI: false,
      },
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 3600000).toISOString(),
    });

    store.clear();
    expect(store.list()).toHaveLength(0);
    expect(store.size()).toBe(0);
  });
});
