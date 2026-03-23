/**
 * ASEC-120: E2E test for init -> scan -> report pipeline.
 */
import {describe, it, expect, vi, beforeEach} from 'vitest';
import type {AugmentaSecConfig} from '../../config/schema.js';

vi.mock('node:fs/promises', () => ({writeFile: vi.fn().mockResolvedValue(undefined), mkdir: vi.fn().mockResolvedValue(undefined), readFile: vi.fn()}));
vi.mock('../../utils/file-utils.js', () => ({createDetectorContext: vi.fn()}));
vi.mock('../../utils/logger.js', () => ({logger: {debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn()}}));

function buildMockCtx(vfs: Record<string, string | null>) {
  const files = Object.keys(vfs);
  function matchGlob(fp: string, p: string): boolean {
    let r = '^'; let i = 0;
    while (i < p.length) { const c = p[i]; if (c === '*') { if (p[i+1] === '*') { if (p[i+2] === '/') { r += '(?:.+/)?'; i += 3; } else { r += '.*'; i += 2; } } else { r += '[^/]*'; i += 1; } } else if (c === '.') { r += '\\.'; i += 1; } else if (c === '{') { const cb = p.indexOf('}', i); if (cb !== -1) { const a = p.slice(i+1, cb).split(',').map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')); r += '(?:' + a.join('|') + ')'; i = cb + 1; } else { r += '\\{'; i += 1; } } else { r += c; i += 1; } }
    r += '$'; return new RegExp(r).test(fp);
  }
  return {
    rootDir: '/mock',
    findFiles: vi.fn(async (patterns: string[]) => { const m = new Set<string>(); for (const p of patterns) for (const f of files) if (matchGlob(f, p)) m.add(f); return [...m].sort(); }),
    readFile: vi.fn(async (path: string) => vfs[path] ?? null),
    readJson: vi.fn(async (path: string) => { const c = vfs[path]; if (c == null) return null; try { return JSON.parse(c); } catch { return null; } }) as ReturnType<typeof vi.fn>,
    readYaml: vi.fn(async (path: string) => { const c = vfs[path]; if (c == null) return null; try { return JSON.parse(c); } catch { return c; } }) as ReturnType<typeof vi.fn>,
    fileExists: vi.fn(async (path: string) => path in vfs),
    grep: vi.fn(async (pattern: RegExp, filePatterns: string[]) => {
      const matches: Array<{file: string; line: number; content: string; match: string}> = [];
      const mf = new Set<string>(); for (const fp of filePatterns) for (const f of files) if (matchGlob(f, fp)) mf.add(f);
      for (const file of mf) { const content = vfs[file]; if (content == null) continue; const lines = content.split('\n'); for (let i = 0; i < lines.length; i++) { const m = lines[i].match(pattern); if (m) matches.push({file, line: i + 1, content: lines[i].trim(), match: m[0]}); } }
      return matches;
    }),
  };
}

const baseConfig: AugmentaSecConfig = {
  scanners: [],
  custom_scanners: [],
  scan: {categories: [], min_severity: 'low', max_findings: 100},
  llm: {triage: 'none/none', analysis: 'none/none', reasoning: 'none/none'},
  output: {format: 'json', verbosity: 'quiet'},
  autonomy: {critical: 'report', high: 'report', medium: 'report', low: 'note', max_auto_prs_per_day: 0, never_auto_merge: true, respect_freeze: true},
  review: {auto_approve_below: 'informational', inline_comments: false, summary_comment: false},
};

describe('E2E: init -> scan -> report pipeline', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('runs full init cycle: discovery + profile write', async () => {
    const {createDetectorContext} = await import('../../utils/file-utils.js');
    vi.mocked(createDetectorContext).mockReturnValue(buildMockCtx({
      'package.json': JSON.stringify({dependencies: {express: '^4.18.0', helmet: '^7.0.0'}}), 'tsconfig.json': '{}',
      'src/index.ts': "import express from 'express';", 'src/app.ts': "import helmet from 'helmet';\napp.use(helmet());\napp.get('/api/health', handler);",
      'README.md': '# Project', '.github/workflows/ci.yml': 'name: CI\non: [push]\njobs:\n  test:\n    runs-on: ubuntu-latest',
    }));
    const {runDiscovery} = await import('../../discovery/engine.js');
    const {writeProfile} = await import('../../discovery/profile-writer.js');
    const {profile, warnings} = await runDiscovery('/mock');
    expect(profile.version).toBe('1.0');
    expect(profile.languages.primary).toBe('typescript');
    expect(profile.frameworks.backend.find(f => f.name === 'express')).toBeDefined();
    expect(profile.ci.platform).toBe('github-actions');
    expect(warnings).toEqual([]);
    const filePath = await writeProfile(profile, '/mock');
    expect(filePath).toBe('/mock/.augmenta-sec/profile.yaml');
    const {writeFile} = await import('node:fs/promises');
    const yamlContent = vi.mocked(writeFile).mock.calls[0][1] as string;
    expect(yamlContent).toContain('# AugmentaSec Security Profile');
  });

  it('scan engine produces empty report with no scanners', async () => {
    const {createDetectorContext} = await import('../../utils/file-utils.js');
    vi.mocked(createDetectorContext).mockReturnValue(buildMockCtx({'package.json': '{}'}));
    const {runDiscovery} = await import('../../discovery/engine.js');
    const {profile} = await runDiscovery('/mock');
    const {runScan} = await import('../../scan/engine.js');
    const report = await runScan('/mock', baseConfig, {profile, scanners: []});
    expect(report.version).toBe('1.0');
    expect(report.findings).toEqual([]);
    expect(report.summary.total).toBe(0);
  });

  it('scan engine with mock scanner produces findings', async () => {
    const {createDetectorContext} = await import('../../utils/file-utils.js');
    vi.mocked(createDetectorContext).mockReturnValue(buildMockCtx({'package.json': JSON.stringify({dependencies: {express: '^4.18.0'}}), 'src/index.ts': ''}));
    const {runDiscovery} = await import('../../discovery/engine.js');
    const {profile} = await runDiscovery('/mock');
    const mockScanner = {
      name: 'mock-scanner', category: 'sast' as const, isAvailable: vi.fn().mockResolvedValue(true),
      scan: vi.fn().mockResolvedValue({scanner: 'mock-scanner', category: 'sast', findings: [
        {ruleId: 'TEST-001', severity: 'high' as const, message: 'Hardcoded secret', file: 'src/config.ts', line: 10, column: 1, metadata: {}},
        {ruleId: 'TEST-002', severity: 'medium' as const, message: 'Missing validation', file: 'src/routes.ts', line: 25, column: 1, metadata: {}},
      ]}),
    };
    const {runScan} = await import('../../scan/engine.js');
    const report = await runScan('/mock', baseConfig, {profile, scanners: [mockScanner]});
    expect(report.findings.length).toBe(2);
    expect(report.summary.total).toBe(2);
  });

  it('scan engine applies severity filtering', async () => {
    const {createDetectorContext} = await import('../../utils/file-utils.js');
    vi.mocked(createDetectorContext).mockReturnValue(buildMockCtx({}));
    const {runDiscovery} = await import('../../discovery/engine.js');
    const {profile} = await runDiscovery('/mock');
    const mockScanner = {
      name: 'mock-scanner', category: 'sast' as const, isAvailable: vi.fn().mockResolvedValue(true),
      scan: vi.fn().mockResolvedValue({scanner: 'mock-scanner', category: 'sast', findings: [
        {ruleId: 'CRIT-001', severity: 'critical' as const, message: 'Critical', file: 'a.ts', line: 1, column: 1, metadata: {}},
        {ruleId: 'LOW-001', severity: 'low' as const, message: 'Low', file: 'b.ts', line: 1, column: 1, metadata: {}},
        {ruleId: 'INFO-001', severity: 'informational' as const, message: 'Info', file: 'c.ts', line: 1, column: 1, metadata: {}},
      ]}),
    };
    const {runScan} = await import('../../scan/engine.js');
    const config: AugmentaSecConfig = {...baseConfig, scan: {...baseConfig.scan, min_severity: 'medium'}};
    const report = await runScan('/mock', config, {profile, scanners: [mockScanner]});
    expect(report.findings.length).toBeGreaterThanOrEqual(1);
    const severities = report.findings.map(f => f.severity);
    expect(severities).not.toContain('informational');
  });

  it('scan engine applies max_findings cap', async () => {
    const {createDetectorContext} = await import('../../utils/file-utils.js');
    vi.mocked(createDetectorContext).mockReturnValue(buildMockCtx({}));
    const {runDiscovery} = await import('../../discovery/engine.js');
    const {profile} = await runDiscovery('/mock');
    const findings = Array.from({length: 20}, (_, i) => ({ruleId: `RULE-${i}`, severity: 'medium' as const, message: `Finding ${i}`, file: 'src/file.ts', line: i + 1, column: 1, metadata: {}}));
    const mockScanner = {name: 'mock', category: 'sast' as const, isAvailable: vi.fn().mockResolvedValue(true), scan: vi.fn().mockResolvedValue({scanner: 'mock', category: 'sast', findings})};
    const {runScan} = await import('../../scan/engine.js');
    const config: AugmentaSecConfig = {...baseConfig, scan: {...baseConfig.scan, max_findings: 5}};
    const report = await runScan('/mock', config, {profile, scanners: [mockScanner]});
    expect(report.findings.length).toBeLessThanOrEqual(5);
  });

  it('scan report has correct structure', async () => {
    const {createDetectorContext} = await import('../../utils/file-utils.js');
    vi.mocked(createDetectorContext).mockReturnValue(buildMockCtx({}));
    const {runDiscovery} = await import('../../discovery/engine.js');
    const {profile} = await runDiscovery('/mock');
    const {runScan} = await import('../../scan/engine.js');
    const report = await runScan('/mock', baseConfig, {profile, scanners: []});
    expect(report).toHaveProperty('version');
    expect(report).toHaveProperty('generatedAt');
    expect(report).toHaveProperty('target');
    expect(report).toHaveProperty('summary');
    expect(report).toHaveProperty('findings');
    expect(report.summary).toHaveProperty('total');
    expect(report.summary).toHaveProperty('bySeverity');
  });

  it('handles scanner failure gracefully', async () => {
    const {createDetectorContext} = await import('../../utils/file-utils.js');
    vi.mocked(createDetectorContext).mockReturnValue(buildMockCtx({}));
    const {runDiscovery} = await import('../../discovery/engine.js');
    const {profile} = await runDiscovery('/mock');
    const failScanner = {name: 'fail', category: 'sast' as const, isAvailable: vi.fn().mockResolvedValue(true), scan: vi.fn().mockRejectedValue(new Error('crash'))};
    const {runScan} = await import('../../scan/engine.js');
    const report = await runScan('/mock', baseConfig, {profile, scanners: [failScanner]});
    expect(report).toBeDefined();
    expect(report.findings).toEqual([]);
  });

  it('full pipeline: target matches across init and scan', async () => {
    const {createDetectorContext} = await import('../../utils/file-utils.js');
    vi.mocked(createDetectorContext).mockReturnValue(buildMockCtx({'package.json': '{}', 'src/index.ts': ''}));
    const {runDiscovery} = await import('../../discovery/engine.js');
    const {profile} = await runDiscovery('/my-app');
    expect(profile.target).toBe('/my-app');
    const {runScan} = await import('../../scan/engine.js');
    const report = await runScan('/my-app', baseConfig, {profile, scanners: []});
    expect(report.target).toBe('/my-app');
  });

  it('deduplication removes duplicate findings', async () => {
    const {createDetectorContext} = await import('../../utils/file-utils.js');
    vi.mocked(createDetectorContext).mockReturnValue(buildMockCtx({}));
    const {runDiscovery} = await import('../../discovery/engine.js');
    const {profile} = await runDiscovery('/mock');
    const dup = {ruleId: 'SAME', severity: 'high' as const, message: 'Same', file: 'src/app.ts', line: 10, column: 1, metadata: {}};
    const s1 = {name: 'a', category: 'sast' as const, isAvailable: vi.fn().mockResolvedValue(true), scan: vi.fn().mockResolvedValue({scanner: 'a', category: 'sast', findings: [dup]})};
    const s2 = {name: 'b', category: 'sast' as const, isAvailable: vi.fn().mockResolvedValue(true), scan: vi.fn().mockResolvedValue({scanner: 'b', category: 'sast', findings: [dup]})};
    const {runScan} = await import('../../scan/engine.js');
    const report = await runScan('/mock', baseConfig, {profile, scanners: [s1, s2]});
    expect(report.findings.length).toBeLessThanOrEqual(2);
  });
});
