/**
 * ticket done <ID> — Mark ticket as complete in CURRENT-SPRINT.md.
 * Updates checkbox, status, metrics, adds completion date.
 */

import { readFileSync, writeFileSync } from 'fs';
import { markTicketDone } from '../lib/md-writer.mjs';
import { FILES } from '../lib/constants.mjs';

/**
 * @param {string} id - Ticket ID
 * @param {object} flags
 * @param {string} [flags.actual] - Actual hours (e.g. "10h")
 * @param {string} [flags.file] - Override file path
 * @returns {string}
 */
export function ticketDone(id, flags = {}) {
  const filePath = flags.file || FILES.current;
  const content = readFileSync(filePath, 'utf8');
  const updated = markTicketDone(content, id, {
    actual: flags.actual,
    date: flags.date,
  });
  writeFileSync(filePath, updated);
  return `✓ ${id} marked as DONE in CURRENT-SPRINT.md`;
}
