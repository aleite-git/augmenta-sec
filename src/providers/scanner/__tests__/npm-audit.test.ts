import {describe, it, expect, vi, beforeEach} from 'vitest';
import {createNpmAuditScanner, detectPackageManager, parseYarnAuditOutput} from '../npm-audit.js';
import type {ScanTarget} from '../types.js';
vi.mock('node:child_process', () => ({execFile: vi.fn()}));
vi.mock('node:fs', async () => { const a = await vi.importActual<typeof import('node:fs')>('node:fs'); return {...a, existsSync: vi.fn()}; });
import {execFile} from 'node:child_process';
import {existsSync} from 'node:fs';
const mockExecFile = vi.mocked(execFile);
const mockExistsSync = vi.mocked(existsSync);
function mockResolve(stdout: string) { mockExecFile.mockImplementation(((...args: unknown[]) => { const cb = args[args.length - 1] as (...a: unknown[]) => void; if (typeof cb === 'function') cb(null, stdout, ''); }) as typeof execFile); }
function mockReject(error: {code?: string | number; killed?: boolean; stdout?: string; stderr?: string; status?: number}) { mockExecFile.mockImplementation(((...args: unknown[]) => { const cb = args[args.length - 1] as (...a: unknown[]) => void; if (typeof cb === 'function') cb(Object.assign(new Error('fail'), error), error.stdout ?? '', error.stderr ?? ''); }) as typeof execFile); }
const target: ScanTarget = {rootDir: '/project'};
const NPM_V2 = JSON.stringify({vulnerabilities: {lodash: {name: 'lodash', severity: 'critical', via: [{title: 'PP', source: 1523}], effects: [], range: '<4.17.21', fixAvailable: true}, minimist: {name: 'minimist', severity: 'moderate', via: [{title: 'PP2', source: 1179}], effects: ['mkdirp'], range: '<1.2.6', fixAvailable: true}, mkdirp: {name: 'mkdirp', severity: 'high', via: ['minimist'], effects: [], range: '0.4.1-0.5.1', fixAvailable: true}}});
const NPM_V1 = JSON.stringify({advisories: {'1523': {id: 1523, module_name: 'lodash', severity: 'critical', title: 'PP', url: 'u'}}});
const YARN = [JSON.stringify({type: 'auditAdvisory', data: {advisory: {id: 1523, module_name: 'lodash', severity: 'critical', title: 'PP lodash', url: 'u', cves: ['CVE-2021-23337']}}}), JSON.stringify({type: 'auditAdvisory', data: {advisory: {id: 782, module_name: 'minimist', severity: 'moderate', title: 'PP minimist', url: 'u2'}}}), JSON.stringify({type: 'auditSummary', data: {totalDependencies: 100}})].join('\n');
describe('detectPackageManager', () => {
  beforeEach(() => { vi.clearAllMocks(); });
  it('pnpm', () => { mockExistsSync.mockImplementation((p: unknown) => String(p).endsWith('pnpm-lock.yaml')); expect(detectPackageManager('/p')).toBe('pnpm'); });
  it('yarn', () => { mockExistsSync.mockImplementation((p: unknown) => String(p).endsWith('yarn.lock')); expect(detectPackageManager('/p')).toBe('yarn'); });
  it('npm', () => { mockExistsSync.mockReturnValue(false); expect(detectPackageManager('/p')).toBe('npm'); });
  it('prefers pnpm', () => { mockExistsSync.mockReturnValue(true); expect(detectPackageManager('/p')).toBe('pnpm'); });
});
describe('parseYarnAuditOutput', () => {
  it('parses NDJSON', () => { const f = parseYarnAuditOutput(YARN); expect(f).toHaveLength(2); expect(f[0].ruleId).toBe('yarn:1523'); expect(f[0].metadata!.cveId).toBe('CVE-2021-23337'); });
  it('handles empty', () => { expect(parseYarnAuditOutput('')).toHaveLength(0); });
  it('skips invalid JSON', () => { expect(parseYarnAuditOutput('bad\n' + JSON.stringify({type: 'auditAdvisory', data: {advisory: {id: 1, module_name: 'p', severity: 'low', title: 'T', url: ''}}}))).toHaveLength(1); });
  it('maps moderate', () => { expect(parseYarnAuditOutput(YARN)[1].severity).toBe('medium'); });
});
describe('createNpmAuditScanner', () => {
  beforeEach(() => { vi.clearAllMocks(); mockExistsSync.mockImplementation((p: unknown) => String(p).endsWith('package-lock.json')); });
  it('name and category', () => { expect(createNpmAuditScanner().name).toBe('npm-audit'); });
  it('stores config', () => { expect(createNpmAuditScanner({timeout: 30_000}).config!.timeout).toBe(30_000); });
  describe('isAvailable', () => { it('true', async () => { mockResolve('/npm'); expect(await createNpmAuditScanner().isAvailable()).toBe(true); }); it('false', async () => { mockReject({code: 'ENOENT'}); expect(await createNpmAuditScanner().isAvailable()).toBe(false); }); });
  describe('scan (npm)', () => {
    it('error no lock', async () => { mockExistsSync.mockReturnValue(false); expect((await createNpmAuditScanner().scan(target)).error).toContain('package-lock.json'); });
    it('parses v2', async () => { mockResolve(NPM_V2); expect((await createNpmAuditScanner().scan(target)).findings).toHaveLength(3); });
    it('exit 1 ok', async () => { mockReject({code: 1, status: 1, stdout: NPM_V2, stderr: ''}); expect((await createNpmAuditScanner().scan(target)).findings.length).toBeGreaterThan(0); });
    it('maps moderate', async () => { mockResolve(NPM_V2); expect((await createNpmAuditScanner().scan(target)).findings.find(f => f.ruleId === 'npm:minimist')!.severity).toBe('medium'); });
    it('transitive via', async () => { mockResolve(NPM_V2); expect((await createNpmAuditScanner().scan(target)).findings.find(f => f.ruleId === 'npm:mkdirp')!.message).toContain('Vulnerability in mkdirp'); });
    it('parses v1', async () => { mockResolve(NPM_V1); expect((await createNpmAuditScanner().scan(target)).findings[0].ruleId).toBe('npm:1523'); });
    it('metadata', async () => { mockResolve(NPM_V2); expect((await createNpmAuditScanner().scan(target)).findings.find(f => f.ruleId === 'npm:lodash')!.metadata!.packageName).toBe('lodash'); });
    it('empty', async () => { mockResolve('{}'); expect((await createNpmAuditScanner().scan(target)).findings).toHaveLength(0); });
    it('timeout', async () => { mockReject({code: 'ETIMEDOUT', killed: true}); expect((await createNpmAuditScanner().scan(target)).error).toContain('timed out'); });
    it('extraArgs', async () => { mockResolve('{}'); await createNpmAuditScanner({extraArgs: ['--production']}).scan(target); expect(((mockExecFile.mock.calls[0] as unknown[])[1] as string[]).includes('--production')).toBe(true); });
  });
  describe('scan (yarn)', () => { beforeEach(() => { mockExistsSync.mockImplementation((p: unknown) => String(p).endsWith('yarn.lock')); }); it('detects yarn', async () => { mockResolve(YARN); expect((await createNpmAuditScanner().scan(target)).findings[0].ruleId).toBe('yarn:1523'); }); });
  describe('scan (pnpm)', () => { beforeEach(() => { mockExistsSync.mockImplementation((p: unknown) => String(p).endsWith('pnpm-lock.yaml')); }); it('detects pnpm', async () => { mockResolve(NPM_V2); expect((await createNpmAuditScanner().scan(target)).findings).toHaveLength(3); }); });
});
