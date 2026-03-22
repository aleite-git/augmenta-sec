# AugmentaSec

**AI-powered security engineer that onboards to any codebase.**

[![npm version](https://img.shields.io/npm/v/augmenta-sec.svg)](https://www.npmjs.com/package/augmenta-sec)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![CI](https://github.com/augmenta-sec/augmenta-sec/actions/workflows/ci.yml/badge.svg)](https://github.com/augmenta-sec/augmenta-sec/actions/workflows/ci.yml)
[![Coverage](https://img.shields.io/badge/coverage-%E2%89%A580%25-brightgreen.svg)](https://github.com/augmenta-sec/augmenta-sec)

---

AugmentaSec profiles your codebase, orchestrates security scanners, and uses LLM reasoning to deliver findings that actually matter in *your* specific context. It does not replace scanners -- it sits above them, correlates their output, fills their blind spots, and acts like a human security engineer would.

## Quick Start

```bash
# Install globally
npm install -g augmenta-sec

# Profile a codebase (discovery engine)
asec init /path/to/your/repo

# Run a full security scan
asec scan

# Review a pull request
asec review 42
```

`asec init` runs 18 parallel detectors against your codebase and writes a security profile to `.augmenta-sec/profile.yaml`. This profile becomes the foundation for all subsequent scans, reviews, and remediation.

## Features

### Discovery Engine (18 Detectors)

AugmentaSec automatically profiles any codebase by detecting:

| Detector | What it finds |
|---|---|
| **Language** | Primary language, file counts, ecosystem (Node, Python, Go, Rust, JVM, etc.) |
| **Framework** | Backend, frontend, fullstack, ORM, and testing frameworks with versions |
| **Auth** | Auth providers (Firebase, Auth0, Supabase, Clerk, Cognito, Keycloak, Passport, JWT) and patterns (middleware, guards, RBAC, decorators) |
| **Database** | Database types, drivers, ORMs, migration directories, schema directories |
| **API** | REST endpoints, GraphQL, tRPC, OpenAPI/Swagger spec detection |
| **Security Controls** | Helmet, CORS, rate limiting, input validation, CSRF, password hashing, XSS prevention, CSP |
| **CI/CD** | GitHub Actions, GitLab CI, Jenkins, CircleCI, Travis, Bitbucket Pipelines, Azure DevOps, Drone, Buildkite |
| **Docs** | README, SECURITY.md, CONTRIBUTING, CHANGELOG, LICENSE, architecture docs, AI assistant configs |
| **Monorepo** | npm/Yarn/pnpm workspaces, Lerna, Turborepo, Nx |
| **Git Metadata** | Remote URL, hosting platform (GitHub/GitLab/Bitbucket/Azure DevOps/Gitea), owner, repo |
| **Docker** | Dockerfiles, Compose files, base images, multi-stage builds, non-root users, health checks |
| **Infrastructure as Code** | Terraform, Pulumi, CDK, CloudFormation, Ansible, Helm |
| **Secrets** | Hardcoded secrets, env files, gitignore coverage |
| **Licenses** | Project license, dependency license risk (copyleft, restrictive) |
| **Python Ecosystem** | Package manager, virtual envs, frameworks, security dependencies |
| **Go Ecosystem** | go.mod analysis, unsafe imports, frameworks, security tools |
| **Rust Ecosystem** | Cargo workspace, unsafe blocks, frameworks, security crates |
| **JVM Ecosystem** | Maven/Gradle/sbt, Spring Boot/Security, frameworks, security dependencies |

### LLM-Agnostic

Route different types of work to different models via three task-oriented roles:

- **Triage** -- high-volume, low-complexity: "Is this finding relevant?"
- **Analysis** -- moderate-volume: "Review this endpoint for auth gaps."
- **Reasoning** -- low-volume, high-complexity: "Generate a threat model."

Supported providers: **Gemini**, **Mistral**, **OpenAI**, **Anthropic**, **Ollama** (local). Mix and match freely across roles.

```yaml
# .augmenta-sec/config.yaml
llm:
  triage: gemini/gemini-2.5-flash-lite     # Fast and cheap
  analysis: mistral/codestral-latest        # Code-aware
  reasoning: gemini/gemini-2.5-pro          # Deep reasoning
```

### Scanner Orchestration

Orchestrates external scanners through a unified interface:

| Scanner | Category | Status |
|---------|----------|--------|
| **Semgrep** | SAST (static analysis) | Available |
| **Trivy** | SCA + container scanning | Available |
| **npm audit** | Node.js dependency vulnerabilities | Available |
| **Gitleaks** | Secret detection | Available |
| **CodeQL** | Semantic analysis | Available |
| **pip-audit** | Python dependency vulnerabilities | Available |
| **cargo-audit** | Rust dependency vulnerabilities | Available |
| **Bandit** | Python security linting | Available |
| **Gosec** | Go security linting | Available |

AugmentaSec checks if each scanner binary is installed and skips gracefully if not found.

### PR Review

Automated pull request review with security focus:

- Inline comments on specific lines with severity badges
- Summary comment with overall assessment
- Auto-approve PRs below a configurable severity threshold
- Context-aware: uses the security profile to understand what matters

### Remediation Engine

Generates actionable remediation suggestions for scan findings:

- Rule-based suggestions for common vulnerability patterns
- Optional LLM enhancement for deeper, context-aware remediation
- Priority scoring using the security profile (public-facing, handles PII, auth code)
- Effort estimation (low/medium/high)
- Sorted output: highest-priority, lowest-effort fixes first

### Severity-Gated Autonomy

Control what AugmentaSec is allowed to do, gated by finding severity:

```yaml
autonomy:
  critical: create-pr-and-alert    # Auto-create a fix PR and notify
  high: create-issue               # File a ticket with full context
  medium: report                   # Add to the scan report
  low: note                        # Log silently

  max_auto_prs_per_day: 3
  never_auto_merge: true
  respect_freeze: true
```

### Server Mode

Run AugmentaSec as a persistent daemon with webhook listeners, scheduled scans, and a REST API:

```bash
asec serve --port 3000
```

Features: health checks, API key authentication, multi-repo management, scan scheduling, activity tracking, and a web dashboard.

### Trend Analysis

Track security posture over time:

```bash
asec trends
```

Displays historical scan data: finding counts by severity, category breakdowns, and regression detection across scan runs.

## Architecture Overview

```
Discovery        Profile          Scan             Findings          Action
---------        -------          ----             --------          ------
18 detectors --> profile.yaml --> scanners     --> normalized    --> report
(parallel)       (knowledge)      + LLM            findings         PR review
                                  analysis         (deduplicated)   remediation
                                  + drift                           issues
                                  detection                         auto-fix
```

**Core modules:**

```
src/
  cli/                  # Commander-based CLI (init, scan, review, trends, serve)
  config/               # YAML config loading + Zod schema validation
  discovery/            # 18 parallel detectors + profile writer
    detectors/          # language, framework, auth, database, api,
                        # security-controls, ci, docs, monorepo,
                        # git-metadata, docker, iac, secrets, licenses,
                        # python-ecosystem, go-ecosystem, rust-ecosystem,
                        # jvm-ecosystem
  providers/
    llm/                # LLM abstraction (Gemini, Mistral, OpenAI,
                        # Anthropic, Ollama + gateway routing)
    git-platform/       # Git platform abstraction (GitHub impl)
    scanner/            # Scanner abstraction (Semgrep, Trivy, npm audit,
                        # Gitleaks, CodeQL, pip-audit, cargo-audit,
                        # Bandit, Gosec)
  findings/             # Unified finding schema, severity logic,
                        # deduplication, compliance mapping
  scan/                 # Scan engine, drift detection, threat modeling,
                        # PII mapping, trust boundaries
  review/               # PR review engine, diff analysis, formatting
  remediation/          # Remediation engine, rules, priority scoring,
                        # effort estimation, auto-fix, PR/issue creation
  report/               # HTML/JSON reports, interactive mode, trends
  server/               # HTTP server, webhooks, scheduler, dashboard,
                        # multi-repo management, rate limiting
  errors/               # Error types, graceful degradation handler
  utils/                # File utilities, logger
```

The `.augmenta-sec/` directory in each target repo acts as the agent's persistent knowledge base:

```
.augmenta-sec/
  profile.yaml          # Discovery output (what this codebase is)
  config.yaml           # Agent behavior and autonomy settings
  endpoints.yaml        # Full API surface (auto-generated)
  threat-model.yaml     # Living threat model (LLM-enhanced)
  pii-map.yaml          # PII field inventory
  findings/             # Scan results over time
```

## Configuration

Copy `config.example.yaml` to `.augmenta-sec/config.yaml` in your project:

```bash
mkdir -p .augmenta-sec
cp config.example.yaml .augmenta-sec/config.yaml
```

See [docs/configuration.md](docs/configuration.md) for a full reference of every option.

## Documentation

- [Getting Started](docs/getting-started.md) -- installation, first run, understanding the profile
- [Configuration Reference](docs/configuration.md) -- every config option explained
- [Detectors](docs/detectors.md) -- what each of the 18 detectors finds and how to extend them
- [Provider Implementation Guide](docs/providers.md) -- how to add LLM, Git platform, or scanner providers
- [Contributing](CONTRIBUTING.md) -- development setup, code style, PR process
- [Security Policy](SECURITY.md) -- vulnerability reporting process
- [Architecture Decision Records](docs/adr/) -- key design decisions and their rationale
- [Strategy & Roadmap](docs/STRATEGY.md) -- vision, competitive landscape, phased roadmap

## Requirements

- Node.js 18+
- Optional: Semgrep, Trivy, or other scanners for full scan capabilities
- Optional: API keys for LLM providers (Gemini, Mistral, OpenAI, Anthropic)

## License

[MIT](LICENSE)
