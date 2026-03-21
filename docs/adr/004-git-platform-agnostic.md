# ADR-004: Git Platform-Agnostic Design

**Status**: Accepted
**Date**: 2026-03-21

## Context

Development teams use different Git hosting platforms: GitHub, GitLab, Bitbucket, Azure DevOps, Gitea, and others. AugmentaSec needs to interact with these platforms for:

- **Reading**: listing pull requests, fetching diffs, listing branches
- **Writing**: creating security issues, opening fix PRs, posting review comments
- **Events**: reacting to PR opens and pushes (for CI integration)

Building directly against one platform's API would limit adoption to that platform's users and make adding new platforms a major refactoring effort.

## Decision

Abstract all Git platform interactions behind a `GitPlatform` interface:

```typescript
interface GitPlatform {
  name: string;

  // Read
  getPullRequests(state: 'open' | 'merged'): Promise<PullRequest[]>;
  getDiff(base: string, head: string): Promise<Diff>;
  getBranches(): Promise<Branch[]>;

  // Write
  createIssue(issue: SecurityIssue): Promise<string>;
  createPullRequest(title, body, head, base): Promise<string>;
  commentOnPR(prNumber: number, review: SecurityReview): Promise<void>;

  // Events
  onPullRequestOpened(handler): void;
  onPush(handler): void;
}
```

Key design choices:

1. **Unified PR model**: The `PullRequest` type normalizes platform differences. GitHub calls them "pull requests", GitLab calls them "merge requests", Bitbucket uses "pull requests" but with different state names. The interface uses a common vocabulary.

2. **State normalization**: PR states are normalized to `'open' | 'closed' | 'merged'`. GitHub uses `closed` + `merged_at` to indicate merged PRs; GitLab has a distinct `merged` state. Each adapter handles its platform's conventions.

3. **Review as a single action**: `commentOnPR()` accepts a `SecurityReview` with findings and an approval decision. The adapter translates this to the platform's review mechanism (GitHub PR reviews, GitLab MR discussions, etc.).

4. **Event handlers for future webhook support**: `onPullRequestOpened()` and `onPush()` store handlers that will be invoked by a webhook server (a future feature). This keeps the interface forward-compatible.

The first implementation is GitHub (`src/providers/git-platform/github.ts`) using the `@octokit/rest` SDK. It includes rate limit monitoring, error wrapping with descriptive messages, and support for GitHub Enterprise via a configurable `apiBaseUrl`.

## Consequences

**Easier:**
- The same review, scan, and remediation logic works on any platform. Adding GitLab support requires only a new adapter, not changes to the scan or review engines.
- Platform-specific quirks (GitHub's merged PR detection, rate limit headers) are isolated in adapters.
- Teams can switch platforms without reconfiguring AugmentaSec's core behavior.
- Testing is simpler: core logic is tested against the interface, not against a specific platform's API.

**More difficult:**
- The interface must be a common denominator across platforms. Platform-specific features (GitHub Actions checks, GitLab CI integration, Bitbucket pipelines) cannot be expressed through the generic interface.
- Each new platform requires understanding its API, authentication model, and quirks. The GitHub adapter is ~300 lines of platform-specific mapping.
- Event handling (webhooks) will require platform-specific server implementations since each platform has its own webhook format and verification mechanism.
