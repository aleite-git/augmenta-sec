import {describe, expect, it} from 'vitest';
import {createFormatter} from '../output.js';
import type {OutputFormat} from '../output.js';

describe('createFormatter', () => {
  describe('json', () => {
    const formatter = createFormatter('json');

    it('formats a simple object as pretty-printed JSON', () => {
      const data = {name: 'test', count: 42};
      const result = formatter.format(data);
      expect(result).toBe(JSON.stringify(data, null, 2));
    });

    it('formats nested objects', () => {
      const data = {llm: {triage: 'gemini/gemini-2.5-flash'}};
      const result = formatter.format(data);
      expect(result).toContain('"triage": "gemini/gemini-2.5-flash"');
    });

    it('formats arrays', () => {
      const data = {items: [1, 2, 3]};
      const result = formatter.format(data);
      expect(JSON.parse(result)).toEqual(data);
    });

    it('formats null', () => {
      expect(formatter.format(null)).toBe('null');
    });

    it('formats a string', () => {
      expect(formatter.format('hello')).toBe('"hello"');
    });
  });

  describe('yaml', () => {
    const formatter = createFormatter('yaml');

    it('formats a simple object as YAML', () => {
      const data = {name: 'test', count: 42};
      const result = formatter.format(data);
      expect(result).toContain('name: test');
      expect(result).toContain('count: 42');
    });

    it('formats nested objects', () => {
      const data = {llm: {triage: 'gemini/gemini-2.5-flash'}};
      const result = formatter.format(data);
      expect(result).toContain('llm:');
      expect(result).toContain('triage: gemini/gemini-2.5-flash');
    });

    it('formats arrays', () => {
      const data = {scanners: ['semgrep', 'trivy']};
      const result = formatter.format(data);
      expect(result).toContain('- semgrep');
      expect(result).toContain('- trivy');
    });
  });

  describe('text', () => {
    const formatter = createFormatter('text');

    it('formats a simple object', () => {
      const data = {name: 'test', count: 42};
      const result = formatter.format(data);
      expect(result).toContain('name');
      expect(result).toContain('test');
      expect(result).toContain('count');
      expect(result).toContain('42');
    });

    it('formats nested objects with indentation', () => {
      const data = {llm: {triage: 'gemini/gemini-2.5-flash'}};
      const result = formatter.format(data);
      expect(result).toContain('llm');
      expect(result).toContain('triage');
    });

    it('formats empty arrays as (empty)', () => {
      const data = {items: [] as unknown[]};
      const result = formatter.format(data);
      expect(result).toContain('(empty)');
    });

    it('formats null as (none)', () => {
      const result = formatter.format(null);
      expect(result).toContain('(none)');
    });

    it('formats undefined as (none)', () => {
      const result = formatter.format(undefined);
      expect(result).toContain('(none)');
    });

    it('formats arrays as bullet lists', () => {
      const data = {items: ['a', 'b', 'c']};
      const result = formatter.format(data);
      expect(result).toContain('- a');
      expect(result).toContain('- b');
      expect(result).toContain('- c');
    });

    it('formats booleans', () => {
      const result = formatter.format(true);
      expect(result).toBe('true');
    });

    it('formats empty objects as (empty)', () => {
      const data = {section: {}};
      const result = formatter.format(data);
      expect(result).toContain('(empty)');
    });
  });

  it('createFormatter handles all supported format types', () => {
    const formats: OutputFormat[] = ['json', 'yaml', 'text'];
    for (const fmt of formats) {
      const f = createFormatter(fmt);
      expect(typeof f.format({test: true})).toBe('string');
    }
  });
});
