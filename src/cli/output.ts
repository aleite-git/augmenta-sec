/**
 * Output formatting for CLI commands.
 *
 * Supports `--format json|yaml|text` for machine-readable output.
 * Text mode uses chalk for human-friendly colored output.
 */

import chalk from 'chalk';
import YAML from 'yaml';

/** Formatter that converts arbitrary data to a string representation. */
export interface OutputFormatter {
  format(data: unknown): string;
}

export type OutputFormat = 'json' | 'yaml' | 'text';

/** Creates the appropriate formatter for the given output format. */
export function createFormatter(format: OutputFormat): OutputFormatter {
  switch (format) {
    case 'json':
      return new JsonFormatter();
    case 'yaml':
      return new YamlFormatter();
    case 'text':
      return new TextFormatter();
  }
}

class JsonFormatter implements OutputFormatter {
  format(data: unknown): string {
    return JSON.stringify(data, null, 2);
  }
}

class YamlFormatter implements OutputFormatter {
  format(data: unknown): string {
    return YAML.stringify(data, {
      indent: 2,
      lineWidth: 100,
      defaultStringType: 'PLAIN',
      defaultKeyType: 'PLAIN',
    });
  }
}

class TextFormatter implements OutputFormatter {
  format(data: unknown): string {
    return formatValue(data, 0);
  }
}

/**
 * Recursively formats a value into a human-readable string.
 * Objects render as labeled sections; arrays as bullet lists.
 */
function formatValue(value: unknown, depth: number): string {
  if (value === null || value === undefined) {
    return chalk.gray('(none)');
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return chalk.gray('(empty)');
    }
    return value
      .map(item => {
        const formatted = formatValue(item, depth + 1);
        return `${'  '.repeat(depth)}- ${formatted}`;
      })
      .join('\n');
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) {
      return chalk.gray('(empty)');
    }
    return entries
      .map(([key, val]) => {
        const label = chalk.bold(key);
        if (typeof val === 'object' && val !== null) {
          const nested = formatValue(val, depth + 1);
          return `${'  '.repeat(depth)}${label}:\n${nested}`;
        }
        return `${'  '.repeat(depth)}${label}: ${formatValue(val, depth + 1)}`;
      })
      .join('\n');
  }

  return String(value);
}
