import {describe, it, expect, vi, beforeEach} from 'vitest';
import {createGitleaksScanner, mapSecretSeverity} from '../gitleaks.js';
import type {ScanTarget} from '../types.js';
vi.mock('node:child_process', () => ({execFile: vi.fn()}));
import {execFile} from 'node:child_process';
const mockExecFile = vi.mocked(execFile);
function mockResolve(stdout: string) { mockExecFile.mockImplementation(((...args: unknown[]) => { const cb = args[args.length - 1] as (...a: unknown[]) => void; if (typeof cb === 'function') cb(null, stdout, ''); }) as typeof execFile); }
function mockReject(error: {code?: string | number; killed?: boolean; stdout?: string; stderr?: string; status?: number}) { mockExecFile.mockImplementation(((...args: unknown[]) => { const cb = args[args.length - 1] as (...a: unknown[]) => void; if (typeof cb === 'function') cb(Object.assign(new Error('fail'), error), error.stdout ?? '', error.stderr ?? ''); }) as typeof execFile); }
const target: ScanTarget = {rootDir: '/project'};
const OUTPUT = JSON.stringify([{RuleID: 'aws-access-key', Description: 'AWS Key', File: 'prod.env', StartLine: 3, EndLine: 3, StartColumn: 1, Entropy: 3.6, Fingerprint: 'prod.env:aws:3'}, {RuleID: 'generic-api-key', Description: 'API Key', File: 'pay.ts', StartLine: 15, EndLine: 15, StartColumn: 20, Entropy: 4.2, Fingerprint: 'pay.ts:api:15'}]);
describe('mapSecretSeverity', () => {
  it('aws-access-key=critical', () => { expect(mapSecretSeverity('aws-access-key')).toBe('critical'); });
  it('aws-secret-access-key=critical', () => { expect(mapSecretSeverity('aws-secret-access-key')).toBe('critical'); });
  it('gcp-service-account=critical', () => { expect(mapSecretSeverity('gcp-service-account')).toBe('critical'); });
  it('private-key=critical', () => { expect(mapSecretSeverity('private-key')).toBe('critical'); });
  it('github-pat=critical', () => { expect(mapSecretSeverity('github-pat')).toBe('critical'); });
  it('partial critical', () => { expect(mapSecretSeverity('custom-aws-access-key-v2')).toBe('critical'); });
  it('generic-api-key=high', () => { expect(mapSecretSeverity('generic-api-key')).toBe('high'); });
  it('slack-token=high', () => { expect(mapSecretSeverity('slack-token')).toBe('high'); });
  it('database-url=high', () => { expect(mapSecretSeverity('database-url')).toBe('high'); });
  it('jwt-secret=high', () => { expect(mapSecretSeverity('jwt-secret')).toBe('high'); });
  it('partial high', () => { expect(mapSecretSeverity('custom-slack-token-v2')).toBe('high'); });
  it('unknown=medium', () => { expect(mapSecretSeverity('some-unknown')).toBe('medium'); });
  it('empty=medium', () => { expect(mapSecretSeverity('')).toBe('medium'); });
});
describe('createGitleaksScanner', () => {
  beforeEach(() => { vi.clearAllMocks(); });
  it('name and category', () => { expect(createGitleaksScanner().name).toBe('gitleaks'); expect(createGitleaksScanner().category).toBe('secrets'); });
  it('stores config', () => { expect(createGitleaksScanner({timeout: 30_000}).config!.timeout).toBe(30_000); });
  describe('isAvailable', () => { it('true', async () => { mockResolve('/gitleaks'); expect(await createGitleaksScanner().isAvailable()).toBe(true); }); it('false', async () => { mockReject({code: 'ENOENT'}); expect(await createGitleaksScanner().isAvailable()).toBe(false); }); });
  describe('scan', () => {
    it('parses with severity', async () => { mockReject({code: 1, status: 1, stdout: OUTPUT, stderr: ''}); const r = await createGitleaksScanner().scan(target); expect(r.findings).toHaveLength(2); expect(r.findings[0].severity).toBe('critical'); expect(r.findings[1].severity).toBe('high'); });
    it('unknown=medium', async () => { mockReject({code: 1, status: 1, stdout: JSON.stringify([{RuleID: 'custom', Description: 'C', File: 't.ts', StartLine: 1, EndLine: 1}]), stderr: ''}); expect((await createGitleaksScanner().scan(target)).findings[0].severity).toBe('medium'); });
    it('empty', async () => { mockResolve(''); expect((await createGitleaksScanner().scan(target)).findings).toHaveLength(0); });
    it('empty array', async () => { mockResolve('[]'); expect((await createGitleaksScanner().scan(target)).findings).toHaveLength(0); });
    it('metadata', async () => { mockReject({code: 1, status: 1, stdout: OUTPUT, stderr: ''}); expect((await createGitleaksScanner().scan(target)).findings[0].metadata!.fingerprint).toBe('prod.env:aws:3'); });
    it('timeout', async () => { mockReject({code: 'ETIMEDOUT', killed: true}); expect((await createGitleaksScanner().scan(target)).error).toContain('timed out'); });
    it('not found', async () => { mockReject({code: 'ENOENT'}); expect((await createGitleaksScanner().scan(target)).error).toContain('not found'); });
    it('duration', async () => { mockResolve(''); expect((await createGitleaksScanner().scan(target)).duration).toBeGreaterThanOrEqual(0); });
    it('extraArgs', async () => { mockResolve('[]'); await createGitleaksScanner({extraArgs: ['--verbose']}).scan(target); expect(((mockExecFile.mock.calls[0] as unknown[])[1] as string[]).includes('--verbose')).toBe(true); });
  });
});
