/**
 * Scan API routes for the HTTP server.
 *
 * - POST /api/scan   -- trigger an async scan
 * - GET  /api/scan/:id -- get scan status/results
 *
 * Scans run asynchronously. Status and results are stored in an in-memory map.
 *
 * @module ASEC-081
 */

import {randomUUID} from 'node:crypto';
import type {Route, RouteParams} from '../core.js';
import {jsonResponse, errorResponse} from '../core.js';
import {validateRequest, scanRequestSchema} from '../validation.js';
import type {WebhookManager} from '../webhook-manager.js';
import type {IncomingMessage, ServerResponse} from 'node:http';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ScanStatus = 'queued' | 'running' | 'completed' | 'failed';

export interface ScanConfig {
  categories?: string[];
  minSeverity?: string;
  maxFindings?: number;
}

export interface ScanFinding {
  id: string;
  severity: string;
  title: string;
  description: string;
  file?: string;
  line?: number;
}

export interface ScanReport {
  target: string;
  findings: ScanFinding[];
  summary: {
    total: number;
    bySeverity: Record<string, number>;
  };
  durationMs: number;
  completedAt: string;
}

export interface ScanRecord {
  scanId: string;
  status: ScanStatus;
  target: string;
  config?: ScanConfig;
  result?: ScanReport;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Scan store (in-memory)
// ---------------------------------------------------------------------------

export interface ScanStore {
  get(id: string): ScanRecord | undefined;
  set(id: string, record: ScanRecord): void;
  list(): ScanRecord[];
  clear(): void;
}

export function createScanStore(): ScanStore {
  const scans = new Map<string, ScanRecord>();

  return {
    get(id) {
      return scans.get(id);
    },
    set(id, record) {
      scans.set(id, record);
    },
    list() {
      return [...scans.values()];
    },
    clear() {
      scans.clear();
    },
  };
}

// ---------------------------------------------------------------------------
// Simulated scan execution
// ---------------------------------------------------------------------------

/**
 * Simulates an async scan. In production this would invoke real scanners.
 */
async function executeScan(
  record: ScanRecord,
  store: ScanStore,
  webhookManager?: WebhookManager,
): Promise<void> {
  const startMs = Date.now();

  try {
    record.status = 'running';
    record.updatedAt = new Date().toISOString();
    store.set(record.scanId, record);

    // Simulate scan work with a small delay.
    await new Promise((resolve) => setTimeout(resolve, 10));

    const findings: ScanFinding[] = [];
    const report: ScanReport = {
      target: record.target,
      findings,
      summary: {
        total: findings.length,
        bySeverity: {},
      },
      durationMs: Date.now() - startMs,
      completedAt: new Date().toISOString(),
    };

    record.status = 'completed';
    record.result = report;
    record.updatedAt = new Date().toISOString();
    store.set(record.scanId, record);

    if (webhookManager) {
      await webhookManager.notify('scan.completed', {
        scanId: record.scanId,
        target: record.target,
        summary: report.summary,
      });
    }
  } catch (err: unknown) {
    record.status = 'failed';
    record.updatedAt = new Date().toISOString();
    store.set(record.scanId, record);

    if (webhookManager) {
      await webhookManager.notify('scan.failed', {
        scanId: record.scanId,
        target: record.target,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Route factory
// ---------------------------------------------------------------------------

/**
 * Creates the scan API routes.
 *
 * @param store Scan store instance.
 * @param webhookManager Optional webhook manager for event notifications.
 * @returns Array of route definitions.
 */
export function createScanRoutes(
  store: ScanStore,
  webhookManager?: WebhookManager,
): Route[] {
  return [
    {
      method: 'POST',
      pattern: '/api/scan',
      handler(
        _req: IncomingMessage,
        res: ServerResponse,
        params: RouteParams,
      ): void {
        const validation = validateRequest(params.body, scanRequestSchema);
        if (!validation.valid) {
          errorResponse(res, 400, validation.errors.join('; '));
          return;
        }

        const body = params.body as {target: string; config?: ScanConfig};
        const scanId = randomUUID();
        const now = new Date().toISOString();

        const record: ScanRecord = {
          scanId,
          status: 'queued',
          target: body.target,
          config: body.config,
          createdAt: now,
          updatedAt: now,
        };

        store.set(scanId, record);

        // Fire async scan -- intentionally not awaited here since the response
        // is returned immediately. Errors are handled inside executeScan.
        void executeScan(record, store, webhookManager);

        jsonResponse(res, 202, {scanId, status: 'queued'});
      },
    },
    {
      method: 'GET',
      pattern: '/api/scan/:id',
      handler(
        _req: IncomingMessage,
        res: ServerResponse,
        params: RouteParams,
      ): void {
        const id = params.pathParams['id'];
        const record = store.get(id);

        if (!record) {
          errorResponse(res, 404, `Scan not found: ${id}`);
          return;
        }

        const response: Record<string, unknown> = {
          scanId: record.scanId,
          status: record.status,
          target: record.target,
          createdAt: record.createdAt,
          updatedAt: record.updatedAt,
        };

        if (record.result) {
          response.result = record.result;
        }

        jsonResponse(res, 200, response);
      },
    },
  ];
}
