/**
 * Platform adapter abstraction (ASEC-040).
 *
 * Defines a lightweight interface that CI-oriented adapters implement.
 * Unlike the full GitPlatform interface (used for server-mode features
 * like webhooks and branch listing), PlatformAdapter focuses on the
 * PR-review workflow: fetch diff, fetch files, post comments.
 */

// ---------------------------------------------------------------------------
// Data types
// ---------------------------------------------------------------------------

/** Metadata for a pull request / merge request. */
export interface PRInfo {
  number: number;
  title: string;
  state: 'open' | 'closed' | 'merged';
  author: string;
  baseBranch: string;
  headBranch: string;
  url: string;
}

/** A single changed file with optional patch content. */
export interface PRFile {
  filename: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  additions: number;
  deletions: number;
  patch?: string;
}

/** A review comment to post on a specific file + line. */
export interface ReviewComment {
  path: string;
  line: number;
  body: string;
}

/** A complete review to submit on a PR. */
export interface ReviewPayload {
  body: string;
  event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT';
  comments: ReviewComment[];
}

// ---------------------------------------------------------------------------
// Adapter interface
// ---------------------------------------------------------------------------

/** Minimal platform adapter for the PR-review workflow. */
export interface PlatformAdapter {
  /** Human-readable platform name. */
  readonly name: string;

  /** Fetch the unified diff for a PR. */
  getPRDiff(prNumber: number): Promise<string>;

  /** Fetch the list of changed files for a PR. */
  getPRFiles(prNumber: number): Promise<PRFile[]>;

  /** Post a single comment on a PR. */
  postReviewComment(prNumber: number, comment: ReviewComment): Promise<void>;

  /** Submit a full review (summary + inline comments). */
  createReview(prNumber: number, payload: ReviewPayload): Promise<void>;

  /** Fetch PR metadata. */
  getPRInfo(prNumber: number): Promise<PRInfo>;
}
