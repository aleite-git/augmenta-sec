import {describe, it, expect} from 'vitest';
import {languageDetector} from '../language.js';
import {createMockContext} from './helpers.js';

describe('languageDetector', () => {
  it('detects TypeScript project with tsconfig.json and .ts files', async () => {
    const ctx = createMockContext({
      'tsconfig.json': '{}',
      'package.json': '{}',
      'src/index.ts': 'export const x = 1;',
      'src/utils.ts': 'export function util() {}',
      'src/types.ts': 'export interface Foo {}',
    });

    const result = await languageDetector.detect(ctx);

    expect(result.primary).toBe('typescript');
    expect(result.all.length).toBeGreaterThan(0);
    const tsEntry = result.all.find(e => e.name === 'typescript');
    expect(tsEntry).toBeDefined();
    expect(tsEntry!.fileCount).toBe(3);
  });

  it('detects Python project with requirements.txt and .py files', async () => {
    const ctx = createMockContext({
      'requirements.txt': 'flask==2.0.0\nrequests==2.28.0',
      'app.py': 'from flask import Flask',
      'utils.py': 'def helper(): pass',
      'models.py': 'class User: pass',
    });

    const result = await languageDetector.detect(ctx);

    expect(result.primary).toBe('python');
    const pyEntry = result.all.find(e => e.name === 'python');
    expect(pyEntry).toBeDefined();
    expect(pyEntry!.fileCount).toBe(3);
  });

  it('detects multi-language project sorted by file count', async () => {
    const ctx = createMockContext({
      'tsconfig.json': '{}',
      'package.json': '{}',
      'requirements.txt': 'flask',
      // 4 TypeScript files
      'src/a.ts': '',
      'src/b.ts': '',
      'src/c.ts': '',
      'src/d.ts': '',
      // 2 Python files
      'scripts/a.py': '',
      'scripts/b.py': '',
      // 1 JavaScript file
      'config.js': '',
    });

    const result = await languageDetector.detect(ctx);

    // TypeScript has most files
    expect(result.primary).toBe('typescript');
    // All languages present
    expect(result.all.length).toBe(3);
    // Sorted by file count descending
    expect(result.all[0].name).toBe('typescript');
    expect(result.all[0].fileCount).toBe(4);
    expect(result.all[1].name).toBe('python');
    expect(result.all[1].fileCount).toBe(2);
    expect(result.all[2].name).toBe('javascript');
    expect(result.all[2].fileCount).toBe(1);
  });

  it('returns primary = "unknown" for empty project', async () => {
    const ctx = createMockContext({});

    const result = await languageDetector.detect(ctx);

    expect(result.primary).toBe('unknown');
    expect(result.all).toEqual([]);
  });

  it('correctly calculates percentage for each language', async () => {
    const ctx = createMockContext({
      'src/a.ts': '',
      'src/b.ts': '',
      'src/c.py': '',
      'src/d.py': '',
    });

    const result = await languageDetector.detect(ctx);

    // Each language should be 50%
    for (const entry of result.all) {
      expect(entry.percentage).toBe(50);
    }
  });
});
