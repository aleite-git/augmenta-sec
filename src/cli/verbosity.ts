/**
 * Verbosity-aware logging for CLI commands.
 *
 * Provides a `createLogger` factory that returns a logger respecting
 * `--verbose` / `--quiet` flags:
 *   - quiet:   only errors are printed
 *   - normal:  info, warn, error (default)
 *   - verbose: debug, info, warn, error
 */

import chalk from 'chalk';
import {formatError} from '../errors/handler.js';

export type Verbosity = 'quiet' | 'normal' | 'verbose';

export interface VerboseLogger {
  debug(msg: string): void;
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
  errorDetail(error: unknown): void;
  success(msg: string): void;
  header(msg: string): void;
  detail(label: string, value: string): void;
  badge(present: boolean, label: string, detail?: string): void;
}

/** Creates a logger that filters output based on verbosity level. */
export function createLogger(verbosity: Verbosity): VerboseLogger {
  const noop = (): void => {};

  const debug =
    verbosity === 'verbose'
      ? (msg: string): void => {
          console.log(chalk.gray('.'), msg);
        }
      : noop;

  const info =
    verbosity !== 'quiet'
      ? (msg: string): void => {
          console.log(chalk.blue('i'), msg);
        }
      : noop;

  const warn =
    verbosity !== 'quiet'
      ? (msg: string): void => {
          console.log(chalk.yellow('!'), msg);
        }
      : noop;

  const error = (msg: string): void => {
    console.error(chalk.red('x'), msg);
  };

  const errorDetail = (err: unknown): void => {
    console.error(chalk.red('x'), formatError(err));
  };

  const success =
    verbosity !== 'quiet'
      ? (msg: string): void => {
          console.log(chalk.green('+'), msg);
        }
      : noop;

  const header =
    verbosity !== 'quiet'
      ? (msg: string): void => {
          console.log();
          console.log(chalk.bold.cyan(msg));
          console.log(chalk.gray('\u2500'.repeat(60)));
        }
      : noop;

  const detail =
    verbosity !== 'quiet'
      ? (label: string, value: string): void => {
          console.log(`  ${chalk.gray(label.padEnd(18))} ${value}`);
        }
      : noop;

  const badge =
    verbosity !== 'quiet'
      ? (present: boolean, label: string, detailText?: string): void => {
          const icon = present ? chalk.green('[+]') : chalk.red('[-]');
          const suffix = detailText ? chalk.gray(` ${detailText}`) : '';
          console.log(`  ${icon} ${label}${suffix}`);
        }
      : noop;

  return {debug, info, warn, error, errorDetail, success, header, detail, badge};
}
