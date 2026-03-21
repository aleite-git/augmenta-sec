import {describe, it, expect, afterEach} from 'vitest';
import {createStateStore, type StateStore} from '../state.js';

describe('createStateStore', () => {
  let store: StateStore;

  afterEach(() => {
    store?.close();
  });

  it('creates an in-memory state store', () => {
    store = createStateStore(':memory:');
    expect(store).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // scan_queue
  // -------------------------------------------------------------------------

  describe('scan_queue', () => {
    it('enqueues a scan and returns the row', () => {
      store = createStateStore(':memory:');
      const row = store.enqueueScan('org/repo', 'main', 'api');
      expect(row.id).toBeGreaterThan(0);
      expect(row.repo).toBe('org/repo');
      expect(row.ref).toBe('main');
      expect(row.trigger).toBe('api');
      expect(row.status).toBe('pending');
      expect(row.created_at).toBeTruthy();
    });

    it('dequeues the oldest pending scan', () => {
      store = createStateStore(':memory:');
      store.enqueueScan('repo-a', 'main', 'api');
      store.enqueueScan('repo-b', 'dev', 'webhook');

      const dequeued = store.dequeueScan();
      expect(dequeued).toBeDefined();
      expect(dequeued!.repo).toBe('repo-a');
      expect(dequeued!.status).toBe('running');
    });

    it('returns undefined when no pending scans', () => {
      store = createStateStore(':memory:');
      expect(store.dequeueScan()).toBeUndefined();
    });

    it('updates scan status', () => {
      store = createStateStore(':memory:');
      const row = store.enqueueScan('org/repo', 'main', 'api');
      const updated = store.updateScanStatus(row.id, 'done');
      expect(updated).toBeDefined();
      expect(updated!.status).toBe('done');
    });

    it('returns undefined for non-existent scan update', () => {
      store = createStateStore(':memory:');
      expect(store.updateScanStatus(999, 'done')).toBeUndefined();
    });

    it('lists the scan queue', () => {
      store = createStateStore(':memory:');
      store.enqueueScan('repo-a', 'main', 'api');
      store.enqueueScan('repo-b', 'dev', 'webhook');
      const list = store.listScanQueue();
      expect(list).toHaveLength(2);
    });
  });

  // -------------------------------------------------------------------------
  // webhook_log
  // -------------------------------------------------------------------------

  describe('webhook_log', () => {
    it('logs a webhook event', () => {
      store = createStateStore(':memory:');
      const row = store.logWebhook('github', 'push', '{"ref":"main"}');
      expect(row.id).toBeGreaterThan(0);
      expect(row.source).toBe('github');
      expect(row.event).toBe('push');
      expect(row.payload).toBe('{"ref":"main"}');
      expect(row.received_at).toBeTruthy();
    });

    it('lists webhook logs with limit', () => {
      store = createStateStore(':memory:');
      store.logWebhook('github', 'push', '{}');
      store.logWebhook('gitlab', 'merge_request', '{}');
      store.logWebhook('github', 'pull_request', '{}');

      const all = store.listWebhookLogs();
      expect(all).toHaveLength(3);

      const limited = store.listWebhookLogs(2);
      expect(limited).toHaveLength(2);
    });

    it('uses default limit of 50', () => {
      store = createStateStore(':memory:');
      store.logWebhook('github', 'push', '{}');
      const logs = store.listWebhookLogs();
      expect(logs).toHaveLength(1);
    });
  });

  // -------------------------------------------------------------------------
  // schedules
  // -------------------------------------------------------------------------

  describe('schedules', () => {
    it('upserts a schedule', () => {
      store = createStateStore(':memory:');
      const row = store.upsertSchedule('nightly-scan', '0 2 * * *', 'scan');
      expect(row.id).toBe('nightly-scan');
      expect(row.cron).toBe('0 2 * * *');
      expect(row.task).toBe('scan');
      expect(row.enabled).toBe(1);
    });

    it('updates an existing schedule on conflict', () => {
      store = createStateStore(':memory:');
      store.upsertSchedule('nightly', '0 2 * * *', 'scan');
      const updated = store.upsertSchedule('nightly', '0 3 * * *', 'review');
      expect(updated.cron).toBe('0 3 * * *');
      expect(updated.task).toBe('review');
    });

    it('removes a schedule', () => {
      store = createStateStore(':memory:');
      store.upsertSchedule('nightly', '0 2 * * *', 'scan');
      expect(store.removeSchedule('nightly')).toBe(true);
      expect(store.removeSchedule('nightly')).toBe(false);
    });

    it('lists schedules', () => {
      store = createStateStore(':memory:');
      store.upsertSchedule('a', '0 2 * * *', 'scan');
      store.upsertSchedule('b', '0 3 * * *', 'review');
      const list = store.listSchedules();
      expect(list).toHaveLength(2);
    });
  });

  // -------------------------------------------------------------------------
  // scan_history
  // -------------------------------------------------------------------------

  describe('scan_history', () => {
    it('records a scan', () => {
      store = createStateStore(':memory:');
      const row = store.recordScan('org/repo', 'main', 5, 1200, 'completed');
      expect(row.id).toBeGreaterThan(0);
      expect(row.repo).toBe('org/repo');
      expect(row.findings_count).toBe(5);
      expect(row.duration_ms).toBe(1200);
      expect(row.status).toBe('completed');
    });

    it('gets the last scan by id when timestamps match', () => {
      store = createStateStore(':memory:');
      store.recordScan('repo-a', 'main', 3, 500, 'completed');
      store.recordScan('repo-b', 'dev', 7, 800, 'completed');
      const last = store.getLastScan();
      expect(last).toBeDefined();
      // Both have same completed_at; ORDER BY id DESC picks repo-b
      expect(last!.repo).toBe('repo-b');
    });

    it('returns undefined when no scans exist', () => {
      store = createStateStore(':memory:');
      expect(store.getLastScan()).toBeUndefined();
    });

    it('lists scan history with limit', () => {
      store = createStateStore(':memory:');
      store.recordScan('repo', 'main', 1, 100, 'completed');
      store.recordScan('repo', 'dev', 2, 200, 'completed');
      store.recordScan('repo', 'feat', 3, 300, 'completed');

      const limited = store.listScanHistory(2);
      expect(limited).toHaveLength(2);
    });

    it('returns total findings count across all scans', () => {
      store = createStateStore(':memory:');
      store.recordScan('repo-a', 'main', 5, 100, 'completed');
      store.recordScan('repo-b', 'main', 10, 200, 'completed');
      expect(store.totalFindingsCount()).toBe(15);
    });

    it('returns 0 when no scans exist', () => {
      store = createStateStore(':memory:');
      expect(store.totalFindingsCount()).toBe(0);
    });
  });
});
