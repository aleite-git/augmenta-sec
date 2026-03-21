/**
 * Scanner plugin system — dynamic loading and registry.
 *
 * Allows third-party scanners to be loaded at runtime from external files
 * and managed via a central registry alongside built-in scanners.
 */

import {pathToFileURL} from 'node:url';
import {access} from 'node:fs/promises';
import {constants} from 'node:fs';
import type {SecurityScanner, ScannerCategory} from './types.js';

/** Metadata that a plugin must expose beyond the base SecurityScanner. */
export interface PluginMetadata {
  /** Human-readable version string (semver recommended). */
  version: string;
  /** Brief description of what this plugin scans for. */
  description: string;
  /** Author or organization name. */
  author?: string;
}

/** A scanner plugin is a SecurityScanner with additional metadata. */
export interface ScannerPlugin extends SecurityScanner {
  metadata: PluginMetadata;
}

/**
 * The shape a plugin file must default-export (or named-export as `plugin`).
 * It can be a ScannerPlugin directly or a factory function returning one.
 */
type PluginExport = ScannerPlugin | (() => ScannerPlugin);

/** Validate that a value satisfies the ScannerPlugin interface. */
function isScannerPlugin(value: unknown): value is ScannerPlugin {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.name === 'string' &&
    typeof obj.category === 'string' &&
    typeof obj.isAvailable === 'function' &&
    typeof obj.scan === 'function' &&
    typeof obj.metadata === 'object' &&
    obj.metadata !== null &&
    typeof (obj.metadata as Record<string, unknown>).version === 'string' &&
    typeof (obj.metadata as Record<string, unknown>).description === 'string'
  );
}

/**
 * Load a scanner plugin from a file path.
 *
 * The file must be an ES module that either:
 * - default-exports a ScannerPlugin object
 * - default-exports a factory function returning a ScannerPlugin
 * - named-exports `plugin` as a ScannerPlugin or factory
 *
 * @param filePath - Absolute or relative path to the plugin .js/.ts file
 * @param importFn - Optional import override for testing
 * @returns The loaded ScannerPlugin
 * @throws Error if file not found, export missing, or validation fails
 */
export async function loadPluginFromFile(
  filePath: string,
  importFn?: (specifier: string) => Promise<Record<string, unknown>>,
): Promise<ScannerPlugin> {
  // Verify the file exists before attempting import
  try {
    await access(filePath, constants.R_OK);
  } catch {
    throw new Error(`Plugin file not found: ${filePath}`);
  }

  const fileUrl = pathToFileURL(filePath).href;
  const doImport = importFn ?? ((spec: string) => import(spec));
  const mod = await doImport(fileUrl);

  // Try default export, then named `plugin` export
  const candidate: unknown = mod.default ?? mod.plugin;

  if (candidate === undefined) {
    throw new Error(
      `Plugin file does not export a default or named 'plugin' export: ${filePath}`,
    );
  }

  // Resolve factory functions
  let resolved: unknown;
  if (typeof candidate === 'function' && !isScannerPlugin(candidate)) {
    resolved = (candidate as () => unknown)();
  } else {
    resolved = candidate;
  }

  if (!isScannerPlugin(resolved)) {
    throw new Error(
      `Plugin export does not satisfy the ScannerPlugin interface: ${filePath}`,
    );
  }

  return resolved;
}

/** Registry for managing scanner instances (built-in and plugin). */
export interface ScannerRegistry {
  /** Register a scanner. Throws if a scanner with the same name exists. */
  register(scanner: SecurityScanner): void;

  /** Remove a scanner by name. Returns true if found and removed. */
  unregister(name: string): boolean;

  /** Get all registered scanners. */
  getAll(): SecurityScanner[];

  /** Find a scanner by exact name, or undefined if not found. */
  getByName(name: string): SecurityScanner | undefined;

  /** Get all scanners matching a category. */
  getByCategory(category: ScannerCategory): SecurityScanner[];
}

/**
 * Create a ScannerRegistry pre-populated with built-in scanners.
 *
 * @param builtins - Array of built-in scanners to register initially
 */
export function createScannerRegistry(
  builtins: SecurityScanner[] = [],
): ScannerRegistry {
  const scanners = new Map<string, SecurityScanner>();

  // Register built-ins
  for (const scanner of builtins) {
    scanners.set(scanner.name, scanner);
  }

  return {
    register(scanner: SecurityScanner): void {
      if (scanners.has(scanner.name)) {
        throw new Error(
          `Scanner '${scanner.name}' is already registered`,
        );
      }
      scanners.set(scanner.name, scanner);
    },

    unregister(name: string): boolean {
      return scanners.delete(name);
    },

    getAll(): SecurityScanner[] {
      return Array.from(scanners.values());
    },

    getByName(name: string): SecurityScanner | undefined {
      return scanners.get(name);
    },

    getByCategory(category: ScannerCategory): SecurityScanner[] {
      return Array.from(scanners.values()).filter(
        s => s.category === category,
      );
    },
  };
}
