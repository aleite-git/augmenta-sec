# ADR-005: ESM-Only TypeScript

**Status**: Accepted
**Date**: 2026-03-22

## Context

AugmentaSec is a Node.js CLI tool and library. We needed to choose between CommonJS (CJS) and ECMAScript Modules (ESM) for the module system, and between JavaScript and TypeScript for the language.

ESM is the JavaScript standard and enables static analysis, tree-shaking, and top-level await. Major dependencies (Commander, Zod, yaml, chalk, fast-glob) all publish ESM. TypeScript provides static typing that catches entire classes of bugs at compile time -- for a security tool, type safety is not optional.

## Decision

Use TypeScript with strict mode and ESM-only output. Target ES2022 with NodeNext module resolution. All imports use `.js` extensions (required by NodeNext). No default exports -- named exports only. Zod for runtime validation of external inputs (config files, scanner output, API responses).

Configuration in `tsconfig.json`:
- `"target": "ES2022"` -- includes `Array.at()`, `Object.hasOwn()`, `Error.cause`, class fields
- `"module": "NodeNext"` -- native ESM with `.js` extension imports
- `"strict": true` -- no implicit `any`, strict null checks, all strict flags
- `"type": "module"` in `package.json`

Vitest is used for testing (native ESM support, unlike Jest which requires configuration).

## Consequences

**Easier:**
- Full static type safety across the codebase. `SecurityProfile`, `Finding`, `LLMProvider`, and `SecurityScanner` interfaces are all enforced at compile time.
- Zod schemas share types with runtime validation, eliminating type/validation drift.
- Vitest works natively with ESM and TypeScript without configuration hacks.
- Modern JavaScript features available without transpilation.

**More difficult:**
- Contributors must use `.js` extensions in imports, which is unusual for bundler-based TypeScript projects.
- Some npm packages that only publish CJS require dynamic `import()` or a compatibility wrapper.
- Strict mode requires more explicit type annotations -- no implicit `any`, strict null checks.
