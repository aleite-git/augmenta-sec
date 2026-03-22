/**
 * Token bucket rate limiter for the HTTP server.
 *
 * In-memory implementation using a sliding window approach with token buckets.
 * Each client (identified by IP) gets its own bucket.
 *
 * @module ASEC-084
 */

import type {IncomingMessage, ServerResponse} from 'node:http';
import {errorResponse} from './core.js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface RateLimitConfig {
  /** Maximum number of requests allowed within the window. */
  maxRequests: number;
  /** Time window in milliseconds. */
  windowMs: number;
}

// ---------------------------------------------------------------------------
// Token bucket
// ---------------------------------------------------------------------------

interface TokenBucket {
  tokens: number;
  lastRefill: number;
}

// ---------------------------------------------------------------------------
// Rate limiter
// ---------------------------------------------------------------------------

export interface RateLimiter {
  /**
   * Checks whether the request should be allowed.
   * Returns `true` if the request is allowed, `false` if rate limited.
   * When rate limited, sends a 429 response with Retry-After header.
   */
  check(req: IncomingMessage, res: ServerResponse): boolean;

  /** Resets all tracked buckets (useful for testing). */
  reset(): void;

  /** Returns the number of tracked clients. */
  size(): number;
}

/**
 * Creates a token bucket rate limiter.
 *
 * @param config Rate limit configuration.
 * @returns A {@link RateLimiter} instance.
 */
export function createRateLimiter(config: RateLimitConfig): RateLimiter {
  const buckets = new Map<string, TokenBucket>();

  // Periodic cleanup of stale buckets to prevent memory leaks.
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      if (now - bucket.lastRefill > config.windowMs * 2) {
        buckets.delete(key);
      }
    }
  }, config.windowMs);

  // Unref so the timer does not prevent Node from exiting.
  if (typeof cleanupInterval === 'object' && 'unref' in cleanupInterval) {
    cleanupInterval.unref();
  }

  function getClientKey(req: IncomingMessage): string {
    // Use X-Forwarded-For if available, otherwise fall back to socket address.
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') {
      return forwarded.split(',')[0].trim();
    }
    return req.socket?.remoteAddress ?? 'unknown';
  }

  function refillBucket(bucket: TokenBucket, now: number): void {
    const elapsed = now - bucket.lastRefill;
    const refillRate = config.maxRequests / config.windowMs;
    const tokensToAdd = elapsed * refillRate;
    bucket.tokens = Math.min(config.maxRequests, bucket.tokens + tokensToAdd);
    bucket.lastRefill = now;
  }

  return {
    check(req: IncomingMessage, res: ServerResponse): boolean {
      const key = getClientKey(req);
      const now = Date.now();

      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = {tokens: config.maxRequests, lastRefill: now};
        buckets.set(key, bucket);
      }

      refillBucket(bucket, now);

      if (bucket.tokens >= 1) {
        bucket.tokens -= 1;
        return true;
      }

      // Rate limited -- calculate retry-after in seconds.
      const retryAfterMs = (1 - bucket.tokens) / (config.maxRequests / config.windowMs);
      const retryAfterSec = Math.ceil(retryAfterMs / 1000);

      res.setHeader('Retry-After', String(retryAfterSec));
      errorResponse(res, 429, 'Too many requests');
      return false;
    },

    reset(): void {
      buckets.clear();
    },

    size(): number {
      return buckets.size;
    },
  };
}
