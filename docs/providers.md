# Provider Implementation Guide

AugmentaSec is built around three provider abstractions: LLM, Git Platform, and Scanner. This guide explains how to implement new providers for each.

All provider interfaces are defined in `src/providers/` and designed to be agnostic -- adding a new provider requires no changes to core logic.

---

## LLM Provider

**Interface**: `src/providers/llm/types.ts`
**Existing implementation**: Gemini (`src/providers/llm/gemini.ts`)

### Interface

```typescript
interface LLMProvider {
  name: string;
  model: string;
  capabilities: LLMCapabilities;

  /** Free-form analysis with context. */
  analyze(messages: LLMMessage[]): Promise<LLMResponse>;

  /** Structured output -- returns parsed JSON conforming to the schema hint. */
  analyzeStructured<T>(
    messages: LLMMessage[],
    schemaHint: string,
  ): Promise<T>;
}

interface LLMCapabilities {
  maxContextTokens: number;
  supportsImages: boolean;
  supportsStructuredOutput: boolean;
}

interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface LLMResponse {
  content: string;
  tokensUsed: {input: number; output: number};
  model: string;
  role: LLMRole;
}
```

### Implementation Steps

1. **Create the provider file** at `src/providers/llm/<provider-name>.ts`:

   ```typescript
   import type {
     LLMCapabilities,
     LLMMessage,
     LLMProvider,
     LLMResponse,
     LLMRole,
   } from './types.js';
   import {ProviderError} from '../../errors/index.js';

   export function createMyProvider(
     model: string,
     apiKey: string,
   ): LLMProvider {
     const capabilities: LLMCapabilities = {
       maxContextTokens: 128_000,
       supportsImages: false,
       supportsStructuredOutput: true,
     };

     return {
       name: 'my-provider',
       model,
       capabilities,

       async analyze(messages: LLMMessage[]): Promise<LLMResponse> {
         // 1. Convert LLMMessage[] to the provider's native format
         // 2. Call the provider API
         // 3. Map the response back to LLMResponse
         try {
           const nativeMessages = mapToNativeFormat(messages);
           const result = await callProviderApi(nativeMessages);
           return {
             content: result.text,
             tokensUsed: {
               input: result.inputTokens,
               output: result.outputTokens,
             },
             model,
             role: 'analysis' as LLMRole,
           };
         } catch (error) {
           throw new ProviderError(
             'my-provider',
             `API error: ${error instanceof Error ? error.message : String(error)}`,
             error instanceof Error ? error : undefined,
           );
         }
       },

       async analyzeStructured<T>(
         messages: LLMMessage[],
         schemaHint: string,
       ): Promise<T> {
         // 1. Inject schema hint into system prompt
         // 2. Request JSON output from the provider
         // 3. Parse and return typed result
         const augmented = injectSchemaHint(messages, schemaHint);
         const response = await this.analyze(augmented);
         return JSON.parse(response.content) as T;
       },
     };
   }
   ```

2. **Handle message format mapping**. Each LLM provider has its own message format:

   | AugmentaSec | Gemini | OpenAI | Anthropic |
   |-------------|--------|--------|-----------|
   | `system` | `systemInstruction` (separate) | `system` role | `system` parameter |
   | `user` | `user` role | `user` role | `user` role |
   | `assistant` | `model` role | `assistant` role | `assistant` role |

   The Gemini implementation in `src/providers/llm/gemini.ts` shows a concrete example of this mapping via `toGeminiMessages()`.

3. **Handle structured output**. If the provider natively supports JSON mode (like Gemini's `responseMimeType: 'application/json'`), use it. Otherwise, inject the schema hint into the system prompt and parse the text response.

4. **Export from the barrel** in `src/providers/llm/index.ts`:

   ```typescript
   export {createMyProvider} from './my-provider.js';
   ```

5. **Register in the gateway**. The gateway (`src/providers/llm/gateway.ts`) maps provider names to instances. The provider factory needs to be registered so that `createGateway()` can instantiate it when a user configures `my-provider/model-name` in their config.

6. **Write tests** in `src/providers/llm/__tests__/my-provider.test.ts`.

### Key Considerations

- **Error handling**: Wrap provider-specific errors in `ProviderError` with the provider name for consistent error reporting.
- **Token tracking**: Return accurate token counts when the provider API reports them; use `0` when unavailable.
- **Rate limiting**: Consider implementing retry logic with exponential backoff for rate-limited APIs.
- **Streaming**: The current interface uses request-response. Streaming support may be added in a future version.

---

## Git Platform

**Interface**: `src/providers/git-platform/types.ts`
**Existing implementation**: GitHub (`src/providers/git-platform/github.ts`)

### Interface

```typescript
interface GitPlatform {
  name: string;

  // Read
  getPullRequests(state: 'open' | 'merged'): Promise<PullRequest[]>;
  getDiff(base: string, head: string): Promise<Diff>;
  getBranches(): Promise<Branch[]>;

  // Write
  createIssue(issue: SecurityIssue): Promise<string>;
  createPullRequest(
    title: string,
    body: string,
    head: string,
    base: string,
  ): Promise<string>;
  commentOnPR(prNumber: number, review: SecurityReview): Promise<void>;

  // Events
  onPullRequestOpened(handler: (pr: PullRequest) => Promise<void>): void;
  onPush(handler: (branch: string) => Promise<void>): void;
}
```

### Implementation Steps

1. **Create the adapter** at `src/providers/git-platform/<platform>.ts`:

   ```typescript
   import type {
     Branch,
     Diff,
     DiffFile,
     GitPlatform,
     PullRequest,
     SecurityIssue,
     SecurityReview,
   } from './types.js';

   export interface MyPlatformConfig {
     token: string;
     owner: string;
     repo: string;
     apiBaseUrl?: string;
   }

   export function createMyPlatformAdapter(
     config: MyPlatformConfig,
   ): GitPlatform {
     return {
       name: 'my-platform',

       async getPullRequests(state) {
         // Fetch PRs from the platform API
         // Map platform-specific states to the union type
       },

       async getDiff(base, head) {
         // Fetch the diff between two refs
         // Map file statuses to 'added' | 'modified' | 'deleted' | 'renamed'
       },

       async getBranches() {
         // List branches, identifying the default branch
       },

       async createIssue(issue) {
         // Create a security issue, return the URL
       },

       async createPullRequest(title, body, head, base) {
         // Create a PR, return the URL
       },

       async commentOnPR(prNumber, review) {
         // Post inline comments and a summary review
         // Use review.approved to determine approve/request-changes
       },

       onPullRequestOpened(handler) {
         // Store handler for webhook integration
       },

       onPush(handler) {
         // Store handler for webhook integration
       },
     };
   }
   ```

2. **Map platform-specific concepts** to the shared types:

   | Concept | GitHub | GitLab | Bitbucket |
   |---------|--------|--------|-----------|
   | PR state "merged" | `closed` + `merged_at` set | `merged` state | `MERGED` state |
   | File status "deleted" | `removed` | `deleted` | `removed` |
   | Review approval | `APPROVE` event | Approval endpoint | `APPROVED` status |
   | Inline comments | PR review comments | MR discussions | PR comments |

3. **Handle rate limiting**. The GitHub adapter checks `x-ratelimit-remaining` headers and warns when quota is low. Implement equivalent logic for your platform.

4. **Handle error mapping**. Wrap platform-specific HTTP errors with descriptive messages. The GitHub adapter maps 404 and 403 status codes to helpful error messages.

5. **Export and write tests** following the same pattern as the LLM provider.

### Key Types

```typescript
interface PullRequest {
  id: string;
  number: number;
  title: string;
  state: 'open' | 'closed' | 'merged';
  author: string;
  baseBranch: string;
  headBranch: string;
  url: string;
  createdAt: string;
  updatedAt: string;
}

interface SecurityReview {
  summary: string;
  findings: ReviewFinding[];
  approved: boolean;
}

interface ReviewFinding {
  file: string;
  line: number;
  severity: 'critical' | 'high' | 'medium' | 'low';
  message: string;
  suggestedFix?: string;
}
```

---

## Scanner

**Interface**: `src/providers/scanner/types.ts`
**Existing implementations**: Semgrep, Trivy, npm audit (in `src/providers/scanner/`)

### Interface

```typescript
interface SecurityScanner {
  name: string;
  category: ScannerCategory;  // 'sast' | 'dast' | 'sca' | 'container' | 'secrets'

  /** Check whether the scanner binary/service is available. */
  isAvailable(): Promise<boolean>;

  /** Run the scan and return raw findings. */
  scan(target: ScanTarget): Promise<ScanResult>;
}

interface ScanTarget {
  rootDir: string;
  files?: string[];       // Optional: specific files to scan
  image?: string;         // Optional: container image to scan
}

interface ScanResult {
  scanner: string;
  category: ScannerCategory;
  findings: RawFinding[];
  duration: number;
  error?: string;         // Set if the scan failed
}

interface RawFinding {
  ruleId: string;
  message: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'informational';
  file?: string;
  line?: number;
  column?: number;
  metadata?: Record<string, unknown>;
}
```

### Implementation Steps

1. **Create the scanner** at `src/providers/scanner/<scanner-name>.ts`:

   ```typescript
   import type {
     RawFinding,
     ScanResult,
     ScanTarget,
     SecurityScanner,
   } from './types.js';
   import {isBinaryAvailable, runCommand} from './utils.js';

   export function createMyScanner(): SecurityScanner {
     return {
       name: 'my-scanner',
       category: 'sast',

       async isAvailable(): Promise<boolean> {
         return isBinaryAvailable('my-scanner');
       },

       async scan(target: ScanTarget): Promise<ScanResult> {
         const start = Date.now();

         try {
           const result = await runCommand(
             'my-scanner',
             ['scan', '--json', target.rootDir],
             {cwd: target.rootDir, timeout: 60_000},
           );

           const parsed = JSON.parse(result.stdout || '{}');
           const findings: RawFinding[] = mapFindings(parsed);

           return {
             scanner: 'my-scanner',
             category: 'sast',
             findings,
             duration: Date.now() - start,
           };
         } catch (error: unknown) {
           return {
             scanner: 'my-scanner',
             category: 'sast',
             findings: [],
             duration: Date.now() - start,
             error: error instanceof Error ? error.message : String(error),
           };
         }
       },
     };
   }
   ```

2. **Map severity levels**. Each scanner has its own severity vocabulary:

   | AugmentaSec | Semgrep | Trivy | npm audit |
   |-------------|---------|-------|-----------|
   | `critical` | -- | `CRITICAL` | `critical` |
   | `high` | `ERROR` | `HIGH` | `high` |
   | `medium` | `WARNING` | `MEDIUM` | `moderate` |
   | `low` | `INFO` | `LOW` | `low` |
   | `informational` | (default) | `UNKNOWN` | `info` |

3. **Handle non-zero exit codes**. Many scanners exit with code 1 when findings are present (this is normal, not an error). The shared `runCommand()` utility in `src/providers/scanner/utils.ts` handles this by returning stdout/stderr even on non-zero exits. Only `ENOENT` (binary not found) and `ETIMEDOUT` (timeout) are thrown as errors.

4. **Use the shared utilities**:
   - `isBinaryAvailable(name)` -- checks if a binary exists on PATH
   - `runCommand(cmd, args, options)` -- runs a command with timeout and captures output

### Key Considerations

- **Graceful degradation**: If `isAvailable()` returns `false`, the orchestrator skips the scanner. Never throw from `isAvailable()`.
- **Error isolation**: If the scan fails, return a `ScanResult` with an `error` string and empty findings. Do not throw.
- **Timeout**: Set a reasonable timeout (default 60s, up to 120s for slow scanners). The `runCommand` utility supports a configurable timeout.
- **Output parsing**: Request JSON output from the scanner when possible (`--json`, `--format json`). This is more reliable than parsing text output.
- **Large output**: The `runCommand` utility supports up to 50 MB of output (`maxBuffer: 50 * 1024 * 1024`).
