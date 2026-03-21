/**
 * sprint close — Finalize current sprint and append to BACKLOG-DELIVERED.md.
 */

import { readFileSync, writeFileSync } from 'fs';
import { parseCurrentSprint } from '../lib/md-parser.mjs';
import { appendDeliveredSprint, setSprintStatus } from '../lib/md-writer.mjs';
import { FILES } from '../lib/constants.mjs';

/**
 * @param {object} flags
 * @returns {string}
 */
export function sprintClose(flags = {}) {
  const currentPath = flags.currentFile || FILES.current;
  const deliveredPath = flags.deliveredFile || FILES.delivered;
  const date = flags.date || new Date().toISOString().split('T')[0];

  const currentContent = readFileSync(currentPath, 'utf8');
  const sprint = parseCurrentSprint(currentContent);

  if (sprint.tickets.length === 0) {
    throw new Error('No tickets in current sprint.');
  }

  const incomplete = sprint.tickets.filter(t => !t.done);
  if (incomplete.length > 0 && !flags.force) {
    throw new Error(
      `Sprint has ${incomplete.length} incomplete ticket(s): ${incomplete.map(t => t.id).join(', ')}. Use --force to close anyway.`
    );
  }

  // Update current sprint status
  const updatedCurrent = setSprintStatus(currentContent, 'COMPLETE');
  writeFileSync(currentPath, updatedCurrent);

  // Append to delivered
  const deliveredContent = readFileSync(deliveredPath, 'utf8');
  const updatedDelivered = appendDeliveredSprint(deliveredContent, sprint, date);
  writeFileSync(deliveredPath, updatedDelivered);

  const done = sprint.tickets.filter(t => t.done).length;
  return `✓ Sprint ${sprint.number} closed (${done}/${sprint.tickets.length} tickets delivered)`;
}
