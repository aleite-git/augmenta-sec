import {describe, it, expect, vi, afterEach} from 'vitest';
import {
  parseCron,
  cronMatches,
  createScheduler,
  type CronFields,
} from '../scheduler.js';

// ---------------------------------------------------------------------------
// parseCron
// ---------------------------------------------------------------------------

describe('parseCron', () => {
  it('parses a simple wildcard expression', () => {
    const fields = parseCron('* * * * *');
    expect(fields.minute).toBeNull();
    expect(fields.hour).toBeNull();
    expect(fields.dayOfMonth).toBeNull();
    expect(fields.month).toBeNull();
    expect(fields.dayOfWeek).toBeNull();
  });

  it('parses exact values', () => {
    const fields = parseCron('30 2 15 6 3');
    expect(fields.minute).toEqual([30]);
    expect(fields.hour).toEqual([2]);
    expect(fields.dayOfMonth).toEqual([15]);
    expect(fields.month).toEqual([6]);
    expect(fields.dayOfWeek).toEqual([3]);
  });

  it('parses step expressions', () => {
    const fields = parseCron('*/15 */6 * * *');
    expect(fields.minute).toEqual([0, 15, 30, 45]);
    expect(fields.hour).toEqual([0, 6, 12, 18]);
  });

  it('parses comma-separated lists', () => {
    const fields = parseCron('0,30 9,17 * * *');
    expect(fields.minute).toEqual([0, 30]);
    expect(fields.hour).toEqual([9, 17]);
  });

  it('parses ranges', () => {
    const fields = parseCron('0 9-17 * * *');
    expect(fields.minute).toEqual([0]);
    expect(fields.hour).toEqual([9, 10, 11, 12, 13, 14, 15, 16, 17]);
  });

  it('throws on wrong number of fields', () => {
    expect(() => parseCron('* * *')).toThrow('expected 5 fields, got 3');
    expect(() => parseCron('* * * * * *')).toThrow('expected 5 fields, got 6');
  });

  it('throws on invalid step', () => {
    expect(() => parseCron('*/0 * * * *')).toThrow('Invalid step');
    expect(() => parseCron('*/abc * * * *')).toThrow('Invalid step');
  });

  it('throws on out-of-range values', () => {
    expect(() => parseCron('60 * * * *')).toThrow('out of range');
    expect(() => parseCron('* 25 * * *')).toThrow('out of range');
    expect(() => parseCron('* * 0 * *')).toThrow('out of range');
    expect(() => parseCron('* * * 13 *')).toThrow('out of range');
    expect(() => parseCron('* * * * 7')).toThrow('out of range');
  });

  it('throws on invalid range (start > end)', () => {
    expect(() => parseCron('* 17-9 * * *')).toThrow('Invalid range');
  });

  it('throws on non-numeric values in list', () => {
    expect(() => parseCron('a,b * * * *')).toThrow('out of range');
  });
});

// ---------------------------------------------------------------------------
// cronMatches
// ---------------------------------------------------------------------------

describe('cronMatches', () => {
  it('wildcard matches any date', () => {
    const fields: CronFields = {
      minute: null,
      hour: null,
      dayOfMonth: null,
      month: null,
      dayOfWeek: null,
    };
    expect(cronMatches(fields, new Date('2026-03-21T14:30:00'))).toBe(true);
    expect(cronMatches(fields, new Date('2025-01-01T00:00:00'))).toBe(true);
  });

  it('matches exact minute and hour', () => {
    const fields = parseCron('30 14 * * *');
    expect(cronMatches(fields, new Date('2026-03-21T14:30:00'))).toBe(true);
    expect(cronMatches(fields, new Date('2026-03-21T14:31:00'))).toBe(false);
    expect(cronMatches(fields, new Date('2026-03-21T15:30:00'))).toBe(false);
  });

  it('matches day of week', () => {
    const fields = parseCron('0 0 * * 1'); // Monday
    // 2026-03-23 is a Monday
    expect(cronMatches(fields, new Date('2026-03-23T00:00:00'))).toBe(true);
    // 2026-03-21 is a Saturday
    expect(cronMatches(fields, new Date('2026-03-21T00:00:00'))).toBe(false);
  });

  it('matches month', () => {
    const fields = parseCron('0 0 1 1 *'); // Jan 1 midnight
    expect(cronMatches(fields, new Date('2026-01-01T00:00:00'))).toBe(true);
    expect(cronMatches(fields, new Date('2026-02-01T00:00:00'))).toBe(false);
  });

  it('matches step expressions', () => {
    const fields = parseCron('*/15 * * * *');
    expect(cronMatches(fields, new Date('2026-03-21T00:00:00'))).toBe(true);
    expect(cronMatches(fields, new Date('2026-03-21T00:15:00'))).toBe(true);
    expect(cronMatches(fields, new Date('2026-03-21T00:07:00'))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// createScheduler
// ---------------------------------------------------------------------------

describe('createScheduler', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('schedules and lists jobs', () => {
    const scheduler = createScheduler(60_000);
    const id = scheduler.schedule('0 * * * *', () => {});
    const jobs = scheduler.listJobs();
    expect(jobs).toHaveLength(1);
    expect(jobs[0].id).toBe(id);
    expect(jobs[0].cron).toBe('0 * * * *');
    scheduler.stop();
  });

  it('accepts a custom id', () => {
    const scheduler = createScheduler(60_000);
    const id = scheduler.schedule('0 * * * *', () => {}, 'my-job');
    expect(id).toBe('my-job');
    scheduler.stop();
  });

  it('cancels a job', () => {
    const scheduler = createScheduler(60_000);
    const id = scheduler.schedule('0 * * * *', () => {});
    expect(scheduler.cancel(id)).toBe(true);
    expect(scheduler.cancel(id)).toBe(false);
    expect(scheduler.listJobs()).toHaveLength(0);
    scheduler.stop();
  });

  it('cancelling a non-existent job returns false', () => {
    const scheduler = createScheduler(60_000);
    expect(scheduler.cancel('non-existent')).toBe(false);
    scheduler.stop();
  });

  it('generates unique ids for multiple jobs', () => {
    const scheduler = createScheduler(60_000);
    const id1 = scheduler.schedule('0 * * * *', () => {});
    const id2 = scheduler.schedule('30 * * * *', () => {});
    expect(id1).not.toBe(id2);
    expect(scheduler.listJobs()).toHaveLength(2);
    scheduler.stop();
  });

  it('stops without error', () => {
    const scheduler = createScheduler(60_000);
    scheduler.schedule('* * * * *', () => {});
    expect(() => scheduler.stop()).not.toThrow();
  });

  it('fires tasks when cron matches', async () => {
    vi.useFakeTimers();
    const now = new Date('2026-03-21T14:30:00');
    vi.setSystemTime(now);

    const task = vi.fn();
    const scheduler = createScheduler(100);
    scheduler.schedule('30 14 * * *', task);

    await vi.advanceTimersByTimeAsync(150);

    expect(task).toHaveBeenCalledTimes(1);
    scheduler.stop();
  });

  it('does not fire tasks when cron does not match', async () => {
    vi.useFakeTimers();
    const now = new Date('2026-03-21T14:31:00');
    vi.setSystemTime(now);

    const task = vi.fn();
    const scheduler = createScheduler(100);
    scheduler.schedule('30 14 * * *', task);

    await vi.advanceTimersByTimeAsync(150);

    expect(task).not.toHaveBeenCalled();
    scheduler.stop();
  });

  it('does not fire the same job twice in the same minute', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-21T14:30:00'));

    const task = vi.fn();
    const scheduler = createScheduler(100);
    scheduler.schedule('30 14 * * *', task);

    // Two ticks in the same minute
    await vi.advanceTimersByTimeAsync(250);

    expect(task).toHaveBeenCalledTimes(1);
    scheduler.stop();
  });

  it('handles async task errors gracefully', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-21T14:30:00'));

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const scheduler = createScheduler(100);
    scheduler.schedule('30 14 * * *', async () => {
      throw new Error('task failed');
    });

    await vi.advanceTimersByTimeAsync(150);
    await vi.advanceTimersByTimeAsync(10);

    scheduler.stop();
    consoleSpy.mockRestore();
  });
});
