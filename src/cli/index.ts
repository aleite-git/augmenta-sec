import {Command} from 'commander';
import {initCommand} from './commands/init.js';
import {scanCommand} from './commands/scan.js';
import {reviewCommand} from './commands/review.js';

export function createCli(): Command {
  const program = new Command();

  program
    .name('augmenta-sec')
    .description('AI-powered security engineer that onboards to any codebase')
    .version('0.1.0');

  program
    .command('init')
    .description('Discover and profile the security posture of a codebase')
    .argument('[path]', 'target directory (defaults to current directory)')
    .action(async (path?: string) => {
      await initCommand(path);
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
    .option('--all', 'review all open PRs on the repository')
    .action(async (pr?: string, options?: {all?: boolean}) => {
      await reviewCommand(pr, {all: options?.all});
    });

  return program;
}
