# AugmentaSec — Strategy & Roadmap

## Vision

An AI-powered security engineer that onboards to any codebase, learns the domain, and becomes the team's Chief Security Engineer — proactively identifying risks, reviewing PRs, and remediating vulnerabilities with full contextual understanding.

## Core Differentiator

Existing tools (Snyk, Semgrep, CodeQL, Trivy) are **pattern matchers**. They find known-bad patterns against generic rule sets. They cannot:

- Understand that `familyId` is YOUR trust boundary and `org_id` is someone else's
- Correlate a missing auth check with a data flow that reaches PII
- Prioritize by actual exploitability in THIS specific codebase
- Communicate findings in the context of what the team is building
- Accumulate knowledge and get better over time

The gap is **contextual reasoning**. AugmentaSec sits above scanners, interprets their output, fills their blind spots, and acts like a human security engineer would.

AugmentaSec does not replace scanners — it orchestrates them, correlates their findings, and adds the reasoning layer that makes results actionable.

---

## Design Principles

### 1. Agnostic by Design

- **LLM Agnostic** — Provider interface supports Claude, GPT, Gemini, Ollama, any model. Route tasks by cost tier (cheap for triage, premium for deep analysis).
- **Git Platform Agnostic** — Adapter interface for GitHub, GitLab, Bitbucket, Azure DevOps, Gitea. No vendor lock-in.
- **Language/Framework Agnostic** — Detection and analysis works across Node.js, Python, Go, Rust, Java, Ruby, PHP, and more. Framework-specific rules adapt automatically.
- **Scanner Agnostic** — Orchestrate any external scanner (Semgrep, CodeQL, Trivy, npm audit) through a normalized interface.

### 2. Knowledge-First Architecture

The `.augmenta-sec/` directory in the target repo IS the agent's brain:

```
.augmenta-sec/
├── profile.yaml          # Discovery output — what this codebase is
├── config.yaml           # Agent behavior and autonomy settings
├── threat-model.yaml     # Living threat model
├── pii-map.yaml          # PII field inventory
├── findings/             # Scan results over time
│   └── YYYY-MM-DD.yaml
└── endpoints.yaml        # Full API surface
```

This directory is version-controlled, human-readable, and portable. It works identically whether the agent runs as a CLI, in CI, or as a persistent server. Ground truth always lives here.

### 3. Team Member Metaphor

The agent behaves like a new security hire who onboards, learns, and grows:

- **Week 1**: Profiles the codebase. Identifies languages, frameworks, auth, DB, security controls. Asks for corrections.
- **Week 4**: Reviews PRs with domain awareness. "This endpoint accepts familyId from params — where's the IDOR check?"
- **Month 2**: Proactively identifies architectural risks. "Rate limiters are per-instance. With 4+ containers that's a gap."
- **Month 3**: Finds compliance gaps. "DSAR exports don't include anonymized records — GDPR issue."

It gets **better** the longer it runs because the security profile deepens.

### 4. Severity-Gated Autonomy

The agent's ability to act is controlled by severity and user configuration:

```yaml
# .augmenta-sec/config.yaml
autonomy:
  critical:   create-pr-and-alert    # Auto-fix, notify humans
  high:       create-issue           # File ticket, draft fix
  medium:     report                 # Add to security report
  low:        note                   # Log in knowledge base

  max_auto_prs_per_day: 3
  never_auto_merge: true
  respect_freeze: true               # Reads sprint/freeze status
```

### 5. Awareness of Team Activity

Before acting, the agent:

- Reads sprint/backlog files (or issue tracker) — doesn't duplicate work in progress
- Checks open branches — doesn't create conflicting fix PRs
- Respects merge freezes and release cycles
- Understands existing tickets and links findings to them

---

## Architecture

```
┌──────────────────────────────────────────────┐
│              @augmenta-sec/core              │
│                                              │
│  Discovery ─ Analysis ─ Remediation          │
│  LLM Gateway ─ Git Adapter ─ Scanner Adapter │
│  Knowledge Base (reads/writes .augmenta-sec/)│
│                                              │
│  Pure library. No runtime opinions.          │
└──────────────┬───────────────────────────────┘
               │
    ┌──────────┼──────────┬──────────────┐
    ▼          ▼          ▼              ▼
 ┌──────┐  ┌──────┐  ┌────────┐   ┌──────────┐
 │ CLI  │  │CI    │  │ Server │   │ SaaS     │
 │      │  │Plugin│  │        │   │ (future) │
 │ asec │  │GH/GL │  │ asec   │   │          │
 │ init │  │action│  │ serve  │   │ hosted   │
 │ scan │  │      │  │        │   │ multi-   │
 │review│  │      │  │webhooks│   │ tenant   │
 └──────┘  └──────┘  │cron   │   └──────────┘
                      │state  │
                      └────────┘
```

### Core Library (`@augmenta-sec/core`)

The product IS the core library. Everything else is a delivery mechanism.

**Discovery Engine** — Profiles a codebase automatically. 8 parallel detectors: language, framework, auth, database, API surface, security controls, CI/CD, documentation.

**Analysis Engine** — Three layers of analysis:
1. **Static (delegated)** — Runs external scanners (Semgrep, CodeQL, Trivy) and normalizes output
2. **Contextual (LLM-powered)** — Reasons about findings in the context of this specific codebase's trust boundaries, data flows, and architecture
3. **Drift detection** — Compares current code against the security profile, flags regressions

**Remediation Engine** — Generates fix PRs, creates issues, drafts security advisories. Severity-gated autonomy.

### Provider Interfaces

```
LLM Gateway          Git Platform          Scanner Adapter
├── Claude            ├── GitHub            ├── Semgrep
├── OpenAI (GPT)      ├── GitLab            ├── CodeQL
├── Google (Gemini)   ├── Bitbucket         ├── Trivy
├── Ollama (local)    ├── Azure DevOps      ├── npm/yarn audit
└── any provider      └── Gitea             └── custom
```

Tasks route to the appropriate LLM cost tier:
- **Cheap** (Haiku, GPT-4 mini) → classification, triage, yes/no
- **Standard** (Sonnet, GPT-4o) → code generation, fix drafting
- **Premium** (Opus, GPT-4) → deep analysis, threat modelling

---

## Three Operating Modes

### Reactive — PR Guardian (every PR)

Triggers on pull requests. Reads the diff + surrounding context. Asks domain-aware questions:

- "This new endpoint accepts `userId` from params — is there an IDOR check?"
- "This route has no rate limiter — all routes require one per your security policy"
- "New column stores `notes` — is this PII? Does it need log redaction?"
- "This export handler concatenates user input into HTML — XSS vector"

### Proactive — Scheduled Deep Scan (daily/weekly)

Full codebase sweep:

- **Data flow mapping**: Trace PII from API input → validation → service → repository → DB. Flag any path where PII hits a log statement or error response.
- **Auth boundary audit**: Every route → middleware chain → does it enforce the primary trust boundary?
- **Dependency correlation**: Beyond Trivy — correlate CVEs with actual usage. "Yes you import lodash but you never call the vulnerable function."
- **Drift detection**: Compare current code against the threat model.
- **Integrity verification**: Validate security invariants haven't been broken by recent changes.

### Adaptive — Security Knowledge Graph (persistent)

Maintains an evolving model of the application's security posture:

```
Security Model
├── Trust Boundaries
│   ├── primary boundary (e.g., familyId, orgId, tenantId)
│   ├── role-based access (user roles, permissions)
│   └── UX-only gates vs real security controls
├── PII Map
│   ├── field → DB location → log exposure → GDPR controls
│   └── data flow paths (input → storage → output)
├── Threat Register
│   ├── identified threats → linked to backlog tickets
│   └── status tracking (open, mitigated, accepted)
├── Security Debt
│   └── known gaps with severity, effort, and priority
└── Decisions & Rationale
    └── security decisions with context for future reference
```

---

## Runtime Modes

### Mode 1: CLI (Local)

```bash
npm install -g augmenta-sec
asec init .          # Profile the codebase
asec scan            # Full security analysis
asec review PR#123   # Review a specific PR
```

- Zero infrastructure, total privacy — code never leaves the machine
- Works offline (except LLM calls)
- Entry point for adoption

### Mode 2: CI Plugin

```yaml
# .github/workflows/security.yml
- uses: augmenta-sec/action@v1
  with:
    llm-provider: anthropic
    llm-key: ${{ secrets.ANTHROPIC_API_KEY }}
```

- Runs per-PR inside existing CI
- Automatic, integrated into existing workflow
- Reads `.augmenta-sec/profile.yaml` for context

### Mode 3: Server / Daemon

```bash
asec serve --port 3000
# or
docker run -v ./repos:/repos augmenta-sec/server
```

- Long-running process with webhook listener and scheduler
- Persistent operational state (SQLite or PostgreSQL)
- Full autonomy: scheduled scans, auto-triage, fix PRs
- This is where it becomes the "team member"

### Mode 4: SaaS (Future)

- Managed multi-tenant hosted version
- Connect repos via OAuth, zero ops
- Cross-repo organizational insights
- Where recurring revenue lives

---

## Adoption Path (Go-to-Market)

```
Stage 1: CLI (free, open source)
  → Instant value. No commitment. No account needed.
  → This is the hook.

Stage 2: CI Plugin (free tier + paid)
  → One YAML file in CI. Automated PR reviews.
  → Free for public repos, paid for private.
  → This is where teams start depending on it.

Stage 3: Server Mode (paid / enterprise)
  → Full autonomy: scheduled scans, auto-triage, fix PRs.
  → Self-hosted = enterprise teams who can't send code externally.
  → This is the "Chief Security Engineer."

Stage 4: SaaS (paid)
  → We host everything. Connect repos, done.
  → Convenience play + cross-org insights.
  → Where recurring revenue lives.
```

---

## Roadmap

### Phase 1: Foundation (Current)

**Status: In Progress**

- [x] Project scaffolding (TypeScript, ESM, CLI framework)
- [x] Discovery engine — `asec init`
  - [x] Language detector (25+ languages)
  - [x] Framework detector (Node.js, Python, Go ecosystems)
  - [x] Auth detector (15+ providers + code pattern matching)
  - [x] Database detector (drivers, ORMs, migrations, schemas)
  - [x] API detector (REST/GraphQL/tRPC, route extraction, OpenAPI)
  - [x] Security controls detector (12 control types)
  - [x] CI detector (10 platforms, security check identification)
  - [x] Documentation detector (standard docs, architecture, AI configs)
- [x] Profile writer (YAML output to `.augmenta-sec/`)
- [x] Provider type definitions (LLM, Git Platform, Scanner interfaces)
- [ ] Unit tests for all detectors
- [ ] `.augmenta-sec/config.yaml` schema and defaults

### Phase 2: Analysis Engine

- [ ] LLM Gateway implementation (Claude + OpenAI providers)
- [ ] Scanner adapter implementation (Semgrep, Trivy at minimum)
- [ ] `asec scan` command — full security analysis
  - [ ] Run external scanners, normalize output
  - [ ] LLM-powered contextual analysis of findings
  - [ ] Trust boundary detection (LLM-enhanced)
  - [ ] PII field mapping (LLM-enhanced)
  - [ ] Threat model generation
  - [ ] Findings output (`.augmenta-sec/findings/`)
- [ ] Drift detection (compare current code against profile)
- [ ] Severity scoring with contextual reasoning

### Phase 3: PR Review

- [ ] Git platform adapter implementation (GitHub first)
- [ ] `asec review` command — security review of a PR
  - [ ] Diff-aware analysis (only review changed code + context)
  - [ ] Domain-aware findings (use profile for context)
  - [ ] Inline comments on relevant lines
- [ ] GitHub Action wrapper (`augmenta-sec/action`)
- [ ] GitLab CI template

### Phase 4: Remediation

- [ ] Auto-fix generation for common vulnerability patterns
- [ ] `asec fix <finding-id>` — generate a fix branch
- [ ] Issue creation (GitHub Issues, GitLab Issues)
- [ ] Fix PR creation with test coverage
- [ ] Severity-gated autonomy (config-driven)

### Phase 5: Server Mode

- [ ] `asec serve` — long-running daemon
- [ ] Webhook listener (PR opened, push to main)
- [ ] Scheduled scan engine (cron-like)
- [ ] Persistent operational state (SQLite)
- [ ] Team activity awareness (read sprint files, check branches)
- [ ] Docker image for self-hosted deployment

### Phase 6: Scale & Polish

- [ ] Additional LLM providers (Gemini, Ollama)
- [ ] Additional git platforms (GitLab, Bitbucket)
- [ ] Additional scanner adapters (CodeQL, npm audit, Bandit, Gosec)
- [ ] Multi-repo management (organization-level insights)
- [ ] Dashboard / reporting UI
- [ ] SaaS multi-tenancy (if pursuing hosted model)

---

## Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Language | TypeScript (ESM) | Runs everywhere Node.js runs. Strong typing. Largest ecosystem for git/CI tooling. |
| CLI framework | Commander | Lightweight, well-maintained, zero lock-in. |
| Profile format | YAML | Human-readable, diffable, version-controllable. Familiar to DevOps teams. |
| LLM routing | Cost-tier based | Cheap models for triage, expensive for deep analysis. Keeps costs manageable. |
| Knowledge base | File-based (`.augmenta-sec/`) | No database dependency for CLI/CI modes. Portable. Versionable. |
| Server state | SQLite (server mode only) | Zero-config, embedded, sufficient for single-instance deployment. |
| Scanner integration | Subprocess + output parsing | No need to embed scanner logic. Leverage existing tools. |
| Detectors | Parallel execution | All detectors are independent. Run concurrently for speed. |

---

## Competitive Landscape

| Tool | What it does | What AugmentaSec adds |
|------|-------------|----------------------|
| Snyk | SCA — dependency vulnerability scanning | Contextual reasoning: "this CVE is in your hot path" vs "you never call the vulnerable function" |
| Semgrep | SAST — pattern-based code scanning | Domain awareness: knows your trust boundaries, correlates across full stack |
| CodeQL | SAST — deep semantic code analysis | Real-time context: reads your threat model, prioritizes by your architecture |
| Trivy | Container + dependency scanning | Actionable output: not just "CVE found" but "here's the fix PR" |
| SonarQube | Code quality + some security | Security-first: purpose-built for security, not quality metrics with security bolted on |
| GitHub GHAS | Platform-native security suite | Platform-agnostic: works on GitLab, Bitbucket, self-hosted. Not locked to GitHub. |

AugmentaSec's position: **orchestration + contextual reasoning layer** that sits above all of these, makes their output actionable, and fills the gaps they can't cover.
