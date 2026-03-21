/**
 * sprint start <N> — Promote a groomed sprint to CURRENT-SPRINT.md.
 * Reads from BACKLOG-GROOMED.md, generates a new CURRENT-SPRINT.md.
 */

import { readFileSync, writeFileSync } from 'fs';
import { parseGroomed, parseCurrentSprint } from '../lib/md-parser.mjs';
import { FILES } from '../lib/constants.mjs';

/**
 * @param {number} sprintNumber
 * @param {object} flags
 * @returns {string}
 */
export function sprintStart(sprintNumber, flags = {}) {
  const groomedPath = flags.groomedFile || FILES.groomed;
  const currentPath = flags.currentFile || FILES.current;

  // Verify current sprint is complete or empty
  let previousSprintSummary = '';
  try {
    const currentContent = readFileSync(currentPath, 'utf8');
    if (currentContent.trim()) {
      const current = parseCurrentSprint(currentContent);
      const incomplete = current.tickets.filter(t => !t.done);
      if (incomplete.length > 0) {
        throw new Error(
          `Current sprint ${current.number} has ${incomplete.length} incomplete ticket(s): ${incomplete.map(t => t.id).join(', ')}. Close it first with 'sprint close'.`
        );
      }
      // Capture previous sprint summary for metadata
      const total = current.tickets.length;
      const done = current.tickets.filter(t => t.done).length;
      const actual = current.actual || '0h';
      previousSprintSummary = `Sprint ${current.number} COMPLETE (${Math.round(done / total * 100)}% - ${done}/${total} items, ~${actual})`;
    }
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }

  // Find groomed sprint
  const groomedContent = readFileSync(groomedPath, 'utf8');
  const groomed = parseGroomed(groomedContent);
  const targetSprint = groomed.sprints.find(s => s.number === sprintNumber);
  if (!targetSprint) {
    throw new Error(`Sprint ${sprintNumber} not found in BACKLOG-GROOMED.md`);
  }

  const date = new Date().toISOString().split('T')[0];
  const totalHours = targetSprint.tickets.reduce((sum, t) => {
    const h = t.hours ? parseInt(t.hours, 10) : 0;
    return sum + (isNaN(h) ? 0 : h);
  }, 0);

  // Generate CURRENT-SPRINT.md
  const ticketLines = targetSprint.tickets.map((t, idx) => {
    const prio = t.priority ? ` - **${t.priority}**` : '';
    const effort = t.hours ? ` - **EFFORT: ${parseInt(t.hours, 10) || t.hours}**` : '';
    return `${idx + 1}. [ ] **${t.id}** - ${t.title}${prio}${effort}\n   - **Status:** NOT STARTED`;
  });

  const sprintTitle = targetSprint.theme || 'Sprint ' + sprintNumber;
  const themeTag = targetSprint.theme ? `\n**Theme:** ${targetSprint.theme}` : '';
  const prevTag = previousSprintSummary ? `\n**Previous Sprint:** ${previousSprintSummary}` : '';

  const content = `# Sprint ${sprintNumber}: ${sprintTitle}

**Sprint Duration:** TBD
**Sprint Start Date:** ${date}
**Sprint End Date:** TBD
**Status:** IN PROGRESS
**Total Planned:** ~${totalHours} hours (${targetSprint.tickets.length} tickets)${themeTag}${prevTag}

---

## Sprint Backlog

${ticketLines.join('\n\n')}

---

## Sprint Metrics

### Progress Tracking
| Metric | Value |
|--------|-------|
| **Planned** | ~${totalHours} hours (${targetSprint.tickets.length} tickets) |
| **Actual** | 0h |
| **Completed** | 0/${targetSprint.tickets.length} tickets |
| **In Progress** | 0 |
| **Remaining** | ${targetSprint.tickets.length} |
| **Completion Rate** | 0% |

---

**Document Version:** 1.0
**Last Updated:** ${date}
**Sprint Master:** Co-Parent Team
`;

  writeFileSync(currentPath, content);
  return `✓ Sprint ${sprintNumber} started with ${targetSprint.tickets.length} tickets (~${totalHours}h)`;
}
