# ADR-003: Knowledge Directory (.augmenta-sec/)

**Status**: Accepted
**Date**: 2026-03-21

## Context

AugmentaSec needs to persist information about a codebase between runs: the security profile, scan history, threat models, PII maps, and agent configuration. This data must be:

- **Portable** -- works whether the agent runs as a CLI, in CI, or as a persistent server
- **Reviewable** -- team members should be able to read and audit the agent's knowledge
- **Diffable** -- changes to the security profile should be visible in pull requests
- **Version-controlled** -- the profile evolves with the codebase

Alternatives considered:

1. **Database** -- not portable, requires infrastructure, not reviewable in PRs
2. **Cloud storage** -- requires connectivity, vendor lock-in, not diffable
3. **In-memory only** -- loses state between runs, no persistence
4. **Single file** -- too large as the knowledge grows

## Decision

Use a `.augmenta-sec/` directory in the target repository with human-readable YAML files:

```
.augmenta-sec/
  profile.yaml          # Discovery output (what this codebase is)
  config.yaml           # Agent behavior and autonomy settings
  endpoints.yaml        # Full API surface (auto-generated)
  threat-model.yaml     # Living threat model (LLM-enhanced)
  pii-map.yaml          # PII field inventory
  findings/             # Scan results over time
    YYYY-MM-DD.yaml
```

Key design choices:

1. **YAML format** -- human-readable and writable, supports comments, widely understood. Generated using the `yaml` npm package with consistent formatting.
2. **Separation of concerns** -- large data (endpoints list) goes in separate files to keep the main profile readable.
3. **Version-controlled by default** -- the directory is meant to be committed to the repository. It contains no secrets (API keys are in environment variables or a separate config that should be gitignored).
4. **Headers with instructions** -- generated files include comment headers explaining what they contain and how to use them.

The profile writer (`src/discovery/profile-writer.ts`) creates the directory and writes `profile.yaml` and `endpoints.yaml`. The config loader (`src/config/loader.ts`) reads `config.yaml` from this directory.

## Consequences

**Easier:**
- The security profile is visible in code review. When `asec init` is run and the profile changes, the diff shows exactly what changed.
- CI pipelines can read the profile without any external dependencies.
- Team members can manually edit the profile to correct detection errors.
- The profile is portable: copy the directory and the agent's knowledge comes with it.
- Multiple runtime modes (CLI, CI, server) all read from the same directory.

**More difficult:**
- Large codebases may generate large YAML files (hundreds of endpoints). Mitigated by separating endpoints into their own file.
- Users must understand that this directory should be committed. If gitignored accidentally, state is lost between runs.
- Concurrent writes (e.g., two CI jobs running `asec init` simultaneously) could conflict. Currently mitigated by treating the profile as a full rewrite on each `init`.
- Binary data (images, artifacts) cannot be stored here. This is by design -- the directory is text-only.
