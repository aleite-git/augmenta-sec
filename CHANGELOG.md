# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-03-21

### Added

- Core detection engine with multi-provider AI support (Gemini)
- Stack detection: languages, frameworks, databases, infrastructure
- Security finding schema with SARIF-compatible severity levels
- CLI interface with `scan`, `detect`, and `report` commands
- Configuration via `config.yaml` with sensible defaults
- CI pipeline (GitHub Actions): lint, typecheck, test, build
- Release workflow with npm publish and GitHub Releases
- Test fixtures for Node/Express/React, Python/Django, Go/Gin, and monorepo projects
