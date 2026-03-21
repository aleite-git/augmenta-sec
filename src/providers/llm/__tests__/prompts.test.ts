import {describe, it, expect} from 'vitest';
import {createPromptLibrary} from '../prompts.js';

describe('createPromptLibrary', () => {
  it('returns a library with all built-in prompts', () => {
    const library = createPromptLibrary();
    const names = library.list();

    expect(names).toContain('triage-finding');
    expect(names).toContain('analyze-endpoint');
    expect(names).toContain('generate-threat-model');
    expect(names).toContain('assess-auth-flow');
    expect(names).toContain('explain-vulnerability');
    expect(names).toContain('suggest-fix');
    expect(names).toHaveLength(6);
  });
});

describe('PromptLibrary.get', () => {
  it('returns a prompt by name', () => {
    const library = createPromptLibrary();
    const prompt = library.get('triage-finding');

    expect(prompt).toBeDefined();
    expect(prompt!.name).toBe('triage-finding');
    expect(prompt!.version).toBe('1.0.0');
    expect(prompt!.description).toBeTruthy();
    expect(prompt!.template).toContain('{{finding}}');
    expect(prompt!.variables).toEqual(['finding', 'file', 'language']);
  });

  it('returns undefined for unknown prompt name', () => {
    const library = createPromptLibrary();

    expect(library.get('nonexistent')).toBeUndefined();
  });

  it('returns correct metadata for analyze-endpoint', () => {
    const library = createPromptLibrary();
    const prompt = library.get('analyze-endpoint');

    expect(prompt).toBeDefined();
    expect(prompt!.variables).toEqual(['method', 'path', 'language', 'code']);
  });

  it('returns correct metadata for generate-threat-model', () => {
    const library = createPromptLibrary();
    const prompt = library.get('generate-threat-model');

    expect(prompt).toBeDefined();
    expect(prompt!.variables).toEqual([
      'component',
      'description',
      'dataFlows',
    ]);
  });

  it('returns correct metadata for assess-auth-flow', () => {
    const library = createPromptLibrary();
    const prompt = library.get('assess-auth-flow');

    expect(prompt).toBeDefined();
    expect(prompt!.variables).toEqual(['flowName', 'language', 'code']);
  });

  it('returns correct metadata for explain-vulnerability', () => {
    const library = createPromptLibrary();
    const prompt = library.get('explain-vulnerability');

    expect(prompt).toBeDefined();
    expect(prompt!.variables).toEqual([
      'vulnerability',
      'cwe',
      'language',
      'code',
    ]);
  });

  it('returns correct metadata for suggest-fix', () => {
    const library = createPromptLibrary();
    const prompt = library.get('suggest-fix');

    expect(prompt).toBeDefined();
    expect(prompt!.variables).toEqual([
      'vulnerability',
      'file',
      'language',
      'code',
    ]);
  });
});

describe('PromptLibrary.render', () => {
  it('substitutes all variables in a template', () => {
    const library = createPromptLibrary();
    const rendered = library.render('triage-finding', {
      finding: 'SQL Injection in user query',
      file: 'src/api/users.ts',
      language: 'TypeScript',
    });

    expect(rendered).toContain('SQL Injection in user query');
    expect(rendered).toContain('src/api/users.ts');
    expect(rendered).toContain('TypeScript');
    expect(rendered).not.toContain('{{finding}}');
    expect(rendered).not.toContain('{{file}}');
    expect(rendered).not.toContain('{{language}}');
  });

  it('throws when prompt name is not found', () => {
    const library = createPromptLibrary();

    expect(() => library.render('nonexistent', {})).toThrow(
      'Prompt "nonexistent" not found in library',
    );
  });

  it('throws when required variables are missing', () => {
    const library = createPromptLibrary();

    expect(() => library.render('triage-finding', {finding: 'XSS'})).toThrow(
      'Missing variables for prompt "triage-finding": file, language',
    );
  });

  it('throws when a single variable is missing', () => {
    const library = createPromptLibrary();

    expect(() =>
      library.render('triage-finding', {
        finding: 'XSS',
        file: 'test.ts',
      }),
    ).toThrow('Missing variables for prompt "triage-finding": language');
  });

  it('allows extra variables beyond what is required', () => {
    const library = createPromptLibrary();
    const rendered = library.render('triage-finding', {
      finding: 'XSS',
      file: 'test.ts',
      language: 'TypeScript',
      extraVar: 'ignored',
    });

    expect(rendered).toContain('XSS');
    expect(rendered).not.toContain('{{');
  });

  it('renders analyze-endpoint with all variables', () => {
    const library = createPromptLibrary();
    const rendered = library.render('analyze-endpoint', {
      method: 'POST',
      path: '/api/users',
      language: 'TypeScript',
      code: 'app.post("/api/users", handler)',
    });

    expect(rendered).toContain('POST /api/users');
    expect(rendered).toContain('app.post("/api/users", handler)');
  });

  it('handles variables that appear multiple times in template', () => {
    const library = createPromptLibrary();
    const rendered = library.render('explain-vulnerability', {
      vulnerability: 'XSS',
      cwe: 'CWE-79',
      language: 'TypeScript',
      code: 'innerHTML = userInput',
    });

    expect(rendered).toContain('XSS');
    expect(rendered).toContain('CWE-79');
    expect(rendered).toContain('TypeScript');
    expect(rendered).toContain('innerHTML = userInput');
  });
});

describe('PromptLibrary.list', () => {
  it('returns all prompt names', () => {
    const library = createPromptLibrary();
    const names = library.list();

    expect(names).toEqual([
      'triage-finding',
      'analyze-endpoint',
      'generate-threat-model',
      'assess-auth-flow',
      'explain-vulnerability',
      'suggest-fix',
    ]);
  });
});
