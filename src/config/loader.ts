/**
 * Configuration loader for AugmentaSec.
 *
 * Loads, parses, validates, and merges configuration from:
 *   1. Built-in defaults (`DEFAULT_CONFIG`)
 *   2. Global user config (`~/.augmenta-sec/config.yaml`)
 *   3. Project-level config (`<rootDir>/.augmenta-sec/config.yaml`)
 *
 * Priority: project > global > defaults.
 */

import {readFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join} from 'node:path';

import {parse as parseYaml} from 'yaml';
import {ZodError} from 'zod';

import {DEFAULT_CONFIG} from './defaults.js';
import {type AugmentaSecConfig, type RawConfig, configSchema} from './schema.js';

/** Name of the config directory inside a project or home directory. */
const CONFIG_DIR = '.augmenta-sec';

/** Name of the config file within the config directory. */
const CONFIG_FILE = 'config.yaml';

/**
 * Reads and parses a YAML config file.
 *
 * @returns The parsed object, or `null` if the file does not exist.
 * @throws If the file exists but contains invalid YAML.
 */
async function readConfigFile(
  filePath: string,
): Promise<Record<string, unknown> | null> {
  let raw: string;
  try {
    raw = await readFile(filePath, 'utf-8');
  } catch (err: unknown) {
    // File not found — perfectly fine, return null so the caller
    // falls back to defaults.
    if (isNodeError(err) && err.code === 'ENOENT') {
      return null;
    }
    throw err;
  }

  const parsed: unknown = parseYaml(raw);

  // An empty YAML file parses to `null` or `undefined`.
  if (parsed == null) {
    return {};
  }

  if (typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(
      `Invalid config at ${filePath}: expected an object, got ${typeof parsed}`,
    );
  }

  return parsed as Record<string, unknown>;
}

/** Type guard for Node.js system errors that have a `code` property. */
function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && 'code' in err;
}

/**
 * Validates raw config data against the Zod schema.
 *
 * @throws A descriptive error if validation fails.
 */
function validateConfig(
  data: Record<string, unknown>,
  source: string,
): RawConfig {
  try {
    return configSchema.parse(data);
  } catch (err: unknown) {
    if (err instanceof ZodError) {
      const issues = err.issues
        .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
        .join('\n');
      throw new Error(
        `Invalid configuration in ${source}:\n${issues}`,
      );
    }
    throw err;
  }
}

/**
 * Deep-merges two config objects. Values from `override` take precedence.
 * Arrays are replaced wholesale (not concatenated).
 */
function deepMerge<T extends Record<string, unknown>>(
  base: T,
  override: Partial<T>,
): T {
  const result = {...base};

  for (const key of Object.keys(override) as Array<keyof T>) {
    const overrideVal = override[key];
    if (overrideVal === undefined) {
      continue;
    }

    const baseVal = base[key];

    if (
      typeof baseVal === 'object' &&
      baseVal !== null &&
      !Array.isArray(baseVal) &&
      typeof overrideVal === 'object' &&
      overrideVal !== null &&
      !Array.isArray(overrideVal)
    ) {
      result[key] = deepMerge(
        baseVal as Record<string, unknown>,
        overrideVal as Record<string, unknown>,
      ) as T[keyof T];
    } else {
      result[key] = overrideVal as T[keyof T];
    }
  }

  return result;
}

/**
 * Loads a configuration file from the given directory.
 *
 * @param baseDir - Directory containing the `.augmenta-sec/config.yaml` file.
 * @returns The validated (but un-merged) config, or an empty object
 *   if the file does not exist.
 */
async function loadConfigFrom(baseDir: string): Promise<RawConfig> {
  const filePath = join(baseDir, CONFIG_DIR, CONFIG_FILE);
  const data = await readConfigFile(filePath);

  if (data === null) {
    return {};
  }

  return validateConfig(data, filePath);
}

/**
 * Loads the project-level configuration from
 * `<rootDir>/.augmenta-sec/config.yaml`.
 *
 * @returns The validated (but un-merged) config, or an empty object
 *   if the file does not exist.
 */
export async function loadProjectConfig(
  rootDir: string,
): Promise<RawConfig> {
  return loadConfigFrom(rootDir);
}

/**
 * Loads the global user-level configuration from
 * `~/.augmenta-sec/config.yaml`.
 *
 * @param homeDir - Override the home directory (useful for testing).
 * @returns The validated (but un-merged) config, or an empty object
 *   if the file does not exist.
 */
export async function loadGlobalConfig(
  homeDir?: string,
): Promise<RawConfig> {
  return loadConfigFrom(homeDir ?? homedir());
}

/**
 * Resolves the final configuration by merging (in priority order):
 *   defaults < global config < project config
 *
 * @param rootDir - The project root directory.
 * @param homeDir - Override the home directory (useful for testing).
 * @returns A fully-resolved, validated `AugmentaSecConfig`.
 */
export async function resolveConfig(
  rootDir: string,
  homeDir?: string,
): Promise<AugmentaSecConfig> {
  const [globalCfg, projectCfg] = await Promise.all([
    loadGlobalConfig(homeDir),
    loadProjectConfig(rootDir),
  ]);

  // Merge: defaults <- global <- project
  const merged = deepMerge(
    deepMerge(
      DEFAULT_CONFIG as unknown as Record<string, unknown>,
      globalCfg as Record<string, unknown>,
    ),
    projectCfg as Record<string, unknown>,
  );

  return merged as unknown as AugmentaSecConfig;
}
