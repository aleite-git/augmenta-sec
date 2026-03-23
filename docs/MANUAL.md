# AugmentaSec — User Manual

AI-powered security engineer that onboards to any codebase.

---

## Table of Contents

1. [Installation](#installation)
2. [Quick Start (5 minutes)](#quick-start)
3. [Commands](#commands)
   - [asec init](#asec-init)
   - [asec scan](#asec-scan)
   - [asec review](#asec-review)
   - [asec serve](#asec-serve)
4. [Configuration](#configuration)
   - [LLM Providers](#llm-providers)
   - [Scanners](#scanners)
   - [Autonomy](#autonomy)
   - [Custom Scanners](#custom-scanners)
5. [CI/CD Integration](#cicd-integration)
   - [GitHub Actions](#github-actions)
   - [GitLab CI](#gitlab-ci)
6. [The Knowledge Base](#the-knowledge-base)
7. [Troubleshooting](#troubleshooting)

---

## Installation

### Prerequisites

- **Node.js 18+** (required)
- One or more LLM API keys (optional — needed for LLM-powered analysis)
- External scanners like Semgrep, Trivy, etc. (optional — skipped gracefully if not installed)

### Install from npm

```bash
npm install -g augmenta-sec
asec --version
```

### Install from source

```bash
git clone https://github.com/augmenta-sec/augmenta-sec.git
cd augmenta-sec
npm install
npm run build
npm link    # makes `asec` available globally
```

---

## Quick Start

### Step 1: Set up API keys

Copy the example env file and add your key(s). You only need keys for the providers you plan to use.

```bash
cp .env.example .env
```

Edit `.env`:

```env
# Pick one (or more). Gemini is the default.
GOOGLE_AI_API_KEY=your-key-here

# Optional alternatives:
# MISTRAL_API_KEY=your-key
# OPENAI_API_KEY=your-key
# ANTHROPIC_API_KEY=your-key
```

> **No API key?** AugmentaSec still works — `init` runs fully offline, and `scan` uses external scanners without LLM. Only `review` and deep analysis features need an LLM.

### Step 2: Profile your codebase

```bash
cd /path/to/your/project
asec init
```

This runs 18 parallel detectors and creates `.augmenta-sec/profile.yaml` — a complete map of your codebase's security posture: languages, frameworks, auth, databases, APIs, security controls, CI/CD, and more.

**Output example:**

```
AugmentaSec Discovery Engine
────────────────────────────────────────────────────────────
  Target             /path/to/your/project

Discovery Results
────────────────────────────────────────────────────────────
  Languages          typescript (72%), python (28%)
  Frameworks         express 4.21.0, django
  Authentication     jwt (first-party)
  Database           postgresql via prisma
  API Surface        rest — 24 routes detected

  Security Controls
  [+] Input Validation zod
  [+] CORS cors
  [-] Rate Limiting not detected
  [-] Content Security Policy not detected

+ Profile written to .augmenta-sec/profile.yaml
```

### Step 3: Run a security scan

```bash
asec scan
```

This orchestrates your installed scanners (Semgrep, Trivy, etc.) in parallel, deduplicates findings, and applies contextual severity scoring based on your profile.

### Step 4: Review a PR

```bash
# By PR number
asec review 42

# By URL
asec review https://github.com/your-org/your-repo/pull/42

# Review all open PRs
asec review --all
```

Requires `GITHUB_TOKEN` and `GITHUB_REPOSITORY` environment variables.

### Step 5: Commit your knowledge base

```bash
git add .augmenta-sec/
git commit -m "chore: add security profile"
```

The `.augmenta-sec/` directory is your agent's brain — version-control it so it persists across runs and team members.

---

## Commands

### `asec init`

**Profiles your codebase and creates the security knowledge base.**

```bash
asec init [path]
```

| Argument | Default | Description |
|----------|---------|-------------|
| `path` | `.` (current directory) | Target directory to profile |

**What it detects:**

| Detector | What it finds |
|----------|---------------|
| Language | Primary language, file counts, percentages |
| Framework | Backend, frontend, ORM, testing frameworks |
| Auth | JWT, OAuth, SAML, session management, MFA |
| Database | PostgreSQL, MySQL, MongoDB, Redis, ORMs |
| API | REST routes, GraphQL, gRPC, OpenAPI specs |
| Security Controls | Helmet, CORS, rate limiting, CSP, input validation |
| CI/CD | GitHub Actions, GitLab CI, workflows, security checks |
| Documentation | README, SECURITY.md, CHANGELOG, LICENSE |
| Docker | Dockerfiles, compose, base images, non-root checks |
| Infrastructure | Terraform, Pulumi, CDK, CloudFormation |
| Secrets | .env files, hardcoded credentials, secret patterns |
| Monorepo | Workspace mapping, per-package profiles |
| Licenses | Copyleft, restrictive, unknown license detection |
| Ecosystem | Python (Poetry, pip), Go (modules), Rust (Cargo), JVM (Maven, Gradle) |

**Re-running `init`:**

Safe to re-run at any time. If a profile already exists, AugmentaSec **merges** fresh results with your existing profile:

- Auto-detected fields are refreshed
- Manual annotations are preserved (trust boundaries with notes, PII fields with confidence 1.0)
- Merge conflicts are displayed so you know what was kept

```
i Existing profile found — merging...

  Merge Conflicts
  ⚠ trustBoundaries.candidates[api-gateway]: Manual annotation preserved (kept-existing)
```

---

### `asec scan`

**Runs a full security scan using configured scanners.**

```bash
asec scan [path]
```

| Argument | Default | Description |
|----------|---------|-------------|
| `path` | `.` (current directory) | Target directory to scan |

**Requires:** A security profile (run `asec init` first).

**What happens:**

1. Loads your profile from `.augmenta-sec/profile.yaml`
2. Resolves and checks which scanners are installed
3. Runs all available scanners in parallel
4. Normalizes findings into a unified format
5. Deduplicates across scanners (exact + fuzzy matching)
6. Applies contextual severity scoring:
   - Findings in auth code → severity bumped
   - Findings in public API routes → severity bumped
   - Findings in test/vendor code → severity lowered
7. Filters by minimum severity threshold
8. Outputs a consolidated report

**Output example:**

```
Scan Results
────────────────────────────────────────────────────────────
  Target             /path/to/project
  Total findings     7

  Severity Breakdown
    high            2
    medium          3
    low             2

  Top Findings
    [HIGH] sql-injection
      src/api/users.ts:42
    [HIGH] missing-auth-check
      src/routes/admin.ts:18
```

**Scanners not installed?** AugmentaSec warns and skips them — the scan continues with whatever is available.

---

### `asec review`

**Security-reviews a pull request using LLM analysis.**

```bash
asec review [pr] [options]
```

| Argument / Flag | Default | Description |
|-----------------|---------|-------------|
| `pr` | — | PR number, `#42`, or full GitHub URL |
| `--all` | — | Review all open PRs in the repo |
| `--concurrency <n>` | `3` | Max parallel reviews (with `--all`) |

**Requires:**
- `GITHUB_TOKEN` environment variable (or `GITLAB_TOKEN`)
- `GITHUB_REPOSITORY` in `owner/repo` format
- An LLM API key configured

**What happens:**

1. Fetches the PR diff from GitHub/GitLab
2. Filters to code files only (ignores images, lock files, etc.)
3. Batches small files to reduce API calls
4. Sends changed code to your configured LLM for security review
5. Parses findings and applies severity thresholds
6. Posts inline comments on specific lines (if enabled)
7. Posts a summary comment on the PR
8. Auto-approves if no findings above threshold (if configured)

**Examples:**

```bash
# Review PR #42
asec review 42

# Review by URL
asec review https://github.com/org/repo/pull/42

# Batch review all open PRs
asec review --all --concurrency 5
```

---

### `asec serve`

**Runs AugmentaSec as a persistent HTTP server for continuous monitoring.**

```bash
asec serve [options]
```

| Flag | Default | Description |
|------|---------|-------------|
| `--port <n>` | `7400` | HTTP port |
| `--host <host>` | `127.0.0.1` | Bind address |
| `--api-key <key>` | — | Enable API key authentication |
| `--db-path <path>` | — | SQLite database location |
| `--github-secret <secret>` | — | GitHub webhook signature secret |
| `--gitlab-secret <secret>` | — | GitLab webhook signature secret |

**Features:**
- Webhook handlers for GitHub/GitLab push and PR events
- Scheduled scans (cron-like)
- REST API for querying findings and triggering scans
- Multi-repo management
- Health and status endpoints (`/health`, `/status`)
- Web dashboard for security posture overview

---

## Configuration

AugmentaSec is configured via YAML files. Settings are loaded in priority order:

1. **Project config**: `.augmenta-sec/config.yaml` (highest priority)
2. **Global config**: `~/.augmenta-sec/config.yaml`
3. **Built-in defaults** (lowest priority)

All settings are optional. An empty or missing config file is valid — defaults are applied.

To get started, copy the example:

```bash
cp config.example.yaml .augmenta-sec/config.yaml
```

### LLM Providers

AugmentaSec uses three **task-oriented roles** to route work to the right model:

```yaml
llm:
  triage: gemini/gemini-2.5-flash-lite    # Fast + cheap — hundreds of calls
  analysis: gemini/gemini-2.5-flash       # Balanced — tens of calls
  reasoning: gemini/gemini-2.5-pro        # Smart — a few calls
```

| Role | Volume | Use case |
|------|--------|----------|
| `triage` | High | "Is this finding a true positive?" |
| `analysis` | Medium | "Review this endpoint for auth gaps" |
| `reasoning` | Low | "Generate a threat model for this system" |

**Supported providers and models:**

| Provider | Models | API Key Env Var |
|----------|--------|-----------------|
| `gemini/` | `gemini-2.5-flash-lite`, `gemini-2.5-flash`, `gemini-2.5-pro` | `GOOGLE_AI_API_KEY` |
| `mistral/` | `mistral-small-latest`, `mistral-large-latest`, `codestral-latest` | `MISTRAL_API_KEY` |
| `openai/` | `gpt-4o-mini`, `gpt-4o` | `OPENAI_API_KEY` |
| `anthropic/` | `claude-sonnet-4-6`, `claude-opus-4-6` | `ANTHROPIC_API_KEY` |
| `ollama/` | `llama3`, `codellama`, any local model | None (local) |

**Example configurations:**

```yaml
# All Gemini (simple, one API key)
llm:
  triage: gemini/gemini-2.5-flash-lite
  analysis: gemini/gemini-2.5-flash
  reasoning: gemini/gemini-2.5-pro

# Privacy-first (local triage, cloud reasoning)
llm:
  triage: ollama/llama3
  analysis: ollama/codellama
  reasoning: anthropic/claude-sonnet-4-6

# Single model for everything
llm:
  triage: openai/gpt-4o
  analysis: openai/gpt-4o
  reasoning: openai/gpt-4o
```

### Scanners

Configure which external scanners to orchestrate:

```yaml
scanners:
  - semgrep       # SAST — static analysis (pip install semgrep)
  - trivy         # SCA + containers (brew install trivy)
  - gitleaks      # Secret detection (brew install gitleaks)
  - npm-audit     # Node.js dependencies (built into npm)
  - codeql        # Semantic analysis (GitHub CLI)
  - pip-audit     # Python dependencies (pip install pip-audit)
  - bandit        # Python SAST (pip install bandit)
  - gosec         # Go SAST (go install github.com/securego/gosec/...)
  - cargo-audit   # Rust dependencies (cargo install cargo-audit)
  - zap           # OWASP ZAP DAST (requires running ZAP instance)
```

Each scanner is checked for availability before the scan. Missing scanners are skipped with a warning — the scan continues with whatever is available.

### Autonomy

Controls what AugmentaSec is allowed to do automatically, gated by finding severity:

```yaml
autonomy:
  critical: create-pr-and-alert    # Auto-create fix PR + notify
  high: create-issue               # File ticket with full context
  medium: report                   # Add to scan report only
  low: note                        # Log silently

  max_auto_prs_per_day: 3          # Safety rail
  never_auto_merge: true           # Never auto-merge fix PRs
  respect_freeze: true             # Respect sprint freeze windows
```

| Action | What it does |
|--------|-------------|
| `create-pr-and-alert` | Creates a fix branch + PR and notifies humans |
| `create-issue` | Files a GitHub/GitLab issue with full finding context |
| `report` | Includes in the scan report only |
| `note` | Logs in the knowledge base silently |

### Scan Settings

```yaml
scan:
  categories:        # Which vulnerability categories to check
    - auth           # Authentication and authorization
    - pii            # PII exposure
    - injection      # SQL, XSS, command injection
    - dependencies   # Vulnerable dependencies
    - secrets        # Hardcoded secrets
    - config         # Security misconfigurations
    - crypto         # Weak cryptography
    - containers     # Docker/container issues

  min_severity: low           # Minimum severity to report
  max_findings: 0             # 0 = unlimited
```

### Review Settings

```yaml
review:
  auto_approve_below: medium    # Auto-approve if nothing at/above this
  inline_comments: true         # Line-level comments on the PR
  summary_comment: true         # Summary comment on the PR
```

### Output Settings

```yaml
output:
  format: text        # text | json | yaml
  verbosity: normal   # quiet | normal | verbose
```

### Custom Scanners

Register your own scanners via config — either command-based (wraps any CLI tool) or module-based (loads an ESM module):

```yaml
custom_scanners:
  # Command-based: wraps any CLI tool
  - name: my-sast-tool
    command: /usr/local/bin/my-scanner
    args: ['--json', '--target']
    output_format: sarif       # sarif | json
    category: sast             # sast | dast | sca | container | secrets
    timeout: 120000            # ms (optional)

  # Module-based: loads an ESM module
  - name: custom-checker
    module: ./scanners/custom-checker.mjs
```

**Command-based scanners** must output either SARIF or a JSON array of findings to stdout.

**Module-based scanners** must export a `createScanner` function that returns an object implementing the `SecurityScanner` interface:

```typescript
// ./scanners/custom-checker.mjs
export function createScanner() {
  return {
    name: 'custom-checker',
    category: 'sast',
    async isAvailable() { return true; },
    async scan(target) {
      // target.rootDir is the project root
      return {
        scanner: 'custom-checker',
        category: 'sast',
        findings: [/* RawFinding objects */],
        duration: 0,
      };
    },
  };
}
```

---

## CI/CD Integration

### GitHub Actions

Add AugmentaSec as a PR review step:

```yaml
# .github/workflows/security-review.yml
name: Security Review
on:
  pull_request:
    types: [opened, synchronize]

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: augmenta-sec/action@v1
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          severity-threshold: low
          llm-provider: gemini/gemini-2.5-flash
          llm-api-key: ${{ secrets.GEMINI_API_KEY }}
```

**Action inputs:**

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `github-token` | Yes | `${{ github.token }}` | GitHub token for API access |
| `severity-threshold` | No | `low` | Minimum severity to report |
| `config-path` | No | — | Path to custom config file |
| `llm-provider` | No | — | Override LLM provider/model |
| `llm-api-key` | No | — | API key for the LLM provider |

**Action outputs:**

| Output | Description |
|--------|-------------|
| `findings-count` | Total number of findings |
| `approved` | `true` if PR was approved |
| `summary` | Text summary of the review |

### GitLab CI

```yaml
# .gitlab-ci.yml
include:
  - remote: 'https://raw.githubusercontent.com/augmenta-sec/augmenta-sec/main/templates/gitlab-ci.yml'

security-review:
  stage: test
  variables:
    GITLAB_TOKEN: $CI_JOB_TOKEN
    GEMINI_API_KEY: $GEMINI_API_KEY
```

---

## The Knowledge Base

AugmentaSec stores everything it learns in the `.augmenta-sec/` directory at the root of your project. **This directory should be committed to version control.**

| File | Purpose |
|------|---------|
| `profile.yaml` | Codebase security profile (languages, frameworks, auth, APIs, controls) |
| `config.yaml` | Your configuration (LLM, scanners, autonomy, thresholds) |
| `endpoints.yaml` | Full API surface map (auto-generated) |
| `threat-model.yaml` | Living threat model (LLM-enhanced) |
| `pii-map.yaml` | PII field inventory and data flows |
| `history/` | Historical scan results for trend tracking |

The profile grows smarter over time:
- Re-running `init` refreshes auto-detected data while preserving your manual annotations
- Scan history accumulates in `history/` for trend analysis
- Trust boundaries and PII fields can be manually curated (set `confidence: 1.0` or add `notes:` to preserve them across re-scans)

---

## Troubleshooting

### "No security profile found"

Run `asec init` first to create `.augmenta-sec/profile.yaml`.

### Scanner not found

Scanners are optional. If you see a warning like `Scanner semgrep is not available — skipping`, install it:

| Scanner | Install command |
|---------|----------------|
| Semgrep | `pip install semgrep` |
| Trivy | `brew install trivy` (macOS) |
| Gitleaks | `brew install gitleaks` (macOS) |
| Bandit | `pip install bandit` |
| pip-audit | `pip install pip-audit` |
| GoSec | `go install github.com/securego/gosec/v2/cmd/gosec@latest` |
| cargo-audit | `cargo install cargo-audit` |
| CodeQL | [GitHub CLI docs](https://codeql.github.com/docs/codeql-cli/) |
| OWASP ZAP | `docker pull zaproxy/zap-stable` or [zaproxy.org](https://www.zaproxy.org/download/) |

### LLM API errors

| Error | Fix |
|-------|-----|
| `401 / Unauthorized` | Check your API key in `.env` or the environment variable |
| `429 / Rate limit` | Wait and retry, or switch to a different model |
| `402 / Quota exceeded` | Check billing dashboard for your LLM provider |
| `Connection refused` | If using Ollama, ensure server is running: `ollama serve` |
| `Model not found` | Check model name in config. For Ollama: `ollama pull <model>` |

### PR review not posting comments

- Ensure `GITHUB_TOKEN` has `pull-requests: write` permission
- Ensure `GITHUB_REPOSITORY` is set to `owner/repo` format
- Check that the token has access to the repository

### Verbose mode

For debugging, run any command with verbose output:

```bash
# Via config
# output:
#   verbosity: verbose

# Or set env
ASEC_DEBUG=1 asec scan
```

---

## Common Workflows

### First-time setup for a new project

```bash
cd /path/to/project
asec init                          # Profile the codebase
cp config.example.yaml .augmenta-sec/config.yaml   # Customize config
asec scan                          # Run security scan
git add .augmenta-sec/
git commit -m "chore: add security profile"
```

### Daily development

```bash
asec scan                          # Check for issues before pushing
asec review 42                     # Review your PR before requesting review
```

### CI pipeline

```bash
asec init                          # Re-profile (catches new deps, frameworks)
asec scan --format json            # Machine-readable output for CI
asec review $PR_NUMBER             # Auto-review the PR
```

### Team onboarding

```bash
git clone <repo>
cd <repo>
npm install -g augmenta-sec
asec scan                          # Instantly see the security posture
# Profile is already in .augmenta-sec/ — no setup needed
```
