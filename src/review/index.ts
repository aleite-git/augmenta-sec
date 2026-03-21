/**
 * Review module barrel -- re-exports review functionality.
 *
 * ASEC-047: GitHub Action review support.
 * ASEC-049: Batch review for all open PRs.
 */

// Shared types
export type {
  BatchReviewConfig,
  BatchReviewResult,
  CIPlatform,
  GitHubActionConfig,
  LLMProviderName,
  PRReviewResult,
} from './types.js';

// ASEC-047: GitHub Action
export {
  buildSecurityReview,
  hasBlockingFindings,
  parseActionInputs,
  parsePRNumberFromRef,
  reviewPR,
} from './github-action.js';

// ASEC-049: Batch review
export {reviewAllOpenPRs} from './batch.js';
