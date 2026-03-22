import {Command} from 'commander';
import {initCommand} from './commands/init.js';
import {scanCommand} from './commands/scan.js';
import {reviewCommand} from './commands/review.js';
import {trendsCommand} from './commands/trends.js';

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
    .option('--all', 'Review all open PRs in the repository')
    .option('--concurrency <n>', 'Max parallel reviews when using --all (default: 3)')
    .action(async (pr: string | undefined, opts: {all?: boolean; concurrency?: string}) => {
      await reviewCommand(pr, opts);
    });

  program
    .command('trends')
    .description('Display historical scan trends')
    .argument('[path]', 'target directory (defaults to current directory)')
    .option('-n, --count <number>', 'number of recent scans to include', '10')
    .action(async (path?: string) => {
      await trendsCommand(path);
    });

  return program;
}
