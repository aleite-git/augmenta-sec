/**
 * CLI command: `asec trends`
 *
 * Displays historical scan trends from `.augmenta-sec/history/`.
 */

import chalk from 'chalk';

import {TrendStore} from '../../report/trends.js';
import type {TrendLine} from '../../report/trends.js';

const DIRECTION_ICONS: Record<TrendLine['direction'], string> = {
  improving: chalk.green('v'),
  worsening: chalk.red('^'),
  stable: chalk.gray('='),
};

export async function trendsCommand(targetPath?: string): Promise<void> {
  const basePath = targetPath ?? process.cwd();
  const store = new TrendStore(basePath);
  const report = await store.getTrends();

  /* eslint-disable no-console */
  console.log();
  console.log(chalk.bold.cyan('AugmentaSec Trend Report'));
  console.log(chalk.gray('\u2500'.repeat(60)));
  console.log();

  if (report.scans.length === 0) {
    console.log(
      chalk.yellow('  No scan history found. Run `asec scan` to record scans.'),
    );
    console.log();
    return;
  }

  console.log(
    chalk.white(`  Scans in history: ${chalk.bold(String(report.scans.length))}`),
  );
  console.log(
    chalk.gray(
      `  Oldest: ${report.scans[0].timestamp}`,
    ),
  );
  console.log(
    chalk.gray(
      `  Newest: ${report.scans[report.scans.length - 1].timestamp}`,
    ),
  );
  console.log();

  console.log(chalk.bold('  Trends:'));
  for (const trend of report.trends) {
    if (trend.points.length === 0) continue;
    const lastValue = trend.points[trend.points.length - 1].value;
    const icon = DIRECTION_ICONS[trend.direction];
    const label = trend.metric.padEnd(16);
    console.log(
      `    ${icon} ${chalk.white(label)} ${chalk.bold(String(lastValue))} (${trend.direction})`,
    );
  }
  console.log();
  /* eslint-enable no-console */
}
