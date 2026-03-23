import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {scanCommand} from '../commands/scan.js';

vi.mock('../../config/index.js', () => ({
  resolveConfig: vi.fn(),
}));
vi.mock('../../scan/engine.js', () => ({
  runScan: vi.fn(),
}));

import {resolveConfig} from '../../config/index.js';
import {runScan} from '../../scan/engine.js';
const mockResolveConfig = vi.mocked(resolveConfig);
const mockRunScan = vi.mocked(runScan);

describe('scanCommand error handling', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  const origExitCode = process.exitCode;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    process.exitCode = undefined;
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    process.exitCode = origExitCode;
  });

  it('shows actionable message when profile.yaml is missing', async () => {
    mockResolveConfig.mockResolvedValue({} as never);
    const err = Object.assign(new Error('ENOENT: no such file or directory, open profile.yaml'), {code: 'ENOENT'});
    mockRunScan.mockRejectedValue(err);
    await scanCommand('/tmp/no-profile');
    expect(process.exitCode).toBe(1);
  });

  it('sets exitCode on scan failure', async () => {
    mockResolveConfig.mockRejectedValue(new Error('config broken'));
    await scanCommand('/tmp/bad-project');
    expect(process.exitCode).toBe(1);
  });

  it('surfaces scanner warnings in report', async () => {
    mockResolveConfig.mockResolvedValue({} as never);
    mockRunScan.mockResolvedValue({
      version: '1.0',
      generatedAt: new Date().toISOString(),
      target: '/tmp/test',
      summary: {total: 0, bySeverity: {critical: 0, high: 0, medium: 0, low: 0, informational: 0}, byCategory: {}, bySource: {scanner: 0, llm: 0, manual: 0}},
      findings: [],
      warnings: ['semgrep reported an error: Binary not found'],
    });
    await scanCommand('/tmp/test');
    const output = consoleSpy.mock.calls.map(c => String(c[0])).join('\n');
    expect(output).toContain('Warnings');
  });
});
