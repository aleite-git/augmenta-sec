import {resolve} from 'node:path';
import {existsSync} from 'node:fs';
import chalk from 'chalk';
import {logger} from '../../utils/logger.js';
import {runDiscovery} from '../../discovery/engine.js';
import {writeProfile} from '../../discovery/profile-writer.js';
import type {SecurityProfile} from '../../discovery/types.js';

export async function initCommand(targetPath?: string): Promise<void> {
  const rootDir = resolve(targetPath ?? '.');

  if (!existsSync(rootDir)) {
    logger.error(`Target directory does not exist: ${rootDir}`);
    process.exit(1);
  }

  console.log();
  console.log(chalk.bold.cyan('AugmentaSec Discovery Engine'));
  console.log(chalk.gray('─'.repeat(60)));
  logger.detail('Target', rootDir);
  console.log();

  // Run discovery
  const {profile, duration, warnings} = await runDiscovery(rootDir);

  // Write profile
  const profilePath = await writeProfile(profile, rootDir);

  // Print summary
  printSummary(profile, duration, warnings, profilePath);
}

function printSummary(
  p: SecurityProfile,
  duration: number,
  warnings: string[],
  profilePath: string,
): void {
  logger.header('Discovery Results');

  // Languages
  const langSummary = p.languages.all
    .slice(0, 5)
    .map(l => `${l.name} (${l.percentage}%)`)
    .join(', ');
  logger.detail('Languages', langSummary || 'none detected');

  // Frameworks
  const allFrameworks = [
    ...p.frameworks.backend,
    ...p.frameworks.frontend,
    ...p.frameworks.fullstack,
    ...p.frameworks.orm,
  ];
  const fwSummary = allFrameworks
    .map(f => f.version ? `${f.name} ${f.version}` : f.name)
    .join(', ');
  logger.detail('Frameworks', fwSummary || 'none detected');

  // Testing
  const testSummary = p.frameworks.testing.map(f => f.name).join(', ');
  logger.detail('Testing', testSummary || 'none detected');

  // Auth
  const authSummary = p.auth.providers
    .map(a => `${a.name} (${a.type})`)
    .join(', ');
  logger.detail('Authentication', authSummary || 'none detected');

  // Database
  const dbSummary = p.database.databases
    .map(d => {
      const parts = [d.type];
      if (d.orm) parts.push(`via ${d.orm}`);
      return parts.join(' ');
    })
    .join(', ');
  logger.detail('Database', dbSummary || 'none detected');

  // API
  const apiSummary = `${p.api.styles.join(', ')} — ${p.api.routeCount} routes detected`;
  logger.detail('API Surface', apiSummary);
  if (p.api.specFile) {
    logger.detail('', `OpenAPI spec: ${p.api.specFile}`);
  }

  // Security Controls
  console.log();
  console.log(chalk.bold('  Security Controls'));
  for (const ctrl of p.securityControls.present) {
    logger.badge(true, ctrl.name, ctrl.details);
  }
  for (const ctrl of p.securityControls.missing) {
    logger.badge(false, ctrl.name, 'not detected');
  }

  // CI/CD
  console.log();
  console.log(chalk.bold('  CI/CD'));
  logger.detail('Platform', p.ci.platform);
  logger.detail('Workflows', String(p.ci.workflows.length));
  if (p.ci.securityChecks.length > 0) {
    for (const check of p.ci.securityChecks) {
      logger.badge(true, check.name, check.type);
    }
  } else {
    logger.badge(false, 'No security checks detected in CI');
  }

  // Documentation
  console.log();
  console.log(chalk.bold('  Documentation'));
  logger.badge(p.docs.hasReadme, 'README');
  logger.badge(p.docs.hasSecurityPolicy, 'SECURITY.md');
  logger.badge(p.docs.hasChangelog, 'CHANGELOG');
  logger.badge(p.docs.hasLicense, 'LICENSE');
  logger.badge(p.docs.hasContributing, 'CONTRIBUTING');
  if (p.docs.architectureDocs.length > 0) {
    logger.badge(true, `${p.docs.architectureDocs.length} architecture/spec docs`);
  }
  if (p.docs.aiConfigs.length > 0) {
    logger.badge(true, `AI config: ${p.docs.aiConfigs.join(', ')}`);
  }

  // Trust boundaries & PII
  console.log();
  console.log(chalk.bold('  Trust Boundaries & PII'));
  if (p.trustBoundaries.candidates.length === 0 && p.piiFields.candidates.length === 0) {
    console.log(chalk.gray('  [llm] Run `asec scan --deep` to detect trust boundaries and PII fields'));
  }

  // Warnings
  if (warnings.length > 0) {
    console.log();
    console.log(chalk.bold.yellow('  Warnings'));
    for (const w of warnings) {
      logger.warn(w);
    }
  }

  // Footer
  console.log();
  console.log(chalk.gray('─'.repeat(60)));
  logger.success(`Profile written to ${chalk.underline(profilePath)}`);
  logger.detail('Duration', `${duration}ms`);
  console.log();
  console.log(chalk.gray('  Next steps:'));
  console.log(chalk.gray('    1. Review the profile for accuracy'));
  console.log(chalk.gray('    2. Run `asec scan` for full security analysis'));
  console.log(chalk.gray('    3. Commit .augmenta-sec/ to version control'));
  console.log();
}
