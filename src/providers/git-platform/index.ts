/**
 * Git platform adapters — GitHub and Bitbucket.
 *
 * Re-exports the platform adapters and all shared types so consumers can
 * import from a single entry point:
 *
 *   import { createGitHubAdapter, createBitbucketAdapter, type GitPlatform } from './providers/git-platform/index.js';
 */

export {createBitbucketAdapter, type BitbucketConfig} from './bitbucket.js';
export {createGitHubAdapter, type GitHubConfig} from './github.js';
export type {
  Branch,
  Diff,
  DiffFile,
  GitPlatform,
  PullRequest,
  ReviewFinding,
  SecurityIssue,
  SecurityReview,
} from './types.js';
