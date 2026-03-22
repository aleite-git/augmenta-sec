# ADR-007: LLM Gateway Design

**Status**: Accepted
**Date**: 2026-03-22

## Context

AugmentaSec needs to call LLMs for different types of security work, ranging from quick binary decisions to deep architectural reasoning. The tool must support multiple LLM providers (Gemini, Mistral, OpenAI, Anthropic, Ollama) and allow users to mix them freely.

Alternatives considered: (1) single model configuration -- simple but forces users to choose between speed and quality; (2) cost tiers (cheap/standard/premium) -- requires users to understand both model pricing and internal task mapping; (3) per-module configuration -- exposes internal architecture to users.

## Decision

Use three **task-oriented roles** that describe WHAT the model does, not how much it costs:

- **Triage** -- high-volume, low-complexity. Hundreds of calls per scan.
- **Analysis** -- moderate-volume, moderate-complexity. Tens of calls per scan.
- **Reasoning** -- low-volume, high-complexity. A few calls per scan.

The `LLMGateway` interface maps roles to providers at startup. Internal code calls `gateway.getProvider('triage')` and gets the right model. The `parseModelString()` function splits `"provider/model-name"` into its components. Provider factories are registered in a `Map<string, LLMProvider>`.

The `LLMProvider` interface has two methods: `analyze()` for free-form text output and `analyzeStructured<T>()` for JSON output conforming to a schema hint.

## Consequences

**Easier:**
- Users understand roles without reading source code. The config is self-documenting.
- Mixing providers is natural: local Ollama for triage, cloud Gemini for reasoning.
- Adding a new provider is a single file implementing `LLMProvider`. No gateway changes.
- Cost tracking can aggregate by role, showing users where their LLM budget goes.

**More difficult:**
- Some tasks may not fit cleanly into three roles. Adding a fourth is a breaking config change.
- Users who want one model for everything must specify it three times.
- The gateway validates all roles at construction time (fail-fast), so provider misconfiguration errors surface at startup.
