/**
 * `asec serve` CLI command -- starts the AugmentaSec HTTP API server.
 *
 * @module ASEC-080
 */

import chalk from 'chalk';
import {createServer, stopServer as stopHttpServer} from '../../server/core.js';
import {createScanRoutes, createScanStore} from '../../server/routes/scan.js';
import {
  createProfileRoutes,
  createProfileStore,
} from '../../server/routes/profile.js';
import {createWebhookManager} from '../../server/webhook-manager.js';
import {createRateLimiter} from '../../server/rate-limit.js';
import type {Route, RouteParams} from '../../server/core.js';
import {jsonResponse, errorResponse} from '../../server/core.js';
import {
  validateRequest,
  webhookRegisterSchema,
} from '../../server/validation.js';
import type {WebhookEvent} from '../../server/webhook-manager.js';
import {logger} from '../../utils/logger.js';
import type {IncomingMessage, ServerResponse} from 'node:http';

export interface ServeOptions {
  port?: string;
  host?: string;
  apiKey?: string;
  dbPath?: string;
  githubSecret?: string;
  gitlabSecret?: string;
}

export async function serveCommand(options: ServeOptions): Promise<void> {
  const port = options.port ? parseInt(options.port, 10) : 7400;
  const host = options.host ?? '127.0.0.1';

  if (isNaN(port) || port < 1 || port > 65535) {
    logger.error('Invalid port number. Must be between 1 and 65535.');
    process.exitCode = 1;
    return;
  }

  logger.header('AugmentaSec Server');
  logger.detail('Port', String(port));
  logger.detail('Host', host);
  logger.detail('API key', options.apiKey ? 'configured' : 'disabled');

  // Initialize stores and managers.
  const scanStore = createScanStore();
  const profileStore = createProfileStore();
  const webhookManager = createWebhookManager();
  const rateLimiter = createRateLimiter({
    maxRequests: 100,
    windowMs: 60_000,
  });

  // Build routes.
  const routes: Route[] = [
    ...createScanRoutes(scanStore, webhookManager),
    ...createProfileRoutes(profileStore),
    // Webhook registration endpoints
    {
      method: 'POST',
      pattern: '/api/webhooks/register',
      handler(
        _req: IncomingMessage,
        res: ServerResponse,
        params: RouteParams,
      ): void {
        const validation = validateRequest(
          params.body,
          webhookRegisterSchema,
        );
        if (!validation.valid) {
          errorResponse(res, 400, validation.errors.join('; '));
          return;
        }
        const body = params.body as {url: string; events?: WebhookEvent[]};
        const events = body.events ?? [
          'scan.completed',
          'scan.failed',
          'finding.critical',
        ];
        const sub = webhookManager.register(body.url, events);
        jsonResponse(res, 201, sub);
      },
    },
    {
      method: 'GET',
      pattern: '/api/webhooks',
      handler(
        _req: IncomingMessage,
        res: ServerResponse,
        _params: RouteParams,
      ): void {
        jsonResponse(res, 200, {webhooks: webhookManager.list()});
      },
    },
  ];

  const ctx = await createServer(
    {port, host, apiKey: options.apiKey},
    routes,
  );

  console.log();
  console.log(
    chalk.green('+'),
    `Server listening on ${chalk.bold(`http://${host}:${port}`)}`,
  );
  console.log(chalk.gray('  Press Ctrl+C to stop.'));

  // Graceful shutdown on SIGINT / SIGTERM
  const shutdown = async () => {
    console.log();
    logger.info('Shutting down...');
    await stopHttpServer(ctx);
    logger.success('Server stopped.');
  };

  process.on('SIGINT', () => {
    shutdown().finally(() => process.exit(0));
  });
  process.on('SIGTERM', () => {
    shutdown().finally(() => process.exit(0));
  });
}
