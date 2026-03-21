import {describe, expect, it, vi} from 'vitest';
import {
  createWebhookManager,
  type WebhookEvent,
  type WebhookPayload,
} from '../webhook-manager.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockFetch(
  statusCode: number,
  options?: {failTimes?: number},
): typeof globalThis.fetch {
  let callCount = 0;
  const failTimes = options?.failTimes ?? 0;

  return vi.fn(async () => {
    callCount++;
    if (callCount <= failTimes) {
      throw new Error('Connection refused');
    }
    return new Response(JSON.stringify({ok: true}), {
      status: statusCode,
      headers: {'Content-Type': 'application/json'},
    });
  }) as unknown as typeof globalThis.fetch;
}

function successFetch(): typeof globalThis.fetch {
  return vi.fn(async () => {
    return new Response(JSON.stringify({ok: true}), {
      status: 200,
      headers: {'Content-Type': 'application/json'},
    });
  }) as unknown as typeof globalThis.fetch;
}

function failFetch(): typeof globalThis.fetch {
  return vi.fn(async () => {
    throw new Error('Network error');
  }) as unknown as typeof globalThis.fetch;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WebhookManager', () => {
  describe('register', () => {
    it('registers a webhook subscription', () => {
      const manager = createWebhookManager({}, successFetch());
      const sub = manager.register('https://example.com/hook', [
        'scan.completed',
      ]);

      expect(sub.id).toBeTruthy();
      expect(sub.url).toBe('https://example.com/hook');
      expect(sub.events).toEqual(['scan.completed']);
      expect(sub.createdAt).toBeTruthy();
    });

    it('generates unique IDs for subscriptions', () => {
      const manager = createWebhookManager({}, successFetch());
      const sub1 = manager.register('https://a.com/hook', ['scan.completed']);
      const sub2 = manager.register('https://b.com/hook', ['scan.failed']);
      expect(sub1.id).not.toBe(sub2.id);
    });
  });

  describe('unregister', () => {
    it('removes a subscription', () => {
      const manager = createWebhookManager({}, successFetch());
      const sub = manager.register('https://example.com/hook', [
        'scan.completed',
      ]);

      expect(manager.unregister(sub.id)).toBe(true);
      expect(manager.list()).toHaveLength(0);
    });

    it('returns false for unknown id', () => {
      const manager = createWebhookManager({}, successFetch());
      expect(manager.unregister('nonexistent')).toBe(false);
    });
  });

  describe('list', () => {
    it('returns all subscriptions', () => {
      const manager = createWebhookManager({}, successFetch());
      manager.register('https://a.com/hook', ['scan.completed']);
      manager.register('https://b.com/hook', ['scan.failed']);

      expect(manager.list()).toHaveLength(2);
    });
  });

  describe('notify', () => {
    it('delivers to matching subscriptions', async () => {
      const fetchFn = successFetch();
      const manager = createWebhookManager(
        {maxRetries: 0, baseDelayMs: 1},
        fetchFn,
      );
      manager.register('https://a.com/hook', ['scan.completed']);
      manager.register('https://b.com/hook', ['scan.failed']);

      const deliveries = await manager.notify('scan.completed', {
        scanId: '123',
      });

      expect(deliveries).toHaveLength(1);
      expect(deliveries[0].status).toBe('delivered');
      expect(deliveries[0].event).toBe('scan.completed');
      expect(fetchFn).toHaveBeenCalledTimes(1);
    });

    it('delivers to all matching subscriptions', async () => {
      const fetchFn = successFetch();
      const manager = createWebhookManager(
        {maxRetries: 0, baseDelayMs: 1},
        fetchFn,
      );
      manager.register('https://a.com/hook', ['scan.completed']);
      manager.register('https://b.com/hook', ['scan.completed']);

      const deliveries = await manager.notify('scan.completed', {});
      expect(deliveries).toHaveLength(2);
      expect(deliveries.every((d) => d.status === 'delivered')).toBe(true);
    });

    it('returns empty array when no subscriptions match', async () => {
      const manager = createWebhookManager(
        {maxRetries: 0, baseDelayMs: 1},
        successFetch(),
      );
      manager.register('https://a.com/hook', ['scan.completed']);

      const deliveries = await manager.notify('scan.failed', {});
      expect(deliveries).toHaveLength(0);
    });

    it('sends correct payload format', async () => {
      let capturedBody: string | undefined;
      const fetchFn = vi.fn(async (_url: string, init?: RequestInit) => {
        capturedBody = init?.body as string;
        return new Response('{}', {status: 200});
      }) as unknown as typeof globalThis.fetch;

      const manager = createWebhookManager(
        {maxRetries: 0, baseDelayMs: 1},
        fetchFn,
      );
      manager.register('https://example.com/hook', ['scan.completed']);

      await manager.notify('scan.completed', {scanId: 'test-123'});

      expect(capturedBody).toBeTruthy();
      const payload = JSON.parse(capturedBody!) as WebhookPayload;
      expect(payload.event).toBe('scan.completed');
      expect(payload.timestamp).toBeTruthy();
      expect(payload.data).toEqual({scanId: 'test-123'});
    });
  });

  describe('retry logic', () => {
    it('retries on failure with exponential backoff', async () => {
      // Fail twice, then succeed on third attempt.
      const fetchFn = mockFetch(200, {failTimes: 2});

      const manager = createWebhookManager(
        {maxRetries: 3, baseDelayMs: 1},
        fetchFn,
      );
      manager.register('https://example.com/hook', ['scan.completed']);

      const deliveries = await manager.notify('scan.completed', {});
      expect(deliveries).toHaveLength(1);
      expect(deliveries[0].status).toBe('delivered');
      expect(deliveries[0].attempts).toBe(3);
      expect(fetchFn).toHaveBeenCalledTimes(3);
    });

    it('marks as failed after all retries exhausted', async () => {
      const fetchFn = failFetch();
      const manager = createWebhookManager(
        {maxRetries: 2, baseDelayMs: 1},
        fetchFn,
      );
      manager.register('https://example.com/hook', ['scan.completed']);

      const deliveries = await manager.notify('scan.completed', {});
      expect(deliveries).toHaveLength(1);
      expect(deliveries[0].status).toBe('failed');
      expect(deliveries[0].attempts).toBe(3); // 1 initial + 2 retries
      expect(deliveries[0].error).toBeDefined();
    });

    it('marks as failed on non-200 HTTP response after retries', async () => {
      const fetchFn = mockFetch(500, {failTimes: 0});
      // Override to always return 500.
      const alwaysFail = vi.fn(async () => {
        return new Response('Internal Server Error', {status: 500});
      }) as unknown as typeof globalThis.fetch;

      const manager = createWebhookManager(
        {maxRetries: 1, baseDelayMs: 1},
        alwaysFail,
      );
      manager.register('https://example.com/hook', ['scan.completed']);

      const deliveries = await manager.notify('scan.completed', {});
      expect(deliveries).toHaveLength(1);
      expect(deliveries[0].status).toBe('failed');
      expect(deliveries[0].error).toContain('500');
    });
  });

  describe('deliveries', () => {
    it('tracks delivery history', async () => {
      const manager = createWebhookManager(
        {maxRetries: 0, baseDelayMs: 1},
        successFetch(),
      );
      manager.register('https://a.com/hook', ['scan.completed']);

      await manager.notify('scan.completed', {});
      await manager.notify('scan.completed', {});

      expect(manager.deliveries()).toHaveLength(2);
    });
  });

  describe('clear', () => {
    it('clears subscriptions and delivery history', async () => {
      const manager = createWebhookManager(
        {maxRetries: 0, baseDelayMs: 1},
        successFetch(),
      );
      manager.register('https://a.com/hook', ['scan.completed']);
      await manager.notify('scan.completed', {});

      manager.clear();
      expect(manager.list()).toHaveLength(0);
      expect(manager.deliveries()).toHaveLength(0);
    });
  });

  describe('finding.critical event', () => {
    it('delivers finding.critical events', async () => {
      const fetchFn = successFetch();
      const manager = createWebhookManager(
        {maxRetries: 0, baseDelayMs: 1},
        fetchFn,
      );
      manager.register('https://alerts.example.com/hook', [
        'finding.critical',
      ]);

      const deliveries = await manager.notify('finding.critical', {
        findingId: 'f-1',
        severity: 'critical',
        title: 'SQL Injection found',
      });

      expect(deliveries).toHaveLength(1);
      expect(deliveries[0].status).toBe('delivered');
    });
  });
});
