/**
 * Tests for diff-aware analysis (ASEC-044).
 */

import {describe, expect, it, vi} from 'vitest';

import {analyzeDiff, isCodeFile, parseFindings} from '../diff-analyzer.js';
import type {Diff, DiffFile} from '../../providers/git-platform/types.js';
import type {LLMProvider} from '../../providers/llm/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDiffFile(overrides: Partial<DiffFile> = {}): DiffFile {
  return {
    path: 'src/app.ts',
    status: 'modified',
    additions: 10,
    deletions: 2,
    patch:
      '@@ -1,5 +1,12 @@\n+import express from "express";\n+const app = express();',
    ...overrides,
  };
}

function makeDiff(files: DiffFile[]): Diff {
  return {
    files,
    additions: files.reduce((s, f) => s + f.additions, 0),
    deletions: files.reduce((s, f) => s + f.deletions, 0),
  };
}

function makeMockProvider(responseContent: string): LLMProvider {
  return {
    name: 'test-provider',
    model: 'test-model',
    capabilities: {
      maxContextTokens: 128000,
      supportsImages: false,
      supportsStructuredOutput: true,
    },
    analyze: vi.fn().mockResolvedValue({
      content: responseContent,
      tokensUsed: {input: 100, output: 50},
      model: 'test-model',
      role: 'analysis' as const,
    }),
    analyzeStructured: vi.fn(),
  };
}

// ---------------------------------------------------------------------------
// isCodeFile
// ---------------------------------------------------------------------------

describe('isCodeFile', () => {
  it('returns true for common code extensions', () => {
    expect(isCodeFile('src/app.ts')).toBe(true);
    expect(isCodeFile('lib/utils.js')).toBe(true);
    expect(isCodeFile('main.py')).toBe(true);
    expect(isCodeFile('handler.go')).toBe(true);
    expect(isCodeFile('app.rs')).toBe(true);
    expect(isCodeFile('Service.java')).toBe(true);
    expect(isCodeFile('deploy.tf')).toBe(true);
    expect(isCodeFile('config.yaml')).toBe(true);
    expect(isCodeFile('schema.sql')).toBe(true);
    expect(isCodeFile('script.sh')).toBe(true);
  });

  it('returns true for known filenames without extensions', () => {
    expect(isCodeFile('Dockerfile')).toBe(true);
    expect(isCodeFile('Makefile')).toBe(true);
    expect(isCodeFile('Jenkinsfile')).toBe(true);
    expect(isCodeFile('path/to/Dockerfile')).toBe(true);
  });

  it('returns false for non-code files', () => {
    expect(isCodeFile('image.png')).toBe(false);
    expect(isCodeFile('README.md')).toBe(false);
    expect(isCodeFile('package-lock.json')).toBe(true); // .json is code
    expect(isCodeFile('styles.css')).toBe(false);
    expect(isCodeFile('font.woff2')).toBe(false);
    expect(isCodeFile('data.csv')).toBe(false);
  });

  it('handles files with no extension', () => {
    expect(isCodeFile('randomfile')).toBe(false);
    expect(isCodeFile('LICENSE')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// parseFindings
// ---------------------------------------------------------------------------

describe('parseFindings', () => {
  it('parses a valid JSON array', () => {
    const json = JSON.stringify([
      {
        file: 'src/auth.ts',
        line: 10,
        severity: 'high',
        category: 'auth',
        title: 'Missing auth check',
        description: 'No authentication on endpoint.',
        confidence: 0.9,
      },
    ]);

    const result = parseFindings(json);
    expect(result).toHaveLength(1);
    expect(result[0].file).toBe('src/auth.ts');
    expect(result[0].severity).toBe('high');
  });

  it('parses JSON wrapped in markdown code fences', () => {
    const response =
      '```json\n[{"file":"a.ts","line":1,"severity":"low","category":"config","title":"t","description":"d","confidence":0.5}]\n```';
    const result = parseFindings(response);
    expect(result).toHaveLength(1);
  });

  it('returns empty array for empty JSON array', () => {
    expect(parseFindings('[]')).toHaveLength(0);
  });

  it('returns empty array for invalid JSON', () => {
    expect(parseFindings('not json at all')).toHaveLength(0);
  });

  it('returns empty array for non-array JSON', () => {
    expect(parseFindings('{"file":"a.ts"}')).toHaveLength(0);
  });

  it('filters out objects missing required fields', () => {
    const json = JSON.stringify([
      {file: 'a.ts', line: 1},
      {
        file: 'b.ts',
        line: 2,
        severity: 'medium',
        category: 'injection',
        title: 'XSS',
        description: 'Reflected XSS',
        confidence: 0.7,
      },
    ]);

    const result = parseFindings(json);
    expect(result).toHaveLength(1);
    expect(result[0].file).toBe('b.ts');
  });

  it('handles code fences without json language tag', () => {
    const response = '```\n[]\n```';
    expect(parseFindings(response)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// analyzeDiff
// ---------------------------------------------------------------------------

describe('analyzeDiff', () => {
  it('returns findings from LLM analysis', async () => {
    const diff = makeDiff([makeDiffFile()]);
    const provider = makeMockProvider(
      JSON.stringify([
        {
          file: 'src/app.ts',
          line: 5,
          severity: 'high',
          category: 'injection',
          title: 'SQL Injection',
          description: 'User input in raw query.',
          confidence: 0.9,
        },
      ]),
    );

    const findings = await analyzeDiff(diff, provider);
    expect(findings).toHaveLength(1);
    expect(findings[0].title).toBe('SQL Injection');
    expect(findings[0].source).toBe('llm');
    expect(findings[0].severity).toBe('high');
    expect(findings[0].status).toBe('open');
    expect(findings[0].id).toBeDefined();
  });

  it('skips non-code files', async () => {
    const diff = makeDiff([
      makeDiffFile({path: 'README.md', patch: '+Some docs'}),
      makeDiffFile({path: 'image.png', patch: undefined}),
    ]);
    const provider = makeMockProvider('[]');

    const findings = await analyzeDiff(diff, provider);
    expect(findings).toHaveLength(0);
    expect(provider.analyze).not.toHaveBeenCalled();
  });

  it('skips deleted files', async () => {
    const diff = makeDiff([
      makeDiffFile({status: 'deleted', patch: '-old code'}),
    ]);
    const provider = makeMockProvider('[]');

    const findings = await analyzeDiff(diff, provider);
    expect(findings).toHaveLength(0);
    expect(provider.analyze).not.toHaveBeenCalled();
  });

  it('skips files without patches', async () => {
    const diff = makeDiff([makeDiffFile({patch: undefined})]);
    const provider = makeMockProvider('[]');

    const findings = await analyzeDiff(diff, provider);
    expect(findings).toHaveLength(0);
    expect(provider.analyze).not.toHaveBeenCalled();
  });

  it('batches small files together', async () => {
    const smallFiles = Array.from({length: 5}, (_, i) =>
      makeDiffFile({
        path: `src/file${i}.ts`,
        patch: '@@ +1,2 @@\n+line',
      }),
    );
    const diff = makeDiff(smallFiles);
    const provider = makeMockProvider('[]');

    await analyzeDiff(diff, provider);
    expect(provider.analyze).toHaveBeenCalledTimes(1);
  });

  it('sends large files individually', async () => {
    const largePatch = Array.from(
      {length: 400},
      (_, i) => `+line ${i}`,
    ).join('\n');
    const diff = makeDiff([
      makeDiffFile({path: 'src/big.ts', patch: largePatch}),
      makeDiffFile({path: 'src/small.ts', patch: '+tiny'}),
    ]);
    const provider = makeMockProvider('[]');

    await analyzeDiff(diff, provider);
    expect(provider.analyze).toHaveBeenCalledTimes(2);
  });

  it('flushes pending batch before a large file', async () => {
    const largePatch = Array.from(
      {length: 400},
      (_, i) => `+line ${i}`,
    ).join('\n');
    const diff = makeDiff([
      makeDiffFile({path: 'src/small1.ts', patch: '+tiny1'}),
      makeDiffFile({path: 'src/small2.ts', patch: '+tiny2'}),
      makeDiffFile({path: 'src/big.ts', patch: largePatch}),
    ]);
    const provider = makeMockProvider('[]');

    await analyzeDiff(diff, provider);
    expect(provider.analyze).toHaveBeenCalledTimes(2);
  });

  it('splits into new batch when line limit is exceeded', async () => {
    const medPatch = Array.from(
      {length: 200},
      (_, i) => `+line ${i}`,
    ).join('\n');
    const diff = makeDiff([
      makeDiffFile({path: 'src/med1.ts', patch: medPatch}),
      makeDiffFile({path: 'src/med2.ts', patch: medPatch}),
      makeDiffFile({path: 'src/med3.ts', patch: medPatch}),
    ]);
    const provider = makeMockProvider('[]');

    await analyzeDiff(diff, provider);
    expect(provider.analyze).toHaveBeenCalledTimes(3);
  });

  it('returns empty array when diff has no files', async () => {
    const diff = makeDiff([]);
    const provider = makeMockProvider('[]');

    const findings = await analyzeDiff(diff, provider);
    expect(findings).toHaveLength(0);
    expect(provider.analyze).not.toHaveBeenCalled();
  });

  it('normalizes invalid severity to medium', async () => {
    const provider = makeMockProvider(
      JSON.stringify([
        {
          file: 'src/app.ts',
          line: 1,
          severity: 'SUPER_HIGH',
          category: 'auth',
          title: 'Test',
          description: 'Desc',
          confidence: 0.5,
        },
      ]),
    );
    const diff = makeDiff([makeDiffFile()]);

    const findings = await analyzeDiff(diff, provider);
    expect(findings[0].severity).toBe('medium');
  });

  it('clamps confidence to [0, 1]', async () => {
    const provider = makeMockProvider(
      JSON.stringify([
        {
          file: 'src/app.ts',
          line: 1,
          severity: 'low',
          category: 'config',
          title: 'Test',
          description: 'Desc',
          confidence: 5.0,
        },
      ]),
    );
    const diff = makeDiff([makeDiffFile()]);

    const findings = await analyzeDiff(diff, provider);
    expect(findings[0].confidence).toBe(1);
  });

  it('handles LLM returning markdown-wrapped JSON', async () => {
    const provider = makeMockProvider(
      '```json\n[{"file":"src/app.ts","line":1,"severity":"low","category":"config","title":"T","description":"D","confidence":0.5}]\n```',
    );
    const diff = makeDiff([makeDiffFile()]);

    const findings = await analyzeDiff(diff, provider);
    expect(findings).toHaveLength(1);
  });

  it('includes optional cweId and suggestedFix', async () => {
    const provider = makeMockProvider(
      JSON.stringify([
        {
          file: 'src/app.ts',
          line: 3,
          severity: 'high',
          category: 'injection',
          title: 'XSS',
          description: 'Reflected XSS vulnerability.',
          suggestedFix: 'Use textContent instead of innerHTML.',
          cweId: 'CWE-79',
          confidence: 0.95,
        },
      ]),
    );
    const diff = makeDiff([makeDiffFile()]);

    const findings = await analyzeDiff(diff, provider);
    expect(findings[0].cweId).toBe('CWE-79');
    expect(findings[0].suggestedFix).toBe(
      'Use textContent instead of innerHTML.',
    );
  });
});
