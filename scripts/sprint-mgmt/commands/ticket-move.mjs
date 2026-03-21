/**
 * ticket move <ID> <target> — Transfer a ticket between markdown files.
 * Target: backlog | groomed | current | delivered
 */

import { readFileSync, writeFileSync } from 'fs';
import { removeTicket, insertBacklogTicket } from '../lib/md-writer.mjs';
import { findTicket, readFile } from '../lib/md-parser.mjs';
import { FILES, SCOPES } from '../lib/constants.mjs';

/**
 * @param {string} id - Ticket ID
 * @param {string} target - Target scope
 * @param {object} flags
 * @returns {string}
 */
export function ticketMove(id, target, flags = {}) {
  if (!SCOPES.includes(target)) {
    throw new Error(`Invalid target: ${target}. Use: ${SCOPES.join(', ')}`);
  }

  // Find ticket across all files
  const files = {};
  const filePaths = {};
  for (const scope of SCOPES) {
    const fp = flags[`${scope}File`] || FILES[scope];
    filePaths[scope] = fp;
    files[scope] = readFile(fp);
  }

  const ticket = findTicket(id, files);
  if (!ticket) {
    throw new Error(`Ticket ${id} not found in any file.`);
  }

  if (ticket.scope === target) {
    return `Ticket ${id} is already in ${target}.`;
  }

  // Remove from source
  const sourceFile = filePaths[ticket.scope];
  const sourceContent = readFileSync(sourceFile, 'utf8');
  const { content: updatedSource } = removeTicket(sourceContent, id);
  writeFileSync(sourceFile, updatedSource);

  // Add to target
  if (target === 'backlog') {
    const targetContent = readFileSync(filePaths.backlog, 'utf8');
    const updated = insertBacklogTicket(targetContent, id, ticket.title, {
      section: flags.section || 'Development Tools',
      priority: ticket.priority,
      hours: ticket.hours || ticket.effort,
    });
    writeFileSync(filePaths.backlog, updated);
  } else {
    // For groomed/current/delivered, append a simple entry
    const targetFile = filePaths[target];
    const targetContent = readFileSync(targetFile, 'utf8');
    const check = ticket.done ? '[x]' : '[ ]';
    const entry = `\n- ${check} **${id}**: ${ticket.title}`;
    writeFileSync(targetFile, targetContent + entry + '\n');
  }

  return `✓ ${id} moved from ${ticket.scope} → ${target}`;
}
