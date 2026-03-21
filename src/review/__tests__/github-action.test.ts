/**
 * Tests for the GitHub Action review module (ASEC-047).
 *
 * Validates input parsing, blocking-findings logic, review building,
 * and the PR review orchestration.
 */

import {beforeEach, describe, expect, it, vi} from 'vitest';

import {
  buildSecurityReview,
  hasBlockingFindings,
  parseActionInputs,
  parsePRNumberFromRef,
  reviewPR,
} from '../github-action.js';
import type {GitHubActionConfig} from '../types.js';
import type {
  GitPlatform,
  PullRequest,
  ReviewFinding,
} from '../../providers/git-platform/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConfig(
  overrides: Partial<GitHubActionConfig> = {},
): GitHubActionConfig {
  return {
    githubToken: 'ghp_test',
    llmProvider: 'anthropic',
    llmApiKey: 'sk-test',
    severityThreshold: 'high',
    autoApprove: false,
    ...overrides,
  };
}

function makePR(overrides: Partial<PullRequest> = {}): PullRequest {
  return {
    id: '1001',
    number: 42,
    title: 'feat: add login',
    state: 'open',
    author: 'dev',
    baseBranch: 'main',
    headBranch: 'feat/login',
    url: 'https://github.com/o/r/pull/42',
    createdAt: '2026-03-20T10:00:00Z',
    updatedAt: '2026-03-20T12:00:00Z',
    ...overrides,
  };
}

function makeFinding(
  overrides: Partial<ReviewFinding> = {},
): ReviewFinding {
  return {
    file: 'src/auth.ts',
    line: 10,
    severity: 'high',
    message: 'Hardcoded secret detected',
    ...overrides,
  };
}

function makePlatform(
  overrides: Partial<GitPlatform> = {},
): GitPlatform {
  return {
    name: 'github',
    getPullRequests: vi.fn().mockResolvedValue([]),
    getDiff: vi.fn().mockResolvedValue({files: [], additions: 0, deletions: 0}),
    getBranches: vi.fn().mockResolvedValue([]),
    createIssue: vi.fn().mockResolvedValue(''),
    createPullRequest: vi.fn().mockResolvedValue(''),
    commentOnPR: vi.fn().mockResolvedValue(undefined),
    onPullRequestOpened: vi.fn(),
    onPush: vi.fn(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// parseActionInputs
// ---------------------------------------------------------------------------

describe('parseActionInputs', () => {
  it('parses all inputs from environment variables', () => {
    const env = {
      'INPUT_GITHUB-TOKEN': 'ghp_abc',
      'INPUT_LLM-PROVIDER': 'gemini',
      'INPUT_LLM-API-KEY': 'key-123',
      'INPUT_SEVERITY-THRESHOLD': 'medium',
      'INPUT_AUTO-APPROVE': 'true',
    };

    const config = parseActionInputs(env);

    expect(config).toEqual({
      githubToken: 'ghp_abc',
      llmProvider: 'gemini',
      llmApiKey: 'key-123',
      severityThreshold: 'medium',
      autoApprove: true,
    });
  });

  it('uses underscore-separated env var names as fallback', () => {
    const env = {
      INPUT_GITHUB_TOKEN: 'ghp_def',
      INPUT_LLM_PROVIDER: 'openai',
      INPUT_LLM_API_KEY: 'key-456',
      INPUT_SEVERITY_THRESHOLD: 'low',
      INPUT_AUTO_APPROVE: 'false',
    };

    const config = parseActionInputs(env);

    expect(config.githubToken).toBe('ghp_def');
    expect(config.llmProvider).toBe('openai');
    expect(config.llmApiKey).toBe('key-456');
    expect(config.severityThreshold).toBe('low');
    expect(config.autoApprove).toBe(false);
  });

  it('uses defaults for optional inputs', () => {
    const env = {
      'INPUT_GITHUB-TOKEN': 'ghp_xyz',
      'INPUT_LLM-API-KEY': 'key-789',
    };

    const config = parseActionInputs(env);

    expect(config.llmProvider).toBe('anthropic');
    expect(config.severityThreshold).toBe('high');
    expect(config.autoApprove).toBe(false);
  });

  it('throws when github-token is missing', () => {
    expect(() => parseActionInputs({})).toThrow(
      'Required input "github-token" is missing.',
    );
  });

  it('throws when llm-api-key is missing for non-ollama providers', () => {
    const env = {'INPUT_GITHUB-TOKEN': 'ghp_abc'};

    expect(() => parseActionInputs(env)).toThrow(
      'Required input "llm-api-key" is missing',
    );
  });

  it('allows missing llm-api-key for ollama provider', () => {
    const env = {
      'INPUT_GITHUB-TOKEN': 'ghp_abc',
      'INPUT_LLM-PROVIDER': 'ollama',
    };

    const config = parseActionInputs(env);

    expect(config.llmProvider).toBe('ollama');
    expect(config.llmApiKey).toBe('');
  });

  it('throws for invalid llm-provider', () => {
    const env = {
      'INPUT_GITHUB-TOKEN': 'ghp_abc',
      'INPUT_LLM-PROVIDER': 'invalid-provider',
      'INPUT_LLM-API-KEY': 'key',
    };

    expect(() => parseActionInputs(env)).toThrow(
      'Invalid input "llm-provider": "invalid-provider"',
    );
  });

  it('throws for invalid severity-threshold', () => {
    const env = {
      'INPUT_GITHUB-TOKEN': 'ghp_abc',
      'INPUT_LLM-API-KEY': 'key',
      'INPUT_SEVERITY-THRESHOLD': 'urgent',
    };

    expect(() => parseActionInputs(env)).toThrow(
      'Invalid input "severity-threshold": "urgent"',
    );
  });

  it('is case-insensitive for provider and severity', () => {
    const env = {
      'INPUT_GITHUB-TOKEN': 'ghp_abc',
      'INPUT_LLM-PROVIDER': 'Anthropic',
      'INPUT_LLM-API-KEY': 'key',
      'INPUT_SEVERITY-THRESHOLD': 'HIGH',
    };

    const config = parseActionInputs(env);

    expect(config.llmProvider).toBe('anthropic');
    expect(config.severityThreshold).toBe('high');
  });
});

// ---------------------------------------------------------------------------
// hasBlockingFindings
// ---------------------------------------------------------------------------

describe('hasBlockingFindings', () => {
  it('returns true when a finding meets the threshold', () => {
    const findings = [makeFinding({severity: 'high'})];
    expect(hasBlockingFindings(findings, 'high')).toBe(true);
  });

  it('returns true when a finding exceeds the threshold', () => {
    const findings = [makeFinding({severity: 'critical'})];
    expect(hasBlockingFindings(findings, 'high')).toBe(true);
  });

  it('returns false when all findings are below the threshold', () => {
    const findings = [
      makeFinding({severity: 'low'}),
      makeFinding({severity: 'medium'}),
    ];
    expect(hasBlockingFindings(findings, 'high')).toBe(false);
  });

  it('returns false for empty findings', () => {
    expect(hasBlockingFindings([], 'high')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// buildSecurityReview
// ---------------------------------------------------------------------------

describe('buildSecurityReview', () => {
  it('produces LGTM summary when there are no findings', () => {
    const review = buildSecurityReview([], makeConfig());

    expect(review.summary).toContain('No security findings detected');
    expect(review.findings).toHaveLength(0);
    expect(review.approved).toBe(false); // autoApprove is false
  });

  it('auto-approves when enabled and no blocking findings', () => {
    const config = makeConfig({autoApprove: true});
    const findings = [makeFinding({severity: 'low'})];

    const review = buildSecurityReview(findings, config);

    expect(review.approved).toBe(true);
    expect(review.summary).toContain('none at or above high severity');
  });

  it('does not approve when there are blocking findings', () => {
    const config = makeConfig({autoApprove: true});
    const findings = [makeFinding({severity: 'critical'})];

    const review = buildSecurityReview(findings, config);

    expect(review.approved).toBe(false);
    expect(review.summary).toContain('Please address before merging');
  });

  it('includes the blocking count in the summary', () => {
    const findings = [
      makeFinding({severity: 'critical'}),
      makeFinding({severity: 'high'}),
      makeFinding({severity: 'low'}),
    ];

    const review = buildSecurityReview(findings, makeConfig());

    // 2 findings at or above 'high'
    expect(review.summary).toContain('2 finding(s)');
  });
});

// ---------------------------------------------------------------------------
// reviewPR
// ---------------------------------------------------------------------------

describe('reviewPR', () => {
  it('posts review comment and returns result', async () => {
    const platform = makePlatform();
    const pr = makePR();
    const findings = [makeFinding()];
    const config = makeConfig();

    const result = await reviewPR(platform, pr, findings, config);

    expect(platform.commentOnPR).toHaveBeenCalledOnce();
    expect(result.prNumber).toBe(42);
    expect(result.prTitle).toBe('feat: add login');
    expect(result.prUrl).toBe('https://github.com/o/r/pull/42');
    expect(result.approved).toBe(false);
    expect(result.findings).toHaveLength(1);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('approves when auto-approve is on and no blocking findings', async () => {
    const platform = makePlatform();
    const pr = makePR();
    const findings = [makeFinding({severity: 'low'})];
    const config = makeConfig({autoApprove: true});

    const result = await reviewPR(platform, pr, findings, config);

    expect(result.approved).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// parsePRNumberFromRef
// ---------------------------------------------------------------------------

describe('parsePRNumberFromRef', () => {
  it('extracts PR number from refs/pull/<n>/merge', () => {
    expect(parsePRNumberFromRef('refs/pull/42/merge')).toBe(42);
  });

  it('extracts PR number from refs/pull/<n>/head', () => {
    expect(parsePRNumberFromRef('refs/pull/123/head')).toBe(123);
  });

  it('returns undefined for non-PR refs', () => {
    expect(parsePRNumberFromRef('refs/heads/main')).toBeUndefined();
  });

  it('returns undefined for undefined input', () => {
    expect(parsePRNumberFromRef(undefined)).toBeUndefined();
  });

  it('returns undefined for empty string', () => {
    expect(parsePRNumberFromRef('')).toBeUndefined();
  });
});
