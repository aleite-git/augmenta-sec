/**
 * Server module — REST API, team activity, multi-repo management,
 * daemon server, webhooks, scheduler, persistent state, rate limiting,
 * health/status endpoints, and request validation.
 */

// ASEC-084/086: Team activity & REST API
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
  RouteHandler as ApiRouteHandler,
  Route as ApiRoute,
} from './api.js';
export {
  createApiServer,
  matchRoute as matchApiRoute,
  getFindingsStore,
  getScanJobsStore,
  clearStores,
} from './api.js';

// ASEC-087: Multi-repo management
export type {
  RepoConfig,
  ScanResult,
  AggregateFindings,
  ScanFunction,
} from './multi-repo.js';
export {MultiRepoManager} from './multi-repo.js';

// ASEC-088: Dashboard
export {serveDashboard} from './dashboard.js';

// ASEC-080: Daemon server
export type {DaemonConfig, DaemonContext} from './daemon.js';
export {startServer, stopServer} from './daemon.js';

// ASEC-080: HTTP server core
export type {
  ServerConfig,
  ServerContext,
  Route,
  RouteHandler,
  RouteParams,
} from './core.js';
export {
  createServer,
  stopServer as stopHttpServer,
  jsonResponse,
  errorResponse,
  readBody,
  matchRoute,
} from './core.js';

// ASEC-081: Webhooks (inbound)
export type {WebhookAction, WebhookResult} from './webhooks.js';
export {
  handleGitHubWebhook,
  handleGitLabWebhook,
  verifyGitHubSignature,
  verifyGitLabToken,
} from './webhooks.js';

// ASEC-081: Scan API routes
export type {
  ScanStatus,
  ScanConfig as ScanRequestConfig,
  ScanReport,
  ScanRecord,
  ScanStore,
  ScanFinding,
} from './routes/scan.js';
export {createScanRoutes, createScanStore} from './routes/scan.js';

// ASEC-082: Scheduler
export type {CronFields, ScheduledJob, Scheduler} from './scheduler.js';
export {parseCron, cronMatches, createScheduler} from './scheduler.js';

// ASEC-082: Profile API routes
export type {
  ProfileSummary,
  ProfileRecord,
  ProfileStore,
  ProfileStoreConfig,
} from './routes/profile.js';
export {createProfileRoutes, createProfileStore} from './routes/profile.js';

// ASEC-083: Persistent state
export type {
  ScanQueueRow,
  WebhookLogRow,
  ScheduleRow,
  ScanHistoryRow,
  StateStore,
} from './state.js';
export {createStateStore} from './state.js';

// ASEC-083: Webhook manager (outbound)
export type {
  WebhookEvent,
  WebhookSubscription,
  WebhookDelivery,
  WebhookPayload,
  WebhookManager,
  WebhookManagerConfig,
} from './webhook-manager.js';
export {createWebhookManager} from './webhook-manager.js';

// ASEC-084: Rate limiting
export type {RateLimitConfig, RateLimiter} from './rate-limit.js';
export {createRateLimiter} from './rate-limit.js';

// ASEC-085: Health & status
export type {HealthResponse, StatusResponse} from './health.js';
export {handleHealth, handleStatus} from './health.js';

// ASEC-085: Request validation
export type {
  FieldSchema,
  RequestSchema,
  ValidationResult,
} from './validation.js';
export {
  validateRequest,
  scanRequestSchema,
  profileRequestSchema,
  webhookRegisterSchema,
} from './validation.js';
