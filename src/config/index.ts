/**
 * Configuration module — schema, defaults, and loader.
 *
 * @example
 * ```ts
 * import {resolveConfig} from './config/index.js';
 *
 * const config = await resolveConfig('/path/to/project');
 * console.log(config.llm.triage); // "gemini/gemini-2.5-flash-lite"
 * ```
 */

export {
  configSchema,
  severitySchema,
  autonomyActionSchema,
  llmSchema,
  autonomySchema,
  scannersSchema,
  scanSchema,
  reviewSchema,
  outputSchema,
  SEVERITY_LEVELS,
  AUTONOMY_ACTIONS,
} from './schema.js';

export type {AugmentaSecConfig, RawConfig, Severity, AutonomyAction} from './schema.js';

export {DEFAULT_CONFIG} from './defaults.js';

export {
  loadProjectConfig,
  loadGlobalConfig,
  resolveConfig,
  saveGlobalConfig,
} from './loader.js';

export {mergeProfiles, hasManualEdits} from './profile-merge.js';
