import {describe, it, expect} from 'vitest';

import {
  getTemplates,
  getTemplateById,
  getTemplatesByCwe,
  renderTemplate,
} from '../templates.js';

describe('getTemplates', () => {
  it('returns all five built-in templates', () => {
    const templates = getTemplates();

    expect(templates).toHaveLength(5);
    const ids = templates.map((t) => t.id);
    expect(ids).toContain('rate-limiter');
    expect(ids).toContain('auth-middleware');
    expect(ids).toContain('input-sanitization');
    expect(ids).toContain('csrf-protection');
    expect(ids).toContain('output-escaping');
  });

  it('returns a copy — mutations do not affect the built-in list', () => {
    const templates = getTemplates();
    templates.pop();
    expect(getTemplates()).toHaveLength(5);
  });
});

describe('getTemplateById', () => {
  it('returns the matching template', () => {
    const tpl = getTemplateById('rate-limiter');

    expect(tpl).toBeDefined();
    expect(tpl!.name).toBe('Rate Limiter Middleware');
  });

  it('returns undefined for unknown id', () => {
    expect(getTemplateById('nonexistent')).toBeUndefined();
  });
});

describe('getTemplatesByCwe', () => {
  it('returns templates matching CWE-79 (XSS)', () => {
    const matches = getTemplatesByCwe('CWE-79');

    expect(matches.length).toBeGreaterThanOrEqual(2);
    const ids = matches.map((t) => t.id);
    expect(ids).toContain('input-sanitization');
    expect(ids).toContain('output-escaping');
  });

  it('returns templates matching CWE-352 (CSRF)', () => {
    const matches = getTemplatesByCwe('CWE-352');

    expect(matches).toHaveLength(1);
    expect(matches[0].id).toBe('csrf-protection');
  });

  it('returns empty array for unmatched CWE', () => {
    expect(getTemplatesByCwe('CWE-999')).toHaveLength(0);
  });
});

describe('renderTemplate', () => {
  it('substitutes all variables in the rate-limiter template', () => {
    const tpl = getTemplateById('rate-limiter')!;
    const rendered = renderTemplate(tpl, {
      windowMs: '60000',
      maxRequests: '100',
      routePath: "'/api'",
    });

    expect(rendered).toContain('windowMs: 60000');
    expect(rendered).toContain('max: 100');
    expect(rendered).toContain("app.use('/api', limiter)");
    expect(rendered).not.toContain('{{');
  });

  it('substitutes variables in the output-escaping template', () => {
    const tpl = getTemplateById('output-escaping')!;
    const rendered = renderTemplate(tpl, {variableName: 'UserInput'});

    expect(rendered).toContain('safeUserInput');
    expect(rendered).toContain('rawUserInput');
  });

  it('throws when a required variable is missing', () => {
    const tpl = getTemplateById('rate-limiter')!;

    expect(() => renderTemplate(tpl, {windowMs: '60000'})).toThrow(
      'Missing variables for template "rate-limiter": maxRequests, routePath',
    );
  });

  it('throws when a variable value is null', () => {
    const tpl = getTemplateById('input-sanitization')!;

    expect(() =>
      renderTemplate(tpl, {fieldName: null as unknown as string}),
    ).toThrow('Missing variables');
  });
});
