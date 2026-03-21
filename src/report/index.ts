/**
 * Report module — HTML, JSON, template, and interactive report generation
 * for AugmentaSec.
 *
 * @example
 * ```ts
 * import {generateHtmlReport, generateJsonReport, renderReport, exportHtml} from './report/index.js';
 *
 * const html = generateHtmlReport(report);
 * const json = generateJsonReport(report);
 * const text = renderReport(report, 'executive-summary');
 * const offline = exportHtml(report, {title: 'My Report'});
 * ```
 */

export {generateHtmlReport, generateSeverityChart, escapeHtml} from './html-report.js';
export {generateJsonReport} from './json-report.js';

// ASEC-154: Report templates
export type {ReportSection, ReportTemplate, BuiltInTemplate} from './templates.js';
export {renderReport, getTemplate, getTemplateNames} from './templates.js';

// ASEC-155: Offline HTML export
export type {HtmlExportOptions} from './html-export.js';
export {exportHtml, escapeHtml as escapeHtmlExport} from './html-export.js';

// ASEC-156: Interactive CLI report
export type {InteractiveState} from './interactive.js';
export {
  interactiveReport,
  createInteractiveState,
  renderPage,
  handleKeypress,
  formatFindingSummary,
  formatFindingDetail,
  formatHeader,
  formatFooter,
  severityColor,
  getCurrentPageFindings,
  PAGE_SIZE,
  ANSI,
} from './interactive.js';
