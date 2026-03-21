# Sprint Management CLI

Node.js CLI that parses and manipulates sprint markdown files (BACKLOG.md, BACKLOG-GROOMED.md, CURRENT-SPRINT.md, BACKLOG-DELIVERED.md) programmatically. Returns concise, structured output instead of loading full files.

## Usage

```bash
node scripts/sprint-mgmt/cli.mjs <command> <subcommand> [args] [--flags]
```

## Commands

| Command | Description |
|---------|-------------|
| `sprint status` | Current sprint summary (~5-10 lines) |
| `sprint start <N>` | Promote groomed sprint to current |
| `sprint close` | Finalize sprint, move to delivered |
| `ticket list [scope]` | List tickets (backlog\|groomed\|current\|delivered\|all) |
| `ticket show <ID>` | Show ticket details across all files |
| `ticket create <ID> <title>` | Add ticket to BACKLOG.md |
| `ticket done <ID>` | Mark ticket complete in CURRENT-SPRINT.md |
| `ticket move <ID> <target>` | Move ticket between files |
| `retro scaffold <ID>` | Generate retro template |

## Flags

| Flag | Used With | Description |
|------|-----------|-------------|
| `--section=<name>` | `ticket create` | Target section in BACKLOG.md |
| `--priority=<P0-P3>` | `ticket create` | Ticket priority |
| `--hours=<N>` | `ticket create` | Estimated hours |
| `--actual=<Nh>` | `ticket done` | Actual hours spent |
| `--sprint=<N>` | `retro scaffold` | Sprint number |
| `--force` | `sprint close` | Close with incomplete tickets |
| `--file=<path>` | write commands | Override target file path |

## Architecture

```
scripts/sprint-mgmt/
  cli.mjs                     # Entry point, subcommand router
  lib/
    constants.mjs              # File paths, regex patterns
    md-parser.mjs              # Read-only parsing (pure functions)
    md-writer.mjs              # Surgical insert/update/remove (pure functions)
    format.mjs                 # Output formatters (AI-optimized)
  commands/
    sprint-status.mjs          # sprint status
    sprint-start.mjs           # sprint start <N>
    sprint-close.mjs           # sprint close
    ticket-list.mjs            # ticket list [scope]
    ticket-show.mjs            # ticket show <ID>
    ticket-create.mjs          # ticket create <ID> <title>
    ticket-done.mjs            # ticket done <ID>
    ticket-move.mjs            # ticket move <ID> <target>
    retro-scaffold.mjs         # retro scaffold <ID>
```

## Testing

```bash
# Run all sprint-mgmt tests
npx jest scripts/__tests__/sprint-mgmt/ --watchman=false

# Individual test files
npx jest scripts/__tests__/sprint-mgmt/md-parser.test.js --watchman=false
npx jest scripts/__tests__/sprint-mgmt/md-writer.test.js --watchman=false
npx jest scripts/__tests__/sprint-mgmt/commands.test.js --watchman=false
```

## Design Decisions

- **MD stays source of truth** — no YAML/JSON backing store
- **Pure functions** — parser/writer take strings, return strings (testable, composable)
- **Line-number tracking** — parsed tickets store startLine/endLine for surgical replacement
- **Spawn-based tests** — follows existing `bump-version.test.js` pattern, avoids Jest/ESM issues
- **No CLI framework** — direct `process.argv` parsing (matches project conventions)
- **Output for AI** — `sprint status` returns ~5-10 lines vs 160+ from raw file
