/**
 * Lightweight cron-style scheduler.
 *
 * Uses a simple cron parser (minute, hour, day-of-month, month, day-of-week)
 * and `setInterval` for tick-based evaluation.
 *
 * @module ASEC-082
 */

import {randomUUID} from 'node:crypto';

// ---------------------------------------------------------------------------
// Cron parsing
// ---------------------------------------------------------------------------

export interface CronFields {
  minute: number[] | null; // null => wildcard (every)
  hour: number[] | null;
  dayOfMonth: number[] | null;
  month: number[] | null;
  dayOfWeek: number[] | null;
}

/**
 * Parses a **5-field** cron expression into a structured representation.
 *
 * Supported syntax per field:
 * - `*`       -- every value
 * - `N`       -- exact value
 * - `N,M,...` -- list
 * - `N-M`     -- inclusive range
 * - `*\/N`    -- step (every N)
 *
 * @throws {Error} if the expression cannot be parsed.
 */
export function parseCron(expression: string): CronFields {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) {
    throw new Error(
      `Invalid cron expression "${expression}": expected 5 fields, got ${parts.length}`,
    );
  }

  const ranges: Array<{min: number; max: number}> = [
    {min: 0, max: 59}, // minute
    {min: 0, max: 23}, // hour
    {min: 1, max: 31}, // day of month
    {min: 1, max: 12}, // month
    {min: 0, max: 6}, // day of week (0=Sun)
  ];

  const parsed = parts.map((field, idx) => parseField(field, ranges[idx]));

  return {
    minute: parsed[0],
    hour: parsed[1],
    dayOfMonth: parsed[2],
    month: parsed[3],
    dayOfWeek: parsed[4],
  };
}

function parseField(
  field: string,
  range: {min: number; max: number},
): number[] | null {
  if (field === '*') return null;

  // Step: */N
  if (field.startsWith('*/')) {
    const step = parseInt(field.slice(2), 10);
    if (isNaN(step) || step <= 0) {
      throw new Error(`Invalid step in cron field "${field}"`);
    }
    const values: number[] = [];
    for (let i = range.min; i <= range.max; i += step) {
      values.push(i);
    }
    return values;
  }

  // List: N,M,...
  if (field.includes(',')) {
    return field.split(',').map((v) => {
      const n = parseInt(v, 10);
      validateRange(n, range, field);
      return n;
    });
  }

  // Range: N-M
  if (field.includes('-')) {
    const [startStr, endStr] = field.split('-');
    const start = parseInt(startStr, 10);
    const end = parseInt(endStr, 10);
    validateRange(start, range, field);
    validateRange(end, range, field);
    if (start > end) {
      throw new Error(`Invalid range in cron field "${field}"`);
    }
    const values: number[] = [];
    for (let i = start; i <= end; i++) {
      values.push(i);
    }
    return values;
  }

  // Single value
  const n = parseInt(field, 10);
  validateRange(n, range, field);
  return [n];
}

function validateRange(
  value: number,
  range: {min: number; max: number},
  field: string,
): void {
  if (isNaN(value) || value < range.min || value > range.max) {
    throw new Error(
      `Value ${value} out of range [${range.min}-${range.max}] in cron field "${field}"`,
    );
  }
}

/**
 * Returns `true` when `date` matches the given parsed cron fields.
 */
export function cronMatches(fields: CronFields, date: Date): boolean {
  const minute = date.getMinutes();
  const hour = date.getHours();
  const dayOfMonth = date.getDate();
  const month = date.getMonth() + 1; // JS months are 0-based
  const dayOfWeek = date.getDay(); // 0=Sun

  if (fields.minute !== null && !fields.minute.includes(minute)) return false;
  if (fields.hour !== null && !fields.hour.includes(hour)) return false;
  if (fields.dayOfMonth !== null && !fields.dayOfMonth.includes(dayOfMonth)) {
    return false;
  }
  if (fields.month !== null && !fields.month.includes(month)) return false;
  if (fields.dayOfWeek !== null && !fields.dayOfWeek.includes(dayOfWeek)) {
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Scheduler
// ---------------------------------------------------------------------------

export interface ScheduledJob {
  id: string;
  cron: string;
  fields: CronFields;
  task: () => void | Promise<void>;
}

export interface Scheduler {
  /**
   * Registers a task to run when `cron` matches. Returns the job id.
   * If `id` is omitted a UUID is generated.
   */
  schedule(
    cron: string,
    task: () => void | Promise<void>,
    id?: string,
  ): string;

  /** Cancels a scheduled job. Returns `true` if found. */
  cancel(id: string): boolean;

  /** Returns a snapshot of all registered jobs. */
  listJobs(): Array<{id: string; cron: string}>;

  /** Stops the internal tick timer. Call when shutting down the server. */
  stop(): void;
}

/**
 * Creates a new {@link Scheduler}.
 *
 * The scheduler checks all registered jobs once per minute (configurable
 * via `tickMs` for testing).
 */
export function createScheduler(tickMs = 60_000): Scheduler {
  const jobs = new Map<string, ScheduledJob>();
  let lastTickMinute = -1;

  function tick(): void {
    const now = new Date();
    const currentMinute = now.getMinutes();

    // Prevent duplicate firings within the same clock minute.
    if (currentMinute === lastTickMinute) return;
    lastTickMinute = currentMinute;

    for (const job of jobs.values()) {
      if (cronMatches(job.fields, now)) {
        // Fire-and-log pattern: we intentionally catch so one failing job
        // does not block others.
        Promise.resolve(job.task()).catch((err) => {
          console.error(`[scheduler] job ${job.id} failed:`, err);
        });
      }
    }
  }

  const timer = setInterval(tick, tickMs);
  // Unref so the timer does not prevent Node from exiting.
  if (typeof timer === 'object' && 'unref' in timer) {
    timer.unref();
  }

  return {
    schedule(cron, task, id) {
      const jobId = id ?? randomUUID();
      const fields = parseCron(cron);
      jobs.set(jobId, {id: jobId, cron, fields, task});
      return jobId;
    },

    cancel(id) {
      return jobs.delete(id);
    },

    listJobs() {
      return [...jobs.values()].map((j) => ({id: j.id, cron: j.cron}));
    },

    stop() {
      clearInterval(timer);
    },
  };
}
