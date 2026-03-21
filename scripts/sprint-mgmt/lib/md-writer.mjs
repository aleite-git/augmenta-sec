/**
 * Surgical markdown editing operations.
 * Pure functions: take content strings + parameters, return modified strings.
 */

import { parseCurrentSprint, parseBacklog, parseDelivered } from './md-parser.mjs';
import { PATTERNS } from './constants.mjs';

/**
 * Replace a range of lines in content.
 * @param {string} content
 * @param {number} startLine - 0-indexed
 * @param {number} endLine - 0-indexed (inclusive)
 * @param {string[]} newLines - Replacement lines
 * @returns {string}
 */
export function replaceLines(content, startLine, endLine, newLines) {
  const lines = content.split('\n');
  lines.splice(startLine, endLine - startLine + 1, ...newLines);
  return lines.join('\n');
}

/**
 * Mark a ticket as done in CURRENT-SPRINT.md.
 * Updates: checkbox, status, adds completed date, updates metrics.
 * @param {string} content - CURRENT-SPRINT.md content
 * @param {string} ticketId
 * @param {object} opts
 * @param {string} [opts.actual] - Actual hours (e.g. "10h")
 * @param {string} [opts.date] - Completion date (default: today)
 * @returns {string} Updated content
 */
export function markTicketDone(content, ticketId, opts = {}) {
  const lines = content.split('\n');
  const date = opts.date || new Date().toISOString().split('T')[0];
  const upper = ticketId.toUpperCase();
  let ticketStartLine = -1;
  let ticketEndLine = -1;
  let statusLineIdx = -1;

  // Find the ticket line
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    const match = trimmed.match(PATTERNS.ticketLine);
    if (match && match[3].toUpperCase() === upper) {
      ticketStartLine = i;
      // Change [ ] to [x]
      lines[i] = lines[i].replace(/\[\s\]/, '[x]');
      // Add ✅ if not present
      if (!lines[i].includes('✅')) {
        lines[i] = lines[i].trimEnd() + ' ✅';
      }

      // Scan sub-lines
      const indent = lines[i].match(/^(\s*)/)[1].length;
      for (let j = i + 1; j < lines.length; j++) {
        const subTrimmed = lines[j].trim();
        if (subTrimmed === '') {
          if (j + 1 < lines.length && lines[j + 1].trim() === '') break;
          continue;
        }
        const subIndent = lines[j].match(/^(\s*)/)[1].length;
        if (subIndent <= indent && subTrimmed !== '') break;
        ticketEndLine = j;

        if (subTrimmed.match(PATTERNS.statusLine)) {
          statusLineIdx = j;
        }
      }
      if (ticketEndLine === -1) ticketEndLine = i;
      break;
    }
  }

  if (ticketStartLine === -1) {
    throw new Error(`Ticket ${ticketId} not found in current sprint.`);
  }

  // Update status line
  const indent = '   ';
  if (statusLineIdx >= 0) {
    lines[statusLineIdx] = `${indent}- **Status:** ✅ COMPLETE - DEPLOYED`;
  }

  // Add completed date after status
  const insertIdx = statusLineIdx >= 0 ? statusLineIdx + 1 : ticketEndLine + 1;
  const newSubLines = [`${indent}- **Completed:** ${date}`];
  if (opts.actual) {
    newSubLines.push(`${indent}- **Actual:** ${opts.actual}`);
  }
  lines.splice(insertIdx, 0, ...newSubLines);

  // Update metrics table
  const result = updateMetrics(lines.join('\n'));
  return result;
}

/**
 * Recalculate and update the metrics table in CURRENT-SPRINT.md.
 * @param {string} content
 * @returns {string}
 */
export function updateMetrics(content) {
  const sprint = parseCurrentSprint(content);
  const total = sprint.tickets.length;
  const done = sprint.tickets.filter(t => t.done).length;
  const inProgress = sprint.tickets.filter(t => !t.done && t.status && t.status.toUpperCase().includes('PROGRESS')).length;
  const remaining = total - done;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  // Sum actual hours from completed tickets
  const actualSum = sprint.tickets.reduce((sum, t) => {
    if (t.done && t.actualHours) return sum + t.actualHours;
    return sum;
  }, 0);
  const actualStr = actualSum > 0 ? `${actualSum}h` : '0h';

  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    const metricsMatch = trimmed.match(PATTERNS.metricsRow);
    if (metricsMatch) {
      const key = metricsMatch[1].trim().toLowerCase();
      if (key === 'actual') {
        lines[i] = lines[i].replace(/\|[^|]+\|$/, `| ${actualStr} |`);
      } else if (key === 'completed') {
        lines[i] = lines[i].replace(/\|[^|]+\|$/, `| ${done}/${total} tickets |`);
      } else if (key === 'in progress') {
        lines[i] = lines[i].replace(/\|[^|]+\|$/, `| ${inProgress} |`);
      } else if (key === 'remaining') {
        lines[i] = lines[i].replace(/\|[^|]+\|$/, `| ${remaining} |`);
      } else if (key === 'completion rate') {
        lines[i] = lines[i].replace(/\|[^|]+\|$/, `| ${pct}% |`);
      }
    }
  }

  // Update status if 100%
  if (done === total && total > 0) {
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].match(/^\*\*Status:\*\*/)) {
        lines[i] = '**Status:** COMPLETE';
        break;
      }
    }
  }

  return lines.join('\n');
}

/**
 * Insert a new ticket into BACKLOG.md under specified section.
 * @param {string} content - BACKLOG.md content
 * @param {string} ticketId
 * @param {string} title
 * @param {object} opts
 * @param {string} [opts.section] - Section name (e.g. "Development Tools")
 * @param {string} [opts.priority] - Priority (P0-P3)
 * @param {string} [opts.hours] - Estimated hours
 * @returns {string}
 */
export function insertBacklogTicket(content, ticketId, title, opts = {}) {
  const lines = content.split('\n');
  const section = opts.section || 'Development Tools';
  const priority = opts.priority || 'P3';
  const hours = opts.hours || 'TBD';
  const date = new Date().toISOString().split('T')[0];

  // Find the section
  let sectionLine = -1;
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].trim().match(PATTERNS.sectionHeader);
    if (match && match[1].trim() === section) {
      sectionLine = i;
      break;
    }
  }

  if (sectionLine === -1) {
    throw new Error(`Section "${section}" not found in BACKLOG.md`);
  }

  // Find last ticket in section (or next section boundary / ---)
  let insertAt = sectionLine + 1;
  for (let i = sectionLine + 1; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.match(PATTERNS.sectionHeader) || trimmed === '---') {
      insertAt = i;
      break;
    }
    if (trimmed.match(PATTERNS.ticketLine)) {
      // Find end of this ticket's sub-items
      for (let j = i + 1; j < lines.length; j++) {
        const subTrimmed = lines[j].trim();
        if (subTrimmed === '' || subTrimmed.match(PATTERNS.ticketLine) || subTrimmed === '---' || subTrimmed.match(PATTERNS.sectionHeader)) {
          insertAt = j;
          break;
        }
      }
    }
  }

  const ticketLines = [
    '',
    `- [ ] **${ticketId}**: ${title} (${hours} hours)`,
    `  - **Priority:** ${priority}`,
    `  - **Created:** ${date}`,
  ];

  lines.splice(insertAt, 0, ...ticketLines);
  return lines.join('\n');
}

/**
 * Remove a ticket from a file by ID.
 * @param {string} content
 * @param {string} ticketId
 * @returns {{ content: string, removed: string }} Updated content + removed text
 */
export function removeTicket(content, ticketId) {
  const lines = content.split('\n');
  const upper = ticketId.toUpperCase();

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    const match = trimmed.match(PATTERNS.ticketLine);
    if (match && match[3].toUpperCase() === upper) {
      const indent = lines[i].match(/^(\s*)/)[1].length;
      let endLine = i;

      // Find end of ticket block
      for (let j = i + 1; j < lines.length; j++) {
        const subTrimmed = lines[j].trim();
        if (subTrimmed === '') {
          endLine = j;
          break;
        }
        const subIndent = lines[j].match(/^(\s*)/)[1].length;
        if (subIndent <= indent && subTrimmed !== '') break;
        endLine = j;
      }

      const removed = lines.slice(i, endLine + 1).join('\n');
      lines.splice(i, endLine - i + 1);
      return { content: lines.join('\n'), removed };
    }
  }

  throw new Error(`Ticket ${ticketId} not found.`);
}

/**
 * Set the sprint-level status field.
 * @param {string} content
 * @param {string} newStatus
 * @returns {string}
 */
export function setSprintStatus(content, newStatus) {
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].match(/^\*\*Status:\*\*/)) {
      lines[i] = `**Status:** ${newStatus}`;
      break;
    }
  }
  return lines.join('\n');
}

/**
 * Append a sprint section to BACKLOG-DELIVERED.md.
 * @param {string} content - BACKLOG-DELIVERED.md content
 * @param {object} sprint - Sprint data from parseCurrentSprint
 * @param {string} date - Completion date
 * @returns {string}
 */
export function appendDeliveredSprint(content, sprint, date) {
  const lines = content.split('\n');

  // Update totals in header
  const delivered = parseDelivered(content);
  const newSprintCount = delivered.totalSprints + 1;
  const newTicketCount = sprint.tickets.length;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].match(/\*\*Total Sprints Completed:\*\*/)) {
      lines[i] = `**Total Sprints Completed:** ${newSprintCount} sprints`;
    }
  }

  // Build sprint section
  const sprintSection = [
    '',
    `## Sprint ${sprint.number}: ${sprint.title} ✅ COMPLETE`,
    '',
    `**Completed:** ${date}`,
    `**Status:** ✅ **COMPLETE** (${newTicketCount}/${newTicketCount} tickets delivered)`,
    '',
    `### Completed Items (Sprint ${sprint.number})`,
    '',
  ];

  sprint.tickets.forEach((t, idx) => {
    const effort = t.effort ? ` (${t.effort}h)` : '';
    const prio = t.priority ? ` - **${t.priority}**` : '';
    sprintSection.push(`${idx + 1}. ✅ **${t.id}** - ${t.title}${effort}${prio}`);
  });

  sprintSection.push('', '---');

  // Insert after the first --- (after header)
  let insertAt = -1;
  let dashCount = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      dashCount++;
      if (dashCount === 1) {
        insertAt = i + 1;
        break;
      }
    }
  }

  if (insertAt === -1) insertAt = lines.length;
  lines.splice(insertAt, 0, ...sprintSection);
  return lines.join('\n');
}
