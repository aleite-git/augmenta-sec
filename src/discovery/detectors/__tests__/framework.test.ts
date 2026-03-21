import {describe, it, expect} from 'vitest';
import {frameworkDetector} from '../framework.js';
import {createMockContext} from './helpers.js';

describe('frameworkDetector', () => {
  it('detects Express in package.json dependencies', async () => {
    const ctx = createMockContext({
      'package.json': JSON.stringify({
        dependencies: {
          'express': '^4.18.0',
        },
      }),
    });

    const result = await frameworkDetector.detect(ctx);

    expect(result.backend.length).toBeGreaterThan(0);
    const express = result.backend.find(f => f.name === 'express');
    expect(express).toBeDefined();
    expect(express!.category).toBe('backend');
    expect(express!.version).toBe('4.18.0');
    expect(express!.confidence).toBe(1.0);
  });

  it('detects React in package.json dependencies', async () => {
    const ctx = createMockContext({
      'package.json': JSON.stringify({
        dependencies: {
          'react': '^18.2.0',
          'react-dom': '^18.2.0',
        },
      }),
    });

    const result = await frameworkDetector.detect(ctx);

    expect(result.frontend.length).toBeGreaterThan(0);
    const react = result.frontend.find(f => f.name === 'react');
    expect(react).toBeDefined();
    expect(react!.category).toBe('frontend');
  });

  it('detects Django from requirements.txt', async () => {
    const ctx = createMockContext({
      'requirements.txt': 'django==4.2.0\ngunicorn==21.2.0\n',
    });

    const result = await frameworkDetector.detect(ctx);

    expect(result.backend.length).toBeGreaterThan(0);
    const django = result.backend.find(f => f.name === 'django');
    expect(django).toBeDefined();
    expect(django!.category).toBe('backend');
    expect(django!.confidence).toBe(1.0);
  });

  it('returns empty arrays when no frameworks detected', async () => {
    const ctx = createMockContext({
      'package.json': JSON.stringify({
        dependencies: {
          'lodash': '^4.17.0',
        },
      }),
    });

    const result = await frameworkDetector.detect(ctx);

    expect(result.backend).toEqual([]);
    expect(result.frontend).toEqual([]);
    expect(result.fullstack).toEqual([]);
    expect(result.orm).toEqual([]);
    expect(result.testing).toEqual([]);
  });

  it('detects testing frameworks', async () => {
    const ctx = createMockContext({
      'package.json': JSON.stringify({
        devDependencies: {
          'vitest': '^1.0.0',
          '@playwright/test': '^1.40.0',
        },
      }),
    });

    const result = await frameworkDetector.detect(ctx);

    expect(result.testing.length).toBe(2);
    expect(result.testing.map(f => f.name)).toContain('vitest');
    expect(result.testing.map(f => f.name)).toContain('playwright');
  });

  it('detects ORM frameworks', async () => {
    const ctx = createMockContext({
      'package.json': JSON.stringify({
        dependencies: {
          'drizzle-orm': '^0.30.0',
          'pg': '^8.11.0',
        },
      }),
    });

    const result = await frameworkDetector.detect(ctx);

    expect(result.orm.length).toBeGreaterThan(0);
    const drizzle = result.orm.find(f => f.name === 'drizzle');
    expect(drizzle).toBeDefined();
  });

  it('detects fullstack meta-frameworks', async () => {
    const ctx = createMockContext({
      'package.json': JSON.stringify({
        dependencies: {
          'next': '^14.0.0',
          'react': '^18.2.0',
        },
      }),
    });

    const result = await frameworkDetector.detect(ctx);

    expect(result.fullstack.length).toBeGreaterThan(0);
    const nextjs = result.fullstack.find(f => f.name === 'nextjs');
    expect(nextjs).toBeDefined();
  });

  it('detects Go frameworks from go.mod', async () => {
    const ctx = createMockContext({
      'go.mod': `module myapp

go 1.21

require (
  github.com/gin-gonic/gin v1.9.0
  gorm.io/gorm v1.25.0
)`,
    });

    const result = await frameworkDetector.detect(ctx);

    expect(result.backend.length).toBeGreaterThan(0);
    expect(result.backend.find(f => f.name === 'gin')).toBeDefined();
    expect(result.orm.find(f => f.name === 'gorm')).toBeDefined();
  });
});
