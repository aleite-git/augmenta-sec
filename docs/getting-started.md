# Getting Started

This guide walks you through installing AugmentaSec, profiling your first codebase, running a security scan, reviewing a pull request, and generating a report.

## Prerequisites

- **Node.js 18+** -- required
- **Semgrep** -- optional, for SAST scanning (`pip install semgrep` or `brew install semgrep`)
- **Trivy** -- optional, for dependency and container scanning (`brew install trivy`)
- **LLM API key** -- optional, for LLM-powered analysis (Gemini, Mistral, OpenAI, or Anthropic)

## Installation

### From npm (recommended)

```bash
npm install -g augmenta-sec
asec --version
```

This makes two commands available: `augmenta-sec` and the shorter alias `asec`.

### From Source

```bash
git clone https://github.com/augmenta-sec/augmenta-sec.git
cd augmenta-sec
npm install
npm run build
npm link    # optional: link the built CLI globally
```

Run in development mode without building: `npm run dev -- init /path/to/repo`

## First Run: Profiling a Codebase

```bash
asec init /path/to/your/repo
# or from inside the repo:
asec init
```

The discovery engine runs 18 detectors in parallel covering: languages, frameworks, authentication, databases, API surface, security controls, CI/CD, documentation, monorepo structure, Git hosting, Docker configuration, infrastructure as code, secrets, licenses, and ecosystem-specific details (Python, Go, Rust, JVM).

All results are written to `.augmenta-sec/profile.yaml` in the target repository.

## Understanding the Profile

After `asec init`, open `.augmenta-sec/profile.yaml` to review the generated profile. It contains sections for each detector: languages, frameworks, auth providers/patterns, databases, API endpoints, security controls (present and missing), CI workflows, documentation coverage, Docker analysis, and more.

Review the profile for accuracy. The detectors use heuristics and may miss or misidentify components. Edit the YAML directly to correct inaccuracies -- this is your security baseline.

## Configuration

```bash
mkdir -p .augmenta-sec
cp config.example.yaml .augmenta-sec/config.yaml
```

Minimum configuration needed is the LLM section:

```yaml
llm:
  triage: gemini/gemini-2.5-flash-lite
  analysis: gemini/gemini-2.5-flash
  reasoning: gemini/gemini-2.5-pro
```

Set the API key: `export GEMINI_API_KEY=your-key-here`

### Global Configuration

Set defaults for all projects in `~/.augmenta-sec/config.yaml`. Priority: **project > global > built-in defaults**.

See [configuration.md](configuration.md) for a full reference.

## Running a Scan

```bash
asec scan
```

The scan engine will:

1. Load your security profile from `.augmenta-sec/profile.yaml`
2. Run configured external scanners (Semgrep, Trivy, etc.) in parallel
3. Normalize raw findings into a canonical format
4. Deduplicate findings across scanners (exact and fuzzy matching)
5. Apply contextual severity scoring using the security profile
6. Filter by minimum severity threshold
7. Produce a unified findings report

Scanners that are not installed are skipped gracefully.

### Contextual Severity

Unlike raw scanner output, AugmentaSec adjusts severity based on project context:

- Findings in **auth code** are elevated
- Findings in **API routes** are elevated (public-facing)
- Findings in **test code** are demoted
- Findings in **third-party code** (node_modules, vendor) are demoted
- Projects that **handle PII** get elevated severity for relevant categories

## Reviewing a Pull Request

```bash
asec review 42
```

Accepts PR number, `#42`, or a full URL (`https://github.com/owner/repo/pull/42`).

AugmentaSec will: fetch the PR diff, analyze via LLM, filter by config, determine auto-approval, and optionally post inline comments and a summary.

## Trend Analysis

```bash
asec trends
```

Displays historical scan data: finding counts by severity, category breakdowns, and regression detection.

## Next Steps

- Commit `.augmenta-sec/` to version control
- Customize `autonomy` settings to control automated actions
- Add `asec scan` to your CI pipeline
- Read [Configuration Reference](configuration.md), [Detectors](detectors.md), [Providers](providers.md)
