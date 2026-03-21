# Contributing

Thank you for your interest in contributing to AugmentaSec. This guide covers the development setup, project structure, code style, testing requirements, and PR process.

## Development Setup

### Prerequisites

- Node.js 18+
- npm (comes with Node.js)
- Git

### Clone and Install

```bash
git clone https://github.com/augmenta-sec/augmenta-sec.git
cd augmenta-sec
npm install
```

### Running Locally

```bash
# Run the discovery engine against a target repo
npm run dev -- init /path/to/target/repo

# Run the CLI in development mode (any command)
npm run dev -- scan
npm run dev -- review 42
```

### Building

```bash
npm run build
```

This compiles TypeScript to `dist/` using the settings in `tsconfig.json` (target: ES2022, module: NodeNext, strict mode).

### Linting and Formatting

```bash
npm run lint       # ESLint
npm run format     # Prettier
```

Both run automatically in CI and must pass before a PR can be merged.

## Project Structure

```
src/
  index.ts                    # CLI entry point (#!/usr/bin/env node)
  cli/
    index.ts                  # Commander program setup
    commands/
      init.ts                 # Discovery engine command
      scan.ts                 # Security scan command (stub)
      review.ts               # PR review command (stub)
  config/
    schema.ts                 # Zod validation schemas
    loader.ts                 # YAML config loading + merging
    defaults.ts               # Default configuration values
    index.ts                  # Re-exports
  discovery/
    engine.ts                 # Runs all detectors in parallel
    profile-writer.ts         # Writes profile.yaml + endpoints.yaml
    types.ts                  # SecurityProfile and all detector output types
    detectors/
      language.ts             # Language detection
      framework.ts            # Framework detection
      auth.ts                 # Authentication detection
      database.ts             # Database detection
      api.ts                  # API surface detection
      security-controls.ts    # Security controls detection
      ci.ts                   # CI/CD detection
      docs.ts                 # Documentation detection
      index.ts                # Barrel export
      __tests__/              # Detector unit tests
  providers/
    llm/
      types.ts                # LLMProvider, LLMGateway interfaces
      gateway.ts              # Role-to-provider routing
      gemini.ts               # Google Gemini implementation
      index.ts                # Re-exports
      __tests__/              # Provider tests
    git-platform/
      types.ts                # GitPlatform interface
      github.ts               # GitHub implementation (Octokit)
      index.ts                # Re-exports
      __tests__/
    scanner/
      types.ts                # SecurityScanner interface
      semgrep.ts              # Semgrep adapter
      trivy.ts                # Trivy adapter
      npm-audit.ts            # npm audit adapter
      utils.ts                # Shared utilities (isBinaryAvailable, runCommand)
  findings/
    types.ts                  # Finding, FindingsReport, FindingsSummary
    severity.ts               # Severity comparison and adjustment logic
    index.ts                  # Re-exports
    __tests__/
  utils/
    file-utils.ts             # DetectorContext implementation (findFiles, grep, etc.)
    logger.ts                 # Structured console logger
```

## Code Style

We follow the [Google TypeScript Style Guide](https://google.github.io/styleguide/tsguide.html) with these project-specific conventions:

- **TypeScript strict mode** is enabled (`"strict": true` in tsconfig.json)
- **ESM only** -- the project uses `"type": "module"` with NodeNext module resolution
- **Imports** use `.js` extensions (required by NodeNext): `import {foo} from './bar.js'`
- **No default exports** -- use named exports exclusively
- **Interface over type** for object shapes
- **Conventional Commits** for commit messages: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `build`, `ci`

### Design Principles

- **SOLID, DRY, KISS** -- extract reusable logic into shared utilities
- **Interface-first** -- define the contract before the implementation
- **Parallel by default** -- detectors and scanners run concurrently
- **Graceful degradation** -- missing scanners, failed detectors, and unavailable providers should not crash the tool
- **No fire-and-forget** -- all async operations must be awaited and errors surfaced

## Testing

We use [Vitest](https://vitest.dev/) for all tests.

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage report
npm run test:coverage
```

### Test Location

Tests live alongside the code in `__tests__/` directories:

```
src/discovery/detectors/__tests__/language.test.ts
src/providers/llm/__tests__/gemini.test.ts
src/config/__tests__/schema.test.ts
```

### Coverage Requirements

- **Minimum 80%** lines, branches, functions, and statements for all new and changed code
- Coverage thresholds are enforced in `vitest.config.ts`
- PRs below 80% coverage are blocked in CI

### Writing Tests

- Use descriptive test names that explain the expected behavior
- Test both success and failure paths
- Mock external dependencies (file system, APIs, binaries)
- Use the test helpers in `src/discovery/detectors/__tests__/helpers.ts` for detector tests

Example detector test pattern:

```typescript
import {describe, it, expect} from 'vitest';
import {languageDetector} from '../language.js';
import {createMockContext} from './helpers.js';

describe('language detector', () => {
  it('detects TypeScript as primary when tsconfig.json exists', async () => {
    const ctx = createMockContext({
      files: {'tsconfig.json': '{}', 'src/index.ts': ''},
      sourceFiles: ['src/index.ts', 'jest.config.js'],
    });

    const result = await languageDetector.detect(ctx);

    expect(result.primary).toBe('typescript');
  });
});
```

## Pull Request Process

### Before Submitting

1. **Create a feature branch** from `main`: `feat/<ticket-id>-<slug>` or `fix/<ticket-id>-<slug>`
2. **Write tests first** -- all new functionality needs tests before implementation
3. **Run the full test suite**: `npm test`
4. **Run the linter**: `npm run lint`
5. **Build successfully**: `npm run build`
6. **Check coverage**: `npm run test:coverage` (must be >= 80%)

### Commit Messages

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(discovery): add Rust Cargo.toml detection
fix(scanner): handle Trivy timeout on large repos
docs: update provider implementation guide
test(auth): add Keycloak detection test cases
refactor(gateway): simplify role-to-provider mapping
chore: update vitest to 3.2.0
```

### PR Requirements

- Link the related ticket in the PR title or description
- Include a clear description of what changed and why
- All CI checks must pass (lint, typecheck, tests, build)
- At least one approval required
- Coverage must meet the 80% threshold

### Review Checklist

When reviewing PRs, check for:

- [ ] Tests cover the new/changed functionality
- [ ] Error paths are handled (not just happy paths)
- [ ] Interfaces are used before implementations
- [ ] No hardcoded values that should be configurable
- [ ] Async operations are properly awaited
- [ ] Types are explicit (no implicit `any`)
- [ ] Documentation is updated if the change affects user-facing behavior

## Architecture Decisions

Major design decisions are documented as Architecture Decision Records (ADRs) in `docs/adr/`. If your contribution involves a significant architectural choice, please add an ADR explaining the context, decision, and consequences.

See [docs/adr/README.md](adr/README.md) for the ADR format and existing records.

## Getting Help

- Open an issue for bug reports or feature requests
- Check existing issues before creating duplicates
- For security vulnerabilities, see [SECURITY.md](../SECURITY.md)
