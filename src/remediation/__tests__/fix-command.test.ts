import {describe, it, expect, vi, beforeEach} from 'vitest';
import {readFile, writeFile} from 'node:fs/promises';

import type {Finding} from '../../findings/types.js';
import type {LLMProvider, LLMRole} from '../../providers/llm/types.js';
import {applyFixToFile, runFixWorkflow} from '../fix-command.js';
import type {FixSuggestion} from '../auto-fix.js';

// Mock fs/promises so we don't touch the real filesystem.
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
}));

const mockedReadFile = vi.mocked(readFile);
const mockedWriteFile = vi.mocked(writeFile);

/** Creates a minimal Finding. */
function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: 'aaaa-bbbb-cccc-dddd',
    source: 'scanner',
    category: 'injection',
    severity: 'high',
    rawSeverity: 'high',
    title: 'SQL injection',
    description: 'User input flows into raw SQL query.',
    file: '/project/src/db.ts',
    line: 10,
    confidence: 0.9,
    status: 'open',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

/** Creates a stub LLMProvider. */
function makeProvider(fix: FixSuggestion): LLMProvider {
  return {
    name: 'test',
    model: 'test-model',
    capabilities: {
      maxContextTokens: 100_000,
      supportsImages: false,
      supportsStructuredOutput: false,
    },
    analyze: vi.fn().mockResolvedValue({
      content: JSON.stringify(fix),
      tokensUsed: {input: 100, output: 200},
      model: 'test-model',
      role: 'analysis' as LLMRole,
    }),
    analyzeStructured: vi.fn(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('applyFixToFile', () => {
  it('replaces the original snippet with the fixed one', async () => {
    const fileContent = 'const result = db.raw(input);\nconsole.log(result);';
    mockedReadFile.mockResolvedValue(fileContent);
    mockedWriteFile.mockResolvedValue(undefined);

    const fix: FixSuggestion = {
      original: 'db.raw(input)',
      fixed: 'db.query($1, [input])',
      explanation: 'Use parameterized queries.',
      confidence: 0.9,
    };

    const applied = await applyFixToFile('/project/src/db.ts', fix);

    expect(applied).toBe(true);
    expect(mockedWriteFile).toHaveBeenCalledOnce();
    const written = mockedWriteFile.mock.calls[0][1] as string;
    expect(written).toContain('db.query($1, [input])');
    expect(written).not.toContain('db.raw(input)');
  });

  it('returns false when the original snippet is not found', async () => {
    mockedReadFile.mockResolvedValue('no match here');

    const fix: FixSuggestion = {
      original: 'db.raw(input)',
      fixed: 'db.query($1, [input])',
      explanation: 'test',
      confidence: 0.9,
    };

    const applied = await applyFixToFile('/project/src/db.ts', fix);

    expect(applied).toBe(false);
    expect(mockedWriteFile).not.toHaveBeenCalled();
  });
});

describe('runFixWorkflow', () => {
  it('reads the file, generates a fix, and applies it', async () => {
    const fileContent = 'const x = db.raw(input);';
    mockedReadFile.mockResolvedValue(fileContent);
    mockedWriteFile.mockResolvedValue(undefined);

    const fix: FixSuggestion = {
      original: 'db.raw(input)',
      fixed: 'db.safe(input)',
      explanation: 'Sanitized query.',
      confidence: 0.8,
    };
    const provider = makeProvider(fix);

    const result = await runFixWorkflow(makeFinding(), provider);

    expect(result.fix.original).toBe('db.raw(input)');
    expect(result.fix.fixed).toBe('db.safe(input)');
    expect(result.filePath).toBe('/project/src/db.ts');
    expect(result.applied).toBe(true);
    expect(provider.analyze).toHaveBeenCalledOnce();
  });

  it('skips applying when dryRun is true', async () => {
    const fileContent = 'const x = db.raw(input);';
    mockedReadFile.mockResolvedValue(fileContent);

    const fix: FixSuggestion = {
      original: 'db.raw(input)',
      fixed: 'db.safe(input)',
      explanation: 'Sanitized.',
      confidence: 0.8,
    };
    const provider = makeProvider(fix);

    const result = await runFixWorkflow(makeFinding(), provider, true);

    expect(result.applied).toBe(false);
    expect(mockedWriteFile).not.toHaveBeenCalled();
  });

  it('throws when finding has no file path', async () => {
    const finding = makeFinding({file: undefined});
    const provider = makeProvider({
      original: '',
      fixed: '',
      explanation: '',
      confidence: 0,
    });

    await expect(runFixWorkflow(finding, provider)).rejects.toThrow(
      'has no file path',
    );
  });
});
