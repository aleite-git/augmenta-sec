/**
 * Platform adapters barrel — re-exports all platform functionality.
 */

export type {PlatformAdapter, PRInfo, PRFile, ReviewComment, ReviewPayload} from './types.js';

export {createGitHubPlatformAdapter, type GitHubAdapterConfig} from './github.js';
export {createGitLabPlatformAdapter, type GitLabConfig} from './gitlab.js';
export {createBitbucketPlatformAdapter, type BitbucketConfig} from './bitbucket.js';
