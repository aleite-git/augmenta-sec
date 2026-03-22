/**
 * Output formatting for CLI results (ASEC-150).
 *
 * Supports three modes:
 * - `text` (default): human-friendly with colors
 * - `json`: machine-readable, no colors
 * - `yaml`: structured, easy to read
 */

import chalk from 'chalk';
import {stringify as yamlStringify} from 'yaml';

export type OutputMode = 'text' | 'json' | 'yaml';

export interface OutputFormatter {
  /** Returns formatted string for the given data. */
  format(data: unknown): string;
  /** The active output mode. */
  readonly mode: OutputMode;
}

/**
 * Formats data as pretty-printed JSON (no colors, machine-readable).
 */
function formatJson(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

/**
 * Formats data as YAML.
 */
function formatYaml(data: unknown): string {
  return yamlStringify(data, {indent: 2, lineWidth: 120});
}

/**
 * Formats data as human-friendly text with colors.
 * Handles objects, arrays, and primitives.
 */
function formatText(data: unknown, indent = 0): string {
  const pad = ' '.repeat(indent);

  if (data === null || data === undefined) {
    return `${pad}${chalk.gray('(none)')}`;
  }

  if (typeof data === 'string' || typeof data === 'number' || typeof data === 'boolean') {
    return `${pad}${String(data)}`;
  }

  if (Array.isArray(data)) {
    if (data.length === 0) {
      return `${pad}${chalk.gray('(empty)')}`;
    }
    return data
      .map((item, i) => `${pad}${chalk.gray(`${i + 1}.`)} ${formatText(item, 0)}`)
      .join('\n');
  }

  if (typeof data === 'object') {
    const entries = Object.entries(data as Record<string, unknown>);
    if (entries.length === 0) {
      return `${pad}${chalk.gray('(empty)')}`;
    }
    const maxKeyLen = Math.max(...entries.map(([k]) => k.length));
    return entries
      .map(([key, value]) => {
        if (typeof value === 'object' && value !== null) {
          return `${pad}${chalk.bold(key)}:\n${formatText(value, indent + 2)}`;
        }
        return `${pad}${chalk.cyan(key.padEnd(maxKeyLen + 2))}${String(value)}`;
      })
      .join('\n');
  }

  return `${pad}${String(data)}`;
}

/**
 * Creates an OutputFormatter for the given mode.
 */
export function createOutputFormatter(mode: OutputMode = 'text'): OutputFormatter {
  return {
    mode,
    format(data: unknown): string {
      switch (mode) {
        case 'json':
          return formatJson(data);
        case 'yaml':
          return formatYaml(data);
        case 'text':
        default:
          return formatText(data);
      }
    },
  };
}

/**
 * Convenience function: format data in the given mode and return the string.
 */
export function formatOutput(data: unknown, mode: OutputMode = 'text'): string {
  return createOutputFormatter(mode).format(data);
}
