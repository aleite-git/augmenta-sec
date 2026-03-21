/**
 * Interactive CLI report viewer for AugmentaSec (ASEC-156).
 *
 * Presents findings with keyboard navigation using simple stdin/stdout
 * (no heavy TUI dependencies). Features:
 *   - Arrow keys to navigate between findings
 *   - Enter to expand/collapse finding details
 *   - Pagination (10 findings per page)
 *   - Severity-colored output via ANSI codes
 *   - q to quit
 */

import type {Finding, FindingsReport, Severity} from '../findings/types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Number of findings displayed per page. */
export const PAGE_SIZE = 10;

// ---------------------------------------------------------------------------
// ANSI color codes
// ---------------------------------------------------------------------------

/** ANSI escape sequences for severity-based terminal coloring. */
export const ANSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  underline: '\x1b[4m',
  // Severity colors
  critical: '\x1b[91m', // bright red
  high: '\x1b[33m', // yellow/orange
  medium: '\x1b[93m', // bright yellow
  low: '\x1b[34m', // blue
  informational: '\x1b[90m', // gray
  // UI colors
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  white: '\x1b[37m',
} as const;

// ---------------------------------------------------------------------------
// Severity helpers
// ---------------------------------------------------------------------------

const SEVERITY_ORDER: readonly Severity[] = [
  'critical',
  'high',
  'medium',
  'low',
  'informational',
] as const;

function severityIndex(s: Severity): number {
  const idx = SEVERITY_ORDER.indexOf(s);
  return idx >= 0 ? idx : SEVERITY_ORDER.length;
}

function sortFindings(findings: Finding[]): Finding[] {
  return [...findings].sort(
    (a, b) => severityIndex(a.severity) - severityIndex(b.severity),
  );
}

/** Returns the ANSI color code for a severity level. */
export function severityColor(severity: Severity): string {
  return ANSI[severity] ?? ANSI.reset;
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

/**
 * Formats a single finding as a one-line summary.
 *
 * @param finding - The finding to format.
 * @param index - Display index (1-based).
 * @param selected - Whether this finding is currently selected.
 * @returns Formatted string with ANSI colors.
 */
export function formatFindingSummary(
  finding: Finding,
  index: number,
  selected: boolean,
): string {
  const color = severityColor(finding.severity);
  const prefix = selected ? `${ANSI.cyan}> ` : '  ';
  const sevLabel = `${color}${ANSI.bold}${finding.severity.toUpperCase().padEnd(14)}${ANSI.reset}`;
  const title = selected
    ? `${ANSI.white}${ANSI.bold}${finding.title}${ANSI.reset}`
    : finding.title;
  const location =
    finding.file != null
      ? `${ANSI.dim}${finding.file}${finding.line != null ? `:${finding.line}` : ''}${ANSI.reset}`
      : '';

  return `${prefix}${String(index).padStart(3)}. ${sevLabel} ${title} ${location}${ANSI.reset}`;
}

/**
 * Formats the expanded detail view for a finding.
 *
 * @param finding - The finding to display in detail.
 * @returns Multi-line formatted string with ANSI colors.
 */
export function formatFindingDetail(finding: Finding): string {
  const color = severityColor(finding.severity);
  const lines: string[] = [
    '',
    `     ${color}${ANSI.bold}${finding.title}${ANSI.reset}`,
    `     ${ANSI.dim}${'─'.repeat(50)}${ANSI.reset}`,
    `     ${ANSI.bold}Severity:${ANSI.reset}   ${color}${finding.severity.toUpperCase()}${ANSI.reset}`,
    `     ${ANSI.bold}Category:${ANSI.reset}   ${finding.category}`,
    `     ${ANSI.bold}Source:${ANSI.reset}     ${finding.source}${finding.scanner ? ` (${finding.scanner})` : ''}`,
    `     ${ANSI.bold}Confidence:${ANSI.reset} ${(finding.confidence * 100).toFixed(0)}%`,
    `     ${ANSI.bold}Status:${ANSI.reset}     ${finding.status}`,
  ];

  if (finding.file) {
    lines.push(
      `     ${ANSI.bold}Location:${ANSI.reset}   ${finding.file}${finding.line != null ? `:${finding.line}` : ''}${finding.column != null ? `:${finding.column}` : ''}`,
    );
  }

  if (finding.cweId) {
    lines.push(`     ${ANSI.bold}CWE:${ANSI.reset}        ${finding.cweId}`);
  }
  if (finding.cveId) {
    lines.push(`     ${ANSI.bold}CVE:${ANSI.reset}        ${finding.cveId}`);
  }
  if (finding.owaspCategory) {
    lines.push(
      `     ${ANSI.bold}OWASP:${ANSI.reset}      ${finding.owaspCategory}`,
    );
  }

  lines.push('');
  // Word-wrap description to ~70 chars
  const descWords = finding.description.split(/\s+/);
  let descLine = '     ';
  for (const word of descWords) {
    if (descLine.length + word.length + 1 > 75 && descLine.length > 5) {
      lines.push(descLine);
      descLine = '     ' + word;
    } else {
      descLine += (descLine.length > 5 ? ' ' : '') + word;
    }
  }
  if (descLine.length > 5) lines.push(descLine);

  if (finding.suggestedFix) {
    lines.push('');
    lines.push(
      `     ${ANSI.green}${ANSI.bold}Suggested fix:${ANSI.reset} ${finding.suggestedFix}`,
    );
  }

  if (finding.contextualNote) {
    lines.push(
      `     ${ANSI.dim}Context: ${finding.contextualNote}${ANSI.reset}`,
    );
  }

  lines.push(`     ${ANSI.dim}${'─'.repeat(50)}${ANSI.reset}`);
  lines.push('');

  return lines.join('\n');
}

/**
 * Formats the header bar shown at the top of the interactive view.
 *
 * @param report - The findings report.
 * @returns Formatted header string.
 */
export function formatHeader(report: FindingsReport): string {
  const {summary} = report;
  const lines: string[] = [
    `${ANSI.bold}${ANSI.cyan}AugmentaSec Interactive Report${ANSI.reset}`,
    `${ANSI.dim}Target: ${report.target} | ${summary.total} finding(s) | ${report.generatedAt}${ANSI.reset}`,
    '',
    `${ANSI.bold}Severity:${ANSI.reset} ${ANSI.critical}C:${summary.bySeverity.critical}${ANSI.reset} ${ANSI.high}H:${summary.bySeverity.high}${ANSI.reset} ${ANSI.medium}M:${summary.bySeverity.medium}${ANSI.reset} ${ANSI.low}L:${summary.bySeverity.low}${ANSI.reset} ${ANSI.informational}I:${summary.bySeverity.informational}${ANSI.reset}`,
    `${ANSI.dim}${'═'.repeat(60)}${ANSI.reset}`,
  ];
  return lines.join('\n');
}

/**
 * Formats the footer with navigation hints and page info.
 *
 * @param currentPage - Current page number (0-based).
 * @param totalPages - Total number of pages.
 * @returns Formatted footer string.
 */
export function formatFooter(
  currentPage: number,
  totalPages: number,
): string {
  return [
    `${ANSI.dim}${'═'.repeat(60)}${ANSI.reset}`,
    `${ANSI.dim}Page ${currentPage + 1}/${totalPages} | ↑↓ navigate | ←→ page | Enter expand | q quit${ANSI.reset}`,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Navigation state
// ---------------------------------------------------------------------------

/** Mutable state for the interactive viewer. */
export interface InteractiveState {
  /** Sorted findings. */
  findings: Finding[];
  /** Currently selected index (global, across all pages). */
  selectedIndex: number;
  /** Set of expanded finding indices (global). */
  expandedIndices: Set<number>;
  /** Current page (0-based). */
  currentPage: number;
  /** Total pages. */
  totalPages: number;
  /** Whether the viewer is still running. */
  running: boolean;
}

/**
 * Creates the initial interactive state from a report.
 */
export function createInteractiveState(
  report: FindingsReport,
): InteractiveState {
  const sorted = sortFindings(report.findings);
  return {
    findings: sorted,
    selectedIndex: 0,
    expandedIndices: new Set(),
    currentPage: 0,
    totalPages: Math.max(1, Math.ceil(sorted.length / PAGE_SIZE)),
    running: true,
  };
}

/**
 * Returns the slice of findings for the current page.
 */
export function getCurrentPageFindings(state: InteractiveState): Finding[] {
  const start = state.currentPage * PAGE_SIZE;
  return state.findings.slice(start, start + PAGE_SIZE);
}

/**
 * Renders the current page view as a string.
 *
 * @param report - The original findings report (for header metadata).
 * @param state - Current interactive state.
 * @returns Complete screen output string.
 */
export function renderPage(
  report: FindingsReport,
  state: InteractiveState,
): string {
  const parts: string[] = [formatHeader(report), ''];

  const pageFindings = getCurrentPageFindings(state);
  const pageOffset = state.currentPage * PAGE_SIZE;

  if (pageFindings.length === 0) {
    parts.push(`  ${ANSI.dim}No findings to display.${ANSI.reset}`);
  } else {
    for (let i = 0; i < pageFindings.length; i++) {
      const globalIndex = pageOffset + i;
      const isSelected = globalIndex === state.selectedIndex;
      parts.push(
        formatFindingSummary(pageFindings[i], globalIndex + 1, isSelected),
      );
      if (state.expandedIndices.has(globalIndex)) {
        parts.push(formatFindingDetail(pageFindings[i]));
      }
    }
  }

  parts.push('');
  parts.push(formatFooter(state.currentPage, state.totalPages));

  return parts.join('\n');
}

// ---------------------------------------------------------------------------
// Key handling
// ---------------------------------------------------------------------------

/**
 * Processes a key input and updates the interactive state.
 *
 * @param key - The raw key buffer from stdin.
 * @param state - Current state (mutated in place).
 * @returns true if the view needs to be re-rendered.
 */
export function handleKeypress(
  key: Buffer,
  state: InteractiveState,
): boolean {
  const str = key.toString();

  // q or Ctrl+C to quit
  if (str === 'q' || str === '\x03') {
    state.running = false;
    return true;
  }

  const total = state.findings.length;
  if (total === 0) return false;

  // Arrow keys (escape sequences: \x1b[A = up, \x1b[B = down, \x1b[C = right, \x1b[D = left)
  if (str === '\x1b[A') {
    // Up arrow
    if (state.selectedIndex > 0) {
      state.selectedIndex--;
      // Switch page if needed
      const newPage = Math.floor(state.selectedIndex / PAGE_SIZE);
      if (newPage !== state.currentPage) {
        state.currentPage = newPage;
      }
      return true;
    }
    return false;
  }

  if (str === '\x1b[B') {
    // Down arrow
    if (state.selectedIndex < total - 1) {
      state.selectedIndex++;
      const newPage = Math.floor(state.selectedIndex / PAGE_SIZE);
      if (newPage !== state.currentPage) {
        state.currentPage = newPage;
      }
      return true;
    }
    return false;
  }

  if (str === '\x1b[C') {
    // Right arrow — next page
    if (state.currentPage < state.totalPages - 1) {
      state.currentPage++;
      state.selectedIndex = state.currentPage * PAGE_SIZE;
      return true;
    }
    return false;
  }

  if (str === '\x1b[D') {
    // Left arrow — previous page
    if (state.currentPage > 0) {
      state.currentPage--;
      state.selectedIndex = state.currentPage * PAGE_SIZE;
      return true;
    }
    return false;
  }

  // Enter — toggle detail expansion
  if (str === '\r' || str === '\n') {
    if (state.expandedIndices.has(state.selectedIndex)) {
      state.expandedIndices.delete(state.selectedIndex);
    } else {
      state.expandedIndices.add(state.selectedIndex);
    }
    return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Launches an interactive terminal-based report viewer.
 *
 * Uses raw stdin mode for keyboard input. Arrow keys navigate findings,
 * Enter expands details, and q quits.
 *
 * @param report - The findings report to display.
 * @param input - Readable stream for keyboard input (default: process.stdin).
 * @param output - Writable stream for display output (default: process.stdout).
 * @returns A promise that resolves when the user quits.
 */
export async function interactiveReport(
  report: FindingsReport,
  input: NodeJS.ReadableStream = process.stdin,
  output: NodeJS.WritableStream = process.stdout,
): Promise<void> {
  const state = createInteractiveState(report);

  const write = (text: string): void => {
    output.write(text);
  };

  // Clear screen and render initial view
  write('\x1b[2J\x1b[H');
  write(renderPage(report, state));

  // Set raw mode if available (interactive terminal)
  const stdin = input as typeof process.stdin;
  const wasRaw = stdin.isRaw ?? false;
  if (typeof stdin.setRawMode === 'function') {
    stdin.setRawMode(true);
  }
  stdin.resume();

  return new Promise<void>(resolve => {
    const onData = (data: Buffer): void => {
      const needsRender = handleKeypress(data, state);
      if (!state.running) {
        cleanup();
        return;
      }
      if (needsRender) {
        write('\x1b[2J\x1b[H');
        write(renderPage(report, state));
      }
    };

    const cleanup = (): void => {
      stdin.removeListener('data', onData);
      if (typeof stdin.setRawMode === 'function') {
        stdin.setRawMode(wasRaw);
      }
      stdin.pause();
      write('\n');
      resolve();
    };

    stdin.on('data', onData);
  });
}
