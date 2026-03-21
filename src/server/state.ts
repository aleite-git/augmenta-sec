/**
 * In-memory state store for server mode.
 *
 * Provides scan queue, webhook log, schedule, and scan history storage
 * using plain JavaScript data structures (no external dependencies).
 *
 * @module ASEC-083
 */

// ---------------------------------------------------------------------------
// Row types
// ---------------------------------------------------------------------------

export interface ScanQueueRow {
  id: number;
  repo: string;
  ref: string;
  trigger: string;
  status: 'pending' | 'running' | 'done' | 'failed';
  created_at: string;
  updated_at: string;
}

export interface WebhookLogRow {
  id: number;
  source: string;
  event: string;
  payload: string;
  received_at: string;
}

export interface ScheduleRow {
  id: string;
  cron: string;
  task: string;
  enabled: number;
  created_at: string;
}

export interface ScanHistoryRow {
  id: number;
  repo: string;
  ref: string;
  findings_count: number;
  duration_ms: number;
  status: string;
  completed_at: string;
}

// ---------------------------------------------------------------------------
// StateStore interface
// ---------------------------------------------------------------------------

export interface StateStore {
  // scan_queue
  enqueueScan(repo: string, ref: string, trigger: string): ScanQueueRow;
  dequeueScan(): ScanQueueRow | undefined;
  updateScanStatus(
    id: number,
    status: ScanQueueRow['status'],
  ): ScanQueueRow | undefined;
  listScanQueue(): ScanQueueRow[];

  // webhook_log
  logWebhook(source: string, event: string, payload: string): WebhookLogRow;
  listWebhookLogs(limit?: number): WebhookLogRow[];

  // schedules
  upsertSchedule(id: string, cron: string, task: string): ScheduleRow;
  removeSchedule(id: string): boolean;
  listSchedules(): ScheduleRow[];

  // scan_history
  recordScan(
    repo: string,
    ref: string,
    findingsCount: number,
    durationMs: number,
    status: string,
  ): ScanHistoryRow;
  getLastScan(): ScanHistoryRow | undefined;
  listScanHistory(limit?: number): ScanHistoryRow[];
  totalFindingsCount(): number;

  /** Closes the underlying store (no-op for in-memory). */
  close(): void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function nowIso(): string {
  return new Date().toISOString().replace('T', ' ').replace('Z', '');
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates an in-memory {@link StateStore} implementation.
 *
 * The `_dbPath` parameter is accepted for API compatibility but is ignored;
 * all data is held in memory and lost when the process exits.
 */
export function createStateStore(_dbPath?: string): StateStore {
  // Auto-incrementing ID counters
  let scanIdSeq = 0;
  let webhookIdSeq = 0;
  let historyIdSeq = 0;

  // Storage
  const scanQueue = new Map<number, ScanQueueRow>();
  const webhookLogs: WebhookLogRow[] = [];
  const schedules = new Map<string, ScheduleRow>();
  const scanHistory: ScanHistoryRow[] = [];

  return {
    // -- scan_queue ----------------------------------------------------------

    enqueueScan(repo, ref, trigger) {
      const now = nowIso();
      const row: ScanQueueRow = {
        id: ++scanIdSeq,
        repo,
        ref,
        trigger,
        status: 'pending',
        created_at: now,
        updated_at: now,
      };
      scanQueue.set(row.id, row);
      return {...row};
    },

    dequeueScan() {
      // Find the oldest pending scan
      let oldest: ScanQueueRow | undefined;
      for (const row of scanQueue.values()) {
        if (row.status === 'pending') {
          if (!oldest || row.created_at < oldest.created_at || (row.created_at === oldest.created_at && row.id < oldest.id)) {
            oldest = row;
          }
        }
      }
      if (oldest) {
        oldest.status = 'running';
        oldest.updated_at = nowIso();
        return {...oldest};
      }
      return undefined;
    },

    updateScanStatus(id, status) {
      const row = scanQueue.get(id);
      if (!row) return undefined;
      row.status = status;
      row.updated_at = nowIso();
      return {...row};
    },

    listScanQueue() {
      // Return newest first (ORDER BY created_at DESC)
      return [...scanQueue.values()]
        .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id)
        .map((r) => ({...r}));
    },

    // -- webhook_log ---------------------------------------------------------

    logWebhook(source, event, payload) {
      const row: WebhookLogRow = {
        id: ++webhookIdSeq,
        source,
        event,
        payload,
        received_at: nowIso(),
      };
      webhookLogs.push(row);
      return {...row};
    },

    listWebhookLogs(limit = 50) {
      // Return newest first, limited
      return webhookLogs
        .slice()
        .reverse()
        .slice(0, limit)
        .map((r) => ({...r}));
    },

    // -- schedules -----------------------------------------------------------

    upsertSchedule(id, cron, task) {
      const existing = schedules.get(id);
      if (existing) {
        existing.cron = cron;
        existing.task = task;
        existing.enabled = 1;
        return {...existing};
      }
      const row: ScheduleRow = {
        id,
        cron,
        task,
        enabled: 1,
        created_at: nowIso(),
      };
      schedules.set(id, row);
      return {...row};
    },

    removeSchedule(id) {
      return schedules.delete(id);
    },

    listSchedules() {
      // Return sorted by created_at
      return [...schedules.values()]
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .map((r) => ({...r}));
    },

    // -- scan_history --------------------------------------------------------

    recordScan(repo, ref, findingsCount, durationMs, status) {
      const row: ScanHistoryRow = {
        id: ++historyIdSeq,
        repo,
        ref,
        findings_count: findingsCount,
        duration_ms: durationMs,
        status,
        completed_at: nowIso(),
      };
      scanHistory.push(row);
      return {...row};
    },

    getLastScan() {
      if (scanHistory.length === 0) return undefined;
      // Most recent by completed_at DESC, id DESC
      const sorted = scanHistory
        .slice()
        .sort((a, b) => b.completed_at.localeCompare(a.completed_at) || b.id - a.id);
      return {...sorted[0]};
    },

    listScanHistory(limit = 50) {
      return scanHistory
        .slice()
        .sort((a, b) => b.completed_at.localeCompare(a.completed_at) || b.id - a.id)
        .slice(0, limit)
        .map((r) => ({...r}));
    },

    totalFindingsCount() {
      return scanHistory.reduce((sum, r) => sum + r.findings_count, 0);
    },

    close() {
      // No-op for in-memory store
    },
  };
}
