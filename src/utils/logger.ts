import chalk from 'chalk';
import {formatError} from '../errors/handler.js';

export const logger = {
  info(msg: string) {
    console.log(chalk.blue('i'), msg);
  },

  success(msg: string) {
    console.log(chalk.green('+'), msg);
  },

  warn(msg: string) {
    console.log(chalk.yellow('!'), msg);
  },

  error(msg: string) {
    console.error(chalk.red('x'), msg);
  },

  /** Log a structured error with user-friendly formatting. */
  errorDetail(error: unknown) {
    console.error(chalk.red('x'), formatError(error));
  },

  debug(msg: string) {
    if (process.env.ASEC_DEBUG) {
      console.log(chalk.gray('.'), msg);
    }
  },

  header(msg: string) {
    console.log();
    console.log(chalk.bold.cyan(msg));
    console.log(chalk.gray('─'.repeat(60)));
  },

  detail(label: string, value: string) {
    console.log(`  ${chalk.gray(label.padEnd(18))} ${value}`);
  },

  badge(present: boolean, label: string, detail?: string) {
    const icon = present ? chalk.green('[+]') : chalk.red('[-]');
    const suffix = detail ? chalk.gray(` ${detail}`) : '';
    console.log(`  ${icon} ${label}${suffix}`);
  },
};
