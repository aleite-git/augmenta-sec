import {describe, it, expect, vi, beforeEach} from 'vitest';
import {createSemgrepScanner, parseSarifOutput} from '../semgrep.js';
import type {ScanTarget} from '../types.js';
vi.mock('node:child_process', () => ({execFile: vi.fn()}));
import {execFile} from 'node:child_process';
const mockExecFile = vi.mocked(execFile);
function mockResolve(stdout: string) { mockExecFile.mockImplementation(((...args: unknown[]) => { const cb = args[args.length - 1] as (...a: unknown[]) => void; if (typeof cb === 'function') cb(null, stdout, ''); }) as typeof execFile); }
function mockReject(error: {code?: string | number; killed?: boolean; stdout?: string; stderr?: string; status?: number}) { mockExecFile.mockImplementation(((...args: unknown[]) => { const cb = args[args.length - 1] as (...a: unknown[]) => void; if (typeof cb === 'function') cb(Object.assign(new Error('fail'), error), error.stdout ?? '', error.stderr ?? ''); }) as typeof execFile); }
const target: ScanTarget = {rootDir: '/project'};
describe('createSemgrepScanner', () => {
  beforeEach(() => { vi.clearAllMocks(); });
  it('has correct name and category', () => { const s = createSemgrepScanner(); expect(s.name).toBe('semgrep'); expect(s.category).toBe('sast'); });
  it('stores config', () => { expect(createSemgrepScanner({rules: ['p/owasp']}).config!.rules).toEqual(['p/owasp']); });
  describe('isAvailable', () => {
    it('true', async () => { mockResolve('/usr/local/bin/semgrep'); expect(await createSemgrepScanner().isAvailable()).toBe(true); });
    it('false', async () => { mockReject({code: 'ENOENT'}); expect(await createSemgrepScanner().isAvailable()).toBe(false); });
  });
  describe('scan', () => {
    it('parses JSON output', async () => { mockResolve(JSON.stringify({results: [{check_id: 'xss', path: 'app.ts', start: {line: 42, col: 5}, end: {line: 42, col: 30}, extra: {message: 'innerHTML', severity: 'ERROR', metadata: {cwe: 'CWE-79'}}}]})); const r = await createSemgrepScanner().scan(target); expect(r.findings).toHaveLength(1); expect(r.findings[0].severity).toBe('high'); });
    it('maps severities', async () => { mockResolve(JSON.stringify({results: [{check_id: 'e', path: 'a.ts', start: {line: 1, col: 1}, end: {line: 1, col: 10}, extra: {message: 'e', severity: 'ERROR'}}, {check_id: 'w', path: 'b.ts', start: {line: 1, col: 1}, end: {line: 1, col: 10}, extra: {message: 'w', severity: 'WARNING'}}, {check_id: 'i', path: 'c.ts', start: {line: 1, col: 1}, end: {line: 1, col: 10}, extra: {message: 'i', severity: 'INFO'}}, {check_id: 'u', path: 'd.ts', start: {line: 1, col: 1}, end: {line: 1, col: 10}, extra: {message: 'u', severity: 'OTHER'}}]})); expect((await createSemgrepScanner().scan(target)).findings.map(f => f.severity)).toEqual(['high', 'medium', 'low', 'informational']); });
    it('handles empty', async () => { mockResolve('{}'); expect((await createSemgrepScanner().scan(target)).findings).toHaveLength(0); });
    it('handles timeout', async () => { mockReject({code: 'ETIMEDOUT', killed: true}); expect((await createSemgrepScanner().scan(target)).error).toContain('timed out'); });
    it('handles not found', async () => { mockReject({code: 'ENOENT'}); expect((await createSemgrepScanner().scan(target)).error).toContain('not found'); });
    it('preserves metadata', async () => { mockResolve(JSON.stringify({results: [{check_id: 'r', path: 't.ts', start: {line: 1, col: 1}, end: {line: 1, col: 10}, extra: {message: 'T', severity: 'ERROR', metadata: {cwe: 'CWE-79'}}}]})); expect((await createSemgrepScanner().scan(target)).findings[0].metadata).toEqual({cwe: 'CWE-79'}); });
    it('uses custom rules', async () => { mockResolve('{}'); await createSemgrepScanner({rules: ['p/owasp']}).scan(target); expect(((mockExecFile.mock.calls[0] as unknown[])[1] as string[]).includes('p/owasp')).toBe(true); });
    it('defaults to auto', async () => { mockResolve('{}'); await createSemgrepScanner().scan(target); const args = (mockExecFile.mock.calls[0] as unknown[])[1] as string[]; expect(args[args.indexOf('--config') + 1]).toBe('auto'); });
    it('passes extraArgs', async () => { mockResolve('{}'); await createSemgrepScanner({extraArgs: ['--severity', 'ERROR']}).scan(target); expect(((mockExecFile.mock.calls[0] as unknown[])[1] as string[]).includes('--severity')).toBe(true); });
    it('reports duration', async () => { mockResolve('{}'); expect((await createSemgrepScanner().scan(target)).duration).toBeGreaterThanOrEqual(0); });
  });
});
describe('parseSarifOutput', () => {
  const SARIF = JSON.stringify({runs: [{results: [{ruleId: 'xss', level: 'error', message: {text: 'XSS'}, locations: [{physicalLocation: {artifactLocation: {uri: 'app.ts'}, region: {startLine: 42, startColumn: 5}}}], properties: {cwe: 'CWE-79'}}, {ruleId: 'info', level: 'note', message: {text: 'Info'}}]}]});
  it('parses SARIF', () => { const f = parseSarifOutput(SARIF); expect(f).toHaveLength(2); expect(f[0].severity).toBe('high'); expect(f[0].file).toBe('app.ts'); });
  it('maps warning->medium', () => { expect(parseSarifOutput(JSON.stringify({runs: [{results: [{ruleId: 't', level: 'warning', message: {text: 'w'}}]}]}))[0].severity).toBe('medium'); });
  it('maps none->informational', () => { expect(parseSarifOutput(JSON.stringify({runs: [{results: [{ruleId: 't', level: 'none', message: {text: 'n'}}]}]}))[0].severity).toBe('informational'); });
  it('defaults missing level to medium', () => { expect(parseSarifOutput(JSON.stringify({runs: [{results: [{ruleId: 't', message: {text: 'x'}}]}]}))[0].severity).toBe('medium'); });
  it('handles empty/missing runs', () => { expect(parseSarifOutput('{}')).toHaveLength(0); });
  it('handles no locations', () => { expect(parseSarifOutput(JSON.stringify({runs: [{results: [{ruleId: 'x', level: 'error'}]}]}))[0].file).toBeUndefined(); });
  it('uses ruleId as fallback', () => { expect(parseSarifOutput(JSON.stringify({runs: [{results: [{ruleId: 'fb', level: 'error'}]}]}))[0].message).toBe('fb'); });
  it('uses unknown when no ruleId', () => { expect(parseSarifOutput(JSON.stringify({runs: [{results: [{level: 'error'}]}]}))[0].ruleId).toBe('unknown'); });
  it('handles multiple runs', () => { expect(parseSarifOutput(JSON.stringify({runs: [{results: [{ruleId: 'r1', level: 'error', message: {text: '1'}}]}, {results: [{ruleId: 'r2', message: {text: '2'}}]}]}))).toHaveLength(2); });
});
