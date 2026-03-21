# Architecture Decision Records

This directory contains Architecture Decision Records (ADRs) for AugmentaSec. ADRs document significant design decisions, their context, and their consequences.

## Format

Each ADR follows this structure:

```markdown
# ADR-NNN: Title

**Status**: Accepted | Superseded | Deprecated
**Date**: YYYY-MM-DD

## Context

What is the issue that we're seeing that is motivating this decision or change?

## Decision

What is the change that we're proposing and/or doing?

## Consequences

What becomes easier or more difficult to do because of this change?
```

## Index

| ADR | Title | Status |
|-----|-------|--------|
| [001](001-llm-role-routing.md) | LLM Role Routing | Accepted |
| [002](002-scanner-agnostic.md) | Scanner-Agnostic Architecture | Accepted |
| [003](003-knowledge-directory.md) | Knowledge Directory (.augmenta-sec/) | Accepted |
| [004](004-git-platform-agnostic.md) | Git Platform-Agnostic Design | Accepted |

## Creating a New ADR

1. Copy the format above into a new file: `docs/adr/NNN-title-slug.md`
2. Number sequentially from the last ADR
3. Set status to "Accepted" (or "Proposed" if under discussion)
4. Fill in context, decision, and consequences
5. Add the entry to the index table above
6. Submit as part of the PR that implements the decision
