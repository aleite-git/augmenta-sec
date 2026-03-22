import {describe, it, expect, vi, beforeEach} from 'vitest';
import {createTrivyScanner, scanFilesystem, scanContainer} from '../trivy.js';
import type {ScanTarget} from '../types.js';
vi.mock('node:child_process', () => ({execFile: vi.fn()}));
import {execFile} from 'node:child_process';
const mockExecFile = vi.mocked(execFile);
function mockResolve(stdout: string) { mockExecFile.mockImplementation(((...args: unknown[]) => { const cb = args[args.length - 1] as (...a: unknown[]) => void; if (typeof cb === 'function') cb(null, stdout, ''); }) as typeof execFile); }
function mockReject(error: {code?: string | number; killed?: boolean}) { mockExecFile.mockImplementation(((...args: unknown[]) => { const cb = args[args.length - 1] as (...a: unknown[]) => void; if (typeof cb === 'function') cb(Object.assign(new Error('fail'), {code: error.code, killed: error.killed, stdout: '', stderr: ''}), '', ''); }) as typeof execFile); }
const target: ScanTarget = {rootDir: '/project'};
const TRIVY = JSON.stringify({Results: [{Target: 'package-lock.json', Type: 'npm', Vulnerabilities: [{VulnerabilityID: 'CVE-1234', PkgName: 'lodash', InstalledVersion: '4.17.19', FixedVersion: '4.17.21', Title: 'PP', Description: 'vuln', Severity: 'CRITICAL'}, {VulnerabilityID: 'CVE-5678', PkgName: 'express', InstalledVersion: '4.17.0', Title: 'Redirect', Severity: 'MEDIUM'}]}, {Target: 'go.sum', Type: 'gomod', Vulnerabilities: [{VulnerabilityID: 'CVE-9999', PkgName: 'golang.org/x/net', InstalledVersion: 'v0.1.0', Title: 'HTTP/2', Severity: 'HIGH'}]}]});
describe('createTrivyScanner', () => {
  beforeEach(() => { vi.clearAllMocks(); });
  it('defaults to sca', () => { expect(createTrivyScanner().category).toBe('sca'); });
  it('image=container', () => { expect(createTrivyScanner('image').category).toBe('container'); });
  it('stores config', () => { expect(createTrivyScanner('fs', {timeout: 30_000}).config!.timeout).toBe(30_000); });
  describe('isAvailable', () => {
    it('true', async () => { mockResolve('/usr/local/bin/trivy'); expect(await createTrivyScanner().isAvailable()).toBe(true); });
    it('false', async () => { mockReject({code: 'ENOENT'}); expect(await createTrivyScanner().isAvailable()).toBe(false); });
  });
  describe('scan (fs)', () => {
    it('parses', async () => { mockResolve(TRIVY); expect((await createTrivyScanner().scan(target)).findings).toHaveLength(3); });
    it('maps CRITICAL', async () => { mockResolve(TRIVY); expect((await createTrivyScanner().scan(target)).findings[0].severity).toBe('critical'); });
    it('maps HIGH', async () => { mockResolve(TRIVY); expect((await createTrivyScanner().scan(target)).findings[2].severity).toBe('high'); });
    it('maps MEDIUM', async () => { mockResolve(TRIVY); expect((await createTrivyScanner().scan(target)).findings[1].severity).toBe('medium'); });
    it('maps LOW', async () => { mockResolve(JSON.stringify({Results: [{Vulnerabilities: [{VulnerabilityID: 'x', PkgName: 'p', InstalledVersion: '1', Severity: 'LOW'}]}]})); expect((await createTrivyScanner().scan(target)).findings[0].severity).toBe('low'); });
    it('maps UNKNOWN', async () => { mockResolve(JSON.stringify({Results: [{Vulnerabilities: [{VulnerabilityID: 'x', PkgName: 'p', InstalledVersion: '1', Severity: 'UNKNOWN'}]}]})); expect((await createTrivyScanner().scan(target)).findings[0].severity).toBe('informational'); });
    it('includes metadata', async () => { mockResolve(TRIVY); expect((await createTrivyScanner().scan(target)).findings[0].metadata!.pkgName).toBe('lodash'); });
    it('handles empty', async () => { mockResolve(JSON.stringify({Results: []})); expect((await createTrivyScanner().scan(target)).findings).toHaveLength(0); });
    it('handles null vulns', async () => { mockResolve(JSON.stringify({Results: [{Vulnerabilities: null}]})); expect((await createTrivyScanner().scan(target)).findings).toHaveLength(0); });
    it('fallback message', async () => { mockResolve(JSON.stringify({Results: [{Vulnerabilities: [{VulnerabilityID: 'CVE-X', PkgName: 'p', InstalledVersion: '1', Severity: 'LOW'}]}]})); expect((await createTrivyScanner().scan(target)).findings[0].message).toBe('CVE-X'); });
    it('extraArgs', async () => { mockResolve(JSON.stringify({Results: []})); await createTrivyScanner('fs', {extraArgs: ['--severity', 'HIGH']}).scan(target); expect(((mockExecFile.mock.calls[0] as unknown[])[1] as string[]).includes('--severity')).toBe(true); });
  });
  describe('scan (image)', () => {
    it('works', async () => { mockResolve(JSON.stringify({Results: [{Vulnerabilities: [{VulnerabilityID: 'CVE-1', PkgName: 'ssl', InstalledVersion: '3', Severity: 'HIGH', Title: 'overflow'}]}]})); const r = await createTrivyScanner('image').scan({rootDir: '/', image: 'img:latest'}); expect(r.category).toBe('container'); expect(r.findings).toHaveLength(1); });
  });
  describe('errors', () => {
    it('timeout', async () => { mockReject({code: 'ETIMEDOUT', killed: true}); expect((await createTrivyScanner().scan(target)).error).toContain('timed out'); });
    it('not found', async () => { mockReject({code: 'ENOENT'}); expect((await createTrivyScanner().scan(target)).error).toContain('not found'); });
    it('duration', async () => { mockResolve(JSON.stringify({Results: []})); expect((await createTrivyScanner().scan(target)).duration).toBeGreaterThanOrEqual(0); });
  });
});
describe('scanFilesystem', () => { beforeEach(() => { vi.clearAllMocks(); }); it('works', async () => { mockResolve(TRIVY); expect((await scanFilesystem({rootDir: '/p'})).findings).toHaveLength(3); }); });
describe('scanContainer', () => { beforeEach(() => { vi.clearAllMocks(); }); it('works', async () => { mockResolve(JSON.stringify({Results: [{Vulnerabilities: [{VulnerabilityID: 'x', PkgName: 'p', InstalledVersion: '1', Severity: 'HIGH'}]}]})); expect((await scanContainer('img')).category).toBe('container'); }); });
