# Detectors

The discovery engine runs 18 detectors in parallel to build a comprehensive security profile of any codebase. Each detector implements the `Detector<T>` interface and produces a typed result that populates a section of the `SecurityProfile`.

All detectors live in `src/discovery/detectors/` with tests in `src/discovery/detectors/__tests__/`.

---

## Language Detector

**Source**: `language.ts` | **Output**: `LanguageInfo`

Determines primary language via manifest files (package.json, tsconfig.json, requirements.txt, go.mod, Cargo.toml, pom.xml, build.gradle, Gemfile, composer.json, mix.exs, Package.swift, pubspec.yaml, CMakeLists.txt) and file extension counting (25+ extensions). TypeScript is promoted as primary when tsconfig.json exists.

## Framework Detector

**Source**: `framework.ts` | **Output**: `FrameworkInfo`

Identifies backend, frontend, fullstack, ORM, and testing frameworks across Node.js (Express, Fastify, NestJS, React, Vue, Next.js, Drizzle, Prisma, Jest, Vitest), Python (Django, Flask, FastAPI, SQLAlchemy, Pytest), and Go (Gin, Echo, Fiber, GORM) ecosystems.

## Auth Detector

**Source**: `auth.ts` | **Output**: `AuthInfo`

Detects 14 auth providers via dependencies (Firebase, Auth0, Supabase, Clerk, Cognito, Keycloak, Passport, JWT, NextAuth, Auth.js, Lucia, session-based, Django Allauth, Flask-Login) and 6 auth pattern types via grep (middleware, guards, token-verification, session, RBAC, decorators).

## Database Detector

**Source**: `database.ts` | **Output**: `DatabaseInfo`

Identifies database types (PostgreSQL, MySQL, SQLite, MongoDB, Redis), drivers, ORMs (Drizzle, Prisma, Sequelize, TypeORM, Knex, MikroORM, Kysely, Mongoose, SQLAlchemy, Django ORM), and migration/schema directories.

## API Detector

**Source**: `api.ts` | **Output**: `ApiInfo`

Maps API surface: styles (REST, GraphQL, tRPC), endpoint extraction from Express/Koa/Fastify/NestJS/Flask/Django/Go patterns, and OpenAPI/Swagger spec detection.

## Security Controls Detector

**Source**: `security-controls.ts` | **Output**: `SecurityControlsInfo`

Detects 12 control types: HTTP headers (helmet), CORS, rate limiting, input validation (zod/joi/yup/class-validator/ajv), CSRF, password hashing, XSS prevention, SQLi prevention, HPP, CSP, cookie security, request size limiting. Always-recommended controls (HTTP headers, CORS, rate limiting, input validation) are flagged as missing when absent.

## CI/CD Detector

**Source**: `ci.ts` | **Output**: `CIInfo`

Identifies 10 CI platforms (GitHub Actions, GitLab CI, Jenkins, CircleCI, Travis, Bitbucket Pipelines, Azure DevOps, Drone, Buildkite, Woodpecker) and 20+ security tools (CodeQL, Semgrep, SonarQube, Snyk, Trivy, Gitleaks, OWASP ZAP, Nuclei, etc.).

## Docs Detector

**Source**: `docs.ts` | **Output**: `DocsInfo`

Checks for README, CONTRIBUTING, SECURITY, CHANGELOG, LICENSE. Finds architecture docs in docs/adr/specs/. Detects AI assistant configs (CLAUDE.md, .cursorrules, copilot-instructions.md, .aider, .continue, cline_docs, .clinerules).

## Monorepo Detector

**Source**: `monorepo.ts` | **Output**: `MonorepoInfo`

Detects npm/Yarn/pnpm workspaces, Lerna, Turborepo, Nx. Classifies each workspace as app (has main/bin), library (no main), or package.

## Git Metadata Detector

**Source**: `git-metadata.ts` | **Output**: `GitMetadataInfo`

Extracts remote URL, hosting platform (GitHub/GitLab/Bitbucket/Azure DevOps/Gitea), owner, repo, default branch from .git/config. Parses both SSH and HTTPS URL formats.

## Docker Detector

**Source**: `docker.ts` | **Output**: `DockerInfo`

Finds Dockerfiles and Compose files. Analyzes base images, multi-stage builds, non-root USER directives, HEALTHCHECK directives.

## Infrastructure as Code Detector

**Source**: `iac.ts` | **Output**: `IaCInfo`

Detects Terraform (with provider extraction from `provider "aws" {}` blocks), Pulumi, CDK, CloudFormation, Ansible, Helm.

## Secrets Detector

**Source**: `secrets.ts` | **Output**: `SecretsInfo`

Scans for hardcoded secrets (AWS keys, private keys, passwords, API keys, tokens) with risk levels. Tracks .env files and gitignore coverage. Excludes examples, samples, templates, and test files.

## License Detector

**Source**: `licenses.ts` | **Output**: `LicenseInfo`

Project license from package.json and LICENSE files. Dependency license risk classification: none (MIT, Apache, BSD, ISC), copyleft (GPL, AGPL, LGPL, MPL), restrictive (SSPL, BSL, Elastic), unknown.

## Python Ecosystem Detector

**Source**: `python-ecosystem.ts` | **Output**: `PythonEcosystemInfo`

Package manager (pip/poetry/pipenv/pdm/uv), virtual environments, Python version, frameworks (Django, Flask, FastAPI, Starlette, Tornado, Sanic, aiohttp, etc.), security dependencies (bandit, safety, cryptography, paramiko, passlib, argon2-cffi, etc.).

## Go Ecosystem Detector

**Source**: `go-ecosystem.ts` | **Output**: `GoEcosystemInfo`

go.mod analysis (version, module path, dependency counts), go.sum and vendor directory, unsafe imports, frameworks (Gin, Echo, Fiber, Chi, gRPC, GORM, Ent, sqlx, etc.), security tools (gosec, x/crypto, x/net, golang-jwt, casbin, etc.).

## Rust Ecosystem Detector

**Source**: `rust-ecosystem.ts` | **Output**: `RustEcosystemInfo`

Cargo.toml edition/version, Cargo.lock, crate count, unsafe blocks and file count, workspace detection, frameworks (Actix-web, Axum, Rocket, Warp, Hyper, Tokio, Diesel, SeaORM, sqlx, etc.), security crates (ring, rustls, rust-argon2, sha2, aes-gcm, cargo-audit, cargo-deny, etc.).

## JVM Ecosystem Detector

**Source**: `jvm-ecosystem.ts` | **Output**: `JvmEcosystemInfo`

Build tool (Maven/Gradle/sbt), Java version, Spring Boot/Security detection, frameworks (Micronaut, Quarkus, Vert.x, Akka, Play, Hibernate, jOOQ, MyBatis, etc.), security deps (Apache Shiro, OWASP ESAPI, Bouncy Castle, Keycloak adapters, SpotBugs, PMD, etc.), lock files, wrapper scripts.

---

## Extending: Adding a New Detector

1. Define output type in `src/discovery/types.ts`
2. Add section to `SecurityProfile`
3. Implement in `src/discovery/detectors/my-detector.ts` (implement `Detector<T>`)
4. Export from `src/discovery/detectors/index.ts`
5. Register in `src/discovery/engine.ts` detectors array
6. Add fallback default in engine profile assembly
7. Write tests in `__tests__/my-detector.test.ts`

### DetectorContext API

| Method | Description |
|--------|-------------|
| `findFiles(patterns)` | Glob matching (excludes node_modules, .git) |
| `readFile(path)` | Read file content or null |
| `readJson<T>(path)` | Parse JSON file or null |
| `readYaml<T>(path)` | Parse YAML file or null |
| `fileExists(path)` | Check file existence |
| `grep(pattern, filePatterns, options?)` | Regex search with maxFiles/maxMatches |

**Constraints**: Independent (no cross-detector deps), gracefully degrading (engine catches errors), side-effect-free (read-only), performant (minimize I/O).
