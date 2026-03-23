import {describe, it, expect, vi, beforeEach} from 'vitest';
import {createZapScanner} from '../zap.js';
import type {ScanTarget} from '../types.js';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const target: ScanTarget = {rootDir: '/project', url: 'http://localhost:3000'};
const targetNoUrl: ScanTarget = {rootDir: '/project'};

function mockFetchResponses(responses: Record<string, unknown>) {
  mockFetch.mockImplementation(async (urlStr: string) => {
    const url = new URL(urlStr);
    const path = url.pathname;

    for (const [key, value] of Object.entries(responses)) {
      if (path.includes(key)) {
        return {ok: true, json: async () => value};
      }
    }

    return {ok: true, json: async () => ({})};
  });
}

function mockZapFullScan(alerts: unknown[] = []) {
  mockFetchResponses({
    '/JSON/core/view/version': {version: '2.14.0'},
    '/JSON/spider/action/scan': {scan: '1'},
    '/JSON/spider/view/status': {status: '100'},
    '/JSON/ascan/action/scan': {scan: '1'},
    '/JSON/ascan/view/status': {status: '100'},
    '/JSON/core/view/alerts': {alerts},
  });
}

describe('createZapScanner', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('has correct name and category', () => {
    const s = createZapScanner();
    expect(s.name).toBe('zap');
    expect(s.category).toBe('dast');
  });

  it('stores config', () => {
    const s = createZapScanner({apiUrl: 'http://custom:9090', apiKey: 'abc123'});
    expect(s.config).toEqual({apiUrl: 'http://custom:9090', apiKey: 'abc123'});
  });

  describe('isAvailable', () => {
    it('returns true when ZAP API responds', async () => {
      mockFetchResponses({'/JSON/core/view/version': {version: '2.14.0'}});
      expect(await createZapScanner().isAvailable()).toBe(true);
    });

    it('returns false when ZAP is unreachable', async () => {
      mockFetch.mockRejectedValue(new Error('Connection refused'));
      expect(await createZapScanner().isAvailable()).toBe(false);
    });
  });

  describe('scan', () => {
    it('returns error when target.url is not set', async () => {
      const result = await createZapScanner().scan(targetNoUrl);
      expect(result.error).toContain('target URL');
      expect(result.findings).toHaveLength(0);
    });

    it('parses ZAP alerts into findings', async () => {
      mockZapFullScan([
        {alertRef: '10202', name: 'Absence of Anti-CSRF Tokens', riskcode: '2', confidence: '2', uri: 'http://localhost:3000/login', cweid: '352', wascid: '9', description: 'No CSRF token found'},
        {alertRef: '10096', name: 'Timestamp Disclosure', riskcode: '0', confidence: '1', uri: 'http://localhost:3000/', cweid: '200'},
      ]);

      const result = await createZapScanner().scan(target);
      expect(result.findings).toHaveLength(2);
      expect(result.findings[0].ruleId).toBe('10202');
      expect(result.findings[0].severity).toBe('medium');
      expect(result.findings[0].file).toBe('http://localhost:3000/login');
      expect(result.findings[1].severity).toBe('informational');
    });

    it('maps ZAP risk codes to severities', async () => {
      mockZapFullScan([
        {alertRef: 'r3', riskcode: '3', name: 'High risk'},
        {alertRef: 'r2', riskcode: '2', name: 'Medium risk'},
        {alertRef: 'r1', riskcode: '1', name: 'Low risk'},
        {alertRef: 'r0', riskcode: '0', name: 'Info'},
      ]);

      const result = await createZapScanner().scan(target);
      expect(result.findings.map(f => f.severity)).toEqual([
        'high', 'medium', 'low', 'informational',
      ]);
    });

    it('preserves CWE IDs in metadata', async () => {
      mockZapFullScan([{alertRef: '10202', riskcode: '2', name: 'CSRF', cweid: '352', confidence: '3'}]);
      const result = await createZapScanner().scan(target);
      expect(result.findings[0].metadata).toEqual(
        expect.objectContaining({cweid: '352', confidence: 1.0}),
      );
    });

    it('handles empty alerts', async () => {
      mockZapFullScan([]);
      const result = await createZapScanner().scan(target);
      expect(result.findings).toHaveLength(0);
      expect(result.error).toBeUndefined();
    });

    it('handles ZAP API errors gracefully', async () => {
      mockFetch.mockRejectedValue(new Error('Connection refused'));
      const result = await createZapScanner().scan(target);
      expect(result.findings).toHaveLength(0);
      expect(result.error).toContain('Connection refused');
    });

    it('reports duration', async () => {
      mockZapFullScan([]);
      const result = await createZapScanner().scan(target);
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it('passes API key in requests', async () => {
      mockZapFullScan([]);
      await createZapScanner({apiKey: 'test-key'}).scan(target);
      const calls = mockFetch.mock.calls;
      for (const [urlStr] of calls) {
        const url = new URL(urlStr as string);
        // Spider and scan action calls should have apikey
        if (url.pathname.includes('/action/') || url.pathname.includes('/view/')) {
          expect(url.searchParams.get('apikey')).toBe('test-key');
        }
      }
    });

    it('uses custom API URL', async () => {
      mockZapFullScan([]);
      await createZapScanner({apiUrl: 'http://custom:9090'}).scan(target);
      const firstCallUrl = mockFetch.mock.calls[0][0] as string;
      expect(firstCallUrl).toContain('http://custom:9090');
    });
  });
});
