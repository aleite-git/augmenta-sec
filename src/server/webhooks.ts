/**
 * Webhook handlers for GitHub and GitLab.
 *
 * - GitHub: HMAC-SHA256 signature verification (X-Hub-Signature-256).
 * - GitLab: Secret token comparison (X-Gitlab-Token).
 *
 * On PR opened -> triggers a review scan.
 * On push      -> triggers a full scan.
 *
 * @module ASEC-081
 */

import {createHmac, timingSafeEqual} from 'node:crypto';

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export type WebhookAction = 'scan' | 'review' | 'none';

export interface WebhookResult {
  action: WebhookAction;
  repo: string;
  ref: string;
  event: string;
}

// ---------------------------------------------------------------------------
// GitHub
// ---------------------------------------------------------------------------

/**
 * Verifies and processes a GitHub webhook payload.
 *
 * @param body      Raw request body string (not parsed JSON).
 * @param signature The value of the X-Hub-Signature-256 header.
 * @param secret    The webhook secret configured in GitHub.
 * @param event     The value of the X-GitHub-Event header.
 * @returns A {@link WebhookResult} describing the triggered action.
 * @throws {Error} If the signature is missing or invalid.
 */
export function handleGitHubWebhook(
  body: string,
  signature: string,
  secret: string,
  event: string,
): WebhookResult {
  verifyGitHubSignature(body, signature, secret);

  const payload = JSON.parse(body) as Record<string, unknown>;
  const repo = extractRepoFullName(payload, 'repository', 'full_name');

  if (event === 'pull_request') {
    const action = (payload.action as string) ?? '';
    if (action === 'opened' || action === 'synchronize') {
      const pr = payload.pull_request as Record<string, unknown> | undefined;
      const ref =
        ((pr?.head as Record<string, unknown>)?.ref as string) ?? 'unknown';
      return {action: 'review', repo, ref, event: `pull_request.${action}`};
    }
  }

  if (event === 'push') {
    const ref = (payload.ref as string) ?? 'unknown';
    return {action: 'scan', repo, ref, event: 'push'};
  }

  return {action: 'none', repo, ref: '', event};
}

/**
 * Verifies the HMAC-SHA256 signature of a GitHub webhook.
 *
 * @throws {Error} On missing or invalid signature.
 */
export function verifyGitHubSignature(
  body: string,
  signature: string,
  secret: string,
): void {
  if (!signature) {
    throw new Error('Missing GitHub webhook signature');
  }

  const expected = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;

  const sigBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  if (
    sigBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(sigBuffer, expectedBuffer)
  ) {
    throw new Error('Invalid GitHub webhook signature');
  }
}

// ---------------------------------------------------------------------------
// GitLab
// ---------------------------------------------------------------------------

/**
 * Verifies and processes a GitLab webhook payload.
 *
 * @param body   Raw request body string.
 * @param token  The value of the X-Gitlab-Token header.
 * @param secret The configured secret token.
 * @returns A {@link WebhookResult} describing the triggered action.
 * @throws {Error} If the token is missing or does not match.
 */
export function handleGitLabWebhook(
  body: string,
  token: string,
  secret: string,
): WebhookResult {
  verifyGitLabToken(token, secret);

  const payload = JSON.parse(body) as Record<string, unknown>;
  const eventType =
    (payload.object_kind as string) ??
    (payload.event_type as string) ??
    '';
  const repo = extractGitLabRepo(payload);

  if (eventType === 'merge_request') {
    const attrs = payload.object_attributes as
      | Record<string, unknown>
      | undefined;
    const action = (attrs?.action as string) ?? '';
    if (action === 'open' || action === 'update') {
      const ref = (attrs?.source_branch as string) ?? 'unknown';
      return {
        action: 'review',
        repo,
        ref,
        event: `merge_request.${action}`,
      };
    }
  }

  if (eventType === 'push') {
    const ref = (payload.ref as string) ?? 'unknown';
    return {action: 'scan', repo, ref, event: 'push'};
  }

  return {action: 'none', repo, ref: '', event: eventType};
}

/**
 * Validates a GitLab secret token using timing-safe comparison.
 *
 * @throws {Error} On missing or invalid token.
 */
export function verifyGitLabToken(token: string, secret: string): void {
  if (!token) {
    throw new Error('Missing GitLab webhook token');
  }

  const tokenBuffer = Buffer.from(token);
  const secretBuffer = Buffer.from(secret);

  if (
    tokenBuffer.length !== secretBuffer.length ||
    !timingSafeEqual(tokenBuffer, secretBuffer)
  ) {
    throw new Error('Invalid GitLab webhook token');
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractRepoFullName(
  payload: Record<string, unknown>,
  repoKey: string,
  nameKey: string,
): string {
  const repo = payload[repoKey] as Record<string, unknown> | undefined;
  return (repo?.[nameKey] as string) ?? 'unknown/unknown';
}

function extractGitLabRepo(payload: Record<string, unknown>): string {
  const project = payload.project as Record<string, unknown> | undefined;
  return (project?.path_with_namespace as string) ?? 'unknown/unknown';
}
