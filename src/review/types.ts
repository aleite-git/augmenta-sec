/**
 * Shared types for the review module.
 *
 * Defines the contracts for single-PR review results, batch review
 * results, and configuration shared across GitHub Actions, GitLab CI,
 * and CLI batch review.
 */

import type {Severity} from '../config/schema.js';
import type {ReviewFinding} from '../providers/git-platform/types.js';

/** Supported CI/CD platform identifiers. */
export type CIPlatform = 'github' | 'gitlab';

/** Supported LLM provider names (same as model-string prefix). */
export type LLMProviderName =
  | 'anthropic'
  | 'gemini'
  | 'mistral'
  | 'ollama'
  | 'openai';

/** Result of reviewing a single pull request. */
export interface PRReviewResult {
  /** PR number. */
  prNumber: number;
  /** PR title. */
  prTitle: string;
  /** PR URL. */
  prUrl: string;
  /** Whether the review approved the PR. */
  approved: boolean;
  /** Findings discovered during review. */
  findings: ReviewFinding[];
  /** Human-readable summary of the review. */
  summary: string;
  /** Duration of the review in milliseconds. */
  durationMs: number;
}

/** Result of reviewing all open PRs in a repository. */
export interface BatchReviewResult {
  /** Platform that was reviewed. */
  platform: CIPlatform;
  /** Total number of open PRs found. */
  totalPRs: number;
  /** Number of PRs that were reviewed. */
  reviewedPRs: number;
  /** Number of PRs that were skipped (e.g. drafts, no diff). */
  skippedPRs: number;
  /** Individual PR review results. */
  results: PRReviewResult[];
  /** Total duration of the batch review in milliseconds. */
  durationMs: number;
}

/** Configuration for the GitHub Action. */
export interface GitHubActionConfig {
  /** GitHub token for API access. */
  githubToken: string;
  /** LLM provider to use. */
  llmProvider: LLMProviderName;
  /** API key for the LLM provider. */
  llmApiKey: string;
  /** Minimum severity threshold for blocking findings. */
  severityThreshold: Severity;
  /** Whether to auto-approve PRs below the severity threshold. */
  autoApprove: boolean;
}

/** Configuration for batch review. */
export interface BatchReviewConfig {
  /** Minimum severity threshold for blocking findings. */
  severityThreshold: Severity;
  /** Whether to auto-approve PRs below the severity threshold. */
  autoApprove: boolean;
  /** Maximum number of PRs to review concurrently. */
  concurrency: number;
}
