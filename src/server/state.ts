/**
 * Persistent state store backed by SQLite (better-sqlite3).
 *
 * Tables: scan_queue, webhook_log, schedules, scan_history.
 *
 * @module ASEC-083
 */

import Database from 'better-sqlite3';

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

  /** Closes the underlying database connection. */
  close(): void;
}

// ---------------------------------------------------------------------------
// Schema DDL
// ---------------------------------------------------------------------------

const SCHEMA_DDL = `
CREATE TABLE IF NOT EXISTS scan_queue (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  repo       TEXT    NOT NULL,
  ref        TEXT    NOT NULL,
  trigger    TEXT    NOT NULL,
  status     TEXT    NOT NULL DEFAULT 'pending',
  created_at TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS webhook_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  source      TEXT NOT NULL,
  event       TEXT NOT NULL,
  payload     TEXT NOT NULL,
  received_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS schedules (
  id         TEXT PRIMARY KEY,
  cron       TEXT    NOT NULL,
  task       TEXT    NOT NULL,
  enabled    INTEGER NOT NULL DEFAULT 1,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS scan_history (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  repo           TEXT    NOT NULL,
  ref            TEXT    NOT NULL,
  findings_count INTEGER NOT NULL DEFAULT 0,
  duration_ms    INTEGER NOT NULL DEFAULT 0,
  status         TEXT    NOT NULL,
  completed_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);
`;

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Opens (or creates) a SQLite database at `dbPath` and returns a
 * {@link StateStore} implementation.
 *
 * Pass `':memory:'` for an ephemeral in-memory store (useful for tests).
 */
export function createStateStore(dbPath: string): StateStore {
  const db = new Database(dbPath);

  // Enable WAL for better concurrent read/write performance.
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA_DDL);

  // -- prepared statements ---------------------------------------------------

  const insertScan = db.prepare<[string, string, string]>(
    `INSERT INTO scan_queue (repo, ref, trigger) VALUES (?, ?, ?)`,
  );
  const selectScanById = db.prepare<[number]>(
    `SELECT * FROM scan_queue WHERE id = ?`,
  );
  const selectPending = db.prepare(
    `SELECT * FROM scan_queue WHERE status = 'pending' ORDER BY created_at ASC LIMIT 1`,
  );
  const updateStatus = db.prepare<[string, number]>(
    `UPDATE scan_queue SET status = ?, updated_at = datetime('now') WHERE id = ?`,
  );
  const selectQueue = db.prepare(
    `SELECT * FROM scan_queue ORDER BY created_at DESC`,
  );

  const insertWebhook = db.prepare<[string, string, string]>(
    `INSERT INTO webhook_log (source, event, payload) VALUES (?, ?, ?)`,
  );
  const selectWebhookById = db.prepare<[number]>(
    `SELECT * FROM webhook_log WHERE id = ?`,
  );
  const selectWebhooks = db.prepare<[number]>(
    `SELECT * FROM webhook_log ORDER BY received_at DESC LIMIT ?`,
  );

  const upsertSched = db.prepare<[string, string, string]>(
    `INSERT INTO schedules (id, cron, task) VALUES (?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET cron = excluded.cron, task = excluded.task, enabled = 1`,
  );
  const deleteSched = db.prepare<[string]>(
    `DELETE FROM schedules WHERE id = ?`,
  );
  const selectScheds = db.prepare(
    `SELECT * FROM schedules ORDER BY created_at`,
  );
  const selectSchedById = db.prepare<[string]>(
    `SELECT * FROM schedules WHERE id = ?`,
  );

  const insertHistory = db.prepare<[string, string, number, number, string]>(
    `INSERT INTO scan_history (repo, ref, findings_count, duration_ms, status) VALUES (?, ?, ?, ?, ?)`,
  );
  const selectHistoryById = db.prepare<[number]>(
    `SELECT * FROM scan_history WHERE id = ?`,
  );
  const selectLastScan = db.prepare(
    `SELECT * FROM scan_history ORDER BY completed_at DESC, id DESC LIMIT 1`,
  );
  const selectHistory = db.prepare<[number]>(
    `SELECT * FROM scan_history ORDER BY completed_at DESC, id DESC LIMIT ?`,
  );
  const countFindings = db.prepare(
    `SELECT COALESCE(SUM(findings_count), 0) AS total FROM scan_history`,
  );

  // -- implementation --------------------------------------------------------

  return {
    enqueueScan(repo, ref, trigger) {
      const info = insertScan.run(repo, ref, trigger);
      return selectScanById.get(info.lastInsertRowid as number) as ScanQueueRow;
    },

    dequeueScan() {
      const row = selectPending.get() as ScanQueueRow | undefined;
      if (row) {
        updateStatus.run('running', row.id);
        return {...row, status: 'running' as const};
      }
      return undefined;
    },

    updateScanStatus(id, status) {
      const changes = updateStatus.run(status, id).changes;
      if (changes === 0) return undefined;
      return selectScanById.get(id) as ScanQueueRow;
    },

    listScanQueue() {
      return selectQueue.all() as ScanQueueRow[];
    },

    logWebhook(source, event, payload) {
      const info = insertWebhook.run(source, event, payload);
      return selectWebhookById.get(
        info.lastInsertRowid as number,
      ) as WebhookLogRow;
    },

    listWebhookLogs(limit = 50) {
      return selectWebhooks.all(limit) as WebhookLogRow[];
    },

    upsertSchedule(id, cron, task) {
      upsertSched.run(id, cron, task);
      return selectSchedById.get(id) as ScheduleRow;
    },

    removeSchedule(id) {
      return deleteSched.run(id).changes > 0;
    },

    listSchedules() {
      return selectScheds.all() as ScheduleRow[];
    },

    recordScan(repo, ref, findingsCount, durationMs, status) {
      const info = insertHistory.run(
        repo,
        ref,
        findingsCount,
        durationMs,
        status,
      );
      return selectHistoryById.get(
        info.lastInsertRowid as number,
      ) as ScanHistoryRow;
    },

    getLastScan() {
      return selectLastScan.get() as ScanHistoryRow | undefined;
    },

    listScanHistory(limit = 50) {
      return selectHistory.all(limit) as ScanHistoryRow[];
    },

    totalFindingsCount() {
      const row = countFindings.get() as {total: number};
      return row.total;
    },

    close() {
      db.close();
    },
  };
}
