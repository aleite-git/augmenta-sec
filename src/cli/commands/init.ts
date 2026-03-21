import {resolve} from 'node:path';
import {existsSync} from 'node:fs';
import chalk from 'chalk';
import {logger} from '../../utils/logger.js';
import {runDiscovery} from '../../discovery/engine.js';
import {writeProfile} from '../../discovery/profile-writer.js';
import type {SecurityProfile} from '../../discovery/types.js';
import {createFormatter} from '../output.js';
import type {OutputFormat} from '../output.js';
import {createLogger} from '../verbosity.js';
import type {Verbosity} from '../verbosity.js';

export interface InitOptions {
  format?: OutputFormat;
  verbosity?: Verbosity;
}

export async function initCommand(
  targetPath?: string,
  options?: InitOptions,
): Promise<void> {
  const rootDir = resolve(targetPath ?? '.');
  const format = options?.format ?? 'text';
  const verbosity = options?.verbosity ?? 'normal';
  const log = createLogger(verbosity);

  if (!existsSync(rootDir)) {
    logger.error(`Target directory does not exist: ${rootDir}`);
    process.exit(1);
  }

  // For machine-readable formats, skip decorative output
  if (format !== 'text') {
    const {profile} = await runDiscovery(rootDir);
    await writeProfile(profile, rootDir);
    const formatter = createFormatter(format);
    console.log(formatter.format(profile));
    return;
  }

  // Text mode: human-friendly output
  console.log();
  console.log(chalk.bold.cyan('AugmentaSec Discovery Engine'));
  console.log(chalk.gray('\u2500'.repeat(60)));
  log.detail('Target', rootDir);
  console.log();

  // Run discovery
  const {profile, duration, warnings} = await runDiscovery(rootDir);

  // Write profile
  const profilePath = await writeProfile(profile, rootDir);

  // Print summary
  printSummary(profile, duration, warnings, profilePath, log);
}

interface SummaryLogger {
  header(msg: string): void;
  detail(label: string, value: string): void;
  badge(present: boolean, label: string, detail?: string): void;
  success(msg: string): void;
  warn(msg: string): void;
}

function printSummary(
  p: SecurityProfile,
  duration: number,
  warnings: string[],
  profilePath: string,
  log: SummaryLogger,
): void {
  log.header('Discovery Results');

  // Languages
  const langSummary = p.languages.all
    .slice(0, 5)
    .map(l => `${l.name} (${l.percentage}%)`)
    .join(', ');
  log.detail('Languages', langSummary || 'none detected');

  // Frameworks
  const allFrameworks = [
    ...p.frameworks.backend,
    ...p.frameworks.frontend,
    ...p.frameworks.fullstack,
    ...p.frameworks.orm,
  ];
  const fwSummary = allFrameworks
    .map(f => (f.version ? `${f.name} ${f.version}` : f.name))
    .join(', ');
  log.detail('Frameworks', fwSummary || 'none detected');

  // Testing
  const testSummary = p.frameworks.testing.map(f => f.name).join(', ');
  log.detail('Testing', testSummary || 'none detected');

  // Auth
  const authSummary = p.auth.providers
    .map(a => `${a.name} (${a.type})`)
    .join(', ');
  log.detail('Authentication', authSummary || 'none detected');

  // Database
  const dbSummary = p.database.databases
    .map(d => {
      const parts = [d.type];
      if (d.orm) parts.push(`via ${d.orm}`);
      return parts.join(' ');
    })
    .join(', ');
  log.detail('Database', dbSummary || 'none detected');

  // API
  const apiSummary = `${p.api.styles.join(', ')} \u2014 ${p.api.routeCount} routes detected`;
  log.detail('API Surface', apiSummary);
  if (p.api.specFile) {
    log.detail('', `OpenAPI spec: ${p.api.specFile}`);
  }

  // Security Controls
  console.log();
  console.log(chalk.bold('  Security Controls'));
  for (const ctrl of p.securityControls.present) {
    log.badge(true, ctrl.name, ctrl.details);
  }
  for (const ctrl of p.securityControls.missing) {
    log.badge(false, ctrl.name, 'not detected');
  }

  // CI/CD
  console.log();
  console.log(chalk.bold('  CI/CD'));
  log.detail('Platform', p.ci.platform);
  log.detail('Workflows', String(p.ci.workflows.length));
  if (p.ci.securityChecks.length > 0) {
    for (const check of p.ci.securityChecks) {
      log.badge(true, check.name, check.type);
    }
  } else {
    log.badge(false, 'No security checks detected in CI');
  }

  // Documentation
  console.log();
  console.log(chalk.bold('  Documentation'));
  log.badge(p.docs.hasReadme, 'README');
  log.badge(p.docs.hasSecurityPolicy, 'SECURITY.md');
  log.badge(p.docs.hasChangelog, 'CHANGELOG');
  log.badge(p.docs.hasLicense, 'LICENSE');
  log.badge(p.docs.hasContributing, 'CONTRIBUTING');
  if (p.docs.architectureDocs.length > 0) {
    log.badge(true, `${p.docs.architectureDocs.length} architecture/spec docs`);
  }
  if (p.docs.aiConfigs.length > 0) {
    log.badge(true, `AI config: ${p.docs.aiConfigs.join(', ')}`);
  }

  // Trust boundaries and PII
  console.log();
  console.log(chalk.bold('  Trust Boundaries & PII'));
  if (
    p.trustBoundaries.candidates.length === 0 &&
    p.piiFields.candidates.length === 0
  ) {
    console.log(
      chalk.gray(
        '  [llm] Run `asec scan --deep` to detect trust boundaries and PII fields',
      ),
    );
  }

  // Warnings
  if (warnings.length > 0) {
    console.log();
    console.log(chalk.bold.yellow('  Warnings'));
    for (const w of warnings) {
      log.warn(w);
    }
  }

  // Footer
  console.log();
  console.log(chalk.gray('\u2500'.repeat(60)));
  log.success(`Profile written to ${chalk.underline(profilePath)}`);
  log.detail('Duration', `${duration}ms`);
  console.log();
  console.log(chalk.gray('  Next steps:'));
  console.log(chalk.gray('    1. Review the profile for accuracy'));
  console.log(chalk.gray('    2. Run `asec scan` for full security analysis'));
  console.log(chalk.gray('    3. Commit .augmenta-sec/ to version control'));
  console.log();
}
