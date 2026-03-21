/**
 * `asec config` command — get, set, and list global configuration.
 *
 * Examples:
 *   asec config set llm.triage gemini/gemini-2.5-flash
 *   asec config get llm.triage
 *   asec config list
 */

import {Command} from 'commander';
import chalk from 'chalk';
import {loadGlobalConfig, saveGlobalConfig} from '../../config/loader.js';
import type {RawConfig} from '../../config/schema.js';

/** Registers the `config` command and its subcommands on a parent Command. */
export function registerConfigCommand(parent: Command): void {
  const configCmd = parent
    .command('config')
    .description('Manage global AugmentaSec configuration');

  configCmd
    .command('get <key>')
    .description('Get a configuration value')
    .action(async (key: string) => {
      await configGetAction(key);
    });

  configCmd
    .command('set <key> <value>')
    .description('Set a configuration value')
    .action(async (key: string, value: string) => {
      await configSetAction(key, value);
    });

  configCmd
    .command('list')
    .description('List all configuration values')
    .action(async () => {
      await configListAction();
    });
}

/**
 * Resolves a dot-path (e.g. "llm.triage") to a value inside
 * a nested config object.
 */
function getNestedValue(
  obj: Record<string, unknown>,
  path: string,
): unknown {
  const parts = path.split('.');
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

/**
 * Sets a dot-path (e.g. "llm.triage") to a value inside a partial
 * config object, creating intermediate objects as needed.
 */
function setNestedValue(
  path: string,
  value: string,
): Partial<RawConfig> {
  const parts = path.split('.');
  const root: Record<string, unknown> = {};
  let current = root;

  for (let i = 0; i < parts.length - 1; i++) {
    const nested: Record<string, unknown> = {};
    current[parts[i]] = nested;
    current = nested;
  }

  // Attempt to parse as number/boolean, otherwise keep as string
  current[parts[parts.length - 1]] = parseValue(value);
  return root as Partial<RawConfig>;
}

/** Parses "true"/"false" to boolean, numeric strings to number. */
function parseValue(value: string): string | number | boolean {
  if (value === 'true') return true;
  if (value === 'false') return false;
  const num = Number(value);
  if (!Number.isNaN(num) && value.trim() !== '') return num;
  return value;
}

async function configGetAction(key: string): Promise<void> {
  const config = await loadGlobalConfig();
  const value = getNestedValue(config as Record<string, unknown>, key);

  if (value === undefined) {
    console.log(chalk.gray('(not set)'));
  } else if (typeof value === 'object' && value !== null) {
    console.log(JSON.stringify(value, null, 2));
  } else {
    console.log(String(value));
  }
}

async function configSetAction(key: string, value: string): Promise<void> {
  const partial = setNestedValue(key, value);
  await saveGlobalConfig(partial);
  console.log(chalk.green('+'), `${key} = ${value}`);
}

async function configListAction(): Promise<void> {
  const config = await loadGlobalConfig();
  const entries = Object.entries(config as Record<string, unknown>);

  if (entries.length === 0) {
    console.log(chalk.gray('No global configuration set.'));
    console.log(chalk.gray('Use `asec config set <key> <value>` to configure.'));
    return;
  }

  printObject(config as Record<string, unknown>, '');
}

function printObject(
  obj: Record<string, unknown>,
  prefix: string,
): void {
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      printObject(value as Record<string, unknown>, fullKey);
    } else {
      const displayValue = Array.isArray(value) ? value.join(', ') : String(value);
      console.log(`  ${chalk.cyan(fullKey)} = ${displayValue}`);
    }
  }
}
