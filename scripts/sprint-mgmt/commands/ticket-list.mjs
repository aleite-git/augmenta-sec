/**
 * ticket list [scope] — One line per ticket from specified scope.
 * Scope: backlog | groomed | current | delivered | all (default)
 */

import { readFile, listTickets as listFromScope } from '../lib/md-parser.mjs';
import { formatTicketList } from '../lib/format.mjs';
import { FILES, SCOPES } from '../lib/constants.mjs';

/**
 * @param {string} scope - 'backlog' | 'groomed' | 'current' | 'delivered' | 'all'
 * @param {object} flags
 * @returns {string}
 */
export function ticketList(scope = 'all', flags = {}) {
  if (scope === 'all') {
    const lines = [];
    for (const s of SCOPES) {
      const filePath = flags[`${s}File`] || FILES[s];
      const content = readFile(filePath);
      const tickets = listFromScope(s, content);
      if (tickets.length > 0) {
        lines.push(formatTicketList(tickets, `[${s.toUpperCase()}]`));
      }
    }
    return lines.length > 0 ? lines.join('\n\n') : '(no tickets found)';
  }

  if (!SCOPES.includes(scope)) {
    throw new Error(`Invalid scope: ${scope}. Use: ${SCOPES.join(', ')}, all`);
  }

  const filePath = flags[`${scope}File`] || FILES[scope];
  const content = readFile(filePath);
  const tickets = listFromScope(scope, content);
  return formatTicketList(tickets, `[${scope.toUpperCase()}]`);
}
