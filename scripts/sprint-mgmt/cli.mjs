#!/usr/bin/env node

/**
 * Sprint Management CLI
 * Usage: node scripts/sprint-mgmt/cli.mjs <command> <subcommand> [args] [--flags]
 *
 * Commands:
 *   sprint status              Show current sprint summary
 *   sprint start <N>           Promote groomed sprint N to current
 *   sprint close               Finalize current sprint, move to delivered
 *   ticket list [scope]        List tickets (backlog|groomed|current|delivered|all)
 *   ticket show <ID>           Show ticket details
 *   ticket create <ID> <title> Create a new backlog ticket
 *   ticket done <ID>           Mark ticket as complete
 *   ticket move <ID> <target>  Move ticket between files
 *   retro scaffold <ID>        Generate retrospective template
 */

import { sprintStatus } from './commands/sprint-status.mjs';
import { sprintStart } from './commands/sprint-start.mjs';
import { sprintClose } from './commands/sprint-close.mjs';
import { ticketList } from './commands/ticket-list.mjs';
import { ticketShow } from './commands/ticket-show.mjs';
import { ticketCreate } from './commands/ticket-create.mjs';
import { ticketDone } from './commands/ticket-done.mjs';
import { ticketMove } from './commands/ticket-move.mjs';
import { retroScaffold } from './commands/retro-scaffold.mjs';

const USAGE = `Usage: node scripts/sprint-mgmt/cli.mjs <command> <subcommand> [args]

Commands:
  sprint status              Current sprint summary (~5-10 lines)
  sprint start <N>           Promote groomed sprint to current
  sprint close               Finalize sprint, move to delivered
  ticket list [scope]        List tickets (backlog|groomed|current|delivered|all)
  ticket show <ID>           Show ticket details across all files
  ticket create <ID> <title> Add ticket to BACKLOG.md
  ticket done <ID>           Mark ticket complete in CURRENT-SPRINT.md
  ticket move <ID> <target>  Move ticket between files
  retro scaffold <ID>        Generate retro template

Flags:
  --section=<name>           Section for ticket create (e.g. "Development Tools")
  --priority=<P0-P3>         Priority for ticket create
  --hours=<N>                Estimated hours for ticket create
  --actual=<Nh>              Actual hours for ticket done
  --sprint=<N>               Sprint number for retro scaffold`;

function parseFlags(args) {
  const flags = {};
  const positional = [];
  for (const arg of args) {
    if (arg.startsWith('--')) {
      const [key, ...rest] = arg.slice(2).split('=');
      flags[key] = rest.join('=') || 'true';
    } else {
      positional.push(arg);
    }
  }
  return { flags, positional };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log(USAGE);
    process.exit(0);
  }

  const command = args[0];
  const subcommand = args[1] || '';
  const { flags, positional } = parseFlags(args.slice(2));

  try {
    switch (command) {
      case 'sprint':
        switch (subcommand) {
          case 'status':
            console.log(sprintStatus(flags));
            break;
          case 'start':
            if (!positional[0]) throw new Error('Usage: sprint start <N>');
            console.log(sprintStart(parseInt(positional[0], 10), flags));
            break;
          case 'close':
            console.log(sprintClose(flags));
            break;
          default:
            throw new Error(`Unknown sprint subcommand: ${subcommand}`);
        }
        break;

      case 'ticket':
        switch (subcommand) {
          case 'list':
            console.log(ticketList(positional[0] || 'all', flags));
            break;
          case 'show':
            if (!positional[0]) throw new Error('Usage: ticket show <ID>');
            console.log(ticketShow(positional[0], flags));
            break;
          case 'create':
            if (!positional[0] || !positional[1]) throw new Error('Usage: ticket create <ID> <title>');
            console.log(ticketCreate(positional[0], positional.slice(1).join(' '), flags));
            break;
          case 'done':
            if (!positional[0]) throw new Error('Usage: ticket done <ID>');
            console.log(ticketDone(positional[0], flags));
            break;
          case 'move':
            if (!positional[0] || !positional[1]) throw new Error('Usage: ticket move <ID> <target>');
            console.log(ticketMove(positional[0], positional[1], flags));
            break;
          default:
            throw new Error(`Unknown ticket subcommand: ${subcommand}`);
        }
        break;

      case 'retro':
        if (subcommand === 'scaffold') {
          if (!positional[0]) throw new Error('Usage: retro scaffold <ID>');
          console.log(retroScaffold(positional[0], flags));
        } else {
          throw new Error(`Unknown retro subcommand: ${subcommand}`);
        }
        break;

      default:
        throw new Error(`Unknown command: ${command}`);
    }
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

main();
