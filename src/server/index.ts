/**
 * Server module — REST API, team activity, and multi-repo management.
 */

export type {
  TeamActivity,
  SprintInfo,
  SprintTicket,
  BranchInfo,
  FreezeInfo,
  Platform,
} from './activity.js';

export {
  getTeamActivity,
  parseSprintFile,
  getLocalBranches,
  filterOpenBranches,
  detectFreeze,
} from './activity.js';

export type {
  ApiServer,
  ApiServerOptions,
  ApiResponse,
  ScanJob,
  ScanJobStatus,
  ReviewPayload,
  ReviewResult,
  FindingsFilter,
  RouteHandler,
  Route,
} from './api.js';

export {
  createApiServer,
  matchRoute,
  getFindingsStore,
  getScanJobsStore,
  clearStores,
} from './api.js';

export type {
  RepoConfig,
  ScanResult,
  AggregateFindings,
  ScanFunction,
} from './multi-repo.js';

export {MultiRepoManager} from './multi-repo.js';
