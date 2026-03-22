# ADR-008: Scanner Adapter Pattern

**Status**: Accepted
**Date**: 2026-03-22

## Context

AugmentaSec orchestrates external security scanners (Semgrep, Trivy, npm audit, Gitleaks, CodeQL, pip-audit, cargo-audit, Bandit, Gosec). Each has its own binary, CLI interface, output format, severity vocabulary, and exit code conventions. We need an architecture that handles any combination of scanners, missing binaries, diverse output formats, and isolated failures.

## Decision

Abstract all scanners behind a `SecurityScanner` interface:

```typescript
interface SecurityScanner {
  name: string;
  category: ScannerCategory;  // 'sast' | 'dast' | 'sca' | 'container' | 'secrets'
  isAvailable(): Promise<boolean>;
  scan(target: ScanTarget): Promise<ScanResult>;
}
```

**Key design choices:**

1. **Binary detection via `isAvailable()`** -- checks if the scanner binary exists on PATH. Missing scanners are skipped with a warning, not an error.

2. **Error isolation via `ScanResult.error`** -- failed scans return a result with an `error` string and empty findings. The orchestrator logs the error and continues with other scanners.

3. **Normalized severity** -- each adapter maps its native severity vocabulary (Semgrep ERROR/WARNING/INFO, Trivy CRITICAL/HIGH/MEDIUM/LOW, npm audit critical/high/moderate/low) to the shared five-level scale.

4. **Non-zero exit code handling** -- many scanners exit with code 1 when findings are present. The shared `runCommand()` utility captures output regardless of exit code. Only ENOENT and ETIMEDOUT cause errors.

5. **Factory + registry pattern** -- scanner factories are registered in `SCANNER_FACTORIES` in the scan engine. The user's `scanners` config array maps to factory names.

**Shared utilities** in `src/providers/scanner/utils.ts`: `isBinaryAvailable()` and `runCommand()` (configurable timeout, 50 MB max output buffer).

## Consequences

**Easier:**
- Adding a new scanner is a single file implementing `SecurityScanner` plus a factory registration. No changes to orchestration, deduplication, or reporting.
- Users choose scanners via a simple config array.
- Multiple scanners run in parallel via `Promise.allSettled()`.
- The deduplication layer handles cases where multiple scanners report the same issue.

**More difficult:**
- Each adapter must understand its scanner's JSON output format. This is one-time work per scanner.
- Scanner-specific configuration (custom rule sets, ignore files) is not yet abstracted.
- The `ScanTarget` interface may need extension for DAST scanners that need a running URL.
