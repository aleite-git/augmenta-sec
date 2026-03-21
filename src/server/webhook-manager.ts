/**
 * Webhook subscription manager for outbound notifications.
 *
 * Manages webhook registrations, dispatches events with retry logic,
 * and supports exponential backoff.
 *
 * @module ASEC-083
 */

import {randomUUID} from 'node:crypto';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type WebhookEvent =
  | 'scan.completed'
  | 'scan.failed'
  | 'finding.critical';

export interface WebhookSubscription {
  id: string;
  url: string;
  events: WebhookEvent[];
  createdAt: string;
}

export interface WebhookDelivery {
  id: string;
  subscriptionId: string;
  event: WebhookEvent;
  status: 'pending' | 'delivered' | 'failed';
  attempts: number;
  lastAttemptAt?: string;
  error?: string;
}

export interface WebhookPayload {
  event: WebhookEvent;
  timestamp: string;
  data: unknown;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface WebhookManagerConfig {
  /** Maximum number of retry attempts (default: 3). */
  maxRetries?: number;
  /** Base delay in ms for exponential backoff (default: 1000). */
  baseDelayMs?: number;
  /** Request timeout in ms (default: 10000). */
  timeoutMs?: number;
}

// ---------------------------------------------------------------------------
// WebhookManager
// ---------------------------------------------------------------------------

export interface WebhookManager {
  /** Registers a webhook subscription. */
  register(url: string, events: WebhookEvent[]): WebhookSubscription;

  /** Removes a webhook subscription by ID. Returns true if found. */
  unregister(id: string): boolean;

  /** Lists all registered subscriptions. */
  list(): WebhookSubscription[];

  /** Dispatches an event to all matching subscriptions. */
  notify(event: WebhookEvent, data: unknown): Promise<WebhookDelivery[]>;

  /** Returns delivery history. */
  deliveries(): WebhookDelivery[];

  /** Clears all subscriptions and delivery history. */
  clear(): void;
}

/**
 * Creates a new {@link WebhookManager} instance.
 *
 * @param config Optional configuration overrides.
 * @param fetchFn Optional fetch implementation (for testing).
 * @returns A {@link WebhookManager}.
 */
export function createWebhookManager(
  config: WebhookManagerConfig = {},
  fetchFn?: typeof globalThis.fetch,
): WebhookManager {
  const maxRetries = config.maxRetries ?? 3;
  const baseDelayMs = config.baseDelayMs ?? 1000;
  const timeoutMs = config.timeoutMs ?? 10_000;
  const doFetch = fetchFn ?? globalThis.fetch;

  const subscriptions = new Map<string, WebhookSubscription>();
  const deliveryLog: WebhookDelivery[] = [];

  async function deliver(
    subscription: WebhookSubscription,
    event: WebhookEvent,
    data: unknown,
  ): Promise<WebhookDelivery> {
    const delivery: WebhookDelivery = {
      id: randomUUID(),
      subscriptionId: subscription.id,
      event,
      status: 'pending',
      attempts: 0,
    };

    const payload: WebhookPayload = {
      event,
      timestamp: new Date().toISOString(),
      data,
    };

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      delivery.attempts = attempt + 1;
      delivery.lastAttemptAt = new Date().toISOString();

      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);

        const response = await doFetch(subscription.url, {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        clearTimeout(timer);

        if (response.ok) {
          delivery.status = 'delivered';
          deliveryLog.push(delivery);
          return delivery;
        }

        delivery.error = `HTTP ${response.status}`;
      } catch (err: unknown) {
        delivery.error =
          err instanceof Error ? err.message : 'Unknown error';
      }

      // Exponential backoff before retry (skip delay after last attempt).
      if (attempt < maxRetries) {
        const delay = baseDelayMs * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    delivery.status = 'failed';
    deliveryLog.push(delivery);
    return delivery;
  }

  return {
    register(url: string, events: WebhookEvent[]): WebhookSubscription {
      const subscription: WebhookSubscription = {
        id: randomUUID(),
        url,
        events: [...events],
        createdAt: new Date().toISOString(),
      };
      subscriptions.set(subscription.id, subscription);
      return subscription;
    },

    unregister(id: string): boolean {
      return subscriptions.delete(id);
    },

    list(): WebhookSubscription[] {
      return [...subscriptions.values()];
    },

    async notify(
      event: WebhookEvent,
      data: unknown,
    ): Promise<WebhookDelivery[]> {
      const matching = [...subscriptions.values()].filter((sub) =>
        sub.events.includes(event),
      );

      const results = await Promise.all(
        matching.map((sub) => deliver(sub, event, data)),
      );

      return results;
    },

    deliveries(): WebhookDelivery[] {
      return [...deliveryLog];
    },

    clear(): void {
      subscriptions.clear();
      deliveryLog.length = 0;
    },
  };
}
