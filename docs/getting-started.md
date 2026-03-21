# Getting Started

This guide walks you through installing AugmentaSec, profiling your first codebase, and running a security scan.

## Prerequisites

- **Node.js 18+** -- required
- **Semgrep** -- optional, for SAST scanning (`pip install semgrep` or `brew install semgrep`)
- **Trivy** -- optional, for dependency and container scanning (`brew install trivy` or see [trivy docs](https://aquasecurity.github.io/trivy/))
- **LLM API key** -- optional, for LLM-powered analysis (Gemini, Mistral, OpenAI, or Anthropic)

## Installation

Install AugmentaSec globally via npm:

```bash
npm install -g augmenta-sec
```

This makes two commands available: `augmenta-sec` and the shorter alias `asec`.

Verify the installation:

```bash
asec --version
```

## First Run: Profiling a Codebase

Run the discovery engine against any repository:

```bash
asec init /path/to/your/repo
```

Or, from inside the repo:

```bash
cd /path/to/your/repo
asec init
```

The discovery engine runs 8 detectors in parallel and produces a summary of:

- Languages and frameworks detected
- Authentication providers and patterns
- Database types, drivers, and ORMs
- API surface (REST, GraphQL, tRPC endpoints)
- Security controls present and missing
- CI/CD platform and security checks
- Documentation coverage

All results are written to `.augmenta-sec/profile.yaml` in the target repository.

## Understanding the Profile

After `asec init`, open `.augmenta-sec/profile.yaml` to review the generated profile. Here is what each section contains:

```yaml
version: "1.0"
generatedAt: "2026-03-21T10:30:00.000Z"
target: /path/to/your/repo

project:
  name: your-repo

languages:
  primary: typescript
  all:
    - name: typescript
      percentage: 72
      fileCount: 145
    - name: javascript
      percentage: 28
      fileCount: 56

frameworks:
  backend:
    - name: express
      category: backend
      version: "4.21.0"
      confidence: 1
  # ... frontend, fullstack, orm, testing sections

auth:
  providers:
    - name: jwt
      type: first-party
      confidence: 1
      source: "dependency: jsonwebtoken (package.json)"
  patterns:
    - type: middleware
      files: ["src/middleware/auth.ts"]

database:
  databases:
    - type: postgresql
      driver: pg
      orm: drizzle
      migrationsDir: drizzle
      schemaDir: src/db/schema
      confidence: 1

api:
  styles: [rest]
  specFile: api/openapi.yaml
  routeCount: 47

securityControls:
  present:
    - name: HTTP Security Headers
      type: http-headers
      present: true
      confidence: 1
      source: "dependency: helmet"
  missing:
    - name: Rate Limiting
      type: rate-limiting
      present: false
      confidence: 0.8
      source: not detected in dependencies or code

ci:
  platform: github-actions
  workflows: [...]
  securityChecks: [...]

docs:
  hasReadme: true
  hasSecurityPolicy: true
  # ...
```

Review the profile for accuracy. The detectors use heuristics and may miss or misidentify components. Edit the YAML directly to correct any inaccuracies -- this is your security baseline.

If the API surface has endpoints, they are written separately to `.augmenta-sec/endpoints.yaml` to keep the profile readable.

## Configuration

Copy the example configuration into your project:

```bash
mkdir -p .augmenta-sec
cp /path/to/augmenta-sec/config.example.yaml .augmenta-sec/config.yaml
```

Or, if you installed globally, you can find the example at the package location. The minimum configuration you need is the LLM section:

```yaml
llm:
  triage: gemini/gemini-2.5-flash-lite
  analysis: gemini/gemini-2.5-flash
  reasoning: gemini/gemini-2.5-pro
```

Set the corresponding API key as an environment variable:

```bash
export GEMINI_API_KEY=your-api-key-here
```

See [configuration.md](configuration.md) for a full reference of every option.

## Global Configuration

You can also set defaults that apply to all projects in `~/.augmenta-sec/config.yaml`. Project-level configuration (in `.augmenta-sec/config.yaml`) overrides global settings.

This is useful for setting your preferred LLM models and API keys once, rather than per-project.

## Running a Scan

Once you have a profile and configuration in place:

```bash
asec scan
```

The scan engine will:

1. Load your security profile from `.augmenta-sec/profile.yaml`
2. Run configured external scanners (Semgrep, Trivy, etc.)
3. Apply LLM-powered contextual analysis to raw findings
4. Produce a unified findings report with contextual severity

Scanners that are not installed are skipped gracefully with a notice.

## Reviewing a Pull Request

To review a PR for security issues:

```bash
asec review 42
```

Where `42` is the PR number. AugmentaSec will:

1. Fetch the PR diff from your Git platform
2. Analyze changed files against the security profile
3. Post inline comments on security-relevant lines
4. Post a summary comment with the overall assessment

## Next Steps

- Review and commit `.augmenta-sec/` to version control so the security profile is shared with your team
- Customize `autonomy` settings to control what actions AugmentaSec can take automatically
- Add `asec scan` to your CI pipeline for continuous security analysis
- Read the [Detectors documentation](detectors.md) to understand what each detector looks for
- Read the [Provider Implementation Guide](providers.md) if you want to add support for a new LLM, Git platform, or scanner
