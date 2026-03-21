/**
 * Output formatters — produce concise, AI-optimized text.
 * All functions are pure: take data, return strings.
 */

/**
 * Format sprint status summary (~5-10 lines).
 * @param {object} sprint - Parsed sprint metadata + tickets
 * @returns {string}
 */
export function formatSprintStatus(sprint) {
  const { number, title, status, tickets } = sprint;
  const done = tickets.filter(t => t.done).length;
  const total = tickets.length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  const plannedHours = sprint.planned || '?';

  // Compute actual from ticket data if metrics table hasn't been updated
  const ticketActualSum = tickets.reduce((sum, t) => sum + (t.actualHours || 0), 0);
  const metricsActual = sprint.actual && sprint.actual !== '0h' ? sprint.actual : null;
  const actualHours = metricsActual || (ticketActualSum > 0 ? `${ticketActualSum}h` : '0h');

  const lines = [
    `Sprint ${number}: ${title}`,
    `Status: ${status} | ${done}/${total} done | ${pct}%`,
    `Planned: ${plannedHours} | Actual: ${actualHours}`,
    '---',
  ];

  for (const t of tickets) {
    const check = t.done ? '[x]' : '[ ]';
    const effort = t.effort ? ` (${t.effort}h)` : '';
    // Show DONE for completed tickets regardless of sub-line status text
    const sts = t.done ? ' - DONE' : (t.status ? ` - ${t.status}` : '');
    lines.push(`${check} ${t.id} - ${t.title}${effort}${sts}`);
  }

  return lines.join('\n');
}

/**
 * Format a single ticket for display.
 * @param {object} ticket - Parsed ticket
 * @returns {string}
 */
export function formatTicket(ticket) {
  const check = ticket.done ? '[x]' : '[ ]';
  const parts = [`${check} ${ticket.id}: ${ticket.title}`];

  if (ticket.priority) parts.push(`Priority: ${ticket.priority}`);
  if (ticket.effort) parts.push(`Effort: ${ticket.effort}h`);
  if (ticket.status) parts.push(`Status: ${ticket.status}`);
  if (ticket.scope) parts.push(`File: ${ticket.scope}`);
  if (ticket.completedDate) parts.push(`Completed: ${ticket.completedDate}`);

  return parts.join(' | ');
}

/**
 * Format a list of tickets (one line each).
 * @param {object[]} tickets - Array of parsed tickets
 * @param {string} [header] - Optional header line
 * @returns {string}
 */
export function formatTicketList(tickets, header) {
  const lines = [];
  if (header) lines.push(header, '---');
  if (tickets.length === 0) {
    lines.push('(no tickets)');
    return lines.join('\n');
  }
  for (const t of tickets) {
    lines.push(formatTicket(t));
  }
  return lines.join('\n');
}
