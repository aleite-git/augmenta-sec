/**
 * Default configuration values for AugmentaSec.
 *
 * Mirrors the defaults documented in `config.example.yaml`.
 * When a user omits a section (or a field within a section),
 * these values are used as fallbacks.
 */

import type {AugmentaSecConfig} from './schema.js';

export const DEFAULT_CONFIG: AugmentaSecConfig = {
  llm: {
    triage: 'gemini/gemini-2.5-flash-lite',
    analysis: 'gemini/gemini-2.5-flash',
    reasoning: 'gemini/gemini-2.5-pro',
  },

  autonomy: {
    critical: 'create-pr-and-alert',
    high: 'create-issue',
    medium: 'report',
    low: 'note',
    max_auto_prs_per_day: 3,
    never_auto_merge: true,
    respect_freeze: true,
  },

  scanners: ['semgrep', 'trivy'],

  scan: {
    categories: [
      'auth',
      'pii',
      'injection',
      'dependencies',
      'secrets',
      'config',
      'crypto',
      'containers',
    ],
    min_severity: 'low',
    max_findings: 0,
  },

  review: {
    auto_approve_below: 'medium',
    inline_comments: true,
    summary_comment: true,
  },

  output: {
    format: 'text',
    verbosity: 'normal',
  },
};
