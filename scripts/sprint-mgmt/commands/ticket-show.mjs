/**
 * ticket show <ID> — Find and display a ticket by ID across all files.
 */

import { readFile, findTicket } from '../lib/md-parser.mjs';
import { formatTicket } from '../lib/format.mjs';
import { FILES } from '../lib/constants.mjs';

/**
 * @param {string} id - Ticket ID (e.g. "SPIKE-002")
 * @param {object} flags
 * @returns {string}
 */
export function ticketShow(id, flags = {}) {
  const files = {};
  for (const [scope, defaultPath] of Object.entries(FILES)) {
    files[scope] = readFile(flags[`${scope}File`] || defaultPath);
  }

  const ticket = findTicket(id, files);
  if (!ticket) {
    return `Ticket ${id} not found in any file.`;
  }

  return formatTicket(ticket);
}
