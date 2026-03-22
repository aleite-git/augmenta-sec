/**
 * Remediation module — auto-fix generation, issue/PR creation,
 * autonomy decisions, fix templates, and duplicate detection.
 *
 * @example
 * ```ts
 * import {generateFix, determineAction, createIssueFromFinding} from './remediation/index.js';
 * ```
 */

// ASEC-070: Auto-fix generation
export type {FixSuggestion} from './auto-fix.js';
export {generateFix, buildFixPrompt, parseFixResponse} from './auto-fix.js';

// ASEC-071: Fix command orchestration
export type {FixResult} from './fix-command.js';
export {applyFixToFile, runFixWorkflow} from './fix-command.js';

// ASEC-072: Issue creation
export {buildIssueFromFinding, createIssueFromFinding} from './issue-creator.js';

// ASEC-073: PR creation
export type {CreateFixPROptions} from './pr-creator.js';
export {
  generateBranchName,
  buildPRTitle,
  buildPRBody,
  createFixPR,
} from './pr-creator.js';

// ASEC-074: Autonomy decisions
export type {AutonomyDecision} from './autonomy.js';
export {determineAction} from './autonomy.js';

// ASEC-075: Fix templates
export type {FixTemplate} from './templates.js';
export {
  getTemplates,
  getTemplateById,
  getTemplatesByCwe,
  renderTemplate,
} from './templates.js';

// ASEC-076: Duplicate detection
export {checkForDuplicateIssue, titleSimilarity} from './backlog.js';

// ---------------------------------------------------------------------------
// Remediation engine (ASEC-070 through ASEC-076)
// ---------------------------------------------------------------------------

// Engine core
export type {
  EffortLevel,
  RemediationSuggestion,
  RemediationResult,
} from './engine.js';
export {runRemediation} from './engine.js';

// Rule-based suggestions
export type {RemediationRule} from './rules.js';
export {applyRules, getRules} from './rules.js';

// LLM-enhanced remediation
export {enhanceWithLLM} from './llm-enhance.js';

// Code fix generation
export type {CodeFix, FixLanguage} from './code-fixes.js';
export {generateCodeFix, getSupportedLanguages} from './code-fixes.js';

// Effort estimation
export type {EffortEstimate} from './effort.js';
export {estimateEffort} from './effort.js';

// Priority scoring
export {scorePriority} from './priority.js';

// Remediation report
export type {EffortSummary} from './report.js';
export {formatRemediationReport, getEffortSummary} from './report.js';
