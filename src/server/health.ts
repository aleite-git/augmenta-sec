/**
 * Health and status endpoint handlers.
 *
 * - `/health`  -- lightweight liveness probe.
 * - `/status`  -- richer operational status.
 *
 * @module ASEC-085
 */

import type {StateStore} from './state.js';

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

export interface HealthResponse {
  status: 'ok' | 'degraded' | 'error';
  uptime: number;
  version: string;
}

export interface StatusResponse {
  lastScanTime: string | null;
  findingsCount: number;
  scheduledJobs: number;
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/**
 * Returns a {@link HealthResponse}.
 *
 * `startTime` is the UNIX-ms epoch when the server started; the handler
 * derives `uptime` (in seconds) from `Date.now() - startTime`.
 */
export function handleHealth(
  startTime: number,
  version: string,
): HealthResponse {
  return {
    status: 'ok',
    uptime: Math.floor((Date.now() - startTime) / 1000),
    version,
  };
}

/**
 * Returns a {@link StatusResponse} drawn from the persistent state store.
 */
export function handleStatus(store: StateStore): StatusResponse {
  const lastScan = store.getLastScan();
  return {
    lastScanTime: lastScan?.completed_at ?? null,
    findingsCount: store.totalFindingsCount(),
    scheduledJobs: store.listSchedules().length,
  };
}
