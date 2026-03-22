/**
 * Review module barrel — re-exports all review functionality.
 *
 * ASEC-043: Review engine (runReview, parsePRRef)
 * ASEC-044: Diff-aware analysis (analyzeDiff, isCodeFile, parseFindings)
 * ASEC-045: Inline comment formatter (formatAsReview)
 * ASEC-046: Review config helpers (shouldAutoApprove, filterByConfig)
 * ASEC-049: Batch review (batchReview, runWithConcurrency)
 */

// ASEC-043: Review engine
export type {ReviewResult, PRRef} from './engine.js';
export {runReview, parsePRRef} from './engine.js';

// ASEC-044: Diff-aware analysis
export {analyzeDiff, isCodeFile, parseFindings} from './diff-analyzer.js';

// ASEC-045: Inline comment formatter
export {formatAsReview} from './formatter.js';

// ASEC-046: Review config helpers
export {shouldAutoApprove, filterByConfig} from './config.js';

// ASEC-049: Batch review
export type {BatchReviewOptions, BatchReviewItem, BatchReviewResult} from './batch.js';
export {batchReview, runWithConcurrency} from './batch.js';
