# Sprint 1: Full Product Backlog

**Status:** IN PROGRESS
**Sprint Start Date:** 2026-03-21
**Total Planned:** 111 tickets

## Sprint Backlog

### 1. Foundation & Core

1. [x] **ASEC-001** - Project scaffolding (TypeScript, ESM, CLI framework) — **P1** (2h)
   - **Status:** DONE
   - **Completed:** 2026-03-21
2. [x] **ASEC-002** - Discovery engine with 8 parallel detectors — **P1** (6h)
   - **Status:** DONE
   - **Completed:** 2026-03-21
3. [x] **ASEC-003** - Strategy & roadmap document — **P2** (2h)
   - **Status:** DONE
   - **Completed:** 2026-03-21
4. [ ] **ASEC-004** - LLM Gateway implementation (Mistral + Gemini providers) — **P1** (4h)
   - **Status:** NOT STARTED
5. [x] **ASEC-005** - `asec scan` command — contextual security analysis — **P1** (4h)
   - **Status:** DONE
   - **Completed:** 2026-03-22
6. [ ] **ASEC-006** - Unit tests for all detectors — **P2** (2h)
   - **Status:** NOT STARTED
7. [ ] **ASEC-007** - `.augmenta-sec/config.yaml` schema and defaults (autonomy levels, LLM role routing, scanner selection) — **P1** (3h)
   - **Status:** NOT STARTED
8. [ ] **ASEC-008** - Profile merge: re-run `asec init` without clobbering manual edits (trust boundaries, PII fields) — **P2** (3h)
   - **Status:** NOT STARTED
9. [ ] **ASEC-009** - Error handling: graceful degradation when detectors fail, user-friendly messages — **P2** (2h)
   - **Status:** NOT STARTED
10. [x] **ASEC-160** - Sprint management system (ported from co-parent-test) — **P1** (1h)
    - **Status:** DONE
    - **Completed:** 2026-03-21
11. [x] **ASEC-161** - LLM provider smoke test infrastructure (scripts/test-llm.mjs) — **P2** (1h)
    - **Status:** DONE
    - **Completed:** 2026-03-21
12. [x] **ASEC-162** - Secrets & environment configuration (.env, .env.example) — **P1** (1h)
    - **Status:** DONE
    - **Completed:** 2026-03-21
13. [x] **ASEC-163** - LLM role-based config design (config.example.yaml, triage/analysis/reasoning model) — **P1** (1h)
    - **Status:** DONE
    - **Completed:** 2026-03-21

### 2. Discovery Enhancements

14. [ ] **ASEC-060** - Monorepo detection: workspace mapping, per-package profiles, aggregate view — **P2** (4h)
    - **Status:** NOT STARTED
15. [ ] **ASEC-061** - Git metadata detection: remote URL, default branch, platform inference (GitHub/GitLab/etc.) — **P2** (2h)
    - **Status:** NOT STARTED
16. [ ] **ASEC-062** - Docker/container detection: Dockerfile, docker-compose, base image analysis, non-root checks — **P2** (3h)
    - **Status:** NOT STARTED
17. [ ] **ASEC-063** - Infrastructure-as-code detection: Terraform, Pulumi, CDK, CloudFormation — **P3** (2h)
    - **Status:** NOT STARTED
18. [ ] **ASEC-064** - Secret/env file detection: .env files, credentials patterns, hardcoded secrets — **P1** (3h)
    - **Status:** NOT STARTED
19. [ ] **ASEC-065** - Dependency license scanning: identify copyleft, restrictive, or unknown licenses — **P3** (2h)
    - **Status:** NOT STARTED
20. [ ] **ASEC-066** - Deep Python ecosystem: pyproject.toml, Poetry, virtual env detection — **P3** (2h)
    - **Status:** NOT STARTED
21. [ ] **ASEC-067** - Deep Go ecosystem: go.sum analysis, module graph — **P3** (2h)
    - **Status:** NOT STARTED
22. [ ] **ASEC-068** - Deep Rust ecosystem: Cargo.lock, unsafe block detection — **P3** (2h)
    - **Status:** NOT STARTED
23. [ ] **ASEC-069** - Deep JVM ecosystem: Maven/Gradle dependency resolution, Spring Security detection — **P3** (3h)
    - **Status:** NOT STARTED

### 3. Analysis & Scanning

24. [ ] **ASEC-010** - Scanner adapter: Semgrep integration (install check, run, parse SARIF output) — **P2** (3h)
    - **Status:** NOT STARTED
25. [ ] **ASEC-011** - Scanner adapter: Trivy integration (filesystem + container scanning) — **P2** (3h)
    - **Status:** NOT STARTED
26. [x] **ASEC-012** - Trust boundary detection (LLM-enhanced): identify primary tenant isolation, auth gates — **P1** (4h)
    - **Status:** DONE
    - **Completed:** 2026-03-22
27. [x] **ASEC-013** - PII field mapping (LLM-enhanced): trace PII from input to storage to logs — **P1** (4h)
    - **Status:** DONE
    - **Completed:** 2026-03-22
28. [x] **ASEC-014** - Threat model generation: auto-generate threat model from profile + code analysis — **P2** (6h)
    - **Status:** DONE
    - **Completed:** 2026-03-22
29. [x] **ASEC-015** - Drift detection: compare current code against security profile, flag regressions — **P2** (4h)
    - **Status:** DONE
    - **Completed:** 2026-03-22
30. [ ] **ASEC-016** - Findings schema: normalized output format for all findings (scanner + LLM) — **P1** (2h)
    - **Status:** NOT STARTED
31. [ ] **ASEC-017** - Severity scoring: contextual severity based on trust boundaries, data sensitivity, exposure — **P1** (3h)
    - **Status:** NOT STARTED
32. [ ] **ASEC-018** - Findings deduplication: correlate findings across scanners, suppress duplicates — **P2** (3h)
    - **Status:** NOT STARTED
33. [ ] **ASEC-019** - Compliance mapping: map findings to OWASP Top 10, CWE, SANS 25 — **P3** (3h)
    - **Status:** NOT STARTED

### 4. LLM Providers

34. [ ] **ASEC-050** - LLM provider: Mistral AI (Mistral Large, Codestral) — **P1** (3h)
    - **Status:** NOT STARTED
35. [ ] **ASEC-051** - LLM provider: Google Gemini (Gemini Pro, Flash) — **P1** (3h)
    - **Status:** NOT STARTED
36. [ ] **ASEC-052** - LLM provider: Anthropic (Claude) — **P3** (3h)
    - **Status:** NOT STARTED
37. [ ] **ASEC-053** - LLM provider: OpenAI (GPT-4o) — **P3** (3h)
    - **Status:** NOT STARTED
38. [ ] **ASEC-054** - LLM provider: Ollama (local models, privacy-first) — **P2** (3h)
    - **Status:** NOT STARTED
39. [ ] **ASEC-055** - LLM prompt library: reusable security analysis prompts with versioning — **P2** (3h)
    - **Status:** NOT STARTED
40. [ ] **ASEC-056** - LLM response validation: structured output parsing, retry on malformed responses — **P2** (2h)
    - **Status:** NOT STARTED
41. [ ] **ASEC-057** - LLM cost tracking: token usage, cost per scan, budget alerts — **P3** (2h)
    - **Status:** NOT STARTED

### 5. PR Review

42. [ ] **ASEC-040** - Git platform adapter: GitHub (REST + GraphQL API, webhooks) — **P1** (4h)
    - **Status:** NOT STARTED
43. [ ] **ASEC-041** - Git platform adapter: GitLab (REST API, webhooks) — **P3** (3h)
    - **Status:** NOT STARTED
44. [ ] **ASEC-042** - Git platform adapter: Bitbucket (REST API) — **P3** (3h)
    - **Status:** NOT STARTED
45. [x] **ASEC-043** - `asec review` command: security review of a PR by number or URL — **P1** (6h)
    - **Status:** DONE
    - **Completed:** 2026-03-22
46. [x] **ASEC-044** - Diff-aware analysis: only review changed code + relevant surrounding context — **P1** (4h)
    - **Status:** DONE
    - **Completed:** 2026-03-22
47. [x] **ASEC-045** - Inline comment formatting: post findings as line-level review comments — **P2** (3h)
    - **Status:** DONE
    - **Completed:** 2026-03-22
48. [x] **ASEC-046** - Review configuration: severity thresholds, categories to check, auto-approve rules — **P2** (2h)
    - **Status:** DONE
    - **Completed:** 2026-03-22
49. [ ] **ASEC-047** - GitHub Action: `augmenta-sec/action@v1` reusable workflow — **P2** (3h)
    - **Status:** NOT STARTED
50. [ ] **ASEC-048** - GitLab CI template: `.gitlab-ci.yml` include template — **P3** (2h)
    - **Status:** NOT STARTED
51. [ ] **ASEC-049** - Batch review: review all open PRs in a repo — **P3** (2h)
    - **Status:** NOT STARTED

### 6. Remediation

52. [x] **ASEC-070** - Auto-fix generation: LLM-powered fix suggestions for common vulnerability patterns — **P2** (6h)
    - **Status:** DONE
    - **Completed:** 2026-03-22
53. [x] **ASEC-071** - `asec fix <finding-id>` command: generate fix branch from a specific finding — **P2** (4h)
    - **Status:** DONE
    - **Completed:** 2026-03-22
54. [x] **ASEC-072** - Issue creation: create GitHub/GitLab issues from findings with full context — **P2** (3h)
    - **Status:** DONE
    - **Completed:** 2026-03-22
55. [x] **ASEC-073** - Fix PR creation: create PR with fix + test coverage for the fix — **P2** (4h)
    - **Status:** DONE
    - **Completed:** 2026-03-22
56. [x] **ASEC-074** - Severity-gated autonomy: configurable auto-action thresholds per severity level — **P1** (3h)
    - **Status:** DONE
    - **Completed:** 2026-03-22
57. [x] **ASEC-075** - Fix templates: reusable fix patterns (add rate limiter, add auth middleware, sanitize input) — **P3** (4h)
    - **Status:** DONE
    - **Completed:** 2026-03-22
58. [x] **ASEC-076** - Backlog integration: read team's tracking system before creating duplicate tickets — **P2** (3h)
    - **Status:** DONE
    - **Completed:** 2026-03-22

### 7. Server Mode

59. [x] **ASEC-080** - `asec serve` daemon: long-running HTTP server with config-driven behavior — **P2** (6h)
    - **Status:** DONE
    - **Completed:** 2026-03-22
60. [x] **ASEC-081** - Webhook handlers: receive and process GitHub/GitLab webhook events — **P2** (4h)
    - **Status:** DONE
    - **Completed:** 2026-03-22
61. [x] **ASEC-082** - Scheduled scan engine: cron-like scheduling for periodic deep scans — **P2** (4h)
    - **Status:** DONE
    - **Completed:** 2026-03-22
62. [x] **ASEC-083** - Persistent state: SQLite for operational state (scan queue, webhook log, schedules) — **P3** (3h)
    - **Status:** DONE
    - **Completed:** 2026-03-22
63. [x] **ASEC-084** - Team activity awareness: read sprint files, check open branches, respect freezes — **P3** (4h)
    - **Status:** DONE
    - **Completed:** 2026-03-22
64. [x] **ASEC-085** - Health/status endpoint: `/health`, `/status` with last scan time, findings count — **P3** (1h)
    - **Status:** DONE
    - **Completed:** 2026-03-22
65. [x] **ASEC-086** - API for external integrations: REST API to query findings, trigger scans — **P3** (4h)
    - **Status:** DONE
    - **Completed:** 2026-03-22
66. [x] **ASEC-087** - Multi-repo management: manage security profiles across multiple repos — **P3** (6h)
    - **Status:** DONE
    - **Completed:** 2026-03-22
67. [x] **ASEC-088** - Docker image: `augmenta-sec/server` for self-hosted deployment — **P2** (3h)
    - **Status:** DONE
    - **Completed:** 2026-03-22

### 8. Additional Scanners

68. [ ] **ASEC-100** - Scanner adapter: CodeQL (SARIF output parsing) — **P3** (3h)
    - **Status:** NOT STARTED
69. [ ] **ASEC-101** - Scanner adapter: npm/yarn audit — **P2** (2h)
    - **Status:** NOT STARTED
70. [ ] **ASEC-102** - Scanner adapter: pip-audit (Python) — **P3** (2h)
    - **Status:** NOT STARTED
71. [ ] **ASEC-103** - Scanner adapter: Bandit (Python SAST) — **P3** (2h)
    - **Status:** NOT STARTED
72. [ ] **ASEC-104** - Scanner adapter: Gosec (Go SAST) — **P3** (2h)
    - **Status:** NOT STARTED
73. [ ] **ASEC-105** - Scanner adapter: cargo-audit (Rust) — **P3** (2h)
    - **Status:** NOT STARTED
74. [ ] **ASEC-106** - Scanner adapter: gitleaks (secret detection) — **P2** (2h)
    - **Status:** NOT STARTED
75. [ ] **ASEC-107** - Scanner adapter: OWASP ZAP (DAST, server mode only) — **P3** (4h)
    - **Status:** NOT STARTED
76. [ ] **ASEC-108** - Custom scanner plugin API: allow users to add their own scanners — **P3** (4h)
    - **Status:** NOT STARTED

### 9. Testing & Quality

77. [ ] **ASEC-110** - Unit tests: language, framework, auth detectors — **P1** (3h)
    - **Status:** NOT STARTED
78. [ ] **ASEC-111** - Unit tests: database, API, security-controls detectors — **P1** (3h)
    - **Status:** NOT STARTED
79. [ ] **ASEC-112** - Unit tests: CI, docs detectors — **P1** (2h)
    - **Status:** NOT STARTED
80. [ ] **ASEC-113** - Unit tests: discovery engine orchestration — **P1** (2h)
    - **Status:** NOT STARTED
81. [ ] **ASEC-114** - Unit tests: profile writer (YAML output) — **P2** (1h)
    - **Status:** NOT STARTED
82. [ ] **ASEC-115** - Integration tests: run full init against fixture repos — **P1** (4h)
    - **Status:** NOT STARTED
83. [ ] **ASEC-116** - Test fixture: Node.js/Express/React repo — **P2** (2h)
    - **Status:** NOT STARTED
84. [ ] **ASEC-117** - Test fixture: Python/Django repo — **P2** (2h)
    - **Status:** NOT STARTED
85. [ ] **ASEC-118** - Test fixture: Go/Gin repo — **P3** (2h)
    - **Status:** NOT STARTED
86. [ ] **ASEC-119** - Test fixture: multi-language monorepo — **P3** (2h)
    - **Status:** NOT STARTED
87. [ ] **ASEC-120** - E2E tests: full init → scan → report cycle — **P2** (4h)
    - **Status:** NOT STARTED
88. [ ] **ASEC-121** - Coverage tracking: enforce 80% minimum on new code — **P2** (1h)
    - **Status:** NOT STARTED

### 10. Documentation

89. [ ] **ASEC-130** - README.md: project overview, quick start, badges — **P1** (2h)
    - **Status:** NOT STARTED
90. [ ] **ASEC-131** - Getting started guide: install, init, scan, review workflow — **P1** (2h)
    - **Status:** NOT STARTED
91. [ ] **ASEC-132** - Configuration reference: all config.yaml options documented — **P2** (2h)
    - **Status:** NOT STARTED
92. [ ] **ASEC-133** - Detector documentation: what each detector finds, how to extend — **P2** (2h)
    - **Status:** NOT STARTED
93. [ ] **ASEC-134** - Provider implementation guide: how to add new LLM/git/scanner providers — **P2** (3h)
    - **Status:** NOT STARTED
94. [ ] **ASEC-135** - Contributing guide: development setup, PR process, architecture overview — **P2** (2h)
    - **Status:** NOT STARTED
95. [ ] **ASEC-136** - Security policy: SECURITY.md for this project — **P2** (1h)
    - **Status:** NOT STARTED
96. [ ] **ASEC-137** - Architecture decision records (ADRs) for key design choices — **P3** (2h)
    - **Status:** NOT STARTED

### 11. DevOps & Release

97. [ ] **ASEC-140** - CI pipeline: GitHub Actions (lint, typecheck, test, build) — **P1** (3h)
    - **Status:** NOT STARTED
98. [ ] **ASEC-141** - npm publish workflow: automated publishing on tagged releases — **P1** (2h)
    - **Status:** NOT STARTED
99. [ ] **ASEC-142** - Versioning strategy: SemVer, changelog generation — **P2** (2h)
    - **Status:** NOT STARTED
100. [ ] **ASEC-143** - Release automation: tag → build → publish → GitHub release — **P2** (3h)
     - **Status:** NOT STARTED
101. [ ] **ASEC-144** - Docker image publishing: multi-arch images to Docker Hub / GHCR — **P3** (3h)
     - **Status:** NOT STARTED
102. [ ] **ASEC-145** - Dogfooding: run AugmentaSec on itself in CI — **P2** (2h)
     - **Status:** NOT STARTED

### 12. UX & Polish

103. [ ] **ASEC-150** - Output modes: `--format json|yaml|text` for machine-readable output — **P2** (3h)
     - **Status:** NOT STARTED
104. [ ] **ASEC-151** - Verbose/quiet modes: `--verbose` for debug info, `--quiet` for CI — **P2** (1h)
     - **Status:** NOT STARTED
105. [ ] **ASEC-152** - Progress indicators: spinners/progress bars for long-running scans — **P3** (2h)
     - **Status:** NOT STARTED
106. [ ] **ASEC-153** - Global config: `~/.augmenta-sec/config.yaml` for user-level defaults (LLM keys, preferences) — **P2** (2h)
     - **Status:** NOT STARTED
107. [x] **ASEC-154** - Interactive init mode: confirm/correct each detector's findings — **P3** (3h)
     - **Status:** DONE
     - **Completed:** 2026-03-22
108. [x] **ASEC-155** - Offline mode: skip LLM analysis, scanner-only results — **P2** (2h)
     - **Status:** DONE
     - **Completed:** 2026-03-22
109. [x] **ASEC-156** - Report generation: HTML/PDF security report from scan findings — **P3** (4h)
     - **Status:** DONE
     - **Completed:** 2026-03-22
110. [x] **ASEC-157** - Historical trends: compare findings across scans, show improvement/regression — **P3** (3h)
     - **Status:** DONE
     - **Completed:** 2026-03-22
111. [x] **ASEC-158** - Dashboard UI: web-based view of security posture (server mode) — **P3** (8h)
     - **Status:** DONE
     - **Completed:** 2026-03-22

## Sprint Metrics

| **Metric** | **Value** |
|---|---|
| **Total Tickets** | 111 |
| **Completed** | 43 |
| **In Progress** | 0 |
| **Remaining** | 68 |
| **Completion Rate** | 39% |
