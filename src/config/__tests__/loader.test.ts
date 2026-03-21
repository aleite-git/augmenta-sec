import {mkdir, rm, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';

import {afterEach, describe, expect, it} from 'vitest';

import {DEFAULT_CONFIG} from '../defaults.js';
import {
  loadProjectConfig,
  loadGlobalConfig,
  resolveConfig,
} from '../loader.js';

/**
 * Creates a temporary directory with an optional config file.
 * Returns the path to the temp directory.
 */
async function createTempDir(
  configContent?: string,
): Promise<string> {
  const dir = join(
    tmpdir(),
    `asec-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  await mkdir(dir, {recursive: true});

  if (configContent !== undefined) {
    const configDir = join(dir, '.augmenta-sec');
    await mkdir(configDir, {recursive: true});
    await writeFile(join(configDir, 'config.yaml'), configContent, 'utf-8');
  }

  return dir;
}

describe('loadProjectConfig', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    for (const dir of tempDirs) {
      await rm(dir, {recursive: true, force: true});
    }
    tempDirs.length = 0;
  });

  it('loads a valid YAML config from a project directory', async () => {
    const yaml = `
llm:
  triage: ollama/llama3
  analysis: ollama/codellama
  reasoning: gemini/gemini-2.5-pro
scanners:
  - semgrep
`;
    const dir = await createTempDir(yaml);
    tempDirs.push(dir);

    const config = await loadProjectConfig(dir);

    expect(config.llm?.triage).toBe('ollama/llama3');
    expect(config.llm?.analysis).toBe('ollama/codellama');
    expect(config.llm?.reasoning).toBe('gemini/gemini-2.5-pro');
    expect(config.scanners).toEqual(['semgrep']);
  });

  it('returns an empty object when no config file exists', async () => {
    const dir = await createTempDir();
    tempDirs.push(dir);

    const config = await loadProjectConfig(dir);

    expect(config).toEqual({});
  });

  it('throws on invalid YAML content (not an object)', async () => {
    const dir = await createTempDir('just a string');
    tempDirs.push(dir);

    await expect(loadProjectConfig(dir)).rejects.toThrow(
      /expected an object/,
    );
  });

  it('throws on invalid config values', async () => {
    const yaml = `
scan:
  min_severity: extreme
`;
    const dir = await createTempDir(yaml);
    tempDirs.push(dir);

    await expect(loadProjectConfig(dir)).rejects.toThrow(
      /Invalid configuration/,
    );
  });

  it('accepts an empty YAML file as valid', async () => {
    const dir = await createTempDir('');
    tempDirs.push(dir);

    const config = await loadProjectConfig(dir);

    expect(config).toEqual({});
  });

  it('accepts a YAML file with only comments', async () => {
    const dir = await createTempDir('# This is a comment\n# Another comment\n');
    tempDirs.push(dir);

    const config = await loadProjectConfig(dir);

    expect(config).toEqual({});
  });

  it('throws on YAML arrays at the top level', async () => {
    const dir = await createTempDir('- item1\n- item2\n');
    tempDirs.push(dir);

    await expect(loadProjectConfig(dir)).rejects.toThrow(
      /expected an object/,
    );
  });
});

describe('loadGlobalConfig', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    for (const dir of tempDirs) {
      await rm(dir, {recursive: true, force: true});
    }
    tempDirs.length = 0;
  });

  it('returns an empty object when no global config exists', async () => {
    const fakeHome = await createTempDir();
    tempDirs.push(fakeHome);

    const config = await loadGlobalConfig(fakeHome);

    expect(config).toEqual({});
  });

  it('loads a global config file when present', async () => {
    const yaml = `
llm:
  triage: openai/gpt-4o-mini
  analysis: openai/gpt-4o
  reasoning: openai/gpt-4o
`;
    const fakeHome = await createTempDir(yaml);
    tempDirs.push(fakeHome);

    const config = await loadGlobalConfig(fakeHome);

    expect(config.llm?.triage).toBe('openai/gpt-4o-mini');
    expect(config.llm?.analysis).toBe('openai/gpt-4o');
  });
});

describe('resolveConfig', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    for (const dir of tempDirs) {
      await rm(dir, {recursive: true, force: true});
    }
    tempDirs.length = 0;
  });

  it('returns defaults when no config files exist', async () => {
    const projectDir = await createTempDir();
    const fakeHome = await createTempDir();
    tempDirs.push(projectDir, fakeHome);

    const config = await resolveConfig(projectDir, fakeHome);

    expect(config.llm).toEqual(DEFAULT_CONFIG.llm);
    expect(config.autonomy).toEqual(DEFAULT_CONFIG.autonomy);
    expect(config.scanners).toEqual(DEFAULT_CONFIG.scanners);
    expect(config.scan).toEqual(DEFAULT_CONFIG.scan);
    expect(config.review).toEqual(DEFAULT_CONFIG.review);
    expect(config.output).toEqual(DEFAULT_CONFIG.output);
  });

  it('merges project config over defaults', async () => {
    const projectYaml = `
output:
  format: json
  verbosity: verbose
scanners:
  - codeql
`;
    const projectDir = await createTempDir(projectYaml);
    const fakeHome = await createTempDir();
    tempDirs.push(projectDir, fakeHome);

    const config = await resolveConfig(projectDir, fakeHome);

    // Overridden values
    expect(config.output.format).toBe('json');
    expect(config.output.verbosity).toBe('verbose');
    expect(config.scanners).toEqual(['codeql']);

    // Defaults preserved for untouched sections
    expect(config.llm).toEqual(DEFAULT_CONFIG.llm);
    expect(config.autonomy).toEqual(DEFAULT_CONFIG.autonomy);
  });

  it('project config overrides global config', async () => {
    // Global config
    const globalYaml = `
output:
  format: json
  verbosity: quiet
llm:
  triage: openai/gpt-4o-mini
  analysis: openai/gpt-4o
  reasoning: openai/gpt-4o
`;
    const fakeHome = await createTempDir(globalYaml);

    // Project config overrides output format only
    const projectYaml = `
output:
  format: yaml
`;
    const projectDir = await createTempDir(projectYaml);
    tempDirs.push(projectDir, fakeHome);

    const config = await resolveConfig(projectDir, fakeHome);

    // Project wins over global for output.format
    expect(config.output.format).toBe('yaml');

    // Global value preserved where project doesn't override
    expect(config.output.verbosity).toBe('quiet');

    // Global LLM config used (project didn't override it)
    expect(config.llm.triage).toBe('openai/gpt-4o-mini');
  });

  it('merges partial autonomy settings correctly', async () => {
    const projectYaml = `
autonomy:
  critical: report
  max_auto_prs_per_day: 10
`;
    const projectDir = await createTempDir(projectYaml);
    const fakeHome = await createTempDir();
    tempDirs.push(projectDir, fakeHome);

    const config = await resolveConfig(projectDir, fakeHome);

    // Overridden
    expect(config.autonomy.critical).toBe('report');
    expect(config.autonomy.max_auto_prs_per_day).toBe(10);

    // Defaults preserved
    expect(config.autonomy.high).toBe(DEFAULT_CONFIG.autonomy.high);
    expect(config.autonomy.never_auto_merge).toBe(true);
    expect(config.autonomy.respect_freeze).toBe(true);
  });

  it('arrays are replaced, not merged', async () => {
    const projectYaml = `
scanners:
  - gitleaks
`;
    const fakeHome = await createTempDir();
    const projectDir = await createTempDir(projectYaml);
    tempDirs.push(projectDir, fakeHome);

    const config = await resolveConfig(projectDir, fakeHome);

    // Project scanners replace the defaults entirely
    expect(config.scanners).toEqual(['gitleaks']);
  });
});
