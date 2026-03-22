import {describe, expect, it} from 'vitest';
import {createOutputFormatter, formatOutput} from '../output.js';

describe('OutputFormatter', () => {
  describe('json mode', () => {
    it('serializes objects as pretty-printed JSON', () => {
      const f = createOutputFormatter('json');
      const data = {name: 'test', count: 42};
      expect(JSON.parse(f.format(data))).toEqual(data);
      expect(f.format(data)).toContain('\n');
    });
    it('serializes arrays as JSON', () => {
      expect(JSON.parse(createOutputFormatter('json').format([1, 2, 3]))).toEqual([1, 2, 3]);
    });
    it('serializes null', () => {
      expect(createOutputFormatter('json').format(null)).toBe('null');
    });
    it('serializes strings', () => {
      expect(JSON.parse(createOutputFormatter('json').format('hello'))).toBe('hello');
    });
    it('reports mode as json', () => {
      expect(createOutputFormatter('json').mode).toBe('json');
    });
  });

  describe('yaml mode', () => {
    it('serializes objects as YAML', () => {
      const r = createOutputFormatter('yaml').format({name: 'test', count: 42});
      expect(r).toContain('name: test');
      expect(r).toContain('count: 42');
    });
    it('serializes arrays as YAML', () => {
      const r = createOutputFormatter('yaml').format(['alpha', 'beta']);
      expect(r).toContain('- alpha');
      expect(r).toContain('- beta');
    });
    it('reports mode as yaml', () => {
      expect(createOutputFormatter('yaml').mode).toBe('yaml');
    });
  });

  describe('text mode', () => {
    it('formats objects as key-value pairs', () => {
      const r = createOutputFormatter('text').format({name: 'test', count: 42});
      expect(r).toContain('name');
      expect(r).toContain('test');
      expect(r).toContain('42');
    });
    it('formats arrays as numbered items', () => {
      const r = createOutputFormatter('text').format(['alpha', 'beta']);
      expect(r).toContain('1.');
      expect(r).toContain('alpha');
      expect(r).toContain('2.');
    });
    it('handles null and undefined', () => {
      const f = createOutputFormatter('text');
      expect(f.format(null)).toContain('(none)');
      expect(f.format(undefined)).toContain('(none)');
    });
    it('handles empty objects', () => {
      expect(createOutputFormatter('text').format({})).toContain('(empty)');
    });
    it('handles empty arrays', () => {
      expect(createOutputFormatter('text').format([])).toContain('(empty)');
    });
    it('handles nested objects', () => {
      const r = createOutputFormatter('text').format({outer: {inner: 'value'}});
      expect(r).toContain('outer');
      expect(r).toContain('inner');
      expect(r).toContain('value');
    });
    it('handles primitives', () => {
      const f = createOutputFormatter('text');
      expect(f.format('hello')).toContain('hello');
      expect(f.format(42)).toContain('42');
      expect(f.format(true)).toContain('true');
    });
    it('is the default mode', () => {
      expect(createOutputFormatter().mode).toBe('text');
    });
  });

  describe('formatOutput', () => {
    it('defaults to text mode', () => {
      expect(formatOutput({a: 1})).toContain('a');
    });
    it('respects json mode', () => {
      expect(JSON.parse(formatOutput({a: 1}, 'json'))).toEqual({a: 1});
    });
    it('supports yaml mode', () => {
      expect(formatOutput({a: 1}, 'yaml')).toContain('a: 1');
    });
  });
});
