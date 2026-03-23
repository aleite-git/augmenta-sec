/**
 * Configuration schema for AugmentaSec.
 *
 * Uses Zod to define, validate, and infer types for the configuration
 * loaded from `.augmenta-sec/config.yaml` (project) or
 * `~/.augmenta-sec/config.yaml` (global).
 *
 * All sections are optional with sensible defaults so that a minimal
 * (or empty) config file is valid.
 */

import {z} from 'zod';

// ---------------------------------------------------------------------------
// Shared enums
// ---------------------------------------------------------------------------

/** Severity levels used across scan, review, and autonomy settings. */
export const SEVERITY_LEVELS = [
  'critical',
  'high',
  'medium',
  'low',
  'informational',
] as const;

export const severitySchema = z.enum(SEVERITY_LEVELS);

/** Autonomy action levels, from most autonomous to least. */
export const AUTONOMY_ACTIONS = [
  'create-pr-and-alert',
  'create-issue',
  'report',
  'note',
] as const;

export const autonomyActionSchema = z.enum(AUTONOMY_ACTIONS);

// ---------------------------------------------------------------------------
// LLM model format validation
// ---------------------------------------------------------------------------

/**
 * Validates that a model identifier follows the `provider/model-name` format.
 * Examples: `gemini/gemini-2.5-flash`, `ollama/llama3`.
 */
const llmModelSchema = z
  .string()
  .regex(
    /^[a-zA-Z0-9_-]+\/[a-zA-Z0-9._-]+$/,
    'Model must be in "provider/model-name" format (e.g., "gemini/gemini-2.5-flash")',
  );

// ---------------------------------------------------------------------------
// Section schemas
// ---------------------------------------------------------------------------

export const llmSchema = z
  .object({
    triage: llmModelSchema,
    analysis: llmModelSchema,
    reasoning: llmModelSchema,
  })
  .optional();

export const autonomySchema = z
  .object({
    critical: autonomyActionSchema.optional(),
    high: autonomyActionSchema.optional(),
    medium: autonomyActionSchema.optional(),
    low: autonomyActionSchema.optional(),
    max_auto_prs_per_day: z.number().int().min(0).optional(),
    never_auto_merge: z.boolean().optional(),
    respect_freeze: z.boolean().optional(),
  })
  .optional();

export const scannersSchema = z.array(z.string().min(1)).optional();

export const scanSchema = z
  .object({
    categories: z.array(z.string().min(1)).optional(),
    min_severity: severitySchema.optional(),
    max_findings: z.number().int().min(0).optional(),
  })
  .optional();

export const reviewSchema = z
  .object({
    auto_approve_below: severitySchema.optional(),
    inline_comments: z.boolean().optional(),
    summary_comment: z.boolean().optional(),
  })
  .optional();

export const outputSchema = z
  .object({
    format: z.enum(['text', 'json', 'yaml']).optional(),
    verbosity: z.enum(['quiet', 'normal', 'verbose']).optional(),
  })
  .optional();

// ---------------------------------------------------------------------------
// Custom scanner definitions (ASEC-108)
// ---------------------------------------------------------------------------

const commandScannerDefSchema = z.object({
  name: z.string().min(1),
  command: z.string().min(1),
  args: z.array(z.string()).optional(),
  output_format: z.enum(['sarif', 'json']).default('sarif'),
  category: z.enum(['sast', 'dast', 'sca', 'container', 'secrets']),
  timeout: z.number().int().min(0).optional(),
});

const moduleScannerDefSchema = z.object({
  name: z.string().min(1),
  module: z.string().min(1),
});

export const customScannerDefSchema = z.union([
  commandScannerDefSchema,
  moduleScannerDefSchema,
]);

export const customScannersSchema = z
  .array(customScannerDefSchema)
  .optional();

// ---------------------------------------------------------------------------
// Top-level config schema
// ---------------------------------------------------------------------------

export const configSchema = z
  .object({
    llm: llmSchema,
    autonomy: autonomySchema,
    scanners: scannersSchema,
    custom_scanners: customScannersSchema,
    scan: scanSchema,
    review: reviewSchema,
    output: outputSchema,
  })
  .optional()
  .default({});

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

/** Severity level union type. */
export type Severity = z.infer<typeof severitySchema>;

/** Autonomy action union type. */
export type AutonomyAction = z.infer<typeof autonomyActionSchema>;

/** Fully-resolved configuration after defaults are applied. */
export interface AugmentaSecConfig {
  llm: {
    triage: string;
    analysis: string;
    reasoning: string;
  };
  autonomy: {
    critical: AutonomyAction;
    high: AutonomyAction;
    medium: AutonomyAction;
    low: AutonomyAction;
    max_auto_prs_per_day: number;
    never_auto_merge: boolean;
    respect_freeze: boolean;
  };
  scanners: string[];
  custom_scanners: Array<z.infer<typeof customScannerDefSchema>>;
  scan: {
    categories: string[];
    min_severity: Severity;
    max_findings: number;
  };
  review: {
    auto_approve_below: Severity;
    inline_comments: boolean;
    summary_comment: boolean;
  };
  output: {
    format: 'text' | 'json' | 'yaml';
    verbosity: 'quiet' | 'normal' | 'verbose';
  };
}

/** Raw (partial) configuration before defaults are applied. */
export type RawConfig = z.output<typeof configSchema>;
