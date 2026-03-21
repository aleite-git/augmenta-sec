/**
 * Trend storage and analysis for AugmentaSec scan history.
 *
 * Stores scan snapshots in `.augmenta-sec/history/` as JSON files
 * and computes trend lines across scans.
 */

import {mkdir, readdir, readFile, writeFile} from 'node:fs/promises';
import {join} from 'node:path';

import type {
  FindingsReport,
  FindingsSummary,
  Severity,
} from '../findings/types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A snapshot of a single scan stored in history. */
export interface ScanSnapshot {
  /** Unique scan identifier (ISO timestamp-based filename). */
  id: string;
  /** ISO 8601 timestamp when the scan was recorded. */
  timestamp: string;
  /** Target that was scanned. */
  target: string;
  /** Summary counts from the scan. */
  summary: FindingsSummary;
}

/** A single data point on a trend line. */
export interface TrendPoint {
  /** ISO 8601 timestamp. */
  timestamp: string;
  /** The value at this point. */
  value: number;
}

/** A named trend line with data points. */
export interface TrendLine {
  /** Metric name, e.g. "total", "critical", "high". */
  metric: string;
  /** Ordered data points (oldest first). */
  points: TrendPoint[];
  /** Direction of the trend: improving (fewer findings), worsening, or stable. */
  direction: 'improving' | 'worsening' | 'stable';
}

/** Aggregated trend report returned by getTrends. */
export interface TrendReport {
  scans: ScanSnapshot[];
  trends: TrendLine[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HISTORY_DIR = '.augmenta-sec/history';
const SEVERITY_METRICS: Severity[] = [
  'critical',
  'high',
  'medium',
  'low',
  'informational',
];
const DEFAULT_TREND_COUNT = 10;

// ---------------------------------------------------------------------------
// TrendStore
// ---------------------------------------------------------------------------

/**
 * Manages scan history persistence and trend computation.
 *
 * History files are stored as `<ISO-timestamp>.json` under the
 * `.augmenta-sec/history/` directory relative to the given base path.
 */
export class TrendStore {
  private readonly historyPath: string;

  constructor(basePath: string) {
    this.historyPath = join(basePath, HISTORY_DIR);
  }

  /**
   * Records a scan report as a snapshot in history.
   *
   * @returns The persisted ScanSnapshot.
   */
  async recordScan(report: FindingsReport): Promise<ScanSnapshot> {
    await mkdir(this.historyPath, {recursive: true});

    const timestamp = report.generatedAt || new Date().toISOString();
    const id = sanitizeFilename(timestamp);
    const snapshot: ScanSnapshot = {
      id,
      timestamp,
      target: report.target,
      summary: report.summary,
    };

    const filePath = join(this.historyPath, `${id}.json`);
    await writeFile(filePath, JSON.stringify(snapshot, null, 2), 'utf-8');
    return snapshot;
  }

  /**
   * Loads all stored snapshots, ordered by timestamp (oldest first).
   */
  async loadSnapshots(): Promise<ScanSnapshot[]> {
    let entries: string[];
    try {
      entries = await readdir(this.historyPath);
    } catch {
      return [];
    }

    const jsonFiles = entries
      .filter(f => f.endsWith('.json'))
      .sort();

    const snapshots: ScanSnapshot[] = [];
    for (const file of jsonFiles) {
      const raw = await readFile(join(this.historyPath, file), 'utf-8');
      snapshots.push(JSON.parse(raw) as ScanSnapshot);
    }
    return snapshots;
  }

  /**
   * Computes a TrendReport from the most recent `count` scans.
   *
   * @param count Maximum number of scans to include (default 10).
   */
  async getTrends(count: number = DEFAULT_TREND_COUNT): Promise<TrendReport> {
    const allSnapshots = await this.loadSnapshots();
    const scans = allSnapshots.slice(-count);

    const trends: TrendLine[] = [];

    // Total findings trend
    trends.push(
      buildTrendLine(
        'total',
        scans.map(s => ({timestamp: s.timestamp, value: s.summary.total})),
      ),
    );

    // Per-severity trends
    for (const severity of SEVERITY_METRICS) {
      trends.push(
        buildTrendLine(
          severity,
          scans.map(s => ({
            timestamp: s.timestamp,
            value: s.summary.bySeverity[severity] ?? 0,
          })),
        ),
      );
    }

    return {scans, trends};
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Sanitizes an ISO timestamp into a safe filename component. */
function sanitizeFilename(timestamp: string): string {
  return timestamp.replace(/[:.]/g, '-');
}

/**
 * Builds a TrendLine from an ordered list of points, determining direction
 * by comparing the first and last values.
 */
function buildTrendLine(metric: string, points: TrendPoint[]): TrendLine {
  const direction = computeDirection(points);
  return {metric, points, direction};
}

/**
 * Determines trend direction by comparing first and last data points.
 * Fewer findings = improving. More findings = worsening. Equal = stable.
 */
function computeDirection(
  points: TrendPoint[],
): 'improving' | 'worsening' | 'stable' {
  if (points.length < 2) {
    return 'stable';
  }
  const first = points[0].value;
  const last = points[points.length - 1].value;
  if (last < first) return 'improving';
  if (last > first) return 'worsening';
  return 'stable';
}

// Exported for testing
export {sanitizeFilename, buildTrendLine, computeDirection};
