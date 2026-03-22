import {existsSync} from 'node:fs';
import {mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {getGlobalConfigPath, loadGlobalConfig, mergeConfigs, saveGlobalConfig} from '../global.js';

describe('global config', () => {
  let testHome: string;
  beforeEach(async () => {
    testHome = join(tmpdir(), `asec-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(testHome, {recursive: true});
  });
  afterEach(async () => { await rm(testHome, {recursive: true, force: true}); });

  describe('getGlobalConfigPath', () => {
    it('returns path under home', () => {
      expect(getGlobalConfigPath('/home/u')).toBe('/home/u/.augmenta-sec/config.yaml');
    });
    it('uses os.homedir by default', () => {
      expect(getGlobalConfigPath()).toContain('.augmenta-sec/config.yaml');
    });
  });

  describe('loadGlobalConfig', () => {
    it('returns {} when no file', async () => {
      expect(await loadGlobalConfig(testHome)).toEqual({});
    });
    it('loads valid YAML', async () => {
      const d = join(testHome, '.augmenta-sec');
      await mkdir(d, {recursive: true});
      await writeFile(join(d, 'config.yaml'), 'defaultLlmProvider: gemini/flash\noutputFormat: json\n');
      const c = await loadGlobalConfig(testHome);
      expect(c.defaultLlmProvider).toBe('gemini/flash');
      expect(c.outputFormat).toBe('json');
    });
    it('returns {} for empty file', async () => {
      const d = join(testHome, '.augmenta-sec');
      await mkdir(d, {recursive: true});
      await writeFile(join(d, 'config.yaml'), '');
      expect(await loadGlobalConfig(testHome)).toEqual({});
    });
    it('throws for non-object', async () => {
      const d = join(testHome, '.augmenta-sec');
      await mkdir(d, {recursive: true});
      await writeFile(join(d, 'config.yaml'), '- item1\n- item2\n');
      await expect(loadGlobalConfig(testHome)).rejects.toThrow('expected an object');
    });
    it('loads API keys', async () => {
      const d = join(testHome, '.augmenta-sec');
      await mkdir(d, {recursive: true});
      await writeFile(join(d, 'config.yaml'), 'apiKeys:\n  openai: sk-123\n');
      const c = await loadGlobalConfig(testHome);
      expect(c.apiKeys).toEqual({openai: 'sk-123'});
    });
  });

  describe('saveGlobalConfig', () => {
    it('creates dir and file', async () => {
      await saveGlobalConfig({defaultLlmProvider: 'anthropic/sonnet', outputFormat: 'yaml'}, testHome);
      const p = join(testHome, '.augmenta-sec', 'config.yaml');
      expect(existsSync(p)).toBe(true);
      const c = await readFile(p, 'utf-8');
      expect(c).toContain('anthropic/sonnet');
    });
    it('overwrites existing', async () => {
      await saveGlobalConfig({outputFormat: 'json'}, testHome);
      await saveGlobalConfig({outputFormat: 'text'}, testHome);
      const c = await readFile(join(testHome, '.augmenta-sec', 'config.yaml'), 'utf-8');
      expect(c).toContain('text');
      expect(c).not.toContain('json');
    });
  });

  describe('mergeConfigs', () => {
    it('returns global when project empty', () => {
      expect(mergeConfigs({a: 1, b: 'hi'}, {})).toEqual({a: 1, b: 'hi'});
    });
    it('project overrides global', () => {
      expect(mergeConfigs({a: 1, b: 'hi'}, {b: 'bye'})).toEqual({a: 1, b: 'bye'});
    });
    it('deep-merges nested objects', () => {
      expect(mergeConfigs({o: {a: 1, b: 2}}, {o: {b: 99}})).toEqual({o: {a: 1, b: 99}});
    });
    it('replaces arrays', () => {
      expect(mergeConfigs({l: [1, 2, 3]}, {l: [4, 5]})).toEqual({l: [4, 5]});
    });
    it('ignores undefined', () => {
      expect(mergeConfigs({a: 1, b: 2}, {a: undefined, b: 3})).toEqual({a: 1, b: 3});
    });
    it('deeply nested', () => {
      expect(mergeConfigs(
        {l1: {l2: {l3: 'orig', keep: true}}},
        {l1: {l2: {l3: 'new'}}},
      )).toEqual({l1: {l2: {l3: 'new', keep: true}}});
    });
  });
});
