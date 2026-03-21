# Configuration Reference

AugmentaSec is configured via YAML files. Configuration is loaded from two locations, with project-level settings taking precedence:

1. **Global**: `~/.augmenta-sec/config.yaml` -- defaults for all projects
2. **Project**: `.augmenta-sec/config.yaml` -- per-project overrides

All settings have sensible defaults. An empty or missing config file is valid -- you only need to override what you want to change.

The reference configuration with all options and examples is in `config.example.yaml` at the project root.

---

## LLM Configuration

```yaml
llm:
  triage: gemini/gemini-2.5-flash-lite
  analysis: gemini/gemini-2.5-flash
  reasoning: gemini/gemini-2.5-pro
```

AugmentaSec uses three task-oriented roles to decide which model handles each type of work. You assign any supported model to any role.

### Roles

| Role | Volume | Complexity | Example tasks |
|------|--------|------------|---------------|
| `triage` | High (hundreds/scan) | Low | "Is this finding relevant?" "Is this file security-related?" "Does this diff touch auth code?" |
| `analysis` | Moderate (tens/scan) | Moderate | "Review this endpoint for auth gaps." "Map the PII flow." "Draft a fix for this XSS." |
| `reasoning` | Low (a few/scan) | High | "Generate a threat model." "Explain this architectural risk." "Correlate these 12 findings." |

### Model Format

Models are specified as `provider/model-name`:

```
gemini/gemini-2.5-flash-lite
gemini/gemini-2.5-flash
gemini/gemini-2.5-pro
mistral/mistral-small-latest
mistral/mistral-large-latest
mistral/codestral-latest
openai/gpt-4o-mini
openai/gpt-4o
anthropic/claude-sonnet-4-6
anthropic/claude-opus-4-6
ollama/llama3                    # Local, no API key needed
ollama/codellama
```

### Configuration Examples

**All Gemini (simple, one API key):**

```yaml
llm:
  triage: gemini/gemini-2.5-flash-lite
  analysis: gemini/gemini-2.5-flash
  reasoning: gemini/gemini-2.5-pro
```

**Mixed providers:**

```yaml
llm:
  triage: gemini/gemini-2.5-flash-lite
  analysis: mistral/codestral-latest
  reasoning: gemini/gemini-2.5-pro
```

**Single model for everything:**

```yaml
llm:
  triage: gemini/gemini-2.5-flash
  analysis: gemini/gemini-2.5-flash
  reasoning: gemini/gemini-2.5-flash
```

**Privacy-first (local triage, cloud reasoning):**

```yaml
llm:
  triage: ollama/llama3
  analysis: ollama/codellama
  reasoning: gemini/gemini-2.5-pro
```

### API Keys

Set the appropriate environment variable for each provider you use:

| Provider | Environment Variable |
|----------|---------------------|
| Gemini | `GEMINI_API_KEY` |
| Mistral | `MISTRAL_API_KEY` |
| OpenAI | `OPENAI_API_KEY` |
| Anthropic | `ANTHROPIC_API_KEY` |
| Ollama | None (local) |

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

Controls what AugmentaSec is allowed to do on its own, gated by finding severity.

### Actions

| Action | Description |
|--------|-------------|
| `create-pr-and-alert` | Auto-create a fix PR and notify humans |
| `create-issue` | File a ticket with full context |
| `report` | Add to the scan report only |
| `note` | Log in the knowledge base silently |

### Safety Rails

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `max_auto_prs_per_day` | integer | `3` | Maximum number of auto-generated PRs per day. Set to `0` to disable auto-PRs. |
| `never_auto_merge` | boolean | `true` | When `true`, auto-generated PRs are never merged automatically. Always requires human review. |
| `respect_freeze` | boolean | `true` | When `true`, AugmentaSec checks for code freeze status before taking automated actions. |

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

Lists the external scanners to orchestrate. AugmentaSec checks if each scanner binary is installed on `PATH` and skips gracefully if not found.

### Supported Scanners

| Scanner | Category | What it does |
|---------|----------|-------------|
| `semgrep` | SAST | Static analysis with pattern matching |
| `trivy` | SCA / Container | Dependency vulnerabilities and container image scanning |
| `npm-audit` | SCA | Node.js dependency vulnerabilities via `npm audit` |
| `codeql` | SAST | GitHub's semantic code analysis (planned) |
| `gitleaks` | Secrets | Detect hardcoded secrets and credentials (planned) |
| `pip-audit` | SCA | Python dependency vulnerabilities (planned) |
| `cargo-audit` | SCA | Rust dependency vulnerabilities (planned) |
| `bandit` | SAST | Python security linter (planned) |
| `gosec` | SAST | Go security linter (planned) |

---

## Scan Settings

```yaml
scan:
  categories:
    - auth
    - pii
    - injection
    - dependencies
    - secrets
    - config
    - crypto
    - containers

  min_severity: low
  max_findings: 0
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `categories` | string[] | All categories | Which security categories to include in scans. |
| `min_severity` | string | `low` | Minimum severity to report. Findings below this threshold are dropped. Values: `critical`, `high`, `medium`, `low`, `informational`. |
| `max_findings` | integer | `0` (unlimited) | Stop the scan after this many findings. Useful for large codebases where you want to focus on the most critical issues first. |

### Categories

| Category | Description |
|----------|-------------|
| `auth` | Authentication and authorization gaps |
| `pii` | PII exposure and data flow issues |
| `injection` | SQL injection, XSS, command injection |
| `dependencies` | Vulnerable dependencies (SCA) |
| `secrets` | Hardcoded secrets and credentials |
| `config` | Security misconfigurations |
| `crypto` | Weak or misused cryptography |
| `containers` | Docker and container security issues |

---

## Review Settings

```yaml
review:
  auto_approve_below: medium
  inline_comments: true
  summary_comment: true
```

Controls how AugmentaSec behaves when reviewing pull requests.

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `auto_approve_below` | string | `medium` | Auto-approve PRs with no findings at or above this severity. Set to `informational` to require approval for all findings, or `critical` to only block on critical issues. |
| `inline_comments` | boolean | `true` | Post inline comments on specific lines where findings are detected. |
| `summary_comment` | boolean | `true` | Post a summary comment on the PR with overall assessment and finding counts. |

---

## Output Settings

```yaml
output:
  format: text
  verbosity: normal
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `format` | string | `text` | Output format for scan results. Values: `text` (human-readable), `json` (machine-readable), `yaml`. |
| `verbosity` | string | `normal` | Controls how much detail is printed. Values: `quiet` (findings only), `normal` (findings + summary), `verbose` (findings + summary + debug info). |

---

## Schema Validation

Configuration is validated at load time using Zod schemas (see `src/config/schema.ts`). Invalid configuration produces clear error messages indicating what is wrong and what values are expected.

Common validation rules:

- Model identifiers must match the `provider/model-name` format
- Severity values must be one of: `critical`, `high`, `medium`, `low`, `informational`
- Autonomy actions must be one of: `create-pr-and-alert`, `create-issue`, `report`, `note`
- `max_auto_prs_per_day` must be a non-negative integer
- `max_findings` must be a non-negative integer
