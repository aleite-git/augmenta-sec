/**
 * Git platform abstraction — GitHub, GitLab, Bitbucket, Azure DevOps, Gitea.
 */

export interface PullRequest {
  id: string;
  number: number;
  title: string;
  state: 'open' | 'closed' | 'merged';
  author: string;
  baseBranch: string;
  headBranch: string;
  url: string;
  createdAt: string;
  updatedAt: string;
}

export interface Diff {
  files: DiffFile[];
  additions: number;
  deletions: number;
}

export interface DiffFile {
  path: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  additions: number;
  deletions: number;
  patch?: string;
}

export interface Branch {
  name: string;
  isDefault: boolean;
  lastCommit: string;
}

export interface SecurityIssue {
  title: string;
  body: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'informational';
  labels: string[];
}

export interface SecurityReview {
  summary: string;
  findings: ReviewFinding[];
  approved: boolean;
}

export interface ReviewFinding {
  file: string;
  line: number;
  severity: 'critical' | 'high' | 'medium' | 'low';
  message: string;
  suggestedFix?: string;
}

export interface GitPlatform {
  name: string;

  // Read
  getPullRequests(state: 'open' | 'merged'): Promise<PullRequest[]>;
  getDiff(base: string, head: string): Promise<Diff>;
  getBranches(): Promise<Branch[]>;

  // Write
  createIssue(issue: SecurityIssue): Promise<string>;
  createPullRequest(
    title: string,
    body: string,
    head: string,
    base: string,
  ): Promise<string>;
  commentOnPR(prNumber: number, review: SecurityReview): Promise<void>;

  // Events
  onPullRequestOpened(
    handler: (pr: PullRequest) => Promise<void>,
  ): void;
  onPush(handler: (branch: string) => Promise<void>): void;
}
