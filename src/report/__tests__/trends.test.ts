import {describe, it, expect, beforeEach, afterEach} from 'vitest';
import {mkdtemp, rm, readdir, readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';

import {
  TrendStore,
  sanitizeFilename,
  buildTrendLine,
  computeDirection,
} from '../trends.js';
import type {ScanSnapshot, TrendPoint} from '../trends.js';
import type {FindingsReport, FindingsSummary} from '../../findings/types.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeSummary(overrides: Partial<FindingsSummary> = {}): FindingsSummary {
  return {
    total: 10,
    bySeverity: {
      critical: 1,
      high: 2,
      medium: 3,
      low: 3,
      informational: 1,
    },
    byCategory: {injection: 5, auth: 3, pii: 2},
    bySource: {scanner: 6, llm: 3, manual: 1},
    ...overrides,
  };
}

function makeReport(overrides: Partial<FindingsReport> = {}): FindingsReport {
  return {
    version: '1.0.0',
    generatedAt: '2026-03-01T10:00:00.000Z',
    target: '/tmp/test-project',
    summary: makeSummary(),
    findings: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// sanitizeFilename
// ---------------------------------------------------------------------------

describe('sanitizeFilename', () => {
  it('replaces colons and dots with dashes', () => {
    expect(sanitizeFilename('2026-03-01T10:00:00.000Z')).toBe(
      '2026-03-01T10-00-00-000Z',
    );
  });

  it('handles strings without special characters', () => {
    expect(sanitizeFilename('no-special-chars')).toBe('no-special-chars');
  });

  it('handles empty string', () => {
    expect(sanitizeFilename('')).toBe('');
  });
});

// ---------------------------------------------------------------------------
// computeDirection
// ---------------------------------------------------------------------------

describe('computeDirection', () => {
  it('returns stable for empty points', () => {
    expect(computeDirection([])).toBe('stable');
  });

  it('returns stable for a single point', () => {
    expect(computeDirection([{timestamp: '2026-01-01', value: 5}])).toBe(
      'stable',
    );
  });

  it('returns improving when last is less than first', () => {
    const points: TrendPoint[] = [
      {timestamp: '2026-01-01', value: 10},
      {timestamp: '2026-01-02', value: 5},
    ];
    expect(computeDirection(points)).toBe('improving');
  });

  it('returns worsening when last is greater than first', () => {
    const points: TrendPoint[] = [
      {timestamp: '2026-01-01', value: 5},
      {timestamp: '2026-01-02', value: 10},
    ];
    expect(computeDirection(points)).toBe('worsening');
  });

  it('returns stable when first and last are equal', () => {
    const points: TrendPoint[] = [
      {timestamp: '2026-01-01', value: 5},
      {timestamp: '2026-01-02', value: 8},
      {timestamp: '2026-01-03', value: 5},
    ];
    expect(computeDirection(points)).toBe('stable');
  });
});

// ---------------------------------------------------------------------------
// buildTrendLine
// ---------------------------------------------------------------------------

describe('buildTrendLine', () => {
  it('builds a trend line with correct metric and direction', () => {
    const points: TrendPoint[] = [
      {timestamp: '2026-01-01', value: 10},
      {timestamp: '2026-01-02', value: 7},
      {timestamp: '2026-01-03', value: 3},
    ];
    const line = buildTrendLine('total', points);
    expect(line.metric).toBe('total');
    expect(line.points).toBe(points);
    expect(line.direction).toBe('improving');
  });

  it('handles empty points', () => {
    const line = buildTrendLine('critical', []);
    expect(line.metric).toBe('critical');
    expect(line.points).toHaveLength(0);
    expect(line.direction).toBe('stable');
  });
});

// ---------------------------------------------------------------------------
// TrendStore
// ---------------------------------------------------------------------------

describe('TrendStore', () => {
  let tmpDir: string;
  let store: TrendStore;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'asec-trends-'));
    store = new TrendStore(tmpDir);
  });

  afterEach(async () => {
    await rm(tmpDir, {recursive: true, force: true});
  });

  describe('recordScan', () => {
    it('creates the history directory and writes a snapshot file', async () => {
      const report = makeReport();
      const snapshot = await store.recordScan(report);

      expect(snapshot.id).toBe('2026-03-01T10-00-00-000Z');
      expect(snapshot.timestamp).toBe('2026-03-01T10:00:00.000Z');
      expect(snapshot.target).toBe('/tmp/test-project');
      expect(snapshot.summary.total).toBe(10);

      const historyDir = join(tmpDir, '.augmenta-sec', 'history');
      const files = await readdir(historyDir);
      expect(files).toContain('2026-03-01T10-00-00-000Z.json');

      const raw = await readFile(join(historyDir, files[0]), 'utf-8');
      const parsed = JSON.parse(raw) as ScanSnapshot;
      expect(parsed.id).toBe(snapshot.id);
    });

    it('records multiple scans as separate files', async () => {
      await store.recordScan(
        makeReport({generatedAt: '2026-03-01T10:00:00.000Z'}),
      );
      await store.recordScan(
        makeReport({generatedAt: '2026-03-02T10:00:00.000Z'}),
      );
      await store.recordScan(
        makeReport({generatedAt: '2026-03-03T10:00:00.000Z'}),
      );

      const historyDir = join(tmpDir, '.augmenta-sec', 'history');
      const files = await readdir(historyDir);
      expect(files).toHaveLength(3);
    });

    it('uses current time when generatedAt is empty', async () => {
      const report = makeReport({generatedAt: ''});
      const snapshot = await store.recordScan(report);

      expect(snapshot.timestamp).toBeTruthy();
      expect(new Date(snapshot.timestamp).toISOString()).toBeTruthy();
    });
  });

  describe('loadSnapshots', () => {
    it('returns empty array when history directory does not exist', async () => {
      const snapshots = await store.loadSnapshots();
      expect(snapshots).toEqual([]);
    });

    it('loads snapshots sorted by filename (oldest first)', async () => {
      await store.recordScan(
        makeReport({generatedAt: '2026-03-03T10:00:00.000Z'}),
      );
      await store.recordScan(
        makeReport({generatedAt: '2026-03-01T10:00:00.000Z'}),
      );
      await store.recordScan(
        makeReport({generatedAt: '2026-03-02T10:00:00.000Z'}),
      );

      const snapshots = await store.loadSnapshots();
      expect(snapshots).toHaveLength(3);
      expect(snapshots[0].timestamp).toBe('2026-03-01T10:00:00.000Z');
      expect(snapshots[1].timestamp).toBe('2026-03-02T10:00:00.000Z');
      expect(snapshots[2].timestamp).toBe('2026-03-03T10:00:00.000Z');
    });

    it('ignores non-JSON files in the history directory', async () => {
      const {writeFile: wf, mkdir: mkd} = await import('node:fs/promises');
      const historyDir = join(tmpDir, '.augmenta-sec', 'history');
      await mkd(historyDir, {recursive: true});
      await wf(join(historyDir, 'notes.txt'), 'not json', 'utf-8');

      await store.recordScan(makeReport());
      const snapshots = await store.loadSnapshots();
      expect(snapshots).toHaveLength(1);
    });
  });

  describe('getTrends', () => {
    it('returns empty scans and trends for no history', async () => {
      const report = await store.getTrends();
      expect(report.scans).toEqual([]);
      expect(report.trends).toHaveLength(6);
      for (const trend of report.trends) {
        expect(trend.points).toHaveLength(0);
        expect(trend.direction).toBe('stable');
      }
    });

    it('returns trends for multiple scans', async () => {
      await store.recordScan(
        makeReport({
          generatedAt: '2026-03-01T10:00:00.000Z',
          summary: makeSummary({
            total: 20,
            bySeverity: {
              critical: 5,
              high: 5,
              medium: 5,
              low: 3,
              informational: 2,
            },
          }),
        }),
      );
      await store.recordScan(
        makeReport({
          generatedAt: '2026-03-02T10:00:00.000Z',
          summary: makeSummary({
            total: 15,
            bySeverity: {
              critical: 3,
              high: 4,
              medium: 4,
              low: 3,
              informational: 1,
            },
          }),
        }),
      );
      await store.recordScan(
        makeReport({
          generatedAt: '2026-03-03T10:00:00.000Z',
          summary: makeSummary({
            total: 8,
            bySeverity: {
              critical: 1,
              high: 2,
              medium: 2,
              low: 2,
              informational: 1,
            },
          }),
        }),
      );

      const report = await store.getTrends();

      expect(report.scans).toHaveLength(3);

      const totalTrend = report.trends.find(t => t.metric === 'total');
      expect(totalTrend).toBeDefined();
      expect(totalTrend!.points).toHaveLength(3);
      expect(totalTrend!.direction).toBe('improving');
      expect(totalTrend!.points[0].value).toBe(20);
      expect(totalTrend!.points[2].value).toBe(8);

      const criticalTrend = report.trends.find(t => t.metric === 'critical');
      expect(criticalTrend).toBeDefined();
      expect(criticalTrend!.direction).toBe('improving');
    });

    it('limits scans to the requested count', async () => {
      for (let i = 1; i <= 5; i++) {
        await store.recordScan(
          makeReport({
            generatedAt: `2026-03-0${i}T10:00:00.000Z`,
            summary: makeSummary({total: 20 - i * 2}),
          }),
        );
      }

      const report = await store.getTrends(3);
      expect(report.scans).toHaveLength(3);
      expect(report.scans[0].timestamp).toBe('2026-03-03T10:00:00.000Z');
      expect(report.scans[2].timestamp).toBe('2026-03-05T10:00:00.000Z');
    });

    it('includes per-severity trend lines', async () => {
      await store.recordScan(makeReport());

      const report = await store.getTrends();
      const metricNames = report.trends.map(t => t.metric);
      expect(metricNames).toContain('total');
      expect(metricNames).toContain('critical');
      expect(metricNames).toContain('high');
      expect(metricNames).toContain('medium');
      expect(metricNames).toContain('low');
      expect(metricNames).toContain('informational');
    });

    it('detects worsening trends', async () => {
      await store.recordScan(
        makeReport({
          generatedAt: '2026-03-01T10:00:00.000Z',
          summary: makeSummary({total: 5}),
        }),
      );
      await store.recordScan(
        makeReport({
          generatedAt: '2026-03-02T10:00:00.000Z',
          summary: makeSummary({total: 15}),
        }),
      );

      const report = await store.getTrends();
      const totalTrend = report.trends.find(t => t.metric === 'total');
      expect(totalTrend!.direction).toBe('worsening');
    });

    it('detects stable trends', async () => {
      await store.recordScan(
        makeReport({
          generatedAt: '2026-03-01T10:00:00.000Z',
          summary: makeSummary({total: 10}),
        }),
      );
      await store.recordScan(
        makeReport({
          generatedAt: '2026-03-02T10:00:00.000Z',
          summary: makeSummary({total: 10}),
        }),
      );

      const report = await store.getTrends();
      const totalTrend = report.trends.find(t => t.metric === 'total');
      expect(totalTrend!.direction).toBe('stable');
    });
  });
});
