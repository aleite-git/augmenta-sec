/**
 * CLI `review` command — reviews a pull request for security issues.
 *
 * Wires the review engine into the CLI by resolving config, instantiating
 * the LLM provider and git platform adapter, and invoking `runReview`.
 *
 * Supports `--all` for batch review of all open PRs (ASEC-049).
 */

import chalk from 'chalk';

import {parsePRRef, runReview} from '../../review/index.js';
import {batchReview} from '../../review/batch.js';
import {resolveConfig} from '../../config/index.js';
import type {AugmentaSecConfig} from '../../config/schema.js';
import type {GitPlatform} from '../../providers/git-platform/types.js';
import type {LLMProvider} from '../../providers/llm/types.js';

/**
 * Resolves the git platform adapter from environment variables.
 */
async function resolvePlatform(): Promise<GitPlatform> {
  const token = process.env['GITHUB_TOKEN'];
  const repository = process.env['GITHUB_REPOSITORY'];

  if (!token || !repository) {
    throw new Error(
      'GitHub credentials not found. Set GITHUB_TOKEN and GITHUB_REPOSITORY environment variables.',
    );
  }

  const [owner, repo] = repository.split('/');
  if (!owner || !repo) {
    throw new Error('GITHUB_REPOSITORY must be in "owner/repo" format.');
  }

  const {createGitHubAdapter} = await import('../../providers/git-platform/github.js');
  return createGitHubAdapter({token, owner, repo});
}

/**
 * Resolves the LLM provider for the analysis role from the config.
 *
 * Parses the model string to determine the provider, instantiates it,
 * and returns it directly. Full gateway routing is used at runtime
 * when multiple roles need different providers.
 */
async function resolveLLMProvider(config: AugmentaSecConfig): Promise<LLMProvider> {
  const {parseModelString} = await import('../../providers/llm/gateway.js');
  const mapping = parseModelString(config.llm.analysis);

  // Resolve the API key from standard environment variables.
  const envKeyMap: Record<string, string> = {
    gemini: 'GEMINI_API_KEY',
    anthropic: 'ANTHROPIC_API_KEY',
    openai: 'OPENAI_API_KEY',
    mistral: 'MISTRAL_API_KEY',
  };

  const envVar = envKeyMap[mapping.provider];
  const apiKey = envVar ? (process.env[envVar] ?? '') : '';

  // Dynamically import the matched provider factory.
  switch (mapping.provider) {
    case 'gemini': {
      const {createGeminiProvider} = await import('../../providers/llm/gemini.js');
      return createGeminiProvider(mapping.model, apiKey);
    }
    case 'anthropic': {
      const {createAnthropicProvider} = await import('../../providers/llm/anthropic.js');
      return createAnthropicProvider(mapping.model, apiKey);
    }
    case 'openai': {
      const {createOpenAIProvider} = await import('../../providers/llm/openai.js');
      return createOpenAIProvider(mapping.model, apiKey);
    }
    case 'mistral': {
      const {createMistralProvider} = await import('../../providers/llm/mistral.js');
      return createMistralProvider(mapping.model, apiKey);
    }
    case 'ollama': {
      const {createOllamaProvider} = await import('../../providers/llm/ollama.js');
      return createOllamaProvider(mapping.model);
    }
    default:
      throw new Error(
        `Unknown LLM provider "${mapping.provider}". ` +
          'Supported: gemini, anthropic, openai, mistral, ollama.',
      );
  }
}

/** Options for the review command. */
export interface ReviewCommandOptions {
  all?: boolean;
  concurrency?: string;
}

export async function reviewCommand(
  prRef?: string,
  options: ReviewCommandOptions = {},
): Promise<void> {
  console.log();
  console.log(chalk.bold.cyan('AugmentaSec PR Review'));
  console.log(chalk.gray('\u2500'.repeat(60)));
  console.log();

  // --all mode: batch review all open PRs (ASEC-049)
  if (options.all) {
    try {
      const config = await resolveConfig(process.cwd());
      const platform = await resolvePlatform();
      const provider = await resolveLLMProvider(config);
      const concurrency = options.concurrency ? parseInt(options.concurrency, 10) : 3;

      console.log(chalk.gray(`  Batch reviewing all open PRs (concurrency: ${concurrency})...`));
      console.log();

      const result = await batchReview({
        platform,
        provider,
        config,
        concurrency,
      });

      console.log(chalk.bold(`  Total PRs: ${result.total}`));
      console.log(chalk.green(`  Succeeded: ${result.succeeded}`));
      if (result.failed > 0) {
        console.log(chalk.red(`  Failed: ${result.failed}`));
      }
      console.log();

      for (const item of result.items) {
        const status = item.error
          ? chalk.red('FAILED')
          : item.result?.approved
            ? chalk.green('APPROVED')
            : chalk.yellow('CHANGES REQUESTED');

        console.log(`  PR #${item.prNumber} (${item.prTitle}): ${status}`);
        if (item.error) {
          console.log(chalk.gray(`    Error: ${item.error}`));
        } else if (item.result) {
          console.log(chalk.gray(`    Findings: ${item.result.findings.length}`));
        }
      }
      console.log();

      if (result.failed > 0) {
        process.exitCode = 1;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(chalk.red(`  Error: ${message}`));
      console.log();
      process.exitCode = 1;
    }
    return;
  }

  // Single PR mode
  if (!prRef) {
    console.log(chalk.yellow('  Usage: augmenta-sec review <pr-number-or-url>'));
    console.log(chalk.yellow('         augmenta-sec review --all'));
    console.log(chalk.gray('  Example: augmenta-sec review 42'));
    console.log(chalk.gray('  Example: augmenta-sec review https://github.com/owner/repo/pull/42'));
    console.log(chalk.gray('  Example: augmenta-sec review --all --concurrency 5'));
    console.log();
    return;
  }

  try {
    const ref = parsePRRef(prRef);
    const config = await resolveConfig(process.cwd());
    const platform = await resolvePlatform();
    const provider = await resolveLLMProvider(config);

    console.log(chalk.gray(`  Reviewing PR #${ref.prNumber}...`));
    console.log();

    const result = await runReview(ref, platform, provider, config);

    console.log(chalk.bold(`  Files reviewed: ${result.reviewedFiles.length}`));
    console.log(chalk.bold(`  Findings: ${result.findings.length}`));

    if (result.summary.bySeverity.critical > 0) {
      console.log(chalk.red(`    Critical: ${result.summary.bySeverity.critical}`));
    }
    if (result.summary.bySeverity.high > 0) {
      console.log(chalk.red(`    High: ${result.summary.bySeverity.high}`));
    }
    if (result.summary.bySeverity.medium > 0) {
      console.log(chalk.yellow(`    Medium: ${result.summary.bySeverity.medium}`));
    }
    if (result.summary.bySeverity.low > 0) {
      console.log(chalk.blue(`    Low: ${result.summary.bySeverity.low}`));
    }
    if (result.summary.bySeverity.informational > 0) {
      console.log(chalk.gray(`    Info: ${result.summary.bySeverity.informational}`));
    }

    console.log();
    if (result.approved) {
      console.log(chalk.green('  Result: APPROVED'));
    } else {
      console.log(chalk.red('  Result: CHANGES REQUESTED'));
    }
    console.log();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(chalk.red(`  Error: ${message}`));
    console.log();
    process.exitCode = 1;
  }
}
