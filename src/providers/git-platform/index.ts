/**
 * Git platform adapters — currently GitHub only.
 *
 * Re-exports the GitHub adapter and all shared types so consumers can
 * import from a single entry point:
 *
 *   import { createGitHubAdapter, type GitPlatform } from './providers/git-platform/index.js';
 */

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
