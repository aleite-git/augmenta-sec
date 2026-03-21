/**
 * Team activity module (ASEC-084).
 *
 * Reads sprint files, checks open branches, and detects freezes to
 * provide a unified view of team security activity.
 */

import {readFile, access} from 'node:fs/promises';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Platform = 'github' | 'gitlab' | 'bitbucket';

export interface SprintTicket {
  id: string;
  title: string;
  status: 'todo' | 'in-progress' | 'done';
  priority?: string;
  estimate?: string;
}

export interface SprintInfo {
  number: number;
  tickets: SprintTicket[];
  totalTickets: number;
  doneCount: number;
  inProgressCount: number;
  todoCount: number;
}

export interface BranchInfo {
  name: string;
  lastCommit: string;
  daysSinceLastCommit: number;
}

export interface FreezeInfo {
  detected: boolean;
  reason?: string;
  staleBranches: BranchInfo[];
}

export interface TeamActivity {
  sprint: SprintInfo | null;
  openBranches: BranchInfo[];
  freeze: FreezeInfo;
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Days without commits before a branch is considered stale. */
const STALE_BRANCH_THRESHOLD_DAYS = 14;

/** Minimum stale branches to trigger a freeze detection. */
const FREEZE_STALE_BRANCH_MIN = 3;

// ---------------------------------------------------------------------------
// Sprint file parser
// ---------------------------------------------------------------------------

/**
 * Parses a CURRENT-SPRINT.md file into structured sprint data.
 * Expects a markdown file with ticket entries in the format:
 *   - [x] **ID** — title (optional metadata)
 *   - [ ] **ID** — title
 */
export function parseSprintFile(content: string): SprintInfo {
  const lines = content.split('\n');

  // Try to extract sprint number from heading
  let sprintNumber = 0;
  const headingMatch = content.match(
    /#+\s*Sprint\s+(\d+)/i,
  );
  if (headingMatch) {
    sprintNumber = parseInt(headingMatch[1], 10);
  }

  const tickets: SprintTicket[] = [];

  for (const line of lines) {
    const ticketMatch = line.match(
      /^[-*]\s*\[([ xX])\]\s*\*{0,2}([A-Z]+-\d+)\*{0,2}\s*[—–-]\s*(.+)/,
    );
    if (!ticketMatch) continue;

    const checked = ticketMatch[1].toLowerCase() === 'x';
    const id = ticketMatch[2];
    const rest = ticketMatch[3].trim();

    // Extract priority if present
    const priorityMatch = rest.match(/\(?(P[0-3])\)?/);
    const estimateMatch = rest.match(/(\d+h)/);

    // Determine status: checked = done, otherwise check for keywords
    let status: SprintTicket['status'] = 'todo';
    if (checked) {
      status = 'done';
    } else if (
      /in[- ]?progress|wip|started/i.test(rest) ||
      /🔄|🚧/.test(rest)
    ) {
      status = 'in-progress';
    }

    const title = rest
      .replace(/\(?(P[0-3])\)?/, '')
      .replace(/\d+h/, '')
      .replace(/[—–-]\s*$/, '')
      .replace(/🔄|🚧|✅/, '')
      .trim();

    tickets.push({
      id,
      title,
      status,
      priority: priorityMatch?.[1],
      estimate: estimateMatch?.[1],
    });
  }

  return {
    number: sprintNumber,
    tickets,
    totalTickets: tickets.length,
    doneCount: tickets.filter(t => t.status === 'done').length,
    inProgressCount: tickets.filter(t => t.status === 'in-progress').length,
    todoCount: tickets.filter(t => t.status === 'todo').length,
  };
}

// ---------------------------------------------------------------------------
// Git helpers
// ---------------------------------------------------------------------------

/** Lists local branches with their last commit dates. */
export async function getLocalBranches(
  rootDir: string,
): Promise<BranchInfo[]> {
  try {
    const {stdout} = await execFileAsync(
      'git',
      [
        'for-each-ref',
        '--format=%(refname:short)\t%(committerdate:iso)',
        'refs/heads/',
      ],
      {cwd: rootDir},
    );

    const now = Date.now();
    const branches: BranchInfo[] = [];

    for (const line of stdout.trim().split('\n')) {
      if (!line.trim()) continue;
      const [name, dateStr] = line.split('\t');
      if (!name || !dateStr) continue;

      const commitDate = new Date(dateStr).getTime();
      const daysSince = Math.floor(
        (now - commitDate) / (1000 * 60 * 60 * 24),
      );

      branches.push({
        name,
        lastCommit: dateStr.trim(),
        daysSinceLastCommit: daysSince,
      });
    }

    return branches;
  } catch {
    return [];
  }
}

/** Returns only open (non-main/master) branches. */
export function filterOpenBranches(branches: BranchInfo[]): BranchInfo[] {
  const defaultBranches = new Set(['main', 'master', 'develop', 'dev']);
  return branches.filter(b => !defaultBranches.has(b.name));
}

// ---------------------------------------------------------------------------
// Freeze detection
// ---------------------------------------------------------------------------

/**
 * Detects code freezes by analyzing branch staleness and sprint progress.
 *
 * A freeze is detected when:
 * - Multiple branches have had no activity for > 14 days, OR
 * - The sprint has zero in-progress or done tickets, OR
 * - All branches are stale.
 */
export function detectFreeze(
  sprint: SprintInfo | null,
  openBranches: BranchInfo[],
): FreezeInfo {
  const staleBranches = openBranches.filter(
    b => b.daysSinceLastCommit >= STALE_BRANCH_THRESHOLD_DAYS,
  );

  // Check if sprint shows no activity
  if (
    sprint &&
    sprint.totalTickets > 0 &&
    sprint.doneCount === 0 &&
    sprint.inProgressCount === 0
  ) {
    return {
      detected: true,
      reason:
        'Sprint has tickets but none are in-progress or done — possible freeze.',
      staleBranches,
    };
  }

  // Check for widespread branch staleness
  if (
    staleBranches.length >= FREEZE_STALE_BRANCH_MIN &&
    openBranches.length > 0 &&
    staleBranches.length === openBranches.length
  ) {
    return {
      detected: true,
      reason: `All ${staleBranches.length} open branches are stale (no commits in ${STALE_BRANCH_THRESHOLD_DAYS}+ days).`,
      staleBranches,
    };
  }

  if (staleBranches.length >= FREEZE_STALE_BRANCH_MIN) {
    return {
      detected: true,
      reason: `${staleBranches.length} branches have had no commits in ${STALE_BRANCH_THRESHOLD_DAYS}+ days.`,
      staleBranches,
    };
  }

  return {
    detected: false,
    staleBranches,
  };
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Gathers team activity: sprint progress, open branches, and freeze status.
 *
 * @param rootDir - Root directory of the target repository.
 * @param _platform - Git platform (reserved for future remote branch queries).
 * @returns Aggregated team activity data.
 */
export async function getTeamActivity(
  rootDir: string,
  _platform: Platform = 'github',
): Promise<TeamActivity> {
  // Read sprint file
  let sprint: SprintInfo | null = null;
  const sprintPath = join(rootDir, 'CURRENT-SPRINT.md');

  try {
    await access(sprintPath);
    const content = await readFile(sprintPath, 'utf-8');
    sprint = parseSprintFile(content);
  } catch {
    // No sprint file — that's okay
  }

  // Get branch info
  const allBranches = await getLocalBranches(rootDir);
  const openBranches = filterOpenBranches(allBranches);

  // Detect freeze
  const freeze = detectFreeze(sprint, openBranches);

  return {
    sprint,
    openBranches,
    freeze,
    generatedAt: new Date().toISOString(),
  };
}
