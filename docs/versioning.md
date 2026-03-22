# Versioning Strategy

augmenta-sec follows [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html).

## Version Format

`MAJOR.MINOR.PATCH[-PRERELEASE]`

| Segment      | When to bump                                                        |
| ------------ | ------------------------------------------------------------------- |
| **MAJOR**    | Breaking changes to CLI interface, config format, or public API     |
| **MINOR**    | New features, new commands, new scanner adapters (backward-compat.) |
| **PATCH**    | Bug fixes, documentation, dependency updates, performance           |
| **PRERELEASE** | Alpha/beta/rc releases (e.g., `1.0.0-alpha.1`, `2.3.0-rc.0`)   |

## Workflow

1. Work on a feature branch.
2. When ready to release, run the version bump script:
   ```bash
   node scripts/version.mjs bump patch   # 0.1.0 -> 0.1.1
   node scripts/version.mjs bump minor   # 0.1.0 -> 0.2.0
   node scripts/version.mjs bump major   # 0.1.0 -> 1.0.0
   node scripts/version.mjs bump prerelease --preid=alpha  # 0.1.0 -> 0.1.1-alpha.0
   ```
3. The script updates `package.json` and prepends a new section in `CHANGELOG.md`.
4. Commit the version bump: `git commit -am "chore(release): vX.Y.Z"`.
5. Tag: `git tag vX.Y.Z`.
6. Push: `git push origin main --tags`.
7. CI handles npm publish and GitHub Release creation automatically.

## Pre-release Conventions

- `alpha` -- early development, unstable API
- `beta` -- feature-complete, may have bugs
- `rc` -- release candidate, final validation

## Breaking Changes

Before bumping MAJOR:
- Document migration steps in the release notes.
- Deprecate old behavior in a prior MINOR release when possible.
- Ensure the CHANGELOG clearly lists what broke and how to migrate.

## CHANGELOG

We maintain `CHANGELOG.md` in [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) format. The version script auto-scaffolds new entries. Fill in the details before pushing.
