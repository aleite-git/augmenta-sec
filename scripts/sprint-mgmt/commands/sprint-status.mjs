/**
 * sprint status — Returns concise sprint summary (~5-10 lines).
 */

import { readFile } from '../lib/md-parser.mjs';
import { parseCurrentSprint } from '../lib/md-parser.mjs';
import { formatSprintStatus } from '../lib/format.mjs';
import { FILES } from '../lib/constants.mjs';

/**
 * @param {object} flags
 * @param {string} [flags.file] - Override file path (for testing)
 * @returns {string}
 */
export function sprintStatus(flags = {}) {
  const filePath = flags.file || FILES.current;
  const content = readFile(filePath);
  if (!content.trim()) {
    return 'No current sprint found.';
  }
  const sprint = parseCurrentSprint(content);
  return formatSprintStatus(sprint);
}
