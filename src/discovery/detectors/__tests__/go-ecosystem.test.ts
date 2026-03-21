import {describe, it, expect} from 'vitest';
import {goEcosystemDetector} from '../go-ecosystem.js';
import {createMockContext} from './helpers.js';

describe('goEcosystemDetector', () => {
  it('returns detected=false when no go.mod exists', async () => {
    const ctx = createMockContext({
      'package.json': '{}',
      'src/index.ts': 'export const x = 1;',
    });

    const result = await goEcosystemDetector.detect(ctx);

    expect(result.detected).toBe(false);
    expect(result.hasGoSum).toBe(false);
    expect(result.frameworks).toEqual([]);
    expect(result.securityTools).toEqual([]);
  });

  it('detects a basic Go project from go.mod', async () => {
    const ctx = createMockContext({
      'go.mod': [
        'module github.com/example/myapp',
        '',
        'go 1.22',
        '',
        'require (',
        '\tgithub.com/gin-gonic/gin v1.9.0',
        '\tgithub.com/lib/pq v1.10.0',
        ')',
      ].join('\n'),
      'go.sum': '# checksum file',
    });

    const result = await goEcosystemDetector.detect(ctx);

    expect(result.detected).toBe(true);
    expect(result.goModFile).toBe('go.mod');
    expect(result.goVersion).toBe('1.22');
    expect(result.modulePath).toBe('github.com/example/myapp');
    expect(result.hasGoSum).toBe(true);
    expect(result.directDeps).toBe(2);
    expect(result.indirectDeps).toBe(0);
    expect(result.frameworks).toContain('gin');
  });

  it('distinguishes direct and indirect dependencies', async () => {
    const ctx = createMockContext({
      'go.mod': [
        'module example.com/app',
        '',
        'go 1.21',
        '',
        'require (',
        '\tgithub.com/labstack/echo/v4 v4.11.0',
        '\tgorm.io/gorm v1.25.0',
        '\tgolang.org/x/text v0.14.0 // indirect',
        '\tgolang.org/x/net v0.20.0 // indirect',
        ')',
      ].join('\n'),
    });

    const result = await goEcosystemDetector.detect(ctx);

    expect(result.directDeps).toBe(2);
    expect(result.indirectDeps).toBe(2);
    expect(result.frameworks).toContain('echo');
    expect(result.frameworks).toContain('gorm');
  });

  it('detects vendor directory', async () => {
    const ctx = createMockContext({
      'go.mod': 'module example.com/app\n\ngo 1.21\n',
      'vendor/modules.txt': '# module list',
    });

    const result = await goEcosystemDetector.detect(ctx);

    expect(result.hasVendor).toBe(true);
  });

  it('detects unsafe imports via grep', async () => {
    const ctx = createMockContext({
      'go.mod': 'module example.com/app\n\ngo 1.21\n',
      'main.go': [
        'package main',
        '',
        'import "unsafe"',
        '',
        'func main() {}',
      ].join('\n'),
    });

    const result = await goEcosystemDetector.detect(ctx);

    expect(result.hasUnsafeImports).toBe(true);
  });

  it('detects security tools as dependencies', async () => {
    const ctx = createMockContext({
      'go.mod': [
        'module example.com/app',
        '',
        'go 1.21',
        '',
        'require (',
        '\tgolang.org/x/crypto v0.18.0',
        '\tgithub.com/golang-jwt/jwt/v5 v5.2.0',
        '\tgithub.com/casbin/casbin/v2 v2.80.0',
        '\tgo.uber.org/zap v1.27.0',
        ')',
      ].join('\n'),
    });

    const result = await goEcosystemDetector.detect(ctx);

    expect(result.securityTools).toContain('x/crypto');
    expect(result.securityTools).toContain('golang-jwt');
    expect(result.securityTools).toContain('casbin');
    expect(result.securityTools).toContain('zap-logger');
  });

  it('handles go.mod with single-line require', async () => {
    const ctx = createMockContext({
      'go.mod': [
        'module example.com/app',
        '',
        'go 1.20',
        '',
        'require github.com/gofiber/fiber/v2 v2.52.0',
      ].join('\n'),
    });

    const result = await goEcosystemDetector.detect(ctx);

    expect(result.directDeps).toBe(1);
    expect(result.frameworks).toContain('fiber');
  });

  it('handles go.mod without go.sum', async () => {
    const ctx = createMockContext({
      'go.mod': 'module example.com/app\n\ngo 1.21\n',
    });

    const result = await goEcosystemDetector.detect(ctx);

    expect(result.detected).toBe(true);
    expect(result.hasGoSum).toBe(false);
  });

  it('detects multiple frameworks', async () => {
    const ctx = createMockContext({
      'go.mod': [
        'module example.com/app',
        '',
        'go 1.21',
        '',
        'require (',
        '\tgithub.com/go-chi/chi/v5 v5.0.0',
        '\tgorm.io/gorm v1.25.0',
        '\tgoogle.golang.org/grpc v1.60.0',
        ')',
      ].join('\n'),
    });

    const result = await goEcosystemDetector.detect(ctx);

    expect(result.frameworks).toContain('chi');
    expect(result.frameworks).toContain('gorm');
    expect(result.frameworks).toContain('grpc');
  });

  it('has correct detector name', () => {
    expect(goEcosystemDetector.name).toBe('go-ecosystem');
  });
});
