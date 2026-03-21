import {describe, it, expect} from 'vitest';
import {ciDetector} from '../ci.js';
import {createMockContext} from './helpers.js';

describe('ciDetector', () => {
  it('detects GitHub Actions from .github/workflows/ci.yml', async () => {
    const ctx = createMockContext({
      '.github/workflows/ci.yml': `
name: CI Pipeline
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm test
`,
    });

    const result = await ciDetector.detect(ctx);

    expect(result.platform).toBe('github-actions');
    expect(result.workflows.length).toBe(1);
    expect(result.workflows[0].name).toBe('CI Pipeline');
    expect(result.workflows[0].file).toBe('.github/workflows/ci.yml');
  });

  it('detects GitLab CI from .gitlab-ci.yml', async () => {
    const ctx = createMockContext({
      '.gitlab-ci.yml': `
stages:
  - test
  - build

test:
  stage: test
  script:
    - npm test
`,
    });

    const result = await ciDetector.detect(ctx);

    expect(result.platform).toBe('gitlab-ci');
    expect(result.workflows.length).toBe(1);
  });

  it('returns platform = "none" when no CI detected', async () => {
    const ctx = createMockContext({
      'src/index.ts': 'console.log("hello");',
    });

    const result = await ciDetector.detect(ctx);

    expect(result.platform).toBe('none');
    expect(result.workflows).toEqual([]);
    expect(result.securityChecks).toEqual([]);
  });

  it('detects security checks within CI workflows', async () => {
    const ctx = createMockContext({
      '.github/workflows/security.yml': `
name: Security
on: [push]

jobs:
  codeql:
    runs-on: ubuntu-latest
    steps:
      - uses: github/codeql-action/init@v3

  trivy:
    runs-on: ubuntu-latest
    steps:
      - uses: aquasecurity/trivy-action@master
`,
    });

    const result = await ciDetector.detect(ctx);

    expect(result.securityChecks.length).toBeGreaterThanOrEqual(2);
    const codeql = result.securityChecks.find(c => c.name === 'CodeQL');
    expect(codeql).toBeDefined();
    expect(codeql!.type).toBe('sast');

    const trivy = result.securityChecks.find(c => c.name === 'Trivy');
    expect(trivy).toBeDefined();
    expect(trivy!.type).toBe('container');
  });

  it('detects Dependabot configuration', async () => {
    const ctx = createMockContext({
      '.github/workflows/ci.yml': `
name: CI
on: [push]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - run: npm test
`,
      '.github/dependabot.yml': `
version: 2
updates:
  - package-ecosystem: npm
    directory: /
    schedule:
      interval: weekly
`,
    });

    const result = await ciDetector.detect(ctx);

    const dependabot = result.securityChecks.find(c => c.name === 'Dependabot');
    expect(dependabot).toBeDefined();
    expect(dependabot!.type).toBe('sca');
  });

  it('detects multiple workflows', async () => {
    const ctx = createMockContext({
      '.github/workflows/ci.yml': `
name: CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
`,
      '.github/workflows/deploy.yml': `
name: Deploy
on:
  push:
    tags: ['v*']
jobs:
  deploy:
    runs-on: ubuntu-latest
`,
    });

    const result = await ciDetector.detect(ctx);

    expect(result.platform).toBe('github-actions');
    expect(result.workflows.length).toBe(2);
    const names = result.workflows.map(w => w.name);
    expect(names).toContain('CI');
    expect(names).toContain('Deploy');
  });
});
