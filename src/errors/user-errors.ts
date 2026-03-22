/**
 * User-friendly error formatting with actionable suggestions.
 */

import {
  AugmentaSecError,
  ConfigError,
  DetectorError,
  FileSystemError,
  ProviderError,
} from './types.js';

/** A user-facing error with an actionable suggestion. */
export interface UserError {
  category: 'config' | 'scanner' | 'llm' | 'filesystem' | 'unknown';
  message: string;
  suggestion: string;
}

const SCANNER_NOT_FOUND_PATTERNS: Array<{pattern: RegExp; tool: string; installCmd: string}> = [
  {pattern: /semgrep/i, tool: 'Semgrep', installCmd: 'pip install semgrep'},
  {pattern: /trivy/i, tool: 'Trivy', installCmd: 'brew install trivy (macOS) or see https://trivy.dev/latest/getting-started/installation/'},
  {pattern: /bandit/i, tool: 'Bandit', installCmd: 'pip install bandit'},
  {pattern: /gitleaks/i, tool: 'Gitleaks', installCmd: 'brew install gitleaks (macOS) or see https://github.com/gitleaks/gitleaks#installing'},
  {pattern: /gosec/i, tool: 'GoSec', installCmd: 'go install github.com/securego/gosec/v2/cmd/gosec@latest'},
  {pattern: /codeql/i, tool: 'CodeQL', installCmd: 'see https://codeql.github.com/docs/codeql-cli/getting-started-with-the-codeql-cli/'},
  {pattern: /cargo[- ]?audit/i, tool: 'cargo-audit', installCmd: 'cargo install cargo-audit'},
  {pattern: /pip[- ]?audit/i, tool: 'pip-audit', installCmd: 'pip install pip-audit'},
  {pattern: /npm[- ]?audit/i, tool: 'npm audit', installCmd: 'npm is bundled with Node.js'},
];

const LLM_ERROR_PATTERNS: Array<{pattern: RegExp; suggestion: string}> = [
  {pattern: /api[_\s]?key|unauthorized|401|authentication/i, suggestion: 'Check your API key in .augmenta-sec/config.yaml or the corresponding environment variable.'},
  {pattern: /rate[_\s]?limit|429|too many requests/i, suggestion: 'You have hit the provider rate limit. Wait a moment and retry, or switch to a different model.'},
  {pattern: /quota|billing|payment|402/i, suggestion: 'Your API quota may be exhausted. Check your billing dashboard for the LLM provider.'},
  {pattern: /timeout|timed?\s?out|ETIMEDOUT/i, suggestion: 'The LLM request timed out. Check your network connection or try a faster model.'},
  {pattern: /ECONNREFUSED|connection refused|fetch failed/i, suggestion: 'Cannot reach the LLM provider. If using Ollama, ensure the server is running (ollama serve).'},
  {pattern: /model.*not\s+found|unknown\s+model|does\s+not\s+exist/i, suggestion: 'The specified model was not found. Check the model name in your config. For Ollama, run: ollama pull <model>'},
];

const FS_ERROR_PATTERNS: Array<{pattern: RegExp; suggestion: string}> = [
  {pattern: /ENOENT|no such file|not found/i, suggestion: 'The file or directory does not exist. Verify the path is correct.'},
  {pattern: /EACCES|permission denied/i, suggestion: 'Permission denied. Check file permissions or run with appropriate privileges.'},
  {pattern: /ENOSPC|no space/i, suggestion: 'Disk is full. Free up space and try again.'},
  {pattern: /EMFILE|too many open files/i, suggestion: 'Too many open files. Increase the ulimit (ulimit -n 4096) and retry.'},
];

export function formatUserError(error: unknown): UserError {
  const message = extractMessage(error);

  if (error instanceof ConfigError) {
    return {
      category: 'config',
      message: `Configuration error: ${message}`,
      suggestion: 'Review your .augmenta-sec/config.yaml file. Run "asec init" to generate a valid config.',
    };
  }

  if (error instanceof FileSystemError) {
    const fsSuggestion = matchPattern(message, FS_ERROR_PATTERNS);
    return {
      category: 'filesystem',
      message: `File system error: ${message}`,
      suggestion: fsSuggestion ?? 'Check that the target path exists and is accessible.',
    };
  }

  if (error instanceof ProviderError) {
    const scannerMatch = SCANNER_NOT_FOUND_PATTERNS.find((s) => s.pattern.test(message));
    if (scannerMatch) {
      return {
        category: 'scanner',
        message: `${scannerMatch.tool} is not installed or not found in PATH.`,
        suggestion: `Install ${scannerMatch.tool}: ${scannerMatch.installCmd}`,
      };
    }

    const llmSuggestion = matchPattern(message, LLM_ERROR_PATTERNS);
    if (llmSuggestion) {
      return {category: 'llm', message: `LLM provider error: ${message}`, suggestion: llmSuggestion};
    }

    return {category: 'unknown', message: `Provider error: ${message}`, suggestion: 'Check the provider configuration and network connectivity.'};
  }

  if (error instanceof DetectorError) {
    return {
      category: 'scanner',
      message: `Detector "${(error as DetectorError).detectorName}" failed: ${message}`,
      suggestion: 'This detector failure is non-fatal. The scan will continue without it.',
    };
  }

  const scannerMatch = SCANNER_NOT_FOUND_PATTERNS.find((s) => s.pattern.test(message));
  if (scannerMatch) {
    return {category: 'scanner', message: `${scannerMatch.tool} is not installed or not found in PATH.`, suggestion: `Install ${scannerMatch.tool}: ${scannerMatch.installCmd}`};
  }

  const llmSuggestion = matchPattern(message, LLM_ERROR_PATTERNS);
  if (llmSuggestion) {
    return {category: 'llm', message: `LLM error: ${message}`, suggestion: llmSuggestion};
  }

  const fsSuggestion = matchPattern(message, FS_ERROR_PATTERNS);
  if (fsSuggestion) {
    return {category: 'filesystem', message: `File system error: ${message}`, suggestion: fsSuggestion};
  }

  return {category: 'unknown', message: `Unexpected error: ${message}`, suggestion: 'Set ASEC_DEBUG=1 and retry for a full stack trace.'};
}

function extractMessage(error: unknown): string {
  if (error instanceof AugmentaSecError) return error.message;
  if (error instanceof Error) return error.message;
  return String(error);
}

function matchPattern(message: string, patterns: Array<{pattern: RegExp; suggestion: string}>): string | undefined {
  for (const {pattern, suggestion} of patterns) {
    if (pattern.test(message)) return suggestion;
  }
  return undefined;
}
