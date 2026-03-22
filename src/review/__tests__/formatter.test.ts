/**
 * Tests for the review formatter (ASEC-045).
 */

import {describe, expect, it} from 'vitest';

import {formatAsReview} from '../formatter.js';
import type {Diff, DiffFile} from '../../providers/git-platform/types.js';
import type {Finding} from '../../findings/types.js';
import {createFinding} from '../../findings/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFinding(
  overrides: Partial<Omit<Finding, 'id' | 'createdAt' | 'status'>> = {},
): Finding {
  return createFinding({
    source: 'llm',
    category: 'injection',
    severity: 'high',
    rawSeverity: 'high',
    title: 'SQL Injection',
    description: 'User input flows into raw SQL query.',
    confidence: 0.9,
    file: 'src/db.ts',
    line: 42,
    ...overrides,
  });
}

function makeDiffFile(overrides: Partial<DiffFile> = {}): DiffFile {
  return {
    path: 'src/db.ts',
    status: 'modified',
    additions: 10,
    deletions: 2,
    patch: '@@ -1,5 +1,12 @@\n+some code',
    ...overrides,
  };
}

function makeDiff(files: DiffFile[]): Diff {
  return {
    files,
    additions: files.reduce((s, f) => s + f.additions, 0),
    deletions: files.reduce((s, f) => s + f.deletions, 0),
  };
}

// ---------------------------------------------------------------------------
// formatAsReview
// ---------------------------------------------------------------------------

describe('formatAsReview', () => {
  it('produces a SecurityReview with inline findings', () => {
    const findings = [makeFinding()];
    const diff = makeDiff([makeDiffFile()]);

    const review = formatAsReview(findings, diff, false);

    expect(review.approved).toBe(false);
    expect(review.findings).toHaveLength(1);
    expect(review.findings[0].file).toBe('src/db.ts');
    expect(review.findings[0].line).toBe(42);
    expect(review.findings[0].severity).toBe('high');
    expect(review.findings[0].message).toContain('SQL Injection');
    expect(review.summary).toContain('1 finding');
  });

  it('produces an approved review with no findings', () => {
    const review = formatAsReview([], makeDiff([]), true);

    expect(review.approved).toBe(true);
    expect(review.findings).toHaveLength(0);
    expect(review.summary).toContain('No security issues found');
  });

  it('maps informational severity to low in ReviewFinding', () => {
    const findings = [makeFinding({severity: 'informational'})];
    const diff = makeDiff([makeDiffFile()]);

    const review = formatAsReview(findings, diff, true);
    expect(review.findings[0].severity).toBe('low');
  });

  it('includes CWE in comment body when present', () => {
    const findings = [makeFinding({cweId: 'CWE-89'})];
    const diff = makeDiff([makeDiffFile()]);

    const review = formatAsReview(findings, diff, false);
    expect(review.findings[0].message).toContain('CWE-89');
  });

  it('includes suggested fix in comment body when present', () => {
    const findings = [
      makeFinding({suggestedFix: 'Use parameterized queries.'}),
    ];
    const diff = makeDiff([makeDiffFile()]);

    const review = formatAsReview(findings, diff, false);
    expect(review.findings[0].message).toContain('Use parameterized queries');
  });

  it('omits findings without file from inline comments', () => {
    const findings = [makeFinding({file: undefined, line: undefined})];
    const diff = makeDiff([]);

    const review = formatAsReview(findings, diff, false);
    expect(review.findings).toHaveLength(0);
    expect(review.summary).toContain('1 finding');
  });

  it('resolves line from diff patch when finding has no line', () => {
    const findings = [makeFinding({line: undefined})];
    const diff = makeDiff([
      makeDiffFile({patch: '@@ -10,5 +15,12 @@\n+new code'}),
    ]);

    const review = formatAsReview(findings, diff, false);
    expect(review.findings[0].line).toBe(15);
  });

  it('defaults to line 1 when no line info available', () => {
    const findings = [makeFinding({line: undefined})];
    const diff = makeDiff([makeDiffFile({patch: undefined})]);

    const review = formatAsReview(findings, diff, false);
    expect(review.findings[0].line).toBe(1);
  });

  it('handles multiple findings across different files', () => {
    const findings = [
      makeFinding({file: 'src/auth.ts', line: 10, severity: 'critical'}),
      makeFinding({file: 'src/db.ts', line: 42, severity: 'high'}),
      makeFinding({file: 'src/utils.ts', line: 5, severity: 'low'}),
    ];
    const diff = makeDiff([
      makeDiffFile({path: 'src/auth.ts'}),
      makeDiffFile({path: 'src/db.ts'}),
      makeDiffFile({path: 'src/utils.ts'}),
    ]);

    const review = formatAsReview(findings, diff, false);
    expect(review.findings).toHaveLength(3);
    expect(review.summary).toContain('3 finding');
  });

  it('summary includes severity breakdown', () => {
    const findings = [
      makeFinding({severity: 'critical'}),
      makeFinding({severity: 'critical'}),
      makeFinding({severity: 'medium'}),
    ];
    const diff = makeDiff([makeDiffFile()]);

    const review = formatAsReview(findings, diff, false);
    expect(review.summary).toContain('CRITICAL');
    expect(review.summary).toContain('MEDIUM');
  });

  it('unapproved review includes action message', () => {
    const findings = [makeFinding()];
    const diff = makeDiff([makeDiffFile()]);

    const review = formatAsReview(findings, diff, false);
    expect(review.summary).toContain('address the findings');
  });

  it('passes suggestedFix through to ReviewFinding', () => {
    const findings = [makeFinding({suggestedFix: 'Fix it this way.'})];
    const diff = makeDiff([makeDiffFile()]);

    const review = formatAsReview(findings, diff, false);
    expect(review.findings[0].suggestedFix).toBe('Fix it this way.');
  });
});
