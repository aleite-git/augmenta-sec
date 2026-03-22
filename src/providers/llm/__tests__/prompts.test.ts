import {describe, it, expect} from 'vitest';
import {createPromptLibrary, getPrompt, formatPrompt} from '../prompts.js';

describe('createPromptLibrary', () => {
  it('includes all built-in prompts', () => {
    const lib = createPromptLibrary();
    const names = lib.list();
    expect(names).toContain('triage-finding');
    expect(names).toContain('detect-trust-boundaries');
    expect(names).toContain('map-pii-fields');
    expect(names).toContain('review-code-security');
    expect(names.length).toBeGreaterThanOrEqual(9);
  });
});

describe('PromptLibrary.get', () => {
  it('returns a prompt by name', () => {
    const p = createPromptLibrary().get('triage-finding');
    expect(p).toBeDefined();
    expect(p!.name).toBe('triage-finding');
    expect(p!.variables).toEqual(['finding', 'file', 'language']);
  });

  it('returns undefined for unknown name', () => {
    expect(createPromptLibrary().get('nonexistent')).toBeUndefined();
  });

  it('returns detect-trust-boundaries metadata', () => {
    const p = createPromptLibrary().get('detect-trust-boundaries');
    expect(p).toBeDefined();
    expect(p!.variables).toEqual(['project', 'architecture', 'dataFlows']);
  });

  it('returns map-pii-fields metadata', () => {
    const p = createPromptLibrary().get('map-pii-fields');
    expect(p).toBeDefined();
    expect(p!.variables).toEqual(['project', 'language', 'models']);
  });

  it('returns review-code-security metadata', () => {
    const p = createPromptLibrary().get('review-code-security');
    expect(p).toBeDefined();
    expect(p!.variables).toEqual(['file', 'language', 'code']);
  });
});

describe('PromptLibrary.render', () => {
  it('substitutes all variables', () => {
    const r = createPromptLibrary().render('triage-finding', {finding: 'SQLi', file: 'x.ts', language: 'TS'});
    expect(r).toContain('SQLi');
    expect(r).not.toContain('{{finding}}');
  });

  it('throws for unknown prompt', () => {
    expect(() => createPromptLibrary().render('nope', {})).toThrow('not found');
  });

  it('throws for missing variables', () => {
    expect(() => createPromptLibrary().render('triage-finding', {finding: 'X'})).toThrow('Missing variables');
  });

  it('allows extra variables', () => {
    const r = createPromptLibrary().render('triage-finding', {finding: 'X', file: 'f', language: 'L', extra: 'ignored'});
    expect(r).toContain('X');
  });

  it('renders detect-trust-boundaries', () => {
    const r = createPromptLibrary().render('detect-trust-boundaries', {project: 'p', architecture: 'a', dataFlows: 'd'});
    expect(r).toContain('p');
    expect(r).toContain('a');
  });
});

describe('getPrompt', () => {
  it('returns a prompt by name', () => {
    expect(getPrompt('triage-finding')).toBeDefined();
  });

  it('returns undefined for unknown', () => {
    expect(getPrompt('nope')).toBeUndefined();
  });

  it('accepts optional version', () => {
    expect(getPrompt('triage-finding', '1.0.0')).toBeDefined();
  });
});

describe('formatPrompt', () => {
  it('substitutes variables', () => {
    expect(formatPrompt('Hello {{name}}!', {name: 'World'})).toBe('Hello World!');
  });

  it('handles no variables', () => {
    expect(formatPrompt('No vars.', {})).toBe('No vars.');
  });

  it('replaces multiple occurrences', () => {
    expect(formatPrompt('{{x}} and {{x}}', {x: 'yes'})).toBe('yes and yes');
  });

  it('leaves unmatched placeholders', () => {
    expect(formatPrompt('{{a}} {{b}}', {a: 'ok'})).toBe('ok {{b}}');
  });
});
