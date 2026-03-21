import {describe, it, expect} from 'vitest';
import type {DetectorContext} from '../../types.js';
import {dockerDetector} from '../docker.js';

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
            // Handle patterns like "**/Dockerfile.*"
            if (rest.includes('*')) {
              const regex = new RegExp(
                rest
                  .replace(/\./g, '\\.')
                  .replace(/\*/g, '[^/]*'),
              );
              const basename = f.split('/').pop() ?? f;
              return regex.test(basename);
            }
            // Exact filename match anywhere in path
            return f === rest || f.endsWith('/' + rest);
          }
          if (p.includes('*')) {
            const regex = new RegExp(
              '^' +
                p
                  .replace(/\./g, '\\.')
                  .replace(/\*/g, '[^/]*')
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

describe('dockerDetector', () => {
  it('detects a simple Dockerfile', async () => {
    const ctx = createMockContext({
      Dockerfile: [
        'FROM node:18-alpine',
        'WORKDIR /app',
        'COPY . .',
        'RUN npm install',
        'CMD ["node", "index.js"]',
      ].join('\n'),
    });

    const result = await dockerDetector.detect(ctx);
    expect(result.hasDocker).toBe(true);
    expect(result.dockerfiles).toContain('Dockerfile');
    expect(result.baseImages).toContain('node:18-alpine');
    expect(result.hasMultiStage).toBe(false);
    expect(result.usesNonRoot).toBe(false);
    expect(result.healthCheck).toBe(false);
  });

  it('detects multi-stage build', async () => {
    const ctx = createMockContext({
      Dockerfile: [
        'FROM node:18 AS builder',
        'WORKDIR /app',
        'COPY . .',
        'RUN npm run build',
        '',
        'FROM node:18-alpine',
        'COPY --from=builder /app/dist /app',
        'CMD ["node", "/app/index.js"]',
      ].join('\n'),
    });

    const result = await dockerDetector.detect(ctx);
    expect(result.hasMultiStage).toBe(true);
    expect(result.baseImages).toContain('node:18');
    expect(result.baseImages).toContain('node:18-alpine');
  });

  it('detects non-root USER', async () => {
    const ctx = createMockContext({
      Dockerfile: [
        'FROM python:3.11-slim',
        'RUN adduser --disabled-password appuser',
        'USER appuser',
        'CMD ["python", "app.py"]',
      ].join('\n'),
    });

    const result = await dockerDetector.detect(ctx);
    expect(result.usesNonRoot).toBe(true);
  });

  it('does not flag USER root as non-root', async () => {
    const ctx = createMockContext({
      Dockerfile: [
        'FROM ubuntu:22.04',
        'USER root',
        'RUN apt-get update',
        'CMD ["/bin/bash"]',
      ].join('\n'),
    });

    const result = await dockerDetector.detect(ctx);
    expect(result.usesNonRoot).toBe(false);
  });

  it('detects HEALTHCHECK', async () => {
    const ctx = createMockContext({
      Dockerfile: [
        'FROM node:18',
        'HEALTHCHECK --interval=30s CMD curl -f http://localhost:3000/ || exit 1',
        'CMD ["node", "server.js"]',
      ].join('\n'),
    });

    const result = await dockerDetector.detect(ctx);
    expect(result.healthCheck).toBe(true);
  });

  it('detects docker-compose files', async () => {
    const ctx = createMockContext({
      'docker-compose.yml': 'version: "3.8"\nservices:\n  web:\n    build: .\n',
      'docker-compose.prod.yml': 'version: "3.8"\nservices:\n  web:\n    image: prod\n',
    });

    const result = await dockerDetector.detect(ctx);
    expect(result.hasDocker).toBe(false);
    expect(result.hasCompose).toBe(true);
    expect(result.composeFiles).toHaveLength(2);
  });

  it('reports no docker when no files found', async () => {
    const ctx = createMockContext({
      'package.json': '{}',
      'src/index.ts': 'console.log("hello")',
    });

    const result = await dockerDetector.detect(ctx);
    expect(result.hasDocker).toBe(false);
    expect(result.hasCompose).toBe(false);
    expect(result.dockerfiles).toHaveLength(0);
    expect(result.baseImages).toHaveLength(0);
  });

  it('handles multiple Dockerfiles across subdirs', async () => {
    const ctx = createMockContext({
      'api/Dockerfile': 'FROM golang:1.21\nUSER nobody\nCMD ["./api"]',
      'web/Dockerfile': 'FROM nginx:alpine\nHEALTHCHECK CMD wget -q http://localhost\nCMD ["nginx"]',
    });

    const result = await dockerDetector.detect(ctx);
    expect(result.hasDocker).toBe(true);
    expect(result.dockerfiles).toHaveLength(2);
    expect(result.baseImages).toContain('golang:1.21');
    expect(result.baseImages).toContain('nginx:alpine');
    expect(result.usesNonRoot).toBe(true);
    expect(result.healthCheck).toBe(true);
  });
});
