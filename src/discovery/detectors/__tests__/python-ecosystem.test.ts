import {describe, it, expect} from 'vitest';
import {pythonEcosystemDetector} from '../python-ecosystem.js';
import {createMockContext} from './helpers.js';

describe('pythonEcosystemDetector', () => {
  it('returns detected=false when no Python files exist', async () => {
    const ctx = createMockContext({
      'package.json': '{}',
      'src/index.ts': 'export const x = 1;',
    });

    const result = await pythonEcosystemDetector.detect(ctx);

    expect(result.detected).toBe(false);
    expect(result.packageManager).toBeNull();
    expect(result.frameworks).toEqual([]);
    expect(result.securityDeps).toEqual([]);
  });

  it('detects pip project with requirements.txt', async () => {
    const ctx = createMockContext({
      'requirements.txt': 'flask==2.3.0\nrequests==2.31.0\n',
    });

    const result = await pythonEcosystemDetector.detect(ctx);

    expect(result.detected).toBe(true);
    expect(result.packageManager).toBe('pip');
    expect(result.projectFile).toBe('requirements.txt');
    expect(result.frameworks).toContain('flask');
  });

  it('detects Poetry project with pyproject.toml and poetry.lock', async () => {
    const ctx = createMockContext({
      'pyproject.toml': [
        '[tool.poetry.dependencies]',
        'python = "^3.11"',
        'django = "^4.2"',
        '',
        '[tool.poetry.dev-dependencies]',
        'pytest = "^7.4"',
        '',
        '[build-system]',
        'build-backend = "poetry.core.masonry.api"',
      ].join('\n'),
      'poetry.lock': '# lock file',
    });

    const result = await pythonEcosystemDetector.detect(ctx);

    expect(result.detected).toBe(true);
    expect(result.packageManager).toBe('poetry');
    expect(result.hasPyprojectToml).toBe(true);
    expect(result.hasPoetryLock).toBe(true);
    expect(result.frameworks).toContain('django');
    expect(result.frameworks).toContain('pytest');
  });

  it('detects Pipenv project with Pipfile and Pipfile.lock', async () => {
    const ctx = createMockContext({
      'Pipfile': [
        '[packages]',
        'fastapi = "*"',
        'uvicorn = "*"',
        '',
        '[dev-packages]',
        'pytest = "*"',
      ].join('\n'),
      'Pipfile.lock': '{}',
    });

    const result = await pythonEcosystemDetector.detect(ctx);

    expect(result.detected).toBe(true);
    expect(result.packageManager).toBe('pipenv');
    expect(result.hasPipfileLock).toBe(true);
    expect(result.frameworks).toContain('fastapi');
    expect(result.frameworks).toContain('pytest');
  });

  it('detects uv project with uv.lock', async () => {
    const ctx = createMockContext({
      'pyproject.toml': [
        '[project]',
        'requires-python = ">=3.12"',
        'dependencies = ["flask>=3.0"]',
      ].join('\n'),
      'uv.lock': '# uv lock file',
    });

    const result = await pythonEcosystemDetector.detect(ctx);

    expect(result.detected).toBe(true);
    expect(result.packageManager).toBe('uv');
  });

  it('detects PDM project from build-backend', async () => {
    const ctx = createMockContext({
      'pyproject.toml': [
        '[build-system]',
        'build-backend = "pdm.backend"',
        '',
        '[project]',
        'requires-python = ">=3.10"',
        'dependencies = ["starlette"]',
      ].join('\n'),
    });

    const result = await pythonEcosystemDetector.detect(ctx);

    expect(result.detected).toBe(true);
    expect(result.packageManager).toBe('pdm');
  });

  it('reads Python version from .python-version', async () => {
    const ctx = createMockContext({
      'requirements.txt': 'flask\n',
      '.python-version': '3.11.5\n',
    });

    const result = await pythonEcosystemDetector.detect(ctx);

    expect(result.pythonVersion).toBe('3.11.5');
  });

  it('reads Python version from pyproject.toml requires-python', async () => {
    const ctx = createMockContext({
      'pyproject.toml': [
        '[project]',
        'requires-python = ">=3.10"',
        'dependencies = []',
      ].join('\n'),
      '.python-version': '3.11.0',
    });

    const result = await pythonEcosystemDetector.detect(ctx);

    // pyproject.toml takes precedence
    expect(result.pythonVersion).toBe('>=3.10');
  });

  it('detects security dependencies', async () => {
    const ctx = createMockContext({
      'requirements.txt': [
        'bandit==1.7.0',
        'cryptography==41.0.0',
        'pyjwt==2.8.0',
        'flask-talisman==1.1.0',
      ].join('\n'),
    });

    const result = await pythonEcosystemDetector.detect(ctx);

    expect(result.securityDeps).toContain('bandit');
    expect(result.securityDeps).toContain('cryptography');
    expect(result.securityDeps).toContain('pyjwt');
    expect(result.securityDeps).toContain('flask-talisman');
  });

  it('detects virtual environment directories', async () => {
    const ctx = createMockContext({
      'requirements.txt': 'flask\n',
      'venv/bin/python': '',
      '.venv/pyvenv.cfg': 'home = /usr/bin',
    });

    const result = await pythonEcosystemDetector.detect(ctx);

    expect(result.hasVirtualEnv).toBe(true);
    expect(result.virtualEnvPaths).toContain('venv');
    expect(result.virtualEnvPaths).toContain('.venv');
  });

  it('detects setup.py as project file', async () => {
    const ctx = createMockContext({
      'setup.py': 'from setuptools import setup\nsetup(name="myapp")',
    });

    const result = await pythonEcosystemDetector.detect(ctx);

    expect(result.detected).toBe(true);
    expect(result.projectFile).toBe('setup.py');
  });

  it('detects multiple frameworks from pyproject.toml', async () => {
    const ctx = createMockContext({
      'pyproject.toml': [
        '[project]',
        'dependencies = [',
        '  "django>=4.2",',
        '  "celery>=5.3",',
        '  "sqlalchemy>=2.0",',
        ']',
      ].join('\n'),
    });

    const result = await pythonEcosystemDetector.detect(ctx);

    expect(result.frameworks).toContain('django');
    expect(result.frameworks).toContain('celery');
    expect(result.frameworks).toContain('sqlalchemy');
  });

  it('handles comments and blank lines in requirements.txt', async () => {
    const ctx = createMockContext({
      'requirements.txt': [
        '# Web framework',
        'flask==2.3.0',
        '',
        '# Testing',
        'pytest==7.4.0',
        '  # indented comment',
        '-r other-requirements.txt',
      ].join('\n'),
    });

    const result = await pythonEcosystemDetector.detect(ctx);

    expect(result.frameworks).toContain('flask');
    expect(result.frameworks).toContain('pytest');
  });

  it('has correct detector name', () => {
    expect(pythonEcosystemDetector.name).toBe('python-ecosystem');
  });
});
