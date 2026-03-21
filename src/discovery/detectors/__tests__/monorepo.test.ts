import {describe, it, expect} from 'vitest';
import type {DetectorContext} from '../../types.js';
import {monorepoDetector} from '../monorepo.js';

function createMockContext(
  files: Record<string, string>,
): DetectorContext {
  return {
    rootDir: '/mock',
    findFiles: async (patterns: string[]) => {
      return Object.keys(files).filter(f =>
        patterns.some(p => {
          if (p.startsWith('**/')) {
            const rest = p.slice(3);
            if (rest.startsWith('*.')) {
              return f.endsWith(rest.slice(1));
            }
            return f.includes(rest);
          }
          // Handle globs like "packages/*/package.json"
          if (p.includes('*')) {
            const regex = new RegExp(
              '^' +
                p
                  .replace(/\*/g, '[^/]+')
                  .replace(/\//g, '\\/') +
                '$',
            );
            return regex.test(f);
          }
          return f === p || f.endsWith('/' + p);
        }),
      );
    },
    readFile: async (path: string) => files[path] ?? null,
    readJson: async <T = unknown>(path: string) => {
      const content = files[path];
      if (!content) return null;
      try {
        return JSON.parse(content) as T;
      } catch {
        return null;
      }
    },
    readYaml: async <T = unknown>(_path: string) => null as T,
    fileExists: async (path: string) => path in files,
    grep: async () => [],
  };
}

describe('monorepoDetector', () => {
  it('detects npm workspaces', async () => {
    const ctx = createMockContext({
      'package.json': JSON.stringify({
        name: 'my-monorepo',
        workspaces: ['packages/*'],
      }),
      'packages/core/package.json': JSON.stringify({
        name: '@my/core',
      }),
      'packages/app/package.json': JSON.stringify({
        name: '@my/app',
        main: 'dist/index.js',
      }),
    });

    const result = await monorepoDetector.detect(ctx);
    expect(result.isMonorepo).toBe(true);
    expect(result.tool).toBe('npm-workspaces');
    expect(result.workspaces).toHaveLength(2);
    expect(result.workspaces.find(w => w.name === '@my/app')?.type).toBe('app');
    expect(result.workspaces.find(w => w.name === '@my/core')?.type).toBe(
      'library',
    );
  });

  it('detects yarn workspaces', async () => {
    const ctx = createMockContext({
      'package.json': JSON.stringify({
        name: 'yarn-mono',
        workspaces: ['packages/*'],
      }),
      'yarn.lock': '',
      'packages/lib/package.json': JSON.stringify({name: '@mono/lib'}),
    });

    const result = await monorepoDetector.detect(ctx);
    expect(result.isMonorepo).toBe(true);
    expect(result.tool).toBe('yarn-workspaces');
  });

  it('detects pnpm workspaces', async () => {
    const ctx = createMockContext({
      'pnpm-workspace.yaml': 'packages:\n  - packages/*\n',
      'package.json': JSON.stringify({name: 'pnpm-mono'}),
    });

    const result = await monorepoDetector.detect(ctx);
    expect(result.isMonorepo).toBe(true);
    expect(result.tool).toBe('pnpm');
  });

  it('detects lerna', async () => {
    const ctx = createMockContext({
      'lerna.json': JSON.stringify({version: '5.0.0'}),
      'package.json': JSON.stringify({name: 'lerna-mono'}),
    });

    const result = await monorepoDetector.detect(ctx);
    expect(result.isMonorepo).toBe(true);
    expect(result.tool).toBe('lerna');
  });

  it('detects turborepo', async () => {
    const ctx = createMockContext({
      'turbo.json': JSON.stringify({pipeline: {}}),
      'package.json': JSON.stringify({
        name: 'turbo-mono',
        workspaces: ['apps/*', 'packages/*'],
      }),
      'apps/web/package.json': JSON.stringify({
        name: '@turbo/web',
        main: 'index.ts',
      }),
    });

    const result = await monorepoDetector.detect(ctx);
    expect(result.isMonorepo).toBe(true);
    expect(result.tool).toBe('turborepo');
    expect(result.workspaces.length).toBeGreaterThanOrEqual(1);
  });

  it('detects nx', async () => {
    const ctx = createMockContext({
      'nx.json': JSON.stringify({}),
      'package.json': JSON.stringify({name: 'nx-mono'}),
    });

    const result = await monorepoDetector.detect(ctx);
    expect(result.isMonorepo).toBe(true);
    expect(result.tool).toBe('nx');
  });

  it('reports not a monorepo for single-package project', async () => {
    const ctx = createMockContext({
      'package.json': JSON.stringify({name: 'simple-app', main: 'index.js'}),
    });

    const result = await monorepoDetector.detect(ctx);
    expect(result.isMonorepo).toBe(false);
    expect(result.tool).toBeUndefined();
    expect(result.workspaces).toHaveLength(0);
  });

  it('handles workspaces as object with packages array', async () => {
    const ctx = createMockContext({
      'package.json': JSON.stringify({
        name: 'obj-workspaces',
        workspaces: {packages: ['packages/*']},
      }),
      'packages/foo/package.json': JSON.stringify({
        name: 'foo',
        bin: './cli.js',
      }),
    });

    const result = await monorepoDetector.detect(ctx);
    expect(result.isMonorepo).toBe(true);
    expect(result.workspaces).toHaveLength(1);
    expect(result.workspaces[0].type).toBe('app');
  });
});
