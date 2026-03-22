/**
 * ASEC-115: Integration test for the full init workflow.
 */
import {describe, it, expect, vi, beforeEach} from 'vitest';

vi.mock('node:fs/promises', () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../utils/file-utils.js', () => ({createDetectorContext: vi.fn()}));
vi.mock('../../utils/logger.js', () => ({logger: {debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn()}}));

function buildMockContext(vfs: Record<string, string | null>) {
  const files = Object.keys(vfs);
  function matchGlob(fp: string, p: string): boolean {
    let r = '^'; let i = 0;
    while (i < p.length) { const c = p[i]; if (c === '*') { if (p[i+1] === '*') { if (p[i+2] === '/') { r += '(?:.+/)?'; i += 3; } else { r += '.*'; i += 2; } } else { r += '[^/]*'; i += 1; } } else if (c === '.') { r += '\\.'; i += 1; } else if (c === '{') { const cb = p.indexOf('}', i); if (cb !== -1) { const a = p.slice(i+1, cb).split(',').map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')); r += '(?:' + a.join('|') + ')'; i = cb + 1; } else { r += '\\{'; i += 1; } } else { r += c; i += 1; } }
    r += '$'; return new RegExp(r).test(fp);
  }
  return {
    rootDir: '/mock-project',
    findFiles: vi.fn(async (patterns: string[]) => { const m = new Set<string>(); for (const p of patterns) for (const f of files) if (matchGlob(f, p)) m.add(f); return [...m].sort(); }),
    readFile: vi.fn(async (path: string) => vfs[path] ?? null),
    readJson: vi.fn(async (path: string) => { const c = vfs[path]; if (c == null) return null; try { return JSON.parse(c); } catch { return null; } }) as ReturnType<typeof vi.fn>,
    readYaml: vi.fn(async (path: string) => { const c = vfs[path]; if (c == null) return null; try { return JSON.parse(c); } catch { return c; } }) as ReturnType<typeof vi.fn>,
    fileExists: vi.fn(async (path: string) => path in vfs),
    grep: vi.fn(async (pattern: RegExp, filePatterns: string[]) => {
      const matches: Array<{file: string; line: number; content: string; match: string}> = [];
      const mf = new Set<string>(); for (const fp of filePatterns) for (const f of files) if (matchGlob(f, fp)) mf.add(f);
      for (const file of mf) { const content = vfs[file]; if (content == null) continue; const lines = content.split('\n'); for (let i = 0; i < lines.length; i++) { const m = lines[i].match(pattern); if (m) matches.push({file, line: i + 1, content: lines[i].trim(), match: m[0]}); } }
      return matches;
    }),
  };
}

describe('init workflow integration', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('runs discovery for a TypeScript Express project', async () => {
    const {createDetectorContext} = await import('../../utils/file-utils.js');
    vi.mocked(createDetectorContext).mockReturnValue(buildMockContext({
      'package.json': JSON.stringify({dependencies: {express: '^4.18.0', helmet: '^7.0.0', zod: '^3.22.0', jsonwebtoken: '^9.0.0', pg: '^8.11.0', 'drizzle-orm': '^0.30.0'}, devDependencies: {vitest: '^1.0.0'}}),
      'tsconfig.json': '{}', 'src/index.ts': "import express from 'express';", 'src/routes.ts': "app.get('/api/users', getUsers);\napp.post('/api/users', createUser);",
      'src/middleware/auth.ts': "import jwt from 'jsonwebtoken';\nexport function authMiddleware(req, res, next) { const d = jwt.verify(req.headers.authorization, 's'); next(); }",
      'src/app.ts': "import helmet from 'helmet';\napp.use(helmet());", 'src/validation.ts': "import {z} from 'zod';\nconst s = z.object({name: z.string()});",
      'drizzle/0000_initial.sql': 'CREATE TABLE users', '.github/workflows/ci.yml': 'name: CI\non: [push]\njobs:\n  test:\n    runs-on: ubuntu-latest',
      'README.md': '# Project', 'LICENSE': 'MIT', 'src/db/schema/users.ts': 'export const users = pgTable("users", {});',
    }));
    const {runDiscovery} = await import('../../discovery/engine.js');
    const {writeProfile} = await import('../../discovery/profile-writer.js');
    const {profile, duration, warnings} = await runDiscovery('/mock-project');
    expect(profile.languages.primary).toBe('typescript');
    expect(profile.frameworks.backend.find(f => f.name === 'express')).toBeDefined();
    expect(profile.auth.providers.find(p => p.name === 'jwt')).toBeDefined();
    expect(profile.database.databases[0]?.type).toBe('postgresql');
    expect(profile.api.routeCount).toBeGreaterThan(0);
    expect(profile.securityControls.present.length).toBeGreaterThan(0);
    expect(profile.ci.platform).toBe('github-actions');
    expect(profile.docs.hasReadme).toBe(true);
    expect(duration).toBeGreaterThanOrEqual(0);
    expect(warnings.length).toBe(0);
    const filePath = await writeProfile(profile, '/mock-project');
    expect(filePath).toBe('/mock-project/.augmenta-sec/profile.yaml');
  });

  it('runs discovery on an empty project without errors', async () => {
    const {createDetectorContext} = await import('../../utils/file-utils.js');
    vi.mocked(createDetectorContext).mockReturnValue(buildMockContext({}));
    const {runDiscovery} = await import('../../discovery/engine.js');
    const {profile, warnings} = await runDiscovery('/empty');
    expect(profile.languages.primary).toBe('unknown');
    expect(profile.frameworks.backend).toEqual([]);
    expect(warnings.length).toBe(0);
  });

  it('runs discovery on a Python Django project', async () => {
    const {createDetectorContext} = await import('../../utils/file-utils.js');
    vi.mocked(createDetectorContext).mockReturnValue(buildMockContext({
      'requirements.txt': 'django==4.2.0\npsycopg2-binary==2.9.0\ndjango-allauth==0.58.0\n',
      'manage.py': '#!/usr/bin/env python', 'myapp/views.py': 'def home(request): pass', 'myapp/models.py': 'class User: pass',
      '.gitlab-ci.yml': 'stages:\n  - test\ntest:\n  script: pytest', 'README.md': '# Django',
    }));
    const {runDiscovery} = await import('../../discovery/engine.js');
    const {profile} = await runDiscovery('/django');
    expect(profile.languages.primary).toBe('python');
    expect(profile.frameworks.backend.find(f => f.name === 'django')).toBeDefined();
    expect(profile.database.databases[0]?.type).toBe('postgresql');
    expect(profile.ci.platform).toBe('gitlab-ci');
  });

  it('runs discovery on a Go Gin project', async () => {
    const {createDetectorContext} = await import('../../utils/file-utils.js');
    vi.mocked(createDetectorContext).mockReturnValue(buildMockContext({
      'go.mod': 'module myapp\n\ngo 1.21\n\nrequire (\n  github.com/gin-gonic/gin v1.9.0\n  gorm.io/gorm v1.25.0\n)',
      'main.go': 'package main\nfunc main() {\n  r := gin.Default()\n  r.GET("/api/health", h)\n  r.POST("/api/users", h)\n}',
      'handlers/user.go': 'package handlers', 'models/user.go': 'package models',
    }));
    const {runDiscovery} = await import('../../discovery/engine.js');
    const {profile} = await runDiscovery('/go');
    expect(profile.languages.primary).toBe('go');
    expect(profile.frameworks.backend.find(f => f.name === 'gin')).toBeDefined();
    expect(profile.api.routeCount).toBeGreaterThan(0);
  });

  it('writes both profile.yaml and endpoints.yaml', async () => {
    const {createDetectorContext} = await import('../../utils/file-utils.js');
    vi.mocked(createDetectorContext).mockReturnValue(buildMockContext({
      'package.json': JSON.stringify({dependencies: {express: '^4.18.0'}}), 'tsconfig.json': '{}',
      'src/routes.ts': "app.get('/a', h);\napp.post('/b', h);\napp.delete('/c', h);",
    }));
    const {runDiscovery} = await import('../../discovery/engine.js');
    const {writeProfile} = await import('../../discovery/profile-writer.js');
    const {profile} = await runDiscovery('/mock');
    await writeProfile(profile, '/mock');
    const {writeFile} = await import('node:fs/promises');
    if (profile.api.endpoints.length > 0) {
      expect(vi.mocked(writeFile).mock.calls.length).toBe(2);
    }
  });

  it('profile YAML contains all required top-level keys', async () => {
    const {createDetectorContext} = await import('../../utils/file-utils.js');
    vi.mocked(createDetectorContext).mockReturnValue(buildMockContext({'package.json': '{}', 'src/index.ts': ''}));
    const {runDiscovery} = await import('../../discovery/engine.js');
    const {writeProfile} = await import('../../discovery/profile-writer.js');
    const {profile} = await runDiscovery('/test');
    await writeProfile(profile, '/test');
    const {writeFile} = await import('node:fs/promises');
    const content = vi.mocked(writeFile).mock.calls[0][1] as string;
    for (const key of ['version', 'generatedAt', 'target', 'project', 'languages', 'frameworks', 'auth', 'database', 'api', 'securityControls', 'ci', 'docs']) {
      expect(content).toContain(key + ':');
    }
  });

  it('discovery completes within reasonable time', async () => {
    const {createDetectorContext} = await import('../../utils/file-utils.js');
    vi.mocked(createDetectorContext).mockReturnValue(buildMockContext({'package.json': '{}'}));
    const {runDiscovery} = await import('../../discovery/engine.js');
    const {duration} = await runDiscovery('/test');
    expect(duration).toBeLessThan(5000);
  });

  it('handles mixed-language monorepo project', async () => {
    const {createDetectorContext} = await import('../../utils/file-utils.js');
    vi.mocked(createDetectorContext).mockReturnValue(buildMockContext({
      'package.json': JSON.stringify({workspaces: ['packages/*']}),
      'packages/web/package.json': JSON.stringify({dependencies: {react: '^18.0.0', next: '^14.0.0'}}),
      'packages/api/package.json': JSON.stringify({dependencies: {express: '^4.18.0'}}),
      'packages/web/src/App.tsx': '', 'packages/api/src/index.ts': '', 'tsconfig.json': '{}',
    }));
    const {runDiscovery} = await import('../../discovery/engine.js');
    const {profile} = await runDiscovery('/monorepo');
    expect(profile.languages.primary).toBe('typescript');
    expect(profile.frameworks.backend.find(f => f.name === 'express')).toBeDefined();
    expect(profile.frameworks.fullstack.find(f => f.name === 'nextjs')).toBeDefined();
  });

  it('profile version is always 1.0', async () => {
    const {createDetectorContext} = await import('../../utils/file-utils.js');
    vi.mocked(createDetectorContext).mockReturnValue(buildMockContext({}));
    const {runDiscovery} = await import('../../discovery/engine.js');
    const {profile} = await runDiscovery('/test');
    expect(profile.version).toBe('1.0');
  });

  it('handles project with unreadable files gracefully', async () => {
    const {createDetectorContext} = await import('../../utils/file-utils.js');
    vi.mocked(createDetectorContext).mockReturnValue(buildMockContext({'package.json': null, 'src/index.ts': ''}));
    const {runDiscovery} = await import('../../discovery/engine.js');
    const {profile} = await runDiscovery('/test');
    expect(profile).toBeDefined();
  });
});
