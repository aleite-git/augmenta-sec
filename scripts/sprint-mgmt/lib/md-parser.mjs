/**
 * Read-only markdown parser for all 4 sprint files.
 * Pure functions: take file content strings, return structured data.
 * Tracks line numbers for surgical editing.
 */

import { readFileSync } from 'fs';
import { PATTERNS } from './constants.mjs';

/**
 * Read a file and return its content, or empty string if missing.
 * @param {string} filePath
 * @returns {string}
 */
export function readFile(filePath) {
  try {
    return readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

/**
 * Parse CURRENT-SPRINT.md → sprint metadata + tickets.
 * @param {string} content - Raw file content
 * @returns {object} { number, title, status, startDate, endDate, planned, actual, theme, tickets[] }
 */
export function parseCurrentSprint(content) {
  const lines = content.split('\n');
  const sprint = {
    number: 0,
    title: '',
    status: '',
    startDate: '',
    endDate: '',
    planned: '',
    actual: '0h',
    theme: '',
    tickets: [],
  };

  let inMetrics = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Sprint header
    const headerMatch = trimmed.match(PATTERNS.sprintHeader);
    if (headerMatch) {
      sprint.number = parseInt(headerMatch[1], 10);
      sprint.title = headerMatch[2].trim();
      continue;
    }

    // Sprint metadata
    const statusMatch = trimmed.match(PATTERNS.sprintStatus);
    if (statusMatch && !inMetrics) {
      sprint.status = statusMatch[1].trim();
      continue;
    }
    const startMatch = trimmed.match(PATTERNS.sprintStartDate);
    if (startMatch) {
      sprint.startDate = startMatch[1].trim();
      continue;
    }
    const endMatch = trimmed.match(PATTERNS.sprintEndDate);
    if (endMatch) {
      sprint.endDate = endMatch[1].trim();
      continue;
    }
    const plannedMatch = trimmed.match(PATTERNS.sprintPlanned);
    if (plannedMatch) {
      sprint.planned = plannedMatch[1].trim();
      continue;
    }
    const themeMatch = trimmed.match(PATTERNS.sprintTheme);
    if (themeMatch) {
      sprint.theme = themeMatch[1].trim();
      continue;
    }

    // Metrics table
    if (trimmed.match(/^##\s+Sprint Metrics/)) {
      inMetrics = true;
      continue;
    }
    if (inMetrics && trimmed.startsWith('---')) {
      inMetrics = false;
      continue;
    }
    if (inMetrics) {
      const metricsMatch = trimmed.match(PATTERNS.metricsRow);
      if (metricsMatch) {
        const key = metricsMatch[1].trim().toLowerCase();
        const val = metricsMatch[2].trim();
        if (key === 'actual') sprint.actual = val;
        if (key === 'completed') sprint.completedCount = val;
      }
      continue;
    }

    // Ticket lines
    const ticketMatch = trimmed.match(PATTERNS.ticketLine);
    if (ticketMatch) {
      const ticket = parseTicketFromLine(ticketMatch, lines, i);
      ticket.scope = 'current';
      sprint.tickets.push(ticket);
    }
  }

  return sprint;
}

/**
 * Parse BACKLOG.md → sections with tickets.
 * @param {string} content
 * @returns {object} { sections: { name, tickets[] }[] }
 */
export function parseBacklog(content) {
  const lines = content.split('\n');
  const result = { sections: [] };
  let currentSection = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Section header (## Messages, ## Expenses, etc.)
    const sectionMatch = trimmed.match(PATTERNS.sectionHeader);
    if (sectionMatch) {
      const name = sectionMatch[1].trim();
      // Skip non-ticket sections
      if (['Recent Changes', 'Reference Documents'].some(s => name.startsWith(s))) continue;
      currentSection = { name, tickets: [] };
      result.sections.push(currentSection);
      continue;
    }

    // Ticket lines
    if (currentSection) {
      const ticketMatch = trimmed.match(PATTERNS.ticketLine);
      if (ticketMatch) {
        const ticket = parseTicketFromLine(ticketMatch, lines, i);
        ticket.scope = 'backlog';
        ticket.section = currentSection.name;
        currentSection.tickets.push(ticket);
      }
    }
  }

  return result;
}

/**
 * Parse BACKLOG-GROOMED.md → sprint plans with tickets.
 * @param {string} content
 * @returns {object} { sprints: { number, title, tickets[] }[], remaining: { categories: { name, tickets[] }[] } }
 */
export function parseGroomed(content) {
  const lines = content.split('\n');
  const result = { sprints: [], remaining: { categories: [] } };
  let currentSprint = null;
  let inRemaining = false;
  let currentCategory = null;
  let inTable = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Sprint section: ## Sprint 29 (Outlook — GROOMED) or ## Sprint 28 (COMPLETE ✅)
    const sprintSectionMatch = trimmed.match(/^##\s+Sprint\s+(\d+)\s*\((.+)\)/);
    if (sprintSectionMatch) {
      currentSprint = {
        number: parseInt(sprintSectionMatch[1], 10),
        status: sprintSectionMatch[2].trim(),
        theme: '',
        tickets: [],
      };
      result.sprints.push(currentSprint);
      inRemaining = false;
      inTable = false;
      continue;
    }

    // Theme line within a sprint section
    if (currentSprint && !inRemaining) {
      const themeMatch = trimmed.match(/^\*\*Theme:\*\*\s*(.+)/);
      if (themeMatch) {
        currentSprint.theme = themeMatch[1].trim();
        continue;
      }
    }

    // Remaining backlog section
    if (trimmed.match(/^##\s+Remaining Backlog/)) {
      inRemaining = true;
      currentSprint = null;
      inTable = false;
      continue;
    }

    // Category headers in remaining: ### Infrastructure & Architecture
    if (inRemaining) {
      const catMatch = trimmed.match(/^###\s+(.+)$/);
      if (catMatch) {
        currentCategory = { name: catMatch[1].trim(), tickets: [] };
        result.remaining.categories.push(currentCategory);
        inTable = false;
        continue;
      }
    }

    // Table rows (both sprint tables and remaining tables)
    if (trimmed.startsWith('|') && !trimmed.match(/^\|[-\s|]+\|$/)) {
      // Skip header row
      if (trimmed.includes('Ticket') && trimmed.includes('Hours')) {
        inTable = true;
        continue;
      }
      if (trimmed.includes('---')) {
        continue;
      }
      if (inTable) {
        const cells = trimmed.split('|').map(c => c.trim()).filter(Boolean);
        if (cells.length >= 4) {
          const idCell = currentSprint ? cells[1] : cells[0];
          const idMatch = idCell.match(/([A-Z]+-\d+(?:-P\d+)?)/);
          if (idMatch) {
            const ticket = {
              id: idMatch[1],
              title: cells[currentSprint ? 5 : 3] || '',
              hours: cells[currentSprint ? 2 : 1] || '',
              priority: cells[currentSprint ? 3 : 2] || '',
              done: idCell.includes('~~'),
              scope: 'groomed',
              startLine: i,
              endLine: i,
            };
            if (currentSprint) {
              currentSprint.tickets.push(ticket);
            } else if (currentCategory) {
              currentCategory.tickets.push(ticket);
            }
          }
        }
      }
    }

    // Ticket lines (checkbox format, if any)
    const ticketMatch = trimmed.match(PATTERNS.ticketLine);
    if (ticketMatch) {
      const ticket = parseTicketFromLine(ticketMatch, lines, i);
      ticket.scope = 'groomed';
      if (currentSprint) {
        currentSprint.tickets.push(ticket);
      }
    }
  }

  return result;
}

/**
 * Parse BACKLOG-DELIVERED.md → completed sprints with tickets.
 * @param {string} content
 * @returns {object} { totalSprints, totalEffort, totalTickets, sprints: { number, title, tickets[] }[] }
 */
export function parseDelivered(content) {
  const lines = content.split('\n');
  const result = {
    totalSprints: 0,
    totalEffort: '',
    totalTickets: '',
    sprints: [],
  };

  let currentSprint = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Total sprints
    const totalSprintsMatch = trimmed.match(/\*\*Total Sprints Completed:\*\*\s*(\d+)/);
    if (totalSprintsMatch) {
      result.totalSprints = parseInt(totalSprintsMatch[1], 10);
      continue;
    }

    // Total effort
    const totalEffortMatch = trimmed.match(/\*\*Total Effort Delivered:\*\*\s*(.+)/);
    if (totalEffortMatch) {
      result.totalEffort = totalEffortMatch[1].trim();
      continue;
    }

    // Total tickets
    const totalTicketsMatch = trimmed.match(/\*\*Total Tickets Delivered:\*\*\s*(.+)/);
    if (totalTicketsMatch) {
      result.totalTickets = totalTicketsMatch[1].trim();
      continue;
    }

    // Sprint header: ## Sprint 29: Production Ops ✅ COMPLETE
    const sprintMatch = trimmed.match(/^##\s+Sprint\s+(\d+):\s*(.+?)(?:\s*✅.*)?$/);
    if (sprintMatch) {
      currentSprint = {
        number: parseInt(sprintMatch[1], 10),
        title: sprintMatch[2].trim(),
        tickets: [],
      };
      result.sprints.push(currentSprint);
      continue;
    }

    // Delivered ticket: 1. ✅ **TICKET-ID** - Title (Xh) - **PX**
    if (currentSprint) {
      const deliveredMatch = trimmed.match(PATTERNS.deliveredTicket);
      if (deliveredMatch) {
        const ticket = {
          id: deliveredMatch[2],
          title: deliveredMatch[3].trim(),
          done: true,
          scope: 'delivered',
          startLine: i,
          endLine: i,
        };
        // Extract hours and priority from title
        const hoursMatch = ticket.title.match(PATTERNS.hoursInline);
        if (hoursMatch) ticket.hours = hoursMatch[1];
        const prioMatch = ticket.title.match(PATTERNS.priorityInline);
        if (prioMatch) ticket.priority = prioMatch[1];
        currentSprint.tickets.push(ticket);
        continue;
      }

      // Also match checkbox format: 1. [x] **TICKET-ID** ...
      const ticketMatch = trimmed.match(PATTERNS.ticketLine);
      if (ticketMatch) {
        const ticket = parseTicketFromLine(ticketMatch, lines, i);
        ticket.scope = 'delivered';
        ticket.done = true;
        if (currentSprint) currentSprint.tickets.push(ticket);
      }
    }
  }

  return result;
}

/**
 * Parse a ticket from a regex match on its first line, then scan indented sub-lines.
 * @param {RegExpMatchArray} match - From PATTERNS.ticketLine
 * @param {string[]} lines - All lines in the file
 * @param {number} lineIndex - Index of the matched line
 * @returns {object} ticket
 */
function parseTicketFromLine(match, lines, lineIndex) {
  const indent = match[1].length;
  const done = match[2] === 'x';
  const id = match[3];
  let title = match[4].trim();

  // Extract inline metadata from title
  let priority = null;
  let effort = null;
  let hours = null;

  const prioMatch = title.match(PATTERNS.priorityInline);
  if (prioMatch) priority = prioMatch[1];

  const effortMatch = title.match(PATTERNS.effortInline);
  if (effortMatch) effort = effortMatch[1];

  const hoursMatch = title.match(PATTERNS.hoursInline);
  if (hoursMatch) hours = hoursMatch[1];

  // Clean title: remove trailing markers
  title = title
    .replace(/\s*-\s*\*\*P\d\*\*.*$/i, '')
    .replace(/\s*-\s*\*\*EFFORT:\s*\d+\*\*.*$/i, '')
    .replace(/\s*✅\s*$/, '')
    .replace(/\s*~~(.+)~~\s*/, '$1')
    .trim();

  // Scan sub-lines for status, completed date, branch, actual hours
  let status = null;
  let completedDate = null;
  let branch = null;
  let actualHours = null;
  let endLine = lineIndex;

  for (let j = lineIndex + 1; j < lines.length; j++) {
    const subLine = lines[j];
    // Stop if we hit a line with equal or less indentation that's not empty
    if (subLine.trim() === '') {
      // Empty lines within a block are OK, but two in a row means end
      if (j + 1 < lines.length && lines[j + 1].trim() === '') break;
      continue;
    }

    const subIndent = subLine.match(/^(\s*)/)[1].length;
    if (subIndent <= indent && subLine.trim() !== '') break;

    endLine = j;

    const statusMatch = subLine.match(PATTERNS.statusLine);
    if (statusMatch) status = statusMatch[1].trim();

    const compMatch = subLine.match(PATTERNS.completedDate);
    if (compMatch) completedDate = compMatch[1].trim();

    const branchMatch = subLine.match(PATTERNS.branchLine);
    if (branchMatch) branch = branchMatch[1].trim();

    const actualMatch = subLine.match(/^\s+-\s+\*\*Actual:\*\*\s*(\d+)h?/i);
    if (actualMatch) actualHours = parseInt(actualMatch[1], 10);
  }

  return {
    id,
    title,
    done,
    priority,
    effort,
    hours,
    status,
    completedDate,
    branch,
    actualHours,
    startLine: lineIndex,
    endLine,
  };
}

/**
 * Find a ticket by ID across all files.
 * @param {string} id - Ticket ID (e.g. "SPIKE-002")
 * @param {object} files - Map of scope → file content
 * @returns {object|null} ticket with scope, or null
 */
export function findTicket(id, files) {
  const upper = id.toUpperCase();

  // Search current sprint
  if (files.current) {
    const sprint = parseCurrentSprint(files.current);
    const found = sprint.tickets.find(t => t.id.toUpperCase() === upper);
    if (found) return found;
  }

  // Search backlog
  if (files.backlog) {
    const backlog = parseBacklog(files.backlog);
    for (const section of backlog.sections) {
      const found = section.tickets.find(t => t.id.toUpperCase() === upper);
      if (found) return found;
    }
  }

  // Search groomed
  if (files.groomed) {
    const groomed = parseGroomed(files.groomed);
    for (const sprint of groomed.sprints) {
      const found = sprint.tickets.find(t => t.id.toUpperCase() === upper);
      if (found) return found;
    }
    for (const cat of groomed.remaining.categories) {
      const found = cat.tickets.find(t => t.id.toUpperCase() === upper);
      if (found) return found;
    }
  }

  // Search delivered
  if (files.delivered) {
    const delivered = parseDelivered(files.delivered);
    for (const sprint of delivered.sprints) {
      const found = sprint.tickets.find(t => t.id.toUpperCase() === upper);
      if (found) return found;
    }
  }

  return null;
}

/**
 * Collect all tickets from a specific scope.
 * @param {string} scope - 'backlog' | 'groomed' | 'current' | 'delivered'
 * @param {string} content - File content
 * @returns {object[]} tickets
 */
export function listTickets(scope, content) {
  switch (scope) {
    case 'current': {
      const sprint = parseCurrentSprint(content);
      return sprint.tickets;
    }
    case 'backlog': {
      const backlog = parseBacklog(content);
      return backlog.sections.flatMap(s => s.tickets);
    }
    case 'groomed': {
      const groomed = parseGroomed(content);
      const sprintTickets = groomed.sprints.flatMap(s => s.tickets);
      const remainingTickets = groomed.remaining.categories.flatMap(c => c.tickets);
      return [...sprintTickets, ...remainingTickets];
    }
    case 'delivered': {
      const delivered = parseDelivered(content);
      return delivered.sprints.flatMap(s => s.tickets);
    }
    default:
      return [];
  }
}
