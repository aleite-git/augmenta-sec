import {describe, expect, it} from 'vitest';
import {createRateLimiter} from '../rate-limit.js';
import type {IncomingMessage, ServerResponse} from 'node:http';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockRequest(
  ip: string,
  headers?: Record<string, string>,
): IncomingMessage {
  const req = {
    socket: {remoteAddress: ip},
    headers: headers ?? {},
  } as unknown as IncomingMessage;

  return req;
}

interface MockResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  headersSent: boolean;
  setHeader(name: string, value: string): void;
  writeHead(status: number, headers?: Record<string, string>): void;
  end(data?: string): void;
}

function mockResponse(): MockResponse {
  const res: MockResponse = {
    statusCode: 200,
    headers: {},
    body: '',
    headersSent: false,
    setHeader(name: string, value: string) {
      res.headers[name.toLowerCase()] = value;
    },
    writeHead(status: number, hdrs?: Record<string, string>) {
      res.statusCode = status;
      if (hdrs) {
        for (const [k, v] of Object.entries(hdrs)) {
          res.headers[k.toLowerCase()] = v;
        }
      }
      res.headersSent = true;
    },
    end(data?: string) {
      if (data) res.body = data;
    },
  };
  return res;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('rate limiter', () => {
  it('allows requests within the limit', () => {
    const limiter = createRateLimiter({maxRequests: 5, windowMs: 60_000});
    const req = mockRequest('192.168.1.1');

    for (let i = 0; i < 5; i++) {
      const res = mockResponse();
      expect(limiter.check(req, res as unknown as ServerResponse)).toBe(true);
    }
  });

  it('blocks requests exceeding the limit', () => {
    const limiter = createRateLimiter({maxRequests: 3, windowMs: 60_000});
    const req = mockRequest('10.0.0.1');

    // Use up all tokens.
    for (let i = 0; i < 3; i++) {
      const res = mockResponse();
      limiter.check(req, res as unknown as ServerResponse);
    }

    // Next request should be blocked.
    const res = mockResponse();
    const allowed = limiter.check(req, res as unknown as ServerResponse);
    expect(allowed).toBe(false);
    expect(res.statusCode).toBe(429);
    expect(res.body).toContain('Too many requests');
  });

  it('sets Retry-After header when rate limited', () => {
    const limiter = createRateLimiter({maxRequests: 1, windowMs: 60_000});
    const req = mockRequest('10.0.0.2');

    // Use the single token.
    const res1 = mockResponse();
    limiter.check(req, res1 as unknown as ServerResponse);

    // Blocked request.
    const res2 = mockResponse();
    limiter.check(req, res2 as unknown as ServerResponse);
    expect(res2.headers['retry-after']).toBeDefined();
    const retryAfter = parseInt(res2.headers['retry-after'], 10);
    expect(retryAfter).toBeGreaterThan(0);
  });

  it('tracks separate buckets per client IP', () => {
    const limiter = createRateLimiter({maxRequests: 2, windowMs: 60_000});

    const req1 = mockRequest('1.1.1.1');
    const req2 = mockRequest('2.2.2.2');

    // Client 1 uses 2 tokens.
    limiter.check(req1, mockResponse() as unknown as ServerResponse);
    limiter.check(req1, mockResponse() as unknown as ServerResponse);

    // Client 1 is blocked.
    const res1 = mockResponse();
    expect(limiter.check(req1, res1 as unknown as ServerResponse)).toBe(false);

    // Client 2 is still allowed.
    const res2 = mockResponse();
    expect(limiter.check(req2, res2 as unknown as ServerResponse)).toBe(true);
  });

  it('uses X-Forwarded-For header when present', () => {
    const limiter = createRateLimiter({maxRequests: 1, windowMs: 60_000});

    // Both requests come from different sockets but same X-Forwarded-For.
    const req1 = mockRequest('10.0.0.1', {
      'x-forwarded-for': '203.0.113.5',
    });
    const req2 = mockRequest('10.0.0.2', {
      'x-forwarded-for': '203.0.113.5',
    });

    limiter.check(req1, mockResponse() as unknown as ServerResponse);

    const res = mockResponse();
    expect(limiter.check(req2, res as unknown as ServerResponse)).toBe(false);
  });

  it('handles X-Forwarded-For with multiple IPs', () => {
    const limiter = createRateLimiter({maxRequests: 1, windowMs: 60_000});

    const req = mockRequest('10.0.0.1', {
      'x-forwarded-for': '203.0.113.5, 70.41.3.18',
    });

    limiter.check(req, mockResponse() as unknown as ServerResponse);

    // Same first IP should be rate limited.
    const req2 = mockRequest('10.0.0.2', {
      'x-forwarded-for': '203.0.113.5',
    });
    const res = mockResponse();
    expect(limiter.check(req2, res as unknown as ServerResponse)).toBe(false);
  });

  it('reset clears all buckets', () => {
    const limiter = createRateLimiter({maxRequests: 1, windowMs: 60_000});
    const req = mockRequest('10.0.0.1');

    limiter.check(req, mockResponse() as unknown as ServerResponse);

    // Blocked after 1 request.
    const res1 = mockResponse();
    expect(limiter.check(req, res1 as unknown as ServerResponse)).toBe(false);

    // Reset.
    limiter.reset();
    expect(limiter.size()).toBe(0);

    // Allowed again.
    const res2 = mockResponse();
    expect(limiter.check(req, res2 as unknown as ServerResponse)).toBe(true);
  });

  it('refills tokens over time', async () => {
    const limiter = createRateLimiter({maxRequests: 10, windowMs: 100});
    const req = mockRequest('10.0.0.1');

    // Exhaust all tokens.
    for (let i = 0; i < 10; i++) {
      limiter.check(req, mockResponse() as unknown as ServerResponse);
    }

    // Blocked.
    const resBefore = mockResponse();
    expect(
      limiter.check(req, resBefore as unknown as ServerResponse),
    ).toBe(false);

    // Wait for refill.
    await new Promise((resolve) => setTimeout(resolve, 120));

    // Should be allowed again after window passes.
    const resAfter = mockResponse();
    expect(
      limiter.check(req, resAfter as unknown as ServerResponse),
    ).toBe(true);
  });

  it('reports size correctly', () => {
    const limiter = createRateLimiter({maxRequests: 10, windowMs: 60_000});

    limiter.check(
      mockRequest('1.1.1.1'),
      mockResponse() as unknown as ServerResponse,
    );
    limiter.check(
      mockRequest('2.2.2.2'),
      mockResponse() as unknown as ServerResponse,
    );

    expect(limiter.size()).toBe(2);
  });
});
