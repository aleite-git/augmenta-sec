# AugmentaSec

AI-powered security engineer that onboards to any codebase.

## Key Documents

- **Strategy & Roadmap**: `docs/STRATEGY.md` — vision, architecture, runtime modes, adoption path, competitive landscape, and full phased roadmap.

## Architecture

- **Core library**: `src/` — pure TypeScript, no runtime opinions
- **Discovery engine**: `src/discovery/` — 8 parallel detectors that profile a codebase
- **Provider interfaces**: `src/providers/` — LLM, Git Platform, Scanner abstractions (agnostic by design)
- **CLI**: `src/cli/` — Commander-based, commands: `init` (working), `scan` (stub), `review` (stub)
- **Knowledge base**: `.augmenta-sec/` directory in target repos (YAML, version-controlled)

## Design Principles

- LLM agnostic (Claude, GPT, Gemini, Ollama, any)
- Git platform agnostic (GitHub, GitLab, Bitbucket, Azure DevOps, Gitea)
- Language/framework agnostic (Node.js, Python, Go, Rust, Java, Ruby, PHP)
- Scanner agnostic (Semgrep, CodeQL, Trivy, npm audit, custom)
- Knowledge-first: `.augmenta-sec/` directory is the agent's brain, portable across all runtime modes

## Backlog & Sprints

Markdown files are the sole tracking system:
- `BACKLOG.md` — new issues
- `BACKLOG-GROOMED.md` — future sprint planning
- `CURRENT-SPRINT.md` — active sprint
- `BACKLOG-DELIVERED.md` — completed tickets

**Sprint Management CLI** (`scripts/sprint-mgmt/cli.mjs`):
- `node scripts/sprint-mgmt/cli.mjs sprint status` — current sprint summary
- `node scripts/sprint-mgmt/cli.mjs sprint start <N>` — promote groomed sprint to current
- `node scripts/sprint-mgmt/cli.mjs sprint close` — finalize sprint, move to delivered
- `node scripts/sprint-mgmt/cli.mjs ticket done <ID> --actual=Xh` — mark ticket complete
- `node scripts/sprint-mgmt/cli.mjs ticket create <ID> <title> --priority=P1 --hours=N` — add ticket
- `node scripts/sprint-mgmt/cli.mjs ticket move <ID> <target>` — move ticket between files
- `node scripts/sprint-mgmt/cli.mjs ticket list all` — list all tickets across all files

## Conventions

- TypeScript with ESM (`"type": "module"`)
- Google TypeScript Style Guide
- Conventional Commits
- Strict TypeScript (`strict: true`)
- All detectors run in parallel — keep them independent
- Provider interfaces before implementations — design the contract first
- **Test coverage: 80%+ lines/branches on all new and changed code — mandatory. PRs below this threshold are blocked.**

## Commands

```bash
npm run dev -- init /path/to/repo   # Run discovery engine
npm run build                        # Compile TypeScript
npm test                             # Run tests
```
