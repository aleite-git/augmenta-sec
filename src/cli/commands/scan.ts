/**
 * `asec scan` CLI command (ASEC-005).
 *
 * Runs the scan engine against a target directory and prints results.
 */

import {resolve} from 'node:path';

import chalk from 'chalk';

import {resolveConfig} from '../../config/index.js';
import type {FindingsReport} from '../../findings/types.js';
import {runScan} from '../../scan/engine.js';
import {formatUserError} from '../../errors/index.js';
import {logger} from '../../utils/logger.js';

/** Prints a human-readable summary of the findings report to stdout. */
function printReport(report: FindingsReport): void {
  const {summary, findings} = report;

  console.log();
  logger.header('Scan Results');
  console.log();

  logger.detail('Target', report.target);
  logger.detail('Generated', report.generatedAt);
  logger.detail('Total findings', String(summary.total));
  console.log();

  console.log(chalk.bold('  Severity Breakdown'));
  const severityColors: Record<string, (s: string) => string> = {
    critical: chalk.red.bold,
    high: chalk.red,
    medium: chalk.yellow,
    low: chalk.blue,
    informational: chalk.gray,
  };

  for (const [level, count] of Object.entries(summary.bySeverity)) {
    if (count > 0) {
      const colorFn = severityColors[level] ?? chalk.white;
      console.log(`    ${colorFn(`${level.padEnd(15)} ${count}`)}`);
    }
  }

  if (Object.keys(summary.byCategory).length > 0) {
    console.log();
    console.log(chalk.bold('  Categories'));
    for (const [category, count] of Object.entries(summary.byCategory)) {
      console.log(`    ${chalk.gray(category.padEnd(15))} ${count}`);
    }
  }

  if (findings.length > 0) {
    console.log();
    console.log(chalk.bold('  Top Findings'));
    const topFindings = findings.slice(0, 10);
    for (const finding of topFindings) {
      const colorFn = severityColors[finding.severity] ?? chalk.white;
      const location = finding.file
        ? `${finding.file}${finding.line ? `:${finding.line}` : ''}`
        : 'unknown';
      console.log(
        `    ${colorFn(`[${finding.severity.toUpperCase()}]`)} ${finding.title}`,
      );
      console.log(`      ${chalk.gray(location)}`);
    }

    if (findings.length > 10) {
      console.log(
        chalk.gray(`    ... and ${findings.length - 10} more`),
      );
    }
  }

  // Warnings from scanner failures
  if (report.warnings && report.warnings.length > 0) {
    console.log();
    console.log(chalk.bold.yellow('  Warnings'));
    for (const w of report.warnings) {
      logger.warn(w);
    }
  }

  console.log();

  if (summary.total === 0) {
    console.log(chalk.green('  No security findings detected.'));
  } else if (summary.bySeverity.critical > 0) {
    console.log(
      chalk.red.bold(
        `  ${summary.bySeverity.critical} critical finding(s) require immediate attention.`,
      ),
    );
  }

  console.log();
}

/** Entry point for the `asec scan` command. */
export async function scanCommand(targetPath?: string): Promise<void> {
  const rootDir = resolve(targetPath ?? '.');

  console.log();
  console.log(chalk.bold.cyan('AugmentaSec Security Scan'));
  console.log(chalk.gray('\u2500'.repeat(60)));
  console.log();

  try {
    logger.info(`Scanning ${rootDir}...`);

    const config = await resolveConfig(rootDir);
    const report = await runScan(rootDir, config);

    printReport(report);
  } catch (error: unknown) {
    const userError = formatUserError(error);
    logger.error(userError.message);
    logger.info(`Suggestion: ${userError.suggestion}`);
    process.exitCode = 1;
  }
}
