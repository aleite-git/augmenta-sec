# Provider Implementation Guide

AugmentaSec is built around three provider abstractions: LLM, Git Platform, and Scanner. All interfaces are in `src/providers/` and designed to be agnostic.

---

## LLM Provider

**Interface**: `src/providers/llm/types.ts`
**Implementations**: Gemini (`gemini.ts`), Mistral (`mistral.ts`), OpenAI (`openai.ts`), Anthropic (`anthropic.ts`), Ollama (`ollama.ts`)

```typescript
interface LLMProvider {
  name: string;
  model: string;
  capabilities: LLMCapabilities;
  analyze(messages: LLMMessage[]): Promise<LLMResponse>;
  analyzeStructured<T>(messages: LLMMessage[], schemaHint: string): Promise<T>;
}
```

The **LLM Gateway** (`gateway.ts`) maps task roles (triage/analysis/reasoning) to providers. `parseModelString()` splits `"provider/model-name"`. Code calls `gateway.getProvider(role)` without knowing which model is assigned.

### Adding a New LLM Provider

1. Create `src/providers/llm/<name>.ts` implementing `LLMProvider`
2. Create a provider-specific error class (e.g., `MyProviderError`)
3. Map message formats: system/user/assistant vary by provider (Gemini uses `systemInstruction` separately; Anthropic uses a `system` parameter; OpenAI/Mistral/Ollama use role-based messages)
4. Handle structured output: use native JSON mode if available, otherwise inject schema hint into system prompt
5. Return accurate `tokensUsed` in responses (0 when unavailable)
6. Export from `src/providers/llm/index.ts`
7. Register in the gateway provider map
8. Write tests in `__tests__/<name>.test.ts`

Supporting modules: cost tracker (`cost-tracker.ts`), prompt templates (`prompts.ts`), response validation (`validation.ts`).

---

## Git Platform

**Interface**: `src/providers/git-platform/types.ts`
**Implementation**: GitHub (`github.ts` using @octokit/rest)

```typescript
interface GitPlatform {
  name: string;
  getPullRequests(state: 'open' | 'merged'): Promise<PullRequest[]>;
  getDiff(base: string, head: string): Promise<Diff>;
  getBranches(): Promise<Branch[]>;
  createIssue(issue: SecurityIssue): Promise<string>;
  createPullRequest(title, body, head, base): Promise<string>;
  commentOnPR(prNumber: number, review: SecurityReview): Promise<void>;
  onPullRequestOpened(handler): void;
  onPush(handler): void;
}
```

### Adding a New Git Platform

1. Create `src/providers/git-platform/<platform>.ts`
2. Map platform concepts: PR states (GitHub `closed`+`merged_at` vs GitLab `merged`), file statuses (`removed` vs `deleted`), review mechanisms
3. Handle rate limiting (GitHub checks `x-ratelimit-remaining`)
4. Handle error mapping (404, 403 -> descriptive messages)
5. Export and write tests

---

## Scanner

**Interface**: `src/providers/scanner/types.ts`
**Implementations**: Semgrep, Trivy, npm-audit, Gitleaks, CodeQL, pip-audit, cargo-audit, Bandit, Gosec

```typescript
interface SecurityScanner {
  name: string;
  category: ScannerCategory;  // 'sast' | 'dast' | 'sca' | 'container' | 'secrets'
  isAvailable(): Promise<boolean>;
  scan(target: ScanTarget): Promise<ScanResult>;
}
```

### Adding a New Scanner

1. Create `src/providers/scanner/<name>.ts`
2. Use shared utils from `utils.ts`: `isBinaryAvailable(name)` for availability, `runCommand(cmd, args, opts)` for execution
3. Map native severity to the shared 5-level scale (critical/high/medium/low/informational)
4. Handle non-zero exit codes: many scanners exit 1 when findings exist (normal, not error). `runCommand()` handles this.
5. Return `ScanResult` with `error` field on failure (never throw from `scan()`)
6. Register factory in `SCANNER_FACTORIES` in `src/scan/engine.ts`
7. Export from `src/providers/scanner/index.ts`
8. Write tests in `__tests__/<name>.test.ts`

**Key considerations**: graceful degradation (never throw from `isAvailable()`), error isolation (`ScanResult.error`), JSON output preferred (`--json`/`--format json`), configurable timeout (default 60s), max 50 MB output buffer.
