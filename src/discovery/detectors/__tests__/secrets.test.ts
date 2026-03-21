import {describe, it, expect} from 'vitest';
import type {DetectorContext, GrepMatch, GrepOptions} from '../../types.js';
import {secretsDetector} from '../secrets.js';

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
            // Exact filename match like "**/.env"
            if (!rest.includes('*')) {
              return f === rest || f.endsWith('/' + rest);
            }
            // Pattern like "**/.env.*"
            const regex = new RegExp(
              rest.replace(/\./g, '\\.').replace(/\*/g, '[^/]*'),
            );
            const basename = f.split('/').pop() ?? f;
            return regex.test(basename);
          }
          return f === p;
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
    grep: async (
      pattern: RegExp,
      filePatterns: string[],
      _options?: GrepOptions,
    ): Promise<GrepMatch[]> => {
      const matches: GrepMatch[] = [];
      for (const [file, content] of Object.entries(files)) {
        const matchesPattern = filePatterns.some(p => {
          if (p.startsWith('**/')) {
            const ext = p.slice(3);
            if (ext.startsWith('*.')) return file.endsWith(ext.slice(1));
            return file.includes(ext);
          }
          return file === p;
        });
        if (!matchesPattern) continue;
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          const m = lines[i].match(pattern);
          if (m)
            matches.push({
              file,
              line: i + 1,
              content: lines[i].trim(),
              match: m[0],
            });
        }
      }
      return matches;
    },
  };
}

describe('secretsDetector', () => {
  it('finds .env files (excluding examples)', async () => {
    const ctx = createMockContext({
      '.env': 'DB_HOST=localhost',
      '.env.local': 'API_KEY=secret',
      '.env.example': 'API_KEY=your-key-here',
      '.env.sample': 'TOKEN=replace-me',
    });

    const result = await secretsDetector.detect(ctx);
    expect(result.envFiles).toContain('.env');
    expect(result.envFiles).toContain('.env.local');
    expect(result.envFiles).not.toContain('.env.example');
    expect(result.envFiles).not.toContain('.env.sample');
  });

  it('checks .gitignore for .env exclusion', async () => {
    const ctx = createMockContext({
      '.gitignore': 'node_modules/\n.env\ndist/\n',
    });

    const result = await secretsDetector.detect(ctx);
    expect(result.gitignoresEnv).toBe(true);
  });

  it('reports gitignoresEnv=false when .env not in gitignore', async () => {
    const ctx = createMockContext({
      '.gitignore': 'node_modules/\ndist/\n',
    });

    const result = await secretsDetector.detect(ctx);
    expect(result.gitignoresEnv).toBe(false);
  });

  it('detects hardcoded AWS keys as high risk', async () => {
    const ctx = createMockContext({
      'src/config.ts':
        'const config = {\n  aws_access_key_id = "AKIAIOSFODNN7EXAMPLE"\n};',
      '.gitignore': '.env\n',
    });

    const result = await secretsDetector.detect(ctx);
    const awsFinding = result.findings.find(
      f => f.pattern === 'aws_access_key_id',
    );
    expect(awsFinding).toBeDefined();
    expect(awsFinding!.risk).toBe('high');
    expect(awsFinding!.file).toBe('src/config.ts');
  });

  it('detects hardcoded API_KEY as medium risk', async () => {
    const ctx = createMockContext({
      'src/service.ts': 'const API_KEY = "sk-1234567890abcdef";',
      '.gitignore': '.env\n',
    });

    const result = await secretsDetector.detect(ctx);
    const apiKeyFinding = result.findings.find(
      f => f.pattern === 'API_KEY',
    );
    expect(apiKeyFinding).toBeDefined();
    expect(apiKeyFinding!.risk).toBe('medium');
  });

  it('excludes test files from findings', async () => {
    const ctx = createMockContext({
      'src/__tests__/auth.test.ts':
        'const TOKEN = "test-token-abc123def";',
      '.gitignore': '.env\n',
    });

    const result = await secretsDetector.detect(ctx);
    expect(result.findings).toHaveLength(0);
  });

  it('excludes .env files from hardcoded findings', async () => {
    const ctx = createMockContext({
      '.env': 'API_KEY = "actual-secret-key-here"',
      '.gitignore': '.env\n',
    });

    const result = await secretsDetector.detect(ctx);
    // .env should appear in envFiles but not as a hardcoded finding
    expect(result.envFiles).toContain('.env');
    expect(result.findings.filter(f => f.type === 'hardcoded')).toHaveLength(0);
  });

  it('reports clean repo with no findings', async () => {
    const ctx = createMockContext({
      'src/index.ts': 'console.log("hello world");',
      '.gitignore': 'node_modules/\n.env\n',
    });

    const result = await secretsDetector.detect(ctx);
    expect(result.envFiles).toHaveLength(0);
    expect(result.gitignoresEnv).toBe(true);
    expect(result.findings).toHaveLength(0);
  });

  it('handles missing .gitignore gracefully', async () => {
    const ctx = createMockContext({
      'src/index.ts': 'console.log("no gitignore");',
    });

    const result = await secretsDetector.detect(ctx);
    expect(result.gitignoresEnv).toBe(false);
  });

  it('detects PASSWORD pattern', async () => {
    const ctx = createMockContext({
      'src/db.ts': 'const PASSWORD = "supersecret123";',
      '.gitignore': '.env\n',
    });

    const result = await secretsDetector.detect(ctx);
    const pwFinding = result.findings.find(f => f.pattern === 'PASSWORD');
    expect(pwFinding).toBeDefined();
    expect(pwFinding!.risk).toBe('medium');
  });
});
