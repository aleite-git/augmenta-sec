/**
 * Global configuration loader (ASEC-153).
 */

import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join, dirname} from 'node:path';

import {parse as parseYaml, stringify as yamlStringify} from 'yaml';

export interface GlobalConfig {
  defaultLlmProvider?: string;
  apiKeys?: Record<string, string>;
  outputFormat?: 'text' | 'json' | 'yaml';
  verbosity?: 'quiet' | 'normal' | 'verbose';
  [key: string]: unknown;
}

const CONFIG_DIR = '.augmenta-sec';
const CONFIG_FILE = 'config.yaml';

function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && 'code' in err;
}

export function getGlobalConfigPath(homeDir?: string): string {
  return join(homeDir ?? homedir(), CONFIG_DIR, CONFIG_FILE);
}

export async function loadGlobalConfig(homeDir?: string): Promise<GlobalConfig> {
  const filePath = getGlobalConfigPath(homeDir);
  let raw: string;
  try {
    raw = await readFile(filePath, 'utf-8');
  } catch (err: unknown) {
    if (isNodeError(err) && err.code === 'ENOENT') return {};
    throw err;
  }
  const parsed: unknown = parseYaml(raw);
  if (parsed == null) return {};
  if (typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Invalid global config at ${filePath}: expected an object`);
  }
  return parsed as GlobalConfig;
}

export async function saveGlobalConfig(
  config: GlobalConfig,
  homeDir?: string,
): Promise<void> {
  const filePath = getGlobalConfigPath(homeDir);
  const dir = dirname(filePath);
  await mkdir(dir, {recursive: true});
  const content = yamlStringify(config, {indent: 2, lineWidth: 120});
  await writeFile(filePath, content, 'utf-8');
}

export function mergeConfigs<T extends Record<string, unknown>>(
  global: T,
  project: Record<string, unknown>,
): T {
  const result = {...global};
  for (const key of Object.keys(project)) {
    const projectVal = project[key];
    if (projectVal === undefined) continue;
    const typedKey = key as keyof T;
    const globalVal = global[typedKey];
    if (
      typeof globalVal === 'object' &&
      globalVal !== null &&
      !Array.isArray(globalVal) &&
      typeof projectVal === 'object' &&
      projectVal !== null &&
      !Array.isArray(projectVal)
    ) {
      result[typedKey] = mergeConfigs(
        globalVal as Record<string, unknown>,
        projectVal as Record<string, unknown>,
      ) as T[keyof T];
    } else {
      result[typedKey] = projectVal as T[keyof T];
    }
  }
  return result;
}
