/**
 * Multi-repo management module (ASEC-087).
 *
 * Manages multiple repositories for aggregate scanning and findings.
 */

import {access} from 'node:fs/promises';
import {basename, resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import type {Finding} from '../findings/types.js';
import {summarizeFindings} from '../findings/types.js';
import type {FindingsSummary} from '../findings/types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RepoConfig {
  /** Unique identifier for the repo entry. */
  id: string;
  /** Human-readable name (defaults to directory basename). */
  name: string;
  /** Absolute path to the repository root. */
  rootDir: string;
  /** When this repo was added. */
  addedAt: string;
  /** Tags for grouping / filtering. */
  tags: string[];
}

export interface ScanResult {
  repoId: string;
  repoName: string;
  findings: Finding[];
  duration: number;
  scannedAt: string;
  error?: string;
}

export interface AggregateFindings {
  repos: Array<{
    repoId: string;
    repoName: string;
    findingsCount: number;
  }>;
  allFindings: Finding[];
  summary: FindingsSummary;
  generatedAt: string;
}

export type ScanFunction = (rootDir: string) => Promise<Finding[]>;

// ---------------------------------------------------------------------------
// MultiRepoManager
// ---------------------------------------------------------------------------

/**
 * Manages a set of repositories for coordinated security scanning.
 *
 * Provides add/remove/list operations plus aggregate scanning and
 * findings retrieval across all registered repositories.
 */
export class MultiRepoManager {
  private repos = new Map<string, RepoConfig>();
  private scanResults = new Map<string, ScanResult>();
  private scanFn: ScanFunction;

  /**
   * @param scanFn - Function invoked to scan a single repo.
   *   Defaults to a no-op that returns no findings.
   */
  constructor(scanFn?: ScanFunction) {
    this.scanFn = scanFn ?? (async () => []);
  }

  // -------------------------------------------------------------------------
  // Repo management
  // -------------------------------------------------------------------------

  /**
   * Registers a new repository.
   *
   * @param rootDir - Absolute path to the repository.
   * @param options - Optional name and tags.
   * @returns The created {@link RepoConfig}.
   * @throws If the directory does not exist or the repo is already registered.
   */
  async addRepo(
    rootDir: string,
    options: {name?: string; tags?: string[]} = {},
  ): Promise<RepoConfig> {
    const absPath = resolve(rootDir);

    // Verify directory exists
    try {
      await access(absPath);
    } catch {
      throw new Error(`Directory does not exist: ${absPath}`);
    }

    // Check for duplicate path
    for (const existing of this.repos.values()) {
      if (existing.rootDir === absPath) {
        throw new Error(`Repository already registered: ${absPath}`);
      }
    }

    const config: RepoConfig = {
      id: randomUUID(),
      name: options.name ?? basename(absPath),
      rootDir: absPath,
      addedAt: new Date().toISOString(),
      tags: options.tags ?? [],
    };

    this.repos.set(config.id, config);
    return config;
  }

  /**
   * Removes a repository by ID.
   *
   * @param repoId - The UUID of the repo to remove.
   * @returns `true` if found and removed, `false` otherwise.
   */
  removeRepo(repoId: string): boolean {
    const removed = this.repos.delete(repoId);
    if (removed) {
      this.scanResults.delete(repoId);
    }
    return removed;
  }

  /**
   * Lists all registered repositories.
   *
   * @param tags - Optional tag filter. Only repos with at least one matching tag are returned.
   * @returns Array of {@link RepoConfig} entries.
   */
  listRepos(tags?: string[]): RepoConfig[] {
    const all = Array.from(this.repos.values());
    if (!tags || tags.length === 0) return all;
    return all.filter(r => r.tags.some(t => tags.includes(t)));
  }

  /**
   * Returns a single repo by ID, or `undefined` if not found.
   */
  getRepo(repoId: string): RepoConfig | undefined {
    return this.repos.get(repoId);
  }

  // -------------------------------------------------------------------------
  // Scanning
  // -------------------------------------------------------------------------

  /**
   * Scans all registered repositories (in parallel) using the configured
   * scan function.
   *
   * @returns Array of per-repo scan results.
   */
  async scanAll(): Promise<ScanResult[]> {
    const repos = this.listRepos();
    const results = await Promise.allSettled(
      repos.map(async repo => {
        const start = performance.now();
        try {
          const findings = await this.scanFn(repo.rootDir);
          const result: ScanResult = {
            repoId: repo.id,
            repoName: repo.name,
            findings,
            duration: Math.round(performance.now() - start),
            scannedAt: new Date().toISOString(),
          };
          this.scanResults.set(repo.id, result);
          return result;
        } catch (err) {
          const result: ScanResult = {
            repoId: repo.id,
            repoName: repo.name,
            findings: [],
            duration: Math.round(performance.now() - start),
            scannedAt: new Date().toISOString(),
            error: err instanceof Error ? err.message : String(err),
          };
          this.scanResults.set(repo.id, result);
          return result;
        }
      }),
    );

    return results.map(r => {
      if (r.status === 'fulfilled') return r.value;
      // This shouldn't happen since we catch inside, but handle defensively
      return {
        repoId: 'unknown',
        repoName: 'unknown',
        findings: [],
        duration: 0,
        scannedAt: new Date().toISOString(),
        error: r.reason instanceof Error ? r.reason.message : String(r.reason),
      };
    });
  }

  // -------------------------------------------------------------------------
  // Aggregate findings
  // -------------------------------------------------------------------------

  /**
   * Returns all findings across all scanned repos, with a summary.
   */
  getAggregateFindings(): AggregateFindings {
    const repos: AggregateFindings['repos'] = [];
    const allFindings: Finding[] = [];

    for (const result of this.scanResults.values()) {
      repos.push({
        repoId: result.repoId,
        repoName: result.repoName,
        findingsCount: result.findings.length,
      });
      allFindings.push(...result.findings);
    }

    return {
      repos,
      allFindings,
      summary: summarizeFindings(allFindings),
      generatedAt: new Date().toISOString(),
    };
  }
}
