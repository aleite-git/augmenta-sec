# ADR-006: Detector Architecture

**Status**: Accepted
**Date**: 2026-03-22

## Context

AugmentaSec's discovery engine needs to analyze codebases to build a security profile covering diverse aspects: languages, frameworks, auth mechanisms, databases, API surfaces, security controls, CI pipelines, documentation, container configurations, infrastructure as code, secrets, licenses, and ecosystem-specific details for Python, Go, Rust, and JVM.

These detection tasks are fundamentally independent -- knowing the language does not block detecting the CI platform. However, they all need access to the file system of the target repository. Design questions include how detectors share file system access, how failures are isolated, and how new detectors are added.

## Decision

Use a parallel detector architecture with a shared context and independent execution.

**Detector Interface:**
```typescript
interface Detector<T> {
  name: string;
  detect(ctx: DetectorContext): Promise<T>;
}
```

Every detector receives a `DetectorContext` providing: `findFiles()`, `readFile()`, `readJson()`, `readYaml()`, `fileExists()`, and `grep()`. The context is created once and shared.

**Parallel Execution:** The engine runs all 18 detectors using `Promise.allSettled()`, ensuring all detectors run concurrently and failures in one do not prevent others from completing.

**Graceful Degradation:** Failed detectors produce a warning and a fallback default. The profile is always complete -- never has missing sections. The `withGracefulDegradation()` utility wraps each detector call.

**Typed Output:** Each detector produces a strongly-typed result corresponding to a section of the `SecurityProfile` interface.

## Consequences

**Easier:**
- Adding a new detector is a four-step process: define the type, implement the detector, export from the barrel, register in the engine. No changes to existing detectors.
- Detectors are trivially testable in isolation with `createMockContext()`.
- Parallel execution means adding more detectors does not significantly increase total runtime.

**More difficult:**
- Detectors cannot depend on each other's output. Redundant detection may occur.
- The `SecurityProfile` interface grows with each new detector. At 18 detectors it is already large.
- All detectors share the same `DetectorContext` API, so changes affect all even if only one needs them.
