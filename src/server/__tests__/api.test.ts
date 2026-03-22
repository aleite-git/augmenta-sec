import {describe, it, expect, beforeAll, afterAll, beforeEach} from 'vitest';
import {request} from 'node:http';
import {
  createApiServer,
  matchRoute,
  getFindingsStore,
  getScanJobsStore,
  clearStores,
} from '../api.js';
import type {ApiServer, ApiResponse} from '../api.js';
import type {Finding} from '../../findings/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Makes an HTTP request to the test server and returns parsed JSON. */
function httpRequest(
  port: number,
  method: string,
  path: string,
  body?: unknown,
): Promise<{status: number; body: ApiResponse}> {
  return new Promise((resolve, reject) => {
    const req = request(
      {
        hostname: 'localhost',
        port,
        path,
        method,
        headers: body
          ? {'Content-Type': 'application/json'}
          : undefined,
      },
      res => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf-8');
          try {
            resolve({
              status: res.statusCode ?? 0,
              body: JSON.parse(raw) as ApiResponse,
            });
          } catch {
            reject(new Error(`Invalid JSON: ${raw}`));
          }
        });
      },
    );
    req.on('error', reject);
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

function httpRaw(
  port: number,
  method: string,
  path: string,
  rawBody: string,
): Promise<{status: number; body: ApiResponse}> {
  return new Promise((resolve, reject) => {
    const req = request(
      {
        hostname: 'localhost',
        port,
        path,
        method,
        headers: {'Content-Type': 'application/json'},
      },
      res => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf-8');
          try {
            resolve({
              status: res.statusCode ?? 0,
              body: JSON.parse(raw) as ApiResponse,
            });
          } catch {
            reject(new Error(`Invalid JSON response: ${raw}`));
          }
        });
      },
    );
    req.on('error', reject);
    req.write(rawBody);
    req.end();
  });
}

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: overrides.id ?? 'test-id-1',
    source: 'scanner',
    scanner: 'semgrep',
    category: 'injection',
    severity: 'high',
    rawSeverity: 'high',
    title: 'SQL injection',
    description: 'User input in SQL query',
    confidence: 0.9,
    status: 'open',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// matchRoute (unit tests — no server needed)
// ---------------------------------------------------------------------------

describe('matchRoute', () => {
  it('matches GET /api/findings', () => {
    const result = matchRoute('GET', '/api/findings');
    expect(result).not.toBeNull();
    expect(result!.params).toEqual({});
  });

  it('matches GET /api/findings/:id', () => {
    const result = matchRoute('GET', '/api/findings/abc-123');
    expect(result).not.toBeNull();
    expect(result!.params).toEqual({id: 'abc-123'});
  });

  it('matches POST /api/scan', () => {
    const result = matchRoute('POST', '/api/scan');
    expect(result).not.toBeNull();
  });

  it('matches GET /api/scan/:jobId', () => {
    const result = matchRoute('GET', '/api/scan/job-456');
    expect(result).not.toBeNull();
    expect(result!.params).toEqual({jobId: 'job-456'});
  });

  it('matches POST /api/review', () => {
    const result = matchRoute('POST', '/api/review');
    expect(result).not.toBeNull();
  });

  it('matches GET /health', () => {
    const result = matchRoute('GET', '/health');
    expect(result).not.toBeNull();
  });

  it('returns null for unknown routes', () => {
    expect(matchRoute('GET', '/unknown')).toBeNull();
  });

  it('returns null for wrong method', () => {
    expect(matchRoute('DELETE', '/api/findings')).toBeNull();
  });

  it('strips query string before matching', () => {
    const result = matchRoute('GET', '/api/findings?severity=high');
    expect(result).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Store helpers (unit tests)
// ---------------------------------------------------------------------------

describe('store helpers', () => {
  it('clearStores empties both stores', () => {
    getFindingsStore().set('a', makeFinding({id: 'a'}));
    getScanJobsStore().set('j', {
      jobId: 'j',
      status: 'queued',
      createdAt: new Date().toISOString(),
    });

    clearStores();

    expect(getFindingsStore().size).toBe(0);
    expect(getScanJobsStore().size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// HTTP integration tests (single server for the whole suite)
// ---------------------------------------------------------------------------

describe('API server', () => {
  let server: ApiServer;
  let port: number;

  beforeAll(async () => {
    // Use port 0 to let the OS assign a free port
    server = createApiServer({port: 0});
    await server.listen();
    // Retrieve the actual port assigned by the OS
    const addr = server.server.address();
    port = typeof addr === 'object' && addr !== null ? addr.port : 0;
  });

  afterAll(async () => {
    await server.close();
  });

  beforeEach(() => {
    clearStores();
  });

  // -----------------------------------------------------------------------
  // Health
  // -----------------------------------------------------------------------

  describe('GET /health', () => {
    it('returns healthy status', async () => {
      const res = await httpRequest(port, 'GET', '/health');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Findings
  // -----------------------------------------------------------------------

  describe('GET /api/findings', () => {
    it('returns empty list when no findings', async () => {
      const res = await httpRequest(port, 'GET', '/api/findings');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      const data = res.body.data as {findings: Finding[]; total: number};
      expect(data.findings).toEqual([]);
      expect(data.total).toBe(0);
    });

    it('returns seeded findings', async () => {
      const finding = makeFinding();
      getFindingsStore().set(finding.id, finding);

      const res = await httpRequest(port, 'GET', '/api/findings');
      const data = res.body.data as {findings: Finding[]; total: number};
      expect(data.findings).toHaveLength(1);
      expect(data.total).toBe(1);
    });

    it('filters by severity', async () => {
      getFindingsStore().set('a', makeFinding({id: 'a', severity: 'high'}));
      getFindingsStore().set('b', makeFinding({id: 'b', severity: 'low'}));

      const res = await httpRequest(port, 'GET', '/api/findings?severity=high');
      const data = res.body.data as {findings: Finding[]};
      expect(data.findings).toHaveLength(1);
      expect(data.findings[0].id).toBe('a');
    });

    it('filters by status', async () => {
      getFindingsStore().set('a', makeFinding({id: 'a', status: 'open'}));
      getFindingsStore().set('b', makeFinding({id: 'b', status: 'fixed'}));

      const res = await httpRequest(port, 'GET', '/api/findings?status=fixed');
      const data = res.body.data as {findings: Finding[]};
      expect(data.findings).toHaveLength(1);
      expect(data.findings[0].id).toBe('b');
    });

    it('filters by category', async () => {
      getFindingsStore().set('a', makeFinding({id: 'a', category: 'injection'}));
      getFindingsStore().set('b', makeFinding({id: 'b', category: 'auth'}));

      const res = await httpRequest(port, 'GET', '/api/findings?category=auth');
      const data = res.body.data as {findings: Finding[]};
      expect(data.findings).toHaveLength(1);
    });

    it('filters by scanner', async () => {
      getFindingsStore().set('a', makeFinding({id: 'a', scanner: 'semgrep'}));
      getFindingsStore().set('b', makeFinding({id: 'b', scanner: 'trivy'}));

      const res = await httpRequest(port, 'GET', '/api/findings?scanner=trivy');
      const data = res.body.data as {findings: Finding[]};
      expect(data.findings).toHaveLength(1);
      expect(data.findings[0].scanner).toBe('trivy');
    });

    it('supports pagination with offset and limit', async () => {
      for (let i = 0; i < 5; i++) {
        getFindingsStore().set(`f-${i}`, makeFinding({id: `f-${i}`}));
      }

      const res = await httpRequest(
        port,
        'GET',
        '/api/findings?offset=2&limit=2',
      );
      const data = res.body.data as {
        findings: Finding[];
        total: number;
        offset: number;
        limit: number;
      };
      expect(data.findings).toHaveLength(2);
      expect(data.total).toBe(5);
      expect(data.offset).toBe(2);
      expect(data.limit).toBe(2);
    });
  });

  describe('GET /api/findings/:id', () => {
    it('returns a specific finding', async () => {
      const finding = makeFinding({id: 'find-1'});
      getFindingsStore().set(finding.id, finding);

      const res = await httpRequest(port, 'GET', '/api/findings/find-1');
      expect(res.status).toBe(200);
      expect((res.body.data as Finding).id).toBe('find-1');
    });

    it('returns 404 for unknown finding', async () => {
      const res = await httpRequest(port, 'GET', '/api/findings/nope');
      expect(res.status).toBe(404);
      expect(res.body.ok).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Scan
  // -----------------------------------------------------------------------

  describe('POST /api/scan', () => {
    it('creates a scan job', async () => {
      const res = await httpRequest(port, 'POST', '/api/scan', {
        target: '/some/repo',
      });
      expect(res.status).toBe(201);
      expect(res.body.ok).toBe(true);
      const job = res.body.data as {jobId: string; status: string; target: string};
      expect(job.jobId).toBeDefined();
      expect(job.status).toBe('queued');
      expect(job.target).toBe('/some/repo');
    });

    it('creates a scan job with empty body', async () => {
      const res = await httpRequest(port, 'POST', '/api/scan', {});
      expect(res.status).toBe(201);
      expect(res.body.ok).toBe(true);
    });

    it('returns 400 for invalid JSON', async () => {
      const res = await httpRaw(port, 'POST', '/api/scan', '{invalid json');
      expect(res.status).toBe(400);
      expect(res.body.ok).toBe(false);
    });
  });

  describe('GET /api/scan/:jobId', () => {
    it('returns scan job status', async () => {
      const createRes = await httpRequest(port, 'POST', '/api/scan', {
        target: '/repo',
      });
      const jobId = (createRes.body.data as {jobId: string}).jobId;

      const res = await httpRequest(port, 'GET', `/api/scan/${jobId}`);
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect((res.body.data as {jobId: string}).jobId).toBe(jobId);
    });

    it('returns 404 for unknown job', async () => {
      const res = await httpRequest(port, 'GET', '/api/scan/nonexistent');
      expect(res.status).toBe(404);
    });
  });

  // -----------------------------------------------------------------------
  // Review
  // -----------------------------------------------------------------------

  describe('POST /api/review', () => {
    it('updates finding status', async () => {
      const finding = makeFinding({id: 'rev-1', status: 'open'});
      getFindingsStore().set(finding.id, finding);

      const res = await httpRequest(port, 'POST', '/api/review', {
        findingId: 'rev-1',
        status: 'confirmed',
        reviewer: 'alice',
      });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      const data = res.body.data as {
        previousStatus: string;
        newStatus: string;
        reviewer: string;
      };
      expect(data.previousStatus).toBe('open');
      expect(data.newStatus).toBe('confirmed');
      expect(data.reviewer).toBe('alice');
      expect(getFindingsStore().get('rev-1')!.status).toBe('confirmed');
    });

    it('returns 400 for missing required fields', async () => {
      const res = await httpRequest(port, 'POST', '/api/review', {
        findingId: 'x',
      });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Missing required fields');
    });

    it('returns 400 for invalid status', async () => {
      const res = await httpRequest(port, 'POST', '/api/review', {
        findingId: 'x',
        status: 'invalid-status',
        reviewer: 'alice',
      });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid status');
    });

    it('returns 404 for non-existent finding', async () => {
      const res = await httpRequest(port, 'POST', '/api/review', {
        findingId: 'nope',
        status: 'fixed',
        reviewer: 'alice',
      });
      expect(res.status).toBe(404);
    });

    it('returns 400 for invalid JSON body', async () => {
      const res = await httpRaw(port, 'POST', '/api/review', 'not json');
      expect(res.status).toBe(400);
    });
  });

  // -----------------------------------------------------------------------
  // 404
  // -----------------------------------------------------------------------

  describe('unknown routes', () => {
    it('returns 404 for unmatched paths', async () => {
      const res = await httpRequest(port, 'GET', '/api/unknown');
      expect(res.status).toBe(404);
      expect(res.body.ok).toBe(false);
    });
  });
});
