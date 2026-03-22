import {describe, it, expect} from 'vitest';

import type {Finding} from '../../findings/types.js';
import {generateCodeFix, getSupportedLanguages} from '../code-fixes.js';


// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: 'test-finding',
    source: 'scanner',
    scanner: 'semgrep',
    category: 'injection',
    severity: 'high',
    rawSeverity: 'high',
    title: 'SQL injection in query builder',
    description: 'User input flows into raw SQL.',
    file: 'src/db/query.ts',
    line: 42,
    confidence: 0.9,
    cweId: 'CWE-89',
    status: 'open',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('getSupportedLanguages', () => {
  it('returns all 6 supported languages', () => {
    const langs = getSupportedLanguages();
    expect(langs).toEqual([
      'typescript',
      'javascript',
      'python',
      'go',
      'rust',
      'java',
    ]);
  });
});

describe('generateCodeFix', () => {
  it('returns undefined for unmatched finding category', () => {
    const finding = makeFinding({category: 'performance', title: 'Slow query'});
    expect(generateCodeFix(finding, 'typescript')).toBeUndefined();
  });

  it('returns undefined for unsupported language with matching category', () => {
    // CSRF has no Rust fix template
    const finding = makeFinding({category: 'csrf', title: 'Missing CSRF token'});
    expect(generateCodeFix(finding, 'rust')).toBeUndefined();
  });

  describe('SQL injection fixes', () => {
    const finding = makeFinding({category: 'injection', title: 'SQL injection in query'});

    it('generates TypeScript fix', () => {
      const fix = generateCodeFix(finding, 'typescript');
      expect(fix).toBeDefined();
      expect(fix!.before).toContain('${userId}');
      expect(fix!.after).toContain('$1');
      expect(fix!.explanation).toBeTruthy();
    });

    it('generates Python fix', () => {
      const fix = generateCodeFix(finding, 'python');
      expect(fix).toBeDefined();
      expect(fix!.before).toContain('f"SELECT');
      expect(fix!.after).toContain('%s');
    });

    it('generates Go fix', () => {
      const fix = generateCodeFix(finding, 'go');
      expect(fix).toBeDefined();
      expect(fix!.before).toContain('Sprintf');
      expect(fix!.after).toContain('$1');
    });

    it('generates Rust fix', () => {
      const fix = generateCodeFix(finding, 'rust');
      expect(fix).toBeDefined();
      expect(fix!.before).toContain('format!');
      expect(fix!.after).toContain('$1');
    });

    it('generates Java fix', () => {
      const fix = generateCodeFix(finding, 'java');
      expect(fix).toBeDefined();
      expect(fix!.before).toContain('createStatement');
      expect(fix!.after).toContain('PreparedStatement');
    });
  });

  describe('input validation fixes', () => {
    const finding = makeFinding({
      category: 'validation',
      title: 'Missing input validation',
    });

    it('generates TypeScript fix with Zod', () => {
      const fix = generateCodeFix(finding, 'typescript');
      expect(fix).toBeDefined();
      expect(fix!.after).toContain('zod');
      expect(fix!.after).toContain('schema.parse');
    });

    it('generates Python fix with Pydantic', () => {
      const fix = generateCodeFix(finding, 'python');
      expect(fix).toBeDefined();
      expect(fix!.after).toContain('pydantic');
    });

    it('generates Go fix with validator', () => {
      const fix = generateCodeFix(finding, 'go');
      expect(fix).toBeDefined();
      expect(fix!.after).toContain('validator');
    });

    it('generates Rust fix with validator', () => {
      const fix = generateCodeFix(finding, 'rust');
      expect(fix).toBeDefined();
      expect(fix!.after).toContain('Validate');
    });

    it('generates Java fix with Bean Validation', () => {
      const fix = generateCodeFix(finding, 'java');
      expect(fix).toBeDefined();
      expect(fix!.after).toContain('@Valid');
    });
  });

  describe('CSRF fixes', () => {
    const finding = makeFinding({category: 'csrf', title: 'Missing CSRF protection'});

    it('generates TypeScript CSRF fix', () => {
      const fix = generateCodeFix(finding, 'typescript');
      expect(fix).toBeDefined();
      expect(fix!.after).toContain('csrf');
    });

    it('generates Python CSRF fix', () => {
      const fix = generateCodeFix(finding, 'python');
      expect(fix).toBeDefined();
      expect(fix!.after).toContain('CSRFProtect');
    });

    it('generates Java CSRF fix', () => {
      const fix = generateCodeFix(finding, 'java');
      expect(fix).toBeDefined();
      expect(fix!.after).toContain('csrfTokenRepository');
    });
  });

  describe('auth middleware fixes', () => {
    const finding = makeFinding({
      category: 'auth',
      title: 'Missing authentication on endpoint',
    });

    it('generates TypeScript auth fix', () => {
      const fix = generateCodeFix(finding, 'typescript');
      expect(fix).toBeDefined();
      expect(fix!.after).toContain('requireAuth');
    });

    it('generates Python auth fix', () => {
      const fix = generateCodeFix(finding, 'python');
      expect(fix).toBeDefined();
      expect(fix!.after).toContain('jwt_required');
    });

    it('generates Go auth fix', () => {
      const fix = generateCodeFix(finding, 'go');
      expect(fix).toBeDefined();
      expect(fix!.after).toContain('authMiddleware');
    });
  });

  describe('secret management fixes', () => {
    const finding = makeFinding({
      category: 'secrets',
      title: 'Hardcoded secret in source code',
    });

    for (const lang of getSupportedLanguages()) {
      it(`generates ${lang} fix`, () => {
        const fix = generateCodeFix(finding, lang);
        expect(fix).toBeDefined();
        expect(fix!.before).toContain('sk-1234567890');
        expect(fix!.explanation).toBeTruthy();
      });
    }
  });

  it('matches on title pattern when category does not match directly', () => {
    // Category is generic "security" but title contains "sql injection"
    const finding = makeFinding({
      category: 'security',
      title: 'Potential SQL injection in user input handler',
    });
    const fix = generateCodeFix(finding, 'typescript');
    expect(fix).toBeDefined();
  });

  it('returns a CodeFix with before, after, and explanation', () => {
    const finding = makeFinding({category: 'injection', title: 'SQL injection'});
    const fix = generateCodeFix(finding, 'typescript')!;

    expect(typeof fix.before).toBe('string');
    expect(typeof fix.after).toBe('string');
    expect(typeof fix.explanation).toBe('string');
    expect(fix.before.length).toBeGreaterThan(0);
    expect(fix.after.length).toBeGreaterThan(0);
    expect(fix.explanation.length).toBeGreaterThan(0);
  });
});
