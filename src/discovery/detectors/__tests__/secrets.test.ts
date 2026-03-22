import {describe, it, expect} from 'vitest';
import type {DetectorContext, GrepMatch, GrepOptions} from '../../types.js';
import {secretsDetector} from '../secrets.js';

function createMockContext(files: Record<string, string>): DetectorContext {
  return {
    rootDir: '/mock',
    findFiles: async (patterns: string[]) => Object.keys(files).filter((f) => patterns.some((p) => { if (p.startsWith('**/')) { const rest = p.slice(3); if (rest.startsWith('*.')) return f.endsWith(rest.slice(1)); if (!rest.includes('*')) return f === rest || f.endsWith('/' + rest); const regex = new RegExp(rest.replace(/\./g, '\\.').replace(/\*/g, '[^/]*')); return regex.test(f.split('/').pop() ?? f); } return f === p; })),
    readFile: async (path: string) => files[path] ?? null,
    readJson: async <T = unknown>(path: string) => { const c = files[path]; if (!c) return null; try { return JSON.parse(c) as T; } catch { return null; } },
    readYaml: async <T = unknown>(_path: string) => null as T,
    fileExists: async (path: string) => path in files,
    grep: async (pattern: RegExp, filePatterns: string[], _options?: GrepOptions): Promise<GrepMatch[]> => {
      const matches: GrepMatch[] = [];
      for (const [file, content] of Object.entries(files)) {
        const mp = filePatterns.some((p) => { if (p.startsWith('**/')) { const ext = p.slice(3); if (ext.startsWith('*.')) return file.endsWith(ext.slice(1)); return file.includes(ext); } return file === p; });
        if (!mp) continue;
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) { const m = lines[i].match(pattern); if (m) matches.push({file, line: i + 1, content: lines[i].trim(), match: m[0]}); }
      }
      return matches;
    },
  };
}

describe('secretsDetector', () => {
  it('finds .env files (excluding examples)', async () => {
    const ctx = createMockContext({'.env': 'DB=x', '.env.local': 'K=y', '.env.example': 'K=z', '.env.sample': 'T=w'});
    const result = await secretsDetector.detect(ctx);
    expect(result.envFiles).toContain('.env');
    expect(result.envFiles).not.toContain('.env.example');
  });

  it('checks .gitignore for .env exclusion', async () => {
    const result = await secretsDetector.detect(createMockContext({'.gitignore': 'node_modules/\n.env\ndist/\n'}));
    expect(result.gitignoresEnv).toBe(true);
  });

  it('reports gitignoresEnv=false when .env not in gitignore', async () => {
    const result = await secretsDetector.detect(createMockContext({'.gitignore': 'node_modules/\n'}));
    expect(result.gitignoresEnv).toBe(false);
  });

  it('detects hardcoded AWS keys as high risk', async () => {
    const result = await secretsDetector.detect(createMockContext({'src/config.ts': 'aws_access_key_id = "AKIAIOSFODNN7EXAMPLE"', '.gitignore': '.env\n'}));
    const f = result.findings.find((f) => f.pattern === 'aws_access_key_id');
    expect(f).toBeDefined();
    expect(f!.risk).toBe('high');
  });

  it('detects API_KEY as medium risk', async () => {
    const result = await secretsDetector.detect(createMockContext({'src/svc.ts': 'const API_KEY = "sk-1234567890abcdef";', '.gitignore': '.env\n'}));
    expect(result.findings.find((f) => f.pattern === 'API_KEY')).toBeDefined();
  });

  it('excludes test files', async () => {
    const result = await secretsDetector.detect(createMockContext({'src/__tests__/auth.test.ts': 'const TOKEN = "test-token-abc123def";', '.gitignore': '.env\n'}));
    expect(result.findings).toHaveLength(0);
  });

  it('reports clean repo', async () => {
    const result = await secretsDetector.detect(createMockContext({'src/index.ts': 'const greeting = "hello";', '.gitignore': '.env\n'}));
    expect(result.findings).toHaveLength(0);
  });

  it('detects PASSWORD pattern', async () => {
    const result = await secretsDetector.detect(createMockContext({'src/db.ts': 'const PASSWORD = "supersecret123";', '.gitignore': '.env\n'}));
    expect(result.findings.find((f) => f.pattern === 'PASSWORD')).toBeDefined();
  });

  it('includes confidence scores', async () => {
    const result = await secretsDetector.detect(createMockContext({'src/config.ts': 'aws_access_key_id = "AKIAIOSFODNN7EXAMPLE"', '.gitignore': '.env\n'}));
    expect(result.findings[0].confidence).toBeDefined();
    expect(result.findings[0].confidence).toBeGreaterThan(0);
  });

  it('detects GitHub tokens', async () => {
    const result = await secretsDetector.detect(createMockContext({'src/deploy.ts': 'const t = "ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij";', '.gitignore': '.env\n'}));
    expect(result.findings.find((f) => f.pattern === 'github_token')).toBeDefined();
  });

  it('detects database URLs', async () => {
    const result = await secretsDetector.detect(createMockContext({'src/db.ts': 'const url = "postgres://user:pass@localhost:5432/mydb";', '.gitignore': '.env\n'}));
    expect(result.findings.find((f) => f.pattern === 'database_url')).toBeDefined();
  });

  it('detects JWT tokens', async () => {
    const result = await secretsDetector.detect(createMockContext({'src/auth.ts': 'const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";', '.gitignore': '.env\n'}));
    expect(result.findings.find((f) => f.pattern === 'jwt_token')).toBeDefined();
  });

  it('reduces confidence for placeholder values', async () => {
    const result = await secretsDetector.detect(createMockContext({'src/config.ts': 'const API_KEY = "your-api-key-here-changeme";', '.gitignore': '.env\n'}));
    const f = result.findings.find((f) => f.pattern === 'API_KEY');
    expect(f).toBeDefined();
    expect(f!.confidence).toBeLessThan(0.7);
  });

  it('detects Slack tokens', async () => {
    const result = await secretsDetector.detect(createMockContext({'src/notify.ts': 'const slack = "xoxb-123456789012-abcdefghij";', '.gitignore': '.env\n'}));
    expect(result.findings.find((f) => f.pattern === 'slack_token')).toBeDefined();
  });

  it('deduplicates findings', async () => {
    const result = await secretsDetector.detect(createMockContext({'src/config.ts': 'const aws_access_key_id = "AKIAIOSFODNN7EXAMPLEF";', '.gitignore': '.env\n'}));
    const keys = result.findings.map((f) => f.file + ':' + f.line + ':' + f.pattern);
    expect(keys.length).toBe(new Set(keys).size);
  });
});
