import {describe, it, expect, vi, beforeEach} from 'vitest';
import {createScannerRegistry, defaultRegistry, createCommandScanner, loadPluginScanner} from '../plugin.js';
import type {ScanTarget} from '../types.js';

vi.mock('node:child_process', () => ({execFile: vi.fn()}));
import {execFile} from 'node:child_process';
const mockExecFile = vi.mocked(execFile);
function mockResolve(stdout: string) { mockExecFile.mockImplementation(((...args: unknown[]) => { const cb = args[args.length - 1] as (...a: unknown[]) => void; if (typeof cb === 'function') cb(null, stdout, ''); }) as typeof execFile); }
function mockReject(error: {code?: string | number; killed?: boolean}) { mockExecFile.mockImplementation(((...args: unknown[]) => { const cb = args[args.length - 1] as (...a: unknown[]) => void; if (typeof cb === 'function') cb(Object.assign(new Error('fail'), error), '', ''); }) as typeof execFile); }
const target: ScanTarget = {rootDir: '/project'};

describe('createScannerRegistry', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('starts empty', () => {
    const reg = createScannerRegistry();
    expect(reg.allNames()).toEqual([]);
  });

  it('registers and retrieves a scanner', () => {
    const reg = createScannerRegistry();
    const factory = vi.fn();
    reg.register('test-scanner', factory);
    expect(reg.has('test-scanner')).toBe(true);
    expect(reg.get('test-scanner')).toBe(factory);
    expect(reg.allNames()).toContain('test-scanner');
  });

  it('returns undefined for unknown scanner', () => {
    const reg = createScannerRegistry();
    expect(reg.get('unknown')).toBeUndefined();
    expect(reg.has('unknown')).toBe(false);
  });

  it('overwrites duplicate registration', () => {
    const reg = createScannerRegistry();
    const factory1 = vi.fn();
    const factory2 = vi.fn();
    reg.register('dup', factory1);
    reg.register('dup', factory2);
    expect(reg.get('dup')).toBe(factory2);
  });
});

describe('defaultRegistry', () => {
  it('contains all 9 built-in scanners', () => {
    const names = defaultRegistry.allNames();
    expect(names).toContain('semgrep');
    expect(names).toContain('trivy');
    expect(names).toContain('npm-audit');
    expect(names).toContain('gitleaks');
    expect(names).toContain('codeql');
    expect(names).toContain('pip-audit');
    expect(names).toContain('bandit');
    expect(names).toContain('gosec');
    expect(names).toContain('cargo-audit');
    expect(names.length).toBeGreaterThanOrEqual(9);
  });

  it('returns factories that produce scanners', () => {
    const factory = defaultRegistry.get('semgrep');
    expect(factory).toBeDefined();
    const scanner = factory!();
    expect(scanner.name).toBe('semgrep');
    expect(scanner.category).toBe('sast');
  });
});

describe('createCommandScanner', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('has correct name and category', () => {
    const s = createCommandScanner({name: 'my-scan', command: 'my-scan', outputFormat: 'sarif', category: 'sast'});
    expect(s.name).toBe('my-scan');
    expect(s.category).toBe('sast');
  });

  it('checks binary availability', async () => {
    mockResolve('/usr/bin/my-scan');
    expect(await createCommandScanner({name: 'my-scan', command: 'my-scan', outputFormat: 'sarif', category: 'sast'}).isAvailable()).toBe(true);
  });

  it('returns false when binary missing', async () => {
    mockReject({code: 'ENOENT'});
    expect(await createCommandScanner({name: 'my-scan', command: 'my-scan', outputFormat: 'sarif', category: 'sast'}).isAvailable()).toBe(false);
  });

  it('parses SARIF output', async () => {
    const sarif = JSON.stringify({runs: [{results: [{ruleId: 'test-rule', level: 'error', message: {text: 'found it'}, locations: [{physicalLocation: {artifactLocation: {uri: 'app.ts'}, region: {startLine: 10}}}]}]}]});
    mockResolve(sarif);
    const s = createCommandScanner({name: 'my-scan', command: 'my-scan', outputFormat: 'sarif', category: 'sast'});
    const result = await s.scan(target);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].ruleId).toBe('test-rule');
    expect(result.findings[0].severity).toBe('high');
  });

  it('parses flat JSON output', async () => {
    const json = JSON.stringify([{ruleId: 'r1', message: 'msg', severity: 'medium'}]);
    mockResolve(json);
    const s = createCommandScanner({name: 'my-scan', command: 'my-scan', outputFormat: 'json', category: 'sca'});
    const result = await s.scan(target);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].ruleId).toBe('r1');
  });

  it('passes custom args', async () => {
    mockResolve('[]');
    const s = createCommandScanner({name: 'my-scan', command: 'my-scan', args: ['--json', '--strict'], outputFormat: 'json', category: 'sast'});
    await s.scan(target);
    const args = (mockExecFile.mock.calls[0] as unknown[])[1] as string[];
    expect(args).toContain('--json');
    expect(args).toContain('--strict');
    expect(args).toContain('/project');
  });

  it('handles scan errors gracefully', async () => {
    mockReject({code: 'ENOENT'});
    const s = createCommandScanner({name: 'my-scan', command: 'my-scan', outputFormat: 'sarif', category: 'sast'});
    const result = await s.scan(target);
    expect(result.findings).toHaveLength(0);
    expect(result.error).toBeDefined();
  });

  it('reports duration', async () => {
    mockResolve('[]');
    const s = createCommandScanner({name: 'my-scan', command: 'my-scan', outputFormat: 'json', category: 'sast'});
    const result = await s.scan(target);
    expect(result.duration).toBeGreaterThanOrEqual(0);
  });
});

describe('loadPluginScanner', () => {
  it('returns undefined for non-existent module', async () => {
    const factory = await loadPluginScanner('/does/not/exist.mjs');
    expect(factory).toBeUndefined();
  });

  it('returns undefined for module without createScanner export', async () => {
    const factory = await loadPluginScanner('node:path');
    expect(factory).toBeUndefined();
  });
});
