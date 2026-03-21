import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Project root (3 levels up from lib/) */
export const PROJECT_ROOT = resolve(__dirname, '..', '..', '..');

/** Markdown file paths */
export const FILES = {
  backlog: resolve(PROJECT_ROOT, 'BACKLOG.md'),
  groomed: resolve(PROJECT_ROOT, 'BACKLOG-GROOMED.md'),
  current: resolve(PROJECT_ROOT, 'CURRENT-SPRINT.md'),
  delivered: resolve(PROJECT_ROOT, 'BACKLOG-DELIVERED.md'),
};

/** Scope labels used in CLI commands */
export const SCOPES = ['backlog', 'groomed', 'current', 'delivered'];

/** Regex patterns for parsing markdown files */
export const PATTERNS = {
  /** Matches sprint header: # Sprint 30: Sprint Management Tooling */
  sprintHeader: /^#\s+Sprint\s+(\d+):\s+(.+)$/,

  /** Matches a ticket line (checkbox format):
   *  - [ ] **TICKET-ID** or - [x] **TICKET-ID** or 1. [ ] **TICKET-ID** */
  ticketLine: /^(\s*)(?:-|\d+\.)\s+\[([x ])\]\s+\*\*([A-Z]+-\d+(?:-P\d+)?)\*\*\s*[-:–]\s*(.+)$/i,

  /** Matches completed ticket in delivered file:
   *  1. ✅ **TICKET-ID** - Title (Xh) - **PX** */
  deliveredTicket: /^(\s*)\d+\.\s+✅\s+\*\*([A-Z]+-\d+(?:-P\d+)?)\*\*\s*[-–]\s*(.+)$/i,

  /** Matches status line:   - **Status:** IN PROGRESS */
  statusLine: /^\s+-\s+\*\*Status:\*\*\s*(.+)$/i,

  /** Matches effort:  **EFFORT: 10** */
  effortInline: /\*\*EFFORT:\s*(\d+)\*\*/i,

  /** Matches priority inline: **P1** or **PX** */
  priorityInline: /\*\*(P[0-3])\*\*/i,

  /** Matches hours: (Xh) or (X-Yh) or (X hours) */
  hoursInline: /\((\d+(?:-\d+)?)\s*h(?:ours?)?\)/i,

  /** Matches sprint metadata lines */
  sprintStatus: /^\*\*Status:\*\*\s*(.+)$/,
  sprintStartDate: /^\*\*Sprint Start Date:\*\*\s*(.+)$/,
  sprintEndDate: /^\*\*Sprint End Date:\*\*\s*(.+)$/,
  sprintPlanned: /^\*\*Total Planned:\*\*\s*(.+)$/,
  sprintTheme: /^\*\*Theme:\*\*\s*(.+)$/,

  /** Matches metrics table row: | **Actual** | 0h | */
  metricsRow: /^\|\s*\*\*(\w[\w\s]*)\*\*\s*\|\s*(.+?)\s*\|$/,

  /** Matches markdown section header: ## Section Name */
  sectionHeader: /^##\s+(.+)$/,

  /** Matches numbered section: ### 1. Category Name (Xh) */
  numberedSection: /^###\s+\d+\.\s+(.+)$/,

  /** Matches completed date:   - **Completed:** YYYY-MM-DD */
  completedDate: /^\s+-\s+\*\*Completed:\*\*\s*(.+)$/i,

  /** Matches branch line:   - **Branch:** feat/xxx */
  branchLine: /^\s+-\s+\*\*Branch:\*\*\s*(.+)$/i,
};
