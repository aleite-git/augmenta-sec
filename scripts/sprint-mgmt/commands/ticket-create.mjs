/**
 * ticket create <ID> <title> — Add a new ticket to BACKLOG.md.
 */

import { readFileSync, writeFileSync } from 'fs';
import { insertBacklogTicket } from '../lib/md-writer.mjs';
import { FILES } from '../lib/constants.mjs';

/**
 * @param {string} id - Ticket ID (e.g. "FEAT-052")
 * @param {string} title - Ticket title
 * @param {object} flags
 * @param {string} [flags.section] - Section in BACKLOG.md
 * @param {string} [flags.priority] - P0-P3
 * @param {string} [flags.hours] - Estimated hours
 * @param {string} [flags.file] - Override file path
 * @returns {string}
 */
export function ticketCreate(id, title, flags = {}) {
  const filePath = flags.file || FILES.backlog;
  const content = readFileSync(filePath, 'utf8');
  const updated = insertBacklogTicket(content, id, title, {
    section: flags.section,
    priority: flags.priority,
    hours: flags.hours,
  });
  writeFileSync(filePath, updated);
  return `✓ ${id} added to BACKLOG.md under ${flags.section || 'Development Tools'}`;
}
