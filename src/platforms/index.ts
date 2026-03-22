/**
 * Platform adapters barrel — re-exports all platform functionality.
 *
 * ASEC-040: GitHub adapter (PlatformAdapter, createGitHubPlatformAdapter)
 */

export type {PlatformAdapter, PRInfo, PRFile, ReviewComment, ReviewPayload} from './types.js';

export {createGitHubPlatformAdapter, type GitHubAdapterConfig} from './github.js';
