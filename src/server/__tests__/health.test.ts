import {describe, it, expect, afterEach} from 'vitest';
import {handleHealth, handleStatus} from '../health.js';
import {createStateStore, type StateStore} from '../state.js';

describe('handleHealth', () => {
  it('returns ok status with uptime and version', () => {
    const startTime = Date.now() - 5000;
    const result = handleHealth(startTime, '1.2.3');

    expect(result.status).toBe('ok');
    expect(result.version).toBe('1.2.3');
    expect(result.uptime).toBeGreaterThanOrEqual(4);
    expect(result.uptime).toBeLessThanOrEqual(6);
  });

  it('calculates uptime correctly for zero elapsed time', () => {
    const result = handleHealth(Date.now(), '0.1.0');
    expect(result.uptime).toBe(0);
  });

  it('returns integer uptime in seconds', () => {
    const startTime = Date.now() - 3500;
    const result = handleHealth(startTime, '0.1.0');
    expect(Number.isInteger(result.uptime)).toBe(true);
    expect(result.uptime).toBe(3);
  });
});

describe('handleStatus', () => {
  let store: StateStore;

  afterEach(() => {
    store?.close();
  });

  it('returns null lastScanTime when no scans exist', () => {
    store = createStateStore(':memory:');
    const result = handleStatus(store);

    expect(result.lastScanTime).toBeNull();
    expect(result.findingsCount).toBe(0);
    expect(result.scheduledJobs).toBe(0);
  });

  it('returns last scan time from history', () => {
    store = createStateStore(':memory:');
    store.recordScan('org/repo', 'main', 5, 1000, 'completed');

    const result = handleStatus(store);
    expect(result.lastScanTime).toBeTruthy();
    expect(result.findingsCount).toBe(5);
  });

  it('returns aggregate findings count', () => {
    store = createStateStore(':memory:');
    store.recordScan('repo-a', 'main', 3, 100, 'completed');
    store.recordScan('repo-b', 'dev', 7, 200, 'completed');

    const result = handleStatus(store);
    expect(result.findingsCount).toBe(10);
  });

  it('counts scheduled jobs', () => {
    store = createStateStore(':memory:');
    store.upsertSchedule('nightly', '0 2 * * *', 'scan');
    store.upsertSchedule('weekly', '0 0 * * 1', 'review');

    const result = handleStatus(store);
    expect(result.scheduledJobs).toBe(2);
  });
});
