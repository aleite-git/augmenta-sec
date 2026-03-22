# Contributing

Thank you for your interest in contributing to AugmentaSec. This guide covers the development setup, code style, testing requirements, and PR process.

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
npm run dev -- init /path/to/target/repo
npm run dev -- scan
npm run dev -- review 42
npm run dev -- trends
```

### Building

```bash
npm run build    # Compile TypeScript to dist/
npm run lint     # ESLint
npm run format   # Prettier
npm test         # Vitest
npm run test:coverage  # Coverage report
```

## Code Style

We follow the [Google TypeScript Style Guide](https://google.github.io/styleguide/tsguide.html):

- TypeScript strict mode, ESM only (`"type": "module"`, NodeNext resolution)
- Imports use `.js` extensions: `import {foo} from './bar.js'`
- Named exports only (no default exports)
- Interface over type for object shapes
- Conventional Commits: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `build`, `ci`

### Design Principles

- SOLID, DRY, KISS
- Interface-first: define the contract before the implementation
- Parallel by default: detectors and scanners run concurrently
- Graceful degradation: missing scanners and failed detectors do not crash the tool
- No fire-and-forget: all async operations must be awaited

## Testing

Vitest for all tests. Tests live in `__tests__/` directories alongside code.

**Coverage: minimum 80%** lines, branches, functions, statements. PRs below this are blocked.

## Pull Request Process

1. Create a feature branch: `feat/<ticket-id>-<slug>` or `fix/<ticket-id>-<slug>`
2. Write tests first
3. Run: `npm test && npm run lint && npm run build`
4. Check coverage: `npm run test:coverage` (>= 80%)
5. Use Conventional Commits
6. Link the related ticket in PR title or description
7. All CI checks must pass; at least one approval required

## Architecture Decisions

ADRs are in `docs/adr/`. Add one if your contribution involves a significant design choice.

## Getting Help

- Open an issue for bugs or feature requests
- For security vulnerabilities, see [SECURITY.md](SECURITY.md)
