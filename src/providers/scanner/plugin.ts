/**
 * Scanner registry and custom scanner plugin API (ASEC-108).
 *
 * Provides a mutable registry of scanner factories (pre-loaded with all
 * built-in scanners) and utilities for loading user-defined scanners
 * from config — either as ESM modules or as CLI command wrappers.
 */

import type {
  CommandScannerDef,
  RawFinding,
  ScannerAdapter,
  ScannerAdapterConfig,
  ScanResult,
  ScanTarget,
  SecurityScanner,
} from './types.js';
import {parseSarifOutput} from './semgrep.js';
import {isBinaryAvailable, runCommand} from './utils.js';
import {createSemgrepScanner} from './semgrep.js';
import {createTrivyScanner} from './trivy.js';
import {createNpmAuditScanner} from './npm-audit.js';
import {createGitleaksScanner} from './gitleaks.js';
import {createCodeqlScanner} from './codeql.js';
import {createPipAuditScanner} from './pip-audit.js';
import {createBanditScanner} from './bandit.js';
import {createGosecScanner} from './gosec.js';
import {createCargoAuditScanner} from './cargo-audit.js';
import {createZapScanner} from './zap.js';
import {logger} from '../../utils/logger.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Factory function that creates a SecurityScanner instance. */
export type ScannerFactory = (config?: ScannerAdapterConfig) => SecurityScanner;

/** Registry of named scanner factories. */
export interface ScannerRegistry {
  /** Register a scanner factory by name. */
  register(name: string, factory: ScannerFactory): void;

  /** Retrieve a factory by name, or undefined if not found. */
  get(name: string): ScannerFactory | undefined;

  /** Check whether a scanner is registered. */
  has(name: string): boolean;

  /** Return all registered scanner names. */
  allNames(): string[];
}

// ---------------------------------------------------------------------------
// Registry implementation
// ---------------------------------------------------------------------------

/** Creates a new, empty scanner registry. */
export function createScannerRegistry(): ScannerRegistry {
  const factories = new Map<string, ScannerFactory>();

  return {
    register(name: string, factory: ScannerFactory): void {
      if (factories.has(name)) {
        logger.warn(`Scanner "${name}" is already registered — overwriting`);
      }
      factories.set(name, factory);
    },

    get(name: string): ScannerFactory | undefined {
      return factories.get(name);
    },

    has(name: string): boolean {
      return factories.has(name);
    },

    allNames(): string[] {
      return [...factories.keys()];
    },
  };
}

// ---------------------------------------------------------------------------
// Default registry (pre-loaded with built-in scanners)
// ---------------------------------------------------------------------------

function buildDefaultRegistry(): ScannerRegistry {
  const registry = createScannerRegistry();
  registry.register('semgrep', createSemgrepScanner);
  registry.register('trivy', () => createTrivyScanner());
  registry.register('npm-audit', createNpmAuditScanner);
  registry.register('gitleaks', createGitleaksScanner);
  registry.register('codeql', () => createCodeqlScanner());
  registry.register('pip-audit', createPipAuditScanner);
  registry.register('bandit', createBanditScanner);
  registry.register('gosec', createGosecScanner);
  registry.register('cargo-audit', createCargoAuditScanner);
  registry.register('zap', createZapScanner);
  return registry;
}

/** Singleton registry with all built-in scanners pre-registered. */
export const defaultRegistry: ScannerRegistry = buildDefaultRegistry();

// ---------------------------------------------------------------------------
// Command-based custom scanner
// ---------------------------------------------------------------------------

const DEFAULT_CMD_TIMEOUT_MS = 120_000;

/**
 * Wraps an arbitrary CLI tool as a `ScannerAdapter`.
 *
 * The tool is invoked with the configured args (appending the target root
 * directory) and its stdout is parsed as either SARIF or a flat JSON array
 * of {@link RawFinding} objects.
 */
export function createCommandScanner(def: CommandScannerDef): ScannerAdapter {
  const timeout = def.timeout ?? DEFAULT_CMD_TIMEOUT_MS;

  return {
    name: def.name,
    category: def.category,

    async isAvailable(): Promise<boolean> {
      return isBinaryAvailable(def.command);
    },

    async scan(target: ScanTarget): Promise<ScanResult> {
      const start = Date.now();
      try {
        const args = [...(def.args ?? []), target.rootDir];
        const result = await runCommand(def.command, args, {
          cwd: target.rootDir,
          timeout,
        });

        let findings: RawFinding[];
        if (def.outputFormat === 'sarif') {
          findings = parseSarifOutput(result.stdout || '{"runs":[]}');
        } else {
          findings = JSON.parse(result.stdout || '[]') as RawFinding[];
        }

        return {
          scanner: def.name,
          category: def.category,
          findings,
          duration: Date.now() - start,
        };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          scanner: def.name,
          category: def.category,
          findings: [],
          duration: Date.now() - start,
          error: message,
        };
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Module-based plugin loading
// ---------------------------------------------------------------------------

/**
 * Dynamically imports an ESM module and expects it to export a
 * `createScanner` factory function.
 *
 * @param modulePath Absolute path or resolvable module specifier.
 * @returns The factory function, or undefined on failure.
 */
export async function loadPluginScanner(
  modulePath: string,
): Promise<ScannerFactory | undefined> {
  try {
    const mod = (await import(modulePath)) as Record<string, unknown>;
    if (typeof mod.createScanner !== 'function') {
      logger.error(
        `Plugin "${modulePath}" does not export a createScanner function`,
      );
      return undefined;
    }
    return mod.createScanner as ScannerFactory;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Failed to load scanner plugin "${modulePath}": ${message}`);
    return undefined;
  }
}
