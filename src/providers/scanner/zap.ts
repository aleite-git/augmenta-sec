/**
 * OWASP ZAP scanner adapter (ASEC-107).
 *
 * Connects to a running ZAP instance via its REST API to perform
 * dynamic application security testing (DAST). Requires `target.url`
 * to be set — DAST scans need a running application endpoint.
 *
 * Designed for server mode: ZAP should already be running and accessible.
 */

import type {
  RawFinding,
  ScannerAdapter,
  ScannerAdapterConfig,
  ScanResult,
  ScanTarget,
} from './types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ZapScannerConfig extends ScannerAdapterConfig {
  /** ZAP API base URL (default: http://localhost:8080). */
  apiUrl?: string;
  /** ZAP API key for authentication. */
  apiKey?: string;
  /** Named scan policy to use. */
  scanPolicy?: string;
}

interface ZapAlert {
  alertRef?: string;
  name?: string;
  riskcode?: string;
  confidence?: string;
  description?: string;
  uri?: string;
  cweid?: string;
  wascid?: string;
  sourceid?: string;
}

// ---------------------------------------------------------------------------
// Severity mapping
// ---------------------------------------------------------------------------

function mapZapRisk(riskCode: string): RawFinding['severity'] {
  switch (riskCode) {
    case '3': return 'high';
    case '2': return 'medium';
    case '1': return 'low';
    case '0':
    default: return 'informational';
  }
}

function mapZapConfidence(confidenceCode: string): number {
  switch (confidenceCode) {
    case '3': return 1.0;
    case '2': return 0.75;
    case '1': return 0.5;
    case '0':
    default: return 0.25;
  }
}

// ---------------------------------------------------------------------------
// ZAP API helpers
// ---------------------------------------------------------------------------

async function zapFetch(
  baseUrl: string,
  path: string,
  apiKey?: string,
): Promise<Record<string, unknown>> {
  const url = new URL(path, baseUrl);
  if (apiKey) {
    url.searchParams.set('apikey', apiKey);
  }
  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`ZAP API ${path} returned ${res.status}: ${res.statusText}`);
  }
  return (await res.json()) as Record<string, unknown>;
}

async function pollScanProgress(
  baseUrl: string,
  scanId: string,
  apiKey?: string,
  timeoutMs = 300_000,
  intervalMs = 2_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const data = await zapFetch(baseUrl, `/JSON/ascan/view/status/?scanId=${scanId}`, apiKey);
    const status = Number(data.status ?? 0);
    if (status >= 100) return;
    await new Promise(r => setTimeout(r, intervalMs));
  }
  throw new Error(`ZAP active scan timed out after ${timeoutMs}ms`);
}

// ---------------------------------------------------------------------------
// Scanner factory
// ---------------------------------------------------------------------------

const DEFAULT_API_URL = 'http://localhost:8080';

export function createZapScanner(config?: ZapScannerConfig): ScannerAdapter {
  const apiUrl = config?.apiUrl ?? DEFAULT_API_URL;
  const apiKey = config?.apiKey;
  const scanPolicy = config?.scanPolicy;

  return {
    name: 'zap',
    category: 'dast',
    config,

    async isAvailable(): Promise<boolean> {
      try {
        await zapFetch(apiUrl, '/JSON/core/view/version/', apiKey);
        return true;
      } catch {
        return false;
      }
    },

    async scan(target: ScanTarget): Promise<ScanResult> {
      const start = Date.now();

      if (!target.url) {
        return {
          scanner: 'zap',
          category: 'dast',
          findings: [],
          duration: Date.now() - start,
          error: 'DAST scanning requires a target URL. Set target.url to the application endpoint.',
        };
      }

      try {
        // Spider the target
        const spiderData = await zapFetch(
          apiUrl,
          `/JSON/spider/action/scan/?url=${encodeURIComponent(target.url)}`,
          apiKey,
        );
        const spiderId = String(spiderData.scan ?? '0');

        // Wait for spider to complete
        await pollSpider(apiUrl, spiderId, apiKey, config?.timeout ?? 120_000);

        // Active scan
        const scanParams = new URLSearchParams({url: target.url});
        if (scanPolicy) scanParams.set('scanPolicyName', scanPolicy);
        const scanData = await zapFetch(
          apiUrl,
          `/JSON/ascan/action/scan/?${scanParams.toString()}`,
          apiKey,
        );
        const scanId = String(scanData.scan ?? '0');

        // Wait for active scan to complete
        await pollScanProgress(apiUrl, scanId, apiKey, config?.timeout ?? 300_000);

        // Fetch alerts
        const alertsData = await zapFetch(
          apiUrl,
          `/JSON/core/view/alerts/?baseurl=${encodeURIComponent(target.url)}&start=0&count=500`,
          apiKey,
        );
        const alerts = (alertsData.alerts ?? []) as ZapAlert[];

        const findings: RawFinding[] = alerts.map(alert => ({
          ruleId: alert.alertRef ?? 'zap-unknown',
          message: alert.name ?? 'Unknown alert',
          severity: mapZapRisk(alert.riskcode ?? '0'),
          file: alert.uri,
          metadata: {
            confidence: mapZapConfidence(alert.confidence ?? '0'),
            cweid: alert.cweid,
            wascid: alert.wascid,
            description: alert.description,
          },
        }));

        return {
          scanner: 'zap',
          category: 'dast',
          findings,
          duration: Date.now() - start,
        };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          scanner: 'zap',
          category: 'dast',
          findings: [],
          duration: Date.now() - start,
          error: message,
        };
      }
    },
  };
}

async function pollSpider(
  baseUrl: string,
  spiderId: string,
  apiKey?: string,
  timeoutMs = 120_000,
  intervalMs = 1_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const data = await zapFetch(baseUrl, `/JSON/spider/view/status/?scanId=${spiderId}`, apiKey);
    const status = Number(data.status ?? 0);
    if (status >= 100) return;
    await new Promise(r => setTimeout(r, intervalMs));
  }
  throw new Error(`ZAP spider timed out after ${timeoutMs}ms`);
}
