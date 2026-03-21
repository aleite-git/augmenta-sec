import {describe, expect, it} from 'vitest';

import {DEFAULT_CONFIG} from '../defaults.js';
import {configSchema} from '../schema.js';

describe('configSchema', () => {
  it('accepts a valid full configuration', () => {
    const fullConfig = {
      llm: {
        triage: 'gemini/gemini-2.5-flash-lite',
        analysis: 'mistral/codestral-latest',
        reasoning: 'anthropic/claude-sonnet-4-6',
      },
      autonomy: {
        critical: 'create-pr-and-alert',
        high: 'create-issue',
        medium: 'report',
        low: 'note',
        max_auto_prs_per_day: 5,
        never_auto_merge: false,
        respect_freeze: true,
      },
      scanners: ['semgrep', 'trivy', 'codeql'],
      scan: {
        categories: ['auth', 'pii', 'injection'],
        min_severity: 'medium',
        max_findings: 100,
      },
      review: {
        auto_approve_below: 'low',
        inline_comments: false,
        summary_comment: true,
      },
      output: {
        format: 'json',
        verbosity: 'verbose',
      },
    };

    const result = configSchema.parse(fullConfig);

    expect(result).toEqual(fullConfig);
  });

  it('accepts an empty object and returns defaults', () => {
    const result = configSchema.parse({});

    // An empty object is valid — all sections are optional.
    expect(result).toEqual({});
  });

  it('accepts undefined input and returns default empty object', () => {
    const result = configSchema.parse(undefined);

    expect(result).toEqual({});
  });

  it('rejects an LLM model without a slash separator', () => {
    const invalid = {
      llm: {
        triage: 'gemini-flash-no-slash',
        analysis: 'gemini/gemini-2.5-flash',
        reasoning: 'gemini/gemini-2.5-pro',
      },
    };

    expect(() => configSchema.parse(invalid)).toThrow(
      /provider\/model-name/,
    );
  });

  it('rejects an LLM model with an empty provider', () => {
    const invalid = {
      llm: {
        triage: '/model-name',
        analysis: 'gemini/gemini-2.5-flash',
        reasoning: 'gemini/gemini-2.5-pro',
      },
    };

    expect(() => configSchema.parse(invalid)).toThrow();
  });

  it('rejects an LLM model with an empty model name', () => {
    const invalid = {
      llm: {
        triage: 'provider/',
        analysis: 'gemini/gemini-2.5-flash',
        reasoning: 'gemini/gemini-2.5-pro',
      },
    };

    expect(() => configSchema.parse(invalid)).toThrow();
  });

  it('rejects an invalid severity value', () => {
    const invalid = {
      scan: {
        min_severity: 'extreme',
      },
    };

    expect(() => configSchema.parse(invalid)).toThrow();
  });

  it('rejects an invalid autonomy action', () => {
    const invalid = {
      autonomy: {
        critical: 'auto-deploy',
      },
    };

    expect(() => configSchema.parse(invalid)).toThrow();
  });

  it('rejects an invalid output format', () => {
    const invalid = {
      output: {
        format: 'xml',
      },
    };

    expect(() => configSchema.parse(invalid)).toThrow();
  });

  it('rejects an invalid verbosity level', () => {
    const invalid = {
      output: {
        verbosity: 'debug',
      },
    };

    expect(() => configSchema.parse(invalid)).toThrow();
  });

  it('rejects negative max_auto_prs_per_day', () => {
    const invalid = {
      autonomy: {
        max_auto_prs_per_day: -1,
      },
    };

    expect(() => configSchema.parse(invalid)).toThrow();
  });

  it('rejects negative max_findings', () => {
    const invalid = {
      scan: {
        max_findings: -5,
      },
    };

    expect(() => configSchema.parse(invalid)).toThrow();
  });

  it('accepts a partial config with only some sections', () => {
    const partial = {
      llm: {
        triage: 'ollama/llama3',
        analysis: 'ollama/codellama',
        reasoning: 'gemini/gemini-2.5-pro',
      },
      output: {
        format: 'yaml' as const,
      },
    };

    const result = configSchema.parse(partial);

    expect(result.llm?.triage).toBe('ollama/llama3');
    expect(result.output?.format).toBe('yaml');
    // Other sections are undefined (not filled with defaults by schema alone).
    expect(result.autonomy).toBeUndefined();
    expect(result.scanners).toBeUndefined();
  });

  it('validates DEFAULT_CONFIG passes the schema', () => {
    // The defaults object itself should be valid.
    const result = configSchema.parse(DEFAULT_CONFIG);

    expect(result.llm).toEqual(DEFAULT_CONFIG.llm);
    expect(result.autonomy).toEqual(DEFAULT_CONFIG.autonomy);
    expect(result.scanners).toEqual(DEFAULT_CONFIG.scanners);
    expect(result.scan).toEqual(DEFAULT_CONFIG.scan);
    expect(result.review).toEqual(DEFAULT_CONFIG.review);
    expect(result.output).toEqual(DEFAULT_CONFIG.output);
  });

  it('accepts all severity levels in scan.min_severity', () => {
    for (const sev of [
      'critical',
      'high',
      'medium',
      'low',
      'informational',
    ] as const) {
      const config = {scan: {min_severity: sev}};
      const result = configSchema.parse(config);
      expect(result.scan?.min_severity).toBe(sev);
    }
  });

  it('accepts all autonomy actions', () => {
    for (const action of [
      'create-pr-and-alert',
      'create-issue',
      'report',
      'note',
    ] as const) {
      const config = {autonomy: {critical: action}};
      const result = configSchema.parse(config);
      expect(result.autonomy?.critical).toBe(action);
    }
  });

  it('accepts LLM models with dots and underscores', () => {
    const config = {
      llm: {
        triage: 'openai/gpt-4o-mini',
        analysis: 'anthropic/claude-sonnet-4-6',
        reasoning: 'mistral/mistral_large.latest',
      },
    };

    const result = configSchema.parse(config);
    expect(result.llm?.reasoning).toBe('mistral/mistral_large.latest');
  });
});
