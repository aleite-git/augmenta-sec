# ADR-002: Scanner-Agnostic Architecture

**Status**: Accepted
**Date**: 2026-03-21

## Context

The security scanning landscape includes many specialized tools, each with strengths in different areas:

- **Semgrep** -- fast SAST with custom rules, strong for pattern matching
- **CodeQL** -- deep semantic analysis, strong for data flow
- **Trivy** -- broad SCA and container scanning
- **npm audit** -- built-in Node.js dependency checking
- **Gitleaks** -- secret detection
- **Bandit** -- Python-specific security linting
- **Gosec** -- Go-specific security linting

No single scanner covers all categories (SAST, DAST, SCA, container, secrets) or all languages. Teams already have preferences and existing scanner configurations. Forcing a specific scanner would limit adoption.

## Decision

Abstract all scanners behind a `SecurityScanner` interface:

```typescript
interface SecurityScanner {
  name: string;
  category: ScannerCategory;
  isAvailable(): Promise<boolean>;
  scan(target: ScanTarget): Promise<ScanResult>;
}
```

Key design choices:

1. **Binary detection**: `isAvailable()` checks if the scanner binary exists on PATH. Scanners that are not installed are skipped gracefully.
2. **Normalized output**: All scanners produce `RawFinding[]` with a common severity scale. Scanner-specific severity vocabularies are mapped to the shared scale.
3. **Error isolation**: If a scanner fails, it returns a `ScanResult` with an `error` field and empty findings. It does not throw or crash the orchestrator.
4. **Shared utilities**: `isBinaryAvailable()` and `runCommand()` in `src/providers/scanner/utils.ts` handle binary detection, command execution, timeout, and non-zero exit codes (which many scanners use to indicate "findings found").

Scanner implementations live in `src/providers/scanner/` (currently: `semgrep.ts`, `trivy.ts`, `npm-audit.ts`).

## Consequences

**Easier:**
- Adding a new scanner is a single file implementing `SecurityScanner`. No changes to core logic, configuration schema, or other scanners.
- Users choose which scanners to run via `config.yaml`. Teams keep their existing scanner preferences.
- The orchestrator can run multiple scanners in parallel and merge their findings.
- Graceful degradation: if Semgrep is not installed, the scan still runs with Trivy and npm audit.

**More difficult:**
- Each scanner adapter must handle the scanner's specific JSON output format, severity mapping, and exit code conventions. This is one-time work per scanner.
- Scanner-specific configuration (e.g., Semgrep rule sets, Trivy ignore files) is not yet abstracted. Users must configure scanners separately for now.
- Deduplication across scanners is needed when multiple scanners report the same issue (e.g., both Trivy and npm audit flag the same vulnerable dependency).
