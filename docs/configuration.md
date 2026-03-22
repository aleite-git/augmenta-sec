# Configuration Reference

AugmentaSec is configured via YAML files. Configuration is loaded from two locations, with project-level settings taking precedence:

1. **Global**: `~/.augmenta-sec/config.yaml` -- defaults for all projects
2. **Project**: `.augmenta-sec/config.yaml` -- per-project overrides

All settings have sensible defaults. An empty or missing config file is valid.

### Loading and Merging

Configuration is loaded by `src/config/loader.ts` using a three-layer merge:

```
built-in defaults (src/config/defaults.ts)
  <- global config (~/.augmenta-sec/config.yaml)
    <- project config (.augmenta-sec/config.yaml)
```

For nested objects, merging is recursive (deep merge). For arrays (like `scanners` and `categories`), the entire array is replaced -- not concatenated.

---

## LLM Configuration

```yaml
llm:
  triage: gemini/gemini-2.5-flash-lite
  analysis: gemini/gemini-2.5-flash
  reasoning: gemini/gemini-2.5-pro
```

Three task-oriented roles: **triage** (high-volume, low-complexity, hundreds/scan), **analysis** (moderate, tens/scan), **reasoning** (low-volume, high-complexity, few/scan).

Model format: `provider/model-name` (validated: `^[a-zA-Z0-9_-]+/[a-zA-Z0-9._-]+$`).

Supported providers: `gemini/*`, `mistral/*`, `openai/*`, `anthropic/*`, `ollama/*` (local, no API key).

API keys: `GEMINI_API_KEY`, `MISTRAL_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`.

---

## Autonomy

```yaml
autonomy:
  critical: create-pr-and-alert
  high: create-issue
  medium: report
  low: note
  max_auto_prs_per_day: 3
  never_auto_merge: true
  respect_freeze: true
```

Actions: `create-pr-and-alert` (auto-fix PR + notify), `create-issue` (file ticket), `report` (scan report only), `note` (log silently).

Safety rails: `max_auto_prs_per_day` (default 3, 0 to disable), `never_auto_merge` (default true), `respect_freeze` (default true).

---

## Scanners

```yaml
scanners:
  - semgrep
  - trivy
  # - codeql
  # - gitleaks
  # - npm-audit
  # - pip-audit
  # - cargo-audit
  # - bandit
  # - gosec
```

All 9 scanners check if their binary is installed on PATH and skip gracefully if not found.

| Scanner | Category | Command |
|---------|----------|---------|
| `semgrep` | SAST | `semgrep scan --json --config auto` |
| `trivy` | SCA/Container | `trivy fs --format json` |
| `npm-audit` | SCA | `npm audit --json` |
| `gitleaks` | Secrets | `gitleaks detect --report-format json` |
| `codeql` | SAST | CodeQL CLI |
| `pip-audit` | SCA | `pip-audit --format json` |
| `cargo-audit` | SCA | `cargo audit --json` |
| `bandit` | SAST | `bandit -r --format json` |
| `gosec` | SAST | `gosec -fmt json ./...` |

---

## Scan Settings

```yaml
scan:
  categories: [auth, pii, injection, dependencies, secrets, config, crypto, containers]
  min_severity: low          # critical | high | medium | low | informational
  max_findings: 0            # 0 = unlimited
```

---

## Review Settings

```yaml
review:
  auto_approve_below: medium   # auto-approve if no findings at/above this severity
  inline_comments: true        # post inline comments on specific lines
  summary_comment: true        # post summary comment on PR
```

---

## Output Settings

```yaml
output:
  format: text       # text | json | yaml
  verbosity: normal  # quiet | normal | verbose
```

---

## Schema Validation

Configuration is validated at load time using Zod schemas (`src/config/schema.ts`). Invalid configuration produces clear error messages.

Validation rules: model format regex, severity enum, autonomy action enum, non-negative integers for `max_auto_prs_per_day` and `max_findings`.
