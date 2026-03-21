/**
 * OWASP ZAP scanner adapter.
 *
 * Runs DAST via the ZAP REST API: spider a target URL, launch an active scan,
 * then retrieve alerts. Requires a running ZAP instance (daemon or desktop).
 */

import type {
  RawFinding,
  ScanResult,
  ScanTarget,
  SecurityScanner,
} from './types.js';

const DEFAULT_API_URL = 'http://localhost:8080';
const POLL_INTERVAL_MS = 2_000;
const SCAN_TIMEOUT_MS = 300_000; // 5 minutes

/** Map ZAP risk codes (0-3) to our severity levels. */
function mapRisk(risk: string): RawFinding['severity'] {
  switch (risk) {
    case '3':
      return 'high';
    case '2':
      return 'medium';
    case '1':
      return 'low';
    case '0':
      return 'informational';
    default:
      return 'informational';
  }
}

/** Shape of a single ZAP alert from the API. */
interface ZapAlert {
  alertRef: string;
  alert: string;
  risk: string;
  confidence: string;
  url: string;
  description: string;
  solution?: string;
  cweid?: string;
  wascid?: string;
  other?: string;
}

/**
 * Internal helper that calls the ZAP JSON API.
 * Exported only for testing — not part of the public API.
 */
export async function zapApiFetch(
  baseUrl: string,
  path: string,
  params: Record<string, string>,
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): Promise<unknown> {
  const url = new URL(path, baseUrl);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  const response = await fetchImpl(url.toString());
  if (!response.ok) {
    throw new Error(`ZAP API error: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

/**
 * Poll a ZAP async operation (spider or ascan) until it reaches 100%.
 * Returns when complete or throws on timeout.
 */
async function pollUntilComplete(
  baseUrl: string,
  statusPath: string,
  scanId: string,
  apiKey: string,
  fetchImpl: typeof globalThis.fetch,
  timeoutMs: number = SCAN_TIMEOUT_MS,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = (await zapApiFetch(
      baseUrl,
      statusPath,
      {apikey: apiKey, scanId},
      fetchImpl,
    )) as {status?: string};
    const status = parseInt(result.status ?? '0', 10);
    if (status >= 100) return;
    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  throw new Error(`ZAP scan timed out after ${timeoutMs}ms`);
}

/**
 * Create an OWASP ZAP DAST scanner conforming to SecurityScanner.
 *
 * @param apiUrl - ZAP REST API base URL (default: http://localhost:8080)
 * @param apiKey - ZAP API key (default: empty string for no auth)
 * @param fetchImpl - Optional fetch override for testing
 */
export function createZapScanner(
  apiUrl?: string,
  apiKey?: string,
  fetchImpl?: typeof globalThis.fetch,
): SecurityScanner {
  const baseUrl = apiUrl ?? DEFAULT_API_URL;
  const key = apiKey ?? '';
  const fetchFn = fetchImpl ?? globalThis.fetch;

  return {
    name: 'zap',
    category: 'dast',

    async isAvailable(): Promise<boolean> {
      try {
        const result = (await zapApiFetch(
          baseUrl,
          '/JSON/core/view/version/',
          {apikey: key},
          fetchFn,
        )) as {version?: string};
        return typeof result.version === 'string' && result.version.length > 0;
      } catch {
        return false;
      }
    },

    async scan(target: ScanTarget): Promise<ScanResult> {
      const start = Date.now();
      const targetUrl = target.rootDir; // For DAST, rootDir is the target URL

      try {
        // 1. Spider the target
        const spiderResult = (await zapApiFetch(
          baseUrl,
          '/JSON/spider/action/scan/',
          {apikey: key, url: targetUrl, maxChildren: '10', recurse: 'true'},
          fetchFn,
        )) as {scan?: string};

        const spiderId = spiderResult.scan ?? '0';
        await pollUntilComplete(
          baseUrl,
          '/JSON/spider/view/status/',
          spiderId,
          key,
          fetchFn,
        );

        // 2. Active scan
        const ascanResult = (await zapApiFetch(
          baseUrl,
          '/JSON/ascan/action/scan/',
          {apikey: key, url: targetUrl, recurse: 'true'},
          fetchFn,
        )) as {scan?: string};

        const ascanId = ascanResult.scan ?? '0';
        await pollUntilComplete(
          baseUrl,
          '/JSON/ascan/view/status/',
          ascanId,
          key,
          fetchFn,
        );

        // 3. Retrieve alerts
        const alertsResult = (await zapApiFetch(
          baseUrl,
          '/JSON/alert/view/alerts/',
          {apikey: key, baseurl: targetUrl, start: '0', count: '500'},
          fetchFn,
        )) as {alerts?: ZapAlert[]};

        const alerts = alertsResult.alerts ?? [];
        const findings: RawFinding[] = alerts.map(a => ({
          ruleId: a.alertRef || a.alert,
          message: a.alert,
          severity: mapRisk(a.risk),
          file: a.url,
          metadata: {
            description: a.description,
            solution: a.solution,
            confidence: a.confidence,
            cweid: a.cweid,
            wascid: a.wascid,
          },
        }));

        return {
          scanner: 'zap',
          category: 'dast',
          findings,
          duration: Date.now() - start,
        };
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : String(error);
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
