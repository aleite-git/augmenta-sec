import {mkdir, readFile, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {parse as parseYaml} from 'yaml';
import {loadGlobalConfig, saveGlobalConfig} from '../../../config/loader.js';

async function makeTempDir(): Promise<string> {
  const dir = join(
    tmpdir(),
    `asec-config-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  await mkdir(dir, {recursive: true});
  return dir;
}

describe('saveGlobalConfig', () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    for (const dir of tempDirs) {
      await rm(dir, {recursive: true, force: true});
    }
    tempDirs.length = 0;
  });

  it('creates config directory and file if they do not exist', async () => {
    const fakeHome = await makeTempDir();
    tempDirs.push(fakeHome);

    await saveGlobalConfig(
      {llm: {triage: 'ollama/llama3', analysis: 'ollama/codellama', reasoning: 'ollama/deepseek'}},
      fakeHome,
    );

    const content = await readFile(
      join(fakeHome, '.augmenta-sec', 'config.yaml'),
      'utf-8',
    );
    const parsed = parseYaml(content) as Record<string, unknown>;
    expect((parsed.llm as Record<string, string>).triage).toBe('ollama/llama3');
  });

  it('merges with existing config', async () => {
    const fakeHome = await makeTempDir();
    tempDirs.push(fakeHome);

    await saveGlobalConfig(
      {llm: {triage: 'ollama/llama3', analysis: 'ollama/codellama', reasoning: 'ollama/deepseek'}},
      fakeHome,
    );

    await saveGlobalConfig(
      {llm: {triage: 'gemini/gemini-2.5-flash', analysis: 'ollama/codellama', reasoning: 'ollama/deepseek'}},
      fakeHome,
    );

    const config = await loadGlobalConfig(fakeHome);
    expect(config.llm?.triage).toBe('gemini/gemini-2.5-flash');
    expect(config.llm?.analysis).toBe('ollama/codellama');
  });

  it('validates config before writing', async () => {
    const fakeHome = await makeTempDir();
    tempDirs.push(fakeHome);

    await expect(
      saveGlobalConfig(
        {llm: {triage: 'invalid-model', analysis: 'x/y', reasoning: 'x/y'}},
        fakeHome,
      ),
    ).rejects.toThrow(/Invalid configuration/);
  });

  it('saves output settings', async () => {
    const fakeHome = await makeTempDir();
    tempDirs.push(fakeHome);

    await saveGlobalConfig(
      {output: {format: 'json', verbosity: 'verbose'}},
      fakeHome,
    );

    const config = await loadGlobalConfig(fakeHome);
    expect(config.output?.format).toBe('json');
    expect(config.output?.verbosity).toBe('verbose');
  });

  it('saves scanner list', async () => {
    const fakeHome = await makeTempDir();
    tempDirs.push(fakeHome);

    await saveGlobalConfig({scanners: ['semgrep', 'trivy', 'codeql']}, fakeHome);

    const config = await loadGlobalConfig(fakeHome);
    expect(config.scanners).toEqual(['semgrep', 'trivy', 'codeql']);
  });
});

describe('config command helpers', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('round-trips a config value via save and load', async () => {
    const fakeHome = await makeTempDir();

    await saveGlobalConfig(
      {output: {format: 'yaml'}},
      fakeHome,
    );

    const loaded = await loadGlobalConfig(fakeHome);
    expect(loaded.output?.format).toBe('yaml');

    await rm(fakeHome, {recursive: true, force: true});
  });
});
