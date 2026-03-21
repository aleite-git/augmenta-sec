/**
 * retro scaffold <ID> — Generate a retrospective template.
 */

import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { readFile, findTicket, parseCurrentSprint } from '../lib/md-parser.mjs';
import { FILES, PROJECT_ROOT } from '../lib/constants.mjs';

/**
 * @param {string} id - Ticket ID
 * @param {object} flags
 * @param {string} [flags.sprint] - Sprint number override
 * @returns {string}
 */
export function retroScaffold(id, flags = {}) {
  // Find ticket to get metadata
  const files = {};
  for (const [scope, defaultPath] of Object.entries(FILES)) {
    files[scope] = readFile(flags[`${scope}File`] || defaultPath);
  }
  const ticket = findTicket(id, files);

  // Determine sprint number
  let sprintNum = flags.sprint;
  if (!sprintNum && files.current) {
    const sprint = parseCurrentSprint(files.current);
    sprintNum = sprint.number;
  }
  if (!sprintNum) {
    throw new Error('Cannot determine sprint number. Use --sprint=N.');
  }

  const date = new Date().toISOString().split('T')[0];
  const title = ticket ? ticket.title : id;
  const effort = ticket ? (ticket.effort || ticket.hours || 'TBD') : 'TBD';

  const template = `# ${id}: ${title} - Retrospective

**Completed:** ${date}
**Effort:** ${effort}h estimate → Actual: TBD
**Sprint:** ${sprintNum}

---

## Summary
Brief description of what was implemented.

## What Went Well
-

## Challenges
1.

## Technical Decisions
-

## Files Changed
-

## Lessons Learned
1.

## Recommendations
-

## Metrics
- **Deployments:** X iterations
- **Test coverage:** X tests passing
- **Breaking changes:** None
`;

  const dir = resolve(PROJECT_ROOT, 'sprints', `sprint${sprintNum}`);
  const filePath = resolve(dir, `${id}-retro.md`);

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  if (existsSync(filePath) && !flags.force) {
    return `Retro already exists: ${filePath}. Use --force to overwrite.`;
  }

  writeFileSync(filePath, template);
  return `✓ Retro template created: sprints/sprint${sprintNum}/${id}-retro.md`;
}
