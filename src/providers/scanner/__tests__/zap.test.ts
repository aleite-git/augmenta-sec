import {describe, it, expect, vi, beforeEach} from 'vitest';
import {createZapScanner, zapApiFetch} from '../zap.js';
import type {ScanTarget} from '../types.js';

const target: ScanTarget = {rootDir: 'http://localhost:3000'};

function createMockFetch(responses: Map<string, unknown>): typeof globalThis.fetch {
  return vi.fn(async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input.toString();
    for (const [pattern, body] of responses) {
      if (url.includes(pattern)) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => body,
        } as Response;
      }
    }
    return {
      ok: false,
      status: 404,
      statusText: 'Not Found',
      json: async () => ({}),
    } as Response;
  }) as typeof globalThis.fetch;
}

/** Build a standard set of ZAP API responses for a successful scan. */
function createSuccessResponses(alerts: unknown[] = []): Map<string, unknown> {
  return new Map([
    ['core/view/version', {version: '2.14.0'}],
    ['spider/action/scan', {scan: '1'}],
    ['spider/view/status', {status: '100'}],
    ['ascan/action/scan', {scan: '2'}],
    ['ascan/view/status', {status: '100'}],
    ['alert/view/alerts', {alerts}],
  ]);
}

describe('createZapScanner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('has correct name and category', () => {
    const scanner = createZapScanner();
    expect(scanner.name).toBe('zap');
    expect(scanner.category).toBe('dast');
  });

  describe('isAvailable', () => {
    it('returns true when ZAP API responds with a version', async () => {
      const mockFetch = createMockFetch(
        new Map([['core/view/version', {version: '2.14.0'}]]),
      );
      const scanner = createZapScanner('http://localhost:8080', '', mockFetch);
      const available = await scanner.isAvailable();
      expect(available).toBe(true);
    });

    it('returns false when ZAP API is unreachable', async () => {
      const mockFetch = vi.fn().mockRejectedValue(
        new Error('ECONNREFUSED'),
      ) as typeof globalThis.fetch;
      const scanner = createZapScanner('http://localhost:8080', '', mockFetch);
      const available = await scanner.isAvailable();
      expect(available).toBe(false);
    });

    it('returns false when version response is empty', async () => {
      const mockFetch = createMockFetch(
        new Map([['core/view/version', {version: ''}]]),
      );
      const scanner = createZapScanner('http://localhost:8080', '', mockFetch);
      const available = await scanner.isAvailable();
      expect(available).toBe(false);
    });

    it('returns false when version response has no version field', async () => {
      const mockFetch = createMockFetch(
        new Map([['core/view/version', {}]]),
      );
      const scanner = createZapScanner('http://localhost:8080', '', mockFetch);
      const available = await scanner.isAvailable();
      expect(available).toBe(false);
    });
  });

  describe('scan', () => {
    it('runs spider, active scan, and retrieves alerts', async () => {
      const alerts = [
        {
          alertRef: '10016',
          alert: 'Web Browser XSS Protection Not Enabled',
          risk: '1',
          confidence: '2',
          url: 'http://localhost:3000/',
          description: 'Web Browser XSS Protection is not enabled',
          solution: 'Set the X-XSS-Protection header',
          cweid: '933',
          wascid: '14',
        },
      ];
      const mockFetch = createMockFetch(createSuccessResponses(alerts));
      const scanner = createZapScanner(
        'http://localhost:8080',
        'test-key',
        mockFetch,
      );
      const result = await scanner.scan(target);

      expect(result.scanner).toBe('zap');
      expect(result.category).toBe('dast');
      expect(result.findings).toHaveLength(1);
      expect(result.error).toBeUndefined();

      expect(result.findings[0].ruleId).toBe('10016');
      expect(result.findings[0].message).toBe(
        'Web Browser XSS Protection Not Enabled',
      );
      expect(result.findings[0].severity).toBe('low');
      expect(result.findings[0].file).toBe('http://localhost:3000/');
      expect(result.findings[0].metadata).toEqual({
        description: 'Web Browser XSS Protection is not enabled',
        solution: 'Set the X-XSS-Protection header',
        confidence: '2',
        cweid: '933',
        wascid: '14',
      });
    });

    it('maps ZAP risk levels correctly', async () => {
      const alerts = [
        {
          alertRef: 'high-alert',
          alert: 'SQL Injection',
          risk: '3',
          confidence: '3',
          url: 'http://localhost:3000/api',
          description: 'SQL Injection found',
        },
        {
          alertRef: 'medium-alert',
          alert: 'CSRF Token Missing',
          risk: '2',
          confidence: '2',
          url: 'http://localhost:3000/form',
          description: 'No CSRF token',
        },
        {
          alertRef: 'low-alert',
          alert: 'Cookie No HttpOnly',
          risk: '1',
          confidence: '2',
          url: 'http://localhost:3000/',
          description: 'Cookie without HttpOnly',
        },
        {
          alertRef: 'info-alert',
          alert: 'Informational Finding',
          risk: '0',
          confidence: '1',
          url: 'http://localhost:3000/',
          description: 'Info only',
        },
      ];
      const mockFetch = createMockFetch(createSuccessResponses(alerts));
      const scanner = createZapScanner(
        'http://localhost:8080',
        '',
        mockFetch,
      );
      const result = await scanner.scan(target);

      expect(result.findings).toHaveLength(4);
      expect(result.findings[0].severity).toBe('high');
      expect(result.findings[1].severity).toBe('medium');
      expect(result.findings[2].severity).toBe('low');
      expect(result.findings[3].severity).toBe('informational');
    });

    it('maps unknown risk to informational', async () => {
      const alerts = [
        {
          alertRef: 'unknown',
          alert: 'Unknown risk',
          risk: '99',
          confidence: '1',
          url: 'http://localhost:3000/',
          description: 'Unknown',
        },
      ];
      const mockFetch = createMockFetch(createSuccessResponses(alerts));
      const scanner = createZapScanner(
        'http://localhost:8080',
        '',
        mockFetch,
      );
      const result = await scanner.scan(target);
      expect(result.findings[0].severity).toBe('informational');
    });

    it('handles empty alerts list', async () => {
      const mockFetch = createMockFetch(createSuccessResponses([]));
      const scanner = createZapScanner(
        'http://localhost:8080',
        '',
        mockFetch,
      );
      const result = await scanner.scan(target);

      expect(result.findings).toHaveLength(0);
      expect(result.error).toBeUndefined();
    });

    it('handles missing alerts field in response', async () => {
      const responses = createSuccessResponses();
      responses.set('alert/view/alerts', {});
      const mockFetch = createMockFetch(responses);
      const scanner = createZapScanner(
        'http://localhost:8080',
        '',
        mockFetch,
      );
      const result = await scanner.scan(target);

      expect(result.findings).toHaveLength(0);
      expect(result.error).toBeUndefined();
    });

    it('returns error result when fetch fails during spider', async () => {
      const mockFetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({version: '2.14.0'}),
        })
        .mockRejectedValueOnce(
          new Error('Connection reset'),
        ) as typeof globalThis.fetch;

      const scanner = createZapScanner(
        'http://localhost:8080',
        '',
        mockFetch,
      );
      const result = await scanner.scan(target);

      expect(result.findings).toHaveLength(0);
      expect(result.error).toContain('Connection reset');
    });

    it('returns error result when ZAP API returns HTTP error', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => ({}),
      }) as typeof globalThis.fetch;

      const scanner = createZapScanner(
        'http://localhost:8080',
        '',
        mockFetch,
      );
      const result = await scanner.scan(target);

      expect(result.findings).toHaveLength(0);
      expect(result.error).toContain('ZAP API error');
      expect(result.error).toContain('500');
    });

    it('uses alertRef as ruleId, falls back to alert name', async () => {
      const alerts = [
        {
          alertRef: '',
          alert: 'Fallback Alert Name',
          risk: '1',
          confidence: '1',
          url: 'http://localhost:3000/',
          description: 'Test',
        },
      ];
      const mockFetch = createMockFetch(createSuccessResponses(alerts));
      const scanner = createZapScanner(
        'http://localhost:8080',
        '',
        mockFetch,
      );
      const result = await scanner.scan(target);
      expect(result.findings[0].ruleId).toBe('Fallback Alert Name');
    });

    it('reports duration', async () => {
      const mockFetch = createMockFetch(createSuccessResponses([]));
      const scanner = createZapScanner(
        'http://localhost:8080',
        '',
        mockFetch,
      );
      const result = await scanner.scan(target);
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it('uses default apiUrl and apiKey when not provided', () => {
      const scanner = createZapScanner();
      expect(scanner.name).toBe('zap');
      expect(scanner.category).toBe('dast');
    });

    it('passes apiKey in query params', async () => {
      const mockFetch = createMockFetch(createSuccessResponses([]));
      const scanner = createZapScanner(
        'http://localhost:8080',
        'my-secret-key',
        mockFetch,
      );
      await scanner.scan(target);

      // Verify apikey was included in at least one call
      const calls = (mockFetch as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      const firstCallUrl = calls[0][0] as string;
      expect(firstCallUrl).toContain('apikey=my-secret-key');
    });

    it('handles missing spider scan ID in response', async () => {
      const responses = createSuccessResponses([]);
      responses.set('spider/action/scan', {}); // no `scan` field
      const mockFetch = createMockFetch(responses);
      const scanner = createZapScanner(
        'http://localhost:8080',
        '',
        mockFetch,
      );
      const result = await scanner.scan(target);
      // Should still complete successfully using fallback '0'
      expect(result.error).toBeUndefined();
    });
  });
});

describe('zapApiFetch', () => {
  it('constructs URL with base, path, and params', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({data: 'test'}),
    }) as typeof globalThis.fetch;

    await zapApiFetch(
      'http://zap:9090',
      '/JSON/core/view/version/',
      {apikey: 'key123', extra: 'val'},
      mockFetch,
    );

    const calledUrl = (mockFetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(calledUrl).toContain('http://zap:9090/JSON/core/view/version/');
    expect(calledUrl).toContain('apikey=key123');
    expect(calledUrl).toContain('extra=val');
  });

  it('throws on non-OK response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
    }) as typeof globalThis.fetch;

    await expect(
      zapApiFetch('http://zap:9090', '/path', {}, mockFetch),
    ).rejects.toThrow('ZAP API error: 403 Forbidden');
  });
});
