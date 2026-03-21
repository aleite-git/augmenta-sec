# Detectors

The discovery engine runs 8 detectors in parallel to build a comprehensive security profile of any codebase. Each detector implements the `Detector<T>` interface and produces a typed result.

All detectors live in `src/discovery/detectors/` with tests in `src/discovery/detectors/__tests__/`.

---

## Language Detector

**Source**: `src/discovery/detectors/language.ts`
**Output type**: `LanguageInfo`

Determines the primary programming language and produces a breakdown of all languages by file count and percentage.

### Detection Strategy

1. **Manifest files** -- checks for ecosystem-specific files to identify the project type:

   | Manifest | Language | Ecosystem |
   |----------|----------|-----------|
   | `package.json` | JavaScript | Node |
   | `tsconfig.json` | TypeScript | Node |
   | `requirements.txt`, `pyproject.toml`, `Pipfile`, `setup.py` | Python | Python |
   | `go.mod` | Go | Go |
   | `Cargo.toml` | Rust | Rust |
   | `pom.xml`, `build.gradle` | Java | JVM |
   | `build.gradle.kts` | Kotlin | JVM |
   | `Gemfile` | Ruby | Ruby |
   | `composer.json` | PHP | PHP |
   | `mix.exs` | Elixir | BEAM |
   | `Package.swift` | Swift | Apple |
   | `pubspec.yaml` | Dart | Flutter |
   | `CMakeLists.txt` | C++ | CMake |

2. **File extension counting** -- scans all source files and maps extensions to languages:

   `.ts`/`.tsx` (TypeScript), `.js`/`.jsx`/`.mjs`/`.cjs` (JavaScript), `.py` (Python), `.go` (Go), `.rs` (Rust), `.java` (Java), `.kt` (Kotlin), `.rb` (Ruby), `.php` (PHP), `.ex`/`.exs` (Elixir), `.swift` (Swift), `.dart` (Dart), `.cs` (C#), `.cpp`/`.cc`/`.hpp` (C++), `.c`/`.h` (C), `.scala` (Scala), `.clj` (Clojure), `.vue` (Vue), `.svelte` (Svelte)

3. **TypeScript promotion** -- if `tsconfig.json` exists and `.ts` files are found, TypeScript is considered the primary language even if `.js` files outnumber it (since JS files in TS projects are typically config/build files).

---

## Framework Detector

**Source**: `src/discovery/detectors/framework.ts`
**Output type**: `FrameworkInfo`

Identifies backend, frontend, fullstack, ORM, and testing frameworks across three ecosystems.

### Detection Strategy

Scans dependency manifests (`package.json`, `requirements.txt`, `go.mod`) and maps known packages to framework identities.

### Node.js Frameworks

| Category | Detected frameworks |
|----------|-------------------|
| Backend | Express, Fastify, NestJS, Koa, Hapi, Hono, Elysia |
| Frontend | React, Vue, Angular, Svelte, Solid, Preact |
| Fullstack | Next.js, Nuxt, Remix, Astro, SvelteKit |
| ORM | Drizzle, Prisma, Sequelize, TypeORM, Mongoose, Knex, MikroORM, Kysely |
| Testing | Jest, Vitest, Mocha, Playwright, Cypress |

### Python Frameworks

| Category | Detected frameworks |
|----------|-------------------|
| Backend | Django, Flask, FastAPI, Starlette, Tornado |
| ORM | SQLAlchemy, Tortoise ORM |
| Testing | Pytest |

### Go Frameworks

| Category | Detected frameworks |
|----------|-------------------|
| Backend | Gin, Echo, Fiber, Gorilla Mux |
| ORM | GORM, Ent |

Versions are extracted from dependency manifests when available.

---

## Auth Detector

**Source**: `src/discovery/detectors/auth.ts`
**Output type**: `AuthInfo`

Identifies authentication providers and patterns used in the codebase.

### Provider Detection (Dependency-Based)

Scans `package.json` and `requirements.txt` for known auth packages:

| Provider | Type | Trigger packages |
|----------|------|-----------------|
| Firebase Auth | third-party | `firebase-admin`, `@firebase/auth`, `firebase` |
| Auth0 | third-party | `auth0`, `@auth0/auth0-spa-js`, `@auth0/auth0-react`, `@auth0/nextjs-auth0` |
| Supabase Auth | third-party | `@supabase/supabase-js`, `@supabase/auth-helpers-nextjs` |
| Clerk | third-party | `@clerk/nextjs`, `@clerk/clerk-sdk-node` |
| Cognito | third-party | `amazon-cognito-identity-js`, `@aws-sdk/client-cognito-identity-provider` |
| Keycloak | third-party | `keycloak-js`, `keycloak-connect` |
| Passport | first-party | `passport` |
| JWT | first-party | `jsonwebtoken`, `jose`, `python-jose`, `PyJWT` |
| NextAuth | first-party | `next-auth` |
| Auth.js | first-party | `@auth/core` |
| Lucia | first-party | `lucia` |
| Session-based | first-party | `express-session` |
| Django Allauth | first-party | `django-allauth` |
| Flask-Login | first-party | `flask-login` |

### Pattern Detection (Grep-Based)

Searches source files for code patterns that indicate auth mechanisms:

| Pattern type | What it matches |
|-------------|-----------------|
| `middleware` | `authMiddleware`, `requireAuth`, `isAuthenticated`, `protectRoute`, `authenticate` |
| `guard` | `AuthGuard`, `RolesGuard`, `JwtGuard`, `canActivate` |
| `token-verification` | `verifyIdToken`, `jwt.verify`, `verifyToken`, `decodeToken` |
| `session` | `req.session`, `express-session`, `cookie-session` |
| `rbac` | `checkRole`, `requireRole`, `hasPermission`, `isAdmin`, `authorize` |
| `decorator` | `@UseGuards`, `@Roles`, `@Auth`, `@Authorized`, `@Protected` |

If auth patterns are found in code but no provider is detected in dependencies, the detector infers "custom" auth with lower confidence (0.7).

---

## Database Detector

**Source**: `src/discovery/detectors/database.ts`
**Output type**: `DatabaseInfo`

Identifies database types, drivers, ORMs, and migration/schema directories.

### Driver Detection

| Package | Database type |
|---------|--------------|
| `pg`, `postgres`, `@neondatabase/serverless` | PostgreSQL |
| `mysql2`, `mysql` | MySQL |
| `better-sqlite3`, `sql.js` | SQLite |
| `mongodb`, `mongoose` | MongoDB |
| `redis`, `ioredis` | Redis |
| `psycopg2`, `asyncpg`, `psycopg2-binary` (Python) | PostgreSQL |
| `pymysql`, `mysqlclient` (Python) | MySQL |

### ORM Detection

Drizzle, Prisma, Sequelize, TypeORM, Knex, MikroORM, Kysely, Mongoose, SQLAlchemy, Django ORM

### Directory Detection

The detector searches for well-known migration and schema directory patterns:

**Migration directories**: `drizzle`, `prisma/migrations`, `migrations`, `db/migrate`, `db/migrations`, `src/migrations`, `src/db/migrations`, `database/migrations`

**Schema directories**: `prisma`, `src/db/schema`, `src/schema`, `db/schema`, `src/entities`, `src/models`

---

## API Detector

**Source**: `src/discovery/detectors/api.ts`
**Output type**: `ApiInfo`

Maps the API surface: styles (REST, GraphQL, tRPC), endpoints, and OpenAPI specs.

### API Style Detection

| Style | How detected |
|-------|-------------|
| REST | Route definitions in code, or OpenAPI/Swagger spec files |
| GraphQL | `.graphql`/`.gql` files, `typeDefs` files, or GraphQL packages in dependencies (Apollo Server, GraphQL Yoga, Mercurius, type-graphql) |
| tRPC | `@trpc/*` packages in dependencies |

### Endpoint Extraction

The detector greps source files for route definition patterns:

| Framework | Pattern example |
|-----------|----------------|
| Express / Koa / Fastify | `app.get('/users', ...)`, `router.post('/api/items', ...)` |
| NestJS | `@Get('/users')`, `@Post('/items')` |
| Flask | `@app.route('/users', methods=['GET'])` |
| Django | `path('users/', ...)` |
| Go (Gin, Echo, Fiber) | `.GET("/users", ...)`, `.POST("/items", ...)` |

### OpenAPI/Swagger Spec Detection

Checks for spec files at these paths: `openapi.yaml`, `openapi.yml`, `openapi.json`, `api/openapi.yaml`, `swagger.yaml`, `swagger.json`, `docs/openapi.yaml`, and other common locations.

---

## Security Controls Detector

**Source**: `src/discovery/detectors/security-controls.ts`
**Output type**: `SecurityControlsInfo`

Identifies which security controls are present and which recommended ones are missing.

### Detection Strategy

For each control, the detector:

1. Checks if any associated package is in the project's dependencies
2. If a usage pattern is defined, greps source files to confirm actual usage
3. If the package is present but usage is unconfirmed, reports with lower confidence (0.8)
4. If the package is absent but a usage pattern is found in code, reports with confidence 0.7

### Controls Detected

| Control | Type | Packages | Usage pattern |
|---------|------|----------|---------------|
| HTTP Security Headers | `http-headers` | `helmet` | `helmet()` |
| CORS | `cross-origin` | `cors`, `@fastify/cors`, `@koa/cors` | `cors()` |
| Rate Limiting | `rate-limiting` | `express-rate-limit`, `rate-limiter-flexible`, `@fastify/rate-limit`, `bottleneck` | `rateLimit(`, `RateLimiter(` |
| Input Validation | `input-validation` | `zod`, `joi`, `yup`, `class-validator`, `ajv`, `express-validator`, `superstruct`, `valibot` | `z.object`, `Joi.object`, `yup.object`, `@IsString`, etc. |
| CSRF Protection | `csrf` | `csurf`, `csrf-csrf`, `@fastify/csrf-protection` | -- |
| Password Hashing | `password-hashing` | `bcrypt`, `bcryptjs`, `argon2`, `scrypt-js` | `bcrypt.hash(`, `argon2.hash(` |
| XSS Prevention | `xss-prevention` | `sanitize-html`, `dompurify`, `xss`, `isomorphic-dompurify` | -- |
| SQL Injection Prevention | `sqli-prevention` | `express-mongo-sanitize`, `mongo-sanitize` | -- |
| HPP | `hpp` | `hpp` | -- |
| Content Security Policy | `csp` | `helmet-csp`, `content-security-policy` | `contentSecurityPolicy`, `Content-Security-Policy` |
| Cookie Security | `cookie-security` | `cookie-parser`, `cookie-session` | `httpOnly:`, `secure:`, `sameSite:` |
| Request Size Limiting | `request-size` | -- | `express.json({...limit`, `bodyParser.*limit` |

### Always Recommended

These controls are flagged as "missing" when not detected, regardless of context: HTTP Security Headers, CORS, Rate Limiting, Input Validation.

---

## CI/CD Detector

**Source**: `src/discovery/detectors/ci.ts`
**Output type**: `CIInfo`

Identifies the CI/CD platform, workflows, triggers, and security checks.

### Platform Detection

| Platform | Config patterns |
|----------|----------------|
| GitHub Actions | `.github/workflows/*.yml`, `.github/workflows/*.yaml` |
| GitLab CI | `.gitlab-ci.yml`, `.gitlab-ci.yaml` |
| Jenkins | `Jenkinsfile`, `Jenkinsfile.*` |
| CircleCI | `.circleci/config.yml` |
| Travis CI | `.travis.yml` |
| Bitbucket Pipelines | `bitbucket-pipelines.yml` |
| Azure DevOps | `azure-pipelines.yml`, `.azure-pipelines/*.yml` |
| Drone | `.drone.yml` |
| Buildkite | `.buildkite/pipeline.yml`, `.buildkite/pipeline.yaml` |
| Woodpecker | `.woodpecker.yml`, `.woodpecker/*.yml` |

### Security Check Detection

The detector searches CI configuration files for references to security tools:

| Tool | Category |
|------|----------|
| CodeQL | SAST |
| Semgrep | SAST |
| SonarQube/SonarCloud | SAST |
| ESLint Security | SAST |
| Bandit | SAST |
| Gosec | SAST |
| Snyk | SCA |
| npm/yarn audit | SCA |
| OWASP Dependency-Check | SCA |
| Python Safety / pip-audit | SCA |
| Cargo Audit | SCA |
| Dependabot | SCA |
| Renovate | SCA |
| Trivy | Container |
| Grype | Container |
| Docker Scout | Container |
| Gitleaks / TruffleHog / detect-secrets | Secrets |
| OWASP ZAP | DAST |
| Nuclei | DAST |

GitHub Actions projects also check for `.github/dependabot.yml`.

---

## Docs Detector

**Source**: `src/discovery/detectors/docs.ts`
**Output type**: `DocsInfo`

Checks for standard documentation files, architecture docs, and AI assistant configurations.

### Standard Documentation

| Document | Files checked |
|----------|--------------|
| README | `README.md`, `README.rst`, `README.txt`, `README` |
| CONTRIBUTING | `CONTRIBUTING.md`, `CONTRIBUTING.rst`, `.github/CONTRIBUTING.md` |
| Security Policy | `SECURITY.md`, `.github/SECURITY.md`, `security.md` |
| Changelog | `CHANGELOG.md`, `CHANGES.md`, `HISTORY.md`, `RELEASE_NOTES.md` |
| License | `LICENSE`, `LICENSE.md`, `LICENSE.txt`, `LICENCE`, `LICENCE.md` |

### Architecture Documents

Searches for markdown files in: `docs/`, `doc/`, `architecture/`, `design/`, `specs/`, `ADR/`, `adr/`, `decisions/`

### AI Assistant Configurations

Detects configuration files for AI coding assistants: `CLAUDE.md`, `.claude/**/*.md`, `.cursorrules`, `.cursor/**/*.md`, `.github/copilot-instructions.md`, `.aider*`, `.continue/**/*`, `cline_docs/**/*`, `.clinerules`

---

## Extending: Adding a New Detector

To add a new detector:

1. **Define the output type** in `src/discovery/types.ts`:

   ```typescript
   export interface MyDetectionInfo {
     // Your detection results
   }
   ```

2. **Add the section to `SecurityProfile`** in `src/discovery/types.ts`:

   ```typescript
   export interface SecurityProfile {
     // ... existing fields
     myDetection: MyDetectionInfo;
   }
   ```

3. **Implement the detector** in `src/discovery/detectors/my-detector.ts`:

   ```typescript
   import type {Detector, DetectorContext, MyDetectionInfo} from '../types.js';

   export const myDetector: Detector<MyDetectionInfo> = {
     name: 'my-detector',

     async detect(ctx: DetectorContext): Promise<MyDetectionInfo> {
       // Use ctx.findFiles(), ctx.readFile(), ctx.readJson(),
       // ctx.readYaml(), ctx.fileExists(), ctx.grep()
       return { /* results */ };
     },
   };
   ```

4. **Export from the barrel** in `src/discovery/detectors/index.ts`:

   ```typescript
   export {myDetector} from './my-detector.js';
   ```

5. **Register in the engine** in `src/discovery/engine.ts`:

   ```typescript
   import {myDetector} from './detectors/index.js';

   // Add to the detectors array:
   {name: myDetector.name, fn: () => myDetector.detect(ctx)},
   ```

6. **Add fallback handling** in the engine's profile assembly.

7. **Write tests** in `src/discovery/detectors/__tests__/my-detector.test.ts`.

### DetectorContext API

Every detector receives a `DetectorContext` with these methods:

| Method | Description |
|--------|-------------|
| `findFiles(patterns: string[])` | Find files matching glob patterns (excludes `node_modules`, `.git`, etc.) |
| `readFile(path: string)` | Read a file's content as a string, or `null` if not found |
| `readJson<T>(path: string)` | Read and parse a JSON file, or `null` if not found/invalid |
| `readYaml<T>(path: string)` | Read and parse a YAML file, or `null` if not found/invalid |
| `fileExists(path: string)` | Check if a file exists |
| `grep(pattern, filePatterns, options?)` | Search file contents with a regex pattern |

All file paths are relative to `ctx.rootDir`.
