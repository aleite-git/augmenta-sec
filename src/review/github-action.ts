/**
 * GitHub Action entry point for AugmentaSec PR security review.
 *
 * Reads inputs from environment variables (set by the action.yml inputs),
 * initializes the GitHub adapter and LLM provider, reviews the PR diff,
 * and posts findings as a PR review comment.
 *
 * @module review/github-action
 */

import {isAtLeast} from '../findings/severity.js';
import type {
  GitPlatform,
  PullRequest,
  ReviewFinding,
  SecurityReview,
} from '../providers/git-platform/types.js';
import type {Severity} from '../config/schema.js';
import type {GitHubActionConfig, LLMProviderName, PRReviewResult} from './types.js';

// ---------------------------------------------------------------------------
// Input parsing
// ---------------------------------------------------------------------------

const VALID_LLM_PROVIDERS: readonly LLMProviderName[] = [
  'anthropic',
  'gemini',
  'mistral',
  'ollama',
  'openai',
];

const VALID_SEVERITIES: readonly Severity[] = [
  'critical',
  'high',
  'medium',
  'low',
  'informational',
];

/**
 * Parses and validates GitHub Action inputs from environment variables.
 *
 * GitHub Actions expose inputs as `INPUT_<NAME>` environment variables
 * with the input name uppercased and dashes replaced by underscores.
 */
export function parseActionInputs(
  env: Record<string, string | undefined> = process.env,
): GitHubActionConfig {
  const githubToken = env['INPUT_GITHUB-TOKEN'] ?? env['INPUT_GITHUB_TOKEN'] ?? '';
  if (!githubToken) {
    throw new Error('Required input "github-token" is missing.');
  }

  const llmProviderRaw = (
    env['INPUT_LLM-PROVIDER'] ?? env['INPUT_LLM_PROVIDER'] ?? 'anthropic'
  ).toLowerCase();
  if (!VALID_LLM_PROVIDERS.includes(llmProviderRaw as LLMProviderName)) {
    throw new Error(
      `Invalid input "llm-provider": "${llmProviderRaw}". ` +
        `Must be one of: ${VALID_LLM_PROVIDERS.join(', ')}.`,
    );
  }
  const llmProvider = llmProviderRaw as LLMProviderName;

  const llmApiKey = env['INPUT_LLM-API-KEY'] ?? env['INPUT_LLM_API_KEY'] ?? '';
  if (!llmApiKey && llmProvider !== 'ollama') {
    throw new Error(
      'Required input "llm-api-key" is missing (only optional for ollama).',
    );
  }

  const severityRaw = (
    env['INPUT_SEVERITY-THRESHOLD'] ?? env['INPUT_SEVERITY_THRESHOLD'] ?? 'high'
  ).toLowerCase();
  if (!VALID_SEVERITIES.includes(severityRaw as Severity)) {
    throw new Error(
      `Invalid input "severity-threshold": "${severityRaw}". ` +
        `Must be one of: ${VALID_SEVERITIES.join(', ')}.`,
    );
  }
  const severityThreshold = severityRaw as Severity;

  const autoApproveRaw = (
    env['INPUT_AUTO-APPROVE'] ?? env['INPUT_AUTO_APPROVE'] ?? 'false'
  ).toLowerCase();
  const autoApprove = autoApproveRaw === 'true';

  return {
    githubToken,
    llmProvider,
    llmApiKey,
    severityThreshold,
    autoApprove,
  };
}

// ---------------------------------------------------------------------------
// PR review logic
// ---------------------------------------------------------------------------

/**
 * Determines whether any findings meet or exceed the severity threshold.
 */
export function hasBlockingFindings(
  findings: ReviewFinding[],
  threshold: Severity,
): boolean {
  return findings.some((f) => isAtLeast(f.severity, threshold));
}

/**
 * Builds a {@link SecurityReview} from review findings and config.
 */
export function buildSecurityReview(
  findings: ReviewFinding[],
  config: GitHubActionConfig,
): SecurityReview {
  const blocking = hasBlockingFindings(findings, config.severityThreshold);
  const approved = config.autoApprove && !blocking;

  let summary: string;
  if (findings.length === 0) {
    summary = 'AugmentaSec: No security findings detected. LGTM!';
  } else if (blocking) {
    const count = findings.filter((f) =>
      isAtLeast(f.severity, config.severityThreshold),
    ).length;
    summary =
      `AugmentaSec: Found ${count} finding(s) at or above ` +
      `${config.severityThreshold} severity. Please address before merging.`;
  } else {
    summary =
      `AugmentaSec: Found ${findings.length} finding(s), ` +
      `none at or above ${config.severityThreshold} severity.`;
  }

  return {summary, findings, approved};
}

// ---------------------------------------------------------------------------
// Main action runner
// ---------------------------------------------------------------------------

/**
 * Runs a security review on a single PR.
 *
 * This is the core review logic extracted for testability. The caller
 * provides the platform adapter and the PR to review, along with the
 * findings (produced by the LLM analysis step, mocked in tests).
 */
export async function reviewPR(
  platform: GitPlatform,
  pr: PullRequest,
  findings: ReviewFinding[],
  config: GitHubActionConfig,
): Promise<PRReviewResult> {
  const start = Date.now();

  const review = buildSecurityReview(findings, config);
  await platform.commentOnPR(pr.number, review);

  return {
    prNumber: pr.number,
    prTitle: pr.title,
    prUrl: pr.url,
    approved: review.approved,
    findings: review.findings,
    summary: review.summary,
    durationMs: Date.now() - start,
  };
}

/**
 * Parses the GitHub event context to extract the PR number.
 *
 * In a `pull_request` event, the PR number is available in
 * `GITHUB_EVENT_PATH` JSON under `pull_request.number`, or in
 * the `GITHUB_REF` as `refs/pull/<number>/merge`.
 */
export function parsePRNumberFromRef(
  githubRef: string | undefined,
): number | undefined {
  if (!githubRef) {
    return undefined;
  }
  const match = githubRef.match(/^refs\/pull\/(\d+)\//);
  if (match) {
    return parseInt(match[1], 10);
  }
  return undefined;
}
