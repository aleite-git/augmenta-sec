# ADR-001: LLM Role Routing

**Status**: Accepted
**Date**: 2026-03-21

## Context

AugmentaSec needs to call LLMs for different types of security work: quick binary decisions ("is this finding relevant?"), moderate analysis ("review this endpoint for auth gaps"), and deep reasoning ("generate a threat model from these 50 findings"). These tasks have fundamentally different requirements for speed, cost, and quality.

The naive approach is to offer cost tiers (cheap/standard/premium) and let users assign models to tiers. However, this creates a disconnect: users must understand both the cost profile of each model AND the internal workings of AugmentaSec to know which tier is used for which task. When a new model launches, it is not obvious which "tier" it belongs to.

## Decision

Use three **task-oriented roles** instead of cost tiers:

- **Triage** -- high-volume, low-complexity calls. Hundreds per scan. "Is this finding relevant?" "Is this file security-related?" Should be fast and cheap.
- **Analysis** -- moderate-volume, moderate-complexity calls. Tens per scan. "Review this endpoint for auth gaps." "Draft a fix for this XSS." Balance speed and quality.
- **Reasoning** -- low-volume, high-complexity calls. A few per scan. "Generate a threat model." "Correlate these 12 findings into a narrative." Quality matters most.

Users configure by role in `.augmenta-sec/config.yaml`:

```yaml
llm:
  triage: gemini/gemini-2.5-flash-lite
  analysis: gemini/gemini-2.5-flash
  reasoning: gemini/gemini-2.5-pro
```

The LLM Gateway (`src/providers/llm/gateway.ts`) maps each role to its configured provider at startup. Internal code calls `gateway.getProvider('triage')` and gets the right model without knowing which specific model is assigned.

## Consequences

**Easier:**
- Users understand what each role does without reading source code. The config is self-documenting.
- Mixing providers is natural: use a cheap local model (Ollama) for triage and a cloud model for reasoning.
- Adding new models requires zero code changes -- just update the config file.
- The same configuration structure works for any provider combination.

**More difficult:**
- Some tasks may not fit cleanly into three categories. If we need a fourth role (e.g., "code-generation"), we add it to the interface.
- Users who want a single model for everything must specify it three times. This is a minor inconvenience for a clearer mental model.
