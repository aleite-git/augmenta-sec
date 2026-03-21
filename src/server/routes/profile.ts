/**
 * Profile API routes for the HTTP server.
 *
 * - POST /api/profile  -- run discovery on a target
 * - GET  /api/profiles -- list cached profiles
 *
 * Profiles are cached in-memory with a configurable TTL.
 *
 * @module ASEC-082
 */

import {randomUUID} from 'node:crypto';
import type {Route, RouteParams} from '../core.js';
import {jsonResponse, errorResponse} from '../core.js';
import {validateRequest, profileRequestSchema} from '../validation.js';
import type {IncomingMessage, ServerResponse} from 'node:http';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProfileSummary {
  languages: string[];
  frameworks: string[];
  hasAuth: boolean;
  hasDatabase: boolean;
  hasDocker: boolean;
  hasCI: boolean;
}

export interface ProfileRecord {
  profileId: string;
  target: string;
  profile: ProfileSummary;
  createdAt: string;
  expiresAt: string;
}

// ---------------------------------------------------------------------------
// Profile cache (in-memory with TTL)
// ---------------------------------------------------------------------------

export interface ProfileStore {
  get(id: string): ProfileRecord | undefined;
  getByTarget(target: string): ProfileRecord | undefined;
  set(record: ProfileRecord): void;
  list(): ProfileRecord[];
  /** Removes expired entries. Returns count of removed entries. */
  prune(): number;
  clear(): void;
  size(): number;
}

export interface ProfileStoreConfig {
  /** Time-to-live in milliseconds (default: 1 hour). */
  ttlMs?: number;
}

export function createProfileStore(config: ProfileStoreConfig = {}): ProfileStore {
  const ttlMs = config.ttlMs ?? 60 * 60 * 1000; // Default 1 hour
  const profiles = new Map<string, ProfileRecord>();
  const targetIndex = new Map<string, string>(); // target -> profileId

  function isExpired(record: ProfileRecord): boolean {
    return new Date(record.expiresAt).getTime() < Date.now();
  }

  return {
    get(id) {
      const record = profiles.get(id);
      if (!record) return undefined;
      if (isExpired(record)) {
        profiles.delete(id);
        targetIndex.delete(record.target);
        return undefined;
      }
      return record;
    },

    getByTarget(target) {
      const id = targetIndex.get(target);
      if (!id) return undefined;
      return this.get(id);
    },

    set(record) {
      // Remove old profile for this target if it exists.
      const existingId = targetIndex.get(record.target);
      if (existingId && existingId !== record.profileId) {
        profiles.delete(existingId);
      }
      profiles.set(record.profileId, record);
      targetIndex.set(record.target, record.profileId);
    },

    list() {
      const result: ProfileRecord[] = [];
      for (const [id, record] of profiles) {
        if (isExpired(record)) {
          profiles.delete(id);
          targetIndex.delete(record.target);
        } else {
          result.push(record);
        }
      }
      return result;
    },

    prune() {
      let removed = 0;
      for (const [id, record] of profiles) {
        if (isExpired(record)) {
          profiles.delete(id);
          targetIndex.delete(record.target);
          removed++;
        }
      }
      return removed;
    },

    clear() {
      profiles.clear();
      targetIndex.clear();
    },

    size() {
      return profiles.size;
    },
  };
}

// ---------------------------------------------------------------------------
// Simulated discovery
// ---------------------------------------------------------------------------

/**
 * Simulates a discovery run. In production this would invoke the
 * real discovery engine.
 */
function runDiscovery(target: string): ProfileSummary {
  return {
    languages: ['typescript'],
    frameworks: ['node'],
    hasAuth: false,
    hasDatabase: false,
    hasDocker: false,
    hasCI: false,
  };
}

// ---------------------------------------------------------------------------
// Route factory
// ---------------------------------------------------------------------------

/**
 * Creates the profile API routes.
 *
 * @param store Profile store instance.
 * @param ttlMs Cache TTL in milliseconds (default: 1 hour).
 * @returns Array of route definitions.
 */
export function createProfileRoutes(
  store: ProfileStore,
  ttlMs = 60 * 60 * 1000,
): Route[] {
  return [
    {
      method: 'POST',
      pattern: '/api/profile',
      handler(
        _req: IncomingMessage,
        res: ServerResponse,
        params: RouteParams,
      ): void {
        const validation = validateRequest(
          params.body,
          profileRequestSchema,
        );
        if (!validation.valid) {
          errorResponse(res, 400, validation.errors.join('; '));
          return;
        }

        const body = params.body as {target: string};

        // Return cached profile if available.
        const cached = store.getByTarget(body.target);
        if (cached) {
          jsonResponse(res, 200, {
            profileId: cached.profileId,
            profile: cached.profile,
            cached: true,
          });
          return;
        }

        const profile = runDiscovery(body.target);
        const profileId = randomUUID();
        const now = new Date();

        const record: ProfileRecord = {
          profileId,
          target: body.target,
          profile,
          createdAt: now.toISOString(),
          expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
        };

        store.set(record);

        jsonResponse(res, 200, {
          profileId,
          profile,
          cached: false,
        });
      },
    },
    {
      method: 'GET',
      pattern: '/api/profiles',
      handler(
        _req: IncomingMessage,
        res: ServerResponse,
        _params: RouteParams,
      ): void {
        const profiles = store.list();
        jsonResponse(res, 200, {
          profiles: profiles.map((p) => ({
            profileId: p.profileId,
            target: p.target,
            profile: p.profile,
            createdAt: p.createdAt,
            expiresAt: p.expiresAt,
          })),
          total: profiles.length,
        });
      },
    },
  ];
}
