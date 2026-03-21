import {describe, it, expect} from 'vitest';
import {docsDetector} from '../docs.js';
import {createMockContext} from './helpers.js';

describe('docsDetector', () => {
  it('detects full documentation set', async () => {
    const ctx = createMockContext({
      'README.md': '# My Project',
      'CONTRIBUTING.md': '# Contributing Guidelines',
      'SECURITY.md': '# Security Policy',
      'CHANGELOG.md': '# Changelog',
      'LICENSE': 'MIT License',
    });

    const result = await docsDetector.detect(ctx);

    expect(result.hasReadme).toBe(true);
    expect(result.hasContributing).toBe(true);
    expect(result.hasSecurityPolicy).toBe(true);
    expect(result.hasChangelog).toBe(true);
    expect(result.hasLicense).toBe(true);
  });

  it('detects minimal docs (README only)', async () => {
    const ctx = createMockContext({
      'README.md': '# My Project',
    });

    const result = await docsDetector.detect(ctx);

    expect(result.hasReadme).toBe(true);
    expect(result.hasContributing).toBe(false);
    expect(result.hasSecurityPolicy).toBe(false);
    expect(result.hasChangelog).toBe(false);
    expect(result.hasLicense).toBe(false);
  });

  it('returns all false when no docs present', async () => {
    const ctx = createMockContext({
      'src/index.ts': 'console.log("hello");',
    });

    const result = await docsDetector.detect(ctx);

    expect(result.hasReadme).toBe(false);
    expect(result.hasContributing).toBe(false);
    expect(result.hasSecurityPolicy).toBe(false);
    expect(result.hasChangelog).toBe(false);
    expect(result.hasLicense).toBe(false);
    expect(result.architectureDocs).toEqual([]);
    expect(result.aiConfigs).toEqual([]);
  });

  it('detects architecture docs', async () => {
    const ctx = createMockContext({
      'README.md': '# Project',
      'docs/architecture.md': '# Architecture',
      'docs/api-design.md': '# API Design',
      'specs/feature-x.md': '# Feature X Spec',
    });

    const result = await docsDetector.detect(ctx);

    expect(result.hasReadme).toBe(true);
    expect(result.architectureDocs.length).toBe(3);
    expect(result.architectureDocs).toContain('docs/architecture.md');
    expect(result.architectureDocs).toContain('docs/api-design.md');
    expect(result.architectureDocs).toContain('specs/feature-x.md');
  });

  it('detects AI configuration files', async () => {
    const ctx = createMockContext({
      'CLAUDE.md': '# AI Instructions',
      '.cursorrules': 'some rules',
    });

    const result = await docsDetector.detect(ctx);

    expect(result.aiConfigs.length).toBe(2);
    expect(result.aiConfigs).toContain('CLAUDE.md');
    expect(result.aiConfigs).toContain('.cursorrules');
  });

  it('detects SECURITY.md in .github directory', async () => {
    const ctx = createMockContext({
      '.github/SECURITY.md': '# Security Policy',
      '.github/CONTRIBUTING.md': '# Contributing',
    });

    const result = await docsDetector.detect(ctx);

    expect(result.hasSecurityPolicy).toBe(true);
    expect(result.hasContributing).toBe(true);
  });

  it('detects alternative file formats', async () => {
    const ctx = createMockContext({
      'README.rst': 'My Project\n==========',
      'LICENSE.txt': 'MIT License',
      'CHANGES.md': '# Changes',
    });

    const result = await docsDetector.detect(ctx);

    expect(result.hasReadme).toBe(true);
    expect(result.hasLicense).toBe(true);
    expect(result.hasChangelog).toBe(true);
  });
});
