import {Command} from 'commander';
import {initCommand} from './commands/init.js';
import {scanCommand} from './commands/scan.js';
import {reviewCommand} from './commands/review.js';
import {registerConfigCommand} from './commands/config.js';
import type {OutputFormat} from './output.js';
import type {Verbosity} from './verbosity.js';

/** Shape of the global CLI options added to every command. */
export interface GlobalOptions {
  format: OutputFormat;
  verbose: boolean;
  quiet: boolean;
}

/** Derives the effective verbosity from mutually-exclusive flags. */
export function resolveVerbosity(opts: GlobalOptions): Verbosity {
  if (opts.quiet) return 'quiet';
  if (opts.verbose) return 'verbose';
  return 'normal';
}

export function createCli(): Command {
  const program = new Command();

  program
    .name('augmenta-sec')
    .description('AI-powered security engineer that onboards to any codebase')
    .version('0.1.0')
    .option('--format <format>', 'output format: json, yaml, or text', 'text')
    .option('--verbose', 'show debug information', false)
    .option('--quiet', 'suppress all output except errors', false);

  program
    .command('init')
    .description('Discover and profile the security posture of a codebase')
    .argument('[path]', 'target directory (defaults to current directory)')
    .action(async (path?: string) => {
      const opts = program.opts<GlobalOptions>();
      await initCommand(path, {
        format: opts.format as OutputFormat,
        verbosity: resolveVerbosity(opts),
      });
    });

  program
    .command('scan')
    .description('Run a full security analysis using the security profile')
    .argument('[path]', 'target directory (defaults to current directory)')
    .action(async (path?: string) => {
      await scanCommand(path);
    });

  program
    .command('review')
    .description('Review a pull request for security issues')
    .argument('[pr]', 'PR number or URL')
    .action(async (pr?: string) => {
      await reviewCommand(pr);
    });

  // Register asec config subcommands
  registerConfigCommand(program);

  return program;
}
